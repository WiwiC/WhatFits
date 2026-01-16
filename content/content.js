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
 * Extract product data from a specific document/context
 * Returns partial data with missing_data array for transparency
 */
function extractProductData(doc = document) {
  const data = {
    url: doc === document ? window.location.href : null,
    title: null,
    price: null,
    ingredients: [],
    claims: [],
    dietaryInfo: [],
    warnings: [],
    missing_data: []
  };

  data.title = extractTitle(doc);
  if (!data.title) data.missing_data.push('title');

  data.price = extractPrice(doc);
  if (!data.price) data.missing_data.push('price');

  data.ingredients = extractSection(doc, ['ingrédients', 'ingredients']);
  // Pass as array for backward compatibility with schema
  data.ingredients = data.ingredients ? [data.ingredients] : [];
  if (data.ingredients.length === 0) data.missing_data.push('ingredients');

  // New Sections requested by User
  data.description = extractSection(doc, ['description', 'details']);
  data.benefits = extractSection(doc, ['avantages', 'benefits', 'pourquoi choisir', 'why choose']);
  data.usage = extractSection(doc, ['utilisation', 'usage', 'dosaggio', 'dosage']);
  data.nutritional_info = extractSection(doc, ['information nutritionnelle', 'nutritional information', 'valeurs nutritionnelles']);

  // Merge text into claims for backward compatibility
  data.claims = [
    ...(data.description ? [`Description: ${data.description.substring(0, 300)}...`] : []),
    ...(data.benefits ? [`Benefits: ${data.benefits.substring(0, 300)}...`] : [])
  ];
  if (data.claims.length === 0) data.missing_data.push('claims');

  data.dietaryInfo = extractDietaryInfo(doc);
  data.warnings = extractWarnings(doc);

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
 * Extract ingredients from specific 'Ingrédients' section
 * Returns raw text for LLM interpretation, avoiding regex filters and dangerous fallbacks.
 */
function extractIngredients(doc) {
  let foundContent = null;

  // Strategy 1: Look for explicit "Ingrédients" header/button
  // This targets the accordion style shown in the user's screenshot
  const headers = Array.from(doc.querySelectorAll('button, h2, h3, h4, th, strong, span, div[class*="title"]'));

  for (const header of headers) {
    const text = header.textContent.trim().toLowerCase();

    // Strict match to find the actual section header, not just a mention
    if (text === 'ingrédients' || text === 'ingredients' || text === 'ingredients:') {

      // Case A: Content is the next sibling element (standard accordion)
      let sibling = header.nextElementSibling;
      while (sibling) {
        // Skip empty spacers
        if (sibling.textContent.trim().length > 5) {
          foundContent = sibling.textContent.trim();
          break;
        }
        sibling = sibling.nextElementSibling;
      }

      // Case B: Header is wrapped (e.g. <div class="header"><button>Ingredients</button></div>)
      // So we check the parent's sibling
      if (!foundContent && header.parentElement) {
        let parentSibling = header.parentElement.nextElementSibling;
        while (parentSibling) {
          if (parentSibling.textContent.trim().length > 5) {
            foundContent = parentSibling.textContent.trim();
            break;
          }
          parentSibling = parentSibling.nextElementSibling;
        }
      }

      if (foundContent) break;
    }
  }

  // Strategy 2: Look for specific MyProtein content containers if Strategy 1 failed
  if (!foundContent) {
    const ingredientPanel = doc.querySelector('[id*="ingredient-panel"], [class*="product-ingredients"], [id="product-description-content-ingredients"]');
    if (ingredientPanel) {
      foundContent = ingredientPanel.textContent.trim();
    }
  }

  if (foundContent) {
    // Return the raw text, cleaned of excessive whitespace
    // We do NOT filter by specific ingredient names anymore.
    // We let the LLM parse this raw block.
    return [foundContent.replace(/\s+/g, ' ')];
  }

  // CRITICAL: Do NOT fall back to scanning the whole body.
  // Returning empty is better than hallucinating ingredients from the footer.
  return [];
}

/**
 * Extract marketing claims from context
 */
function extractClaims(doc) {
  const claims = [];
  const listItems = doc.querySelectorAll('li, [class*="benefit"], [class*="feature"]');

  const claimPatterns = [
    /\d+\s*g?\s*de?\s*protéines?/gi,
    /\d+\s*kcal/gi,
    /faible en/gi,
    /riche en/gi,
    /sans\s+\w+/gi,
    /contribue?n?t?\s+(à|au)/gi,
    /certifié/gi,
    /informed choice/gi
  ];

  listItems.forEach(item => {
    const text = item.textContent.trim();
    if (text.length > 10 && text.length < 200) {
      claimPatterns.forEach(pattern => {
        if (pattern.test(text) && !claims.includes(text)) {
          claims.push(text);
        }
      });
    }
  });

  return claims.slice(0, 5);
}

/**
 * Extract dietary info from context
 */
function extractDietaryInfo(doc) {
  const info = [];
  const pageText = doc.body.innerText.toLowerCase();

  const dietaryLabels = [
    { pattern: /végétarien/i, label: 'Vegetarian' },
    { pattern: /végan|vegan/i, label: 'Vegan' },
    { pattern: /sans gluten|gluten.?free/i, label: 'Gluten-free' },
    { pattern: /sans lactose|lactose.?free/i, label: 'Lactose-free' },
    { pattern: /informed choice/i, label: 'Informed Choice Certified' },
    { pattern: /halal/i, label: 'Halal' }
  ];

  dietaryLabels.forEach(({ pattern, label }) => {
    if (pattern.test(pageText)) {
      info.push(label);
    }
  });

  return info;
}

/**
 * Extract warnings from context
 */
function extractWarnings(doc) {
  const warnings = [];
  const pageText = doc.body.innerText;

  const sections = doc.querySelectorAll('div, section, p');
  for (const section of sections) {
    const text = section.textContent;
    if (text.includes('allergènes') || text.includes('Fabriqué dans') ||
      text.includes('peut contenir') || text.includes('gras')) {
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      lines.forEach(line => {
        if (line.includes('allergènes') || line.includes('Fabriqué') ||
          line.includes('Lait') || line.includes('Soja') || line.includes('Gluten')) {
          const cleaned = line.trim().substring(0, 200);
          if (cleaned && !warnings.includes(cleaned)) {
            warnings.push(cleaned);
          }
        }
      });
    }
  }

  const detectedAllergens = [];
  if (pageText.includes('Lait') || pageText.includes('lait')) detectedAllergens.push('Lait (Milk)');
  if (pageText.includes('Soja') || pageText.includes('soja')) detectedAllergens.push('Soja (Soy)');
  if (pageText.includes('Gluten') || pageText.includes('gluten')) detectedAllergens.push('Gluten');
  if (pageText.includes('œufs') || pageText.includes('Œufs')) detectedAllergens.push('Œufs (Eggs)');

  if (detectedAllergens.length > 0 && warnings.length === 0) {
    warnings.push('Contient ou fabriqué avec: ' + detectedAllergens.join(', '));
  }

  return warnings.slice(0, 3);
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

/**
 * Generic helper to extract content from an accordion/section by header name
 */
function extractSection(doc, headerKeywords) {
  let foundContent = null;
  const headers = Array.from(doc.querySelectorAll('button, h2, h3, h4, h5, th, strong, span, div[class*="title"]'));

  for (const header of headers) {
    const text = header.textContent.trim().toLowerCase();

    // Check if header matches any keyword
    if (headerKeywords.some(k => text.includes(k) && text.length < 50)) {

      // Strategy A: Next Sibling (Accordion style)
      let sibling = header.nextElementSibling;
      while (sibling) {
        if (sibling.textContent.trim().length > 5) {
          foundContent = sibling.textContent.trim();
          break;
        }
        sibling = sibling.nextElementSibling;
      }

      // Strategy B: Parent's Sibling (Wrapped header)
      if (!foundContent && header.parentElement) {
        let parentSibling = header.parentElement.nextElementSibling;
        while (parentSibling) {
          if (parentSibling.textContent.trim().length > 5) {
            foundContent = parentSibling.textContent.trim();
            break;
          }
          parentSibling = parentSibling.nextElementSibling;
        }
      }

      if (foundContent) break;
    }
  }

  return foundContent ? foundContent.replace(/\s+/g, ' ').trim() : null;
}
