/* ==========================================================================
   TokoKu — Kasir (POS)
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtMoneyInput, fmtNum, parseMoney, sum, waLink,
  SERVICE_TYPES, OPERATORS, BANKS, EWALLETS, paymentLabel
} from '../utils.js';
import {
  state, createSale, saveCustomer, txDate
} from '../store.js';
import {
  openModal, confirmDialog, toast, printReceipt, waReceiptText,
  receiptPreview, emptyState
} from '../ui.js';
import { openTxDetail } from './common.js';

const ui = {
  mode: 'produk',
  search: '',
  category: 'Semua',
  cart: [],
  discount: 0,
  method: 'cash',
  cashReceived: 0,
  customerId: '',
  note: '',
  service: 'pulsa',
  provider: OPERATORS[0],
  target: '',
  nominal: 10000,
  admin: 2000,
  cartOpen: false,
  busy: false
};

let root = null;
let scannerCleanup = null;

/* ---------------- helpers ---------------- */
function activeProducts() {
  return state.products.filter((p) => p.active !== false);
}

function categories() {
  const list = [...new Set(activeProducts().map((p) => p.category || 'Lainnya'))].sort((a, b) => a.localeCompare(b, 'id'));
  return ['Semua', ...list];
}

function filteredProducts() {
  const q = ui.search.trim().toLowerCase();
  return activeProducts()
    .filter((p) => ui.category === 'Semua' || (p.category || 'Lainnya') === ui.category)
    .filter((p) => !q || `${p.name} ${p.category || ''} ${p.barcode || ''}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
}

function cartTotals() {
  const subtotal = sum(ui.cart, (i) => i.price * i.qty);
  const discount = Math.max(0, Math.min(Number(ui.discount) || 0, subtotal));
  const total = subtotal - discount;
  const cost = sum(ui.cart, (i) => i.cost * i.qty);
  const qty = sum(ui.cart, (i) => i.qty);
  return { subtotal, discount, total, cost, profit: total - cost, qty };
}

function serviceProviderList(service) {
  if (service === 'pulsa' || service === 'data') return OPERATORS;
  if (service === 'transfer') return BANKS;
  if (service === 'ewallet') return EWALLETS;
  if (service === 'token') return ['PLN'];
  return ['Lainnya'];
}

function defaultAdmin(service) {
  return ({ transfer: 5000, data: 3000, token: 3000, pulsa: 2000, ewallet: 2000, lain: 2000 })[service] || 2000;
}

function serviceName(service) {
  return (SERVICE_TYPES[service] && SERVICE_TYPES[service].label) || 'Layanan';
}

/* ---------------- cart operations ---------------- */
function addProduct(product) {
  if (!product) return;
  const existing = ui.cart.find((i) => i.kind === 'product' && i.productId === product.id);
  const inCart = existing ? existing.qty : 0;
  const stock = Number(product.stock) || 0;
  if (stock <= 0) return toast(`Stok ${product.name} habis.`, 'warn');
  if (inCart + 1 > stock) return toast(`Stok ${product.name} hanya ${stock} ${product.unit || 'pcs'}.`, 'warn');
  if (existing) {
    existing.qty += 1;
  } else {
    ui.cart.push({
      productId: product.id,
      name: product.name,
      qty: 1,
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      unit: product.unit || 'pcs',
      emoji: product.emoji || '📦',
      kind: 'product',
      service: '', provider: '', target: '', nominal: 0, admin: 0, note: ''
    });
  }
  syncProductCards();
  renderCart();
}

function changeQty(index, delta) {
  const item = ui.cart[index];
  if (!item) return;
  if (item.kind === 'digital') {
    if (delta < 0) ui.cart.splice(index, 1);
    renderCart();
    return;
  }
  if (delta > 0) {
    const product = state.products.find((p) => p.id === item.productId);
    const stock = product ? Number(product.stock) || 0 : Infinity;
    if (item.qty + delta > stock) {
      toast(`Stok ${item.name} hanya ${stock} ${item.unit || 'pcs'}.`, 'warn');
      return;
    }
  }
  item.qty += delta;
  if (item.qty <= 0) ui.cart.splice(index, 1);
  syncProductCards();
  renderCart();
}

function removeItem(index) {
  ui.cart.splice(index, 1);
  syncProductCards();
  renderCart();
}

function clearCart(silent = false) {
  ui.cart = [];
  ui.discount = 0;
  const disc = root && root.querySelector('#pos-discount');
  if (disc) disc.value = '';
  ui.customerId = '';
  ui.note = '';
  const note = root && root.querySelector('#pos-note');
  if (note) note.value = '';
  renderCart();
  syncProductCards();
  if (!silent) toast('Keranjang dikosongkan.', 'info');
}

/* ---------------- rendering ---------------- */
export default {
  render(el, ctx) {
    root = el;
    ui.busy = false;
    el.innerHTML = `
      <div class="pos-layout">
        <div class="pos-main">
          <div class="card pos-toolbar">
            <div class="pos-toolbar-row">
              <div class="pos-search input-icon">
                ${icon('search')}
                <input class="input" id="pos-search" type="search" placeholder="Cari produk atau scan barcode…" value="${esc(ui.search)}" autocomplete="off" aria-label="Cari produk">
              </div>
              <button class="btn btn-secondary btn-icon" id="pos-scan" title="Scan barcode" aria-label="Scan barcode">${icon('scan')}</button>
            </div>
            <div class="pos-toolbar-row">
              <div class="pos-mode" role="tablist" aria-label="Mode kasir">
                <button data-mode="produk" class="${ui.mode === 'produk' ? 'active' : ''}">${icon('box')}Produk</button>
                <button data-mode="layanan" class="${ui.mode === 'layanan' ? 'active' : ''}">${icon('smartphone')}Pulsa & Layanan</button>
              </div>
              <span class="dim" style="font-size:10px;margin-left:auto">${icon('shield', 'ic-sm')} Stok berkurang otomatis</span>
            </div>
            <div class="pos-cats" id="pos-cats">${categories().map((cat) => `
              <button class="chip ${ui.category === cat ? 'active' : ''}" data-cat="${esc(cat)}">${esc(cat)}</button>
            `).join('')}</div>
          </div>

          <section id="pos-products-section" ${ui.mode === 'produk' ? '' : 'hidden'}>
            <div class="pos-meta"><h3>Pilih produk</h3><span id="pos-count"></span></div>
            <div class="product-grid" id="pos-products"></div>
          </section>

          <section id="pos-digital-section" ${ui.mode === 'layanan' ? '' : 'hidden'}>
            <div class="card digital-panel">
              <div class="digital-hero">
                <span class="dh-ic">${icon('smartphone')}</span>
                <div>
                  <h3>Layanan digital</h3>
                  <p>Pulsa, paket data, token listrik, transfer bank, dan top up e-wallet.</p>
                </div>
              </div>
              <form class="digital-form" id="digital-form" novalidate>
                <div class="service-types" id="service-types"></div>
                <div class="digital-grid" id="digital-fields"></div>
                <div class="digital-preview">
                  <div class="dp-item"><span>Total dibayar</span><strong id="d-preview-total">${fmtRp(ui.nominal + ui.admin)}</strong></div>
                  <div class="dp-profit"><span>Laba admin</span><strong id="d-preview-profit">${fmtRp(ui.admin)}</strong></div>
                </div>
                <button class="btn btn-warn-soft btn-block" type="submit">${icon('plus')}Tambahkan ke keranjang</button>
              </form>
            </div>
            <div class="info-callout mt-12">${icon('info')}<span>Harga jual = nominal + biaya admin. Modal layanan dihitung sebesar nominal, sehingga laba tercatat sebesar biaya admin.</span></div>
          </section>
        </div>

        <aside class="pos-cart ${ui.cartOpen ? 'open' : 'collapsed'}" id="pos-cart">
          <button class="cart-collapsed" data-cart-toggle type="button" aria-label="Buka keranjang">
            <span class="cc-grip"></span>
            <span class="cc-left">
              <span class="cc-icon">${icon('cart')}</span>
              <span class="cc-text"><span id="cart-collapsed-label">Keranjang</span><strong id="cart-collapsed-total">Rp 0</strong></span>
            </span>
            <span class="cc-right"><span class="badge green" id="cart-collapsed-count">0 item</span>${icon('chevron-down')}</span>
          </button>
          <div class="cart-head">
            <h3>Keranjang</h3>
            <span class="cart-count" id="cart-count">0 item</span>
            <button class="cart-clear" id="pos-clear" type="button">Kosongkan</button>
          </div>
          <div class="cart-items" id="cart-items"></div>

          <div class="cart-settings">
            <div class="cart-row">
              <label for="pos-discount">Diskon</label>
              <div class="discount-wrap"><span class="ig-prefix">Rp</span><input class="input" id="pos-discount" data-money inputmode="numeric" placeholder="0" value="${ui.discount ? fmtMoneyInput(ui.discount) : ''}"></div>
            </div>
            <div class="cart-row">
              <label for="pos-note">Catatan</label>
              <input class="input" id="pos-note" placeholder="Opsional" maxlength="120" style="width:150px" value="${esc(ui.note)}">
            </div>
          </div>

          <div class="cart-totals">
            <div class="cart-total-row"><span>Subtotal</span><strong id="ct-subtotal">Rp 0</strong></div>
            <div class="cart-total-row"><span>Diskon</span><strong id="ct-discount">Rp 0</strong></div>
            <div class="cart-total-row"><span>Estimasi laba</span><strong class="profit" id="ct-profit">Rp 0</strong></div>
            <div class="cart-total-row grand"><span>Total</span><strong id="ct-total">Rp 0</strong></div>
          </div>

          <div class="cart-settings" style="border-top:0;padding-top:0">
            <div class="pay-methods" id="pay-methods">
              ${['cash', 'qris', 'transfer', 'kasbon'].map((m) => `<button class="pay-btn ${ui.method === m ? 'active' : ''}" data-method="${m}" type="button">${icon({ cash: 'banknote', qris: 'qr', transfer: 'credit-card', kasbon: 'users' }[m])}${paymentLabel(m)}</button>`).join('')}
            </div>
          </div>

          <div class="cash-wrap" id="cash-wrap">
            <div class="cart-row" style="padding:0">
              <label for="pos-cash">Uang diterima</label>
              <input class="input" id="pos-cash" data-money inputmode="numeric" placeholder="0" value="${ui.cashReceived ? fmtMoneyInput(ui.cashReceived) : ''}">
            </div>
            <div class="cash-quick" id="cash-quick"></div>
            <div class="cash-info"><span>Kembalian</span><strong id="cash-change">Rp 0</strong></div>
          </div>

          <div class="cart-customer" id="cart-customer"></div>

          <div class="cart-checkout">
            <button class="checkout-btn" id="pos-checkout" type="button">
              <span class="cb-label">${icon('check-circle')}Bayar sekarang</span>
              <span class="cb-total" id="cb-total">Rp 0</span>
            </button>
            <div class="cart-hint">${icon('shield')}Transaksi tersimpan otomatis & bisa offline</div>
          </div>
        </aside>
      </div>`;

    bind(el, ctx);
    renderProducts();
    renderDigital();
    renderCart();
    updateModeUI();
  },

  onChange(keys) {
    if (!root) return;
    if (keys.has('products')) {
      renderProducts();
      renderCart();
    }
    if (keys.has('customers')) renderCustomer();
  },

  destroy() {
    if (scannerCleanup) { scannerCleanup(); scannerCleanup = null; }
  }
};

function bind(el, ctx) {
  const search = el.querySelector('#pos-search');
  search.addEventListener('input', () => {
    ui.search = search.value;
    renderProducts();
  });

  el.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.mode = btn.getAttribute('data-mode');
      el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      updateModeUI();
    });
  });

  el.querySelector('#pos-scan').addEventListener('click', openScanner);

  el.querySelector('#pos-clear').addEventListener('click', async () => {
    if (!ui.cart.length) return;
    const ok = await confirmDialog({ title: 'Kosongkan keranjang?', message: 'Semua item akan dihapus dari keranjang.', confirmText: 'Ya, kosongkan', iconName: 'trash' });
    if (ok) clearCart();
  });

  el.querySelector('#pos-products').addEventListener('click', (e) => {
    const card = e.target.closest('[data-prod]');
    if (!card || card.disabled) return;
    const product = state.products.find((p) => p.id === card.getAttribute('data-prod'));
    addProduct(product);
  });

  el.querySelector('#pos-cats').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    ui.category = chip.getAttribute('data-cat');
    el.querySelectorAll('#pos-cats .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderProducts();
  });

  el.querySelector('#cart-items').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qty]');
    if (!btn) return;
    const index = Number(btn.getAttribute('data-i'));
    const action = btn.getAttribute('data-qty');
    if (action === 'plus') changeQty(index, 1);
    else if (action === 'minus') changeQty(index, -1);
    else if (action === 'del') removeItem(index);
  });

  el.querySelector('#pay-methods').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-method]');
    if (!btn) return;
    ui.method = btn.getAttribute('data-method');
    el.querySelectorAll('[data-method]').forEach((b) => b.classList.toggle('active', b === btn));
    renderCart();
  });

  el.querySelector('#pos-discount').addEventListener('input', (e) => {
    ui.discount = parseMoney(e.target.value);
    updateTotals();
  });

  el.querySelector('#pos-note').addEventListener('input', (e) => { ui.note = e.target.value; });

  el.querySelector('#pos-cash').addEventListener('input', (e) => {
    ui.cashReceived = parseMoney(e.target.value);
    updateCash();
  });

  el.querySelector('#cash-quick').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cash]');
    if (!btn) return;
    ui.cashReceived = Number(btn.getAttribute('data-cash')) || 0;
    const input = el.querySelector('#pos-cash');
    input.value = fmtMoneyInput(ui.cashReceived);
    updateCash();
  });

  el.querySelector('#cart-customer').addEventListener('click', (e) => {
    if (!e.target.closest('[data-new-customer]')) return;
    openNewCustomer((id) => {
      ui.customerId = id;
      renderCustomer();
    });
  });
  el.querySelector('#cart-customer').addEventListener('change', (e) => {
    if (e.target.id !== 'pos-customer') return;
    const value = e.target.value;
    if (value === '__new') {
      e.target.value = ui.customerId || '';
      openNewCustomer((id) => {
        ui.customerId = id;
        renderCustomer();
      });
      return;
    }
    ui.customerId = value;
  });

  el.querySelector('[data-cart-toggle]').addEventListener('click', () => {
    ui.cartOpen = !ui.cartOpen;
    el.querySelector('#pos-cart').classList.toggle('open', ui.cartOpen);
    el.querySelector('#pos-cart').classList.toggle('collapsed', !ui.cartOpen);
  });

  el.querySelector('#pos-checkout').addEventListener('click', () => checkout());

  el.querySelector('#digital-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addDigital();
  });
  el.querySelector('#service-types').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-service]');
    if (!btn) return;
    ui.service = btn.getAttribute('data-service');
    ui.provider = serviceProviderList(ui.service)[0];
    ui.nominal = SERVICE_TYPES[ui.service].nominals[0];
    ui.admin = defaultAdmin(ui.service);
    renderDigital();
  });
  el.querySelector('#digital-fields').addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'd-provider') ui.provider = e.target.value;
    if (id === 'd-target') ui.target = e.target.value;
    if (id === 'd-nominal') { ui.nominal = parseMoney(e.target.value); updateDigitalPreview(); }
    if (id === 'd-admin') { ui.admin = parseMoney(e.target.value); updateDigitalPreview(); }
  });
  el.querySelector('#digital-fields').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-nom]');
    if (!chip) return;
    ui.nominal = Number(chip.getAttribute('data-nom')) || 0;
    const input = el.querySelector('#d-nominal');
    if (input) input.value = fmtMoneyInput(ui.nominal);
    el.querySelectorAll('[data-nom]').forEach((c) => c.classList.toggle('active', c === chip));
    updateDigitalPreview();
  });

  // Prefill pencarian dari query (mis. dari halaman produk).
  const q = ctx && ctx.query ? ctx.query.get('q') : '';
  if (q) {
    search.value = q;
    ui.search = q;
    renderProducts();
  }
}

function updateModeUI() {
  if (!root) return;
  const prod = root.querySelector('#pos-products-section');
  const digital = root.querySelector('#pos-digital-section');
  const cats = root.querySelector('#pos-cats');
  if (prod) prod.hidden = ui.mode !== 'produk';
  if (digital) digital.hidden = ui.mode !== 'layanan';
  if (cats) cats.style.display = ui.mode === 'produk' ? '' : 'none';
}

function renderProducts() {
  if (!root) return;
  const grid = root.querySelector('#pos-products');
  const count = root.querySelector('#pos-count');
  if (!grid) return;
  const list = filteredProducts();
  if (count) count.textContent = `${list.length} produk${ui.category !== 'Semua' ? ' · ' + ui.category : ''}`;
  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1">${emptyState({
      iconName: 'search', title: 'Produk tidak ditemukan', text: 'Coba kata kunci lain atau tambahkan produk baru di menu Produk.', mini: true
    })}</div>`;
    return;
  }
  grid.innerHTML = list.map((p) => {
    const stock = Number(p.stock) || 0;
    const inCart = ui.cart.some((i) => i.kind === 'product' && i.productId === p.id);
    const out = stock <= 0;
    const low = !out && stock <= (Number(p.minStock) || 0);
    return `<button class="prod-card ${inCart ? 'in-cart' : ''} ${out ? 'oos' : ''}" data-prod="${esc(p.id)}" ${out ? 'disabled' : ''} title="${esc(p.name)}">
      <span class="prod-add">${icon(inCart ? 'check' : 'plus')}</span>
      <span class="prod-emoji">${esc(p.emoji || '📦')}</span>
      <span class="prod-name">${esc(p.name)}</span>
      <span class="prod-bottom">
        <span class="prod-price">${fmtRp(p.price)}</span>
        <span class="prod-stock ${out ? 'out' : low ? 'low' : ''}">${out ? 'Habis' : `${stock} ${esc(p.unit || '')}`}</span>
      </span>
    </button>`;
  }).join('');
}

function syncProductCards() {
  if (!root) return;
  const grid = root.querySelector('#pos-products');
  if (!grid) return;
  grid.querySelectorAll('[data-prod]').forEach((card) => {
    const id = card.getAttribute('data-prod');
    const inCart = ui.cart.some((i) => i.kind === 'product' && i.productId === id);
    card.classList.toggle('in-cart', inCart);
    const add = card.querySelector('.prod-add');
    if (add) add.innerHTML = icon(inCart ? 'check' : 'plus');
  });
}

function renderCart() {
  if (!root) return;
  const itemsEl = root.querySelector('#cart-items');
  const countEl = root.querySelector('#cart-count');
  const collapsedCount = root.querySelector('#cart-collapsed-count');
  const collapsedTotal = root.querySelector('#cart-collapsed-total');
  const collapsedLabel = root.querySelector('#cart-collapsed-label');
  const payMethods = root.querySelector('#pay-methods');
  const cashWrap = root.querySelector('#cash-wrap');
  const checkout = root.querySelector('#pos-checkout');
  if (!itemsEl) return;

  const totals = cartTotals();
  if (countEl) countEl.textContent = `${totals.qty} item`;
  if (collapsedCount) collapsedCount.textContent = `${totals.qty} item`;
  if (collapsedLabel) collapsedLabel.textContent = ui.cart.length ? `${ui.cart.length} jenis barang` : 'Keranjang kosong';
  if (collapsedTotal) collapsedTotal.textContent = fmtRp(totals.total);

  itemsEl.innerHTML = ui.cart.length ? ui.cart.map((item, index) => `
    <div class="cart-item">
      <span class="ci-emoji">${esc(item.emoji || '📦')}</span>
      <div class="ci-main">
        <div class="ci-name">${esc(item.name)}</div>
        <div class="ci-sub ${item.kind === 'digital' ? 'digital' : ''}">${item.kind === 'digital'
          ? `${esc(serviceName(item.service))}${item.target ? ' · ' + esc(item.target) : ''}`
          : `${fmtRp(item.price)} × ${item.qty}`}</div>
        <div class="ci-price">${fmtRp(item.price * item.qty)}</div>
      </div>
      <div class="ci-actions">
        ${item.kind === 'digital'
          ? `<span class="badge amber">Digital</span>`
          : `<span class="qty-ctrl">
              <button data-qty="minus" data-i="${index}" type="button" aria-label="Kurangi">${icon('minus')}</button>
              <span>${item.qty}</span>
              <button data-qty="plus" data-i="${index}" type="button" aria-label="Tambah">${icon('plus')}</button>
            </span>`}
        <button class="ci-del" data-qty="del" data-i="${index}" type="button">Hapus</button>
      </div>
    </div>`).join('') : `<div class="cart-empty">
      <div class="empty-ic">${icon('cart')}</div>
      <strong>Keranjang masih kosong</strong>
      <span>Pilih produk di sebelah kiri untuk mulai.</span>
    </div>`;

  if (payMethods) {
    payMethods.querySelectorAll('[data-method]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-method') === ui.method));
  }
  if (cashWrap) cashWrap.hidden = ui.method !== 'cash';
  if (checkout) checkout.disabled = ui.cart.length === 0;
  renderCustomer();
  updateCash();
  updateTotals();
}

function updateTotals() {
  if (!root) return;
  const t = cartTotals();
  const set = (id, value) => {
    const el = root.querySelector(id);
    if (el) el.textContent = value;
  };
  set('#ct-subtotal', fmtRp(t.subtotal));
  set('#ct-discount', t.discount ? '-' + fmtRp(t.discount) : 'Rp 0');
  set('#ct-profit', fmtRp(t.profit));
  set('#ct-total', fmtRp(t.total));
  set('#cb-total', fmtRp(t.total));
  set('#cart-collapsed-total', fmtRp(t.total));
  updateCashQuick(t.total);
}

function updateCashQuick(total) {
  if (!root) return;
  const quick = root.querySelector('#cash-quick');
  if (!quick) return;
  const options = [...new Set([
    total,
    Math.ceil(total / 5000) * 5000,
    Math.ceil(total / 10000) * 10000,
    Math.ceil(total / 50000) * 50000,
    100000
  ].filter((n) => n >= total && n > 0))].sort((a, b) => a - b).slice(0, 6);
  quick.innerHTML = options.map((n) => `<button type="button" data-cash="${n}">${n === total ? 'Uang pas' : fmtNum(n)}</button>`).join('');
}

function updateCash() {
  if (!root) return;
  const info = root.querySelector('#cash-change');
  if (!info) return;
  const t = cartTotals();
  const paid = Number(ui.cashReceived) || 0;
  if (paid >= t.total && t.total > 0) {
    info.textContent = fmtRp(paid - t.total);
    info.classList.remove('short');
  } else {
    const short = Math.max(0, t.total - paid);
    info.textContent = paid ? `Kurang ${fmtRp(short)}` : 'Belum diisi';
    info.classList.toggle('short', paid > 0);
  }
}

function renderCustomer() {
  if (!root) return;
  const wrap = root.querySelector('#cart-customer');
  if (!wrap) return;
  const customers = [...state.customers].sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  wrap.hidden = ui.method !== 'kasbon';
  if (ui.method !== 'kasbon') return;
  const options = customers.map((c) => `<option value="${esc(c.id)}" ${c.id === ui.customerId ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('');
  wrap.innerHTML = `
    <div class="field" style="gap:4px">
      <label class="label" for="pos-customer" style="font-size:10px">Pelanggan kasbon <span class="req">*</span></label>
      <div class="customer-select-row">
        <select class="select" id="pos-customer">
          <option value="">Pilih pelanggan…</option>
          ${options}
          <option value="__new">+ Pelanggan baru</option>
        </select>
        <button class="btn btn-secondary btn-icon" type="button" data-new-customer aria-label="Tambah pelanggan">${icon('plus')}</button>
      </div>
      <span class="hint">Jatuh tempo otomatis 14 hari. Sisa tagihan masuk menu Kasbon.</span>
    </div>`;
}

function renderDigital() {
  if (!root) return;
  const types = root.querySelector('#service-types');
  const fields = root.querySelector('#digital-fields');
  if (!types || !fields) return;
  types.innerHTML = Object.entries(SERVICE_TYPES).map(([key, svc]) => `
    <button class="service-type ${ui.service === key ? 'active' : ''}" type="button" data-service="${key}">
      ${icon(svc.icon)}<span>${esc(svc.label)}</span>
    </button>`).join('');

  const svc = SERVICE_TYPES[ui.service];
  const providers = serviceProviderList(ui.service);
  fields.innerHTML = `
    <div class="field">
      <label class="label" for="d-provider">${esc(svc.providerLabel)}</label>
      <input class="input" id="d-provider" list="d-provider-list" value="${esc(ui.provider)}" placeholder="Ketik atau pilih">
      <datalist id="d-provider-list">${providers.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
    </div>
    <div class="field">
      <label class="label" for="d-target">${esc(svc.targetLabel)} <span class="req">*</span></label>
      <input class="input" id="d-target" value="${esc(ui.target)}" placeholder="${ui.service === 'transfer' ? '1234567890' : '08xxxxxxxxxx'}" inputmode="${ui.service === 'transfer' ? 'numeric' : 'tel'}">
    </div>
    <div class="field span-2">
      <label class="label">Nominal</label>
      <div class="input-group"><span class="ig-prefix">Rp</span><input class="input" id="d-nominal" data-money inputmode="numeric" value="${ui.nominal ? fmtMoneyInput(ui.nominal) : ''}"></div>
      <div class="nominal-chips mt-8">${(svc.nominals || []).map((n) => `<button class="chip ${ui.nominal === n ? 'active' : ''}" type="button" data-nom="${n}">${fmtNum(n)}</button>`).join('')}</div>
    </div>
    <div class="field">
      <label class="label" for="d-admin">Biaya admin / laba</label>
      <div class="input-group"><span class="ig-prefix">Rp</span><input class="input" id="d-admin" data-money inputmode="numeric" value="${ui.admin ? fmtMoneyInput(ui.admin) : ''}"></div>
    </div>
    <div class="field">
      <label class="label">Total dibayar</label>
      <div class="input" style="display:flex;align-items:center;font-weight:800;background:var(--bg-soft)">${fmtRp(ui.nominal + ui.admin)}</div>
    </div>`;
  updateDigitalPreview();
}

function updateDigitalPreview() {
  if (!root) return;
  const total = root.querySelector('#d-preview-total');
  const profit = root.querySelector('#d-preview-profit');
  if (total) total.textContent = fmtRp((Number(ui.nominal) || 0) + (Number(ui.admin) || 0));
  if (profit) profit.textContent = fmtRp(Number(ui.admin) || 0);
}

function addDigital() {
  if (!root) return;
  const provider = ui.provider.trim();
  const target = ui.target.trim();
  const nominal = Number(ui.nominal) || 0;
  const admin = Number(ui.admin) || 0;
  if (!provider) return toast('Isi nama operator / bank / penyedia terlebih dahulu.', 'warn');
  if (!target) return toast('Isi nomor tujuan terlebih dahulu.', 'warn');
  if (nominal <= 0) return toast('Nominal harus lebih dari 0.', 'warn');
  if (admin < 0) return toast('Biaya admin tidak boleh negatif.', 'warn');
  const svc = SERVICE_TYPES[ui.service];
  const item = {
    productId: '',
    name: `${svc.label} ${provider}`.trim(),
    qty: 1,
    price: nominal + admin,
    cost: nominal,
    unit: 'transaksi',
    emoji: svc.emoji,
    kind: 'digital',
    service: ui.service,
    provider,
    target,
    nominal,
    admin,
    note: ''
  };
  ui.cart.push(item);
  ui.target = '';
  const targetInput = root.querySelector('#d-target');
  if (targetInput) targetInput.value = '';
  renderCart();
  toast(`${item.name} ditambahkan ke keranjang.`, 'success', 'Layanan ditambahkan');
}

/* ---------------- new customer ---------------- */
function openNewCustomer(onSaved) {
  openModal({
    title: 'Pelanggan baru',
    subtitle: 'Simpan kontak untuk kasbon dan pengingat WhatsApp.',
    size: 'narrow',
    body: `<div class="form-grid">
      <div class="field span-2"><label class="label">Nama pelanggan <span class="req">*</span></label><input class="input" id="nc-name" placeholder="Contoh: Bu Siti" maxlength="100"></div>
      <div class="field span-2"><label class="label">No. HP</label><input class="input" id="nc-phone" placeholder="08xxxxxxxxxx" inputmode="tel" maxlength="30"></div>
    </div>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('check')}Simpan pelanggan</button>`,
    onMount: ({ body, foot, close }) => {
      foot.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const name = body.querySelector('#nc-name').value.trim();
        const phone = body.querySelector('#nc-phone').value.trim();
        if (!name) return toast('Nama pelanggan wajib diisi.', 'warn');
        try {
          const id = await saveCustomer({ name, phone });
          close();
          toast(`${name} ditambahkan.`, 'success');
          if (typeof onSaved === 'function') onSaved(id);
        } catch (err) {
          toast(err.message || 'Gagal menyimpan pelanggan.', 'error');
        }
      };
      foot.querySelector('[data-save]').addEventListener('click', save);
      body.querySelector('#nc-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    }
  });
}

/* ---------------- checkout ---------------- */
async function checkout() {
  if (!root || ui.busy) return;
  if (!ui.cart.length) return toast('Keranjang masih kosong.', 'warn');
  const totals = cartTotals();
  const btn = root.querySelector('#pos-checkout');
  let customerId = ui.customerId;
  if (ui.method === 'kasbon' && !customerId) {
    toast('Pilih pelanggan untuk transaksi kasbon.', 'warn');
    root.querySelector('#pos-customer')?.focus();
    return;
  }
  if (ui.method === 'cash' && Number(ui.cashReceived) > 0 && Number(ui.cashReceived) < totals.total) {
    toast('Uang diterima kurang dari total transaksi.', 'warn');
    root.querySelector('#pos-cash')?.focus();
    return;
  }
  ui.busy = true;
  if (btn) { btn.disabled = true; btn.querySelector('.cb-label').innerHTML = `<span class="spinner"></span>Menyimpan…`; }
  try {
    const tx = await createSale({
      items: ui.cart,
      discount: ui.discount,
      method: ui.method,
      cashReceived: ui.method === 'cash' ? (Number(ui.cashReceived) || totals.total) : totals.total,
      customerId,
      note: ui.note
    });
    clearCart(true);
    ui.cashReceived = 0;
    const cashInput = root.querySelector('#pos-cash');
    if (cashInput) cashInput.value = '';
    ui.busy = false;
    if (btn) { btn.disabled = false; btn.querySelector('.cb-label').innerHTML = `${icon('check-circle')}Bayar sekarang`; }
    showSuccess(tx, customerId);
  } catch (err) {
    ui.busy = false;
    if (btn) { btn.disabled = false; btn.querySelector('.cb-label').innerHTML = `${icon('check-circle')}Bayar sekarang`; }
    toast(err.message || 'Gagal menyimpan transaksi.', 'error');
  }
}

function showSuccess(tx, customerId) {
  const store = state.store || {};
  const customer = state.customers.find((c) => c.id === customerId) || {};
  const phone = customer.phone || '';
  openModal({
    title: '',
    size: 'narrow',
    body: `<div class="sale-success">
      <div class="success-ring">${icon('check')}</div>
      <h3>Transaksi berhasil</h3>
      <p>${esc(tx.invoice)} · ${fmtNum(tx.itemCount)} item</p>
      <div class="sale-amount">
        <span>Total dibayar</span>
        <strong>${fmtRp(tx.total)}</strong>
        <span class="sale-profit">${icon('chart')}Laba kotor ${fmtRp(tx.profit)}</span>
      </div>
      <div class="sale-detail">
        <div class="sd-row"><span>Metode</span><strong>${esc(paymentLabel(tx.paymentMethod))}</strong></div>
        <div class="sd-row"><span>Pelanggan</span><strong>${esc(tx.customerName || 'Pelanggan umum')}</strong></div>
        ${tx.paymentMethod === 'cash' ? `<div class="sd-row"><span>Kembalian</span><strong>${fmtRp(tx.change || 0)}</strong></div>` : ''}
        ${tx.paymentMethod === 'kasbon' ? `<div class="sd-row"><span>Sisa kasbon</span><strong>${fmtRp(tx.total)}</strong></div>` : ''}
        <div class="sd-row"><span>Waktu</span><strong>${esc(tx.invoice ? new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '')}</strong></div>
      </div>
      <div class="mt-16" style="width:100%;text-align:left">
        <div class="hint mb-8">${icon('receipt', 'ic-sm')} Pratinjau nota</div>
        ${receiptPreview(tx, store)}
      </div>
      </div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-close>${icon('plus')}Transaksi baru</button>
      ${phone ? `<button class="btn btn-secondary btn-sm" data-wa>${icon('message')}Kirim WA</button>` : ''}
      <button class="btn btn-secondary btn-sm" data-print>${icon('printer')}Cetak</button>
      <button class="btn btn-primary btn-sm" data-detail>${icon('receipt')}Lihat detail</button>`,
    onMount: ({ foot, close }) => {
      foot.querySelector('[data-close]').addEventListener('click', close);
      foot.querySelector('[data-print]').addEventListener('click', () => printReceipt(tx, store));
      foot.querySelector('[data-wa]')?.addEventListener('click', () => {
        window.open(waLink(phone, waReceiptText(tx, store)), '_blank', 'noopener');
      });
      foot.querySelector('[data-detail]').addEventListener('click', () => {
        close();
        openTxDetail(tx);
      });
    },
    onClose: () => {
      const search = root && root.querySelector('#pos-search');
      if (search) search.focus();
    }
  });
}

/* ---------------- barcode scanner ---------------- */
function openScanner() {
  if (scannerCleanup) { scannerCleanup(); scannerCleanup = null; }
  let stream = null;
  let raf = 0;
  let handled = false;
  let detector = null;
  let video = null;
  const modal = openModal({
    title: 'Scan barcode',
    subtitle: 'Arahkan kamera ke barcode produk.',
    size: 'narrow',
    body: `<div class="scan-wrap">
      <video id="scan-video" playsinline muted></video>
      <div class="scan-frame"></div>
    </div>
    <div class="scan-hint" id="scan-hint">Menyiapkan kamera…</div>
    <div class="scan-manual">
      <input class="input" id="scan-manual" placeholder="Ketik / tempel barcode produk" autocomplete="off">
      <button class="btn btn-primary" id="scan-find" type="button">${icon('search')}Cari</button>
    </div>`,
    footer: `<button class="btn btn-secondary" data-close>${icon('x')}Tutup</button>`,
    onMount: ({ body, foot, close }) => {
      video = body.querySelector('#scan-video');
      const hint = body.querySelector('#scan-hint');
      const manual = body.querySelector('#scan-manual');

      const stop = () => {
        handled = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (stream) { stream.getTracks().forEach((track) => track.stop()); stream = null; }
        if (video) video.srcObject = null;
      };
      scannerCleanup = stop;

      const found = (value) => {
        if (handled) return;
        const raw = String(value || '').trim();
        if (!raw) return;
        const product = activeProducts().find((p) => String(p.barcode || '').trim() === raw)
          || activeProducts().find((p) => String(p.name).toLowerCase() === raw.toLowerCase());
        if (!product) {
          toast(`Produk dengan barcode ${raw} tidak ditemukan.`, 'warn');
          return;
        }
        handled = true;
        stop();
        addProduct(product);
        close();
        toast(`${product.name} masuk keranjang.`, 'success', 'Produk ditambahkan');
      };

      const manualSearch = () => {
        const value = manual.value.trim();
        if (!value) return toast('Masukkan barcode terlebih dahulu.', 'warn');
        found(value);
      };
      body.querySelector('#scan-find').addEventListener('click', manualSearch);
      manual.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); manualSearch(); } });
      foot.querySelector('[data-close]').addEventListener('click', () => { stop(); close(); });

      (async () => {
        try {
          if (!('BarcodeDetector' in window)) {
            hint.textContent = 'Browser ini belum mendukung scan kamera. Gunakan input barcode manual di bawah.';
            return;
          }
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            hint.textContent = 'Kamera tidak tersedia. Gunakan input barcode manual.';
            return;
          }
          detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          video.srcObject = stream;
          await video.play().catch(() => {});
          hint.textContent = 'Kamera aktif — dekatkan barcode ke dalam kotak.';
          const loop = async () => {
            if (handled || !video) return;
            if (video.readyState >= 2) {
              try {
                const codes = await detector.detect(video);
                if (codes && codes.length) {
                  found(codes[0].rawValue);
                  return;
                }
              } catch (e) {}
            }
            raf = requestAnimationFrame(loop);
          };
          raf = requestAnimationFrame(loop);
        } catch (err) {
          console.warn('Scanner:', err);
          hint.textContent = 'Kamera tidak bisa dibuka. Berikan izin kamera atau gunakan input barcode manual.';
        }
      })();
    },
    onClose: () => {
      if (scannerCleanup) { scannerCleanup(); scannerCleanup = null; }
    }
  });
  return modal;
}
