(() => {
  function createThemeManager({ dom, state, config, helpers, supabaseServices, setAppStatus }) {
    const { themeToggleButton } = dom;
    const { DEFAULT_THEME, THEME_LOCAL_KEY_PREFIX, THEME_PREFERENCES_TABLE } = config;
    const { normalizeTheme } = helpers;
    const { hasSupabaseConfig, fetchThemePreferenceViaRest, upsertThemePreferenceViaRest } = supabaseServices;

    function getThemeStorageKey(userId) {
      return `${THEME_LOCAL_KEY_PREFIX}${userId}`;
    }

    const THEME_LABELS = { light: "Theme: Light", dark: "Theme: Dark", sunset: "Theme: Sunset" };
    const SUNSET_START_HOUR = 19;
    const SUNSET_END_HOUR = 7;
    let sunsetTimerId = null;

    function isSunsetDark() {
      const hour = new Date().getHours();
      return hour >= SUNSET_START_HOUR || hour < SUNSET_END_HOUR;
    }

    function updateThemeToggleUi() {
      if (!themeToggleButton) return;
      const label = THEME_LABELS[state.currentTheme] || THEME_LABELS.light;
      themeToggleButton.textContent = label;
      const isPressed = state.currentTheme === "dark" || (state.currentTheme === "sunset" && isSunsetDark());
      themeToggleButton.setAttribute("aria-pressed", isPressed ? "true" : "false");
    }

    const ANONYMOUS_THEME_KEY = `${THEME_LOCAL_KEY_PREFIX}anonymous`;

    function applySunsetCheck() {
      const shouldBeDark = isSunsetDark();
      document.body.classList.toggle("theme-dark", shouldBeDark);
    }

    function startSunsetTimer() {
      stopSunsetTimer();
      applySunsetCheck();
      sunsetTimerId = window.setInterval(() => {
        if (state.currentTheme === "sunset") {
          applySunsetCheck();
        }
      }, 60 * 1000);
    }

    function stopSunsetTimer() {
      if (sunsetTimerId !== null) {
        window.clearInterval(sunsetTimerId);
        sunsetTimerId = null;
      }
    }

    function setTheme(theme, options = {}) {
      const { persistForCurrentUser = true } = options;
      const normalizedTheme = normalizeTheme(theme);
      state.currentTheme = normalizedTheme;

      if (normalizedTheme === "sunset") {
        startSunsetTimer();
      } else {
        stopSunsetTimer();
        document.body.classList.toggle("theme-dark", normalizedTheme === "dark");
      }
      updateThemeToggleUi();

      if (persistForCurrentUser) {
        const key = state.currentUser?.id
          ? getThemeStorageKey(state.currentUser.id)
          : ANONYMOUS_THEME_KEY;
        window.localStorage.setItem(key, normalizedTheme);
      }
    }

    function isMissingThemePreferencesTable(error) {
      const message = String(error?.message || "").toLowerCase();
      return (
        message.includes(THEME_PREFERENCES_TABLE) &&
        (message.includes("relation") ||
          message.includes("table") ||
          message.includes("schema cache") ||
          message.includes("could not find"))
      );
    }

    async function loadThemePreference() {
      if (!state.currentUser) {
        const anonTheme = window.localStorage.getItem(ANONYMOUS_THEME_KEY);
        setTheme(anonTheme ? normalizeTheme(anonTheme) : DEFAULT_THEME, { persistForCurrentUser: false });
        return;
      }

      const userLocalTheme = window.localStorage.getItem(getThemeStorageKey(state.currentUser.id));
      const anonTheme = window.localStorage.getItem(ANONYMOUS_THEME_KEY);
      const localTheme = normalizeTheme(userLocalTheme || anonTheme);
      setTheme(localTheme, { persistForCurrentUser: false });

      if (!hasSupabaseConfig || !state.isThemePreferenceAvailable) {
        return;
      }

      try {
        const rows = await fetchThemePreferenceViaRest(state.currentUser.id);
        const serverTheme = rows[0]?.theme ? normalizeTheme(rows[0].theme) : null;
        if (serverTheme) {
          setTheme(serverTheme);
          return;
        }

        await upsertThemePreferenceViaRest(state.currentUser.id, state.currentTheme);
      } catch (error) {
        if (isMissingThemePreferencesTable(error)) {
          state.isThemePreferenceAvailable = false;
          setAppStatus("Theme prefs table missing. Run SQL setup to save theme per user.");
          return;
        }
      }
    }

    async function saveThemePreference(theme, options = {}) {
      const { quiet = false } = options;
      if (!state.currentUser || !hasSupabaseConfig || !state.isThemePreferenceAvailable) {
        return;
      }

      try {
        await upsertThemePreferenceViaRest(state.currentUser.id, theme);
      } catch (error) {
        if (isMissingThemePreferencesTable(error)) {
          state.isThemePreferenceAvailable = false;
          if (!quiet) {
            setAppStatus("Theme saved locally. Run SQL setup to sync theme to Supabase.");
          }
          return;
        }
        if (!quiet) {
          setAppStatus(`Theme save failed: ${error.message || "Unexpected error"}`);
        }
      }
    }

    return {
      updateThemeToggleUi,
      setTheme,
      loadThemePreference,
      saveThemePreference
    };
  }

  window.StorecipeThemeManager = { createThemeManager };
})();
