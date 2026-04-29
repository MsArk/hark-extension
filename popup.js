const patternInput = document.getElementById('pattern');
const autoDl = document.getElementById('autoDownload');
const exactPath = document.getElementById('exactPath');
const methodCheckboxes = document.querySelectorAll('.method');
const toggleBtn = document.getElementById('toggle');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshUI() {
  const {
    pattern = 'prospecting-full',
    autoDownload = true,
    exactPath: ep = false,
    allowedMethods = []
  } = await chrome.storage.local.get(['pattern', 'autoDownload', 'exactPath', 'allowedMethods']);

  patternInput.value = pattern;
  autoDl.checked = autoDownload;
  exactPath.checked = ep;
  methodCheckboxes.forEach(cb => {
    cb.checked = allowedMethods.includes(cb.value);
  });

  const tab = await getActiveTab();
  const { activeTabs = {} } = await chrome.storage.local.get('activeTabs');
  const isOn = !!activeTabs[tab.id];

  toggleBtn.textContent = isOn ? 'Detener captura' : 'Iniciar captura';
  toggleBtn.classList.toggle('primary', !isOn);
  toggleBtn.classList.toggle('danger', isOn);
  statusEl.textContent = isOn ? `Capturando en pestaña ${tab.id}` : 'Inactivo';
  statusEl.classList.toggle('on', isOn);
}

patternInput.addEventListener('change', () => {
  chrome.storage.local.set({ pattern: patternInput.value.trim() });
});
autoDl.addEventListener('change', () => {
  chrome.storage.local.set({ autoDownload: autoDl.checked });
});
exactPath.addEventListener('change', () => {
  chrome.storage.local.set({ exactPath: exactPath.checked });
});
methodCheckboxes.forEach(cb => {
  cb.addEventListener('change', () => {
    const allowedMethods = Array.from(methodCheckboxes)
      .filter(c => c.checked)
      .map(c => c.value);
    chrome.storage.local.set({ allowedMethods });
  });
});

toggleBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  const { activeTabs = {} } = await chrome.storage.local.get('activeTabs');
  const isOn = !!activeTabs[tab.id];
  const action = isOn ? 'stop' : 'start';
  await chrome.runtime.sendMessage({ action, tabId: tab.id });
  setTimeout(refreshUI, 200);
});

clearBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'clear' });
  refreshUI();
});

refreshUI();
