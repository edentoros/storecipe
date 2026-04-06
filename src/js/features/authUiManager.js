(() => {
  function createAuthUiManager({ dom, state, config, callbacks }) {
    const {
      authStatus: authStatusEl,
      authLoading: authLoadingEl,
      authLoadingText,
      authEmail,
      authPassword,
      signInButton,
      signUpButton,
      signOutButton,
      themeToggleButton,
      signedInEmail,
      authEmailLabel,
      authPasswordLabel,
      authPanel,
      settingsButton,
      closeSettingsButton,
      settingsBackdrop,
      recipeListLoading,
      recipeList: recipeListEl,
      appStatus: appStatusEl
    } = dom;
    const { hasSupabaseConfig, SIGNED_OUT_PROMPT } = config;
    const { setSettingsOpen, updateThemeToggleUi } = callbacks;

    let pendingAuthError = false;

    function setAuthStatus(message, { isError = false } = {}) {
      pendingAuthError = isError;
      if (authStatusEl) {
        authStatusEl.textContent = message;
        authStatusEl.classList.toggle("auth-status--error", isError);
      }
    }

    function setAuthLoading(isLoading, message = "Working...") {
      state.isAuthLoading = isLoading;
      if (authLoadingEl) {
        authLoadingEl.classList.toggle("hidden", !isLoading);
      }
      if (authLoadingText) {
        authLoadingText.textContent = message;
      }

      if (authEmail) {
        authEmail.disabled = isLoading || Boolean(state.currentUser);
      }
      if (authPassword) {
        authPassword.disabled = isLoading || Boolean(state.currentUser);
      }
      if (signInButton) {
        signInButton.disabled = isLoading || Boolean(state.currentUser);
      }
      if (signUpButton) {
        signUpButton.disabled = isLoading || Boolean(state.currentUser);
      }
      if (signOutButton) {
        signOutButton.disabled = isLoading || !state.currentUser;
      }
      if (themeToggleButton) {
        themeToggleButton.disabled = isLoading || !state.currentUser;
      }
    }

    function setRecipeListLoading(isLoading) {
      if (state.isRecipeListLoading === isLoading) return;
      state.isRecipeListLoading = isLoading;
      if (recipeListLoading) {
        recipeListLoading.classList.toggle("hidden", !isLoading);
      }
      if (recipeListEl) {
        recipeListEl.classList.toggle("hidden", isLoading);
        recipeListEl.setAttribute("aria-busy", isLoading ? "true" : "false");
      }
    }

    function beginRecipeListLoad() {
      state.activeRecipeLoadCount += 1;
      if (state.activeRecipeLoadCount !== 1) return;
      if (state.recipeListLoaderTimerId) {
        window.clearTimeout(state.recipeListLoaderTimerId);
      }
      state.recipeListLoaderTimerId = window.setTimeout(() => {
        state.recipeListLoaderTimerId = null;
        if (state.activeRecipeLoadCount > 0 && !state.isStartupLoading) {
          setRecipeListLoading(true);
        }
      }, 120);
    }

    function endRecipeListLoad() {
      state.activeRecipeLoadCount = Math.max(0, state.activeRecipeLoadCount - 1);
      if (state.activeRecipeLoadCount > 0) {
        return;
      }
      if (state.recipeListLoaderTimerId) {
        window.clearTimeout(state.recipeListLoaderTimerId);
        state.recipeListLoaderTimerId = null;
      }
      setRecipeListLoading(false);
    }

    function resetRecipeListLoadingState() {
      state.activeRecipeLoadCount = 0;
      if (state.recipeListLoaderTimerId) {
        window.clearTimeout(state.recipeListLoaderTimerId);
        state.recipeListLoaderTimerId = null;
      }
      setRecipeListLoading(false);
    }

    function setAppStatus(message) {
      if (appStatusEl) {
        appStatusEl.textContent = message;
      }
    }

    function logSupabaseError(context, error) {
      if (!error) return;
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? error.message
            : String(error);
      console.error(`[Storecipe] ${context}:`, message, error);
    }

    function setAuthUi() {
      const isSignedIn = Boolean(state.currentUser);
      signOutButton.classList.toggle("hidden", !isSignedIn);
      if (signedInEmail) {
        signedInEmail.classList.toggle("hidden", !isSignedIn);
        signedInEmail.textContent = isSignedIn ? String(state.currentUser?.email || "") : "";
      }
      if (themeToggleButton) {
        themeToggleButton.classList.remove("hidden");
      }
      if (authStatusEl) {
        authStatusEl.classList.toggle("hidden", isSignedIn);
      }
      if (authEmailLabel) {
        authEmailLabel.classList.toggle("hidden", isSignedIn);
      }
      if (authPasswordLabel) {
        authPasswordLabel.classList.toggle("hidden", isSignedIn);
      }
      if (signInButton) {
        signInButton.classList.toggle("hidden", isSignedIn);
      }
      signUpButton.classList.toggle("hidden", isSignedIn);
      authEmail.classList.toggle("hidden", isSignedIn);
      authPassword.classList.toggle("hidden", isSignedIn);
      if (closeSettingsButton) {
        closeSettingsButton.classList.toggle("hidden", !isSignedIn);
      }
      if (authPanel) {
        authPanel.classList.toggle("panel--auth-modal", isSignedIn);
        if (isSignedIn) {
          authPanel.setAttribute("role", "dialog");
          authPanel.setAttribute("aria-modal", "true");
        } else {
          authPanel.removeAttribute("role");
          authPanel.removeAttribute("aria-modal");
        }
      }

      if (settingsButton) {
        settingsButton.classList.toggle("hidden", !isSignedIn);
      }
      authEmail.disabled = isSignedIn || state.isAuthLoading;
      authPassword.disabled = isSignedIn || state.isAuthLoading;
      if (signInButton) {
        signInButton.disabled = isSignedIn || state.isAuthLoading;
      }
      signUpButton.disabled = isSignedIn || state.isAuthLoading;
      if (signOutButton) {
        signOutButton.disabled = !isSignedIn || state.isAuthLoading;
      }
      if (themeToggleButton) {
        themeToggleButton.disabled = false;
        updateThemeToggleUi();
      }
      if (authLoadingEl) {
        authLoadingEl.classList.toggle("hidden", !state.isAuthLoading);
      }

      setSettingsOpen(isSignedIn ? state.isSettingsOpen : false, { returnFocus: false });
      if (!isSignedIn && authPanel) {
        authPanel.classList.remove("hidden");
      }

      if (!hasSupabaseConfig) {
        setAuthStatus("Sign in is not available.");
        setAppStatus("");
        if (authEmail) authEmail.classList.add("hidden");
        if (authPassword) authPassword.classList.add("hidden");
        if (authEmailLabel) authEmailLabel.classList.add("hidden");
        if (authPasswordLabel) authPasswordLabel.classList.add("hidden");
        if (signInButton) signInButton.classList.add("hidden");
        signUpButton.classList.add("hidden");
        if (settingsButton) settingsButton.classList.add("hidden");
        if (closeSettingsButton) closeSettingsButton.classList.add("hidden");
        if (signedInEmail) {
          signedInEmail.classList.add("hidden");
          signedInEmail.textContent = "";
        }
        if (settingsBackdrop) settingsBackdrop.classList.add("hidden");
        if (authPanel) {
          authPanel.classList.remove("hidden");
          authPanel.classList.remove("panel--auth-modal");
        }
        return;
      }

      if (pendingAuthError) {
        pendingAuthError = false;
      } else {
        setAuthStatus(isSignedIn ? `Signed in as ${state.currentUser.email}` : SIGNED_OUT_PROMPT);
      }
      if (!isSignedIn) {
        setAppStatus("");
      }
    }

    return {
      setAuthStatus,
      setAuthLoading,
      setRecipeListLoading,
      beginRecipeListLoad,
      endRecipeListLoad,
      resetRecipeListLoadingState,
      setAppStatus,
      logSupabaseError,
      setAuthUi
    };
  }

  window.StorecipeAuthUiManager = { createAuthUiManager };
})();
