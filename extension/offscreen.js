// Offscreen document: receives tabCapture streamId, records audio, sends chunks to transcription

let mediaStream = null;
let mediaRecorder = null;
let isBusy = false;
let isRecording = false;
let transcriptText = '';
let wakeLock = null;
let controller = null; // AbortController for in-flight requests

async function getApiConfig() {
  const { provider = 'openai', openaiApiKey = '', openaiModel = 'whisper-1' } = await chrome.storage.local.get({
    provider: 'openai',
    openaiApiKey: '',
    openaiModel: 'whisper-1'
  });
  return { provider, openaiApiKey, openaiModel };
}

async function connectStream(streamId) {
  // Chrome-specific way to get the captured tab audio into this document
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });
}

function notifyTranscriptUpdate() {
  chrome.runtime.sendMessage({ type: 'offscreen:transcript', payload: { text: transcriptText } }).catch(() => {});
}

async function transcribeChunk(blob) {
  const { provider, openaiApiKey, openaiModel } = await getApiConfig();
  if (provider !== 'openai') {
    return; // placeholder for other providers
  }

  if (!openaiApiKey) return;

  const form = new FormData();
  form.append('file', blob, 'audio.webm');
  form.append('model', openaiModel);
  controller = new AbortController();

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
    const data = await res.json();
    const text = data.text || '';
    if (text) {
      transcriptText += (transcriptText ? '\n' : '') + text;
      notifyTranscriptUpdate();
    }
  } catch (err) {
    // ignore chunk errors to keep recording
  } finally {
    controller = null;
  }
}

function startRecorder() {
  if (!mediaStream) throw new Error('No media stream');
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      transcribeChunk(e.data);
    }
  };
  mediaRecorder.start(5000); // 5s chunks
  isRecording = true;
  if ('wakeLock' in navigator && navigator.wakeLock?.request) {
    navigator.wakeLock.request('screen').then(lock => wakeLock = lock).catch(() => {});
  }
}

function stopRecorder() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }
  mediaStream = null;
  isRecording = false;
  if (controller) {
    controller.abort();
    controller = null;
  }
  if (wakeLock) {
    try { wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'offscreen:start':
          if (isRecording) return sendResponse({ ok: true });
          isBusy = true;
          transcriptText = '';
          await connectStream(msg.payload.streamId);
          startRecorder();
          isBusy = false;
          sendResponse({ ok: true });
          break;
        case 'offscreen:stop':
          stopRecorder();
          sendResponse({ ok: true });
          break;
        case 'offscreen:isBusy':
          sendResponse(Boolean(isBusy || isRecording));
          break;
        case 'offscreen:getState':
          sendResponse({ recording: isRecording, transcript: transcriptText });
          break;
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      isBusy = false;
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
