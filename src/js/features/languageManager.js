(() => {
  function createLanguageManager({ dom, state, config, helpers, supabaseServices, setAppStatus, i18n, onLanguageChange }) {
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
      const isChange = state.currentLanguage !== normalizedLanguage;
      state.currentLanguage = normalizedLanguage;

      document.documentElement.setAttribute("lang", normalizedLanguage);
      if (i18n && typeof i18n.setLocale === "function") {
        i18n.setLocale(normalizedLanguage);
        if (typeof i18n.applyToDom === "function") {
          i18n.applyToDom(document);
        }
      }
      updateLanguageButtonUi();

      if (isChange && typeof onLanguageChange === "function") {
        try {
          onLanguageChange(normalizedLanguage);
        } catch (_err) {
          /* ignore re-render errors */
        }
      }

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
          setAppStatus(i18n ? i18n.t("status.languageMissing") : "Language prefs not set up.");
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
            setAppStatus(i18n ? i18n.t("status.languageLocalOnly") : "Language saved locally.");
          }
          return;
        }
        if (!quiet) {
          const msg = error.message || "Unexpected error";
          setAppStatus(i18n ? i18n.t("status.languageSaveFailed", { error: msg }) : `Language save failed: ${msg}`);
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
