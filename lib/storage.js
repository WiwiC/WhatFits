/**
 * WhatFits Storage Module
 * Chrome storage wrapper for user context and API key
 */

const STORAGE_KEYS = {
  USER_CONTEXT: 'whatfits_user_context',
  API_KEY: 'whatfits_api_key'
};

// Default context (Schema v3 - with profile)
const DEFAULT_USER_CONTEXT = {
  // User Profile
  age: null,               // Number or null
  weight_kg: null,         // Number or null
  height_cm: null,         // Number or null
  gender: '',              // 'male', 'female', 'prefer_not_to_say', or ''

  // Questionnaire
  primary_goal: [],        // Q1
  training_frequency: '',  // Q2
  training_style: [],      // Q3
  nutrition_priority: [],  // Q4
  dietary_style: [],       // Q5
  avoidances: [],          // Q6
  supplements_intake: '',  // Q7
  current_focus: '',       // Q8
  mental_focus: '',        // Q9
  joint_protection: [],    // Q10
  additional_context: ''   // Free text (500 chars)
};

/**
 * Get user context from storage
 * @returns {Promise<Object|null>} User context merged with defaults
 */
export async function getUserContext() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.USER_CONTEXT);
    const stored = result[STORAGE_KEYS.USER_CONTEXT] || {};
    // Merge with defaults to ensure all fields exist
    return { ...DEFAULT_USER_CONTEXT, ...stored };
  } catch (error) {
    console.error('[WhatFits] Error getting user context:', error);
    return DEFAULT_USER_CONTEXT;
  }
}

/**
 * Save user context to storage
 * @param {Object} context - User context object
 * @returns {Promise<boolean>} Success status
 */
export async function saveUserContext(context) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.USER_CONTEXT]: context });
    return true;
  } catch (error) {
    console.error('[WhatFits] Error saving user context:', error);
    return false;
  }
}

/**
 * Get API key from storage
 * @returns {Promise<string|null>} API key or null if not set
 */
export async function getApiKey() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
    return result[STORAGE_KEYS.API_KEY] || null;
  } catch (error) {
    console.error('[WhatFits] Error getting API key:', error);
    return null;
  }
}

/**
 * Save API key to storage
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<boolean>} Success status
 */
export async function saveApiKey(apiKey) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey });
    return true;
  } catch (error) {
    console.error('[WhatFits] Error saving API key:', error);
    return false;
  }
}

/**
 * Clear all stored data
 * @returns {Promise<boolean>} Success status
 */
export async function clearStorage() {
  try {
    await chrome.storage.local.remove([STORAGE_KEYS.USER_CONTEXT, STORAGE_KEYS.API_KEY]);
    return true;
  } catch (error) {
    console.error('[WhatFits] Error clearing storage:', error);
    return false;
  }
}
