// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "speakwise-lookup",
    title: "SpeakWise: Practice & Learn '%s'",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "speakwise-lookup" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "open_modal",
      text: info.selectionText.trim()
    });
  }
});

// Cache or message routing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "save_word") {
    chrome.storage.local.get({ savedWords: [] }, (res) => {
      const words = res.savedWords;
      const existingIdx = words.findIndex(w => w.word.toLowerCase() === request.data.word.toLowerCase());
      if (existingIdx >= 0) {
        words[existingIdx] = { ...words[existingIdx], ...request.data, updatedAt: Date.now() };
      } else {
        words.unshift({ ...request.data, createdAt: Date.now() });
      }
      chrome.storage.local.set({ savedWords: words }, () => {
        sendResponse({ success: true, count: words.length });
      });
    });
    return true; // async response
  }
});
