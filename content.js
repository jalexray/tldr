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
    // Use document.body for inline mode — we want to condense ALL visible
    // text on the page (comments, sidebars, etc.), not just the "main article".
    // The skip patterns filter out nav/footer/ads.
    const paragraphs = collectParagraphs(document.body);

    if (paragraphs.length === 0) {
      showError('\u00d7 NO PARAGRAPHS FOUND');
      return;
    }

    const originalWordCount = paragraphs.reduce(
      (sum, p) => sum + countWords(p.text), 0
    );

    inlineEntries = paragraphs.map((p) => ({
      element: p.element,
      originalHTML: p.element.innerHTML,
      links: p.links || []
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

    for (const el of root.querySelectorAll('p, li')) {
      if (isInsideSkippable(el, root)) continue;

      // Skip <li> elements that contain nested lists (avoid double-counting)
      if (el.tagName === 'LI' && el.querySelector('ul, ol')) continue;

      const text = el.innerText.trim();
      if (text.length < 30) continue;

      // Collect links for re-attachment after condensation
      const links = [];
      for (const a of el.querySelectorAll('a[href]')) {
        const linkText = a.textContent.trim();
        if (linkText.length > 0) {
          links.push({ text: linkText, href: a.href });
        }
      }

      results.push({ element: el, text, links });
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
          setTextWithLinks(entry.element, text, entry.links);
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
        <button class="tldr-bar-close tldr-bar-undo">${isLoading ? '\u00d7 CANCEL' : '\u00d7 UNDO'}</button>
        ${!isLoading ? '<button class="tldr-bar-close tldr-bar-dismiss">\u00d7 CLOSE</button>' : ''}
      </div>
      <div class="tldr-bar-stripe"></div>`;

    document.body.appendChild(inlineBar);

    inlineBar.querySelector('.tldr-bar-undo').addEventListener('click', dismiss);
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
    /\b(nav|menu|sidebar|footer|header|share|social|related|advertisement|cookie|banner|breadcrumb|pagination|toc|table-of-contents)\b/i;

  function shouldSkip(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    const combined = `${el.className} ${el.id}`;
    return SKIP_PATTERN.test(combined);
  }

  function countWords(text) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  // Re-attaches links from the original paragraph to the condensed text.
  // Matching strategy (in order):
  //   1. Exact match of link text
  //   2. Case-insensitive match of link text
  //   3. Longest significant word (5+ chars) from link text, whole-word match
  // If nothing matches, the link is dropped gracefully.
  function setTextWithLinks(element, text, links) {
    element.innerHTML = '';

    if (!links || links.length === 0) {
      element.textContent = text;
      return;
    }

    const matches = [];
    for (const link of links) {
      const found = findLinkInText(text, link.text, matches);
      if (found) {
        matches.push({ start: found.start, end: found.end, href: link.href, text: found.matched });
      }
    }

    if (matches.length === 0) {
      element.textContent = text;
      return;
    }

    // Sort by position, remove overlaps
    matches.sort((a, b) => a.start - b.start);
    const clean = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        clean.push(m);
        lastEnd = m.end;
      }
    }

    // Build DOM nodes: text + links interleaved
    let pos = 0;
    for (const m of clean) {
      if (m.start > pos) {
        element.appendChild(document.createTextNode(text.slice(pos, m.start)));
      }
      const a = document.createElement('a');
      a.href = m.href;
      a.textContent = m.text;
      a.style.color = 'inherit';
      a.style.textDecoration = 'underline';
      element.appendChild(a);
      pos = m.end;
    }
    if (pos < text.length) {
      element.appendChild(document.createTextNode(text.slice(pos)));
    }
  }

  function findLinkInText(text, linkText, existing) {
    // 1. Exact match
    let idx = text.indexOf(linkText);
    if (idx !== -1 && !overlaps(idx, idx + linkText.length, existing)) {
      return { start: idx, end: idx + linkText.length, matched: text.slice(idx, idx + linkText.length) };
    }

    // 2. Case-insensitive match
    const lower = text.toLowerCase();
    idx = lower.indexOf(linkText.toLowerCase());
    if (idx !== -1 && !overlaps(idx, idx + linkText.length, existing)) {
      return { start: idx, end: idx + linkText.length, matched: text.slice(idx, idx + linkText.length) };
    }

    // 3. Longest significant word from link text (5+ chars), whole-word match
    const words = linkText.split(/\s+/).filter(w => w.length >= 5);
    words.sort((a, b) => b.length - a.length); // longest first
    for (const word of words) {
      const wordRe = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const m = wordRe.exec(text);
      if (m && !overlaps(m.index, m.index + m[0].length, existing)) {
        return { start: m.index, end: m.index + m[0].length, matched: m[0] };
      }
    }

    return null;
  }

  function overlaps(start, end, existing) {
    return existing.some(m => start < m.end && end > m.start);
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
