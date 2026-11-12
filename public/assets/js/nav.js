/* ==========================================================================
   TokoKu — Router helpers
   ========================================================================== */

export const ROUTE_META = {
  dashboard: { title: 'Beranda', sub: 'Ringkasan usaha Anda hari ini', icon: 'home' },
  kasir: { title: 'Kasir', sub: 'Catat penjualan produk & layanan digital', icon: 'cart' },
  produk: { title: 'Produk', sub: 'Kelola stok, harga, dan barang toko', icon: 'box' },
  transaksi: { title: 'Transaksi', sub: 'Riwayat penjualan dan nota pelanggan', icon: 'receipt' },
  laporan: { title: 'Laporan', sub: 'Omzet, laba, dan arus kas usaha', icon: 'chart' },
  kasbon: { title: 'Kasbon & Pelanggan', sub: 'Piutang pelanggan dan data kontak', icon: 'users' },
  pengeluaran: { title: 'Pengeluaran', sub: 'Biaya operasional toko', icon: 'wallet' },
  pengaturan: { title: 'Pengaturan', sub: 'Profil toko, nota, dan cadangan data', icon: 'settings' }
};

export function currentRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [name, qs] = raw.split('?');
  const clean = (name || 'dashboard').toLowerCase();
  return {
    name: ROUTE_META[clean] ? clean : 'dashboard',
    query: new URLSearchParams(qs || '')
  };
}

export function navigate(path, { replace = false } = {}) {
  const target = '#/' + String(path || 'dashboard').replace(/^#?\/?/, '');
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function goWithQuery(name, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, v);
  });
  navigate(name + (q.toString() ? '?' + q.toString() : ''));
}

export function isRoute(name) {
  return currentRoute().name === name;
}
