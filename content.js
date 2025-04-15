// Configuration
let enabled = true;
let subtitleSelectors = [
  ".captions-text", // YouTube
  ".ytp-caption-segment", // Individual caption segments
  ".caption-visual-line", // Caption lines in new player
  ".caption-window", // Caption container
  ".player-timedtext", // Netflix
  ".vjs-text-track-display", // HTML5 video players
  ".timed-text-container", // Prime Video
];

// Dictionary API endpoint (using Free Dictionary API as an example)
const DICTIONARY_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

// Load user preferences
chrome.storage.sync.get(["enabled", "customSelectors"], function (data) {
  if (data.enabled !== undefined) enabled = data.enabled;
  if (data.customSelectors)
    subtitleSelectors = subtitleSelectors.concat(data.customSelectors);

  if (enabled) initDictionary();
});

// Initialize the dictionary functionality
function initDictionary() {
  // Create tooltip element
  const tooltip = document.createElement("div");
  tooltip.id = "subtitle-dictionary-tooltip";
  document.body.appendChild(tooltip);

  // Observer to detect new subtitle elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        checkForSubtitles();
      }
    });
  });

  // Start observing the document for subtitle elements
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial check for subtitles
  checkForSubtitles();
}

// Check for subtitle elements
function checkForSubtitles() {
  if (!enabled) return;

  subtitleSelectors.forEach((selector) => {
    const subtitleElements = document.querySelectorAll(selector);
    subtitleElements.forEach(processSubtitleElement);
  });
}

// Process each subtitle element without changing its appearance
function processSubtitleElement(element) {
  if (element.dataset.dictionaryProcessed) return;
  element.dataset.dictionaryProcessed = true;

  // Instead of modifying the subtitle HTML, add a listener to the whole element
  element.addEventListener("mousemove", (e) => {
    if (!enabled) return;

    // Get the word under the cursor by calculating text position
    const word = getWordUnderCursor(e, element);
    if (word) {
      showDefinition(e, word);
    }
  });

  // Add a listener to hide tooltip when leaving the element
  element.addEventListener("mouseleave", () => {
    const tooltip = document.getElementById("subtitle-dictionary-tooltip");
    if (tooltip) tooltip.style.display = "none";
  });
}

// Get the word under the cursor
function getWordUnderCursor(event, element) {
  // Get text content and position information
  const text = element.textContent;
  const range = document.createRange();
  const selection = window.getSelection();

  // Try to determine which word is under the cursor
  // This uses the browser's ability to get the character at a point
  try {
    const textNode = Array.from(element.childNodes).find(
      (node) =>
        node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
    );

    if (!textNode) return null;

    // Use caretRangeFromPoint to find position in text
    const caretRange = document.caretRangeFromPoint(
      event.clientX,
      event.clientY
    );
    if (!caretRange) return null;

    // Expand selection to encompass the entire word
    caretRange.setStart(caretRange.startContainer, 0);
    caretRange.setEnd(caretRange.endContainer, caretRange.endContainer.length);

    // Extract the word from the range
    const selectedText = caretRange.toString();
    const words = selectedText.split(/\s+/);

    // Find word closest to cursor position
    const cursorX = event.clientX;
    let closestWord = null;
    let minDistance = Infinity;

    words.forEach((word) => {
      if (!word) return;

      // Create a temporary range for this word to find its position
      const tempRange = document.createRange();
      const wordIndex = selectedText.indexOf(word);
      if (wordIndex >= 0) {
        // Set start to the beginning of the word
        tempRange.setStart(caretRange.startContainer, wordIndex);
        tempRange.setEnd(caretRange.startContainer, wordIndex + word.length);

        // Get position of this word
        const rect = tempRange.getBoundingClientRect();
        const wordCenter = rect.left + rect.width / 2;

        // Calculate distance to cursor
        const distance = Math.abs(cursorX - wordCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestWord = word.replace(/[^\w'-]/g, "");
        }
      }
    });

    return closestWord;
  } catch (e) {
    // Fallback - divide the element width by approximate number of characters
    const rect = element.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const approxCharWidth = rect.width / text.length;
    const charIndex = Math.floor(relativeX / approxCharWidth);

    if (charIndex < 0 || charIndex >= text.length) return null;

    // Find word boundaries
    let startIndex = charIndex;
    while (startIndex > 0 && text[startIndex - 1].match(/[\w'-]/)) startIndex--;

    let endIndex = charIndex;
    while (endIndex < text.length && text[endIndex].match(/[\w'-]/)) endIndex++;

    return text.substring(startIndex, endIndex);
  }
}

// Show definition tooltip
async function showDefinition(event, word) {
  if (!word || word.length < 2) return;

  const tooltip = document.getElementById("subtitle-dictionary-tooltip");
  tooltip.style.display = "block";
  tooltip.style.left = `${event.pageX + 10}px`;
  tooltip.style.top = `${event.pageY + 10}px`;
  tooltip.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const response = await fetch(`${DICTIONARY_API}${word.toLowerCase()}`);

    if (!response.ok) {
      tooltip.innerHTML = `<div class="error">No definition found</div>`;
      return;
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      tooltip.innerHTML = `<div class="error">No definition found</div>`;
      return;
    }

    // Build the definition content
    let content = `<div class="word-header">${word}</div>`;

    // Get the first entry
    const entry = data[0];

    // Add phonetics if available
    if (entry.phonetic) {
      content += `<div class="phonetic">${entry.phonetic}</div>`;
    }

    // Add meanings
    if (entry.meanings && entry.meanings.length > 0) {
      content += '<div class="meanings">';

      // Show up to 2 meanings
      entry.meanings.slice(0, 2).forEach((meaning) => {
        content += `<div class="part-of-speech">${meaning.partOfSpeech}</div>`;

        if (meaning.definitions && meaning.definitions.length > 0) {
          content += '<ul class="definitions">';
          // Show up to 2 definitions per meaning
          meaning.definitions.slice(0, 2).forEach((def) => {
            content += `<li>${def.definition}</li>`;
          });
          content += "</ul>";
        }
      });

      content += "</div>";
    }

    tooltip.innerHTML = content;
  } catch (error) {
    tooltip.innerHTML = `<div class="error">Error fetching definition</div>`;
  }

  // Hide tooltip when mouse leaves the word
  document.addEventListener("mousemove", hideTooltipIfNotOverWord);
}

// Hide tooltip when mouse moves away
function hideTooltipIfNotOverWord(event) {
  const tooltip = document.getElementById("subtitle-dictionary-tooltip");

  if (
    !event.target.classList.contains("subtitle-word") &&
    event.target !== tooltip &&
    !tooltip.contains(event.target)
  ) {
    tooltip.style.display = "none";
    document.removeEventListener("mousemove", hideTooltipIfNotOverWord);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleEnabled") {
    enabled = message.enabled;
    if (enabled) {
      checkForSubtitles();
    }
    sendResponse({ status: "success" });
  }
});
