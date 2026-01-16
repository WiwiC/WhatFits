/**
 * WhatFits Popup Script
 * Handles tab switching, user context form, and communication with content script
 */

import { getUserContext, saveUserContext, getApiKey, saveApiKey } from '../lib/storage.js';
import { chatWithProduct } from '../lib/llm.js';

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const contextForm = document.getElementById('context-form');

// Current tab ID for messaging
let currentTabId = null;
let currentProductData = null; // Store for Chat
let previousProductData = null; // Store previous product for comparison

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetId = tab.dataset.tab;

    // Update tab states
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update content visibility
    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === targetId);
    });
  });
});

// Helper to load complex preference structure (Legacy support removed, new schema logic below)
// Helper to get checked values for a given name
function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
}

// Helper to set checked values
function setCheckedValues(name, values) {
  if (!values) return;
  // Handle single value string (radio) or array (checkbox)
  const valueArr = Array.isArray(values) ? values : [values];
  document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
    el.checked = valueArr.includes(el.value);
  });
}

// Load saved context on popup open
async function loadContext() {
  const context = await getUserContext();
  const apiKey = await getApiKey();

  if (context) {
    // New Schema Loading
    setCheckedValues('primary_goal', context.primary_goal);
    setCheckedValues('training_frequency', context.training_frequency);
    setCheckedValues('training_style', context.training_style);
    setCheckedValues('constraints', context.constraints);
    setCheckedValues('nutrition_priority', context.nutrition_priority);
    setCheckedValues('dietary_style', context.dietary_style);
    setCheckedValues('avoidances', context.avoidances);
    setCheckedValues('supplement_stance', context.supplement_stance);
    setCheckedValues('sustainability', context.sustainability);
    setCheckedValues('current_focus', context.current_focus);
    setCheckedValues('mental_focus', context.mental_focus);
    setCheckedValues('joint_protection', context.joint_protection);

    // Additional Context
    const additionalContextEl = document.getElementById('additional-context');
    if (additionalContextEl) additionalContextEl.value = context.additional_context || '';
  }

  if (apiKey) {
    document.getElementById('api-key').value = apiKey;
  }
}

// Save context form
contextForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const dietaryStyle = getCheckedValues('dietary_style');

  // Construct new schema object
  const context = {
    primary_goal: getCheckedValues('primary_goal'),
    training_frequency: getCheckedValues('training_frequency')[0] || '', // Radio
    training_style: getCheckedValues('training_style'),
    constraints: getCheckedValues('constraints'),
    nutrition_priority: getCheckedValues('nutrition_priority'),
    dietary_style: dietaryStyle,
    avoidances: getCheckedValues('avoidances'),
    supplement_stance: getCheckedValues('supplement_stance')[0] || '', // Radio
    sustainability: getCheckedValues('sustainability')[0] || '', // Radio
    current_focus: getCheckedValues('current_focus')[0] || '', // Radio
    mental_focus: getCheckedValues('mental_focus')[0] || '', // Radio
    joint_protection: getCheckedValues('joint_protection'),
    additional_context: document.getElementById('additional-context').value.trim(),

    // Legacy/Computed fields for Rule Engine compatibility
    // We infer 'vegan' if selected in dietary_style.
    // Gluten/Lactose checks will strictly only fire if we had those explicit inputs, which we don't anymore.
    // This is intended behavior per user request.
    dietary: dietaryStyle.includes('vegan') ? ['vegan'] : []
  };

  const apiKey = document.getElementById('api-key').value;

  await saveUserContext(context);
  if (apiKey) {
    await saveApiKey(apiKey);
  }

  // Show save confirmation
  const btn = contextForm.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Saved!';
  btn.style.background = 'var(--success)';

  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 1500);
});

// Check current page and update UI
async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    currentTabId = tab.id;
    const url = tab.url || '';

    const isMyProtein = url.includes('fr.myprotein.com');
    const isProductPage = isMyProtein && (url.includes('/p/') || url.includes('/sports-nutrition/'));

    // Update Chat tab status
    const chatStatus = document.getElementById('chat-status-text');
    const startChatBtn = document.getElementById('start-chat-btn');

    if (isProductPage) {
      if (chatStatus) chatStatus.textContent = 'Product page detected';
      if (startChatBtn) startChatBtn.disabled = false;
    } else if (isMyProtein) {
      if (chatStatus) chatStatus.textContent = 'Navigate to a product page';
      if (startChatBtn) startChatBtn.disabled = true;
    } else {
      if (chatStatus) chatStatus.textContent = 'Not on MyProtein';
      if (startChatBtn) startChatBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking current page:', error);
  }
}

// Product analysis removed - chat-first UX

// Initialize & Chat Logic
document.addEventListener('DOMContentLoaded', async () => {
  await loadContext();
  checkCurrentPage();

  // --- CHAT FEATURE LOGIC ---
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send');
  const startChatBtn = document.getElementById('start-chat-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatStatus = document.getElementById('chat-status-text');

  let currentChatHistory = [];
  let isChatActive = false;

  // Session persistence keys
  const SESSION_KEYS = {
    CHAT_HISTORY: 'whatfits_chat_history',
    PRODUCT_DATA: 'whatfits_product_data',
    PREVIOUS_PRODUCT_DATA: 'whatfits_previous_product_data',
    CHAT_ACTIVE: 'whatfits_chat_active'
  };

  // Load persisted session on popup open
  async function loadChatSession() {
    try {
      const session = await chrome.storage.session.get([
        SESSION_KEYS.CHAT_HISTORY,
        SESSION_KEYS.PRODUCT_DATA,
        SESSION_KEYS.PREVIOUS_PRODUCT_DATA,
        SESSION_KEYS.CHAT_ACTIVE
      ]);

      if (session[SESSION_KEYS.CHAT_ACTIVE] && session[SESSION_KEYS.PRODUCT_DATA]) {
        currentProductData = session[SESSION_KEYS.PRODUCT_DATA];
        previousProductData = session[SESSION_KEYS.PREVIOUS_PRODUCT_DATA] || null;
        currentChatHistory = session[SESSION_KEYS.CHAT_HISTORY] || [];
        isChatActive = true;

        // Restore UI state
        startChatBtn.style.display = 'none';
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        if (chatStatus) chatStatus.textContent = `Loaded: ${currentProductData?.title?.substring(0, 30) || 'Product'}...`;

        // Restore chat messages
        chatMessages.innerHTML = ''; // Clear default
        currentChatHistory.forEach(msg => {
          addChatMessage(msg.role, msg.content, false);
        });
      }
    } catch (err) {
      console.log('No persisted session found');
    }
  }

  // Save session after changes
  async function saveChatSession() {
    try {
      await chrome.storage.session.set({
        [SESSION_KEYS.CHAT_HISTORY]: currentChatHistory,
        [SESSION_KEYS.PRODUCT_DATA]: currentProductData,
        [SESSION_KEYS.PREVIOUS_PRODUCT_DATA]: previousProductData,
        [SESSION_KEYS.CHAT_ACTIVE]: isChatActive
      });
    } catch (err) {
      console.error('Error saving session:', err);
    }
  }

  // Clear session
  async function clearChatSession() {
    try {
      await chrome.storage.session.remove([
        SESSION_KEYS.CHAT_HISTORY,
        SESSION_KEYS.PRODUCT_DATA,
        SESSION_KEYS.CHAT_ACTIVE
      ]);
    } catch (err) {
      console.error('Error clearing session:', err);
    }
  }

  // Load persisted session
  await loadChatSession();

  // Check if current page is different from loaded product (for when popup reopens after navigation)
  async function checkForPageChange() {
    if (!isChatActive || !currentProductData?.url) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const currentUrl = tab.url;
      const loadedUrl = currentProductData.url;

      // Compare URLs (normalize by removing query params for comparison)
      const currentBase = currentUrl.split('?')[0];
      const loadedBase = loadedUrl.split('?')[0];

      if (currentBase !== loadedBase) {
        addChatMessage('system', '📍 You are now on a different page. Click "Load New Product" to chat about this product instead.');

        // Show reload button
        startChatBtn.style.display = 'block';
        startChatBtn.textContent = 'Load New Product';
        startChatBtn.disabled = false;

        // Update status
        if (chatStatus) chatStatus.textContent = 'Different page detected';
      }
    } catch (err) {
      console.log('Could not check page change:', err);
    }
  }

  // Check on popup open
  await checkForPageChange();

  // Load Product Handler - extracts product data and enables chat
  if (startChatBtn) {
    startChatBtn.addEventListener('click', async () => {
      if (!currentTabId) {
        addChatMessage('system', 'Please navigate to a product page first.');
        return;
      }

      startChatBtn.disabled = true;
      startChatBtn.textContent = 'Loading...';

      try {
        // Extract product data from page
        const response = await chrome.tabs.sendMessage(currentTabId, { type: 'EXTRACT_PRODUCT' });

        if (!response.success) {
          throw new Error('Could not extract product data');
        }

        // Store current as previous before loading new
        if (currentProductData) {
          previousProductData = currentProductData;
        }

        currentProductData = response.data;
        isChatActive = true;
        // Keep chat history for context continuity
        startChatBtn.style.display = 'none';
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();

        if (chatStatus) {
          chatStatus.textContent = `Loaded: ${currentProductData?.title?.substring(0, 30) || 'Product'}...`;
        }

        const welcomeMsg = { role: 'system', content: `Loaded "${currentProductData?.title || 'product'}"! Ask me anything about it.` };
        addChatMessage(welcomeMsg.role, welcomeMsg.content);
        currentChatHistory.push(welcomeMsg);
        await saveChatSession();

      } catch (err) {
        console.error('Error loading product:', err);
        addChatMessage('system', 'Could not load product data. Make sure you are on a product page.');
        startChatBtn.disabled = false;
        startChatBtn.textContent = 'Load Product';
      }
    });
  }

  // Send Message Handler
  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // UI Update
    const userMsg = { role: 'user', content: text };
    addChatMessage('user', text);
    chatInput.value = '';
    chatInput.disabled = true; // Disable while thinking

    // Add user message to history and persist
    currentChatHistory.push(userMsg);
    await saveChatSession();

    // Show persistent "Thinking..." indicator
    const thinkingId = addChatMessage('system', 'Thinking...');

    try {
      const userContext = await getUserContext();
      const apiKey = await getApiKey();

      const response = await chatWithProduct(currentChatHistory, currentProductData, previousProductData, userContext, apiKey);

      // Remove thinking indicator
      const thinkingEl = document.querySelector(`[data-msg-id="${thinkingId}"]`);
      if (thinkingEl) thinkingEl.remove();

      // Add AI Response and persist
      addChatMessage('assistant', response.content);
      currentChatHistory.push(response);
      await saveChatSession();

    } catch (err) {
      addChatMessage('system', 'Error connecting to AI.');
      console.error(err);
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  if (chatSendBtn) chatSendBtn.addEventListener('click', handleSendMessage);
  if (chatInput) chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  function addChatMessage(role, text, scroll = true) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.textContent = text;
    const id = Date.now();
    div.dataset.msgId = id;
    chatMessages.appendChild(div);
    if (scroll) chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
  }
});
