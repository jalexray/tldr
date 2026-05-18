// TLDR — Popup script · MSCHF direction

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
const SHORTCUT = isMac ? '\u2325T' : 'ALT+T';

// ── Constants ──

const PROVIDER_MODELS = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'other', label: 'Other...' }
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { value: 'claude-sonnet-4-5-20250514', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { value: 'other', label: 'Other...' }
  ],
  custom: [
    { value: 'other', label: 'Other...' }
  ]
};

const DENSITY_STEPS = [
  { id: 1, label: 'FLUFF',      note: 'Light edit \u00b7 keep voice',   pct: 20 },
  { id: 2, label: 'TRIM',       note: 'Drop hedging & redundancy',      pct: 35 },
  { id: 3, label: 'CRUNCH',     note: 'Default \u00b7 half-length',     pct: 50 },
  { id: 4, label: 'CULL',       note: 'Key points only',                pct: 65 },
  { id: 5, label: 'BARE BONES', note: '\u226415 words per bullet',      pct: 80 },
];

const BOOK_LADDER = [
  { min: 0,       title: 'silence',                   note: 'nothing cut yet' },
  { min: 1,       title: 'a haiku',                   note: '~17 syllables' },
  { min: 50,      title: 'a tweet',                   note: '~50 words' },
  { min: 250,     title: 'a Wikipedia stub',          note: '~250 words' },
  { min: 700,     title: 'a blog post',               note: '~700 words' },
  { min: 1500,    title: 'a New Yorker shortie',      note: '~1,500 words' },
  { min: 3000,    title: 'a TED talk transcript',     note: '~3,000 words' },
  { min: 7500,    title: 'a magazine longread',       note: '~7,500 words' },
  { min: 15000,   title: 'a novella chapter',         note: '~15,000 words' },
  { min: 27000,   title: '"The Old Man and the Sea"', note: 'Hemingway \u00b7 26,601' },
  { min: 30000,   title: '"Animal Farm"',             note: 'Orwell \u00b7 29,966' },
  { min: 47000,   title: '"The Great Gatsby"',        note: 'Fitzgerald \u00b7 47,094' },
  { min: 60000,   title: '"Brave New World"',         note: 'Huxley \u00b7 63,766' },
  { min: 73000,   title: '"The Catcher in the Rye"',  note: 'Salinger \u00b7 73,404' },
  { min: 89000,   title: '"1984"',                    note: 'Orwell \u00b7 88,942' },
  { min: 99000,   title: '"To Kill a Mockingbird"',   note: 'Lee \u00b7 99,121' },
  { min: 122000,  title: '"Pride and Prejudice"',     note: 'Austen \u00b7 122,189' },
  { min: 135000,  title: '"A Tale of Two Cities"',    note: 'Dickens \u00b7 135,420' },
  { min: 209000,  title: '"Moby-Dick"',               note: 'Melville \u00b7 209,117' },
  { min: 349000,  title: '"Anna Karenina"',           note: 'Tolstoy \u00b7 349,168' },
  { min: 530000,  title: '"Les Mis\u00e9rables"',     note: 'Hugo \u00b7 530,982' },
  { min: 543000,  title: '"Infinite Jest"',           note: 'Wallace \u00b7 543,709' },
  { min: 587000,  title: '"War and Peace"',           note: 'Tolstoy \u00b7 587,287' },
  { min: 1267000, title: '"In Search of Lost Time"',  note: 'Proust \u00b7 1,267,069' },
];

function lookupBook(words) {
  let match = BOOK_LADDER[0];
  for (const step of BOOK_LADDER) {
    if (words >= step.min) match = step;
    else break;
  }
  return match;
}

// ── Load saved settings ──

chrome.storage.local.get(
  ['provider', 'apiKey', 'model', 'baseUrl', 'displayMode',
   'densityMode', 'densityLevel', 'autoRun', 'lifetimeWordsCut', 'excludePatterns'],
  async (s) => {
    // Show intro if no API key is set
    if (!s.apiKey) {
      showView('intro');
      initIntro();
      return;
    }

    showView('main');
    $('#status').textContent = `// ${SHORTCUT} TO TRIGGER`;

    // Auto-run: sync with actual permission state
    const hasAllUrls = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    $('#autoRun').checked = !!s.autoRun && hasAllUrls;
    excludePatterns = s.excludePatterns || [];
    syncAutoRunUI();
    renderExcludeList();

    if (s.displayMode) setDisplayMode(s.displayMode);
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
      const presets = Array.from(select.options).map(o => o.value);
      if (presets.includes(s.model)) {
        select.value = s.model;
      } else {
        select.value = 'other';
        $('#customModel').value = s.model;
      }
    }

    syncUI();
    renderScore(s.lifetimeWordsCut || 0);
  }
);

// ── Intro / first-run ──

function showView(name) {
  $('#introView').classList.toggle('hidden', name !== 'intro');
  $('#mainView').classList.toggle('hidden', name !== 'main');
}

function initIntro() {
  let selectedProvider = 'anthropic';

  // Provider buttons
  $$('.intro-provider').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.intro-provider').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedProvider = btn.dataset.value;
    });
  });

  // Enable CTA when key is entered
  const keyInput = $('#introApiKey');
  const startBtn = $('#introStart');

  keyInput.addEventListener('input', () => {
    startBtn.disabled = !keyInput.value.trim();
  });

  startBtn.addEventListener('click', async () => {
    const apiKey = keyInput.value.trim();
    if (!apiKey) return;

    // Determine default model for provider
    const defaultModels = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-haiku-4-5-20251001',
      custom: ''
    };

    await chrome.storage.local.set({
      provider: selectedProvider,
      apiKey,
      model: defaultModels[selectedProvider] || '',
      displayMode: 'inline',
      densityMode: 'smart',
      densityLevel: 3
    });

    // Reload popup to show main view with saved settings
    location.reload();
  });
}

// ── UI rendering ──

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
  renderDensity();
}

function renderDensity() {
  const smart = $('#densitySmart').checked;
  const level = parseInt($('#densityLevel').value);
  const current = DENSITY_STEPS[level - 1];

  // Smart toggle styling
  const smartLabel = $('#smartLabel');
  const smartBox = $('#smartBox');
  smartLabel.classList.toggle('active', smart);
  smartBox.classList.toggle('checked', smart);

  // Slider
  $('#densityLevel').classList.toggle('dimmed', smart);

  // Ticks
  const ticksEl = $('#densityTicks');
  ticksEl.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const tick = document.createElement('div');
    tick.className = 'pop-tick';
    if (!smart && level === i) tick.classList.add('active');
    else if (!smart && i <= level) tick.classList.add('filled');
    ticksEl.appendChild(tick);
  }

  // Step labels
  const labelsEl = $('#stepLabels');
  labelsEl.innerHTML = '';
  labelsEl.classList.toggle('dimmed', smart);
  for (const step of DENSITY_STEPS) {
    const btn = document.createElement('button');
    btn.className = 'pop-step-label';
    if (!smart && level === step.id) btn.classList.add('active');
    btn.textContent = step.label;
    btn.addEventListener('click', () => {
      $('#densitySmart').checked = false;
      $('#densityLevel').value = step.id;
      renderDensity();
      flashSaved();
    });
    labelsEl.appendChild(btn);
  }

  // Readout
  const readout = $('#stepReadout');
  readout.classList.toggle('active', !smart);
  readout.innerHTML = `
    <div>
      <div class="pop-readout-name" style="color:${smart ? '#9a9a9a' : '#fff'}">${smart ? 'Auto' : current.label}</div>
      <div class="pop-readout-note">${smart ? 'Model decides per-paragraph' : current.note}</div>
    </div>
    <div class="pop-readout-pct" style="color:${smart ? '#9a9a9a' : ''}">${smart ? 'AUTO' : '\u2212' + current.pct + '%'}</div>
  `;
}

function setDisplayMode(mode) {
  $$('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === mode);
  });
}

function getDisplayMode() {
  const active = document.querySelector('.seg-btn.active');
  return active ? active.dataset.value : 'overlay';
}

let excludePatterns = [];

function syncAutoRunUI() {
  const checked = $('#autoRun').checked;
  $('#autoRunBox').classList.toggle('checked', checked);
  $('#autoRunBox').textContent = checked ? '\u00d7' : '';
  $('#autoRunWarning').classList.toggle('hidden', !checked);
  $('#excludeSection').classList.toggle('hidden', !checked);
}

function renderExcludeList() {
  const list = $('#excludeList');
  list.innerHTML = '';

  if (excludePatterns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'exclude-empty';
    empty.textContent = '// no exclusions';
    list.appendChild(empty);
    return;
  }

  for (let i = 0; i < excludePatterns.length; i++) {
    const item = document.createElement('div');
    item.className = 'exclude-item';

    const text = document.createElement('span');
    text.textContent = excludePatterns[i];

    const btn = document.createElement('button');
    btn.className = 'exclude-remove';
    btn.textContent = '\u00d7';
    btn.addEventListener('click', () => {
      excludePatterns.splice(i, 1);
      saveExcludePatterns();
      renderExcludeList();
    });

    item.appendChild(text);
    item.appendChild(btn);
    list.appendChild(item);
  }
}

function addExcludePattern() {
  const input = $('#excludeInput');
  const pattern = input.value.trim().toLowerCase();
  if (!pattern) return;
  if (excludePatterns.includes(pattern)) { input.value = ''; return; }

  excludePatterns.push(pattern);
  saveExcludePatterns();
  renderExcludeList();
  input.value = '';
}

function saveExcludePatterns() {
  chrome.storage.local.set({ excludePatterns });
}

function renderScore(words) {
  const book = lookupBook(words);
  const panel = $('#scorePanel');
  const titleHtml = book.title.replace(/"([^"]+)"/, '<em>$1</em>');

  panel.innerHTML = `
    <div class="score-label">
      <span>// LIFETIME SLOP CUT</span>
      ${words > 0 ? '<span style="color:#555">SINCE INSTALL</span>' : ''}
    </div>
    <div class="score-number">${words.toLocaleString()}<span class="unit">words</span></div>
    <div class="score-book">
      <span class="score-approx">\u2248</span>
      <div>
        <div class="score-title">${titleHtml}</div>
        <div class="score-note">${book.note}</div>
      </div>
    </div>
  `;
}

function getEffectiveModel() {
  const sel = $('#model').value;
  return sel === 'other' ? $('#customModel').value.trim() : sel;
}

function getAllSettings() {
  return {
    autoRun: $('#autoRun').checked,
    displayMode: getDisplayMode(),
    provider: $('#provider').value,
    apiKey: $('#apiKey').value.trim(),
    model: getEffectiveModel(),
    baseUrl: $('#baseUrl').value.trim(),
    densityMode: $('#densitySmart').checked ? 'smart' : 'custom',
    densityLevel: parseInt($('#densityLevel').value)
  };
}

function showStatus(msg, type) {
  const el = $('#status');
  el.textContent = msg;
  el.className = 'pop-status' + (type === 'error' ? ' error' : type === 'saved' ? ' saved' : '');
  if (type) {
    setTimeout(() => {
      el.textContent = `// ${SHORTCUT} TO TRIGGER`;
      el.className = 'pop-status';
    }, 3000);
  }
}

function flashSaved() {
  showStatus('// SETTINGS SAVED', 'saved');
  chrome.storage.local.set(getAllSettings());
}

// ── Events ──

$('#settings-toggle').addEventListener('click', () => {
  const panel = $('#settings');
  const btn = $('#settings-toggle');
  const isHidden = panel.classList.toggle('hidden');
  btn.textContent = isHidden ? '+ Settings' : '\u2212 Settings';
});

$('#saveSettings').addEventListener('click', () => {
  chrome.storage.local.set(getAllSettings());
  $('#settings').classList.add('hidden');
  $('#settings-toggle').textContent = '+ Settings';
  showStatus('// SETTINGS SAVED', 'saved');
});

$('#excludeAdd').addEventListener('click', addExcludePattern);
$('#excludeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addExcludePattern();
});

$('#provider').addEventListener('change', () => {
  populateModels();
  syncUI();
  flashSaved();
});

$('#model').addEventListener('change', () => { syncUI(); flashSaved(); });

$('#densitySmart').addEventListener('change', () => { renderDensity(); flashSaved(); });

$('#densityLevel').addEventListener('input', () => { renderDensity(); flashSaved(); });

// Segmented control
$$('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setDisplayMode(btn.dataset.value);
    flashSaved();
  });
});

// Auto-run with permission request
$('#autoRun').addEventListener('change', async () => {
  if ($('#autoRun').checked) {
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!granted) $('#autoRun').checked = false;
  } else {
    await chrome.permissions.remove({ origins: ['<all_urls>'] });
  }
  syncAutoRunUI();
  flashSaved();
});

// Save button (implicit — settings auto-save on condense and on field blur)
$('#apiKey').addEventListener('blur', flashSaved);

// Condense
$('#condense').addEventListener('click', async () => {
  const settings = getAllSettings();

  if (!settings.apiKey) {
    showStatus('\u00d7 NO API KEY', 'error');
    return;
  }

  await chrome.storage.local.set(settings);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { action: 'trigger' });
    window.close();
  } catch {
    showStatus('\u00d7 CANNOT REACH PAGE', 'error');
  }
});
