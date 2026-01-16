/**
 * WhatFits Content Script
 * Runs on MyProtein pages to extract product data
 */

console.log('[WhatFits] Content script loaded on:', window.location.href);

// Page type detection
const PAGE_TYPE = {
  PRODUCT: 'product',
  CART: 'cart',
  OTHER: 'other'
};

function detectPageType() {
  const url = window.location.href;
  if (url.includes('/p/') || url.includes('/sports-nutrition/')) {
    return PAGE_TYPE.PRODUCT;
  }
  if (url.includes('/cart') || url.includes('/panier') || url.includes('/checkout') || url.includes('/account') || url.includes('/basket')) {
    return PAGE_TYPE.CART;
  }
  return PAGE_TYPE.OTHER;
}

// Message listener for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_PRODUCT') {
    const productData = extractProductData(document);
    console.log('[WhatFits] Extracted product data:', productData);
    sendResponse({ success: true, data: productData });
  } else if (message.type === 'EXTRACT_CART') {
    const cartData = extractCartData();
    // Start async enrichment immediately if requested, or just return shallow
    // For now, return shallow, let popup request enrichment
    console.log('[WhatFits] Extracted shallow cart data:', cartData);
    sendResponse({ success: true, data: cartData });
  } else if (message.type === 'ENRICH_CART') {
    // New handler for deep analysis
    enrichCartItems(message.items).then(enriched => {
      console.log('[WhatFits] Enriched cart data:', enriched);
      sendResponse({ success: true, data: enriched });
    });
    return true; // Async response
  } else if (message.type === 'GET_PAGE_TYPE') {
    sendResponse({ success: true, pageType: detectPageType() });
  }
  return true; // Keep channel open
});

/**
 * Fetch and parse a product page to extract details
 */
async function fetchProductDetails(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    return extractProductData(doc);
  } catch (err) {
    console.error('Failed to fetch product:', url, err);
    return null;
  }
}

/**
 * Enrich a list of cart items with full product details
 */
async function enrichCartItems(items) {
  const enriched = await Promise.all(items.map(async (item) => {
    if (!item.url) return item;

    // Small delay to be polite to the server if many items
    // await new Promise(r => setTimeout(r, 200));

    const details = await fetchProductDetails(item.url);
    if (details) {
      return {
        ...item,
        ingredients: details.ingredients, // Full ingredients!
        claims: details.claims,
        dietaryInfo: details.dietaryInfo,
        warnings: details.warnings,
        enriched: true
      };
    }
    return item;
  }));
  return enriched;
}

/**
 * Extract product badges (dietary labels) from visible DOM
 */
function extractProductBadges(doc) {
  const badges = [];
  const badgeElements = doc.querySelectorAll('.badge.badge-neutral, .product-tags-container .badge');

  for (const badge of badgeElements) {
    const text = badge.textContent.trim();
    if (text && !badges.includes(text)) {
      badges.push(text);
    }
  }

  return badges;
}

/**
 * Extract product subtitle (short description near title)
 */
function extractProductSubtitle(doc) {
  // Try specific MyProtein selector first
  const subtitle = doc.querySelector('#product-details h2.text-gray-500, .product-subtitle, h2[class*="subtitle"]');
  return subtitle ? subtitle.textContent.trim() : null;
}

/**
 * Extract product data from a specific document/context
 * Uses accordion HTML + DOM elements ONLY (no contentData JSON parsing)
 */
function extractProductData(doc = document) {
  const data = {
    url: doc === document ? window.location.href : null,
    title: null,
    subtitle: null,
    price: null,
    missing_data: [],

    // From DOM (badges near title)
    badges: [],
    diet: [],

    // From Accordion HTML sections
    description: null,
    key_benefits: null,
    why_choose: null,
    usage: null,
    ingredients: null,
    nutrition_panel: null,
    product_details: null,

    // Legacy fields (for backward compatibility)
    dietaryInfo: [],
    claims: [],
    warnings: null,
    brand: null,
    dietary_suitability: null
  };

  // 1. Extract basic info from DOM
  data.title = extractTitle(doc);
  if (!data.title) data.missing_data.push('title');

  data.subtitle = extractProductSubtitle(doc);

  data.price = extractPrice(doc);
  if (!data.price) data.missing_data.push('price');

  data.badges = extractProductBadges(doc);

  // 2. Extract ALL data from accordion HTML sections
  data.description = extractAccordionSection(doc, 'description');

  data.key_benefits = extractAccordionSection(doc, 'avantages clés') ||
    extractAccordionSection(doc, 'key benefits');

  data.why_choose = extractAccordionSection(doc, 'pourquoi choisir') ||
    extractAccordionSection(doc, 'why choose');

  data.usage = extractAccordionSection(doc, 'utilisation suggérée') ||
    extractAccordionSection(doc, 'suggested use');

  data.ingredients = extractAccordionSection(doc, 'ingrédients') ||
    extractAccordionSection(doc, 'ingredients');
  if (!data.ingredients) data.missing_data.push('ingredients');

  data.nutrition_panel = extractAccordionSection(doc, 'information nutritionnelle') ||
    extractAccordionSection(doc, 'nutritional information');

  data.product_details = extractAccordionSection(doc, 'product details') ||
    extractAccordionSection(doc, 'détails du produit');

  // 3. Extract diet from badges (visible on page)
  data.diet = data.badges;
  data.dietaryInfo = data.badges;

  // 4. Legacy claims for backward compatibility
  data.claims = [
    ...(data.description ? [`Description: ${data.description.substring(0, 300)}...`] : []),
    ...(data.key_benefits ? [`Benefits: ${data.key_benefits.substring(0, 300)}...`] : [])
  ];

  console.log('[WhatFits] Extracted product data (accordion-only):', data);
  return data;
}

/**
 * Extract product title from context
 */
function extractTitle(doc) {
  const selectors = [
    'h1',
    '[data-testid="product-title"]',
    '.product-title',
    '.productName',
    '[class*="productTitle"]',
    '[class*="product-name"]'
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return null;
}

/**
 * Extract product price from context
 */
function extractPrice(doc) {
  const selectors = [
    '[data-testid="product-price"]',
    '.productPrice',
    '.price',
    '[class*="price"]',
    '[class*="Price"]'
  ];

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent.trim();
      const priceMatch = text.match(/[\d,.]+\s*[€$£]|[€$£]\s*[\d,.]+/);
      if (priceMatch) {
        return priceMatch[0];
      }
    }
  }
  return null;
}



/**
 * Extract content from a specific accordion section by its title
 * Targets the MyProtein accordion-item custom elements
 */
function extractAccordionSection(doc, sectionTitle) {
  const accordionItems = doc.querySelectorAll('accordion-item');

  for (const item of accordionItems) {
    const titleEl = item.querySelector('.accordion-item-title');
    if (!titleEl) continue;

    const title = titleEl.textContent.trim().toLowerCase();
    if (title.includes(sectionTitle.toLowerCase())) {
      const contentEl = item.querySelector('.content');
      if (contentEl) {
        // Return innerHTML to preserve tables and formatting for the LLM
        // Clean up excessive whitespace but keep structure
        return contentEl.innerHTML.replace(/\s+/g, ' ').trim();
      }
    }
  }
  return null;
}



/**
 * Extract cart data - UPDATED TO GRAB URLS
 */
function extractCartData() {
  const data = {
    url: window.location.href,
    items: [],
    total: null,
    missing_data: []
  };

  const cartItemSelectors = [
    '[data-testid="cart-item"]',
    '.cart-item',
    '.basket-item',
    '[class*="cartItem"]',
    '[class*="basket-item"]'
  ];

  let cartItems = [];
  for (const selector of cartItemSelectors) {
    cartItems = document.querySelectorAll(selector);
    if (cartItems.length > 0) break;
  }

  if (cartItems.length === 0) {
    const containers = document.querySelectorAll('[class*="product"], [class*="item"]');
    cartItems = Array.from(containers).filter(el => {
      const hasName = el.querySelector('a, h3, h4, [class*="name"], [class*="title"]');
      const hasPrice = el.textContent.match(/[\d,.]+\s*[€$£]/);
      return hasName && hasPrice;
    });
  }

  cartItems.forEach((item) => {
    const itemData = {
      name: null,
      quantity: 1,
      price: null,
      url: null // New field
    };

    // Extract name & URL
    const nameEl = item.querySelector('a, h3, h4, [class*="name"], [class*="title"]');
    if (nameEl) {
      itemData.name = nameEl.textContent.trim();
      // Try to get href from name element or parent
      const link = nameEl.closest('a') || item.querySelector('a');
      if (link && link.href) {
        // Keep origin if relative, or use absolute
        itemData.url = link.href;
      }
    }

    // Extract quantity
    const qtyEl = item.querySelector('input[type="number"], [class*="quantity"], select');
    if (qtyEl) {
      itemData.quantity = parseInt(qtyEl.value || qtyEl.textContent) || 1;
    }

    // Extract price
    const priceMatch = item.textContent.match(/[\d,.]+\s*[€$£]|[€$£]\s*[\d,.]+/);
    if (priceMatch) {
      itemData.price = priceMatch[0];
    }

    if (itemData.name || itemData.price) {
      data.items.push(itemData);
    }
  });

  // Filter Noise
  const DENY_LIST = [
    'se connecter', 's\'inscrire', 'register', 'login',
    'total', 'sous-total', 'subtotal',
    'ajoutez au panier', 'add to cart',
    'code de réduction', 'discount code',
    'livraison', 'delivery'
  ];

  data.items = data.items.filter(item => {
    if (!item.name) return false;
    const lowerName = item.name.toLowerCase();

    // Check deny list
    const isDenied = DENY_LIST.some(term => lowerName.includes(term));
    if (isDenied) return false;
    if (lowerName.length < 3) return false;
    // Check if name looks like a price only
    if (/^[\d,.]+\s*[€$£]$/.test(item.name)) return false;

    return true;
  });

  if (data.items.length === 0) {
    data.missing_data.push('items');
  }

  // Extract total
  const totalSelectors = [
    '[data-testid="cart-total"]',
    '.cart-total',
    '[class*="total"]',
    '[class*="Total"]'
  ];

  for (const selector of totalSelectors) {
    const totalEl = document.querySelector(selector);
    if (totalEl) {
      const priceMatch = totalEl.textContent.match(/[\d,.]+\s*[€$£]|[€$£]\s*[\d,.]+/);
      if (priceMatch) {
        data.total = priceMatch[0];
        break;
      }
    }
  }

  if (!data.total) {
    data.missing_data.push('total');
  }

  return data;
}

// Log page type on load
console.log('[WhatFits] Page type:', detectPageType());
