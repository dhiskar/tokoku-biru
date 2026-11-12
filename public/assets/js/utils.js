/* ==========================================================================
   TokoKu — Utilities
   ========================================================================== */

export const DAY_MS = 86400000;

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function attr(value) {
  return esc(value).replace(/\n/g, ' ');
}

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

export function uid(prefix = '') {
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36) + rand;
}

/* ---------------- Numbers & currency ---------------- */
const nf = new Intl.NumberFormat('id-ID');
const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtNum(n) {
  return nf.format(Math.round(Number(n) || 0));
}

export function fmtRp(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-Rp ' : 'Rp ') + nf.format(Math.abs(v));
}

export function fmtRpShort(n) {
  const v = Math.abs(Math.round(Number(n) || 0));
  const sign = Number(n) < 0 ? '-' : '';
  if (v >= 1000000000) return `${sign}Rp ${nf2.format(v / 1000000000).replace(',00', '').replace(',', '.')} M`;
  if (v >= 1000000) return `${sign}Rp ${nf2.format(v / 1000000).replace(',00', '').replace(',', '.')} jt`;
  if (v >= 1000) return `${sign}Rp ${nf2.format(v / 1000).replace(',00', '').replace(',', '.')} rb`;
  return `${sign}Rp ${nf.format(v)}`;
}

export function fmtPct(n, digits = 1) {
  return `${(Number(n) || 0).toFixed(digits).replace('.', ',')}%`;
}

export function parseMoney(value) {
  if (typeof value === 'number') return Math.round(value);
  const digits = String(value || '').replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return 0;
  return parseInt(digits, 10) || 0;
}

export function fmtMoneyInput(value) {
  const n = parseMoney(value);
  return n ? nf.format(n) : '';
}

export function marginPct(price, cost) {
  const p = Number(price) || 0;
  if (!p) return 0;
  return ((p - (Number(cost) || 0)) / p) * 100;
}

/* ---------------- Dates ---------------- */
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && value.seconds != null) return new Date(value.seconds * 1000);
  if (typeof value === 'object' && value._seconds != null) return new Date(value._seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function dateKey(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return toDate(value);
}

export function inputDate(value) {
  if (!value) return dateKey(new Date());
  return dateKey(value);
}

export function fmtDate(value, style = 'medium') {
  const d = toDate(value);
  if (!d) return '-';
  if (style === 'short') return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (style === 'long') return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'full') return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '-';
  return `${fmtDate(d, 'long')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayName(value, short = true) {
  const d = toDate(value);
  if (!d) return '';
  return (short ? DAYS_SHORT : DAYS)[d.getDay()];
}

export function timeAgo(value) {
  const d = toDate(value);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return fmtDate(d, 'long');
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export function dueLabel(value) {
  const d = toDate(value);
  if (!d) return { text: 'Tanpa jatuh tempo', tone: '' };
  const diff = daysBetween(new Date(), d);
  if (diff < 0) return { text: `Lewat ${Math.abs(diff)} hari`, tone: 'red' };
  if (diff === 0) return { text: 'Jatuh tempo hari ini', tone: 'amber' };
  if (diff <= 3) return { text: `${diff} hari lagi`, tone: 'amber' };
  return { text: fmtDate(d, 'long'), tone: '' };
}

/* ---------------- Misc ---------------- */
export function debounce(fn, wait = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function throttle(fn, wait = 150) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) {
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn.apply(this, args);
      }, remain);
    }
  };
}

export function initials(name) {
  const parts = String(name || 'Toko').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

export function waLink(phone, text) {
  const p = normalizePhone(phone);
  const q = encodeURIComponent(text || '');
  return p ? `https://wa.me/${p}?text=${q}` : `https://wa.me/?text=${q}`;
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function csvEscape(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows, headers) {
  const lines = [];
  if (headers) lines.push(headers.map(csvEscape).join(','));
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsv(filename, rows, headers) {
  download(filename, toCsv(rows, headers), 'text/csv;charset=utf-8');
}

export function printHTML(html, title = 'Cetak') {
  const old = document.getElementById('print-frame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = 'print-frame';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${html}</head><body></body></html>`);
  doc.close();
  const run = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      console.warn(e);
    }
    setTimeout(() => frame.remove(), 3000);
  };
  if (frame.contentWindow.document.readyState === 'complete') setTimeout(run, 150);
  else frame.onload = () => setTimeout(run, 150);
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
    ta.remove();
  });
}

export function safeParse(json, fallback = null) {
  try { return JSON.parse(json); } catch (e) { return fallback; }
}

export function sortBy(list, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = typeof key === 'function' ? key(a) : a[key];
    const bv = typeof key === 'function' ? key(b) : b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv), 'id') * sign;
    return (av - bv) * sign;
  });
}

export function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

export function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

export function categoryEmoji(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('minum')) return '🥤';
  if (c.includes('makan') || c.includes('snack') || c.includes('mie')) return '🍜';
  if (c.includes('sembako') || c.includes('beras')) return '🍚';
  if (c.includes('rokok')) return '🚬';
  if (c.includes('sabun') || c.includes('mandi') || c.includes('kebersihan')) return '🧼';
  if (c.includes('rumah')) return '🏠';
  if (c.includes('obat')) return '💊';
  if (c.includes('gas') || c.includes('listrik')) return '⚡';
  if (c.includes('pulsa') || c.includes('data')) return '📱';
  return '📦';
}

export const CATEGORIES = ['Makanan', 'Minuman', 'Sembako', 'Rokok', 'Sabun & Mandi', 'Rumah Tangga', 'Gas & Listrik', 'Lainnya'];
export const UNITS = ['pcs', 'bungkus', 'pack', 'kg', 'gram', 'liter', 'botol', 'sachet', 'kaleng', 'dus', 'karung'];
export const PRODUCT_EMOJIS = ['📦', '🍜', '🍚', '🥤', '💧', '☕', '🍪', '🍫', '🧴', '🧼', '🚬', '🥚', '🍬', '🧂', '🛢️', '🧻', '💊', '🔋', '📱', '⚡', '🍞', '🧊', '🥛', '🧹'];
export const EXPENSE_CATEGORIES = ['Listrik & Air', 'Sewa Tempat', 'Gaji Karyawan', 'Transport', 'ATK & Perlengkapan', 'Perawatan Toko', 'Pulsa & Internet', 'Lainnya'];

export function paymentLabel(method) {
  return ({ cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' })[method] || method || '-';
}

export function paymentIcon(method) {
  return ({ cash: 'banknote', qris: 'qr', transfer: 'credit-card', kasbon: 'users' })[method] || 'wallet';
}

export const SERVICE_TYPES = {
  pulsa: { label: 'Pulsa', icon: 'smartphone', emoji: '📱', providerLabel: 'Operator', targetLabel: 'Nomor HP', nominals: [5000, 10000, 20000, 50000, 100000] },
  data: { label: 'Paket Data', icon: 'wifi', emoji: '🌐', providerLabel: 'Operator', targetLabel: 'Nomor HP', nominals: [10000, 25000, 50000, 100000] },
  token: { label: 'Token Listrik', icon: 'zap', emoji: '⚡', providerLabel: 'Provider', targetLabel: 'ID Meter / No. HP', nominals: [20000, 50000, 100000, 200000] },
  transfer: { label: 'Transfer Bank', icon: 'send', emoji: '🏦', providerLabel: 'Bank Tujuan', targetLabel: 'No. Rekening', nominals: [50000, 100000, 200000, 500000] },
  ewallet: { label: 'Top Up E-Wallet', icon: 'wallet', emoji: '💳', providerLabel: 'E-Wallet', targetLabel: 'Nomor HP / Akun', nominals: [20000, 50000, 100000] },
  lain: { label: 'Layanan Lain', icon: 'sparkles', emoji: '✨', providerLabel: 'Penyedia', targetLabel: 'Nomor / ID Tujuan', nominals: [10000, 20000, 50000, 100000] }
};

export const OPERATORS = ['Telkomsel', 'Indosat Ooredoo', 'XL Axiata', 'Tri', 'Smartfren', 'Axis', 'by.U'];
export const BANKS = ['BCA', 'BRI', 'Mandiri', 'BNI', 'BSI', 'CIMB Niaga', 'Danamon', 'Permata', 'BTN'];
export const EWALLETS = ['DANA', 'OVO', 'GoPay', 'ShopeePay', 'LinkAja', 'iSaku'];
