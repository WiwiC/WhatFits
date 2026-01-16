# WhatFits

**Your opinionated supplement advisor.** A Chrome extension that analyzes products on MyProtein and chats with you to see if they fit your specific fitness goals.

## Core Features

- **Chat-First Experience**: Instead of static reports, chat directly with the product. Ask "Is this good for my bad knees?" or "Does this have hidden sugars?"
- **Opinionated Analysis**: Acts as a critical expert. It checks protein density, marketing vs. reality, and ingredient quality. It won't sugarcoat the truth.
- **Deep Data Extraction**: Extracts hidden details like **Nutrition Panels** and **Ingredient Lists** directly from page accordions to find what marketing hides.
- **Privacy Focused**: data stays local. API keys are stored in your browser.

## How It Works

1. **Hybrid Extraction**: We use a custom extraction engine that pulls data from:
   - **DOM Elements**: Badges, titles, prices.
   - **Accordion HTML**: We parse the raw HTML of "Ingredients" and "Nutrition" tabs to preserve tables and bold text (allergens).
   - *Note: We specifically ignore generic marketing descriptions to focus on hard data.*

2. **Context-Aware LLM**:
   - Uses `gpt-4.1-mini-2025-04-14` for high-speed, cost-effective analysis.
   - Inject your **User Context** (goals, injuries, dietary style) into every prompt.
   - Checks against **Product Data** (ingredients, macros, claims).

## Quick Start

### 1. Install
1. Clone this repository.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `WhatFits` folder.

### 2. Configure
1. Click the WhatFits icon.
2. Go to **Settings** tab.
3. Enter your **OpenAI API Key** (`sk-...`).
4. Fill in your profile (e.g., "Muscle Gain", "Avoid Stimulants", "Joint Issues").

### 3. Use
1. Navigate to any product on [fr.myprotein.com](https://fr.myprotein.com).
2. Open the extension.
3. Click **"Load Product"** to start chatting.
   - *Try asking:* "Is this good for recovery?", "Any ingredients I should worry about?", "How does the protein ratio look?"

## Supported Merchant
- **v1**: `fr.myprotein.com` only.

## Project Structure

```
WhatFits/
├── manifest.json         # Manifest V3 configuration
├── content/              # Extraction Logic
│   └── content.js        # Hybrid accordion/DOM parser
├── lib/                  # Core Logic
│   ├── llm.js            # OpenAI Chat interface & System Prompts
│   └── storage.js        # Local storage wrappers
├── popup/                # UI
│   ├── popup.html        # Chat interface & Settings form
│   ├── popup.js          # Logic for chat, history, and state management
│   └── popup.css         # Styling
└── background/           # Service Workers
```

## Privacy & Security
- **Local Storage Only**: Your API Key and preferences never leave your browser storage until a request is made.
- **Direct API Mode**: Requests go directly from your browser to OpenAI. No middleman servers.

## License
MIT
