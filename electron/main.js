// Desktop shell of RailRunner: the same web/ files in an Electron window.
//
// RR_TEST=1 - test mode: the window is never shown, cannot take focus and sits off screen;
// pointer lock and every other permission are refused. Tests drive it through Playwright
// without a single visible window on the user's screen.
'use strict';
const { app, BrowserWindow, Menu, screen, session } = require('electron');
const path = require('path');
const WindowState = require('./window-state');

const TEST = process.env.RR_TEST === '1';
const SIZE = { width: 1280, height: 760, minWidth: 360, minHeight: 480 };
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
let win = null;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(WindowState.load(stateFile()), areas, SIZE);
  win = new BrowserWindow({
    ...(TEST ? { x: -20000, y: -20000 } : placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width,
    height: placed.height,
    minWidth: SIZE.minWidth,
    minHeight: SIZE.minHeight,
    title: 'Бег по рельсам',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    backgroundColor: '#0d1430',
    show: false,
    focusable: !TEST,
    skipTaskbar: TEST,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  if (!TEST) {
    if (placed.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
  }
  const remember = () => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen() && !TEST) WindowState.save(stateFile(), WindowState.capture(win)); };
  for (const event of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(event, remember);
  win.on('close', () => { if (win && !TEST && !win.isFullScreen()) WindowState.save(stateFile(), WindowState.capture(win)); });
  win.on('closed', () => { win = null; });
  // F11 - full screen; links never open inside the app; the page cannot be navigated away
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => {
    if (!win || TEST) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    // The game needs no permissions at all: pointer lock, camera, notifications - all refused.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
