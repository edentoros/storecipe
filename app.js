(() => {
  const {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL_PLACEHOLDER,
    SUPABASE_KEY_PLACEHOLDER,
    NETWORK_TIMEOUT_MS,
    IMAGE_RESOLVE_TIMEOUT_MS,
    IMAGE_SIGN_TIMEOUT_MS,
    BUCKET,
    LOCAL_RECIPES_KEY,
    THEME_PREFERENCES_TABLE,
    DEFAULT_THEME,
    DEFAULT_DIFFICULTY,
    THEME_LOCAL_KEY_PREFIX,
    IMAGE_MAX_SIZE_BYTES,
    IMAGE_ALLOWED_TYPES,
    RECIPE_IMPORT_FUNCTION,
    RECIPE_IMPORT_PROMPT_LOCAL_KEY_PREFIX,
    RECIPE_IMPORT_PROMPT_DEFAULT_KEY,
    DEFAULT_RECIPE_IMPORT_PROMPT
  } = window.StorecipeConstants;
  const { getDomRefs } = window.StorecipeDomRefs;
  const {
    formatDate,
    escapeHtml,
    normalizeDifficulty: normalizeDifficultyCore,
    normalizeTheme,
    withTimeout,
    getDirectImageUrl,
    isValidHttpUrl,
    getDisplayImageUrl,
    normalizeStoragePath: normalizeStoragePathCore,
    normalizeOptionalText,
    sanitizeDigits,
    formatDuration,
    parseDurationText,
    parseTimePair,
    validateServesValue,
    normalizeImportedText,
    parseOptionalBoundedInteger,
    validateImageFile,
    debounce
  } = window.StorecipeHelpers;
  const { createImportPromptManager } = window.StorecipeImportPromptManager;
  const { createRecipeMetaManager } = window.StorecipeRecipeMetaManager;
  const { createRecipeRenderer } = window.StorecipeRecipeRenderer;
  const { createSupabaseServices } = window.StorecipeSupabaseServices;
  const { createAppState } = window.StorecipeAppState;
  const { createImageManager } = window.StorecipeImageManager;
  const { createSettingsManager } = window.StorecipeSettingsManager;
  const { createAuthUiManager } = window.StorecipeAuthUiManager;
  const { createThemeManager } = window.StorecipeThemeManager;
  const { createViewManager } = window.StorecipeViewManager;
  const { createInlineEditManager } = window.StorecipeInlineEditManager;

  const {
    appRoot,
    startupLoader,
    authForm,
    authPanel,
    settingsBackdrop,
    settingsButton,
    closeSettingsButton,
    authEmail,
    authPassword,
    authStatus,
    authLoading,
    authLoadingText,
    appStatus,
    signInButton,
    signUpButton,
    themeToggleButton,
    signedInEmail,
    signOutButton,
    authConfirmPassword,
    authConfirmPasswordLabel,
    passwordRequirements,
    authEmailLabel,
    authPasswordLabel,
    recipeForm,
    recipeListLoading,
    recipeList,
    searchInput,
    searchPanel,
    listPanel,
    addRecipeSection,
    recipeFormHeading,
    toggleAddRecipe,
    saveRecipeButton,
    cancelEditButton,
    imageInput,
    imageUrlInput,
    recipeImportUrlInput,
    importRecipeButton,
    recipeImportPromptInput,
    resetImportPromptButton,
    prepHoursInput,
    prepMinutesInput,
    prepTimeWarning,
    cookHoursInput,
    cookMinutesInput,
    cookTimeWarning,
    totalTimeInput,
    servesInput,
    servesWarning,
    difficultyInput,
    difficultyValue,
    editImageTools,
    editImagePreview,
    editImageEmpty,
    chooseImageButton,
    clearImageButton,
    undoImageButton,
    recipeDetail,
    detailContent,
    closeDetail,
    addButtonWideQuery
  } = getDomRefs();

  const state = createAppState({ DEFAULT_THEME });

  function setStartupLoading(isLoading) {
    state.isStartupLoading = Boolean(isLoading);
    if (startupLoader) {
      startupLoader.classList.toggle("hidden", !isLoading);
    }
    if (appRoot) {
      appRoot.hidden = Boolean(isLoading);
      appRoot.setAttribute("aria-hidden", isLoading ? "true" : "false");
      appRoot.setAttribute("aria-busy", isLoading ? "true" : "false");
    }
  }
  const normalizeDifficulty = (value) => normalizeDifficultyCore(value, DEFAULT_DIFFICULTY);
  const normalizeStoragePath = (value) => normalizeStoragePathCore(value, BUCKET);
  const SIGNED_OUT_PROMPT = "Sign into your account or create new account.";
  const supabaseServices = createSupabaseServices({
    config: {
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_URL_PLACEHOLDER,
      SUPABASE_KEY_PLACEHOLDER,
      NETWORK_TIMEOUT_MS,
      IMAGE_RESOLVE_TIMEOUT_MS,
      IMAGE_SIGN_TIMEOUT_MS,
      BUCKET,
      THEME_PREFERENCES_TABLE,
      RECIPE_IMPORT_FUNCTION
    },
    state: {
      get currentSession() {
        return state.currentSession;
      },
      signedImageUrlByPath: state.signedImageUrlByPath
    },
    helpers: {
      withTimeout,
      normalizeStoragePath: normalizeStoragePathCore,
      getDirectImageUrl
    }
  });
  const {
    hasSupabaseConfig,
    client,
    fetchThemePreferenceViaRest,
    upsertThemePreferenceViaRest,
    insertRecipeViaRest,
    updateRecipeViaRest,
    fetchRecipesViaRest,
    importRecipeFromUrlViaFunction,
    uploadImage,
    readFileAsDataUrl,
    getSignedImageUrl
  } = supabaseServices;
  const durationDigitInputs = [prepHoursInput, prepMinutesInput, cookHoursInput, cookMinutesInput].filter(Boolean);

  const demoRecipes = [
    {
      id: "demo-omelette",
      title: "Simple Veggie Omelette",
      ingredients: "2 eggs\n1/4 cup chopped onion\n1/4 cup chopped bell pepper\nSalt and pepper",
      method:
        "1. Whisk eggs with salt and pepper.\n2. Saute onion and pepper for 2 minutes.\n3. Add eggs and cook until set.",
      image_url: null,
      difficulty: DEFAULT_DIFFICULTY,
      created_at: "2026-02-10T10:30:00.000Z"
    },
    {
      id: "demo-pasta",
      title: "Quick Garlic Pasta",
      ingredients: "200g spaghetti\n3 garlic cloves\n2 tbsp olive oil\nChili flakes\nSalt",
      method:
        "1. Cook spaghetti in salted water.\n2. Saute sliced garlic in olive oil.\n3. Toss pasta with garlic oil and chili flakes.",
      image_url: null,
      difficulty: DEFAULT_DIFFICULTY,
      created_at: "2026-02-09T18:00:00.000Z"
    }
  ];

  function getLocalRecipes() {
    const stored = window.localStorage.getItem(LOCAL_RECIPES_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map((item) => ({ ...item, difficulty: normalizeDifficulty(item?.difficulty) }));
        }
      } catch (_error) {
      }
    }

    window.localStorage.setItem(LOCAL_RECIPES_KEY, JSON.stringify(demoRecipes));
    return [...demoRecipes];
  }

  function saveLocalRecipes(nextRecipes) {
    window.localStorage.setItem(LOCAL_RECIPES_KEY, JSON.stringify(nextRecipes));
  }

  const importPromptManager = createImportPromptManager({
    inputElement: recipeImportPromptInput,
    defaultPrompt: DEFAULT_RECIPE_IMPORT_PROMPT,
    localKeyPrefix: RECIPE_IMPORT_PROMPT_LOCAL_KEY_PREFIX,
    defaultKey: RECIPE_IMPORT_PROMPT_DEFAULT_KEY,
    getCurrentUserId: () => state.currentUser?.id || null
  });
  const normalizeImportPrompt = importPromptManager.normalizeImportPrompt;
  const setImportPromptUi = importPromptManager.setImportPromptUi;
  const persistImportPrompt = importPromptManager.persistImportPrompt;
  const loadImportPrompt = importPromptManager.loadImportPrompt;

  function updateImportButtonUi() {
    if (!importRecipeButton) return;
    importRecipeButton.disabled = state.isImportingRecipe;
    importRecipeButton.textContent = state.isImportingRecipe ? "Importing..." : "Import";
  }

  function applyImportedRecipeToForm(recipe) {
    if (!recipe || !recipeForm) return;

    const title = normalizeImportedText(recipe.title);
    const ingredients = normalizeImportedText(recipe.ingredients);
    const method = normalizeImportedText(recipe.method);
    const prepHours = parseOptionalBoundedInteger(recipe.prep_hours, 0, 10);
    const prepMinutes = parseOptionalBoundedInteger(recipe.prep_minutes, 0, 60);
    const cookHours = parseOptionalBoundedInteger(recipe.cook_hours, 0, 10);
    const cookMinutes = parseOptionalBoundedInteger(recipe.cook_minutes, 0, 60);
    const serves = parseOptionalBoundedInteger(recipe.serves, 1, 15);
    const difficulty = parseOptionalBoundedInteger(recipe.difficulty, 1, 10) ?? DEFAULT_DIFFICULTY;

    if (title) {
      recipeForm.elements.title.value = title;
    }
    if (ingredients) {
      recipeForm.elements.ingredients.value = ingredients;
    }
    if (method) {
      recipeForm.elements.method.value = method;
    }

    if (prepHoursInput) prepHoursInput.value = prepHours == null ? "" : String(prepHours);
    if (prepMinutesInput) prepMinutesInput.value = prepMinutes == null ? "" : String(prepMinutes);
    if (cookHoursInput) cookHoursInput.value = cookHours == null ? "" : String(cookHours);
    if (cookMinutesInput) cookMinutesInput.value = cookMinutes == null ? "" : String(cookMinutes);
    if (servesInput) servesInput.value = serves == null ? "" : String(serves);
    if (difficultyInput) {
      difficultyInput.value = String(difficulty);
      syncDifficultyUi();
    }

    const importedImageUrl = normalizeImportedText(recipe.image_url);
    if (importedImageUrl && isValidHttpUrl(importedImageUrl)) {
      state.pendingImageAction = "replace_url";
      state.pendingImageUrl = importedImageUrl;
      state.pendingImageFile = null;
      clearEditPreviewObjectUrl();
      if (imageInput) {
        imageInput.value = "";
      }
      if (imageUrlInput) {
        imageUrlInput.value = importedImageUrl;
      }
    }

    const editingRecipe = state.editingRecipeId ? state.recipes.find((item) => item.id === state.editingRecipeId) || null : null;
    void refreshEditImageTools(editingRecipe);
    getRecipeMetaFromFormData(new FormData(recipeForm), { showStatus: false });
  }

  const authUiManager = createAuthUiManager({
    dom: {
      authStatus, authLoading, authLoadingText, authEmail, authPassword,
      signInButton, signUpButton, signOutButton, themeToggleButton, signedInEmail,
      authEmailLabel, authPasswordLabel, authPanel, settingsButton, closeSettingsButton,
      settingsBackdrop, recipeListLoading, recipeList, appStatus
    },
    state,
    config: { hasSupabaseConfig, SIGNED_OUT_PROMPT },
    callbacks: {
      setSettingsOpen: (...args) => setSettingsOpen(...args),
      updateThemeToggleUi: () => updateThemeToggleUi()
    }
  });
  const setAuthStatus = authUiManager.setAuthStatus;
  const setAuthLoading = authUiManager.setAuthLoading;
  const beginRecipeListLoad = authUiManager.beginRecipeListLoad;
  const endRecipeListLoad = authUiManager.endRecipeListLoad;
  const resetRecipeListLoadingState = authUiManager.resetRecipeListLoadingState;
  const setAppStatus = authUiManager.setAppStatus;
  const logSupabaseError = authUiManager.logSupabaseError;
  const setAuthUi = authUiManager.setAuthUi;

  const themeManager = createThemeManager({
    dom: { themeToggleButton },
    state,
    config: { DEFAULT_THEME, THEME_LOCAL_KEY_PREFIX, THEME_PREFERENCES_TABLE },
    helpers: { normalizeTheme },
    supabaseServices: { hasSupabaseConfig, fetchThemePreferenceViaRest, upsertThemePreferenceViaRest },
    setAppStatus
  });
  const updateThemeToggleUi = themeManager.updateThemeToggleUi;
  const setTheme = themeManager.setTheme;
  const loadThemePreference = themeManager.loadThemePreference;
  const saveThemePreference = themeManager.saveThemePreference;

  const imageManager = createImageManager({
    dom: { editImageTools, editImagePreview, editImageEmpty, imageUrlInput, clearImageButton, undoImageButton },
    state,
    helpers: { isValidHttpUrl, getDisplayImageUrl },
    getSignedImageUrl
  });
  const clearEditPreviewObjectUrl = imageManager.clearEditPreviewObjectUrl;
  const hideEditImageTools = imageManager.hideEditImageTools;
  const refreshEditImageTools = imageManager.refreshEditImageTools;

  function setRecipeFormMode(recipe = null) {
    state.editingRecipeId = recipe?.id || null;
    if (recipeFormHeading) {
      recipeFormHeading.textContent = state.editingRecipeId ? "Edit Recipe" : "Add Recipe";
    }
    if (saveRecipeButton) {
      saveRecipeButton.textContent = state.editingRecipeId ? "Update Recipe" : "Save Recipe";
    }
    if (cancelEditButton) {
      cancelEditButton.classList.remove("hidden");
      cancelEditButton.textContent = state.editingRecipeId ? "Cancel editing" : "Cancel";
    }
    if (!state.editingRecipeId) {
      hideEditImageTools();
    }
  }

  function startEditRecipe(recipe) {
    if (!recipe) return;
    clearEditPreviewObjectUrl();
    state.pendingImageAction = "keep";
    state.pendingImageFile = null;
    state.pendingImageUrl = "";
    setRecipeFormMode(recipe);
    recipeForm.elements.title.value = recipe.title || "";
    recipeForm.elements.ingredients.value = recipe.ingredients || "";
    recipeForm.elements.method.value = recipe.method || "";
    const prepParsed = parseDurationText(recipe.prep_time ?? recipe.prepTime ?? "");
    const cookParsed = parseDurationText(recipe.cooking_time ?? recipe.cookingTime ?? "");
    if (prepHoursInput) {
      prepHoursInput.value = prepParsed.hours;
    }
    if (prepMinutesInput) {
      prepMinutesInput.value = prepParsed.minutes;
    }
    if (cookHoursInput) {
      cookHoursInput.value = cookParsed.hours;
    }
    if (cookMinutesInput) {
      cookMinutesInput.value = cookParsed.minutes;
    }
    if (totalTimeInput) {
      totalTimeInput.value = normalizeOptionalText(recipe.total_time ?? recipe.totalTime ?? "") || "";
    }
    if (recipeForm.elements.serves) {
      recipeForm.elements.serves.value = recipe.serves ?? recipe.servings ?? "";
    }
    if (difficultyInput) {
      difficultyInput.value = String(normalizeDifficulty(recipe.difficulty));
      syncDifficultyUi();
    }
    recipeForm.elements.image.value = "";
    if (imageUrlInput) {
      imageUrlInput.value = "";
    }
    getRecipeMetaFromFormData(new FormData(recipeForm), { showStatus: false });
    setAddRecipeOpen(true);
    void refreshEditImageTools(recipe);
    setAppStatus("Editing recipe. Update fields and click Update Recipe.");
  }

  function resetRecipeFormState() {
    recipeForm.reset();
    syncDifficultyUi();
    recipeMetaManager.resetValidationUi();
    setRecipeFormMode(null);
    hideEditImageTools();
  }

  const hasCoreUi =
    Boolean(recipeForm) &&
    Boolean(toggleAddRecipe) &&
    Boolean(recipeList) &&
    Boolean(searchInput) &&
    Boolean(addRecipeSection);
  if (!hasCoreUi) {
    setAppStatus("UI mismatch detected. Reload page and ensure latest index.html is running.");
    return;
  }

  recipeForm.noValidate = true;

  function isMissingUserIdColumn(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("user_id") && message.includes("column");
  }

  const recipeMetaManager = createRecipeMetaManager({
    recipeForm,
    prepHoursInput,
    prepMinutesInput,
    prepTimeWarning,
    cookHoursInput,
    cookMinutesInput,
    cookTimeWarning,
    totalTimeInput,
    servesInput,
    servesWarning,
    difficultyInput,
    difficultyValue,
    defaultDifficulty: DEFAULT_DIFFICULTY,
    helpers: {
      normalizeDifficulty: normalizeDifficultyCore,
      parseTimePair,
      validateServesValue,
      formatDuration
    }
  });
  const syncDifficultyUi = recipeMetaManager.syncDifficultyUi;
  const getRecipeMetaFromFormData = recipeMetaManager.getRecipeMetaFromFormData;

  function isMissingRecipeMetaColumns(error) {
    const message = String(error?.message || "").toLowerCase();
    const mentionsMetaColumn =
      message.includes("prep_time") ||
      message.includes("cooking_time") ||
      message.includes("total_time") ||
      message.includes("serves") ||
      message.includes("difficulty");
    return mentionsMetaColumn && (message.includes("column") || message.includes("schema cache"));
  }

  const settingsManager = createSettingsManager({
    dom: { authPanel, settingsBackdrop, settingsButton, themeToggleButton, signOutButton, authEmail },
    state
  });
  const getSettingsFocusableElements = settingsManager.getSettingsFocusableElements;
  const positionSettingsPanel = settingsManager.positionSettingsPanel;
  const setSettingsOpen = settingsManager.setSettingsOpen;

  const viewManager = createViewManager({
    dom: {
      searchPanel, listPanel, addRecipeSection, recipeDetail, detailContent,
      searchInput, toggleAddRecipe, recipeForm, addButtonWideQuery
    },
    state,
    config: { hasSupabaseConfig },
    callbacks: {
      resetRecipeFormState: () => resetRecipeFormState(),
      resetRecipeListLoadingState
    }
  });
  const isRecipeUiAvailable = viewManager.isRecipeUiAvailable;
  const setToggleAddRecipeState = viewManager.setToggleAddRecipeState;
  const setRecipeUiEnabled = viewManager.setRecipeUiEnabled;
  const showListView = viewManager.showListView;
  const setAddRecipeOpen = viewManager.setAddRecipeOpen;
  const setDetailOpen = viewManager.setDetailOpen;

  const recipeRenderer = createRecipeRenderer({
    dom: { recipeList, detailContent, recipeDetail },
    state: {
      get recipes() {
        return state.recipes;
      },
      get currentUser() {
        return state.currentUser;
      }
    },
    hasSupabaseConfig,
    helpers: {
      formatDate,
      escapeHtml,
      normalizeDifficulty: normalizeDifficultyCore,
      parseDurationText,
      formatDuration,
      getDisplayImageUrl,
      getDirectImageUrl
    },
    getSignedImageUrl,
    setDetailOpen,
    logSupabaseError
  });
  const renderList = recipeRenderer.renderList;
  const showDetail = recipeRenderer.showDetail;
  const hydrateImagesInBackground = recipeRenderer.hydrateImagesInBackground;

  async function loadRecipes() {
    beginRecipeListLoad();
    try {
      if (!hasSupabaseConfig || !state.currentUser) {
        state.recipes = [];
        renderList(searchInput.value.trim().toLowerCase());
        return;
      }

      let data;
      try {
        data = await fetchRecipesViaRest(state.currentUser.id);
      } catch (error) {
        logSupabaseError("load recipes", error);
        if (isMissingUserIdColumn(error)) {
          setAppStatus("Database is missing recipes.user_id. Run the security migration SQL.");
        } else {
          setAppStatus(`Load failed: ${error.message}`);
        }
        return;
      }

      state.recipes = recipeRenderer.normalizeLoadedRecipes(data, DEFAULT_DIFFICULTY);
      renderList(searchInput.value.trim().toLowerCase());

      void hydrateImagesInBackground(state.recipes);
      if (!state.recipes.length) {
        setAppStatus("No recipes found for this signed-in account.");
      }
    } finally {
      endRecipeListLoad();
    }
  }

  async function addRecipe(formData) {
    const title = formData.get("title")?.toString().trim();
    const ingredients = formData.get("ingredients")?.toString().trim();
    const method = formData.get("method")?.toString().trim();
    const recipeMeta = getRecipeMetaFromFormData(formData);
    if (recipeMeta.error) {
      return;
    }
    const formImage = formData.get("image");
    const image =
      state.pendingImageAction === "replace_file" && state.pendingImageFile instanceof File ? state.pendingImageFile : formImage;
    const imageUrlValue =
      state.pendingImageAction === "replace_url" && isValidHttpUrl(state.pendingImageUrl) ? state.pendingImageUrl : null;

    if (!title || !ingredients || !method) {
      setAppStatus("Please fill title, ingredients, and method.");
      return;
    }

    if (!hasSupabaseConfig) {
      const localRecipe = {
        id: crypto.randomUUID(),
        title,
        ingredients,
        method,
        ...recipeMeta,
        image_url: imageUrlValue,
        created_at: new Date().toISOString()
      };
      if (!imageUrlValue && image instanceof File && image.size > 0) {
        localRecipe.image_url = await readFileAsDataUrl(image);
      }
      state.recipes = [localRecipe, ...state.recipes];
      saveLocalRecipes(state.recipes);
      resetRecipeFormState();
      renderList(searchInput.value.trim().toLowerCase());
      showDetail(localRecipe);
      return;
    }

    if (!state.currentUser) {
      setAppStatus("Sign in before adding recipes.");
      return;
    }

    let imagePath = null;
    if (imageUrlValue) {
      imagePath = imageUrlValue;
    } else if (image instanceof File && image.size > 0) {
      try {
        imagePath = await uploadImage(image, state.currentUser.id);
      } catch (error) {
        logSupabaseError("image upload", error);
        setAppStatus(`Image upload failed: ${error.message || "Unexpected error"}`);
        return;
      }
    }

    const basePayload = {
      title,
      ingredients,
      method,
      image_url: imagePath,
      user_id: state.currentUser.id
    };
    const payload = state.hasRecipeMetaColumns ? { ...basePayload, ...recipeMeta } : basePayload;

    try {
      let insertedRows;
      let metaWarning = "";

      try {
        insertedRows = await insertRecipeViaRest(payload);
      } catch (error) {
        if (state.hasRecipeMetaColumns && isMissingRecipeMetaColumns(error)) {
          state.hasRecipeMetaColumns = false;
          metaWarning = "Recipe saved, but timing/serves/difficulty fields need DB migration.";
          insertedRows = await insertRecipeViaRest(basePayload);
        } else {
          throw error;
        }
      }

      setAppStatus(metaWarning || "Recipe saved.");
      resetRecipeFormState();
      const insertedRecipe = Array.isArray(insertedRows) ? insertedRows[0] : null;
      if (insertedRecipe) {
        const hydratedInsertedRecipe = {
          ...insertedRecipe,
          _resolvedImageUrl: await getSignedImageUrl(insertedRecipe.image_url)
        };
        state.recipes = [hydratedInsertedRecipe, ...state.recipes.filter((item) => item.id !== hydratedInsertedRecipe.id)];
        renderList(searchInput.value.trim().toLowerCase());
        showDetail(hydratedInsertedRecipe);
      } else {
        setAddRecipeOpen(false);
      }

      await loadRecipes();
      if (!insertedRecipe) {
        const fallbackRecipe = state.recipes[0];
        if (fallbackRecipe) {
          showDetail(fallbackRecipe);
        }
      }
    } catch (error) {
      logSupabaseError("insert recipe", error);
      if (isMissingUserIdColumn(error)) {
        setAppStatus("Save failed: recipes.user_id column is missing. Run migration SQL.");
      } else {
        setAppStatus(`Save failed: ${error.message}`);
      }
    }
  }

  async function updateRecipe(formData) {
    if (!state.editingRecipeId) {
      await addRecipe(formData);
      return;
    }

    const existingRecipe = state.recipes.find((item) => item.id === state.editingRecipeId);
    if (!existingRecipe) {
      setAppStatus("Could not find recipe to edit. Refresh and try again.");
      return;
    }

    const title = formData.get("title")?.toString().trim();
    const ingredients = formData.get("ingredients")?.toString().trim();
    const method = formData.get("method")?.toString().trim();
    const recipeMeta = getRecipeMetaFromFormData(formData);
    if (recipeMeta.error) {
      return;
    }
    const selectedImageFile = state.pendingImageAction === "replace_file" ? state.pendingImageFile : null;
    const selectedImageUrl =
      state.pendingImageAction === "replace_url" && isValidHttpUrl(state.pendingImageUrl) ? state.pendingImageUrl : null;
    const removeCurrentImage = state.pendingImageAction === "remove";

    if (!title || !ingredients || !method) {
      setAppStatus("Please fill title, ingredients, and method.");
      return;
    }

    if (!hasSupabaseConfig) {
      let nextImageUrl = existingRecipe.image_url;
      if (selectedImageFile instanceof File && selectedImageFile.size > 0) {
        nextImageUrl = await readFileAsDataUrl(selectedImageFile);
      } else if (selectedImageUrl) {
        nextImageUrl = selectedImageUrl;
      } else if (removeCurrentImage) {
        nextImageUrl = null;
      }
      const updatedLocalRecipe = {
        ...existingRecipe,
        title,
        ingredients,
        method,
        ...recipeMeta,
        image_url: nextImageUrl
      };
      state.recipes = state.recipes.map((item) => (item.id === state.editingRecipeId ? updatedLocalRecipe : item));
      saveLocalRecipes(state.recipes);
      resetRecipeFormState();
      renderList(searchInput.value.trim().toLowerCase());
      showDetail(updatedLocalRecipe);
      setAppStatus("Recipe updated.");
      return;
    }

    if (!state.currentUser) {
      setAppStatus("Sign in before updating recipes.");
      return;
    }

    let nextImagePath = existingRecipe.image_url;
    let uploadedNewImage = false;
    if (selectedImageFile instanceof File && selectedImageFile.size > 0) {
      try {
        nextImagePath = await uploadImage(selectedImageFile, state.currentUser.id);
        uploadedNewImage = true;
      } catch (error) {
        logSupabaseError("image upload", error);
        setAppStatus(`Image upload failed: ${error.message || "Unexpected error"}`);
        return;
      }
    } else if (selectedImageUrl) {
      nextImagePath = selectedImageUrl;
    } else if (removeCurrentImage) {
      nextImagePath = null;
    }

    const basePayload = {
      title,
      ingredients,
      method,
      image_url: nextImagePath
    };
    const payload = state.hasRecipeMetaColumns ? { ...basePayload, ...recipeMeta } : basePayload;

    try {
      let updatedRows;
      let metaWarning = "";

      try {
        updatedRows = await updateRecipeViaRest(state.editingRecipeId, state.currentUser.id, payload);
      } catch (error) {
        if (state.hasRecipeMetaColumns && isMissingRecipeMetaColumns(error)) {
          state.hasRecipeMetaColumns = false;
          metaWarning = "Recipe updated, but timing/serves/difficulty fields need DB migration.";
          updatedRows = await updateRecipeViaRest(state.editingRecipeId, state.currentUser.id, basePayload);
        } else {
          throw error;
        }
      }
      const updatedRecipe = Array.isArray(updatedRows) ? updatedRows[0] : null;
      if (!updatedRecipe) {
        throw new Error("Update succeeded but no row was returned.");
      }

      if (uploadedNewImage || selectedImageUrl) {
        const oldPath = normalizeStoragePath(existingRecipe.image_url);
        const newPath = normalizeStoragePath(nextImagePath);
        if (oldPath && oldPath !== newPath) {
          const { error: removeError } = await client.storage.from(BUCKET).remove([oldPath]);
          if (removeError) {
            logSupabaseError("remove old image", removeError);
          }
        }
      } else if (removeCurrentImage) {
        const oldPath = normalizeStoragePath(existingRecipe.image_url);
        if (oldPath) {
          const { error: removeError } = await client.storage.from(BUCKET).remove([oldPath]);
          if (removeError) {
            logSupabaseError("remove old image", removeError);
          }
        }
      }

      let resolvedImageUrl = existingRecipe._resolvedImageUrl || null;
      if (!updatedRecipe.image_url) {
        resolvedImageUrl = null;
      } else if (updatedRecipe.image_url !== existingRecipe.image_url || !resolvedImageUrl) {
        resolvedImageUrl = await getSignedImageUrl(updatedRecipe.image_url);
      }
      const hydratedUpdatedRecipe = {
        ...updatedRecipe,
        _resolvedImageUrl: resolvedImageUrl || getDirectImageUrl(updatedRecipe.image_url)
      };

      state.recipes = state.recipes.map((item) => (item.id === state.editingRecipeId ? hydratedUpdatedRecipe : item));
      resetRecipeFormState();
      renderList(searchInput.value.trim().toLowerCase());
      showDetail(hydratedUpdatedRecipe);
      setAppStatus(metaWarning || "Recipe updated.");
    } catch (error) {
      logSupabaseError("update recipe", error);
      setAppStatus(`Update failed: ${error.message || "Unexpected error"}`);
    }
  }

  async function deleteRecipe(id) {
    const confirmed = window.confirm("Delete this recipe?");
    if (!confirmed) return;

    if (!hasSupabaseConfig) {
      state.recipes = state.recipes.filter((item) => item.id !== id);
      saveLocalRecipes(state.recipes);
      recipeDetail.classList.add("hidden");
      detailContent.innerHTML = "";
      renderList(searchInput.value.trim().toLowerCase());
      return;
    }

    if (!state.currentUser) {
      setAppStatus("Sign in before deleting recipes.");
      return;
    }

    const recipe = state.recipes.find((item) => item.id === id);
    if (recipe) {
      const imagePathToDelete = normalizeStoragePath(recipe.image_url);
      if (imagePathToDelete) {
        await client.storage.from(BUCKET).remove([imagePathToDelete]);
      }
    }

    const { error } = await client.from("recipes").delete().eq("id", id).eq("user_id", state.currentUser.id);
    if (error) {
      setAppStatus(`Delete failed: ${error.message}`);
      return;
    }

    setAppStatus("Recipe deleted.");
    setDetailOpen(false);
    await loadRecipes();
  }

  function isEmailNotConfirmedError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("email not confirmed") || msg.includes("email_not_confirmed");
  }

  async function resendConfirmation(email) {
    setAuthLoading(true, "Resending confirmation...");
    try {
      const siteUrl = window.location.origin;
      const { error } = await client.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${siteUrl}/confirm.html` }
      });
      if (error) {
        setAppStatus(`Could not resend: ${error.message}`);
      } else {
        setAppStatus("Confirmation email sent! Check your inbox.");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  function showEmailNotConfirmedUi(email) {
    setAuthStatus("Your email address has not been confirmed yet.");
    setAppStatus("");
    const existing = document.getElementById("resendConfirmRow");
    if (existing) existing.remove();

    const row = document.createElement("div");
    row.id = "resendConfirmRow";
    row.className = "auth-confirm-prompt";
    row.innerHTML = `
      <p>Check your inbox for a confirmation link, or request a new one.</p>
      <button id="resendConfirmButton" class="button button--secondary" type="button">Resend confirmation email</button>
    `;
    authForm.appendChild(row);

    document.getElementById("resendConfirmButton").addEventListener("click", () => {
      resendConfirmation(email);
    });
  }

  async function signIn(email, password) {
    setAuthLoading(true, "Signing in...");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (isEmailNotConfirmedError(error)) {
          showEmailNotConfirmedUi(email);
          return;
        }
        setAuthStatus(`Sign-in failed: ${error.message}`, { isError: true });
        setAppStatus(`Sign-in failed: ${error.message}`);
        return;
      }
      const existing = document.getElementById("resendConfirmRow");
      if (existing) existing.remove();
      setAppStatus("Signed in.");
    } finally {
      setAuthLoading(false);
      setAuthUi();
    }
  }

  let isSignUpMode = false;

  function getPasswordErrors(password) {
    const errors = [];
    if (password.length < 8) errors.push("At least 8 characters");
    if (!/[A-Z]/.test(password)) errors.push("One uppercase letter");
    if (!/[a-z]/.test(password)) errors.push("One lowercase letter");
    if (!/[0-9]/.test(password)) errors.push("One number");
    return errors;
  }

  function updatePasswordRequirementsUi() {
    if (!passwordRequirements || !isSignUpMode) return;
    const password = authPassword.value;
    const confirmPassword = authConfirmPassword ? authConfirmPassword.value : "";
    const errors = getPasswordErrors(password);
    const mismatch = password && confirmPassword && password !== confirmPassword;

    const items = [
      { text: "At least 8 characters", ok: password.length >= 8 },
      { text: "One uppercase letter", ok: /[A-Z]/.test(password) },
      { text: "One lowercase letter", ok: /[a-z]/.test(password) },
      { text: "One number", ok: /[0-9]/.test(password) }
    ];

    if (confirmPassword) {
      items.push({ text: "Passwords match", ok: password === confirmPassword });
    }

    passwordRequirements.innerHTML = items
      .map((item) => `<span class="password-req ${item.ok ? "password-req--pass" : "password-req--fail"}">${item.ok ? "\u2713" : "\u2717"} ${item.text}</span>`)
      .join("");
  }

  function setSignUpMode(enabled) {
    isSignUpMode = enabled;
    if (authConfirmPassword) {
      authConfirmPassword.classList.toggle("hidden", !enabled);
      authConfirmPassword.required = enabled;
      if (!enabled) authConfirmPassword.value = "";
    }
    if (authConfirmPasswordLabel) {
      authConfirmPasswordLabel.classList.toggle("hidden", !enabled);
    }
    if (passwordRequirements) {
      passwordRequirements.classList.toggle("hidden", !enabled);
      if (!enabled) passwordRequirements.innerHTML = "";
    }
    if (signInButton) {
      signInButton.classList.toggle("hidden", enabled);
    }
    if (signUpButton) {
      signUpButton.textContent = enabled ? "Create Account" : "Sign Up";
    }
    if (authPassword) {
      authPassword.autocomplete = enabled ? "new-password" : "current-password";
    }
    if (enabled) {
      updatePasswordRequirementsUi();
    }
  }

  async function signUp(email, password) {
    setAuthLoading(true, "Creating account...");
    try {
      const siteUrl = window.location.origin;
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${siteUrl}/confirm.html` }
      });
      if (error) {
        setAuthStatus(`Sign-up failed: ${error.message}`, { isError: true });
        setAppStatus(`Sign-up failed: ${error.message}`);
        return;
      }
      window.location.href = "confirm.html";
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    setAuthLoading(true, "Signing out...");
    try {
      const { error } = await client.auth.signOut();
      if (error) {
        setAuthStatus(`Sign-out failed: ${error.message}`, { isError: true });
        setAppStatus(`Sign-out failed: ${error.message}`);
        return;
      }
      setAppStatus("");
    } finally {
      setAuthLoading(false);
      setAuthUi();
    }
  }

  async function runRecipeImport() {
    if (state.isImportingRecipe) return;

    const url = recipeImportUrlInput?.value?.trim() || "";
    if (!isValidHttpUrl(url)) {
      setAppStatus("Enter a valid recipe URL (http/https) to import.");
      return;
    }

    const prompt = recipeImportPromptInput?.value || importPromptManager.getCurrentImportPrompt();
    setImportPromptUi(prompt);
    persistImportPrompt(prompt);

    state.isImportingRecipe = true;
    updateImportButtonUi();
    setAppStatus("Importing recipe from link...");

    try {
      const data = await importRecipeFromUrlViaFunction(url, prompt);
      const importedRecipe = data?.recipe && typeof data.recipe === "object" ? data.recipe : null;
      if (!importedRecipe) {
        throw new Error("Import response did not include recipe data.");
      }

      applyImportedRecipeToForm(importedRecipe);
      const source = normalizeImportedText(importedRecipe.source_url) || url;
      setAppStatus(`Recipe imported from ${source}. Review and save.`);
    } catch (error) {
      const message = String(error?.message || "Unexpected error");
      if (message.includes("404")) {
        setAppStatus('Import failed: deploy the Supabase function "recipe-import" first.');
      } else {
        setAppStatus(`Import failed: ${message}`);
      }
    } finally {
      state.isImportingRecipe = false;
      updateImportButtonUi();
    }
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasSupabaseConfig) return;

    if (isSignUpMode) {
      setSignUpMode(false);
      setAuthStatus(SIGNED_OUT_PROMPT);
    }

    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return;
    await signIn(email, password);
  });

  signUpButton.addEventListener("click", async () => {
    if (!hasSupabaseConfig) return;

    if (!isSignUpMode) {
      setSignUpMode(true);
      setAuthStatus("Create a new account.");
      if (authPassword) authPassword.focus();
      return;
    }

    if (!authForm.reportValidity()) return;

    const email = authEmail.value.trim();
    const password = authPassword.value;
    const confirmPassword = authConfirmPassword ? authConfirmPassword.value : "";

    if (!email || !password) {
      setAppStatus("Enter email and password to sign up.");
      return;
    }

    const passwordErrors = getPasswordErrors(password);
    if (passwordErrors.length > 0) {
      setAppStatus(`Password must have: ${passwordErrors.join(", ").toLowerCase()}.`);
      return;
    }

    if (password !== confirmPassword) {
      setAppStatus("Passwords do not match.");
      if (authConfirmPassword) authConfirmPassword.focus();
      return;
    }

    await signUp(email, password);
  });

  if (authPassword) {
    authPassword.addEventListener("input", updatePasswordRequirementsUi);
  }
  if (authConfirmPassword) {
    authConfirmPassword.addEventListener("input", updatePasswordRequirementsUi);
  }

  signOutButton.addEventListener("click", async () => {
    if (!hasSupabaseConfig) return;
    await signOut();
  });

  if (importRecipeButton) {
    importRecipeButton.addEventListener("click", () => {
      void runRecipeImport();
    });
  }

  if (recipeImportUrlInput) {
    recipeImportUrlInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void runRecipeImport();
    });
  }

  if (recipeImportPromptInput) {
    recipeImportPromptInput.addEventListener("input", () => {
      importPromptManager.setCurrentImportPrompt(recipeImportPromptInput.value);
      persistImportPrompt(recipeImportPromptInput.value);
    });
  }

  if (resetImportPromptButton) {
    resetImportPromptButton.addEventListener("click", () => {
      setImportPromptUi(DEFAULT_RECIPE_IMPORT_PROMPT);
      persistImportPrompt(DEFAULT_RECIPE_IMPORT_PROMPT);
      setAppStatus("Import prompt reset.");
    });
  }

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", async () => {
      const nextTheme = state.currentTheme === "dark" ? "light" : "dark";
      setTheme(nextTheme);
      if (state.currentUser) {
        themeToggleButton.disabled = true;
        await saveThemePreference(nextTheme);
        themeToggleButton.disabled = false;
        updateThemeToggleUi();
      }
    });
  }

  if (settingsButton && authPanel) {
    settingsButton.addEventListener("click", () => {
      if (!state.currentUser) return;
      setSettingsOpen(!state.isSettingsOpen);
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener("click", () => {
      setSettingsOpen(false);
    });
  }

  if (settingsBackdrop) {
    settingsBackdrop.addEventListener("click", () => {
      setSettingsOpen(false);
    });
  }

  window.addEventListener("resize", () => {
    if (!state.isSettingsOpen) return;
    positionSettingsPanel();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!state.isSettingsOpen) return;
      positionSettingsPanel();
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (!state.isSettingsOpen || !state.currentUser) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setSettingsOpen(false);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = getSettingsFocusableElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  recipeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const hasInlineMetaWarning = Boolean(
      (prepTimeWarning && !prepTimeWarning.classList.contains("hidden")) ||
        (cookTimeWarning && !cookTimeWarning.classList.contains("hidden")) ||
        (servesWarning && !servesWarning.classList.contains("hidden"))
    );
    if (!recipeForm.checkValidity()) {
      recipeForm.reportValidity();
      if (!hasInlineMetaWarning) {
        setAppStatus("Please fill all required fields before saving.");
      }
      return;
    }

    setAppStatus(state.editingRecipeId ? "Updating recipe..." : "Saving recipe...");
    const formData = new FormData(recipeForm);

    try {
      if (state.editingRecipeId) {
        await updateRecipe(formData);
      } else {
        await addRecipe(formData);
      }
    } catch (error) {
      setAppStatus(`Save failed: ${error.message || "Unexpected error"}`);
    }
  });

  recipeForm.addEventListener(
    "invalid",
    () => {
      setAppStatus("Please fill all required fields before saving.");
    },
    true
  );

  if (saveRecipeButton) {
    saveRecipeButton.addEventListener("click", () => {
      const hasInlineMetaWarning = Boolean(
        (prepTimeWarning && !prepTimeWarning.classList.contains("hidden")) ||
          (cookTimeWarning && !cookTimeWarning.classList.contains("hidden")) ||
          (servesWarning && !servesWarning.classList.contains("hidden"))
      );
      if (!recipeForm.checkValidity()) {
        if (!hasInlineMetaWarning) {
          setAppStatus("Please fill all required fields before saving.");
        }
      }
    });
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener("click", () => {
      const isEditing = Boolean(state.editingRecipeId);
      const recipeId = state.editingRecipeId;
      const recipe = recipeId ? state.recipes.find((item) => item.id === recipeId) : null;

      resetRecipeFormState();

      if (recipe) {
        showDetail(recipe);
      } else if (isRecipeUiAvailable()) {
        showListView();
      } else {
        setAddRecipeOpen(false);
      }

      setAppStatus(isEditing ? "Edit canceled." : "Recipe add canceled.");
    });
  }

  if (durationDigitInputs.length) {
    const syncTimeFields = () => {
      getRecipeMetaFromFormData(new FormData(recipeForm), { showStatus: false });
    };

    durationDigitInputs.forEach((input) => {
      let isSanitizing = false;
      input.addEventListener("input", () => {
        if (isSanitizing) return;
        const sanitized = sanitizeDigits(input.value);
        if (input.value !== sanitized) {
          isSanitizing = true;
          input.value = sanitized;
          isSanitizing = false;
        }
        syncTimeFields();
      });
      input.addEventListener("blur", syncTimeFields);
    });
  }

  if (servesInput) {
    let isServesSanitizing = false;
    const syncServesField = () => {
      if (isServesSanitizing) return;
      const sanitized = String(servesInput.value ?? "")
        .replace(/[^\d].*$/, "")
        .slice(0, 2);
      if (servesInput.value !== sanitized) {
        isServesSanitizing = true;
        servesInput.value = sanitized;
        isServesSanitizing = false;
      }
      getRecipeMetaFromFormData(new FormData(recipeForm), { showStatus: false });
    };

    servesInput.addEventListener("input", syncServesField);
    servesInput.addEventListener("blur", syncServesField);
  }

  if (difficultyInput) {
    difficultyInput.addEventListener("input", () => {
      syncDifficultyUi();
    });
    syncDifficultyUi();
  }

  if (chooseImageButton && imageInput) {
    chooseImageButton.addEventListener("click", () => {
      imageInput.click();
    });
  }

  if (imageInput) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files?.[0];
      if (!file) {
        state.pendingImageFile = null;
        if (state.pendingImageAction === "replace_file") {
          state.pendingImageAction = "keep";
        }
      } else {
        const validationError = validateImageFile(file, IMAGE_MAX_SIZE_BYTES, IMAGE_ALLOWED_TYPES);
        if (validationError) {
          setAppStatus(validationError);
          imageInput.value = "";
          return;
        }
        state.pendingImageFile = file;
        state.pendingImageAction = "replace_file";
        state.pendingImageUrl = "";
        if (imageUrlInput) {
          imageUrlInput.value = "";
        }
        clearEditPreviewObjectUrl();
        state.localEditPreviewObjectUrl = URL.createObjectURL(file);
      }

      const recipe = state.recipes.find((item) => item.id === state.editingRecipeId) || null;
      void refreshEditImageTools(recipe);
    });
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener("input", () => {
      const value = imageUrlInput.value.trim();
      if (!value) {
        state.pendingImageUrl = "";
        if (state.pendingImageAction === "replace_url") {
          state.pendingImageAction = "keep";
        }
      } else if (isValidHttpUrl(value)) {
        state.pendingImageAction = "replace_url";
        state.pendingImageUrl = value;
        state.pendingImageFile = null;
        if (imageInput) {
          imageInput.value = "";
        }
        clearEditPreviewObjectUrl();
      } else {
        state.pendingImageAction = "keep";
        state.pendingImageUrl = "";
        setAppStatus("Enter a valid image URL (http/https).");
      }

      const recipe = state.recipes.find((item) => item.id === state.editingRecipeId) || null;
      void refreshEditImageTools(recipe);
    });
  }

  if (clearImageButton && imageInput) {
    clearImageButton.addEventListener("click", () => {
      clearEditPreviewObjectUrl();
      state.pendingImageFile = null;
      state.pendingImageUrl = "";
      imageInput.value = "";
      if (imageUrlInput) {
        imageUrlInput.value = "";
      }

      if (state.editingRecipeId) {
        state.pendingImageAction = "remove";
      } else {
        state.pendingImageAction = "keep";
      }

      const recipe = state.recipes.find((item) => item.id === state.editingRecipeId) || null;
      void refreshEditImageTools(recipe);
    });
  }

  if (undoImageButton && imageInput) {
    undoImageButton.addEventListener("click", () => {
      clearEditPreviewObjectUrl();
      state.pendingImageAction = "keep";
      state.pendingImageFile = null;
      state.pendingImageUrl = "";
      imageInput.value = "";
      if (imageUrlInput) {
        imageUrlInput.value = "";
      }

      const recipe = state.recipes.find((item) => item.id === state.editingRecipeId) || null;
      void refreshEditImageTools(recipe);
      setAppStatus("Image change undone.");
    });
  }

  const handleAddButtonViewportChange = () => {
    const isOpen = !addRecipeSection.classList.contains("hidden");
    setToggleAddRecipeState(isOpen);
  };
  if (typeof addButtonWideQuery.addEventListener === "function") {
    addButtonWideQuery.addEventListener("change", handleAddButtonViewportChange);
  } else if (typeof addButtonWideQuery.addListener === "function") {
    addButtonWideQuery.addListener(handleAddButtonViewportChange);
  }

  searchInput.addEventListener("input", debounce(() => {
    renderList(searchInput.value.trim().toLowerCase());
  }, 200));

  toggleAddRecipe.addEventListener("click", () => {
    const shouldShow = addRecipeSection.classList.contains("hidden");
    if (shouldShow && !state.editingRecipeId) {
      resetRecipeFormState();
    }
    setAddRecipeOpen(shouldShow);
  });

  recipeList.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action='view']");
    if (!trigger) return;

    const recipeId = trigger.dataset.id || trigger.closest("article.recipe-card")?.dataset.id;
    if (!recipeId) return;

    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (recipe) showDetail(recipe);
  });

  const inlineEditManager = createInlineEditManager({
    dom: { detailContent, searchInput },
    state,
    config: { DEFAULT_DIFFICULTY, hasSupabaseConfig },
    helpers: {
      parseDurationText, formatDuration, sanitizeDigits, parseTimePair,
      normalizeOptionalText, getDirectImageUrl, normalizeDifficulty: normalizeDifficultyCore
    },
    supabaseServices: { updateRecipeViaRest },
    callbacks: {
      setAppStatus,
      logSupabaseError,
      showDetail,
      renderList,
      saveLocalRecipes,
      isMissingRecipeMetaColumns
    }
  });
  inlineEditManager.attachListeners();

  detailContent.addEventListener("click", async (event) => {
    const editButton = event.target.closest("button[data-action='edit']");
    if (editButton) {
      const recipe = state.recipes.find((item) => item.id === editButton.dataset.id);
      if (recipe) {
        startEditRecipe(recipe);
      }
      return;
    }

    const button = event.target.closest("button[data-action='delete']");
    if (!button) return;

    await deleteRecipe(button.dataset.id);
  });

  closeDetail.addEventListener("click", () => {
    setDetailOpen(false);
  });

  async function applyAuthSession(event, session) {
    const authEvent = event || "SESSION_SYNC";
    const previousUserId = state.currentUser?.id || null;
    const nextUser = session?.user ?? null;
    const nextUserId = nextUser?.id || null;
    const justSignedIn = !previousUserId && Boolean(nextUserId);
    const justSignedOut = Boolean(previousUserId) && !nextUserId;
    const switchedUser = Boolean(previousUserId && nextUserId && previousUserId !== nextUserId);
    const identityChanged = justSignedIn || justSignedOut || switchedUser;
    const isNonDisruptiveEvent = !identityChanged && (authEvent === "TOKEN_REFRESHED" || authEvent === "SIGNED_IN");

    state.currentSession = session ?? null;
    state.currentUser = nextUser;

    if (isNonDisruptiveEvent) {
      return;
    }

    if (!state.currentUser) {
      if (justSignedOut || switchedUser || authEvent === "SIGNED_OUT") {
        state.isSettingsOpen = false;
        resetRecipeFormState();
        setTheme(DEFAULT_THEME, { persistForCurrentUser: false });
      }
      loadImportPrompt();
    } else if (justSignedIn || switchedUser || authEvent === "USER_UPDATED" || authEvent === "INITIAL_SESSION") {
      await loadThemePreference();
      loadImportPrompt();
    }

    setAuthUi();
    if (identityChanged || authEvent === "SIGNED_OUT" || authEvent === "INITIAL_SESSION" || authEvent === "SESSION_SYNC") {
      setRecipeUiEnabled(Boolean(state.currentUser));
    }

    if (justSignedIn || switchedUser) {
      showListView();
      recipeDetail.classList.add("hidden");
      detailContent.innerHTML = "";
    }

    if (
      identityChanged ||
      authEvent === "SIGNED_OUT" ||
      authEvent === "USER_UPDATED" ||
      authEvent === "INITIAL_SESSION" ||
      authEvent === "SESSION_SYNC"
    ) {
      await loadRecipes();
    }
  }

  async function init() {
    setStartupLoading(true);
    try {
      setRecipeFormMode(null);
      if (durationDigitInputs.length) {
        getRecipeMetaFromFormData(new FormData(recipeForm), { showStatus: false });
      }
      await loadThemePreference();
      loadImportPrompt();
      updateImportButtonUi();

      if (!hasSupabaseConfig) {
        setAuthUi();
        setRecipeUiEnabled(false);
        return;
      }

      client.auth.onAuthStateChange(async (event, session) => {
        if (event === "INITIAL_SESSION") {
          if (state.hasCompletedInitialAuthBootstrap) {
            return;
          }
          state.hasCompletedInitialAuthBootstrap = true;
        } else if (!state.hasCompletedInitialAuthBootstrap && (event === "SIGNED_IN" || event === "SIGNED_OUT")) {
          state.hasCompletedInitialAuthBootstrap = true;
        }

        try {
          await applyAuthSession(event, session);
        } catch (_error) {
          return;
        }
      });

      const { data, error } = await client.auth.getSession();
      void error;
      if (!state.hasCompletedInitialAuthBootstrap) {
        state.hasCompletedInitialAuthBootstrap = true;
        await applyAuthSession("SESSION_SYNC", data?.session ?? null);
      }
      setToggleAddRecipeState(!addRecipeSection.classList.contains("hidden"));
    } finally {
      setStartupLoading(false);
    }
  }

  function isFormDirty() {
    if (addRecipeSection.classList.contains("hidden")) return false;
    const title = recipeForm.elements.title?.value?.trim() || "";
    const ingredients = recipeForm.elements.ingredients?.value?.trim() || "";
    const method = recipeForm.elements.method?.value?.trim() || "";
    return Boolean(title || ingredients || method);
  }

  window.addEventListener("beforeunload", (event) => {
    if (isFormDirty()) {
      event.preventDefault();
    }
  });

  init();
})();
