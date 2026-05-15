// TLDR — Background Service Worker
// Handles LLM API calls, prompt building, and keyboard shortcuts

// =============================================
//  DENSITY-LEVEL DESCRIPTIONS
// =============================================

const OVERLAY_DENSITY = {
  smart: `CORE PRINCIPLE: Information density determines condensation ratio.
- High-density content (specific facts, data, numbers, technical details, key claims) → preserve nearly verbatim as bullets
- Medium-density content (explanations, context, examples) → condense to essential points
- Low-density content (filler, repetition, marketing, hedging language) → aggressively condense or omit`,
  1: `CONDENSATION TARGET: ~20% reduction.
Light touch — remove only obvious filler, redundancy, and padding. Keep most content, explanations, and context. Preserve the author's voice and narrative flow.`,
  2: `CONDENSATION TARGET: ~35% reduction.
Remove filler phrases, hedging, and repetitive statements. Keep key explanations and important context. Streamline without losing substance.`,
  3: `CONDENSATION TARGET: ~50% reduction.
Focus on key facts, claims, and data. Condense explanations to essentials. Remove all padding and filler.`,
  4: `CONDENSATION TARGET: ~65% reduction.
Key points and supporting data only. Minimize explanations. Be terse and direct. Every sentence must carry weight.`,
  5: `CONDENSATION TARGET: 75-85% reduction. This is NON-NEGOTIABLE — the output must be drastically shorter than the input.
Executive bullet summary. Ruthlessly compress: merge related points, drop all examples and anecdotes, strip attribution and sourcing, eliminate any context a knowledgeable reader can infer. A 2000-word article should become ~10-15 bullets max. Each bullet ≤15 words. No sub-bullets. No prose. No section headings beyond one top-level heading. If a fact isn't decision-relevant, cut it.`
};

const INLINE_DENSITY = {
  smart: `DENSITY CALIBRATION:
- A paragraph full of specific facts, data, or technical details → condense lightly, keep most content
- A paragraph making one point with lots of filler → one sentence
- A paragraph that is pure marketing fluff → one short sentence capturing the core claim
- A very short paragraph that is already concise → return it mostly unchanged`,
  1: `Lightly condense each paragraph by ~20%. Remove only obvious filler words and redundant phrases. Keep paragraph structure and most content intact. Preserve the author's voice.`,
  2: `Condense each paragraph by ~35%. Remove filler, hedging, and redundancy while keeping key explanations and important nuance.`,
  3: `Condense each paragraph to roughly half its length. Focus on the core message and key facts.`,
  4: `Condense each paragraph to 1-2 sentences. Extract only the key point and essential supporting data.`,
  5: `EXTREME condensation — 75-85% word reduction is NON-NEGOTIABLE.
For each paragraph, you MUST either:
  (a) Condense it to a single clause of ≤12 words, OR
  (b) Return "—" if the paragraph repeats an earlier point, gives an example/anecdote, or adds no unique fact.
At least 40% of paragraphs should be marked "—". The remaining paragraphs must be brutally short.
Strip ALL: attribution, hedging, examples, transitions, context a reader can infer.
Example output:
1: Revenue grew 23% to $4.2B driven by cloud.
2: —
3: CEO warned margins will compress next quarter.
4: —`
};

// =============================================
//  PROMPT BUILDERS
// =============================================

function buildOverlayPrompt(densityMode, densityLevel) {
  const densitySection =
    densityMode === 'smart'
      ? OVERLAY_DENSITY.smart
      : OVERLAY_DENSITY[densityLevel] || OVERLAY_DENSITY[3];

  const isExecSummary = densityMode !== 'smart' && densityLevel >= 5;

  const outputFormat = isExecSummary
    ? `OUTPUT FORMAT:
# [Core topic in ≤8 words]
- Bullet (≤15 words each)
- No sub-bullets. No section headings. No prose. 10-15 bullets max for a full article.`
    : `OUTPUT FORMAT:
Start with a single # heading that captures the page's core topic.
Then use ## for section headings, followed by bullet points.

## [Descriptive Section Headline]
- Key factual point as a concise bullet
- Another important point
  - Supporting detail or data point`;

  const rules = isExecSummary
    ? `RULES:
1. 75-85% reduction is mandatory — count your output words and verify
2. Preserve only: key numbers, names, and decision-relevant claims
3. Merge related points into single bullets
4. Drop all anecdotes, examples, quotes, and attribution
5. No meta-commentary
6. If the entire article makes one point, 5 bullets is enough`
    : `RULES:
1. Every bullet must carry genuine, standalone information
2. Preserve ALL: numbers, percentages, dates, names, technical terms, specific claims, data points
3. Remove ALL: "In this article...", "As we discussed...", filler transitions, hedging, repetition of points already made
4. If a section adds no new information, omit it
5. Do not add information not in the original
6. No meta-commentary about the summary itself (no "Here's a summary..." or "Key takeaways:")
7. Use sub-bullets only for important supporting details, not padding`;

  return `You are TLDR, an information density optimizer. Condense web content while maximizing preservation of valuable information.

${densitySection}

${outputFormat}

${rules}

Goal: Maximize information value per word read.`;
}

function buildInlinePrompt(densityMode, densityLevel) {
  const densitySection =
    densityMode === 'smart'
      ? INLINE_DENSITY.smart
      : INLINE_DENSITY[densityLevel] || INLINE_DENSITY[3];

  return `You condense paragraphs individually while preserving their key information.

Each input paragraph is numbered. Return ONLY the condensed paragraphs with matching numbers.

${densitySection}

RULES:
- Preserve ALL: numbers, percentages, dates, names, technical terms, specific claims
- Remove: filler phrases, unnecessary hedging, redundant statements, marketing fluff
- Do NOT add information not in the original
- Do NOT add commentary, headers, or any text besides the numbered condensed lines
- Every condensed paragraph must be a complete, grammatical sentence

Output format — one per line, same numbers as input:
1: [condensed text]
2: [condensed text]`;
}

// =============================================
//  MESSAGE HANDLING
// =============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'condense') {
    const tabId = sender.tab?.id || message.tabId;
    handleCondense(
      tabId,
      message.content,
      message.title,
      message.wordCount,
      message.mode || 'overlay',
      message.densityMode || 'smart',
      message.densityLevel || 3
    );
    sendResponse({ ok: true });
  }
  return true;
});

// Inject content script into a tab on demand
async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content.css']
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'condense-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await injectContentScript(tab.id);
        await chrome.tabs.sendMessage(tab.id, { action: 'trigger' });
      } catch {
        // Content script not loaded — happens on chrome:// pages
      }
    }
  }
});

// =============================================
//  AUTO-RUN ON PAGE LOAD
// =============================================

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  // Skip non-web pages
  if (
    !tab.url ||
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('edge://') ||
    tab.url === 'chrome://newtab/'
  ) {
    return;
  }

  const { autoRun, apiKey } = await chrome.storage.sync.get(['autoRun', 'apiKey']);
  if (!autoRun || !apiKey) return;

  try {
    await injectContentScript(tabId);
    // Brief delay so the page DOM is fully settled
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'trigger' }).catch(() => {});
    }, 800);
  } catch {
    // Can't inject into this page — ignore
  }
});

// =============================================
//  LLM CALLS
// =============================================

async function handleCondense(tabId, content, title, wordCount, mode, densityMode, densityLevel) {
  const settings = await chrome.storage.sync.get([
    'provider', 'apiKey', 'model', 'baseUrl'
  ]);

  if (!settings.apiKey) {
    chrome.tabs.sendMessage(tabId, {
      action: 'error',
      error: 'No API key configured. Click the TLDR extension icon to set up.'
    });
    return;
  }

  const systemPrompt =
    mode === 'inline'
      ? buildInlinePrompt(densityMode, densityLevel)
      : buildOverlayPrompt(densityMode, densityLevel);

  const userPrompt =
    mode === 'inline'
      ? `Paragraphs:\n\n${content}`
      : `Page title: ${title}\n\nContent:\n${content}`;

  try {
    const result = await callLLM(settings, systemPrompt, userPrompt);
    chrome.tabs.sendMessage(tabId, {
      action: 'result',
      markdown: result,
      originalWordCount: wordCount
    });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      action: 'error',
      error: err.message || 'Unknown error calling LLM API'
    });
  }
}

async function callLLM(settings, systemPrompt, userPrompt) {
  const provider = settings.provider || 'openai';
  if (provider === 'anthropic') {
    return callAnthropic(settings, systemPrompt, userPrompt);
  }
  return callOpenAI(settings, systemPrompt, userPrompt);
}

async function callOpenAI(settings, systemPrompt, userPrompt) {
  const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(
    /\/+$/,
    ''
  );
  const model = settings.model || 'gpt-4o-mini';

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4096
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}

async function callAnthropic(settings, systemPrompt, userPrompt) {
  const model = settings.model || 'claude-haiku-4-5-20251001';

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.2
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.content[0].text;
}
