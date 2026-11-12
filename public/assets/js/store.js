/* ==========================================================================
   TokoKu — Data store (Cloud Firestore + local cache)
   ========================================================================== */

import { fb, auth, db, isConfigured } from './firebase.js';
import {
  startOfDay, endOfDay, startOfMonth, addDays, addMonths, dateKey, toDate,
  sum, uid, parseLocalDate, DAY_MS, sortBy
} from './utils.js';

const COL = ['products', 'customers', 'debts', 'expenses', 'purchases', 'transactions'];

export const state = {
  user: null,
  store: null,
  storeLoaded: false,
  products: [],
  customers: [],
  debts: [],
  expenses: [],
  purchases: [],
  recent: [],
  ready: { products: false, customers: false, debts: false, expenses: false, purchases: false, transactions: false },
  initialized: false,
  pending: false,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  error: null
};

const listeners = new Set();
const unsubs = new Map();
const pendingKeys = new Set();
const pendingEmitKeys = new Set();
let emitTimer = null;
let startedUid = null;

/* ---------------- subscriptions ---------------- */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(keys = []) {
  keys.forEach((key) => pendingEmitKeys.add(key));
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    emitTimer = null;
    const set = new Set(pendingEmitKeys);
    pendingEmitKeys.clear();
    listeners.forEach((fn) => {
      try { fn(set); } catch (e) { console.error('[TokoKu] listener error', e); }
    });
  }, 40);
}

function notePending(key, snapshot) {
  const pending = snapshot.metadata && snapshot.metadata.hasPendingWrites;
  if (pending) pendingKeys.add(key); else pendingKeys.delete(key);
  const val = pendingKeys.size > 0;
  if (state.pending !== val) {
    state.pending = val;
    emit(['sync']);
  }
}

function handleError(key, error) {
  console.warn(`[TokoKu] ${key} listener:`, error);
  state.error = error.message || String(error);
  emit(['error']);
}

export function start(uidValue) {
  if (!isConfigured || !db || !uidValue) return;
  if (startedUid === uidValue) return;
  stop();
  startedUid = uidValue;
  state.user = auth.currentUser;
  state.error = null;

  const base = ['users', uidValue];

  // Pengaturan toko
  unsubs.set('store', fb.onSnapshot(fb.doc(db, ...base, 'settings', 'store'), (snap) => {
    state.store = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    state.storeLoaded = true;
    emit(['store', 'ready']);
  }, (e) => { state.storeLoaded = true; handleError('store', e); }));

  // Produk
  unsubs.set('products', fb.onSnapshot(
    fb.query(fb.collection(db, ...base, 'products'), fb.orderBy('name')),
    (snap) => {
      state.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.ready.products = true;
      notePending('products', snap);
      emit(['products', 'ready']);
    }, (e) => handleError('products', e)
  ));

  // Pelanggan
  unsubs.set('customers', fb.onSnapshot(
    fb.query(fb.collection(db, ...base, 'customers'), fb.orderBy('name')),
    (snap) => {
      state.customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.ready.customers = true;
      notePending('customers', snap);
      emit(['customers', 'ready']);
    }, (e) => handleError('customers', e)
  ));

  // Kasbon / piutang
  unsubs.set('debts', fb.onSnapshot(
    fb.query(fb.collection(db, ...base, 'debts'), fb.orderBy('createdAt', 'desc'), fb.limit(500)),
    (snap) => {
      state.debts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.ready.debts = true;
      notePending('debts', snap);
      emit(['debts', 'ready']);
    }, (e) => handleError('debts', e)
  ));

  // Pengeluaran
  unsubs.set('expenses', fb.onSnapshot(
    fb.query(fb.collection(db, ...base, 'expenses'), fb.orderBy('date', 'desc'), fb.limit(500)),
    (snap) => {
      state.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.ready.expenses = true;
      notePending('expenses', snap);
      emit(['expenses', 'ready']);
    }, (e) => handleError('expenses', e)
  ));

  // Pembelian / restok
  unsubs.set('purchases', fb.onSnapshot(
    fb.query(fb.collection(db, ...base, 'purchases'), fb.orderBy('date', 'desc'), fb.limit(500)),
    (snap) => {
      state.purchases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.ready.purchases = true;
      notePending('purchases', snap);
      emit(['purchases', 'ready']);
    }, (e) => handleError('purchases', e)
  ));

  // Transaksi 60 hari terakhir (untuk beranda & kasir)
  const since = fb.Timestamp.fromDate(addDays(startOfDay(new Date()), -60));
  unsubs.set('transactions', fb.onSnapshot(
    fb.query(
      fb.collection(db, ...base, 'transactions'),
      fb.where('date', '>=', since),
      fb.orderBy('date', 'desc'),
      fb.limit(1500)
    ),
    (snap) => {
      state.recent = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.ready.transactions = true;
      state.initialized = true;
      notePending('transactions', snap);
      emit(['transactions', 'ready']);
    }, (e) => {
      state.ready.transactions = true;
      state.initialized = true;
      handleError('transactions', e);
    }
  ));

  emit(['store', 'products', 'customers', 'debts', 'expenses', 'purchases', 'transactions']);
}

export function stop() {
  unsubs.forEach((unsub) => { try { unsub(); } catch (e) {} });
  unsubs.clear();
  pendingKeys.clear();
  pendingEmitKeys.clear();
  if (emitTimer) { clearTimeout(emitTimer); emitTimer = null; }
  startedUid = null;
  state.store = null;
  state.storeLoaded = false;
  state.products = [];
  state.customers = [];
  state.debts = [];
  state.expenses = [];
  state.purchases = [];
  state.recent = [];
  state.ready = { products: false, customers: false, debts: false, expenses: false, purchases: false, transactions: false };
  state.initialized = false;
  state.pending = false;
  state.user = null;
}

export function setOnline(online) {
  state.online = online;
  emit(['sync']);
}

/* ---------------- helpers ---------------- */
export function storeName() {
  return (state.store && state.store.name) || 'TokoKu';
}

export function moneyStore() {
  return state.store || {};
}

export function userPath(...parts) {
  return ['users', state.user.uid, ...parts];
}

function requireUser() {
  if (!state.user) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
  if (!db) throw new Error('Firebase belum dikonfigurasi.');
}

function cleanInt(v) {
  const n = Math.round(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanStr(v, max = 200) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function makeInvoice(date = new Date()) {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}${d}-${rand}`;
}

export function txDate(tx) {
  return toDate(tx.date) || toDate(tx.createdAt) || new Date(0);
}

export function isVoid(tx) {
  return tx && tx.voided === true;
}

/* ---------------- settings ---------------- */
export async function saveStore(data) {
  requireUser();
  const ref = fb.doc(db, ...userPath('settings'), 'store');
  const payload = {
    name: cleanStr(data.name, 80) || 'Toko Saya',
    tagline: cleanStr(data.tagline, 120),
    owner: cleanStr(data.owner, 80),
    phone: cleanStr(data.phone, 30),
    address: cleanStr(data.address, 300),
    receiptFooter: cleanStr(data.receiptFooter, 220),
    receiptWidth: data.receiptWidth === '80' ? '80' : '58',
    monthlyTarget: cleanInt(data.monthlyTarget),
    updatedAt: fb.serverTimestamp()
  };
  if (!state.store) payload.createdAt = fb.serverTimestamp();
  await fb.setDoc(ref, payload, { merge: true });
  return payload;
}

/* ---------------- products ---------------- */
export async function saveProduct(data, id = null) {
  requireUser();
  const payload = {
    name: cleanStr(data.name, 120),
    category: cleanStr(data.category, 50) || 'Lainnya',
    barcode: cleanStr(data.barcode, 60),
    unit: cleanStr(data.unit, 20) || 'pcs',
    cost: Math.max(0, cleanInt(data.cost)),
    price: Math.max(0, cleanInt(data.price)),
    stock: cleanInt(data.stock),
    minStock: Math.max(0, cleanInt(data.minStock)),
    emoji: cleanStr(data.emoji, 8) || '📦',
    note: cleanStr(data.note, 200),
    active: data.active !== false,
    updatedAt: fb.serverTimestamp()
  };
  if (!payload.name) throw new Error('Nama produk wajib diisi.');
  if (payload.price <= 0) throw new Error('Harga jual harus lebih dari 0.');
  const col = fb.collection(db, ...userPath('products'));
  if (id) {
    await fb.updateDoc(fb.doc(col, id), payload);
    return id;
  }
  payload.createdAt = fb.serverTimestamp();
  const ref = await fb.addDoc(col, payload);
  return ref.id;
}

export async function setProductActive(id, active) {
  requireUser();
  await fb.updateDoc(fb.doc(db, ...userPath('products'), id), {
    active: Boolean(active),
    archivedAt: active ? null : fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp()
  });
}

export async function deleteProduct(id) {
  requireUser();
  await fb.updateDoc(fb.doc(db, ...userPath('products'), id), {
    active: false,
    archivedAt: fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp()
  });
}

export async function restockProduct({ productId, qty, costPerUnit, supplier, note, date }) {
  requireUser();
  const product = state.products.find((p) => p.id === productId);
  if (!product) throw new Error('Produk tidak ditemukan.');
  const amount = Math.max(1, cleanInt(qty));
  const unitCost = Math.max(0, cleanInt(costPerUnit) || product.cost || 0);
  const oldStock = Math.max(0, Number(product.stock) || 0);
  const oldCost = Math.max(0, Number(product.cost) || 0);
  const newStock = oldStock + amount;
  const newCost = newStock > 0 ? Math.round(((oldStock * oldCost) + (amount * unitCost)) / newStock) : unitCost;
  const when = parseLocalDate(date) || new Date();
  const batch = fb.writeBatch(db);
  batch.update(fb.doc(db, ...userPath('products'), productId), {
    stock: newStock,
    cost: newCost,
    updatedAt: fb.serverTimestamp()
  });
  const purchaseRef = fb.doc(fb.collection(db, ...userPath('purchases')));
  batch.set(purchaseRef, {
    date: fb.Timestamp.fromDate(when),
    createdAt: fb.serverTimestamp(),
    productId,
    productName: product.name,
    qty: amount,
    costPerUnit: unitCost,
    total: amount * unitCost,
    supplier: cleanStr(supplier, 100),
    note: cleanStr(note, 200),
    type: 'restock'
  });
  await batch.commit();
  return { newStock, newCost, total: amount * unitCost };
}

export async function adjustStock({ productId, stock, note }) {
  requireUser();
  const product = state.products.find((p) => p.id === productId);
  if (!product) throw new Error('Produk tidak ditemukan.');
  await fb.updateDoc(fb.doc(db, ...userPath('products'), productId), {
    stock: cleanInt(stock),
    note: cleanStr(note, 200),
    updatedAt: fb.serverTimestamp()
  });
}

/* ---------------- expenses ---------------- */
export async function saveExpense(data, id = null) {
  requireUser();
  const payload = {
    date: fb.Timestamp.fromDate(parseLocalDate(data.date) || new Date()),
    category: cleanStr(data.category, 50) || 'Lainnya',
    amount: Math.max(0, cleanInt(data.amount)),
    note: cleanStr(data.note, 220),
    updatedAt: fb.serverTimestamp()
  };
  if (!payload.amount) throw new Error('Nominal pengeluaran wajib diisi.');
  const col = fb.collection(db, ...userPath('expenses'));
  if (id) {
    await fb.updateDoc(fb.doc(col, id), payload);
    return id;
  }
  payload.createdAt = fb.serverTimestamp();
  const ref = await fb.addDoc(col, payload);
  return ref.id;
}

export async function deleteExpense(id) {
  requireUser();
  await fb.deleteDoc(fb.doc(db, ...userPath('expenses'), id));
}

/* ---------------- customers ---------------- */
export async function saveCustomer(data, id = null) {
  requireUser();
  const payload = {
    name: cleanStr(data.name, 100),
    phone: cleanStr(data.phone, 30),
    address: cleanStr(data.address, 220),
    note: cleanStr(data.note, 220),
    updatedAt: fb.serverTimestamp()
  };
  if (!payload.name) throw new Error('Nama pelanggan wajib diisi.');
  const col = fb.collection(db, ...userPath('customers'));
  if (id) {
    await fb.updateDoc(fb.doc(col, id), payload);
    return id;
  }
  payload.createdAt = fb.serverTimestamp();
  const ref = await fb.addDoc(col, payload);
  return ref.id;
}

export function customerDebt(customerId) {
  return state.debts
    .filter((d) => d.customerId === customerId && d.status === 'open' && !d.voided)
    .reduce((acc, d) => acc + debtRemaining(d), 0);
}

export async function deleteCustomer(id) {
  requireUser();
  if (customerDebt(id) > 0) throw new Error('Pelanggan masih memiliki kasbon. Lunasi atau hapus kasbonnya terlebih dahulu.');
  await fb.deleteDoc(fb.doc(db, ...userPath('customers'), id));
}

/* ---------------- debts ---------------- */
export function debtRemaining(debt) {
  return Math.max(0, (Number(debt.amount) || 0) - (Number(debt.paid) || 0));
}

export function openDebts() {
  return state.debts.filter((d) => d.status === 'open' && !d.voided && debtRemaining(d) > 0);
}

export function totalReceivable() {
  return openDebts().reduce((acc, d) => acc + debtRemaining(d), 0);
}

export function overdueDebts() {
  const today = startOfDay(new Date());
  return openDebts().filter((d) => {
    const due = toDate(d.dueDate);
    return due && startOfDay(due) < today;
  });
}

export async function addDebtPayment(debtId, amount, note = '', method = 'cash') {
  requireUser();
  const debt = state.debts.find((d) => d.id === debtId);
  if (!debt) throw new Error('Kasbon tidak ditemukan.');
  const value = Math.max(1, cleanInt(amount));
  const remaining = debtRemaining(debt);
  if (value > remaining) throw new Error('Nominal pembayaran melebihi sisa kasbon.');
  const newPaid = Math.min(Number(debt.amount) || 0, (Number(debt.paid) || 0) + value);
  const payment = {
    id: uid('pay_'),
    amount: value,
    date: fb.Timestamp.fromDate(new Date()),
    note: cleanStr(note, 180),
    method: cleanStr(method, 20) || 'cash'
  };
  await fb.updateDoc(fb.doc(db, ...userPath('debts'), debtId), {
    paid: newPaid,
    status: newPaid >= (Number(debt.amount) || 0) ? 'paid' : 'open',
    paidAt: newPaid >= (Number(debt.amount) || 0) ? fb.serverTimestamp() : null,
    payments: fb.arrayUnion(payment),
    updatedAt: fb.serverTimestamp()
  });
  return payment;
}

export async function createManualDebt({ customerId, customerName, amount, note, dueDate, date }) {
  requireUser();
  const value = Math.max(1, cleanInt(amount));
  const customer = state.customers.find((c) => c.id === customerId);
  const name = cleanStr(customerName || (customer && customer.name), 100);
  if (!name) throw new Error('Nama pelanggan wajib diisi.');
  let cid = customerId || '';
  if (!cid) {
    cid = await saveCustomer({ name, phone: '' });
  }
  const ref = await fb.addDoc(fb.collection(db, ...userPath('debts')), {
    customerId: cid,
    customerName: name,
    transactionId: '',
    invoice: '',
    type: 'manual',
    amount: value,
    paid: 0,
    status: 'open',
    note: cleanStr(note, 220),
    dueDate: dueDate ? fb.Timestamp.fromDate(parseLocalDate(dueDate)) : null,
    date: fb.Timestamp.fromDate(parseLocalDate(date) || new Date()),
    payments: [],
    createdAt: fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp()
  });
  return ref.id;
}

export async function deleteDebt(debtId) {
  requireUser();
  const debt = state.debts.find((d) => d.id === debtId);
  if (!debt) return;
  if ((Number(debt.paid) || 0) > 0) throw new Error('Kasbon yang sudah ada pembayaran tidak bisa dihapus. Tandai lunas atau biarkan sebagai riwayat.');
  await fb.updateDoc(fb.doc(db, ...userPath('debts'), debtId), {
    status: 'void',
    voided: true,
    updatedAt: fb.serverTimestamp()
  });
}

/* ---------------- sales ---------------- */
function normalizeItems(items) {
  return (items || []).map((it) => ({
    productId: it.productId || '',
    name: cleanStr(it.name, 140),
    qty: Math.max(1, cleanInt(it.qty) || 1),
    price: Math.max(0, cleanInt(it.price)),
    cost: Math.max(0, cleanInt(it.cost)),
    unit: cleanStr(it.unit, 20) || 'pcs',
    emoji: cleanStr(it.emoji, 8) || '📦',
    kind: it.kind === 'digital' ? 'digital' : 'product',
    service: cleanStr(it.service, 30),
    provider: cleanStr(it.provider, 60),
    target: cleanStr(it.target, 80),
    nominal: cleanInt(it.nominal),
    admin: cleanInt(it.admin),
    note: cleanStr(it.note, 160)
  })).filter((it) => it.name && it.qty > 0);
}

export async function createSale(payload) {
  requireUser();
  const items = normalizeItems(payload.items);
  if (!items.length) throw new Error('Keranjang masih kosong.');
  const discount = Math.max(0, Math.min(cleanInt(payload.discount), sum(items, (i) => i.price * i.qty)));
  const subtotal = sum(items, (i) => i.price * i.qty);
  const total = subtotal - discount;
  const cost = sum(items, (i) => i.cost * i.qty);
  if (total <= 0) throw new Error('Total transaksi harus lebih dari 0.');

  // Validasi stok produk
  for (const item of items) {
    if (item.kind !== 'product' || !item.productId) continue;
    const product = state.products.find((p) => p.id === item.productId);
    if (!product) continue;
    const available = Number(product.stock) || 0;
    if (available < item.qty) {
      throw new Error(`Stok ${product.name} tidak cukup. Sisa ${available} ${product.unit || 'pcs'}.`);
    }
  }

  const method = ['cash', 'qris', 'transfer', 'kasbon'].includes(payload.method) ? payload.method : 'cash';
  let customer = state.customers.find((c) => c.id === payload.customerId);
  if (method === 'kasbon' && !customer && payload.customerName) {
    const cid = await saveCustomer({ name: payload.customerName, phone: payload.customerPhone || '' });
    customer = { id: cid, name: payload.customerName, phone: payload.customerPhone || '' };
  }
  if (method === 'kasbon' && !customer) throw new Error('Pilih pelanggan terlebih dahulu untuk transaksi kasbon.');

  const now = new Date();
  const cashReceived = method === 'cash' ? Math.max(0, cleanInt(payload.cashReceived)) : (method === 'kasbon' ? 0 : total);
  if (method === 'cash' && cashReceived < total) throw new Error('Uang yang diterima kurang dari total transaksi.');

  const batch = fb.writeBatch(db);
  const txRef = fb.doc(fb.collection(db, ...userPath('transactions')));
  const invoice = makeInvoice(now);
  const type = items.every((i) => i.kind === 'digital') ? 'digital' : items.some((i) => i.kind === 'digital') ? 'mixed' : 'product';

  const tx = {
    invoice,
    date: fb.Timestamp.fromDate(now),
    createdAt: fb.serverTimestamp(),
    items,
    itemCount: sum(items, (i) => i.qty),
    subtotal,
    discount,
    total,
    cost,
    profit: total - cost,
    paymentMethod: method,
    cashReceived: method === 'cash' ? cashReceived : (method === 'kasbon' ? 0 : total),
    change: method === 'cash' ? Math.max(0, cashReceived - total) : 0,
    customerId: customer ? customer.id : '',
    customerName: customer ? customer.name : '',
    note: cleanStr(payload.note, 240),
    cashier: cleanStr((auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || '', 120),
    type,
    voided: false,
    source: 'pos'
  };
  batch.set(txRef, tx);

  // Kurangi stok
  items.forEach((item) => {
    if (item.kind === 'product' && item.productId) {
      batch.update(fb.doc(db, ...userPath('products'), item.productId), {
        stock: fb.increment(-item.qty),
        updatedAt: fb.serverTimestamp()
      });
    }
  });

  // Kasbon
  let debtId = '';
  if (method === 'kasbon') {
    const debtRef = fb.doc(fb.collection(db, ...userPath('debts')));
    debtId = debtRef.id;
    batch.set(debtRef, {
      customerId: customer.id,
      customerName: customer.name,
      transactionId: txRef.id,
      invoice,
      type: 'sale',
      amount: total,
      paid: 0,
      status: 'open',
      note: cleanStr(payload.note, 220),
      dueDate: payload.dueDate ? fb.Timestamp.fromDate(parseLocalDate(payload.dueDate)) : fb.Timestamp.fromDate(addDays(now, 14)),
      date: fb.Timestamp.fromDate(now),
      payments: [],
      createdAt: fb.serverTimestamp(),
      updatedAt: fb.serverTimestamp()
    });
  }

  await batch.commit();
  return { id: txRef.id, debtId, ...tx };
}

export async function voidSale(tx, reason = '') {
  requireUser();
  if (!tx || tx.voided) throw new Error('Transaksi ini sudah dibatalkan.');
  const debt = state.debts.find((d) => d.transactionId === tx.id && !d.voided);
  if (debt && (Number(debt.paid) || 0) > 0) {
    throw new Error('Transaksi kasbon ini sudah memiliki pembayaran. Batalkan pembayaran kasbon terlebih dahulu.');
  }
  const batch = fb.writeBatch(db);
  batch.update(fb.doc(db, ...userPath('transactions'), tx.id), {
    voided: true,
    voidedAt: fb.serverTimestamp(),
    voidReason: cleanStr(reason, 200),
    voidedBy: cleanStr((auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || '', 120)
  });
  (tx.items || []).forEach((item) => {
    if (item.kind === 'product' && item.productId) {
      batch.update(fb.doc(db, ...userPath('products'), item.productId), {
        stock: fb.increment(item.qty),
        updatedAt: fb.serverTimestamp()
      });
    }
  });
  if (debt) {
    batch.update(fb.doc(db, ...userPath('debts'), debt.id), {
      status: 'void',
      voided: true,
      updatedAt: fb.serverTimestamp()
    });
  }
  await batch.commit();
}

/* ---------------- range queries ---------------- */
export async function fetchTransactions(start, end, max = 2500) {
  requireUser();
  const q = fb.query(
    fb.collection(db, ...userPath('transactions')),
    fb.where('date', '>=', fb.Timestamp.fromDate(startOfDay(start))),
    fb.where('date', '<=', fb.Timestamp.fromDate(endOfDay(end))),
    fb.orderBy('date', 'desc'),
    fb.limit(max)
  );
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => txDate(b) - txDate(a));
}

export async function fetchExpenses(start, end, max = 1500) {
  requireUser();
  const q = fb.query(
    fb.collection(db, ...userPath('expenses')),
    fb.where('date', '>=', fb.Timestamp.fromDate(startOfDay(start))),
    fb.where('date', '<=', fb.Timestamp.fromDate(endOfDay(end))),
    fb.orderBy('date', 'desc'),
    fb.limit(max)
  );
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function loadRange(start, end) {
  const [txs, exps] = await Promise.all([fetchTransactions(start, end), fetchExpenses(start, end)]);
  return { txs, expenses: exps };
}

/* ---------------- stats & aggregation ---------------- */
export function activeTx(txs) {
  return (txs || []).filter((t) => !isVoid(t));
}

export function calcStats(txs, expenses) {
  const active = activeTx(txs);
  const omzet = sum(active, (t) => t.total);
  const hpp = sum(active, (t) => t.cost);
  const discount = sum(active, (t) => t.discount);
  const labaKotor = omzet - hpp;
  const pengeluaran = sum(expenses || [], (e) => e.amount);
  const labaBersih = labaKotor - pengeluaran;
  const cashIn = sum(active.filter((t) => t.paymentMethod !== 'kasbon'), (t) => t.total);
  const kasbonBaru = sum(active.filter((t) => t.paymentMethod === 'kasbon'), (t) => t.total);
  const count = active.length;
  const itemCount = sum(active, (t) => t.itemCount || sum(t.items || [], (i) => i.qty));
  const avg = count ? omzet / count : 0;
  const margin = omzet ? (labaKotor / omzet) * 100 : 0;
  const methods = { cash: 0, qris: 0, transfer: 0, kasbon: 0 };
  active.forEach((t) => { methods[t.paymentMethod] = (methods[t.paymentMethod] || 0) + (Number(t.total) || 0); });
  const digitalProfit = sum(active.filter((t) => t.type === 'digital' || t.type === 'mixed'), (t) => {
    return sum((t.items || []).filter((i) => i.kind === 'digital'), (i) => (i.price - i.cost) * i.qty);
  });
  const productProfit = sum(active.filter((t) => t.type === 'product' || t.type === 'mixed'), (t) => {
    return sum((t.items || []).filter((i) => i.kind !== 'digital'), (i) => (i.price - i.cost) * i.qty);
  });
  return { omzet, hpp, discount, labaKotor, pengeluaran, labaBersih, cashIn, kasbonBaru, count, itemCount, avg, margin, methods, digitalProfit, productProfit };
}

export function series(txs, days = 7, end = new Date()) {
  const endDay = startOfDay(end);
  const startDay = addDays(endDay, -(days - 1));
  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = addDays(startDay, i);
    buckets.set(dateKey(d), { key: dateKey(d), date: d, omzet: 0, laba: 0, count: 0 });
  }
  activeTx(txs).forEach((t) => {
    const k = dateKey(txDate(t));
    const b = buckets.get(k);
    if (!b) return;
    b.omzet += Number(t.total) || 0;
    b.laba += Number(t.profit) || 0;
    b.count += 1;
  });
  return [...buckets.values()];
}

export function expenseBreakdown(expenses) {
  const map = new Map();
  (expenses || []).forEach((e) => {
    const key = e.category || 'Lainnya';
    map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function topProducts(txs, max = 6) {
  const map = new Map();
  activeTx(txs).forEach((t) => {
    (t.items || []).forEach((i) => {
      if (i.kind === 'digital') return;
      const key = i.productId || i.name;
      if (!map.has(key)) map.set(key, { name: i.name, emoji: i.emoji || '📦', qty: 0, omzet: 0, profit: 0 });
      const row = map.get(key);
      row.qty += Number(i.qty) || 0;
      row.omzet += (Number(i.price) || 0) * (Number(i.qty) || 0);
      row.profit += ((Number(i.price) || 0) - (Number(i.cost) || 0)) * (Number(i.qty) || 0);
    });
  });
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, max);
}

export function topServices(txs, max = 6) {
  const map = new Map();
  activeTx(txs).forEach((t) => {
    (t.items || []).forEach((i) => {
      if (i.kind !== 'digital') return;
      const key = i.service || 'lain';
      if (!map.has(key)) map.set(key, { service: key, name: i.name, qty: 0, omzet: 0, profit: 0 });
      const row = map.get(key);
      row.qty += Number(i.qty) || 1;
      row.omzet += (Number(i.price) || 0) * (Number(i.qty) || 1);
      row.profit += ((Number(i.price) || 0) - (Number(i.cost) || 0)) * (Number(i.qty) || 1);
    });
  });
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, max);
}

export function lowStock() {
  return state.products
    .filter((p) => p.active !== false)
    .filter((p) => (Number(p.stock) || 0) <= (Number(p.minStock) || 0))
    .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
}

export function stockValue() {
  return state.products
    .filter((p) => p.active !== false)
    .reduce((acc, p) => acc + (Number(p.stock) || 0) * (Number(p.cost) || 0), 0);
}

export function todayTransactions(txs = state.recent) {
  const key = dateKey(new Date());
  return activeTx(txs).filter((t) => dateKey(txDate(t)) === key);
}

export function monthTransactions(txs = state.recent) {
  const start = startOfMonth(new Date());
  return activeTx(txs).filter((t) => txDate(t) >= start);
}

export function paymentsInRange(debts, start, end) {
  const s = startOfDay(start).getTime();
  const e = endOfDay(end).getTime();
  let total = 0;
  const rows = [];
  (debts || []).forEach((d) => {
    (d.payments || []).forEach((p) => {
      const t = toDate(p.date);
      if (t && t.getTime() >= s && t.getTime() <= e) {
        total += Number(p.amount) || 0;
        rows.push({ ...p, customerName: d.customerName, debtId: d.id });
      }
    });
  });
  return { total, rows };
}

export function customerTransactions(customerId, txs = state.recent) {
  return activeTx(txs).filter((t) => t.customerId === customerId);
}

/* ---------------- seed demo ---------------- */
const DEMO_PRODUCTS = [
  ['Indomie Goreng', 'Makanan', 2800, 3500, 40, 8, '🍜', 'bungkus'],
  ['Beras Premium 5kg', 'Sembako', 62000, 68000, 12, 3, '🍚', 'karung'],
  ['Minyak Goreng 1L', 'Sembako', 15500, 17500, 18, 4, '🛢️', 'botol'],
  ['Gula Pasir 1kg', 'Sembako', 14000, 16000, 15, 4, '🧂', 'kg'],
  ['Telur Ayam 1kg', 'Sembako', 25000, 28000, 10, 3, '🥚', 'kg'],
  ['Aqua 600ml', 'Minuman', 2800, 4000, 30, 8, '💧', 'botol'],
  ['Teh Botol Sosro', 'Minuman', 3500, 5000, 24, 6, '🥤', 'botol'],
  ['Kopi Kapal Api', 'Minuman', 1200, 2000, 50, 10, '☕', 'sachet'],
  ['Sampoerna Mild 16', 'Rokok', 26000, 29000, 20, 5, '🚬', 'bungkus'],
  ['Sabun Lifebuoy', 'Sabun & Mandi', 3500, 5000, 25, 6, '🧼', 'pcs'],
  ['Rinso Anti Noda 800g', 'Rumah Tangga', 18500, 21000, 8, 3, '🧴', 'pack'],
  ['Chitato Sapi Panggang', 'Makanan', 8500, 10000, 14, 5, '🍪', 'bungkus'],
  ['Sarden ABC 155g', 'Makanan', 9000, 11000, 16, 4, '🥫', 'kaleng'],
  ['Gas LPG 3kg (isi ulang)', 'Gas & Listrik', 18000, 22000, 6, 2, '⚡', 'tabung']
];

const DEMO_CUSTOMERS = [
  ['Bu Siti', '081234567890', 'RT 02 / RW 01'],
  ['Pak Andi', '081298765432', 'Warung sebelah'],
  ['Bu Rina', '085712345678', 'RT 03'],
  ['Mas Joko', '087855667788', 'Ojek pangkalan'],
  ['Bu Dewi', '081377889900', 'RT 01']
];

const DEMO_EXPENSES = [
  ['Listrik & Air', 150000, 'Token listrik toko', -8],
  ['Sewa Tempat', 400000, 'Sewa bulan ini', -20],
  ['Transport', 50000, 'Ongkos kulakan', -5],
  ['ATK & Perlengkapan', 30000, 'Plastik dan kertas nota', -3],
  ['Pulsa & Internet', 80000, 'Paket data kuota toko', -12],
  ['Gaji Karyawan', 350000, 'Bantu jaga toko 3 hari', -6]
];

export async function seedDemoData() {
  requireUser();
  if (state.products.length > 0) throw new Error('Data produk sudah ada. Kosongkan data terlebih dahulu untuk memuat contoh.');
  const batch = fb.writeBatch(db);
  const now = new Date();
  let seed = 27;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const productRefs = DEMO_PRODUCTS.map((row) => {
    const [name, category, cost, price, stock, minStock, emoji, unit] = row;
    const ref = fb.doc(fb.collection(db, ...userPath('products')));
    batch.set(ref, {
      name, category, cost, price, stock, minStock, emoji, unit,
      barcode: '', note: '', active: true,
      createdAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp()
    });
    return { id: ref.id, name, category, cost, price, emoji, unit };
  });

  const customerRefs = DEMO_CUSTOMERS.map(([name, phone, address]) => {
    const ref = fb.doc(fb.collection(db, ...userPath('customers')));
    batch.set(ref, { name, phone, address, note: '', source: 'demo', createdAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp() });
    return { id: ref.id, name, phone };
  });

  // Pengeluaran contoh diprorata sesuai bagian bulan berjalan yang tercakup
  // data demo, supaya laba bulan ini tetap positif saat data dimuat kapan pun.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysCovered = Math.max(1, Math.min(30, Math.floor((now - monthStart) / 86400000) + 1));
  const expenseScale = daysCovered / 30;
  DEMO_EXPENSES.forEach(([category, amount, note, offset], idx) => {
    const ref = fb.doc(fb.collection(db, ...userPath('expenses')));
    let when = addDays(now, offset);
    if (when < monthStart) when = addDays(monthStart, idx % 3);
    if (when > now) when = new Date(now);
    const scaled = Math.max(5000, Math.round((amount * expenseScale) / 1000) * 1000);
    batch.set(ref, {
      category, amount: scaled, note,
      source: 'demo',
      date: fb.Timestamp.fromDate(when),
      createdAt: fb.serverTimestamp(), updatedAt: fb.serverTimestamp()
    });
  });

  const debtPlans = [];
  for (let day = 27; day >= 0; day -= 1) {
    const count = day === 0 ? 6 : 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i += 1) {
      const txDateValue = addDays(now, -day);
      txDateValue.setHours(7 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), 0, 0);
      if (txDateValue > now) txDateValue.setTime(now.getTime() - Math.floor(rnd() * 180 + 1) * 60000);
      const itemCount = 1 + Math.floor(rnd() * 4);
      const chosen = [];
      const used = new Set();
      for (let j = 0; j < itemCount; j += 1) {
        const p = pick(productRefs);
        if (used.has(p.id)) continue;
        used.add(p.id);
        chosen.push({ ...p, qty: 1 + Math.floor(rnd() * 2) });
      }
      if (!chosen.length) continue;
      const items = chosen.map((p) => ({
        productId: p.id, name: p.name, qty: p.qty, price: p.price, cost: p.cost,
        unit: p.unit, emoji: p.emoji, kind: 'product', service: '', provider: '', target: '', nominal: 0, admin: 0
      }));
      const subtotal = sum(items, (it) => it.price * it.qty);
      const discount = rnd() > 0.88 ? Math.floor(subtotal * 0.02 / 100) * 100 : 0;
      const total = subtotal - discount;
      const cost = sum(items, (it) => it.cost * it.qty);
      const methodRoll = rnd();
      let method = 'cash';
      if (methodRoll > 0.9) method = 'kasbon';
      else if (methodRoll > 0.78) method = 'qris';
      else if (methodRoll > 0.7) method = 'transfer';
      const customer = method === 'kasbon' || rnd() > 0.6 ? pick(customerRefs) : null;
      const cashReceived = method === 'cash' ? Math.ceil(total / 5000) * 5000 : total;
      const ref = fb.doc(fb.collection(db, ...userPath('transactions')));
      const invoice = makeInvoice(txDateValue);
      batch.set(ref, {
        invoice,
        date: fb.Timestamp.fromDate(txDateValue),
        createdAt: fb.Timestamp.fromDate(txDateValue),
        items,
        itemCount: sum(items, (it) => it.qty),
        subtotal, discount, total, cost, profit: total - cost,
        paymentMethod: method,
        cashReceived: method === 'cash' ? cashReceived : total,
        change: method === 'cash' ? cashReceived - total : 0,
        customerId: customer ? customer.id : '',
        customerName: customer ? customer.name : '',
        note: '',
        cashier: 'Pemilik Toko',
        type: 'product',
        voided: false,
        source: 'demo'
      });
      if (method === 'kasbon' && customer) {
        debtPlans.push({
          customerId: customer.id,
          customerName: customer.name,
          transactionId: ref.id,
          invoice,
          amount: total,
          date: txDateValue,
          paid: rnd() > 0.7 ? Math.floor(total / 2 / 1000) * 1000 : 0
        });
      }
    }
  }

  // Beberapa transaksi digital
  const digitalPlans = [
    ['pulsa', 'Telkomsel', '10.000', 12000, 10000, 2000, -1],
    ['data', 'Indosat Ooredoo', '25.000', 30000, 25000, 5000, -1],
    ['transfer', 'BCA', '100.000', 105000, 100000, 5000, -2],
    ['token', 'PLN', '50.000', 53000, 50000, 3000, -3],
    ['ewallet', 'DANA', '20.000', 22000, 20000, 2000, -4]
  ];
  digitalPlans.forEach(([service, provider, target, total, cost, admin, offset]) => {
    const when = addDays(now, offset);
    when.setHours(10 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0);
    const name = `${service === 'transfer' ? 'Transfer' : service === 'token' ? 'Token Listrik' : service === 'ewallet' ? 'Top Up' : 'Pulsa'} ${provider}`;
    const ref = fb.doc(fb.collection(db, ...userPath('transactions')));
    batch.set(ref, {
      invoice: makeInvoice(when),
      date: fb.Timestamp.fromDate(when),
      createdAt: fb.Timestamp.fromDate(when),
      items: [{
        productId: '', name, qty: 1, price: total, cost,
        unit: 'transaksi', emoji: service === 'transfer' ? '🏦' : service === 'token' ? '⚡' : '📱',
        kind: 'digital', service, provider, target, nominal: Number(String(target).replace(/\./g, '')) || total, admin, note: ''
      }],
      itemCount: 1, subtotal: total, discount: 0, total, cost, profit: total - cost,
      paymentMethod: 'cash', cashReceived: total, change: 0,
      customerId: '', customerName: '', note: '',
      cashier: 'Pemilik Toko', type: 'digital', voided: false, source: 'demo'
    });
  });

  debtPlans.forEach((plan) => {
    const ref = fb.doc(fb.collection(db, ...userPath('debts')));
    const payments = plan.paid > 0 ? [{
      id: uid('pay_'), amount: plan.paid, date: fb.Timestamp.fromDate(addDays(plan.date, 1)),
      note: 'Cicilan pertama', method: 'cash'
    }] : [];
    batch.set(ref, {
      customerId: plan.customerId,
      customerName: plan.customerName,
      transactionId: plan.transactionId,
      invoice: plan.invoice,
      type: 'sale',
      amount: plan.amount,
      paid: plan.paid,
      status: plan.paid >= plan.amount ? 'paid' : 'open',
      note: '',
      source: 'demo',
      dueDate: fb.Timestamp.fromDate(addDays(plan.date, 14)),
      date: fb.Timestamp.fromDate(plan.date),
      payments,
      createdAt: fb.Timestamp.fromDate(plan.date),
      updatedAt: fb.serverTimestamp()
    });
  });

  // Riwayat restok
  [0, 2, 4].forEach((idx) => {
    const p = productRefs[idx];
    const ref = fb.doc(fb.collection(db, ...userPath('purchases')));
    batch.set(ref, {
      date: fb.Timestamp.fromDate(addDays(now, -idx - 1)),
      createdAt: fb.serverTimestamp(),
      productId: p.id,
      productName: p.name,
      qty: 10,
      costPerUnit: p.cost,
      total: p.cost * 10,
      supplier: 'Pemasok Langganan',
      note: 'Restok contoh',
      source: 'demo',
      type: 'restock'
    });
  });

  await batch.commit();
  return true;
}

/* ---------------- backup / import / reset ---------------- */
function serialize(value) {
  if (value == null) return value;
  if (typeof value.toDate === 'function') return { __ts: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => { out[k] = serialize(v); });
    return out;
  }
  return value;
}

function revive(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(revive);
  if (typeof value === 'object') {
    if (value.__ts) return fb.Timestamp.fromDate(new Date(value.__ts));
    const out = {};
    Object.entries(value).forEach(([k, v]) => { out[k] = revive(v); });
    return out;
  }
  return value;
}

export async function exportAllData() {
  requireUser();
  const data = {
    app: 'TokoKu',
    version: (window.APP_INFO && window.APP_INFO.version) || '1.0.0',
    exportedAt: new Date().toISOString(),
    owner: (auth.currentUser && auth.currentUser.email) || '',
    store: serialize(state.store || {}),
    products: [], customers: [], transactions: [], expenses: [], debts: [], purchases: []
  };
  for (const name of COL) {
    const snap = await fb.getDocs(fb.collection(db, ...userPath(name)));
    data[name] = snap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
  }
  return data;
}

async function clearCollection(name) {
  const snap = await fb.getDocs(fb.collection(db, ...userPath(name)));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 350) {
    const batch = fb.writeBatch(db);
    docs.slice(i, i + 350).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function importAllData(payload, { replace = false } = {}) {
  requireUser();
  if (!payload || payload.app !== 'TokoKu') throw new Error('File cadangan bukan dari TokoKu.');
  if (replace) {
    for (const name of COL) await clearCollection(name);
  }
  if (payload.store && payload.store.name) {
    await fb.setDoc(fb.doc(db, ...userPath('settings'), 'store'), revive(payload.store), { merge: true });
  }
  for (const name of COL) {
    const rows = Array.isArray(payload[name]) ? payload[name] : [];
    for (let i = 0; i < rows.length; i += 300) {
      const batch = fb.writeBatch(db);
      rows.slice(i, i + 300).forEach((row) => {
        const { id, ...rest } = row;
        const ref = id ? fb.doc(db, ...userPath(name), id) : fb.doc(fb.collection(db, ...userPath(name)));
        batch.set(ref, revive(rest), { merge: true });
      });
      await batch.commit();
    }
  }
  return true;
}

export async function resetData() {
  requireUser();
  for (const name of COL) await clearCollection(name);
  state.recent = [];
  state.products = [];
  state.customers = [];
  state.debts = [];
  state.expenses = [];
  state.purchases = [];
}

export async function clearDemoOnly() {
  requireUser();
  for (const name of COL) {
    const snap = await fb.getDocs(fb.collection(db, ...userPath(name)));
    const demoDocs = snap.docs.filter((d) => d.data().source === 'demo');
    for (let i = 0; i < demoDocs.length; i += 350) {
      const batch = fb.writeBatch(db);
      demoDocs.slice(i, i + 350).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}
