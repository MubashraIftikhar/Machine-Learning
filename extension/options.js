const providerEl = document.getElementById('provider');
const keyEl = document.getElementById('openaiApiKey');
const modelEl = document.getElementById('openaiModel');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('test');
const msgEl = document.getElementById('msg');

async function load() {
  const data = await chrome.storage.local.get({
    provider: 'openai',
    openaiApiKey: '',
    openaiModel: 'whisper-1'
  });
  providerEl.value = data.provider;
  keyEl.value = data.openaiApiKey;
  modelEl.value = data.openaiModel;
}

async function save() {
  await chrome.storage.local.set({
    provider: providerEl.value,
    openaiApiKey: keyEl.value.trim(),
    openaiModel: modelEl.value.trim() || 'whisper-1'
  });
  msgEl.textContent = 'Saved';
  msgEl.className = 'help ok';
}

async function test() {
  msgEl.textContent = 'Testing...';
  msgEl.className = 'help';
  try {
    const { openaiApiKey, openaiModel } = await chrome.storage.local.get(['openaiApiKey', 'openaiModel']);
    if (!openaiApiKey) throw new Error('Missing OpenAI API key');
    const form = new FormData();
    const silentBlob = new Blob([], { type: 'audio/webm' });
    form.append('file', silentBlob, 'silence.webm');
    form.append('model', openaiModel || 'whisper-1');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form
    });
    if (!res.ok) throw new Error('Request failed');
    await res.json();
    msgEl.textContent = 'API reachable';
    msgEl.className = 'help ok';
  } catch (e) {
    msgEl.textContent = `Error: ${e?.message || e}`;
    msgEl.className = 'help err';
  }
}

saveBtn.addEventListener('click', save);
testBtn.addEventListener('click', test);
load();
