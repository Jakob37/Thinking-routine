const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEXT_EXTENSIONS = new Set(['.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.ts', '.yaml', '.yml']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const SETTINGS_PATH = path.join(__dirname, '.thinking-routine.json');
let selectedRoot = null;
let landingDocument = null;
let pomodoroHistory = [];
let activePomodoro = null;

function isInsideSelectedRoot(candidatePath) {
  if (!selectedRoot) return false;
  const relativePath = path.relative(selectedRoot, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..' + path.sep) && relativePath !== '..' && !path.isAbsolute(relativePath));
}

async function resolveSafePath(candidatePath) {
  if (typeof candidatePath !== 'string' || !selectedRoot) throw new Error('Choose a folder first.');
  const resolvedPath = await fs.realpath(candidatePath);
  if (!isInsideSelectedRoot(resolvedPath)) throw new Error('That path is outside the selected folder.');
  return resolvedPath;
}

function isTextDocument(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function saveSettings() {
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify({
    selectedRoot,
    pages: { landing: { document: landingDocument } },
    pomodoroHistory,
    activePomodoro,
  }, null, 2)}\n`, 'utf8');
}

async function restoreSelectedRoot() {
  try {
    const settings = JSON.parse(await fs.readFile(SETTINGS_PATH, 'utf8'));
    landingDocument = typeof settings.pages?.landing?.document === 'string'
      ? settings.pages.landing.document
      : null;
    pomodoroHistory = Array.isArray(settings.pomodoroHistory) ? settings.pomodoroHistory : [];
    activePomodoro = typeof settings.activePomodoro?.endsAt === 'string'
      && typeof settings.activePomodoro?.message === 'string'
      ? settings.activePomodoro
      : null;
    selectedRoot = await fs.realpath(settings.selectedRoot);
    return { name: path.basename(selectedRoot), path: selectedRoot };
  } catch {
    selectedRoot = null;
    landingDocument = null;
    return null;
  }
}

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose a folder to browse', properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  selectedRoot = await fs.realpath(result.filePaths[0]);
  landingDocument = null;
  await saveSettings();
  return { name: path.basename(selectedRoot), path: selectedRoot };
});

ipcMain.handle('folder:restore', restoreSelectedRoot);

async function readTextDocument(filePath) {
  const safeFilePath = await resolveSafePath(filePath);
  const stats = await fs.stat(safeFilePath);
  if (!stats.isFile() || !isTextDocument(safeFilePath)) throw new Error('This is not a supported text document.');
  if (stats.size > MAX_FILE_SIZE) throw new Error('This file is too large to display (maximum 2 MB).');
  return {
    relativePath: path.relative(selectedRoot, safeFilePath),
    content: await fs.readFile(safeFilePath, 'utf8'),
  };
}

ipcMain.handle('folder:read', async (_event, directoryPath) => {
  const safeDirectoryPath = await resolveSafePath(directoryPath);
  const directoryEntries = await fs.readdir(safeDirectoryPath, { withFileTypes: true });
  const entries = [];
  for (const entry of directoryEntries) {
    if (entry.name.startsWith('.')) continue;
    try {
      const safeEntryPath = await resolveSafePath(path.join(safeDirectoryPath, entry.name));
      const stats = await fs.stat(safeEntryPath);
      if (stats.isDirectory()) entries.push({ name: entry.name, path: safeEntryPath, type: 'directory' });
      else if (stats.isFile() && isTextDocument(safeEntryPath)) entries.push({ name: entry.name, path: safeEntryPath, type: 'file' });
    } catch {
      // Ignore unreadable entries and symlinks that lead outside the selected root.
    }
  }
  return entries.sort((left, right) => left.type !== right.type
    ? (left.type === 'directory' ? -1 : 1)
    : left.name.localeCompare(right.name, undefined, { numeric: true }));
});

ipcMain.handle('file:read-text', (_event, filePath) => readTextDocument(filePath));

ipcMain.handle('page:set-landing', async (_event, filePath) => {
  const document = await readTextDocument(filePath);
  landingDocument = document.relativePath;
  await saveSettings();
  return { document: landingDocument };
});

ipcMain.handle('page:get-landing', async () => {
  if (!selectedRoot || !landingDocument) return null;
  return readTextDocument(path.resolve(selectedRoot, landingDocument));
});

ipcMain.handle('pomodoro:get-history', () => pomodoroHistory);

async function completeActivePomodoro() {
  if (!activePomodoro) return pomodoroHistory;
  const entry = {
    message: activePomodoro.message,
    completedAt: activePomodoro.endsAt,
  };
  activePomodoro = null;
  pomodoroHistory = [entry, ...pomodoroHistory].slice(0, 100);
  await saveSettings();
  return pomodoroHistory;
}

async function getActivePomodoro() {
  if (activePomodoro && new Date(activePomodoro.endsAt).getTime() <= Date.now()) {
    await completeActivePomodoro();
  }
  return activePomodoro;
}

ipcMain.handle('pomodoro:get-state', getActivePomodoro);

ipcMain.handle('pomodoro:start', async (_event, message) => {
  const safeMessage = typeof message === 'string' && message.trim()
    ? message.trim().slice(0, 200)
    : 'Focus session';
  activePomodoro = {
    message: safeMessage,
    endsAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
  };
  await saveSettings();
  return activePomodoro;
});

ipcMain.handle('pomodoro:complete', completeActivePomodoro);

ipcMain.handle('pomodoro:reset', async () => {
  activePomodoro = null;
  await saveSettings();
});

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
