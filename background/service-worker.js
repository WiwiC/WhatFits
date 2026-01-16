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

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only notify on URL change, not other updates
  if (changeInfo.url) {
    // Store the new URL for the popup to detect
    chrome.storage.session.set({
      whatfits_current_url: changeInfo.url,
      whatfits_url_changed: true
    });
  }
});
