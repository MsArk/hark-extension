// ============================================================
// HARK - background service worker
// Captura bodies de respuesta de requests que matchean un patrón
// ============================================================

const sessions = new Map(); // tabId -> { requests }
let downloadCounter = 0;

const DEBUGGER_VERSION = '1.3';

// ---------- helpers ----------

function matchesPattern(url, name, pattern, exactPath = false) {
  if (!pattern) return false;

  // regex si va entre /.../
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      const re = new RegExp(pattern.slice(1, -1));
      return re.test(url) || re.test(name);
    } catch (e) {
      console.warn('[HARK] Regex inválida:', e);
    }
  }

  if (exactPath) {
    return name === pattern;
  }

  return url.includes(pattern) || name.includes(pattern);
}

function getRequestName(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return last;
  } catch {
    return url;
  }
}

function formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// extrae el número de página del postData si existe → para nombrar el archivo
function extractPageHint(postDataStr) {
  if (!postDataStr) return null;
  try {
    const obj = JSON.parse(postDataStr);
    if (typeof obj.page === 'number') return `pagina-${obj.page}`;
    if (typeof obj.offset === 'number') return `offset-${obj.offset}`;
  } catch {}
  return null;
}

async function downloadBody({ body, isBase64, mimeType, suggestedName, pageHint }) {
  let dataUrl;
  let extension;

  // detectar extensión por mime
  if (mimeType && mimeType.includes('json')) extension = 'json';
  else if (mimeType && mimeType.includes('xml')) extension = 'xml';
  else if (mimeType && mimeType.includes('html')) extension = 'html';
  else if (mimeType && mimeType.includes('text')) extension = 'txt';
  else extension = 'bin';

  if (isBase64) {
    dataUrl = `data:${mimeType || 'application/octet-stream'};base64,${body}`;
  } else {
    // si es JSON, lo pretty-printeamos para que sea legible
    let content = body;
    if (extension === 'json') {
      try {
        content = JSON.stringify(JSON.parse(body), null, 2);
      } catch {}
    }
    dataUrl = `data:application/octet-stream;base64,` + btoa(unescape(encodeURIComponent(content)));
  }

  const safeName = suggestedName.replace(/[^a-z0-9_\-\.]/gi, '_');
  downloadCounter++;
  const parts = [safeName, formatTimestamp()];
  if (pageHint) parts.push(pageHint);
  parts.push(String(downloadCounter));
  const filename = `${parts.join('_')}.${extension}`;

  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
  console.log('[HARK] Descargado:', filename);
}

// ---------- attach / detach ----------

async function attach(tabId) {
  if (sessions.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
  sessions.set(tabId, { requests: new Map() });

  const { activeTabs = {} } = await chrome.storage.local.get('activeTabs');
  activeTabs[tabId] = true;
  await chrome.storage.local.set({ activeTabs });
}

async function detach(tabId) {
  if (!sessions.has(tabId)) return;
  try { await chrome.debugger.detach({ tabId }); } catch {}
  sessions.delete(tabId);
  const { activeTabs = {} } = await chrome.storage.local.get('activeTabs');
  delete activeTabs[tabId];
  await chrome.storage.local.set({ activeTabs });
}

// ---------- event handlers ----------

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const session = sessions.get(source.tabId);
  if (!session) return;

  const { requests } = session;

  switch (method) {
    case 'Network.requestWillBeSent': {
      requests.set(params.requestId, {
        url: params.request.url,
        method: params.request.method,
        postData: params.request.postData
      });
      break;
    }
    case 'Network.responseReceived': {
      const entry = requests.get(params.requestId);
      if (!entry) return;
      entry.mimeType = params.response.mimeType;
      entry.status = params.response.status;
      break;
    }
    case 'Network.loadingFinished': {
      const entry = requests.get(params.requestId);
      if (!entry) return;

      // 🚫 Ignorar preflight CORS
      if (entry.method === 'OPTIONS') {
        requests.delete(params.requestId);
        return;
      }

      const {
        pattern = 'prospecting-full',
        autoDownload = true,
        exactPath = false,
        allowedMethods = []
      } = await chrome.storage.local.get(['pattern', 'autoDownload', 'exactPath', 'allowedMethods']);

      const url = entry.url;
      const name = getRequestName(url);
      const httpMethod = entry.method;

      // filtro por método
      if (allowedMethods.length > 0 && !allowedMethods.includes(httpMethod)) {
        requests.delete(params.requestId);
        return;
      }

      const matched = matchesPattern(url, name, pattern, exactPath);
      console.log('[HARK]', { method: httpMethod, url, name, matched, status: entry.status });

      if (autoDownload && matched && entry.status >= 200 && entry.status < 300) {
        try {
          const body = await chrome.debugger.sendCommand(
            { tabId: source.tabId },
            'Network.getResponseBody',
            { requestId: params.requestId }
          );
          if (body && body.body) {
            const pageHint = extractPageHint(entry.postData);
            await downloadBody({
              body: body.body,
              isBase64: body.base64Encoded,
              mimeType: entry.mimeType,
              suggestedName: name || 'response',
              pageHint
            });
          }
        } catch (e) {
          console.warn('[HARK] No se pudo obtener el body:', e);
        }
      }
      requests.delete(params.requestId);
      break;
    }
    case 'Network.loadingFailed': {
      requests.delete(params.requestId);
      break;
    }
  }
});

chrome.debugger.onDetach.addListener(async (source) => {
  if (source.tabId) {
    sessions.delete(source.tabId);
    const { activeTabs = {} } = await chrome.storage.local.get('activeTabs');
    delete activeTabs[source.tabId];
    await chrome.storage.local.set({ activeTabs });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessions.has(tabId)) detach(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.action === 'start') {
      await attach(msg.tabId);
      sendResponse({ ok: true });
    } else if (msg.action === 'stop') {
      await detach(msg.tabId);
      sendResponse({ ok: true });
    } else if (msg.action === 'clear') {
      for (const tabId of [...sessions.keys()]) await detach(tabId);
      await chrome.storage.local.set({ activeTabs: {} });
      sendResponse({ ok: true });
    }
  })();
  return true;
});
