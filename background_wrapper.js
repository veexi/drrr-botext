// Manifest V3 Background Service Worker Wrapper
console.log("DRRR Bot V3 Service Worker initialized.");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated.");
});

// Basic message router to prevent crashes from content/popup scripts sending messages
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // console.log("Background received message:", req);

  if (req && req.type === 'popup') {
    // Acknowledge popup initialization
    sendResponse({ status: "ok" });
    return true;
  }

  if (req && req.closeTab) {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.remove(sender.tab.id);
    }
  }

  // We return true if we intend to call sendResponse asynchronously
  if (req && req.start) {
    sendResponse({ status: "started", from: req.start });
    return true;
  }

  // Just return true to avoid "The message port closed before a response was received" error
  sendResponse({ status: "received" });
  return true;
});