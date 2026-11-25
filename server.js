const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  barcode TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  qty REAL NOT NULL DEFAULT 0,
  min_qty REAL NOT NULL DEFAULT 5,
  expiry_date TEXT DEFAULT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sales(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER REFERENCES users(id),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  paid REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sale_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  cost REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS debt_payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount REAL NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT '',
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS returns(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  user_id INTEGER REFERENCES users(id),
  total REAL NOT NULL,
  debt_reduction REAL NOT NULL DEFAULT 0,
  cash_refund REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS return_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  refund REAL NOT NULL,
  cost REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS suppliers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS purchases(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  user_id INTEGER REFERENCES users(id),
  total REAL NOT NULL,
  paid REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS purchase_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  cost REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  amount REAL NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

// ---------- helpers ----------
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function checkPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(h, 'hex'));
}
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// seed
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)')
    .run('admin', 'المدير', hashPassword('admin123'), 'admin');
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  ins.run('store_name', 'حلا السلطان');
  ins.run('currency', '₪');
  ins.run('low_stock_default', '5');
  ins.run('expiry_days', '30');
  ins.run('receipt_footer', 'شكراً لزيارتكم');
}
const getSettings = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '1mb' }));

const sessions = new Map(); // token -> user
const SESSION_MS = 1000 * 60 * 60 * 12;

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(String(username || ''));
  if (!u || !checkPassword(String(password || ''), u.password_hash))
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  const token = crypto.randomBytes(32).toString('hex');
  const user = { id: u.id, username: u.username, name: u.name, role: u.role };
  sessions.set(token, { user, exp: Date.now() + SESSION_MS });
  res.json({ token, user });
});

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { sessions.delete(t); return res.status(401).json({ error: 'انتهت الجلسة' }); }
  req.user = s.user; req.token = t;
  next();
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'غير مصرح' });

app.post('/api/logout', auth, (req, res) => { sessions.delete(req.token); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ user: req.user, settings: getSettings() }));

const wrap = fn => (req, res) => {
  try { fn(req, res); }
  catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطأ في الخادم' });
  }
};
const bad = msg => Object.assign(new Error(msg), { status: 400 });

// ---------- dashboard ----------
app.get('/api/dashboard', auth, wrap((req, res) => {
  const s = getSettings();
  const expDays = Number(s.expiry_days || 30);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const today = "date(created_at)=date('now','localtime')";
  const out = {
    total_products: one('SELECT COUNT(*) c FROM products WHERE active=1').c,
    sales_today: round2(one(`SELECT COALESCE(SUM(total),0) v FROM sales WHERE ${today}`).v
      - one("SELECT COALESCE(SUM(total),0) v FROM returns WHERE date(created_at)=date('now','localtime')").v),
    invoices_today: one(`SELECT COUNT(*) c FROM sales WHERE ${today}`).c,
    total_customers: one('SELECT COUNT(*) c FROM customers').c,
    low_stock_count: one('SELECT COUNT(*) c FROM products WHERE active=1 AND qty<=min_qty').c,
    expiring_count: one(
      `SELECT COUNT(*) c FROM products WHERE active=1 AND expiry_date IS NOT NULL AND expiry_date<>''
       AND date(expiry_date)<=date('now','localtime','+${expDays} day')`).c,
    total_invoices: one('SELECT COUNT(*) c FROM sales').c,
    total_revenue: one('SELECT COALESCE(SUM(total),0) v FROM sales').v,
    debts_total: 0, debts_count: 0,
    low_stock: db.prepare('SELECT id,name,category,qty FROM products WHERE active=1 AND qty<=min_qty ORDER BY qty LIMIT 8').all(),
    recent_sales: db.prepare(
      `SELECT s.id,s.total,s.created_at,COALESCE(c.name,'زبون نقدي') customer
       FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.id DESC LIMIT 8`).all(),
  };
  const d = customerDebts();
  out.debts_total = round2(d.reduce((a, x) => a + x.debt, 0));
  out.debts_count = d.filter(x => x.debt > 0.001).length;
  res.json(out);
}));

// ---------- products ----------
app.get('/api/products', auth, wrap((req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare(
    `SELECT * FROM products WHERE active=1 AND (name LIKE ? OR barcode LIKE ? OR category LIKE ?) ORDER BY name`
  ).all(q, q, q));
}));
function productBody(b) {
  const name = String(b.name || '').trim();
  if (!name) throw bad('اسم المنتج مطلوب');
  const num = (v, d = 0) => { const n = Number(v ?? d); if (!isFinite(n) || n < 0) throw bad('قيمة رقمية غير صحيحة'); return n; };
  return [name, String(b.category || ''), String(b.barcode || ''), num(b.price), num(b.cost), num(b.qty), num(b.min_qty, 5), b.expiry_date || null];
}
app.post('/api/products', auth, wrap((req, res) => {
  const r = db.prepare('INSERT INTO products(name,category,barcode,price,cost,qty,min_qty,expiry_date) VALUES(?,?,?,?,?,?,?,?)').run(...productBody(req.body));
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.put('/api/products/:id', auth, wrap((req, res) => {
  db.prepare('UPDATE products SET name=?,category=?,barcode=?,price=?,cost=?,qty=?,min_qty=?,expiry_date=? WHERE id=?')
    .run(...productBody(req.body), req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/products/:id', auth, adminOnly, wrap((req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id); // soft delete keeps sale history
  res.json({ ok: true });
}));

// ---------- customers & debts ----------
function customerDebts(id) {
  const rows = db.prepare(
    `SELECT c.id,c.name,c.phone,c.address,
       COALESCE((SELECT SUM(total-paid) FROM sales WHERE customer_id=c.id),0) AS owed,
       COALESCE((SELECT SUM(amount) FROM debt_payments WHERE customer_id=c.id),0)
       + COALESCE((SELECT SUM(r.debt_reduction) FROM returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=c.id),0) AS repaid
     FROM customers c ${id ? 'WHERE c.id=?' : ''} ORDER BY c.name`
  ).all(...(id ? [id] : []));
  return rows.map(r => ({ ...r, debt: round2(r.owed - r.repaid) }));
}
app.get('/api/customers', auth, wrap((req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  res.json(customerDebts().filter(c => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q)));
}));
app.post('/api/customers', auth, wrap((req, res) => {
  const { name, phone = '', address = '' } = req.body || {};
  if (!String(name || '').trim()) throw bad('اسم العميل مطلوب');
  const r = db.prepare('INSERT INTO customers(name,phone,address) VALUES(?,?,?)').run(name.trim(), phone, address);
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.put('/api/customers/:id', auth, wrap((req, res) => {
  const { name, phone = '', address = '' } = req.body || {};
  if (!String(name || '').trim()) throw bad('اسم العميل مطلوب');
  db.prepare('UPDATE customers SET name=?,phone=?,address=? WHERE id=?').run(name.trim(), phone, address, req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/customers/:id', auth, adminOnly, wrap((req, res) => {
  const [c] = customerDebts(req.params.id);
  if (c && c.debt > 0.001) throw bad('لا يمكن حذف عميل عليه دين');
  tx(() => {
    db.prepare('UPDATE sales SET customer_id=NULL WHERE customer_id=?').run(req.params.id);
    db.prepare('DELETE FROM debt_payments WHERE customer_id=?').run(req.params.id);
    db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  });
  res.json({ ok: true });
}));

app.get('/api/debts', auth, wrap((req, res) => {
  res.json(customerDebts().filter(c => c.debt > 0.001).sort((a, b) => b.debt - a.debt));
}));
app.get('/api/customers/:id/statement', auth, wrap((req, res) => {
  const [c] = customerDebts(req.params.id);
  if (!c) throw Object.assign(new Error('غير موجود'), { status: 404 });
  const sales = db.prepare('SELECT id,total,paid,created_at FROM sales WHERE customer_id=? ORDER BY id DESC').all(req.params.id);
  const payments = db.prepare('SELECT id,amount,note,created_at FROM debt_payments WHERE customer_id=? ORDER BY id DESC').all(req.params.id);
  res.json({ customer: c, sales, payments });
}));
app.post('/api/customers/:id/payments', auth, wrap((req, res) => {
  const amount = round2(req.body.amount);
  if (!(amount > 0)) throw bad('المبلغ غير صحيح');
  const [c] = customerDebts(req.params.id);
  if (!c) throw bad('العميل غير موجود');
  if (amount > c.debt + 0.001) throw bad(`المبلغ أكبر من الدين (${c.debt})`);
  db.prepare('INSERT INTO debt_payments(customer_id,amount,note) VALUES(?,?,?)').run(req.params.id, amount, String(req.body.note || ''));
  res.json({ ok: true, remaining: round2(c.debt - amount) });
}));

// ---------- sales ----------
app.post('/api/sales', auth, wrap((req, res) => {
  const { items, customer_id = null, discount = 0, paid } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw bad('السلة فارغة');
  const result = tx(() => {
    let subtotal = 0;
    const lines = items.map(it => {
      const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.product_id);
      const qty = Number(it.qty);
      if (!p) throw bad('منتج غير موجود');
      if (!(qty > 0)) throw bad('كمية غير صحيحة');
      if (p.qty < qty) throw bad(`الكمية غير كافية للمنتج: ${p.name} (المتوفر ${p.qty})`);
      const price = it.price != null ? Number(it.price) : p.price;
      if (!(price >= 0)) throw bad('سعر غير صحيح');
      subtotal += price * qty;
      return { p, qty, price };
    });
    subtotal = round2(subtotal);
    const disc = round2(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
    const total = round2(subtotal - disc);
    const paidAmt = paid == null || paid === '' ? total : round2(Math.min(Math.max(Number(paid), 0), total));
    if (paidAmt < total && !customer_id) throw bad('البيع بالدين يتطلب اختيار عميل');
    const sale = db.prepare('INSERT INTO sales(customer_id,user_id,subtotal,discount,total,paid) VALUES(?,?,?,?,?,?)')
      .run(customer_id || null, req.user.id, subtotal, disc, total, paidAmt);
    const sid = Number(sale.lastInsertRowid);
    for (const l of lines) {
      db.prepare('INSERT INTO sale_items(sale_id,product_id,name,qty,price,cost) VALUES(?,?,?,?,?,?)')
        .run(sid, l.p.id, l.p.name, l.qty, l.price, l.p.cost);
      db.prepare('UPDATE products SET qty=qty-? WHERE id=?').run(l.qty, l.p.id);
    }
    return { id: sid, subtotal, discount: disc, total, paid: paidAmt, debt: round2(total - paidAmt) };
  });
  res.json(result);
}));
app.get('/api/sales', auth, wrap((req, res) => {
  const { from, to } = req.query;
  res.json(db.prepare(
    `SELECT s.*,COALESCE(c.name,'زبون نقدي') customer,u.name cashier FROM sales s
     LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.user_id
     WHERE (? IS NULL OR date(s.created_at)>=date(?)) AND (? IS NULL OR date(s.created_at)<=date(?))
     ORDER BY s.id DESC LIMIT 500`
  ).all(from || null, from || null, to || null, to || null));
}));
app.get('/api/sales/:id', auth, wrap((req, res) => {
  const sale = db.prepare(
    `SELECT s.*,COALESCE(c.name,'زبون نقدي') customer FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?`
  ).get(req.params.id);
  if (!sale) throw Object.assign(new Error('غير موجود'), { status: 404 });
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(req.params.id);
  res.json(sale);
}));

// ---------- reports ----------
app.get('/api/reports', auth, wrap((req, res) => {
  const today = new Date().toLocaleDateString('sv');
  const from = req.query.from || today.slice(0, 8) + '01';
  const to = req.query.to || today;
  const range = 'date(s.created_at)>=date(?) AND date(s.created_at)<=date(?)';
  const summary = db.prepare(
    `SELECT COUNT(*) invoices,COALESCE(SUM(total),0) revenue,COALESCE(SUM(discount),0) discounts,COALESCE(SUM(total-paid),0) credit
     FROM sales s WHERE ${range}`).get(from, to);
  const profit = db.prepare(
    `SELECT COALESCE(SUM((i.price-i.cost)*i.qty),0) v FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${range}`).get(from, to).v;
  const daily = db.prepare(
    `SELECT date(created_at) day,COUNT(*) invoices,SUM(total) total FROM sales s WHERE ${range} GROUP BY day ORDER BY day`).all(from, to);
  const top = db.prepare(
    `SELECT i.name,SUM(i.qty) qty,SUM(i.qty*i.price) total FROM sale_items i JOIN sales s ON s.id=i.sale_id
     WHERE ${range} GROUP BY i.name ORDER BY total DESC LIMIT 10`).all(from, to);
  const collected = db.prepare(
    'SELECT COALESCE(SUM(amount),0) v FROM debt_payments WHERE date(created_at)>=date(?) AND date(created_at)<=date(?)').get(from, to).v;
  const stock = db.prepare('SELECT COALESCE(SUM(qty*cost),0) cost_value,COALESCE(SUM(qty*price),0) sale_value FROM products WHERE active=1').get();
  const rr = db.prepare(
    `SELECT COALESCE(SUM(r.total),0) total,COALESCE(SUM(ri.refund-ri.cost*ri.qty),0) profit_lost FROM returns r
     LEFT JOIN return_items ri ON ri.return_id=r.id WHERE date(r.created_at)>=date(?) AND date(r.created_at)<=date(?)`).get(from, to);
  const exp = db.prepare('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE date(created_at)>=date(?) AND date(created_at)<=date(?)').get(from, to).v;
  const gross = round2(profit - summary.discounts - rr.profit_lost);
  const payables = round2(supplierBalances().reduce((a, x) => a + x.balance, 0));
  res.json({ from, to, summary: { ...summary, returns: round2(rr.total), net_sales: round2(summary.revenue - rr.total),
    gross_profit: gross, expenses: round2(exp), profit: round2(gross - exp), debt_collected: collected, payables }, daily, top, stock });
}));

// ---------- returns ----------
function saleReturnState(saleId) {
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(saleId);
  if (!sale) return null;
  const items = db.prepare(
    `SELECT i.*,COALESCE((SELECT SUM(qty) FROM return_items WHERE sale_item_id=i.id),0) returned
     FROM sale_items i WHERE i.sale_id=?`).all(saleId);
  const reduced = db.prepare('SELECT COALESCE(SUM(debt_reduction),0) v FROM returns WHERE sale_id=?').get(saleId).v;
  return { sale, items: items.map(i => ({ ...i, returnable: round2(i.qty - i.returned) })), reduced };
}
app.get('/api/sales/:id/returnable', auth, wrap((req, res) => {
  const st = saleReturnState(req.params.id);
  if (!st) throw Object.assign(new Error('غير موجود'), { status: 404 });
  res.json(st);
}));
app.post('/api/returns', auth, wrap((req, res) => {
  const { sale_id, items } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw bad('اختر أصنافاً للإرجاع');
  const out = tx(() => {
    const st = saleReturnState(sale_id);
    if (!st) throw bad('الفاتورة غير موجودة');
    const { sale } = st;
    const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1; // spread the invoice discount proportionally
    let total = 0;
    const lines = [];
    for (const it of items) {
      const qty = Number(it.qty);
      if (!(qty > 0)) continue;
      const line = st.items.find(x => x.id === Number(it.sale_item_id));
      if (!line) throw bad('صنف غير موجود في الفاتورة');
      if (qty > line.returnable + 1e-9) throw bad(`الكمية أكبر من المتاح للإرجاع: ${line.name} (${line.returnable})`);
      const refund = round2(line.price * qty * ratio);
      total += refund;
      lines.push({ line, qty, refund });
    }
    if (!lines.length) throw bad('اختر كميات للإرجاع');
    total = round2(total);
    const outstanding = Math.max(0, round2(sale.total - sale.paid - st.reduced));
    const debtRed = sale.customer_id ? round2(Math.min(total, outstanding)) : 0;
    const cash = round2(total - debtRed);
    const r = db.prepare('INSERT INTO returns(sale_id,user_id,total,debt_reduction,cash_refund) VALUES(?,?,?,?,?)')
      .run(sale.id, req.user.id, total, debtRed, cash);
    const rid = Number(r.lastInsertRowid);
    for (const l of lines) {
      db.prepare('INSERT INTO return_items(return_id,sale_item_id,product_id,name,qty,refund,cost) VALUES(?,?,?,?,?,?,?)')
        .run(rid, l.line.id, l.line.product_id, l.line.name, l.qty, l.refund, l.line.cost);
      if (l.line.product_id) db.prepare('UPDATE products SET qty=qty+? WHERE id=?').run(l.qty, l.line.product_id);
    }
    return { id: rid, total, debt_reduction: debtRed, cash_refund: cash };
  });
  res.json(out);
}));
app.get('/api/returns', auth, wrap((req, res) => {
  res.json(db.prepare(
    `SELECT r.*,COALESCE(c.name,'زبون نقدي') customer FROM returns r JOIN sales s ON s.id=r.sale_id
     LEFT JOIN customers c ON c.id=s.customer_id ORDER BY r.id DESC LIMIT 300`).all());
}));

// ---------- expenses ----------
app.get('/api/expenses', auth, wrap((req, res) => {
  const { from, to } = req.query;
  const rows = db.prepare(
    `SELECT * FROM expenses WHERE (? IS NULL OR date(created_at)>=date(?)) AND (? IS NULL OR date(created_at)<=date(?))
     ORDER BY id DESC LIMIT 500`).all(from || null, from || null, to || null, to || null);
  res.json({ rows, total: round2(rows.reduce((a, r) => a + r.amount, 0)) });
}));
app.post('/api/expenses', auth, wrap((req, res) => {
  const title = String(req.body.title || '').trim();
  const amount = round2(req.body.amount);
  if (!title) throw bad('البيان مطلوب');
  if (!(amount > 0)) throw bad('المبلغ غير صحيح');
  const r = db.prepare('INSERT INTO expenses(title,category,amount) VALUES(?,?,?)').run(title, String(req.body.category || ''), amount);
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.delete('/api/expenses/:id', auth, adminOnly, wrap((req, res) => {
  db.prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- suppliers & purchases ----------
function supplierBalances(id) {
  const rows = db.prepare(
    `SELECT s.id,s.name,s.phone,s.address,
       COALESCE((SELECT SUM(total-paid) FROM purchases WHERE supplier_id=s.id),0) AS owed,
       COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id=s.id),0) AS repaid
     FROM suppliers s ${id ? 'WHERE s.id=?' : ''} ORDER BY s.name`).all(...(id ? [id] : []));
  return rows.map(r => ({ ...r, balance: round2(r.owed - r.repaid) }));
}
app.get('/api/suppliers', auth, wrap((req, res) => res.json(supplierBalances())));
app.post('/api/suppliers', auth, wrap((req, res) => {
  const { name, phone = '', address = '' } = req.body || {};
  if (!String(name || '').trim()) throw bad('اسم المورد مطلوب');
  const r = db.prepare('INSERT INTO suppliers(name,phone,address) VALUES(?,?,?)').run(name.trim(), phone, address);
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.put('/api/suppliers/:id', auth, wrap((req, res) => {
  const { name, phone = '', address = '' } = req.body || {};
  if (!String(name || '').trim()) throw bad('اسم المورد مطلوب');
  db.prepare('UPDATE suppliers SET name=?,phone=?,address=? WHERE id=?').run(name.trim(), phone, address, req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/suppliers/:id', auth, adminOnly, wrap((req, res) => {
  const used = db.prepare('SELECT 1 FROM purchases WHERE supplier_id=? LIMIT 1').get(req.params.id);
  if (used) throw bad('لا يمكن حذف مورد لديه فواتير شراء');
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));
app.get('/api/suppliers/:id/statement', auth, wrap((req, res) => {
  const [s] = supplierBalances(req.params.id);
  if (!s) throw Object.assign(new Error('غير موجود'), { status: 404 });
  res.json({
    supplier: s,
    purchases: db.prepare('SELECT id,total,paid,created_at FROM purchases WHERE supplier_id=? ORDER BY id DESC').all(req.params.id),
    payments: db.prepare('SELECT id,amount,note,created_at FROM supplier_payments WHERE supplier_id=? ORDER BY id DESC').all(req.params.id),
  });
}));
app.post('/api/suppliers/:id/payments', auth, wrap((req, res) => {
  const amount = round2(req.body.amount);
  const [s] = supplierBalances(req.params.id);
  if (!s) throw bad('المورد غير موجود');
  if (!(amount > 0)) throw bad('المبلغ غير صحيح');
  if (amount > s.balance + 0.001) throw bad(`المبلغ أكبر من المستحق (${s.balance})`);
  db.prepare('INSERT INTO supplier_payments(supplier_id,amount,note) VALUES(?,?,?)').run(req.params.id, amount, String(req.body.note || ''));
  res.json({ ok: true, remaining: round2(s.balance - amount) });
}));
app.post('/api/purchases', auth, wrap((req, res) => {
  const { supplier_id, items, paid } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw bad('أضف أصنافاً للفاتورة');
  const out = tx(() => {
    if (!db.prepare('SELECT 1 FROM suppliers WHERE id=?').get(supplier_id)) throw bad('اختر المورد');
    let total = 0;
    const lines = items.map(it => {
      const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.product_id);
      const qty = Number(it.qty), cost = Number(it.cost);
      if (!p) throw bad('منتج غير موجود');
      if (!(qty > 0) || !(cost >= 0)) throw bad('كمية أو تكلفة غير صحيحة');
      total += qty * cost;
      return { p, qty, cost };
    });
    total = round2(total);
    const paidAmt = paid == null || paid === '' ? total : round2(Math.min(Math.max(Number(paid), 0), total));
    const r = db.prepare('INSERT INTO purchases(supplier_id,user_id,total,paid) VALUES(?,?,?,?)').run(supplier_id, req.user.id, total, paidAmt);
    const pid = Number(r.lastInsertRowid);
    for (const l of lines) {
      db.prepare('INSERT INTO purchase_items(purchase_id,product_id,name,qty,cost) VALUES(?,?,?,?,?)').run(pid, l.p.id, l.p.name, l.qty, l.cost);
      db.prepare('UPDATE products SET qty=qty+?,cost=? WHERE id=?').run(l.qty, l.cost, l.p.id);
    }
    return { id: pid, total, paid: paidAmt, balance: round2(total - paidAmt) };
  });
  res.json(out);
}));
app.get('/api/purchases', auth, wrap((req, res) => {
  res.json(db.prepare(
    `SELECT p.*,s.name supplier FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC LIMIT 300`).all());
}));
app.get('/api/purchases/:id', auth, wrap((req, res) => {
  const p = db.prepare('SELECT p.*,s.name supplier FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?').get(req.params.id);
  if (!p) throw Object.assign(new Error('غير موجود'), { status: 404 });
  p.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(req.params.id);
  res.json(p);
}));

// ---------- settings ----------
app.get('/api/settings', auth, wrap((req, res) => res.json(getSettings())));
app.put('/api/settings', auth, adminOnly, wrap((req, res) => {
  const allowed = ['store_name', 'currency', 'low_stock_default', 'expiry_days', 'receipt_footer'];
  tx(() => {
    for (const k of allowed) if (k in req.body)
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(req.body[k]));
  });
  res.json(getSettings());
}));

// ---------- users ----------
app.get('/api/users', auth, adminOnly, wrap((req, res) => {
  res.json(db.prepare('SELECT id,username,name,role,active FROM users ORDER BY id').all());
}));
app.post('/api/users', auth, adminOnly, wrap((req, res) => {
  const { username, name, password, role = 'cashier' } = req.body || {};
  if (!username || !name || !password || String(password).length < 6) throw bad('أكمل البيانات (كلمة المرور 6 أحرف على الأقل)');
  if (!['admin', 'cashier'].includes(role)) throw bad('صلاحية غير صحيحة');
  try {
    const r = db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)').run(username.trim(), name.trim(), hashPassword(String(password)), role);
    res.json({ id: Number(r.lastInsertRowid) });
  } catch (e) { if (/UNIQUE/.test(e.message)) throw bad('اسم المستخدم موجود مسبقاً'); throw e; }
}));
app.put('/api/users/:id', auth, adminOnly, wrap((req, res) => {
  const { name, role, active, password } = req.body || {};
  const id = Number(req.params.id);
  if (id === req.user.id && (active === 0 || active === false || (role && role !== 'admin')))
    throw bad('لا يمكنك تعطيل حسابك أو تغيير صلاحيتك');
  tx(() => {
    if (name) db.prepare('UPDATE users SET name=? WHERE id=?').run(name, id);
    if (role) db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
    if (active != null) db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, id);
    if (password) {
      if (String(password).length < 6) throw bad('كلمة المرور قصيرة');
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(password)), id);
    }
  });
  for (const [t, s] of sessions) if (s.user.id === id && active === 0) sessions.delete(t);
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));
app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}  (admin / admin123)`));
}
module.exports = app;
