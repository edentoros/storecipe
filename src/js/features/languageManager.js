(() => {
  function createLanguageManager({ dom, state, config, helpers, supabaseServices, setAppStatus }) {
    const { languageSelector, languageToggleButton, languageMenu } = dom;
    const {
      DEFAULT_LANGUAGE,
      LANGUAGE_LOCAL_KEY_PREFIX,
      THEME_PREFERENCES_TABLE,
      SUPPORTED_LANGUAGES
    } = config;
    const { normalizeLanguage } = helpers;
    const {
      hasSupabaseConfig,
      fetchLanguagePreferenceViaRest,
      upsertLanguagePreferenceViaRest
    } = supabaseServices;

    const ANONYMOUS_LANGUAGE_KEY = `${LANGUAGE_LOCAL_KEY_PREFIX}anonymous`;

    function getLanguageStorageKey(userId) {
      return `${LANGUAGE_LOCAL_KEY_PREFIX}${userId}`;
    }

    function getLanguageDescriptor(code) {
      const normalized = normalizeLanguage(code);
      return (
        SUPPORTED_LANGUAGES.find((lang) => lang.code === normalized) ||
        SUPPORTED_LANGUAGES[0]
      );
    }

    function updateLanguageButtonUi() {
      if (!languageToggleButton) return;
      const descriptor = getLanguageDescriptor(state.currentLanguage);
      const flagEl = languageToggleButton.querySelector(".language-toggle-button__flag");
      const labelEl = languageToggleButton.querySelector(".language-toggle-button__label");
      if (flagEl) flagEl.textContent = descriptor.flag;
      if (labelEl) labelEl.textContent = descriptor.label;
      languageToggleButton.setAttribute("aria-label", `Language: ${descriptor.label}. Click to change.`);

      if (languageMenu) {
        Array.from(languageMenu.querySelectorAll("[role='option']")).forEach((item) => {
          if (!(item instanceof HTMLElement)) return;
          const isSelected = item.dataset.lang === descriptor.code;
          item.setAttribute("aria-selected", isSelected ? "true" : "false");
          item.classList.toggle("language-menu__item--selected", isSelected);
        });
      }
    }

    function setLanguageMenuOpen(nextOpen) {
      const shouldOpen = Boolean(nextOpen);
      state.isLanguageMenuOpen = shouldOpen;
      if (languageMenu) {
        languageMenu.classList.toggle("hidden", !shouldOpen);
      }
      if (languageToggleButton) {
        languageToggleButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      }
      if (languageSelector) {
        languageSelector.classList.toggle("language-selector--open", shouldOpen);
      }
    }

    function setLanguage(language, options = {}) {
      const { persistForCurrentUser = true } = options;
      const normalizedLanguage = normalizeLanguage(language);
      state.currentLanguage = normalizedLanguage;

      document.documentElement.setAttribute("lang", normalizedLanguage);
      updateLanguageButtonUi();

      if (persistForCurrentUser) {
        const key = state.currentUser?.id
          ? getLanguageStorageKey(state.currentUser.id)
          : ANONYMOUS_LANGUAGE_KEY;
        window.localStorage.setItem(key, normalizedLanguage);
      }
    }

    function isMissingLanguageColumn(error) {
      const message = String(error?.message || "").toLowerCase();
      return (
        message.includes("language") &&
        (message.includes("column") ||
          message.includes("schema cache") ||
          message.includes("could not find"))
      );
    }

    function isMissingPreferencesTable(error) {
      const message = String(error?.message || "").toLowerCase();
      return (
        message.includes(THEME_PREFERENCES_TABLE) &&
        (message.includes("relation") ||
          message.includes("table") ||
          message.includes("schema cache") ||
          message.includes("could not find"))
      );
    }

    async function loadLanguagePreference() {
      if (!state.currentUser) {
        const anonLanguage = window.localStorage.getItem(ANONYMOUS_LANGUAGE_KEY);
        setLanguage(anonLanguage ? normalizeLanguage(anonLanguage) : DEFAULT_LANGUAGE, {
          persistForCurrentUser: false
        });
        return;
      }

      const userLocal = window.localStorage.getItem(getLanguageStorageKey(state.currentUser.id));
      const anonLocal = window.localStorage.getItem(ANONYMOUS_LANGUAGE_KEY);
      const localLanguage = normalizeLanguage(userLocal || anonLocal || DEFAULT_LANGUAGE);
      setLanguage(localLanguage, { persistForCurrentUser: false });

      if (!hasSupabaseConfig || !state.isLanguagePreferenceAvailable) {
        return;
      }

      try {
        const rows = await fetchLanguagePreferenceViaRest(state.currentUser.id);
        const serverLanguage = rows[0]?.language ? normalizeLanguage(rows[0].language) : null;
        if (serverLanguage) {
          setLanguage(serverLanguage);
          return;
        }

        await upsertLanguagePreferenceViaRest(state.currentUser.id, state.currentLanguage);
      } catch (error) {
        if (isMissingLanguageColumn(error) || isMissingPreferencesTable(error)) {
          state.isLanguagePreferenceAvailable = false;
          setAppStatus("Language prefs not set up. Run SQL to add `language` column to user_preferences.");
        }
      }
    }

    async function saveLanguagePreference(language, options = {}) {
      const { quiet = false } = options;
      if (!state.currentUser || !hasSupabaseConfig || !state.isLanguagePreferenceAvailable) {
        return;
      }

      try {
        await upsertLanguagePreferenceViaRest(state.currentUser.id, language);
      } catch (error) {
        if (isMissingLanguageColumn(error) || isMissingPreferencesTable(error)) {
          state.isLanguagePreferenceAvailable = false;
          if (!quiet) {
            setAppStatus("Language saved locally. Add `language` column to user_preferences to sync.");
          }
          return;
        }
        if (!quiet) {
          setAppStatus(`Language save failed: ${error.message || "Unexpected error"}`);
        }
      }
    }

    return {
      updateLanguageButtonUi,
      setLanguageMenuOpen,
      setLanguage,
      loadLanguagePreference,
      saveLanguagePreference
    };
  }

  window.StorecipeLanguageManager = { createLanguageManager };
})();
