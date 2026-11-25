// Electron wrapper: runs the same Express server locally and shows it in a desktop window.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
async function boot() {
  process.env.DB_FILE = path.join(app.getPath('userData'), 'data.db'); // survives app updates
  const server = require('./server.js');
  const http = await new Promise(res => { const s = server.listen(0, '127.0.0.1', () => res(s)); });
  const url = `http://127.0.0.1:${http.address().port}/`;
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1366, height: 800, minWidth: 900, minHeight: 600, autoHideMenuBar: true, title: 'نظام المحاسبة', icon: path.join(__dirname, 'public', 'icon.png') });
  win.loadURL(url);
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith(url) || u === 'about:blank') return { action: 'allow' }; // receipt print window
    shell.openExternal(u); return { action: 'deny' };
  });
  win.on('closed', () => { http.close(); app.quit(); });
}
app.whenReady().then(boot);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
