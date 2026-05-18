# TLDR

![STOP READING SLOP.](cover-photo.png)

Chrome extension that condenses web pages using LLMs. Cut through the slop, keep the signal.

## Features

- **Inline mode** (default) — condenses each paragraph in place, keeping the original page layout. Links are preserved intelligently.
- **Overlay mode** — full-page summary with structured headlines and bullets
- **Density slider** — five levels from FLUFF (~20% reduction) to BARE BONES (~80% reduction), plus a Smart mode that lets the model decide per-paragraph
- **Auto-condense** — optionally runs on every page load, with a domain exclude list (supports wildcards like `*.google.com`)
- **Parallel processing** — long pages are chunked and condensed in parallel for speed
- **Lifetime score** — tracks cumulative words cut, mapped to book equivalents ("The Old Man and the Sea", "War and Peace", etc.)
- **Keyboard shortcut** — Option+T (Mac) / Alt+T (Windows/Linux)

## Install

1. Clone this repo or download the ZIP
2. Go to `chrome://extensions` and enable **Developer Mode** (top right)
3. Click **Load unpacked** and select the repo folder
4. Click the TLDR icon in the toolbar — the first-run screen will walk you through setup

## Setup

On first launch, pick your provider (OpenAI, Anthropic, or a custom OpenAI-compatible endpoint), paste your API key, and click **I Agree · Start Cutting**. Settings are saved locally and never leave your browser.

## Supported providers

| Provider | Default model | Other options |
|---|---|---|
| OpenAI | gpt-4o-mini | gpt-4o, gpt-4.1-mini, gpt-4.1-nano |
| Anthropic | Claude Haiku 4.5 | Claude Sonnet 4.5, Claude Sonnet 4.6 |
| Custom | — | Any OpenAI-compatible endpoint (Ollama, Together, etc.) |

## Risks and caveats

**Use at your own risk.**

- **Page content is sent to a third-party API.** Do not use on pages with sensitive information unless you understand and accept this.
- **Auto-run sends every page you visit.** A warning is shown when you enable this. The extension requests additional permissions only when auto-run is turned on. You can exclude specific domains.
- **API keys are stored locally** in `chrome.storage.local` (on-device only, not synced to Google's cloud).
- **LLM output can be influenced by page content** (prompt injection). The extension escapes all output before rendering, preventing code execution, but summaries could be misleading on adversarial pages.
- **API costs are on you.** Each condensation makes one or more API calls (long pages are chunked into parallel requests). There is no rate limiting.
