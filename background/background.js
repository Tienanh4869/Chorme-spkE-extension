// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  // Context menu for selected text
  chrome.contextMenus.create({
    id: "speakwise-lookup",
    title: "SpeakWise: Tra nghĩa & Luyện đọc '%s'",
    contexts: ["selection"]
  });

  // Context menu for images (OCR)
  chrome.contextMenus.create({
    id: "speakwise-ocr-image",
    title: "SpeakWise: 📷 Quét chữ & Luyện phát âm từ ảnh này",
    contexts: ["image"]
  });

  // Context menu for capturing visible area on PDF / Full Image tab / Web
  chrome.contextMenus.create({
    id: "speakwise-capture-screen",
    title: "SpeakWise: ✂️ Khoanh vùng quét chữ (PDF / Drive / Ảnh / Web)",
    contexts: ["page", "frame"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "speakwise-lookup" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "open_modal",
      text: info.selectionText.trim()
    });
  } else if (info.menuItemId === "speakwise-ocr-image" && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, {
      action: "ocr_image_url",
      imageUrl: info.srcUrl
    });
  } else if (info.menuItemId === "speakwise-capture-screen") {
    if (tab && tab.id) {
      triggerSnippingTool(tab.id);
    }
  }
});

// Shortcut commands listener
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].id) return;
    if (command === "speakwise-read-selection") {
      chrome.tabs.sendMessage(tabs[0].id, { action: "shortcut_read_selection" });
    } else if (command === "speakwise-toggle-panel") {
      chrome.tabs.sendMessage(tabs[0].id, { action: "shortcut_toggle_panel" });
    } else if (command === "speakwise-capture-ocr") {
      triggerSnippingTool(tabs[0].id);
    }
  });
});

// Capture visible tab screenshot & safely inject content script if needed
function triggerSnippingTool(tabId) {
  // Use a slight timeout so popup window has fully closed
  setTimeout(() => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (screenshotUrl) => {
      if (chrome.runtime.lastError || !screenshotUrl) {
        console.warn("Capture tab failed:", chrome.runtime.lastError);
        return;
      }

      // Try sending message first
      chrome.tabs.sendMessage(tabId, { action: "start_snip_capture", screenshotUrl: screenshotUrl }, (res) => {
        // If content script wasn't loaded or frame disconnected (e.g. drive/pdf/new tab)
        if (chrome.runtime.lastError) {
          // Programmatically inject content script into the tab
          if (chrome.scripting) {
            chrome.scripting.executeScript({
              target: { tabId: tabId, allFrames: false },
              files: ["content/content.js"]
            }).then(() => {
              chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ["content/content.css"]
              }).then(() => {
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, { action: "start_snip_capture", screenshotUrl: screenshotUrl });
                }, 100);
              });
            }).catch(err => {
              console.error("Scripting injection failed:", err);
            });
          }
        }
      });
    });
  }, 200);
}

// OCR Helper function using OCR Space API
async function performOCR(imageUrl, base64Blob) {
  try {
    const formData = new FormData();
    formData.append("apikey", "K83617342888957");
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");

    if (base64Blob) {
      formData.append("file", base64Blob, "image.png");
    } else if (imageUrl) {
      formData.append("url", imageUrl);
    } else {
      throw new Error("Không có dữ liệu ảnh để quét.");
    }

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      formData.set("apikey", "helloworld");
      const fallbackRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: formData
      });
      const fallbackData = await fallbackRes.json();
      return processOCRResult(fallbackData);
    }

    const data = await res.json();
    return processOCRResult(data);
  } catch (err) {
    return { success: false, error: err.message || "Lỗi kết nối OCR." };
  }
}

function processOCRResult(data) {
  if (data && data.ParsedResults && data.ParsedResults.length > 0) {
    let parsedText = data.ParsedResults[0].ParsedText || "";
    parsedText = parsedText.replace(/\[Note:[^\]]+\]/gi, "").trim();
    if (parsedText) {
      return { success: true, text: parsedText };
    }
  }
  const errMsg = (data && data.ErrorMessage && data.ErrorMessage[0]) || "Không phát hiện được chữ hoặc câu nào trong vùng này.";
  return { success: false, error: errMsg };
}

// Message Router
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
    return true;
  } else if (request.action === "perform_ocr") {
    if (request.dataUrl) {
      fetch(request.dataUrl)
        .then(r => r.blob())
        .then(blob => performOCR(null, blob))
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    } else if (request.imageUrl) {
      performOCR(request.imageUrl, null)
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
  } else if (request.action === "trigger_screen_snip") {
    const targetTabId = request.tabId;
    if (targetTabId) {
      triggerSnippingTool(targetTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          triggerSnippingTool(tabs[0].id);
        }
      });
    }
  } else if (request.action === "request_screen_snip_direct") {
    const senderTabId = (sender && sender.tab && sender.tab.id);
    if (senderTabId) {
      triggerSnippingTool(senderTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          triggerSnippingTool(tabs[0].id);
        }
      });
    }
  }
});
