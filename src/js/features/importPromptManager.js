function createImportPromptManager({
  inputElement,
  defaultPrompt,
  localKeyPrefix,
  defaultKey,
  getCurrentUserId
}) {
  let currentImportPrompt = defaultPrompt;

  function getImportPromptStorageKey(userId) {
    return userId ? `${localKeyPrefix}${userId}` : defaultKey;
  }

  function normalizeImportPrompt(value) {
    const text = String(value ?? "").trim();
    return text || defaultPrompt;
  }

  function setImportPromptUi(promptText) {
    currentImportPrompt = normalizeImportPrompt(promptText);
    if (inputElement) {
      inputElement.value = currentImportPrompt;
    }
  }

  function persistImportPrompt(promptText) {
    const storageKey = getImportPromptStorageKey(getCurrentUserId?.() || null);
    window.localStorage.setItem(storageKey, normalizeImportPrompt(promptText));
  }

  function loadImportPrompt() {
    const userKey = getImportPromptStorageKey(getCurrentUserId?.() || null);
    const fallback = window.localStorage.getItem(defaultKey);
    const saved = window.localStorage.getItem(userKey) || fallback || defaultPrompt;
    setImportPromptUi(saved);
  }

  function getCurrentImportPrompt() {
    return currentImportPrompt;
  }

  function setCurrentImportPrompt(promptText) {
    currentImportPrompt = normalizeImportPrompt(promptText);
  }

  return {
    normalizeImportPrompt,
    setImportPromptUi,
    persistImportPrompt,
    loadImportPrompt,
    getCurrentImportPrompt,
    setCurrentImportPrompt
  };
}

window.StorecipeImportPromptManager = {
  createImportPromptManager
};
