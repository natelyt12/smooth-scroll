const DEFAULT_SETTINGS = {
  enabled: true,
  duration: 750,
  stepScale: 1.0,
  keyboardSmooth: true,
  excludedDomains: []
};

const enabledToggle = document.getElementById('enabledToggle');
const controlsCard = document.getElementById('controlsCard');
const siteDomainEl = document.getElementById('siteDomain');
const siteToggleBtn = document.getElementById('siteToggleBtn');
const durationRange = document.getElementById('durationRange');
const durationValue = document.getElementById('durationValue');
const stepRange = document.getElementById('stepRange');
const stepValue = document.getElementById('stepValue');
const keyboardToggle = document.getElementById('keyboardToggle');
const resetBtn = document.getElementById('resetBtn');
const statusText = document.getElementById('statusText');

let currentSettings = { ...DEFAULT_SETTINGS };
let activeHostname = null;
let statusTimeout = null;

function showSaved() {
  statusText.classList.add('visible');
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusText.classList.remove('visible');
  }, 1200);
}

function saveSettings(patch) {
  currentSettings = { ...currentSettings, ...patch };
  chrome.storage.sync.set(patch, () => {
    render();
    showSaved();
  });
}

function render() {
  enabledToggle.checked = currentSettings.enabled;
  controlsCard.classList.toggle('disabled', !currentSettings.enabled);

  durationRange.value = currentSettings.duration;
  durationValue.textContent = `${currentSettings.duration} ms`;

  stepRange.value = currentSettings.stepScale;
  stepValue.textContent = `${Number(currentSettings.stepScale).toFixed(1)}x`;

  keyboardToggle.checked = currentSettings.keyboardSmooth;

  if (activeHostname) {
    siteDomainEl.textContent = activeHostname;
    siteToggleBtn.disabled = false;
    const isExcluded = currentSettings.excludedDomains.includes(activeHostname);
    siteToggleBtn.textContent = isExcluded ? 'Disabled on site' : 'Enabled';
    siteToggleBtn.classList.toggle('excluded', isExcluded);
  } else {
    siteDomainEl.textContent = 'Unavailable on this page';
    siteToggleBtn.textContent = 'N/A';
    siteToggleBtn.disabled = true;
    siteToggleBtn.classList.remove('excluded');
  }
}

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          activeHostname = url.hostname;
        }
      } catch (_) {
        activeHostname = null;
      }
    }

    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      currentSettings = { ...DEFAULT_SETTINGS, ...items };
      render();
    });
  });
}

enabledToggle.addEventListener('change', () => {
  saveSettings({ enabled: enabledToggle.checked });
});

durationRange.addEventListener('input', () => {
  durationValue.textContent = `${durationRange.value} ms`;
});

durationRange.addEventListener('change', () => {
  saveSettings({ duration: Number(durationRange.value) });
});

stepRange.addEventListener('input', () => {
  stepValue.textContent = `${Number(stepRange.value).toFixed(1)}x`;
});

stepRange.addEventListener('change', () => {
  saveSettings({ stepScale: Number(stepRange.value) });
});

keyboardToggle.addEventListener('change', () => {
  saveSettings({ keyboardSmooth: keyboardToggle.checked });
});

siteToggleBtn.addEventListener('click', () => {
  if (!activeHostname) return;
  const list = new Set(currentSettings.excludedDomains);
  if (list.has(activeHostname)) {
    list.delete(activeHostname);
  } else {
    list.add(activeHostname);
  }
  saveSettings({ excludedDomains: Array.from(list) });
});

resetBtn.addEventListener('click', () => {
  saveSettings({ ...DEFAULT_SETTINGS });
});

init();
