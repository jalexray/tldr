// TLDR — Popup script

const $ = (sel) => document.querySelector(sel);

const PROVIDER_MODELS = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'other', label: 'Other...' }
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'other', label: 'Other...' }
  ],
  custom: [
    { value: 'other', label: 'Enter model ID...' }
  ]
};

const DENSITY_DESCS = [
  '',
  'Light (~20% reduction)',
  'Moderate (~35% reduction)',
  'Balanced (~50% reduction)',
  'Aggressive (~65% reduction)',
  'Exec summary (~80% reduction)'
];

// ── Load saved settings ──

chrome.storage.local.get(
  ['provider', 'apiKey', 'model', 'baseUrl', 'displayMode', 'densityMode', 'densityLevel', 'autoRun'],
  (s) => {
    $('#autoRun').checked = !!s.autoRun;
    if (s.displayMode) $('#displayMode').value = s.displayMode;
    if (s.provider) $('#provider').value = s.provider;
    if (s.apiKey) $('#apiKey').value = s.apiKey;
    if (s.baseUrl) $('#baseUrl').value = s.baseUrl;

    // Density
    const isSmart = s.densityMode !== 'custom';
    $('#densitySmart').checked = isSmart;
    if (s.densityLevel) $('#densityLevel').value = s.densityLevel;

    populateModels();

    if (s.model) {
      const select = $('#model');
      const presets = Array.from(select.options).map((o) => o.value);
      if (presets.includes(s.model)) {
        select.value = s.model;
      } else {
        select.value = 'other';
        $('#customModel').value = s.model;
      }
    }

    syncUI();
  }
);

// ── UI helpers ──

function populateModels() {
  const provider = $('#provider').value;
  const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS.custom;
  const select = $('#model');
  select.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    select.appendChild(opt);
  }
}

function syncUI() {
  const provider = $('#provider').value;
  $('#baseUrlGroup').classList.toggle('hidden', provider !== 'custom');
  $('#customModelGroup').classList.toggle('hidden', $('#model').value !== 'other');

  const isSmart = $('#densitySmart').checked;
  $('#densitySliderGroup').classList.toggle('hidden', isSmart);
  if (!isSmart) {
    $('#densityDesc').textContent = DENSITY_DESCS[$('#densityLevel').value];
  }
}

function getEffectiveModel() {
  const sel = $('#model').value;
  if (sel === 'other') {
    return $('#customModel').value.trim();
  }
  return sel;
}

function getAllSettings() {
  return {
    autoRun: $('#autoRun').checked,
    displayMode: $('#displayMode').value,
    provider: $('#provider').value,
    apiKey: $('#apiKey').value.trim(),
    model: getEffectiveModel(),
    baseUrl: $('#baseUrl').value.trim(),
    densityMode: $('#densitySmart').checked ? 'smart' : 'custom',
    densityLevel: parseInt($('#densityLevel').value)
  };
}

function showStatus(msg, isError) {
  const el = $('#status');
  el.textContent = msg;
  el.className = 'status' + (isError ? ' error' : '');
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 4000);
}

// ── Events ──

$('#settings-toggle').addEventListener('click', () => {
  $('#settings').classList.toggle('hidden');
});

$('#provider').addEventListener('change', () => {
  populateModels();
  syncUI();
});

$('#model').addEventListener('change', syncUI);
$('#densitySmart').addEventListener('change', syncUI);
$('#densityLevel').addEventListener('input', () => {
  $('#densityDesc').textContent = DENSITY_DESCS[$('#densityLevel').value];
});

$('#save').addEventListener('click', () => {
  const settings = getAllSettings();

  if (!settings.apiKey) {
    showStatus('Please enter an API key.', true);
    return;
  }
  if ($('#model').value === 'other' && !settings.model) {
    showStatus('Please enter a model ID.', true);
    return;
  }

  chrome.storage.local.set(settings, () => {
    const el = $('#saved');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2000);
  });
});

$('#condense').addEventListener('click', async () => {
  const settings = getAllSettings();

  if (!settings.apiKey) {
    showStatus('Set up your API key first.', true);
    return;
  }

  await chrome.storage.local.set(settings);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    await chrome.tabs.sendMessage(tab.id, { action: 'trigger' });
    window.close();
  } catch {
    showStatus('Cannot reach page. Try reloading it first.', true);
  }
});
