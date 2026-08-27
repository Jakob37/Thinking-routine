const chooseFolderButton = document.querySelector('#choose-folder');
const folderName = document.querySelector('#folder-name');
const tree = document.querySelector('#tree');
const documentPath = document.querySelector('#document-path');
const documentContent = document.querySelector('#document-content');
let selectedFileButton = null;

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
    selectedFileButton?.classList.remove('selected');
    button.classList.add('selected');
    selectedFileButton = button;
    documentContent.focus();
  } catch (error) {
    documentPath.textContent = 'Unable to open document';
    showDocumentMessage('Could not open this document.', error.message);
  }
}

chooseFolderButton.addEventListener('click', async () => {
  const folder = await window.desktop.chooseFolder();
  if (!folder) return;
  selectedFileButton = null;
  folderName.textContent = folder.name;
  showTreeMessage('Loading documents…');
  documentPath.textContent = 'Document viewer';
  showDocumentMessage('Choose a document.', 'Select a supported text file from the sidebar.');
  try {
    const entries = await window.desktop.readFolder(folder.path);
    tree.replaceChildren(...entries.map(createTreeEntry));
    if (entries.length === 0) showTreeMessage('No supported documents found.');
  } catch (error) {
    showTreeMessage(`Could not read folder: ${error.message}`);
  }
});
