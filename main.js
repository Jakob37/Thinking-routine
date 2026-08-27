const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEXT_EXTENSIONS = new Set(['.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.ts', '.yaml', '.yml']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;
let selectedRoot = null;

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

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose a folder to browse', properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  selectedRoot = await fs.realpath(result.filePaths[0]);
  return { name: path.basename(selectedRoot), path: selectedRoot };
});

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

ipcMain.handle('file:read-text', async (_event, filePath) => {
  const safeFilePath = await resolveSafePath(filePath);
  const stats = await fs.stat(safeFilePath);
  if (!stats.isFile() || !isTextDocument(safeFilePath)) throw new Error('This is not a supported text document.');
  if (stats.size > MAX_FILE_SIZE) throw new Error('This file is too large to display (maximum 2 MB).');
  return {
    relativePath: path.relative(selectedRoot, safeFilePath),
    content: await fs.readFile(safeFilePath, 'utf8'),
  };
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
