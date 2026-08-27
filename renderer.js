const chooseFolderButton = document.querySelector('#choose-folder');
const refreshFolderButton = document.querySelector('#refresh-folder');
const landingPageButton = document.querySelector('#landing-page');
const pomodoroPageButton = document.querySelector('#pomodoro-page');
const setLandingButton = document.querySelector('#set-landing');
const folderName = document.querySelector('#folder-name');
const tree = document.querySelector('#tree');
const documentPath = document.querySelector('#document-path');
const documentContent = document.querySelector('#document-content');
let selectedFileButton = null;
let currentFolder = null;
let selectedFilePath = null;
let currentView = 'files';
let pomodoroInterval = null;
let pomodoroRemainingSeconds = 25 * 60;
let pomodoroMessage = '';
let pomodoroEndsAt = null;

function setCurrentView(view) {
  currentView = view;
  landingPageButton.classList.toggle('selected', view === 'landing');
  pomodoroPageButton.classList.toggle('selected', view === 'pomodoro');
}

function showTreeMessage(message) {
  tree.replaceChildren();
  const element = document.createElement('p');
  element.className = 'tree-empty';
  element.textContent = message;
  tree.append(element);
}

function showDocumentMessage(title, message) {
  documentContent.replaceChildren();
  const state = document.createElement('div');
  state.className = 'empty-state';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = message;
  state.append(heading, text);
  documentContent.append(state);
}

async function expandDirectory(directoryPath, list, toggle) {
  if (list.dataset.loaded === 'true') return;
  list.replaceChildren();
  const loading = document.createElement('li');
  loading.className = 'tree-status';
  loading.textContent = 'Loading…';
  list.append(loading);

  try {
    const entries = await window.desktop.readFolder(directoryPath);
    list.replaceChildren(...entries.map(createTreeEntry));
    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'tree-status';
      empty.textContent = 'No supported documents';
      list.append(empty);
    }
    list.dataset.loaded = 'true';
    toggle.setAttribute('aria-expanded', 'true');
  } catch (error) {
    list.replaceChildren();
    const failure = document.createElement('li');
    failure.className = 'tree-status error';
    failure.textContent = error.message;
    list.append(failure);
    toggle.setAttribute('aria-expanded', 'false');
  }
}

function createTreeEntry(entry) {
  const item = document.createElement('li');
  item.setAttribute('role', 'treeitem');

  if (entry.type === 'directory') {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tree-entry folder-entry';
    toggle.textContent = entry.name;
    toggle.setAttribute('aria-expanded', 'false');
    const children = document.createElement('ul');
    children.className = 'tree-children';
    children.setAttribute('role', 'group');
    children.hidden = true;
    toggle.addEventListener('click', async () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        toggle.setAttribute('aria-expanded', 'false');
        children.hidden = true;
        return;
      }
      children.hidden = false;
      await expandDirectory(entry.path, children, toggle);
    });
    item.append(toggle, children);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tree-entry file-entry';
    button.textContent = entry.name;
    button.addEventListener('click', () => openDocument(entry.path, button));
    item.append(button);
  }
  return item;
}

async function openDocument(filePath, button) {
  documentPath.textContent = 'Loading document…';
  try {
    const file = await window.desktop.readTextFile(filePath);
    const code = document.createElement('pre');
    code.textContent = file.content;
    documentContent.replaceChildren(code);
    documentPath.textContent = file.relativePath;
    if (button) {
      selectedFileButton?.classList.remove('selected');
      button.classList.add('selected');
      selectedFileButton = button;
    }
    selectedFilePath = filePath;
    setLandingButton.disabled = false;
    setCurrentView('files');
    documentContent.focus();
  } catch (error) {
    documentPath.textContent = 'Unable to open document';
    showDocumentMessage('Could not open this document.', error.message);
  }
}

async function loadFolder(folder, { refreshDocument = false } = {}) {
  selectedFileButton = null;
  currentFolder = folder;
  folderName.textContent = folder.name;
  showTreeMessage('Loading documents…');
  documentPath.textContent = 'Document viewer';
  showDocumentMessage('Choose a document.', 'Select a supported text file from the sidebar.');
  try {
    const entries = await window.desktop.readFolder(folder.path);
    tree.replaceChildren(...entries.map(createTreeEntry));
    if (entries.length === 0) showTreeMessage('No supported documents found.');
    refreshFolderButton.disabled = false;
    landingPageButton.disabled = false;
    if (refreshDocument) {
      if (currentView === 'landing') await showLandingPage();
      else if (selectedFilePath) await openDocument(selectedFilePath);
    }
  } catch (error) {
    showTreeMessage(`Could not read folder: ${error.message}`);
  }
}

chooseFolderButton.addEventListener('click', async () => {
  const folder = await window.desktop.chooseFolder();
  if (!folder) return;
  selectedFilePath = null;
  setLandingButton.disabled = true;
  setCurrentView('files');
  await loadFolder(folder);
});

refreshFolderButton.addEventListener('click', async () => {
  if (!currentFolder) return;
  await loadFolder(currentFolder, { refreshDocument: true });
});

window.desktop.restoreFolder().then((folder) => {
  if (folder) loadFolder(folder).then(showLandingPage);
});

async function showLandingPage() {
  setCurrentView('landing');
  documentPath.textContent = 'Landing page';
  setLandingButton.disabled = true;
  try {
    const landingPage = await window.desktop.getLandingPage();
    if (!landingPage) {
      showDocumentMessage('No landing page yet.', 'Open a document in Files, then choose “Set as landing”.');
      return;
    }
    const code = document.createElement('pre');
    code.textContent = landingPage.content;
    documentContent.replaceChildren(code);
    documentPath.textContent = `Landing · ${landingPage.relativePath}`;
  } catch (error) {
    showDocumentMessage('Could not open the landing page.', error.message);
  }
}

landingPageButton.addEventListener('click', showLandingPage);

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function updateTimerDisplay() {
  const display = document.querySelector('#pomodoro-timer');
  if (display) display.textContent = formatTimer(pomodoroRemainingSeconds);
}

function formatCompletionTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

async function completePomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroEndsAt = null;
  pomodoroRemainingSeconds = 25 * 60;
  await window.desktop.completePomodoro();
  if (currentView === 'pomodoro') showPomodoroPage();
}

function updatePomodoroFromState(state) {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  if (!state) {
    pomodoroEndsAt = null;
    pomodoroRemainingSeconds = 25 * 60;
    return;
  }
  pomodoroMessage = state.message;
  pomodoroEndsAt = state.endsAt;
  const tick = () => {
    pomodoroRemainingSeconds = Math.max(0, Math.ceil((new Date(pomodoroEndsAt).getTime() - Date.now()) / 1000));
    updateTimerDisplay();
    if (pomodoroRemainingSeconds === 0) completePomodoro();
  };
  tick();
  if (pomodoroRemainingSeconds > 0) pomodoroInterval = setInterval(tick, 1000);
}

async function startPomodoro(messageInput) {
  if (pomodoroInterval) return;
  const state = await window.desktop.startPomodoro(messageInput.value);
  updatePomodoroFromState(state);
  if (currentView === 'pomodoro') showPomodoroPage();
}

async function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroEndsAt = null;
  pomodoroRemainingSeconds = 25 * 60;
  pomodoroMessage = '';
  await window.desktop.resetPomodoro();
  if (currentView === 'pomodoro') showPomodoroPage();
}

async function showPomodoroPage() {
  setCurrentView('pomodoro');
  documentPath.textContent = 'Pomodoro';
  setLandingButton.disabled = true;
  updatePomodoroFromState(await window.desktop.getPomodoroState());
  const history = await window.desktop.getPomodoroHistory();
  documentContent.replaceChildren();

  const page = document.createElement('div');
  page.className = 'pomodoro-page';
  const heading = document.createElement('h1');
  heading.textContent = 'Focus for 25 minutes.';
  const description = document.createElement('p');
  description.textContent = 'Give this session a message, then start your timer.';
  const messageLabel = document.createElement('label');
  messageLabel.htmlFor = 'pomodoro-message';
  messageLabel.textContent = 'What are you focusing on?';
  const messageInput = document.createElement('input');
  messageInput.id = 'pomodoro-message';
  messageInput.type = 'text';
  messageInput.maxLength = 200;
  messageInput.placeholder = 'For example: Outline the project plan';
  messageInput.value = pomodoroMessage;
  messageInput.disabled = Boolean(pomodoroInterval);
  const timer = document.createElement('p');
  timer.id = 'pomodoro-timer';
  timer.className = 'pomodoro-timer';
  timer.textContent = formatTimer(pomodoroRemainingSeconds);
  const controls = document.createElement('div');
  controls.className = 'pomodoro-controls';
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.textContent = pomodoroInterval ? 'Timer running' : 'Start focus session';
  startButton.disabled = Boolean(pomodoroInterval);
  startButton.addEventListener('click', () => startPomodoro(messageInput));
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'secondary-button';
  resetButton.textContent = 'Reset';
  resetButton.addEventListener('click', resetPomodoro);
  controls.append(startButton, resetButton);

  const historyHeading = document.createElement('h2');
  historyHeading.textContent = 'Completed sessions';
  const historyList = document.createElement('ul');
  historyList.className = 'pomodoro-history';
  if (history.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'Your completed focus sessions will appear here.';
    historyList.append(empty);
  } else {
    for (const entry of history) {
      const item = document.createElement('li');
      const message = document.createElement('strong');
      message.textContent = entry.message;
      const time = document.createElement('span');
      time.textContent = formatCompletionTime(entry.completedAt);
      item.append(message, time);
      historyList.append(item);
    }
  }

  page.append(heading, description, messageLabel, messageInput, timer, controls, historyHeading, historyList);
  documentContent.append(page);
}

pomodoroPageButton.addEventListener('click', showPomodoroPage);

setLandingButton.addEventListener('click', async () => {
  if (!selectedFilePath) return;
  await window.desktop.setLandingPage(selectedFilePath);
  setLandingButton.textContent = 'Landing page set';
  setTimeout(() => { setLandingButton.textContent = 'Set as landing'; }, 1500);
});
