/**
 * WhatFits Popup Script
 * Handles tab switching, user context form, and communication with content script
 */

import { getUserContext, saveUserContext, getApiKey, saveApiKey } from '../lib/storage.js';
import { analyzeProductAlignment, analyzeCartCoherence, chatWithProduct } from '../lib/llm.js';
import { preprocessProductData } from '../lib/rules.js';

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const contextForm = document.getElementById('context-form');
const checkAlignmentBtn = document.getElementById('check-alignment');
const checkCartBtn = document.getElementById('check-cart');

// Current tab ID for messaging
let currentTabId = null;
let currentProductData = null; // Store for Chat

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
    const isCartPage = isMyProtein && (url.includes('/cart') || url.includes('/panier') || url.includes('/checkout') || url.includes('/account') || url.includes('/basket'));

    // Update Analysis tab status
    const analysisStatus = document.querySelector('#analysis .status-indicator');
    const analysisText = document.querySelector('#analysis .status-text');

    if (isProductPage) {
      analysisStatus.classList.add('success');
      analysisText.textContent = 'Product page detected';
      checkAlignmentBtn.disabled = false;
    } else if (isMyProtein) {
      analysisStatus.classList.add('warning');
      analysisText.textContent = 'Navigate to a product page';
      checkAlignmentBtn.disabled = true;
    } else {
      analysisStatus.classList.add('error');
      analysisText.textContent = 'Not on MyProtein';
      checkAlignmentBtn.disabled = true;
    }

    // Update Cart tab status
    const cartStatus = document.querySelector('#cart .status-indicator');
    const cartText = document.querySelector('#cart .status-text');

    if (isCartPage) {
      cartStatus.classList.add('success');
      cartText.textContent = 'Cart page detected';
      checkCartBtn.disabled = false;
    } else if (isMyProtein) {
      cartStatus.classList.add('warning');
      cartText.textContent = 'Navigate to cart page';
      checkCartBtn.disabled = true;
    } else {
      cartStatus.classList.add('error');
      cartText.textContent = 'Not on MyProtein';
      checkCartBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking current page:', error);
  }
}

// Handle Check Alignment button
checkAlignmentBtn.addEventListener('click', async () => {
  if (!currentTabId) return;

  const resultContainer = document.querySelector('#analysis .result-container');
  const statusText = document.querySelector('#analysis .status-text');

  // Show loading state
  checkAlignmentBtn.disabled = true;
  checkAlignmentBtn.textContent = 'Analyzing...';
  statusText.textContent = 'Extracting product data...';

  try {
    // Step 1: Extract product data from page
    const response = await chrome.tabs.sendMessage(currentTabId, { type: 'EXTRACT_PRODUCT' });

    if (!response.success) {
      throw new Error('Failed to extract product data');
    }

    let productData = response.data;

    // Store for Chat & Enable
    currentProductData = productData;
    const startChatBtn = document.getElementById('start-chat-btn');
    const chatStatus = document.getElementById('chat-status-text');
    if (startChatBtn) {
      startChatBtn.disabled = false;
      if (chatStatus) chatStatus.textContent = `Talking about: ${productData.title ? productData.title.substring(0, 25) + '...' : 'this product'}`;
    }

    statusText.textContent = 'Preprocessing data...';

    // Step 2: Preprocess data (deduplication)
    // We still call this for local display integrity, even though LLM logic re-runs it
    productData = preprocessProductData(productData);

    statusText.textContent = 'Analyzing with AI...';

    // Step 3: Get user context and API key
    const userContext = await getUserContext();
    const apiKey = await getApiKey();

    // Step 4: Call LLM for analysis
    const analysis = await analyzeProductAlignment(productData, userContext, apiKey);

    // Step 5: Display combined results
    displayAnalysisResult(productData, analysis, resultContainer);
    statusText.textContent = analysis.error ? 'Analysis limited' : 'Analysis complete';

  } catch (error) {
    console.error('Error analyzing product:', error);
    resultContainer.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    statusText.textContent = 'Analysis failed';
  } finally {
    checkAlignmentBtn.disabled = false;
    checkAlignmentBtn.textContent = 'Check Alignment';
  }
});

// Handle Check Cart button
checkCartBtn.addEventListener('click', async () => {
  if (!currentTabId) return;

  const resultContainer = document.querySelector('#cart .result-container');
  const statusText = document.querySelector('#cart .status-text');

  checkCartBtn.disabled = true;
  checkCartBtn.textContent = 'Analyzing...';
  statusText.textContent = 'Extracting cart data...';

  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { type: 'EXTRACT_CART' });
    if (!response.success) throw new Error('Failed to extract cart data');

    const cartData = response.data;

    // Deep Enrichment Step
    if (cartData.items && cartData.items.length > 0) {
      statusText.textContent = `Fetching details for ${cartData.items.length} items...`;
      try {
        const enrichResponse = await chrome.tabs.sendMessage(currentTabId, {
          type: 'ENRICH_CART',
          items: cartData.items
        });

        if (enrichResponse && enrichResponse.success) {
          cartData.items = enrichResponse.data;
          console.log('[WhatFits] Cart enriched with ingredient details');
        }
      } catch (err) {
        console.warn('Deep enrichment failed, falling back to shallow analysis:', err);
      }
    }

    statusText.textContent = 'Analyzing cart coherence...';

    const userContext = await getUserContext();
    const apiKey = await getApiKey();

    const analysis = await analyzeCartCoherence(cartData, userContext, apiKey);

    displayCartCoherenceResult(cartData, analysis, resultContainer);
    statusText.textContent = analysis.error ? 'Analysis limited' : 'Analysis complete';

  } catch (error) {
    console.error('Error analyzing cart:', error);
    resultContainer.innerHTML = `<p class="error-text">Error: ${error.message}</p>`;
    statusText.textContent = 'Analysis failed';
  } finally {
    checkCartBtn.disabled = false;
    checkCartBtn.textContent = 'Check Cart Coherence';
  }
});

// Display detailed analysis result
function displayAnalysisResult(productData, analysis, container) {
  const alignmentClass = analysis.alignment || 'neutral';
  const confidencePercent = Math.round((analysis.alignment_confidence || 0) * 100);
  const dataQuality = analysis.data_quality || 0;

  let html = `
    <div class="result-card">
      <div class="result-header">
        <h3>${productData.title || 'Unknown Product'}</h3>
        ${productData.price ? `<span class="price">${productData.price}</span>` : ''}
      </div>

      <div class="result-section alignment-section">
        <span class="alignment-badge ${alignmentClass}">${alignmentClass}</span>
        <div class="meta-scores">
          <span class="confidence-text" title="AI Confidence">Conf: ${confidencePercent}%</span>
          <span class="confidence-text" title="Data Quality">Data: ${dataQuality}%</span>
        </div>
      </div>
  `;

  if (analysis.reasons && analysis.reasons.length > 0) {
    html += `
      <div class="result-section">
        <h4>Analysis</h4>
        <ul class="reasons-list">
          ${analysis.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (analysis.preference_matches && analysis.preference_matches.length > 0) {
    html += `
      <div class="result-section">
        <h4>Matches Preferences</h4>
        <ul class="tag-list">
           ${analysis.preference_matches.map(m => `<li class="tag tag-info">${m}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (analysis.preference_mismatches && analysis.preference_mismatches.length > 0) {
    html += `
      <div class="result-section">
        <h4>Mismatches</h4>
        <ul class="tag-list">
           ${analysis.preference_mismatches.map(m => `<li class="tag tag-warn">${m}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (analysis.considerations && analysis.considerations.length > 0) {
    html += `
      <div class="result-section">
        <h4>Considerations</h4>
        <ul class="considerations-list">
          ${analysis.considerations.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (analysis.missing_data && analysis.missing_data.length > 0) {
    html += `
      <div class="result-section missing-data">
        <h4>Missing Information</h4>
        <p>${analysis.missing_data.join(', ')}</p>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// Display cart coherence result
function displayCartCoherenceResult(cartData, analysis, container) {
  const score = analysis.stack_alignment_score || 0;
  let scoreClass = 'neutral';
  if (score > 75) scoreClass = 'aligned';
  if (score < 40) scoreClass = 'misaligned';

  let html = `
    <div class="result-card">
      <div class="result-header">
        <h3>Cart Analysis</h3>
        <span class="price">${cartData.total || ''}</span>
      </div>

      <div class="result-section alignment-section">
        <span class="alignment-badge ${scoreClass}">Score: ${score}/100</span>
      </div>
  `;

  if (analysis.redundancies && analysis.redundancies.length > 0) {
    html += `
      <div class="result-section">
        <h4>Redundancies Identified</h4>
        <ul class="warning-list">
          ${analysis.redundancies.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (analysis.goal_mismatches && analysis.goal_mismatches.length > 0) {
    html += `
      <div class="result-section">
        <h4>Goal Mismatches</h4>
        <ul class="warning-list">
          ${analysis.goal_mismatches.map(m => `<li>${m}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (analysis.suggested_actions && analysis.suggested_actions.length > 0) {
    html += `
      <div class="result-section">
        <h4>Suggested Actions</h4>
        <ul class="considerations-list">
          ${analysis.suggested_actions.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// Initialize
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

  // Start Chat Handler
  if (startChatBtn) {
    startChatBtn.addEventListener('click', () => {
      isChatActive = true;
      startChatBtn.style.display = 'none';
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();

      addChatMessage('system', `Ready to discuss ${currentProductData?.title || 'this product'}! Ask away.`);
    });
  }

  // Send Message Handler
  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // UI Update
    addChatMessage('user', text);
    chatInput.value = '';
    chatInput.disabled = true; // Disable while thinking

    // Add user message to history
    currentChatHistory.push({ role: 'user', content: text });

    // Show persistent "Thinking..." indicator
    const thinkingId = addChatMessage('system', 'Thinking...');

    try {
      const userContext = await getUserContext();
      const apiKey = await getApiKey();

      const response = await chatWithProduct(currentChatHistory, currentProductData, userContext, apiKey);

      // Remove thinking indicator
      const thinkingEl = document.querySelector(`[data-msg-id="${thinkingId}"]`);
      if (thinkingEl) thinkingEl.remove();

      // Add AI Response
      addChatMessage('assistant', response.content);
      currentChatHistory.push(response);

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

  function addChatMessage(role, text) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.textContent = text;
    const id = Date.now();
    div.dataset.msgId = id;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
  }
});
