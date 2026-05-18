// TLDR — Content Script · MSCHF direction
// Extracts page content, sends to LLM, renders condensed result

(() => {
  if (window.__tldrLoaded) return;
  window.__tldrLoaded = true;

  let isActive = false;
  let currentMode = 'overlay';
  let currentDensity = { mode: 'smart', level: 3 };
  const MAX_WORDS = 8000;

  let overlay = null;
  let inlineEntries = null;
  let inlineBar = null;

  // --- Message handling ---

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'trigger':
        toggle();
        sendResponse({ ok: true });
        break;
      case 'result':
        if (currentMode === 'inline') {
          showResultInline(msg.markdown, msg.originalWordCount);
        } else {
          showResultOverlay(msg.markdown, msg.originalWordCount);
        }
        break;
      case 'error':
        showError(msg.error);
        break;
      case 'ping':
        sendResponse({ ok: true });
        break;
    }
    return true;
  });

  function toggle() {
    isActive ? dismiss() : condense();
  }

  function dismiss() {
    isActive = false;

    if (inlineEntries) {
      for (const entry of inlineEntries) {
        entry.element.innerHTML = entry.originalHTML;
        entry.element.style.opacity = '';
        entry.element.style.transition = '';
        entry.element.style.display = '';
        entry.element.style.borderLeft = '';
        entry.element.style.paddingLeft = '';
      }
      inlineEntries = null;
    }
    if (inlineBar) {
      if (inlineBar.__keyHandler)
        document.removeEventListener('keydown', inlineBar.__keyHandler);
      inlineBar.remove();
      inlineBar = null;
    }

    if (overlay) {
      if (overlay.__keyHandler)
        document.removeEventListener('keydown', overlay.__keyHandler);
      overlay.remove();
      overlay = null;
      document.body.style.overflow = '';
    }
  }

  // --- Condense entry point ---

  async function condense() {
    const settings = await chrome.storage.local.get([
      'displayMode', 'densityMode', 'densityLevel'
    ]);
    currentMode = settings.displayMode || 'inline';
    currentDensity = {
      mode: settings.densityMode || 'smart',
      level: parseInt(settings.densityLevel) || 3
    };

    if (currentMode === 'inline') {
      condenseInline();
    } else {
      condenseOverlay();
    }
  }

  // =============================================
  //  OVERLAY MODE
  // =============================================

  function condenseOverlay() {
    const { text: rawText, wordCount } = extractAllContent();

    if (wordCount < 50) {
      showError('\u00d7 NOT ENOUGH SIGNAL ON THIS PAGE');
      return;
    }

    const text = wordCount > MAX_WORDS
      ? rawText.split(/\s+/).slice(0, MAX_WORDS).join(' ')
      : rawText;

    isActive = true;
    showLoadingOverlay(wordCount);

    chrome.runtime.sendMessage({
      action: 'condense',
      content: text,
      title: document.title,
      wordCount,
      mode: 'overlay',
      densityMode: currentDensity.mode,
      densityLevel: currentDensity.level
    });
  }

  function createOverlay() {
    dismissOverlayOnly();
    overlay = document.createElement('div');
    overlay.id = 'tldr-overlay';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    overlay.__keyHandler = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', overlay.__keyHandler);
    return overlay;
  }

  function dismissOverlayOnly() {
    if (overlay) {
      if (overlay.__keyHandler)
        document.removeEventListener('keydown', overlay.__keyHandler);
      overlay.remove();
      overlay = null;
      document.body.style.overflow = '';
    }
  }

  function showLoadingOverlay(wordCount) {
    const el = createOverlay();
    const container = document.createElement('div');
    container.className = 'tldr-container';

    // Header
    const header = makeOverlayHeader('\u00d7 CANCEL', true);
    container.appendChild(header);

    // Loading hero
    const hero = document.createElement('div');
    hero.style.marginTop = '60px';

    const heroText = document.createElement('div');
    heroText.className = 'tldr-loading-hero';
    heroText.innerHTML = 'Extracting<br>signal<span class="haz">.</span>';
    hero.appendChild(heroText);

    const stripe = document.createElement('div');
    stripe.className = 'tldr-hazard-stripe-lg';
    hero.appendChild(stripe);

    const sub = document.createElement('div');
    sub.className = 'tldr-loading-sub';
    sub.textContent = `${wordCount.toLocaleString()} words detected \u00b7 this should take a moment`;
    hero.appendChild(sub);

    container.appendChild(hero);
    el.appendChild(container);
  }

  function showResultOverlay(markdown, originalWordCount) {
    if (!overlay) createOverlay();

    const condensedWords = countWords(markdown);
    const cut = originalWordCount - condensedWords;
    const pct = Math.round(cut / originalWordCount * 100);

    // Update lifetime score
    updateLifetimeScore(cut);

    const container = document.createElement('div');
    container.className = 'tldr-container';

    // Header with stamps
    const statsSpan = document.createElement('span');
    statsSpan.className = 'tldr-stamp tldr-stamp-outline';
    statsSpan.textContent = `${cut.toLocaleString()} WORDS \u00b7 ${pct}% LESS`;

    const header = makeOverlayHeader('\u00d7 SHOW ORIGINAL', false, statsSpan);
    container.appendChild(header);

    // "THE SIGNAL:" heading
    const signalSection = document.createElement('div');
    signalSection.style.marginTop = '32px';

    const signalHeading = document.createElement('div');
    signalHeading.className = 'tldr-signal-heading';
    signalHeading.innerHTML = 'The signal<span class="haz">:</span>';
    signalSection.appendChild(signalHeading);

    // Rendered content
    const content = document.createElement('div');
    content.className = 'tldr-content';
    renderMarkdownDOM(markdown, content);
    signalSection.appendChild(content);

    container.appendChild(signalSection);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'tldr-ov-footer';
    footer.textContent = '// TLDR \u00b7 DROP NO. 001 \u00b7 void where prohibited \u00b7 for entertainment purposes only';
    container.appendChild(footer);

    overlay.innerHTML = '';
    overlay.appendChild(container);
    overlay.scrollTop = 0;
  }

  function makeOverlayHeader(closeLabel, isLoading, statsEl) {
    const header = document.createElement('div');
    header.className = 'tldr-header';

    const top = document.createElement('div');
    top.className = 'tldr-header-top';

    const left = document.createElement('div');
    const wordmark = document.createElement('div');
    wordmark.className = 'tldr-wordmark';
    wordmark.innerHTML = 'TLDR<span class="tldr-haz-dot">.</span>';
    left.appendChild(wordmark);

    const stamps = document.createElement('div');
    stamps.className = 'tldr-stamps';

    if (isLoading) {
      const extractStamp = document.createElement('span');
      extractStamp.className = 'tldr-stamp tldr-stamp-extracting';
      extractStamp.textContent = 'EXTRACTING SIGNAL';
      stamps.appendChild(extractStamp);
    } else {
      const slopStamp = document.createElement('span');
      slopStamp.className = 'tldr-stamp tldr-stamp-hazard';
      slopStamp.textContent = 'SLOP REMOVED';
      stamps.appendChild(slopStamp);
      if (statsEl) stamps.appendChild(statsEl);
    }
    left.appendChild(stamps);
    top.appendChild(left);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tldr-close';
    closeBtn.textContent = closeLabel;
    closeBtn.addEventListener('click', dismiss);
    top.appendChild(closeBtn);

    header.appendChild(top);

    const stripe = document.createElement('div');
    stripe.className = 'tldr-hazard-stripe';
    header.appendChild(stripe);

    return header;
  }

  // =============================================
  //  INLINE MODE
  // =============================================

  function condenseInline() {
    const root = findMainContent() || document.body;
    const paragraphs = collectParagraphs(root);

    if (paragraphs.length === 0) {
      showError('\u00d7 NO PARAGRAPHS FOUND');
      return;
    }

    const originalWordCount = paragraphs.reduce(
      (sum, p) => sum + countWords(p.text), 0
    );

    inlineEntries = paragraphs.map((p) => ({
      element: p.element,
      originalHTML: p.element.innerHTML
    }));

    for (const entry of inlineEntries) {
      entry.element.style.opacity = '0.35';
      entry.element.style.transition = 'opacity 0.2s';
    }

    isActive = true;
    createInlineBar(
      `EXTRACTING SIGNAL \u00b7 ${paragraphs.length} PARAGRAPHS`,
      'loading'
    );

    const numbered = paragraphs
      .map((p, i) => `${i + 1}: ${p.text}`)
      .join('\n\n');

    chrome.runtime.sendMessage({
      action: 'condense',
      content: numbered,
      title: document.title,
      wordCount: originalWordCount,
      mode: 'inline',
      densityMode: currentDensity.mode,
      densityLevel: currentDensity.level
    });
  }

  function collectParagraphs(root) {
    const results = [];
    const allP = root.querySelectorAll('p');

    for (const p of allP) {
      if (isInsideSkippable(p, root)) continue;
      const text = p.innerText.trim();
      if (text.length < 40) continue;
      results.push({ element: p, text });
    }

    return results;
  }

  function isInsideSkippable(el, stopAt) {
    let node = el.parentElement;
    while (node && node !== stopAt) {
      if (node.tagName && shouldSkip(node)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function showResultInline(response, originalWordCount) {
    if (!inlineEntries) return;

    const condensed = parseNumberedResponse(response);
    let condensedWordCount = 0;

    for (let i = 0; i < inlineEntries.length; i++) {
      const entry = inlineEntries[i];
      const text = condensed[i + 1];

      entry.element.style.opacity = '';
      entry.element.style.transition = '';

      if (text) {
        if (/^[-\u2013\u2014]$/.test(text.trim())) {
          // Redaction bar for cut paragraphs
          entry.element.style.display = 'none';
        } else {
          entry.element.textContent = text;
          entry.element.style.borderLeft = '3px solid #E5FF00';
          entry.element.style.paddingLeft = '14px';
          condensedWordCount += countWords(text);
        }
      } else {
        condensedWordCount += countWords(entry.element.innerText);
      }
    }

    const cut = originalWordCount - condensedWordCount;
    const pct = Math.round(cut / originalWordCount * 100);
    updateLifetimeScore(cut);

    createInlineBar(
      `SLOP REMOVED \u00b7 <span class="haz">${cut.toLocaleString()} WORDS</span> \u00b7 ${pct}% LESS`,
      'success'
    );
  }

  function parseNumberedResponse(text) {
    const result = {};
    const regex = /^(\d+):\s*(.+)/gm;
    let match;
    while ((match = regex.exec(text)) !== null) {
      result[parseInt(match[1])] = match[2].trim();
    }
    return result;
  }

  // --- Inline bar ---

  function createInlineBar(statsHTML, mode) {
    if (inlineBar) {
      if (inlineBar.__keyHandler)
        document.removeEventListener('keydown', inlineBar.__keyHandler);
      inlineBar.remove();
    }

    const isLoading = mode === 'loading';
    const isError = mode === 'error';

    inlineBar = document.createElement('div');
    inlineBar.id = 'tldr-inline-bar';
    if (isError) inlineBar.classList.add('tldr-bar-error');

    inlineBar.innerHTML = `
      <div class="tldr-bar-main">
        <span class="tldr-bar-wordmark">TLDR<span class="tldr-bar-dot">.</span></span>
        ${isLoading ? '<span class="tldr-bar-spinner"></span>' : ''}
        <span class="tldr-bar-stats">${statsHTML}</span>
        ${!isLoading ? '<button class="tldr-bar-close tldr-bar-settings">\u2699 SETTINGS</button>' : ''}
        <button class="tldr-bar-close tldr-bar-undo">${isLoading ? '\u00d7 CANCEL' : '\u00d7 UNDO'}</button>
        ${!isLoading ? '<button class="tldr-bar-close tldr-bar-dismiss">\u00d7 CLOSE</button>' : ''}
      </div>
      <div class="tldr-bar-stripe"></div>`;

    document.body.appendChild(inlineBar);

    inlineBar.querySelector('.tldr-bar-undo').addEventListener('click', dismiss);
    const settingsBtn = inlineBar.querySelector('.tldr-bar-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });
    const dismissBtn = inlineBar.querySelector('.tldr-bar-dismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', dismissBarOnly);
    inlineBar.__keyHandler = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', inlineBar.__keyHandler);
  }

  function dismissBarOnly() {
    if (inlineBar) {
      if (inlineBar.__keyHandler)
        document.removeEventListener('keydown', inlineBar.__keyHandler);
      inlineBar.remove();
      inlineBar = null;
    }
  }

  // =============================================
  //  ERROR HANDLING
  // =============================================

  function showError(message) {
    if (currentMode === 'inline') {
      if (inlineEntries) {
        for (const entry of inlineEntries) {
          entry.element.innerHTML = entry.originalHTML;
          entry.element.style.opacity = '';
          entry.element.style.transition = '';
        }
        inlineEntries = null;
      }
      createInlineBar(esc(message), 'error');
      setTimeout(() => {
        if (inlineBar && inlineBar.classList.contains('tldr-bar-error'))
          dismiss();
      }, 5000);
      return;
    }

    if (!overlay) createOverlay();
    overlay.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'tldr-container';

    const header = makeOverlayHeader('\u00d7 CLOSE', false);
    container.appendChild(header);

    const errDiv = document.createElement('div');
    errDiv.className = 'tldr-error';
    errDiv.textContent = message;
    container.appendChild(errDiv);

    overlay.appendChild(container);
  }

  // =============================================
  //  LIFETIME SCORE
  // =============================================

  function updateLifetimeScore(wordsCut) {
    if (wordsCut <= 0) return;
    chrome.storage.local.get('lifetimeWordsCut', (s) => {
      const newTotal = (s.lifetimeWordsCut || 0) + wordsCut;
      chrome.storage.local.set({ lifetimeWordsCut: newTotal });
    });
  }

  // =============================================
  //  CONTENT EXTRACTION
  // =============================================

  function extractAllContent() {
    const root = findMainContent() || document.body;
    const sections = extractSections(root);

    let text = '';
    for (const s of sections) {
      if (s.heading) text += `## ${s.heading}\n\n`;
      text += s.paragraphs.join('\n\n') + '\n\n';
    }

    const trimmed = text.trim();
    return { text: trimmed, wordCount: countWords(trimmed) };
  }

  function extractSections(root) {
    const sections = [];
    let current = { heading: null, paragraphs: [] };

    function walk(el) {
      if (!el || !el.tagName || shouldSkip(el)) return;

      const tag = el.tagName;

      if (/^H[1-6]$/.test(tag)) {
        if (current.paragraphs.length) sections.push(current);
        current = { heading: el.innerText.trim(), paragraphs: [] };
        return;
      }
      if (tag === 'P' || tag === 'TD') {
        const t = el.innerText.trim();
        if (t.length > 30) current.paragraphs.push(t);
        return;
      }
      if (tag === 'LI') {
        const t = el.innerText.trim();
        if (t.length > 15) current.paragraphs.push('\u2022 ' + t);
        return;
      }
      if (tag === 'BLOCKQUOTE' || tag === 'PRE') {
        const t = el.innerText.trim();
        if (t.length > 20) current.paragraphs.push(t);
        return;
      }

      for (const child of el.children) walk(child);
    }

    walk(root);
    if (current.paragraphs.length) sections.push(current);
    return sections;
  }

  // =============================================
  //  SHARED HELPERS
  // =============================================

  function findMainContent() {
    const selectors = [
      'article', '[role="main"]', 'main',
      '.post-content', '.article-content', '.entry-content',
      '.post-body', '.article-body', '.story-body',
      '#content', '.content', '.post', '.article'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) return el;
    }

    let best = null;
    let bestLen = 0;
    for (const el of document.querySelectorAll('div, section')) {
      let len = 0;
      for (const p of el.querySelectorAll('p')) {
        len += p.innerText.trim().length;
      }
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    }
    return best;
  }

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NAV', 'FOOTER', 'HEADER', 'ASIDE', 'NOSCRIPT',
    'SVG', 'FORM', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IFRAME',
    'FIGURE', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'MAP'
  ]);

  const SKIP_PATTERN =
    /nav|menu|sidebar|footer|header|comment|share|social|related|ad[-_]|ads[-_]|advertisement|signup|subscribe|newsletter|cookie|banner|popup|modal|breadcrumb|pagination|toc|table-of-contents/i;

  function shouldSkip(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    const combined = `${el.className} ${el.id}`;
    return SKIP_PATTERN.test(combined);
  }

  function countWords(text) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  // =============================================
  //  MARKDOWN → DOM RENDERER
  // =============================================

  function renderMarkdownDOM(md, container) {
    const lines = md.split('\n');
    let currentUl = null;
    let currentLi = null;
    let subUl = null;

    function closeSubList() {
      if (subUl) {
        currentLi.appendChild(subUl);
        subUl = null;
      }
    }

    function closeTopList() {
      closeSubList();
      if (currentUl) {
        container.appendChild(currentUl);
        currentUl = null;
        currentLi = null;
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const isSubBullet = /^\s{2,}[-*]\s/.test(line);
      const isTopBullet = !isSubBullet && /^[-*]\s/.test(trimmed);
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);

      if (!isSubBullet && subUl) closeSubList();
      if (!isTopBullet && !isSubBullet && currentUl) closeTopList();

      if (headingMatch) {
        const tag = headingMatch[1].length <= 2 ? 'h2' : 'h3';
        const el = document.createElement(tag);
        appendFormattedText(el, headingMatch[2]);
        container.appendChild(el);
      } else if (isTopBullet) {
        if (!currentUl) currentUl = document.createElement('ul');
        currentLi = document.createElement('li');
        appendFormattedText(currentLi, trimmed.replace(/^[-*]\s+/, ''));
        currentUl.appendChild(currentLi);
      } else if (isSubBullet) {
        if (!subUl) subUl = document.createElement('ul');
        const li = document.createElement('li');
        appendFormattedText(li, trimmed.replace(/^[-*]\s+/, ''));
        subUl.appendChild(li);
      } else {
        const p = document.createElement('p');
        appendFormattedText(p, trimmed);
        container.appendChild(p);
      }
    }

    closeTopList();
  }

  function appendFormattedText(parent, text) {
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }

      if (match[2]) {
        const strong = document.createElement('strong');
        strong.textContent = match[2];
        parent.appendChild(strong);
      } else if (match[3]) {
        const em = document.createElement('em');
        em.textContent = match[3];
        parent.appendChild(em);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
