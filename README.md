<div align="center">
  <img src="icons/icon128.png" width="128" alt="WhatFits Logo" />
</div>

# WhatFits

**Your opinionated supplement advisor.** A Chrome extension that analyzes products on MyProtein and chats with you to see if they fit your specific fitness goals.

## Core Features

- **Chat-First Experience**: Instead of static reports, chat directly with the product. Ask "Is this good for my bad knees?" or "Does this have hidden sugars?"
- **Opinionated Analysis**: Acts as a critical expert. It checks protein density, marketing vs. reality, and ingredient quality. It won't sugarcoat the truth.
- **Deep Data Extraction**: Extracts hidden details like **Nutrition Panels** and **Ingredient Lists** directly from page accordions to find what marketing hides.
- **Privacy Focused**: Data stays local. API keys are stored in your browser only.

---

## Installation (Local Development)

### Prerequisites
- **Google Chrome** (or Chromium-based browser)
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

### Step-by-Step Setup

#### 1. Clone the Repository
```bash
git clone https://github.com/WiwiC/WhatFits.git
cd WhatFits
```

#### 2. Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `WhatFits` folder you just cloned

#### 3. Configure Your Profile
1. Click the **WhatFits icon** in your browser toolbar
2. Go to the **Profile** tab and complete your profile
3. Enter your **OpenAI API Key** (starts with `sk-...`)
4. Fill in your fitness profile:
   - Goals (e.g., Muscle Gain, Weight Loss)
   - Dietary restrictions (e.g., Vegetarian, Lactose-free)
   - Constraints (e.g., Joint Issues, Avoid Stimulants)
5. Click **Save Context**

#### 4. Start Chatting!
1. Navigate to any product on [fr.myprotein.com](https://fr.myprotein.com)
2. Click the WhatFits extension icon
3. Click **"Start Chat"** to load the product
4. Ask questions like:
   - *"Does this product suits my goals?"*
   - *"Is this good for muscle recovery?"*
   - *"Any hidden sugars or fillers?"*
   - *"How does the protein ratio compare to competitors?"*

---

## How It Works

1. **Data Extraction**: Pulls product data from MyProtein pages:
   - DOM Elements: Badges, titles, prices
   - Accordion HTML: Ingredients, Nutrition panels (preserves tables and allergen highlights)

2. **Context-Aware LLM**:
   - Uses `gpt-4.1-mini` for fast, cost-effective analysis
   - Injects your fitness profile into every prompt
   - Compares marketing claims vs. actual nutrition data

---

## Supported Merchant
- **v1**: `fr.myprotein.com` only

---

## Project Structure

```
WhatFits/
├── manifest.json         # Chrome Manifest V3 config
├── content/
│   └── content.js        # Page data extraction logic
├── lib/
│   ├── llm.js            # OpenAI API integration
│   └── storage.js        # Chrome storage wrappers
├── popup/
│   ├── popup.html        # Extension UI
│   ├── popup.js          # Chat logic & state management
│   └── popup.css         # Styling
├── background/
│   └── service-worker.js # Background service worker
└── icons/                # Extension icons
```

---

## Privacy & Security

- **Local Storage Only**: Your API key and preferences are stored in `chrome.storage.local` (never sent to any server except OpenAI)
- **Direct API Calls**: Requests go directly from your browser to OpenAI. No intermediary servers.
- **No Tracking**: We don't collect any data about your browsing or usage.

---

## License
MIT
