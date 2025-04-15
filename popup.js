document.addEventListener("DOMContentLoaded", function () {
  const enabledToggle = document.getElementById("enabled-toggle");

  // Load saved settings
  chrome.storage.sync.get(["enabled", "customSelectors"], function (data) {
    if (data.enabled !== undefined) {
      enabledToggle.checked = data.enabled;
    }
  });

  // Toggle enabled state
  enabledToggle.addEventListener("change", function () {
    const enabled = enabledToggle.checked;

    // Save to storage
    chrome.storage.sync.set({ enabled: enabled });

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleEnabled",
          enabled: enabled,
        });
      }
    });
  });
});
