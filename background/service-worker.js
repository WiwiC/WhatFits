/**
 * WhatFits Service Worker
 * Background script for Chrome extension
 */

console.log('[WhatFits] Service worker initialized');

// Listen for extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[WhatFits] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[WhatFits] Extension updated');
  }
});
