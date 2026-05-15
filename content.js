// TLDR — Content Script
// Extracts page content, sends to LLM, renders condensed result

(() => {
  if (window.__tldrLoaded) return;
  window.__tldrLoaded = true;

  let isActive = false;
  let currentMode = 'overlay'; // 'overlay' | 'inline'
  let currentDensity = { mode: 'smart', level: 3 };
  const MAX_WORDS = 8000;

  // Overlay mode state
  let overlay = null;

  // Inline mode state — one entry per condensed paragraph
  let inlineEntries = null; // [{ element, originalHTML }, ...]
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

    // Restore inline paragraphs
    if (inlineEntries) {
      for (const entry of inlineEntries) {
        entry.element.innerHTML = entry.originalHTML;
        entry.element.style.opacity = '';
        entry.element.style.transition = '';
        entry.element.style.display = '';
      }
      inlineEntries = null;
    }
    if (inlineBar) {
      if (inlineBar.__keyHandler)
        document.removeEventListener('keydown', inlineBar.__keyHandler);
      inlineBar.remove();
      inlineBar = null;
    }

    // Dismiss overlay
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
    const settings = await chrome.storage.sync.get([
      'displayMode', 'densityMode', 'densityLevel'
    ]);
    currentMode = settings.displayMode || 'overlay';
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
      showError('Not enough content on this page to condense.');
      return;
    }

    const text =
      wordCount > MAX_WORDS
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
    el.innerHTML = `
      <div class="tldr-container">
        <div class="tldr-header">
          <div class="tldr-header-left">
            <span class="tldr-logo">TLDR</span>
            <span class="tldr-stats">${wordCount.toLocaleString()} words detected</span>
          </div>
          <button class="tldr-close" id="tldr-close">&times; Close</button>
        </div>
        <div class="tldr-loading">
          <div class="tldr-spinner"></div>
          <div class="tldr-loading-text">Condensing page&hellip;</div>
        </div>
      </div>`;
    el.querySelector('#tldr-close').addEventListener('click', dismiss);
  }

  function showResultOverlay(markdown, originalWordCount) {
    if (!overlay) createOverlay();

    const condensedWords = countWords(markdown);
    const reduction = Math.round(
      (1 - condensedWords / originalWordCount) * 100
    );
    const html = renderMarkdown(markdown);

    overlay.innerHTML = `
      <div class="tldr-container">
        <div class="tldr-header">
          <div class="tldr-header-left">
            <span class="tldr-logo">TLDR</span>
            <span class="tldr-stats">
              ${originalWordCount.toLocaleString()} &rarr; ${condensedWords.toLocaleString()} words
              <strong>(${reduction}% less reading)</strong>
            </span>
          </div>
          <button class="tldr-close" id="tldr-close">&times; Show original</button>
        </div>
        <div class="tldr-content">${html}</div>
      </div>`;
    overlay.querySelector('#tldr-close').addEventListener('click', dismiss);
    overlay.scrollTop = 0;
  }

  // =============================================
  //  INLINE MODE — per-paragraph replacement
  // =============================================

  function condenseInline() {
    const root = findMainContent() || document.body;
    const paragraphs = collectParagraphs(root);

    if (paragraphs.length === 0) {
      showError('No paragraphs found to condense.');
      return;
    }

    const originalWordCount = paragraphs.reduce(
      (sum, p) => sum + countWords(p.text),
      0
    );

    // Store originals for restoration
    inlineEntries = paragraphs.map((p) => ({
      element: p.element,
      originalHTML: p.element.innerHTML
    }));

    // Dim each paragraph to indicate processing
    for (const entry of inlineEntries) {
      entry.element.style.opacity = '0.35';
      entry.element.style.transition = 'opacity 0.2s';
    }

    isActive = true;
    createInlineBar(
      `Condensing ${paragraphs.length} paragraphs&hellip;`,
      true
    );

    // Build numbered text for the LLM
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
      const text = condensed[i + 1]; // response is 1-indexed

      entry.element.style.opacity = '';
      entry.element.style.transition = '';

      if (text) {
        // LLM marked paragraph as redundant — hide it entirely
        if (/^[-–—]$/.test(text.trim())) {
          entry.element.style.display = 'none';
        } else {
          entry.element.textContent = text;
          condensedWordCount += countWords(text);
        }
      } else {
        // No condensed version — keep original
        condensedWordCount += countWords(entry.element.innerText);
      }
    }

    const reduction = Math.round(
      (1 - condensedWordCount / originalWordCount) * 100
    );
    createInlineBar(
      `${originalWordCount.toLocaleString()} &rarr; ${condensedWordCount.toLocaleString()} words <strong>(${reduction}% less reading)</strong>`,
      false
    );
  }

  function parseNumberedResponse(text) {
    const result = {};
    // Match lines like "1: condensed text" — handles multiline by being greedy per entry
    const regex = /^(\d+):\s*(.+)/gm;
    let match;
    while ((match = regex.exec(text)) !== null) {
      result[parseInt(match[1])] = match[2].trim();
    }
    return result;
  }

  // --- Inline bar (floating notification) ---

  function createInlineBar(statsHTML, isLoading) {
    if (inlineBar) {
      if (inlineBar.__keyHandler)
        document.removeEventListener('keydown', inlineBar.__keyHandler);
      inlineBar.remove();
    }

    inlineBar = document.createElement('div');
    inlineBar.id = 'tldr-inline-bar';
    if (isLoading) inlineBar.classList.add('tldr-bar-loading');

    inlineBar.innerHTML = `
      <div class="tldr-bar-inner">
        <span class="tldr-bar-logo">TLDR</span>
        ${isLoading ? '<span class="tldr-bar-spinner"></span>' : ''}
        <span class="tldr-bar-stats">${statsHTML}</span>
        <button class="tldr-bar-close">${isLoading ? 'Cancel' : 'Show original'}</button>
      </div>`;

    document.body.appendChild(inlineBar);

    inlineBar
      .querySelector('.tldr-bar-close')
      .addEventListener('click', dismiss);
    inlineBar.__keyHandler = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', inlineBar.__keyHandler);
  }

  // =============================================
  //  ERROR HANDLING
  // =============================================

  function showError(message) {
    if (currentMode === 'inline') {
      // Restore dimmed paragraphs
      if (inlineEntries) {
        for (const entry of inlineEntries) {
          entry.element.innerHTML = entry.originalHTML;
          entry.element.style.opacity = '';
          entry.element.style.transition = '';
        }
        inlineEntries = null;
      }
      createInlineBar(esc(message), false);
      inlineBar.classList.add('tldr-bar-error');
      setTimeout(() => {
        if (inlineBar && inlineBar.classList.contains('tldr-bar-error'))
          dismiss();
      }, 5000);
      return;
    }

    // Overlay mode
    if (!overlay) createOverlay();
    overlay.innerHTML = `
      <div class="tldr-container">
        <div class="tldr-header">
          <div class="tldr-header-left">
            <span class="tldr-logo">TLDR</span>
          </div>
          <button class="tldr-close" id="tldr-close">&times; Close</button>
        </div>
        <div class="tldr-error">${esc(message)}</div>
      </div>`;
    overlay.querySelector('#tldr-close').addEventListener('click', dismiss);
  }

  // =============================================
  //  CONTENT EXTRACTION (overlay mode)
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
  //  MARKDOWN → HTML RENDERER (overlay mode)
  // =============================================

  function renderMarkdown(md) {
    const lines = md.split('\n');
    const parts = [];
    let ulOpen = false;
    let subOpen = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const isSubBullet = /^\s{2,}[-*]\s/.test(line);
      const isTopBullet = !isSubBullet && /^[-*]\s/.test(trimmed);
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);

      if (!isSubBullet && subOpen) {
        parts.push('</ul></li>');
        subOpen = false;
      }
      if (!isTopBullet && !isSubBullet && ulOpen) {
        parts.push('</ul>');
        ulOpen = false;
      }

      if (headingMatch) {
        const tag = headingMatch[1].length <= 2 ? 'h2' : 'h3';
        parts.push(`<${tag}>${fmt(headingMatch[2])}</${tag}>`);
      } else if (isTopBullet) {
        if (!ulOpen) {
          parts.push('<ul>');
          ulOpen = true;
        }
        parts.push(`<li>${fmt(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      } else if (isSubBullet) {
        if (!subOpen) {
          const last = parts[parts.length - 1];
          if (last && last.endsWith('</li>')) {
            parts[parts.length - 1] = last.slice(0, -5);
          }
          parts.push('<ul>');
          subOpen = true;
        }
        parts.push(`<li>${fmt(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      } else {
        parts.push(`<p>${fmt(trimmed)}</p>`);
      }
    }

    if (subOpen) parts.push('</ul></li>');
    if (ulOpen) parts.push('</ul>');
    return parts.join('\n');
  }

  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fmt(s) {
    let o = esc(s);
    o = o.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    o = o.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return o;
  }
})();
