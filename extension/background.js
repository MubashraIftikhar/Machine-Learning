// MV3 service worker: manages offscreen doc, tab capture lifecycle, messaging

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');
const OFFSCREEN_REASON = chrome.offscreen?.Reason?.AUDIO_PLAYBACK || 'AUDIO_PLAYBACK';

async function ensureOffscreenDocument() {
  const hasOffscreen = await chrome.offscreen.hasDocument?.();
  if (hasOffscreen) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [OFFSCREEN_REASON],
    justification: 'Record tab audio and send to transcription API.'
  });
}

async function closeOffscreenDocumentIfIdle() {
  const hasOffscreen = await chrome.offscreen.hasDocument?.();
  if (!hasOffscreen) return;
  // Ask offscreen if it is busy; if not, close it
  const isBusy = await chrome.runtime.sendMessage({ type: 'offscreen:isBusy' }).catch(() => false);
  if (!isBusy) {
    try { await chrome.offscreen.closeDocument(); } catch (e) { /* ignore */ }
  }
}

async function getActiveMeetTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url?.startsWith('https://meet.google.')) return null;
  return tab;
}

async function startCapture() {
  await ensureOffscreenDocument();
  const tab = await getActiveMeetTab();
  if (!tab) throw new Error('Active tab is not a Google Meet.');

  // Request tab audio capture
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  await chrome.runtime.sendMessage({
    type: 'offscreen:start',
    payload: { streamId }
  });
}

async function stopCapture() {
  await chrome.runtime.sendMessage({ type: 'offscreen:stop' }).catch(() => {});
  await closeOffscreenDocumentIfIdle();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'bg:startCapture':
          await startCapture();
          sendResponse({ ok: true });
          break;
        case 'bg:stopCapture':
          await stopCapture();
          sendResponse({ ok: true });
          break;
        case 'bg:getState':
          const state = await chrome.runtime.sendMessage({ type: 'offscreen:getState' }).catch(() => ({ recording: false }));
          sendResponse(state);
          break;
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
