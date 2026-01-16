# WhatFits

**Preference-aligned supplement evaluation** — A Chrome extension that helps you understand if products align with your stated goals, without providing medical advice.

## What It Does

- **Product Page Analysis**: Evaluates if a supplement aligns with your stated preferences (goals, dietary restrictions, current stack)
- **Cart Coherence Check**: Identifies redundancies and mismatches across your cart items
- **Transparent Confidence**: Shows data completeness so you know what the analysis is based on

## Quick Start

### 1. Install the Extension
1. Clone this repository
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the `WhatFits` folder

### 2. Add Your API Key
1. Click the WhatFits extension icon
2. Go to **Settings** tab
3. Enter your OpenAI API key (`sk-...`)
4. Set your preferences (goals, dietary, etc.)
5. Click **Save Context**

### 3. Use It
- Navigate to any product page on `fr.myprotein.com`
- Click the extension icon → **Check Alignment**
- For cart analysis: go to cart page → **Check Cart Coherence**

## Supported Merchant

**v1 supports:** `fr.myprotein.com` only

## Project Structure

```
WhatFits/
├── manifest.json         # Chrome Manifest V3
├── .env.example          # API key template
├── popup/                # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/              # Page data extraction
│   └── content.js
├── background/
│   └── service-worker.js
├── lib/                  # Core modules
│   ├── storage.js        # Chrome storage wrapper
│   ├── rules.js          # Deterministic rules
│   └── llm.js            # OpenAI integration
└── icons/
```

## How It Works

1. **Data Extraction**: Content script extracts product info from MyProtein pages
2. **Deterministic Rules**: Checks for stimulants, redundancies, dietary mismatches (no LLM)
3. **LLM Analysis**: GPT-4o-mini evaluates alignment with your stated preferences
4. **Structured Output**: JSON schema-locked responses prevent non-compliant outputs

## Important Disclaimers

> **This tool evaluates alignment with your stated preferences. It does NOT provide medical or nutritional advice.**

- No dosage guidance
- No health outcome claims
- No condition-based recommendations
- Outputs are framed as "matches/does not match your stated preference"

## Requirements

- Chrome browser (Manifest V3)
- OpenAI API key (GPT-4o-mini)

## License

MIT

## Privacy & Security

- **Local Storage Only**: Your User Context (goals, preferences) and OpenAI API Key are stored strictly in your browser's local storage (`chrome.storage.local`).
- **Direct API Calls**: The extension communicates directly from your browser to the OpenAI API. No intermediate server is used.
- **Data Usage**: Only the product data from the current page/cart and your anonymized preference context are sent to OpenAI for analysis. No other browsing history is tracked or transmitted.
