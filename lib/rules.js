/**
 * WhatFits Rules Module
 * Deterministic rules for supplement analysis (no LLM)
 */

const STIMULANTS = {
  direct: ['caffeine', 'caféine', 'synephrine', 'yohimbine', 'anhydrous caffeine'],
  botanical: ['guarana', 'green tea extract', 'extrait de thé vert', 'yerba mate', 'kola nut']
};

/**
 * Robust ingredient normalization
 * Removes parentheticals, lowercases, trims, and deduplicates.
 * @param {string[]} ingredients
 * @returns {string[]}
 */
export function normalizeIngredients(ingredients) {
  if (!ingredients || !Array.isArray(ingredients)) return [];

  const processed = ingredients.map(ing => {
    // 1. Lowercase
    let clean = ing.toLowerCase();

    // 2. Remove parenthetical content (recursive or simple)
    // Regex removes (...) and [...] content
    clean = clean.replace(/\\([^)]*\\)/g, '').replace(/\\[[^\]]*\\]/g, '');

    // 3. Remove non-alphanumeric noise at start/end but keep internal hyphens/spaces
    clean = clean.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

    // 4. Collapse whitespace
    clean = clean.replace(/\\s+/g, ' ').trim();

    return clean;
  }).filter(Boolean); // Remove empty strings

  // 5. Deduplicate preserving order
  return [...new Set(processed)];
}

/**
 * Check if product contains stimulants with typing
 * @param {string[]} ingredients - List of ingredients (normalized preferred)
 * @returns {{ present: boolean, found: string[], type: 'direct'|'botanical'|'none' }}
 */
export function checkStimulants(ingredients) {
  if (!ingredients || !Array.isArray(ingredients)) {
    return { present: false, found: [], type: 'none' };
  }

  // Ensure we check against normalized input for better matching
  // But caller should usually pass normalized ingredients
  const normalizedInput = ingredients.map(i => i.toLowerCase());

  const foundDirect = [];
  const foundBotanical = [];

  // Check Direct
  STIMULANTS.direct.forEach(stim => {
    if (normalizedInput.some(ing => ing.includes(stim))) {
      foundDirect.push(stim);
    }
  });

  // Check Botanical
  STIMULANTS.botanical.forEach(stim => {
    if (normalizedInput.some(ing => ing.includes(stim))) {
      foundBotanical.push(stim);
    }
  });

  const allFound = [...foundDirect, ...foundBotanical];

  if (allFound.length === 0) {
    return { present: false, found: [], type: 'none' };
  }

  if (foundDirect.length > 0) {
    return { present: true, found: [...new Set(allFound)], type: 'direct' };
  }

  return { present: true, found: [...new Set(allFound)], type: 'botanical' };
}

/**
 * Detect ingredient overlap between cart items
 * @param {Array<{name: string, ingredients: string[]}>} cartItems
 * @returns {{ redundancies: Array<{ingredient: string, products: string[]}> }}
 */
export function detectRedundancies(cartItems) {
  if (!cartItems || !Array.isArray(cartItems)) {
    return { redundancies: [] };
  }

  const ingredientMap = new Map();

  cartItems.forEach(item => {
    if (!item.ingredients) return;

    // Use normalized ingredients for comparison
    const norm = normalizeIngredients(item.ingredients);

    norm.forEach(ingredient => {
      if (!ingredientMap.has(ingredient)) {
        ingredientMap.set(ingredient, []);
      }
      ingredientMap.get(ingredient).push(item.name);
    });
  });

  const redundancies = [];
  ingredientMap.forEach((products, ingredient) => {
    if (products.length > 1) {
      redundancies.push({ ingredient, products });
    }
  });

  return { redundancies };
}

/**
 * Check for dietary preference mismatches
 * SAFE LANGUAGE ENFORCED: No medical/safety claims.
 * @param {string[]} userPreferences - e.g. ['lactose_free', 'vegan']
 * @param {Object} productData - Contains ingredients, dietary info
 * @returns {{ mismatches: Array<{preference: string, reason: string}> }}
 */
export function checkDietaryMismatches(userPreferences, productData) {
  if (!userPreferences || !Array.isArray(userPreferences)) {
    return { mismatches: [] };
  }

  const mismatches = [];
  const ingredientsStr = (productData?.ingredients || []).join(' ').toLowerCase();

  // Helper patterns
  const hasDairy = ingredientsStr.includes('lait') || ingredientsStr.includes('lactosérum') || ingredientsStr.includes('whey') || ingredientsStr.includes('milk') || ingredientsStr.includes('casein');
  const hasGluten = ingredientsStr.includes('gluten') || ingredientsStr.includes('blé') || ingredientsStr.includes('wheat') || ingredientsStr.includes('orge') || ingredientsStr.includes('barley');

  if (userPreferences.includes('lactose_free') && hasDairy) {
    mismatches.push({
      preference: 'lactose_free',
      reason: 'Contains dairy-derived ingredients, which conflicts with lactose-free preference.'
    });
  }

  if (userPreferences.includes('vegan') && hasDairy) {
    mismatches.push({
      preference: 'vegan',
      reason: 'Contains dairy-derived ingredients, which conflicts with vegan preference.'
    });
  }

  if (userPreferences.includes('gluten_free') && hasGluten) {
    mismatches.push({
      preference: 'gluten_free',
      reason: 'Contains wheat/gluten-related ingredients, which conflicts with gluten-free preference.'
    });
  }

  return { mismatches };
}

/**
 * Detect missing data fields
 * @returns {{ missing_data: string[], completeness: number }}
 */
export function detectMissingData(productData) {
  const expectedFields = ['title', 'price', 'ingredients', 'claims'];
  const missing = [];

  expectedFields.forEach(field => {
    const value = productData?.[field];
    if (value === null || value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'string' && value.trim() === '')) {
      missing.push(field);
    }
  });

  const completeness = (expectedFields.length - missing.length) / expectedFields.length;

  return { missing_data: missing, completeness };
}

/**
 * Calculate confidence score based on data completeness and rule coverage
 * Renamed to be explicit about what it measures.
 */
export function calculateAnalysisConfidence(productData, userContext) {
  const { completeness } = detectMissingData(productData);

  const hasIngredients = productData?.ingredients?.length > 0;

  // Check new schema fields (v2) or fallback to v1
  const hasUserGoals = (userContext?.primary_goal?.length > 0) || (userContext?.goals?.length > 0);

  // Check preferences (Avoidances, Dietary Style, or old preferences/dietary)
  const hasUserPrefs = (userContext?.avoidances?.length > 0) ||
    (userContext?.dietary_style?.length > 0) ||
    (userContext?.preferences?.length > 0) ||
    (userContext?.dietary?.length > 0);

  const rulesApplicable = [hasIngredients, hasUserGoals, hasUserPrefs].filter(Boolean).length;
  const ruleCoverage = rulesApplicable / 3;

  const confidence = Math.round((completeness * 0.7 + ruleCoverage * 0.3) * 100) / 100;

  return {
    confidence, // 0-1
    explanation: `Based on ${Math.round(completeness * 100)}% of product data availability.`
  };
}

/**
 * Preprocess product data for LLM
 * NOW USES ROBUST NORMALIZATION
 */
export function preprocessProductData(data) {
  if (!data.ingredients || data.ingredients.length === 0) return data;

  const uniqueIngredients = normalizeIngredients(data.ingredients);

  return {
    ...data,
    ingredients_raw: data.ingredients, // Keep raw for display/debug if needed
    ingredients: uniqueIngredients     // Normalized for Rules & LLM
  };
}

/**
 * Generate a comprehensive rule summary for the LLM
 * Acts as the 'Ground Truth' layer.
 */
export function generateRuleSummary(productData, userContext) {
  // 1. Pre-calc
  const processed = preprocessProductData(productData);

  // 2. Run Rules
  const stimCheck = checkStimulants(processed.ingredients);
  const dietaryCheck = checkDietaryMismatches(userContext.dietary || [], processed);
  const dataStats = detectMissingData(processed);
  const confidence = calculateAnalysisConfidence(processed, userContext);

  // 3. Construct Summary
  return {
    stimulants: stimCheck,
    dietary_mismatches: dietaryCheck.mismatches.map(m => m.preference), // Just keys for brief Prompt injection
    dietary_reasons: dietaryCheck.mismatches,
    data_completeness: dataStats.completeness,
    missing_fields: dataStats.missing_data,
    confidence_score: confidence.confidence,
    ingredient_count: processed.ingredients.length
  };
}
