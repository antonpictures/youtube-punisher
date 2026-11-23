// Background service worker — YouTube Ad Reloader
// Handles automatic tab-switching to break ad-reload loops.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT-AdReloader] Installed');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'escape-loop' && sender.tab) {
    const originalTabId = sender.tab.id;
    const originalWindowId = sender.tab.windowId;
    (async () => {
      try {
        // Open a lightweight tab to switch focus away
        const helper = await chrome.tabs.create({ url: 'about:blank', active: true });
        // Wait for Chrome to throttle the original (ad-playing) tab
        await new Promise(r => setTimeout(r, 4000));
        // Switch back to the original tab
        await chrome.tabs.update(originalTabId, { active: true });
        // Focus the window too
        await chrome.windows.update(originalWindowId, { focused: true });
        // Close the helper tab
        await chrome.tabs.remove(helper.id);
        sendResponse({ ok: true });
      } catch (e) {
        console.log('[YT-AdReloader] escape-loop error:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async response
  }
  return false;
});
