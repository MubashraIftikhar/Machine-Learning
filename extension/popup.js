const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const openOptions = document.getElementById('openOptions');

function setUi(recording){
  if(recording){
    statusEl.textContent = 'Recording...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    copyBtn.disabled = true;
    clearBtn.disabled = true;
  }else{
    statusEl.textContent = 'Idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    copyBtn.disabled = !transcriptEl.textContent?.length;
    clearBtn.disabled = !transcriptEl.textContent?.length;
  }
}

async function refreshState(){
  const state = await chrome.runtime.sendMessage({ type: 'bg:getState' }).catch(() => ({ recording:false }));
  setUi(Boolean(state?.recording));
  if (state?.transcript) transcriptEl.textContent = state.transcript;
}

startBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'bg:startCapture' });
  if (!res?.ok) {
    alert(res?.error || 'Failed to start');
  }
  await refreshState();
});

stopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'bg:stopCapture' });
  await refreshState();
});

openOptions.addEventListener('click', async (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(transcriptEl.textContent || '');
});

clearBtn.addEventListener('click', async () => {
  transcriptEl.textContent = '';
  setUi(false);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'offscreen:transcript') {
    transcriptEl.textContent = msg.payload.text || '';
  }
});

refreshState();
