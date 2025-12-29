/**
 * Popup Script
 * Session toggle and recording controls
 */

const serverStatusEl = document.getElementById('server-status');
const sessionToggle = document.getElementById('session-toggle');
const sessionLabel = document.getElementById('session-label');
const recordBtn = document.getElementById('record-btn');
const recordingIndicator = document.getElementById('recording-indicator');
const actionCount = document.getElementById('action-count');
const saveSection = document.getElementById('save-section');
const recordingNameInput = document.getElementById('recording-name');
const saveBtn = document.getElementById('save-btn');

let isRecording = false;
let currentActionCount = 0;

// Update UI based on state
function updateUI(state) {
  // Server connection status
  if (state.connected) {
    serverStatusEl.className = 'status connected';
    serverStatusEl.textContent = '✓ Connected to MCP server';
    sessionToggle.disabled = false;
    recordBtn.disabled = false;
  } else {
    serverStatusEl.className = 'status disconnected';
    serverStatusEl.textContent = '✗ Disconnected from MCP server';
    sessionToggle.disabled = true;
    recordBtn.disabled = true;
  }

  // Session toggle state
  sessionToggle.checked = state.sessionEnabled;
  sessionLabel.textContent = state.sessionEnabled
    ? 'Browser control enabled'
    : 'Browser control disabled';

  // Recording state
  isRecording = state.isRecording;
  currentActionCount = state.actionCount || 0;

  if (isRecording) {
    recordingIndicator.classList.remove('hidden');
    actionCount.textContent = `${currentActionCount} action${currentActionCount !== 1 ? 's' : ''}`;
    recordBtn.textContent = '⏹ Stop Recording';
    recordBtn.className = 'record-btn stop';
    saveSection.classList.add('hidden');
  } else if (currentActionCount > 0 && !state.lastSaved) {
    // Just stopped recording, show save UI
    recordingIndicator.classList.add('hidden');
    recordBtn.textContent = '⏺ Start Recording';
    recordBtn.className = 'record-btn start';
    saveSection.classList.remove('hidden');
  } else {
    recordingIndicator.classList.add('hidden');
    recordBtn.textContent = '⏺ Start Recording';
    recordBtn.className = 'record-btn start';
    saveSection.classList.add('hidden');
  }
}

// Check status
async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get_status' });
    updateUI(response);
  } catch (err) {
    updateUI({ connected: false, sessionEnabled: false, isRecording: false, actionCount: 0 });
    console.error('Popup error:', err);
  }
}

// Toggle session
async function toggleSession() {
  try {
    await chrome.runtime.sendMessage({ type: 'toggle_session' });
    await checkStatus();
  } catch (err) {
    console.error('Toggle error:', err);
  }
}

// Toggle recording
async function toggleRecording() {
  try {
    if (isRecording) {
      // Stop recording
      await chrome.runtime.sendMessage({ type: 'stop_recording' });
    } else {
      // Start recording
      await chrome.runtime.sendMessage({ type: 'start_recording' });
    }
    await checkStatus();
  } catch (err) {
    console.error('Recording error:', err);
  }
}

// Save recording
async function saveRecording() {
  const name = recordingNameInput.value.trim();
  if (!name) {
    recordingNameInput.focus();
    recordingNameInput.style.borderColor = '#EF4444';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'save_recording', name });
    if (response.success) {
      recordingNameInput.value = '';
      saveSection.classList.add('hidden');
      await checkStatus();
    } else {
      alert('Failed to save: ' + response.error);
    }
  } catch (err) {
    console.error('Save error:', err);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Recording';
}

// Event listeners
sessionToggle.addEventListener('change', toggleSession);
recordBtn.addEventListener('click', toggleRecording);
saveBtn.addEventListener('click', saveRecording);
recordingNameInput.addEventListener('input', () => {
  recordingNameInput.style.borderColor = '#D1D5DB';
});
recordingNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveRecording();
});

// Check immediately and then every 1 second (faster updates during recording)
checkStatus();
setInterval(checkStatus, 1000);
