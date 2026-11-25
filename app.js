'use strict';
// ---------- utils ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { token: localStorage.getItem('token'), user: null, settings: {}, cart: [] };
const cur = () => state.settings.currency || '₪';
const money = n => `${cur()}${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = n => (Number(n) || 0).toLocaleString('en-US');

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 2800);
}
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logoutLocal(); throw new Error('انتهت الجلسة'); }
  if (!r.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}
function logoutLocal() { state.token = null; state.user = null; localStorage.removeItem('token'); render(); }
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

function modal(title, bodyHtml, onSave, saveLabel = 'حفظ') {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><h2>${esc(title)}</h2><form>${bodyHtml}
    <div class="actions"><button class="btn" type="submit">${saveLabel}</button><button class="btn sec" type="button" data-x>إلغاء</button></div></form></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  $('[data-x]', bg).onclick = close;
  $('form', bg).onsubmit = guard(async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await onSave(data);
    close();
  });
  const first = $('input,select', bg); if (first) first.focus();
  return close;
}
const confirmBox = (msg, fn) => modal('تأكيد', `<p>${esc(msg)}</p>`, fn, 'نعم');

// ---------- icons ----------
const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = {
  dash: ic('<circle cx="12" cy="12" r="9"/><path d="M12 12l4-3M7 15h.01M12 6v1M17 15h.01"/>'),
  cart: ic('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6"/>'),
  box: ic('<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M17 14.5c2.4.1 4.1 1.6 4.5 4.5"/>'),
  wallet: ic('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>'),
  chart: ic('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17v-4M12 17V8M16 17v-6"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  shield: ic('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9.5 12l2 2 3.5-4"/>'),
  out: ic('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>'),
  warn: ic('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>'),
  coin: ic('<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.600-1.500-3-1.500-1.700 0-3 .8-3 2s1.300 1.700 3 2 3 .8 3 2-1.300 2-3 2c-1.400 0-2.500-.5-3-1.500M12 6v2M12 16v2"/>'),
  receipt: ic('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 8h6M9 12h6"/>'),
  truck: ic('<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="6.500" cy="18" r="1.800"/><circle cx="17.500" cy="18" r="1.800"/>'),
  money: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/><path d="M6 12h.01M18 12h.01"/>'),
  clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
};

// ---------- routing ----------
const ROUTES = [
  ['dashboard', 'لوحة التحكم', 'dash', pgDashboard],
  ['pos', 'نقطة البيع', 'cart', pgPOS],
  ['products', 'المنتجات', 'box', pgProducts],
  ['customers', 'العملاء', 'users', pgCustomers],
  ['invoices', 'الفواتير والمرتجعات', 'receipt', pgInvoices],
  ['debts', 'الديون', 'wallet', pgDebts],
  ['purchases', 'المشتريات', 'truck', pgPurchases],
  ['suppliers', 'الموردين', 'users', pgSuppliers],
  ['expenses', 'المصاريف', 'money', pgExpenses],
  ['reports', 'التقارير', 'chart', pgReports],
  ['settings', 'الإعدادات', 'gear', pgSettings],
  ['users', 'المستخدمين', 'shield', pgUsers, true],
];
const routeName = () => (location.hash.replace('#/', '') || 'dashboard');

async function render() {
  const root = $('#root');
  if (!state.token) return renderLogin(root);
  if (!state.user) {
    try { const me = await api('/me'); state.user = me.user; state.settings = me.settings; }
    catch { return renderLogin(root); }
  }
  const name = routeName();
  const visible = ROUTES.filter(r => !r[4] || state.user.role === 'admin');
  const route = visible.find(r => r[0] === name) || visible[0];
  root.innerHTML = `
    <div class="topbar no-print"><button id="menu">☰</button><b>${esc(state.settings.store_name)}</b></div>
    <div id="app">
      <aside id="side">
        <div class="brand">${esc(state.settings.store_name)} <span style="color:#38bdf8;width:22px;display:inline-flex">${ICONS.cart}</span></div>
        <nav>
          ${visible.map(r => `<a href="#/${r[0]}" class="${r[0] === route[0] ? 'active' : ''}">${ICONS[r[2]]}<span>${r[1]}</span></a>`).join('')}
          <a class="logout" id="logout">${ICONS.out}<span>خروج</span></a>
        </nav>
      </aside>
      <main id="main"></main>
    </div>`;
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  $('#side').onclick = e => { if (e.target.closest('a[href]')) $('#side').classList.remove('open'); };
  $('#logout').onclick = async () => { try { await api('/logout', 'POST'); } catch { } logoutLocal(); };
  const main = $('#main');
  main.innerHTML = `<h1>${route[1]}</h1><div id="page">جارٍ التحميل...</div>`;
  try { await route[3]($('#page')); } catch (e) { $('#page').innerHTML = `<p style="color:#dc2626">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', render);

function renderLogin(root) {
  root.innerHTML = `<div class="login"><form id="lf"><h1>تسجيل الدخول</h1>
    <div class="field"><label>اسم المستخدم</label><input name="username" autocomplete="username" required autofocus></div>
    <div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn" style="width:100%">دخول</button></form></div>`;
  $('#lf').onsubmit = guard(async e => {
    e.preventDefault();
    const r = await api('/login', 'POST', Object.fromEntries(new FormData(e.target)));
    state.token = r.token; localStorage.setItem('token', r.token); state.user = null;
    render();
  });
}

// ---------- dashboard ----------
async function pgDashboard(el) {
  const d = await api('/dashboard');
  const card = (cls, n, l, icon) => `<div class="stat ${cls}"><div><div class="num">${n}</div><div class="lbl">${l}</div></div>${ICONS[icon]}</div>`;
  el.innerHTML = `
    <div class="stats">
      ${card('g-blue', num(d.total_products), 'إجمالي المنتجات', 'box')}
      ${card('g-green', money(d.sales_today), 'مبيعات اليوم', 'coin')}
      ${card('g-cyan', num(d.total_customers), 'إجمالي العملاء', 'users')}
      ${card('g-amber', num(d.low_stock_count), 'منتجات منخفضة المخزون', 'warn')}
      ${card('g-purple', num(d.debts_count), 'الديون النشطة', 'wallet')}
      ${card('g-orange', num(d.expiring_count), 'منتجات وشيكة الانتهاء', 'clock')}
    </div>
    <div class="grid2">
      <div class="panel"><h3>آخر المبيعات</h3><div class="tablewrap"><table>
        <thead><tr><th>#</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th></tr></thead>
        <tbody>${d.recent_sales.length ? d.recent_sales.map(s => `<tr><td>${s.id}</td><td>${esc(s.customer)}</td><td>${esc(s.created_at)}</td><td>${money(s.total)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="4">لا توجد مبيعات بعد</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h3>منتجات منخفضة المخزون</h3><div class="tablewrap"><table>
        <thead><tr><th>#</th><th>المنتج</th><th>الفئة</th><th>الكمية</th></tr></thead>
        <tbody>${d.low_stock.length ? d.low_stock.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td><span class="badge red">${num(p.qty)}</span></td></tr>`).join('')
      : '<tr><td class="empty" colspan="4">جميع المنتجات متوفرة</td></tr>'}</tbody></table></div></div>
    </div>
    <div class="panel"><h3>إحصائيات سريعة</h3><div class="quick">
      <div><b style="color:#2563eb">${num(d.total_invoices)}</b><span>إجمالي الفواتير</span></div>
      <div><b style="color:#15803d">${money(d.total_revenue)}</b><span>إجمالي الإيرادات</span></div>
      <div><b style="color:#06b6d4">${num(d.invoices_today)}</b><span>فواتير اليوم</span></div>
      <div><b style="color:#7c3aed">${money(d.debts_total)}</b><span>المتبقي من الديون</span></div>
    </div></div>`;
}

// ---------- products ----------
async function pgProducts(el) {
  el.innerHTML = `<div class="toolbar no-print"><input class="grow" id="q" placeholder="بحث بالاسم أو الباركود أو الفئة"><button class="btn" id="add">+ منتج جديد</button></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>#</th><th>المنتج</th><th>الفئة</th><th>الباركود</th><th>التكلفة</th><th>السعر</th><th>الكمية</th><th>الصلاحية</th><th class="no-print"></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const form = p => `
    <div class="field"><label>اسم المنتج</label><input name="name" value="${esc(p.name)}" required></div>
    <div class="row"><div class="field"><label>الفئة</label><input name="category" value="${esc(p.category)}"></div>
    <div class="field"><label>الباركود</label><input name="barcode" value="${esc(p.barcode)}"></div></div>
    <div class="row"><div class="field"><label>سعر التكلفة</label><input name="cost" type="number" step="0.01" min="0" value="${p.cost ?? 0}"></div>
    <div class="field"><label>سعر البيع</label><input name="price" type="number" step="0.01" min="0" value="${p.price ?? 0}"></div></div>
    <div class="row"><div class="field"><label>الكمية</label><input name="qty" type="number" step="any" min="0" value="${p.qty ?? 0}"></div>
    <div class="field"><label>حد التنبيه</label><input name="min_qty" type="number" step="any" min="0" value="${p.min_qty ?? state.settings.low_stock_default ?? 5}"></div></div>
    <div class="field"><label>تاريخ الانتهاء (اختياري)</label><input name="expiry_date" type="date" value="${esc(p.expiry_date || '')}"></div>`;
  let list = [];
  const draw = () => {
    $('#tb').innerHTML = list.length ? list.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.barcode)}</td>
      <td>${money(p.cost)}</td><td>${money(p.price)}</td>
      <td><span class="badge ${p.qty <= p.min_qty ? 'red' : 'green'}">${num(p.qty)}</span></td><td>${esc(p.expiry_date || '-')}</td>
      <td class="no-print" style="white-space:nowrap"><button class="btn sm sec" data-e="${p.id}">تعديل</button>
      ${state.user.role === 'admin' ? ` <button class="btn sm danger" data-d="${p.id}">حذف</button>` : ''}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="9">لا توجد منتجات</td></tr>';
  };
  const load = guard(async () => { list = await api('/products?q=' + encodeURIComponent($('#q').value)); draw(); });
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#add').onclick = () => modal('منتج جديد', form({}), async d => { await api('/products', 'POST', d); toast('تمت الإضافة'); load(); });
  $('#tb').onclick = e => {
    const ed = e.target.dataset.e, del = e.target.dataset.d;
    if (ed) { const p = list.find(x => x.id == ed); modal('تعديل منتج', form(p), async d => { await api('/products/' + ed, 'PUT', d); toast('تم الحفظ'); load(); }); }
    if (del) confirmBox('حذف هذا المنتج؟', async () => { await api('/products/' + del, 'DELETE'); toast('تم الحذف'); load(); });
  };
  await load();
}

// ---------- POS ----------
async function pgPOS(el) {
  const [products, customers] = await Promise.all([api('/products'), api('/customers')]);
  el.innerHTML = `<div class="pos">
    <div><div class="toolbar"><input class="grow" id="q" placeholder="ابحث بالاسم أو امسح الباركود ثم Enter" autofocus></div><div class="pgrid" id="grid"></div></div>
    <div class="panel"><h3>السلة</h3><div class="body">
      <div id="cart"></div>
      <div class="field" style="margin-top:12px"><label>العميل</label>
        <select id="cust"><option value="">زبون نقدي</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}${c.debt > 0 ? ' (دين ' + money(c.debt) + ')' : ''}</option>`).join('')}</select></div>
      <div class="row"><div class="field"><label>خصم</label><input id="disc" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>المدفوع (اتركه فارغاً للدفع الكامل)</label><input id="paid" type="number" min="0" step="0.01"></div></div>
      <div class="totals" id="tot"></div>
      <button class="btn ok" id="pay" style="width:100%;margin-top:10px;padding:12px">إتمام البيع</button>
    </div></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const f = products.filter(p => !q || p.name.toLowerCase().includes(q) || p.barcode.toLowerCase() === q || p.category.toLowerCase().includes(q));
    $('#grid').innerHTML = f.length ? f.map(p => `<div class="pcard ${p.qty <= 0 ? 'out' : ''}" data-id="${p.id}"><b>${esc(p.name)}</b><span class="pr">${money(p.price)}</span><small>المتوفر: ${num(p.qty)}</small></div>`).join('')
      : '<p style="color:#64748b">لا توجد نتائج</p>';
  };
  const calc = () => {
    const sub = state.cart.reduce((a, l) => a + l.price * l.qty, 0);
    const disc = Math.min(Math.max(Number($('#disc').value) || 0, 0), sub);
    const total = sub - disc;
    const paidRaw = $('#paid').value;
    const paid = paidRaw === '' ? total : Math.min(Math.max(Number(paidRaw), 0), total);
    $('#tot').innerHTML = `<div><span>المجموع</span><b>${money(sub)}</b></div><div><span>الخصم</span><b>${money(disc)}</b></div>
      <div class="grand"><span>الإجمالي</span><b>${money(total)}</b></div>${total - paid > 0.001 ? `<div style="color:#dc2626"><span>دين</span><b>${money(total - paid)}</b></div>` : ''}`;
    return { sub, disc, total, paid };
  };
  const drawCart = () => {
    $('#cart').innerHTML = state.cart.length ? state.cart.map((l, i) => `<div class="cart-line"><div class="nm"><b>${esc(l.name)}</b><br><small>${money(l.price)}</small></div>
      <input type="number" min="0.001" step="any" value="${l.qty}" data-q="${i}"><b style="min-width:70px;text-align:left">${money(l.price * l.qty)}</b>
      <button class="btn sm danger" data-r="${i}">×</button></div>`).join('') : '<p style="color:#64748b;text-align:center">السلة فارغة</p>';
    calc();
  };
  const addToCart = p => {
    const l = state.cart.find(x => x.id === p.id);
    if (l) { if (l.qty + 1 > p.qty) return toast('الكمية غير كافية', true); l.qty++; }
    else { if (p.qty < 1) return toast('نفذ المخزون', true); state.cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 }); }
    drawCart();
  };
  $('#grid').onclick = e => { const c = e.target.closest('.pcard'); if (c) addToCart(products.find(p => p.id == c.dataset.id)); };
  $('#q').oninput = draw;
  $('#q').onkeydown = e => {
    if (e.key !== 'Enter') return;
    const v = $('#q').value.trim().toLowerCase();
    const hit = products.find(p => p.barcode && p.barcode.toLowerCase() === v);
    if (hit) { addToCart(hit); $('#q').value = ''; draw(); }
  };
  $('#cart').onchange = e => {
    const i = e.target.dataset.q; if (i == null) return;
    const l = state.cart[i], p = products.find(x => x.id === l.id), v = Number(e.target.value);
    if (!(v > 0)) return drawCart();
    if (v > p.qty) { toast('الكمية غير كافية', true); return drawCart(); }
    l.qty = v; drawCart();
  };
  $('#cart').onclick = e => { const i = e.target.dataset.r; if (i != null) { state.cart.splice(i, 1); drawCart(); } };
  $('#disc').oninput = calc; $('#paid').oninput = calc;
  $('#pay').onclick = guard(async () => {
    if (!state.cart.length) throw new Error('السلة فارغة');
    const { paid } = calc();
    const r = await api('/sales', 'POST', {
      items: state.cart.map(l => ({ product_id: l.id, qty: l.qty, price: l.price })),
      customer_id: $('#cust').value || null, discount: $('#disc').value || 0, paid: $('#paid').value === '' ? null : paid
    });
    state.cart = [];
    toast('تم البيع بنجاح');
    showReceipt(r.id);
    render();
  });
  draw(); drawCart();
}

async function showReceipt(id) {
  const s = await api('/sales/' + id);
  const close = modal('فاتورة #' + s.id, `
    <div id="receipt"><p style="text-align:center"><b>${esc(state.settings.store_name)}</b><br>${esc(s.created_at)}<br>العميل: ${esc(s.customer)}</p>
    <table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>
    ${s.items.map(i => `<tr><td>${esc(i.name)}</td><td>${num(i.qty)}</td><td>${money(i.price)}</td><td>${money(i.price * i.qty)}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><div><span>المجموع</span><b>${money(s.subtotal)}</b></div><div><span>الخصم</span><b>${money(s.discount)}</b></div>
    <div class="grand"><span>الإجمالي</span><b>${money(s.total)}</b></div><div><span>المدفوع</span><b>${money(s.paid)}</b></div>
    ${s.total - s.paid > 0.001 ? `<div style="color:#dc2626"><span>المتبقي (دين)</span><b>${money(s.total - s.paid)}</b></div>` : ''}</div>
    <p style="text-align:center;color:#64748b">${esc(state.settings.receipt_footer)}</p></div>
    <button type="button" class="btn sec" id="pr">طباعة</button>`, async () => { }, 'إغلاق');
  $('#pr').onclick = () => {
    const w = window.open('', '_blank', 'width=420,height=640');
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial;padding:12px}table{width:100%;border-collapse:collapse}td,th{padding:4px;border-bottom:1px solid #ddd;text-align:right}.totals div{display:flex;justify-content:space-between}</style></head><body>${$('#receipt').innerHTML}</body></html>`);
    w.document.close(); w.print();
  };
}

// ---------- customers ----------
async function pgCustomers(el) {
  el.innerHTML = `<div class="toolbar"><input class="grow" id="q" placeholder="بحث بالاسم أو الهاتف"><button class="btn" id="add">+ عميل جديد</button></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الدين</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const form = c => `<div class="field"><label>الاسم</label><input name="name" value="${esc(c.name)}" required></div>
    <div class="field"><label>الهاتف</label><input name="phone" value="${esc(c.phone)}"></div>
    <div class="field"><label>العنوان</label><input name="address" value="${esc(c.address)}"></div>`;
  let list = [];
  const draw = () => {
    $('#tb').innerHTML = list.length ? list.map(c => `<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td>
      <td>${c.debt > 0.001 ? `<span class="badge red">${money(c.debt)}</span>` : '<span class="badge green">لا يوجد</span>'}</td>
      <td style="white-space:nowrap"><button class="btn sm sec" data-s="${c.id}">كشف حساب</button> <button class="btn sm sec" data-e="${c.id}">تعديل</button>
      ${state.user.role === 'admin' ? ` <button class="btn sm danger" data-d="${c.id}">حذف</button>` : ''}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="6">لا يوجد عملاء</td></tr>';
  };
  const load = guard(async () => { list = await api('/customers?q=' + encodeURIComponent($('#q').value)); draw(); });
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#add').onclick = () => modal('عميل جديد', form({}), async d => { await api('/customers', 'POST', d); toast('تمت الإضافة'); load(); });
  $('#tb').onclick = guard(async e => {
    const { e: ed, d: del, s } = e.target.dataset;
    if (ed) { const c = list.find(x => x.id == ed); modal('تعديل عميل', form(c), async d => { await api('/customers/' + ed, 'PUT', d); toast('تم الحفظ'); load(); }); }
    if (del) confirmBox('حذف هذا العميل؟', async () => { await api('/customers/' + del, 'DELETE'); toast('تم الحذف'); load(); });
    if (s) statement(s, load);
  });
  await load();
}
async function statement(id, reload) {
  const d = await api(`/customers/${id}/statement`);
  const c = d.customer;
  modal('كشف حساب: ' + c.name, `
    <p>الدين الحالي: <b style="color:${c.debt > 0.001 ? '#dc2626' : '#16a34a'}">${money(c.debt)}</b></p>
    <h4>الفواتير</h4><table><thead><tr><th>#</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th></tr></thead><tbody>
    ${d.sales.map(s => `<tr><td>${s.id}</td><td>${esc(s.created_at)}</td><td>${money(s.total)}</td><td>${money(s.paid)}</td></tr>`).join('') || '<tr><td class="empty" colspan="4">لا يوجد</td></tr>'}</tbody></table>
    <h4>الدفعات</h4><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th></tr></thead><tbody>
    ${d.payments.map(p => `<tr><td>${esc(p.created_at)}</td><td>${money(p.amount)}</td><td>${esc(p.note)}</td></tr>`).join('') || '<tr><td class="empty" colspan="3">لا يوجد</td></tr>'}</tbody></table>`,
    async () => { }, 'إغلاق');
}

// ---------- debts ----------
async function pgDebts(el) {
  const list = await api('/debts');
  el.innerHTML = `<div class="panel"><div class="tablewrap"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>إجمالي المشتريات الآجلة</th><th>المسدد</th><th>المتبقي</th><th></th></tr></thead><tbody>
    ${list.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${money(c.owed)}</td><td>${money(c.repaid)}</td><td><span class="badge red">${money(c.debt)}</span></td>
    <td><button class="btn sm ok" data-p="${c.id}">تسديد دفعة</button> <button class="btn sm sec" data-s="${c.id}">كشف</button></td></tr>`).join('')
      || '<tr><td class="empty" colspan="6">لا توجد ديون نشطة</td></tr>'}</tbody></table></div></div>`;
  el.onclick = e => {
    const { p, s } = e.target.dataset;
    if (s) statement(s);
    if (p) {
      const c = list.find(x => x.id == p);
      modal('تسديد دفعة - ' + c.name, `<p>الدين الحالي: <b>${money(c.debt)}</b></p>
        <div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" min="0.01" max="${c.debt}" value="${c.debt}" required></div>
        <div class="field"><label>ملاحظة</label><input name="note"></div>`,
        async d => { await api(`/customers/${p}/payments`, 'POST', d); toast('تم تسجيل الدفعة'); render(); });
    }
  };
}

// ---------- reports ----------
async function pgReports(el) {
  const today = new Date().toLocaleDateString('sv');
  el.innerHTML = `<div class="toolbar no-print"><div><label>من</label><input type="date" id="from" value="${today.slice(0, 8)}01"></div>
    <div><label>إلى</label><input type="date" id="to" value="${today}"></div><button class="btn" id="go" style="align-self:end">عرض</button>
    <button class="btn sec" id="print" style="align-self:end">طباعة</button></div><div id="rep"></div>`;
  const load = guard(async () => {
    const r = await api(`/reports?from=${$('#from').value}&to=${$('#to').value}`);
    const s = r.summary, max = Math.max(1, ...r.daily.map(d => d.total));
    const kpi = (cls, n, l) => `<div class="stat ${cls}"><div><div class="num">${n}</div><div class="lbl">${l}</div></div></div>`;
    $('#rep').innerHTML = `<div class="stats">${kpi('g-blue', num(s.invoices), 'عدد الفواتير')}${kpi('g-green', money(s.net_sales), 'صافي المبيعات (بعد المرتجعات)')}
      ${kpi('g-purple', money(s.profit), 'صافي الربح (بعد المصاريف)')}${kpi('g-orange', money(s.credit), 'مبيعات آجلة')}</div>
      <div class="grid2"><div class="panel"><h3>المبيعات اليومية</h3><div class="body">
      ${r.daily.map(d => `<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><span style="width:90px;font-size:13px">${esc(d.day)}</span>
        <div style="flex:1;background:#eef2ff;border-radius:6px;height:20px"><div style="width:${d.total / max * 100}%;background:#3b82f6;height:100%;border-radius:6px"></div></div>
        <b style="min-width:90px;text-align:left;font-size:13px">${money(d.total)}</b></div>`).join('') || '<p style="color:#64748b">لا توجد بيانات</p>'}</div></div>
      <div class="panel"><h3>الأكثر مبيعاً</h3><div class="tablewrap"><table><thead><tr><th>المنتج</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>
      ${r.top.map(t => `<tr><td>${esc(t.name)}</td><td>${num(t.qty)}</td><td>${money(t.total)}</td></tr>`).join('') || '<tr><td class="empty" colspan="3">لا توجد بيانات</td></tr>'}</tbody></table></div></div></div>
      <div class="panel"><h3>ملخص إضافي</h3><div class="quick">
      <div><b>${money(s.discounts)}</b><span>إجمالي الخصومات</span></div><div><b>${money(s.returns)}</b><span>المرتجعات</span></div>
      <div><b>${money(s.expenses)}</b><span>المصاريف</span></div><div><b>${money(s.gross_profit)}</b><span>الربح قبل المصاريف</span></div>
      <div><b>${money(s.debt_collected)}</b><span>ديون تم تحصيلها</span></div><div><b>${money(s.payables)}</b><span>مستحق للموردين</span></div>
      <div><b>${money(r.stock.cost_value)}</b><span>قيمة المخزون (تكلفة)</span></div><div><b>${money(r.stock.sale_value)}</b><span>قيمة المخزون (بيع)</span></div></div></div>`;
  });
  $('#go').onclick = load; $('#print').onclick = () => window.print();
  await load();
}

// ---------- invoices & returns ----------
async function pgInvoices(el) {
  const today = new Date().toLocaleDateString('sv');
  el.innerHTML = `<div class="toolbar"><div><label>من</label><input type="date" id="from" value="${today.slice(0, 8)}01"></div>
    <div><label>إلى</label><input type="date" id="to" value="${today}"></div><button class="btn" id="go" style="align-self:end">عرض</button></div>
    <div class="panel"><h3>الفواتير</h3><div class="tablewrap"><table><thead><tr><th>#</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>الكاشير</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>
    <div class="panel"><h3>المرتجعات</h3><div class="tablewrap"><table><thead><tr><th>#</th><th>فاتورة</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th><th>خصم من الدين</th><th>استرجاع نقدي</th></tr></thead><tbody id="rt"></tbody></table></div></div>`;
  const load = guard(async () => {
    const [sales, rets] = await Promise.all([api(`/sales?from=${$('#from').value}&to=${$('#to').value}`), api('/returns')]);
    $('#tb').innerHTML = sales.length ? sales.map(s => `<tr><td>${s.id}</td><td>${esc(s.customer)}</td><td>${esc(s.created_at)}</td><td>${money(s.total)}</td>
      <td>${s.paid < s.total ? `<span class="badge amber">${money(s.paid)}</span>` : money(s.paid)}</td><td>${esc(s.cashier || '')}</td>
      <td style="white-space:nowrap"><button class="btn sm sec" data-v="${s.id}">عرض</button> <button class="btn sm danger" data-r="${s.id}">إرجاع</button></td></tr>`).join('')
      : '<tr><td class="empty" colspan="7">لا توجد فواتير</td></tr>';
    $('#rt').innerHTML = rets.length ? rets.map(r => `<tr><td>${r.id}</td><td>${r.sale_id}</td><td>${esc(r.customer)}</td><td>${esc(r.created_at)}</td>
      <td>${money(r.total)}</td><td>${money(r.debt_reduction)}</td><td>${money(r.cash_refund)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="7">لا توجد مرتجعات</td></tr>';
  });
  $('#go').onclick = load;
  el.onclick = guard(async e => {
    const { v, r } = e.target.dataset;
    if (v) showReceipt(v);
    if (r) {
      const st = await api(`/sales/${r}/returnable`);
      if (!st.items.some(i => i.returnable > 0)) throw new Error('تم إرجاع كل أصناف هذه الفاتورة');
      modal('إرجاع من فاتورة #' + r, `<table><thead><tr><th>الصنف</th><th>السعر</th><th>المتاح</th><th>كمية الإرجاع</th></tr></thead><tbody>
        ${st.items.map(i => `<tr><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${num(i.returnable)}</td>
        <td><input name="q${i.id}" type="number" min="0" max="${i.returnable}" step="any" value="0" ${i.returnable > 0 ? '' : 'disabled'} style="width:80px"></td></tr>`).join('')}</tbody></table>
        <p style="color:#64748b;font-size:13px">إذا كانت الفاتورة آجلة، يُخصم المبلغ من دين العميل أولاً والباقي يُرجع نقداً.</p>`,
        async d => {
          const items = st.items.map(i => ({ sale_item_id: i.id, qty: Number(d['q' + i.id] || 0) })).filter(i => i.qty > 0);
          const res = await api('/returns', 'POST', { sale_id: Number(r), items });
          toast(`تم الإرجاع: ${money(res.total)} (من الدين ${money(res.debt_reduction)} / نقداً ${money(res.cash_refund)})`);
          load();
        }, 'تأكيد الإرجاع');
    }
  });
  await load();
}

// ---------- expenses ----------
async function pgExpenses(el) {
  const today = new Date().toLocaleDateString('sv');
  el.innerHTML = `<div class="toolbar"><div><label>من</label><input type="date" id="from" value="${today.slice(0, 8)}01"></div>
    <div><label>إلى</label><input type="date" id="to" value="${today}"></div><button class="btn" id="go" style="align-self:end">عرض</button>
    <span style="flex:1"></span><button class="btn" id="add" style="align-self:end">+ مصروف جديد</button></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>#</th><th>البيان</th><th>التصنيف</th><th>التاريخ</th><th>المبلغ</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const load = guard(async () => {
    const d = await api(`/expenses?from=${$('#from').value}&to=${$('#to').value}`);
    $('#tb').innerHTML = (d.rows.length ? d.rows.map(r => `<tr><td>${r.id}</td><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td>${esc(r.created_at)}</td><td>${money(r.amount)}</td>
      <td>${state.user.role === 'admin' ? `<button class="btn sm danger" data-d="${r.id}">حذف</button>` : ''}</td></tr>`).join('')
      + `<tr><td colspan="4"><b>الإجمالي</b></td><td colspan="2"><b>${money(d.total)}</b></td></tr>`
      : '<tr><td class="empty" colspan="6">لا توجد مصاريف</td></tr>');
  });
  $('#go').onclick = load;
  $('#add').onclick = () => modal('مصروف جديد', `<div class="field"><label>البيان</label><input name="title" required></div>
    <div class="row"><div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" min="0.01" required></div>
    <div class="field"><label>التصنيف</label><input name="category" list="ecat"><datalist id="ecat"><option>إيجار<option>كهرباء<option>رواتب<option>نقل<option>أخرى</datalist></div></div>`,
    async d => { await api('/expenses', 'POST', d); toast('تمت الإضافة'); load(); });
  $('#tb').onclick = e => { const id = e.target.dataset.d; if (id) confirmBox('حذف هذا المصروف؟', async () => { await api('/expenses/' + id, 'DELETE'); toast('تم الحذف'); load(); }); };
  await load();
}

// ---------- suppliers ----------
async function pgSuppliers(el) {
  el.innerHTML = `<div class="toolbar"><button class="btn" id="add">+ مورد جديد</button></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>المستحق له</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const form = c => `<div class="field"><label>الاسم</label><input name="name" value="${esc(c.name)}" required></div>
    <div class="field"><label>الهاتف</label><input name="phone" value="${esc(c.phone)}"></div><div class="field"><label>العنوان</label><input name="address" value="${esc(c.address)}"></div>`;
  let list = [];
  const load = guard(async () => {
    list = await api('/suppliers');
    $('#tb').innerHTML = list.length ? list.map(c => `<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td>
      <td>${c.balance > 0.001 ? `<span class="badge red">${money(c.balance)}</span>` : '<span class="badge green">لا يوجد</span>'}</td>
      <td style="white-space:nowrap">${c.balance > 0.001 ? `<button class="btn sm ok" data-p="${c.id}">تسديد</button> ` : ''}<button class="btn sm sec" data-s="${c.id}">كشف</button>
      <button class="btn sm sec" data-e="${c.id}">تعديل</button>${state.user.role === 'admin' ? ` <button class="btn sm danger" data-d="${c.id}">حذف</button>` : ''}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="6">لا يوجد موردين</td></tr>';
  });
  $('#add').onclick = () => modal('مورد جديد', form({}), async d => { await api('/suppliers', 'POST', d); toast('تمت الإضافة'); load(); });
  $('#tb').onclick = guard(async e => {
    const { e: ed, d: del, s, p } = e.target.dataset;
    if (ed) { const c = list.find(x => x.id == ed); modal('تعديل مورد', form(c), async d => { await api('/suppliers/' + ed, 'PUT', d); toast('تم الحفظ'); load(); }); }
    if (del) confirmBox('حذف هذا المورد؟', async () => { await api('/suppliers/' + del, 'DELETE'); toast('تم الحذف'); load(); });
    if (s) {
      const d = await api(`/suppliers/${s}/statement`);
      modal('كشف حساب: ' + d.supplier.name, `<p>المستحق: <b>${money(d.supplier.balance)}</b></p><h4>فواتير الشراء</h4>
        <table><thead><tr><th>#</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th></tr></thead><tbody>${d.purchases.map(x => `<tr><td>${x.id}</td><td>${esc(x.created_at)}</td><td>${money(x.total)}</td><td>${money(x.paid)}</td></tr>`).join('') || '<tr><td class="empty" colspan="4">لا يوجد</td></tr>'}</tbody></table>
        <h4>الدفعات</h4><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th></tr></thead><tbody>${d.payments.map(x => `<tr><td>${esc(x.created_at)}</td><td>${money(x.amount)}</td><td>${esc(x.note)}</td></tr>`).join('') || '<tr><td class="empty" colspan="3">لا يوجد</td></tr>'}</tbody></table>`, async () => { }, 'إغلاق');
    }
    if (p) {
      const c = list.find(x => x.id == p);
      modal('تسديد للمورد - ' + c.name, `<p>المستحق: <b>${money(c.balance)}</b></p><div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" min="0.01" max="${c.balance}" value="${c.balance}" required></div>
        <div class="field"><label>ملاحظة</label><input name="note"></div>`, async d => { await api(`/suppliers/${p}/payments`, 'POST', d); toast('تم تسجيل الدفعة'); load(); });
    }
  });
  await load();
}

// ---------- purchases ----------
async function pgPurchases(el) {
  const [products, suppliers, list] = await Promise.all([api('/products'), api('/suppliers'), api('/purchases')]);
  let lines = [];
  el.innerHTML = `<div class="toolbar"><button class="btn" id="new">+ فاتورة شراء جديدة</button></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>#</th><th>المورد</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td>${p.id}</td><td>${esc(p.supplier)}</td><td>${esc(p.created_at)}</td><td>${money(p.total)}</td><td>${p.paid < p.total ? `<span class="badge amber">${money(p.paid)}</span>` : money(p.paid)}</td>
    <td><button class="btn sm sec" data-v="${p.id}">عرض</button></td></tr>`).join('') || '<tr><td class="empty" colspan="6">لا توجد فواتير شراء</td></tr>'}</tbody></table></div></div>`;
  el.onclick = guard(async e => {
    const v = e.target.dataset.v; if (!v) return;
    const p = await api('/purchases/' + v);
    modal(`فاتورة شراء #${p.id} - ${p.supplier}`, `<table><thead><tr><th>الصنف</th><th>الكمية</th><th>التكلفة</th><th>المجموع</th></tr></thead><tbody>
      ${p.items.map(i => `<tr><td>${esc(i.name)}</td><td>${num(i.qty)}</td><td>${money(i.cost)}</td><td>${money(i.qty * i.cost)}</td></tr>`).join('')}</tbody></table>
      <p>الإجمالي: <b>${money(p.total)}</b> — المدفوع: <b>${money(p.paid)}</b></p>`, async () => { }, 'إغلاق');
  });
  $('#new').onclick = () => {
    if (!suppliers.length) return toast('أضف مورداً أولاً من شاشة الموردين', true);
    if (!products.length) return toast('أضف منتجات أولاً', true);
    lines = [{ product_id: products[0].id, qty: 1, cost: products[0].cost }];
    const close = modal('فاتورة شراء جديدة', `
      <div class="field"><label>المورد</label><select name="supplier_id">${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div id="pl"></div><button type="button" class="btn sec sm" id="addl">+ صنف</button>
      <div class="field" style="margin-top:12px"><label>المدفوع (اتركه فارغاً للدفع الكامل)</label><input name="paid" type="number" step="0.01" min="0"></div>
      <p>الإجمالي: <b id="pt"></b></p>`, async d => {
      const r = await api('/purchases', 'POST', { supplier_id: Number(d.supplier_id), items: lines, paid: d.paid === '' ? null : Number(d.paid) });
      toast(`تم حفظ الفاتورة، المتبقي للمورد ${money(r.balance)}`); render();
    }, 'حفظ وإضافة للمخزون');
    const drawL = () => {
      $('#pl').innerHTML = lines.map((l, i) => `<div class="cart-line"><select data-p="${i}" style="flex:2">${products.map(p => `<option value="${p.id}" ${p.id === l.product_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <input type="number" min="0.001" step="any" value="${l.qty}" data-q="${i}" title="الكمية"><input type="number" min="0" step="0.01" value="${l.cost}" data-c="${i}" title="التكلفة"><button type="button" class="btn sm danger" data-r="${i}">×</button></div>`).join('');
      $('#pt').textContent = money(lines.reduce((a, l) => a + l.qty * l.cost, 0));
    };
    const pl = $('#pl');
    pl.onchange = e => {
      const t = e.target.dataset;
      if (t.p != null) { const pr = products.find(x => x.id == e.target.value); lines[t.p].product_id = pr.id; lines[t.p].cost = pr.cost; }
      if (t.q != null) lines[t.q].qty = Number(e.target.value) || 0;
      if (t.c != null) lines[t.c].cost = Number(e.target.value) || 0;
      drawL();
    };
    pl.onclick = e => { const i = e.target.dataset.r; if (i != null && lines.length > 1) { lines.splice(i, 1); drawL(); } };
    $('#addl').onclick = () => { lines.push({ product_id: products[0].id, qty: 1, cost: products[0].cost }); drawL(); };
    drawL();
  };
}

// ---------- settings ----------
async function pgSettings(el) {
  const s = await api('/settings');
  const admin = state.user.role === 'admin';
  el.innerHTML = `<div class="panel"><div class="body"><form id="sf" style="max-width:520px">
    <div class="field"><label>اسم المتجر</label><input name="store_name" value="${esc(s.store_name)}" ${admin ? '' : 'disabled'}></div>
    <div class="row"><div class="field"><label>العملة</label><input name="currency" value="${esc(s.currency)}" ${admin ? '' : 'disabled'}></div>
    <div class="field"><label>حد تنبيه المخزون الافتراضي</label><input name="low_stock_default" type="number" min="0" value="${esc(s.low_stock_default)}" ${admin ? '' : 'disabled'}></div></div>
    <div class="field"><label>تنبيه انتهاء الصلاحية قبل (أيام)</label><input name="expiry_days" type="number" min="0" value="${esc(s.expiry_days)}" ${admin ? '' : 'disabled'}></div>
    <div class="field"><label>نص أسفل الفاتورة</label><input name="receipt_footer" value="${esc(s.receipt_footer)}" ${admin ? '' : 'disabled'}></div>
    ${admin ? '<button class="btn">حفظ</button>' : '<p style="color:#64748b">التعديل للمدير فقط</p>'}</form></div></div>`;
  $('#sf').onsubmit = guard(async e => {
    e.preventDefault();
    state.settings = await api('/settings', 'PUT', Object.fromEntries(new FormData(e.target)));
    toast('تم حفظ الإعدادات'); render();
  });
}

// ---------- users ----------
async function pgUsers(el) {
  const list = await api('/users');
  el.innerHTML = `<div class="toolbar"><button class="btn" id="add">+ مستخدم جديد</button></div>
    <div class="panel"><div class="tablewrap"><table><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${list.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.role === 'admin' ? 'مدير' : 'كاشير'}</td>
    <td><span class="badge ${u.active ? 'green' : 'red'}">${u.active ? 'فعال' : 'معطل'}</span></td>
    <td><button class="btn sm sec" data-e="${u.id}">تعديل</button></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#add').onclick = () => modal('مستخدم جديد', `
    <div class="field"><label>الاسم</label><input name="name" required></div>
    <div class="field"><label>اسم المستخدم</label><input name="username" required></div>
    <div class="field"><label>كلمة المرور (6 أحرف على الأقل)</label><input name="password" type="password" minlength="6" required></div>
    <div class="field"><label>الصلاحية</label><select name="role"><option value="cashier">كاشير</option><option value="admin">مدير</option></select></div>`,
    async d => { await api('/users', 'POST', d); toast('تمت الإضافة'); render(); });
  el.onclick = e => {
    const id = e.target.dataset.e; if (!id) return;
    const u = list.find(x => x.id == id);
    modal('تعديل: ' + u.username, `
      <div class="field"><label>الاسم</label><input name="name" value="${esc(u.name)}" required></div>
      <div class="field"><label>الصلاحية</label><select name="role"><option value="cashier" ${u.role === 'cashier' ? 'selected' : ''}>كاشير</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير</option></select></div>
      <div class="field"><label>الحالة</label><select name="active"><option value="1" ${u.active ? 'selected' : ''}>فعال</option><option value="0" ${!u.active ? 'selected' : ''}>معطل</option></select></div>
      <div class="field"><label>كلمة مرور جديدة (اتركها فارغة بدون تغيير)</label><input name="password" type="password"></div>`,
      async d => {
        const body = { name: d.name, role: d.role, active: Number(d.active) };
        if (d.password) body.password = d.password;
        await api('/users/' + id, 'PUT', body); toast('تم الحفظ'); render();
      });
  };
}

render();
