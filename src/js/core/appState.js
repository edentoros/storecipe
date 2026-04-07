(() => {
  function createAppState(defaults = {}) {
    return {
      recipes: [],
      currentUser: null,
      currentSession: null,
      editingRecipeId: null,
      signedImageUrlByPath: {},
      isSettingsOpen: false,
      lastFocusedBeforeSettings: null,
      localEditPreviewObjectUrl: null,
      pendingImageAction: "keep",
      pendingImageFile: null,
      pendingImageUrl: "",
      currentTheme: defaults.DEFAULT_THEME || "light",
      isImportingRecipe: false,
      isAuthLoading: false,
      isRecipeListLoading: false,
      isStartupLoading: false,
      isInlineFieldSaveInProgress: false,
      activeRecipeLoadCount: 0,
      recipeListLoaderTimerId: null,
      hasCompletedInitialAuthBootstrap: false,
      isThemePreferenceAvailable: true,
      hasRecipeMetaColumns: true,
      hasCategoryFavColumns: true,
      activeCategory: "",
      showFavouritesOnly: false,
      sortBy: "created_at_desc"
    };
  }

  window.StorecipeAppState = { createAppState };
})();
