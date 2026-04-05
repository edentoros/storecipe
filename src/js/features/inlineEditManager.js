(() => {
  function createInlineEditManager({ dom, state, config, helpers, supabaseServices, callbacks }) {
    const { detailContent, searchInput } = dom;
    const { DEFAULT_DIFFICULTY, hasSupabaseConfig } = config;
    const {
      parseDurationText, formatDuration, sanitizeDigits, parseTimePair,
      normalizeOptionalText, getDirectImageUrl, normalizeDifficulty
    } = helpers;
    const { updateRecipeViaRest } = supabaseServices;
    const { setAppStatus, logSupabaseError, showDetail, renderList, saveLocalRecipes, isMissingRecipeMetaColumns } = callbacks;

    function normalizeInlineEditableField(field) {
      const normalized = String(field || "").trim().toLowerCase();
      if (
        normalized === "ingredients" ||
        normalized === "method" ||
        normalized === "prep_time" ||
        normalized === "cooking_time" ||
        normalized === "difficulty"
      ) {
        return normalized;
      }
      return null;
    }

    function getInlineFieldLabel(field) {
      switch (field) {
        case "ingredients":
          return "ingredients";
        case "method":
          return "method";
        case "prep_time":
          return "prep time";
        case "cooking_time":
          return "cooking time";
        case "difficulty":
          return "difficulty";
        default:
          return "field";
      }
    }

    function getOpenDetailRecipe() {
      const openedDeleteButton = detailContent.querySelector("button[data-action='delete']");
      const openedRecipeId = openedDeleteButton?.dataset?.id || null;
      if (!openedRecipeId) return null;
      return state.recipes.find((item) => item.id === openedRecipeId) || null;
    }

    function autoSizeInlineTextarea(textarea) {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function isInlineTimeField(field) {
      return field === "prep_time" || field === "cooking_time";
    }

    function isInlineMetaField(field) {
      return isInlineTimeField(field) || field === "difficulty";
    }

    function getInlineTimeLabel(field) {
      return field === "prep_time" ? "Prep time" : "Cooking time";
    }

    function durationTextToMinutes(value) {
      const parsed = parseDurationText(value);
      const hours = Number(parsed.hours || 0);
      const minutes = Number(parsed.minutes || 0);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
      return hours * 60 + minutes;
    }

    function setInlineTimeEditorValidation(editorRoot, field) {
      const hoursInput = editorRoot.querySelector(".recipe-inline-editor__time-hours");
      const minutesInput = editorRoot.querySelector(".recipe-inline-editor__time-minutes");
      const warning = editorRoot.querySelector(".recipe-inline-editor__warning");
      if (!(hoursInput instanceof HTMLInputElement) || !(minutesInput instanceof HTMLInputElement)) {
        return null;
      }

      const sanitizedHours = sanitizeDigits(hoursInput.value);
      const sanitizedMinutes = sanitizeDigits(minutesInput.value);
      if (hoursInput.value !== sanitizedHours) {
        hoursInput.value = sanitizedHours;
      }
      if (minutesInput.value !== sanitizedMinutes) {
        minutesInput.value = sanitizedMinutes;
      }

      const validation = parseTimePair(hoursInput.value, minutesInput.value, getInlineTimeLabel(field));
      hoursInput.classList.toggle("field-error", Boolean(validation.hoursError));
      minutesInput.classList.toggle("field-error", Boolean(validation.minutesError));

      if (warning) {
        warning.textContent = validation.message || "";
        warning.classList.toggle("hidden", !validation.message);
      }

      return validation;
    }

    function startInlineDetailFieldEdit(field) {
      const normalizedField = normalizeInlineEditableField(field);
      if (!normalizedField) return;
      if (isInlineMetaField(normalizedField) && !state.hasRecipeMetaColumns) {
        setAppStatus("Timing and difficulty fields need DB migration before inline editing.");
        return;
      }

      const recipe = getOpenDetailRecipe();
      if (!recipe) return;

      const existingEditor = detailContent.querySelector(".recipe-inline-editor");
      if (existingEditor instanceof HTMLElement) {
        const existingField = normalizeInlineEditableField(existingEditor.dataset.field || "");
        if (existingField === normalizedField) {
          const existingInput = existingEditor.querySelector(".recipe-inline-editor__focus-target");
          if (existingInput instanceof HTMLElement) {
            existingInput.focus();
          }
          return;
        }
        showDetail(recipe, { scrollToDetail: false });
      }

      const fieldContent = detailContent.querySelector(`[data-field-content='${normalizedField}']`);
      if (!(fieldContent instanceof HTMLElement)) return;
      const target = fieldContent.closest(".recipe-detail-card__meta-item") || fieldContent;

      const editor = document.createElement("div");
      editor.className = "recipe-inline-editor";
      editor.dataset.field = normalizedField;
      let focusTarget = null;

      if (normalizedField === "ingredients" || normalizedField === "method") {
        const textarea = document.createElement("textarea");
        textarea.className = "recipe-inline-editor__input recipe-inline-editor__focus-target";
        textarea.value = String(recipe[normalizedField] ?? "");
        textarea.rows = normalizedField === "ingredients" ? 6 : 10;
        textarea.setAttribute("aria-label", `Edit ${getInlineFieldLabel(normalizedField)}`);
        textarea.addEventListener("input", () => {
          autoSizeInlineTextarea(textarea);
        });
        editor.append(textarea);
        autoSizeInlineTextarea(textarea);
        focusTarget = textarea;
      } else if (isInlineTimeField(normalizedField)) {
        const sourceText = String(recipe[normalizedField] ?? "").trim();
        const parsed = parseDurationText(sourceText);

        const row = document.createElement("div");
        row.className = "recipe-inline-editor__time-row";

        const hoursInput = document.createElement("input");
        hoursInput.type = "text";
        hoursInput.inputMode = "numeric";
        hoursInput.pattern = "[0-9]*";
        hoursInput.placeholder = "Hours";
        hoursInput.className = "recipe-inline-editor__time-input recipe-inline-editor__time-hours recipe-inline-editor__focus-target";
        hoursInput.value = parsed.hours;
        hoursInput.setAttribute("aria-label", `${getInlineTimeLabel(normalizedField)} hours`);

        const minutesInput = document.createElement("input");
        minutesInput.type = "text";
        minutesInput.inputMode = "numeric";
        minutesInput.pattern = "[0-9]*";
        minutesInput.placeholder = "Minutes";
        minutesInput.className = "recipe-inline-editor__time-input recipe-inline-editor__time-minutes";
        minutesInput.value = parsed.minutes;
        minutesInput.setAttribute("aria-label", `${getInlineTimeLabel(normalizedField)} minutes`);

        row.append(hoursInput, minutesInput);
        editor.append(row);

        const warning = document.createElement("p");
        warning.className = "recipe-inline-editor__warning hidden";
        warning.setAttribute("aria-live", "polite");
        editor.append(warning);

        const sync = () => {
          setInlineTimeEditorValidation(editor, normalizedField);
        };
        hoursInput.addEventListener("input", sync);
        minutesInput.addEventListener("input", sync);
        hoursInput.addEventListener("blur", sync);
        minutesInput.addEventListener("blur", sync);
        sync();
        focusTarget = hoursInput;
      } else if (normalizedField === "difficulty") {
        const row = document.createElement("div");
        row.className = "recipe-inline-editor__difficulty-row";

        const difficultyInputInline = document.createElement("input");
        difficultyInputInline.type = "range";
        difficultyInputInline.min = "1";
        difficultyInputInline.max = "10";
        difficultyInputInline.step = "1";
        difficultyInputInline.value = String(normalizeDifficulty(recipe.difficulty, DEFAULT_DIFFICULTY));
        difficultyInputInline.className = "recipe-inline-editor__difficulty-input recipe-inline-editor__focus-target";
        difficultyInputInline.setAttribute("aria-label", "Difficulty from 1 to 10");

        const difficultyValueInline = document.createElement("span");
        difficultyValueInline.className = "recipe-inline-editor__difficulty-value";
        difficultyValueInline.textContent = difficultyInputInline.value;

        let isDifficultySanitizing = false;
        difficultyInputInline.addEventListener("input", () => {
          if (isDifficultySanitizing) return;
          isDifficultySanitizing = true;
          const normalized = normalizeDifficulty(difficultyInputInline.value, DEFAULT_DIFFICULTY);
          difficultyInputInline.value = String(normalized);
          difficultyValueInline.textContent = String(normalized);
          isDifficultySanitizing = false;
        });

        row.append(difficultyInputInline, difficultyValueInline);
        editor.append(row);
        focusTarget = difficultyInputInline;
      }

      const actions = document.createElement("div");
      actions.className = "recipe-inline-editor__actions";

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "button button--secondary";
      saveButton.dataset.action = "inline-save-field";
      saveButton.dataset.field = normalizedField;
      saveButton.textContent = "Save";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "button button--ghost";
      cancelButton.dataset.action = "inline-cancel-field";
      cancelButton.dataset.field = normalizedField;
      cancelButton.textContent = "Cancel";

      actions.append(saveButton, cancelButton);
      editor.append(actions);
      target.replaceWith(editor);

      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus();
      }
      if (focusTarget instanceof HTMLTextAreaElement) {
        focusTarget.setSelectionRange(focusTarget.value.length, focusTarget.value.length);
      }
      setAppStatus(`Editing ${getInlineFieldLabel(normalizedField)}. Click Save to apply.`);
    }

    async function saveInlineDetailField(field) {
      const normalizedField = normalizeInlineEditableField(field);
      if (!normalizedField) return false;
      if (isInlineMetaField(normalizedField) && !state.hasRecipeMetaColumns) {
        setAppStatus("Timing and difficulty fields need DB migration before inline editing.");
        return false;
      }

      const recipe = getOpenDetailRecipe();
      if (!recipe) return false;
      const editor = detailContent.querySelector(`.recipe-inline-editor[data-field='${normalizedField}']`);
      if (!(editor instanceof HTMLElement)) return false;

      const label = getInlineFieldLabel(normalizedField);
      let payload = {};
      let hasChanges = false;

      if (normalizedField === "ingredients" || normalizedField === "method") {
        const valueInput = editor.querySelector(".recipe-inline-editor__input");
        if (!(valueInput instanceof HTMLTextAreaElement)) return false;
        const value = String(valueInput.value ?? "").trim();
        if (!value) {
          setAppStatus(`Please add ${label} before saving.`);
          return false;
        }
        payload = { [normalizedField]: value };
        hasChanges = value !== String(recipe[normalizedField] ?? "").trim();
      } else if (isInlineTimeField(normalizedField)) {
        const validation = setInlineTimeEditorValidation(editor, normalizedField);
        if (!validation) return false;
        if (validation.message) {
          setAppStatus(validation.message);
          return false;
        }

        const nextTimeText = validation.totalMinutes == null ? null : formatDuration(validation.totalMinutes);
        const currentTimeText = normalizeOptionalText(recipe[normalizedField] ?? "");

        const prepMinutes =
          normalizedField === "prep_time"
            ? validation.totalMinutes || 0
            : durationTextToMinutes(recipe.prep_time ?? recipe.prepTime ?? "");
        const cookMinutes =
          normalizedField === "cooking_time"
            ? validation.totalMinutes || 0
            : durationTextToMinutes(recipe.cooking_time ?? recipe.cookingTime ?? "");
        const nextTotalText = prepMinutes + cookMinutes > 0 ? formatDuration(prepMinutes + cookMinutes) : null;
        const currentTotalText = normalizeOptionalText(recipe.total_time ?? recipe.totalTime ?? "");

        payload = {
          [normalizedField]: nextTimeText,
          total_time: nextTotalText
        };
        hasChanges = nextTimeText !== currentTimeText || nextTotalText !== currentTotalText;
      } else if (normalizedField === "difficulty") {
        const difficultyInputInline = editor.querySelector(".recipe-inline-editor__difficulty-input");
        if (!(difficultyInputInline instanceof HTMLInputElement)) return false;
        const nextDifficulty = normalizeDifficulty(difficultyInputInline.value, DEFAULT_DIFFICULTY);
        const currentDifficulty = normalizeDifficulty(recipe.difficulty, DEFAULT_DIFFICULTY);
        difficultyInputInline.value = String(nextDifficulty);
        payload = { difficulty: nextDifficulty };
        hasChanges = nextDifficulty !== currentDifficulty;
      }

      if (!hasChanges) {
        showDetail(recipe, { scrollToDetail: false });
        setAppStatus(`No changes to ${label}.`);
        return true;
      }

      if (!hasSupabaseConfig) {
        const updatedLocalRecipe = { ...recipe, ...payload };
        state.recipes = state.recipes.map((item) => (item.id === recipe.id ? updatedLocalRecipe : item));
        saveLocalRecipes(state.recipes);
        renderList(searchInput.value.trim().toLowerCase());
        showDetail(updatedLocalRecipe, { scrollToDetail: false });
        setAppStatus(`${label.charAt(0).toUpperCase()}${label.slice(1)} updated.`);
        return true;
      }

      if (!state.currentUser) {
        setAppStatus("Sign in before updating recipes.");
        return false;
      }

      try {
        const updatedRows = await updateRecipeViaRest(recipe.id, state.currentUser.id, payload);
        const updatedRecipe = Array.isArray(updatedRows) ? updatedRows[0] : null;
        if (!updatedRecipe) {
          throw new Error("Update succeeded but no row was returned.");
        }

        const hydratedUpdatedRecipe = {
          ...recipe,
          ...updatedRecipe,
          _resolvedImageUrl: recipe._resolvedImageUrl || getDirectImageUrl(updatedRecipe.image_url)
        };
        state.recipes = state.recipes.map((item) => (item.id === recipe.id ? hydratedUpdatedRecipe : item));
        renderList(searchInput.value.trim().toLowerCase());
        showDetail(hydratedUpdatedRecipe, { scrollToDetail: false });
        setAppStatus(`${label.charAt(0).toUpperCase()}${label.slice(1)} updated.`);
        return true;
      } catch (error) {
        if (isInlineMetaField(normalizedField) && state.hasRecipeMetaColumns && isMissingRecipeMetaColumns(error)) {
          state.hasRecipeMetaColumns = false;
          setAppStatus("Update failed: run DB migration for timing and difficulty fields.");
          return false;
        }
        logSupabaseError("inline update recipe field", error);
        setAppStatus(`Update failed: ${error.message || "Unexpected error"}`);
        return false;
      }
    }

    function attachListeners() {
      detailContent.addEventListener("click", async (event) => {
        const inlineSaveButton = event.target.closest("button[data-action='inline-save-field']");
        if (inlineSaveButton) {
          if (state.isInlineFieldSaveInProgress) return;
          const field = inlineSaveButton.dataset.field || "";
          const normalizedField = normalizeInlineEditableField(field);
          if (!normalizedField) return;
          const editor = detailContent.querySelector(`.recipe-inline-editor[data-field='${normalizedField}']`);
          if (!(editor instanceof HTMLElement)) return;
          const inlineCancelButton = editor.querySelector("button[data-action='inline-cancel-field']");

          state.isInlineFieldSaveInProgress = true;
          inlineSaveButton.disabled = true;
          if (inlineCancelButton instanceof HTMLButtonElement) {
            inlineCancelButton.disabled = true;
          }
          setAppStatus(`Updating ${getInlineFieldLabel(normalizedField)}...`);
          try {
            await saveInlineDetailField(normalizedField);
          } finally {
            state.isInlineFieldSaveInProgress = false;
            inlineSaveButton.disabled = false;
            if (inlineCancelButton instanceof HTMLButtonElement) {
              inlineCancelButton.disabled = false;
            }
          }
          return;
        }

        const inlineCancelButton = event.target.closest("button[data-action='inline-cancel-field']");
        if (inlineCancelButton) {
          const recipe = getOpenDetailRecipe();
          if (recipe) {
            showDetail(recipe, { scrollToDetail: false });
          }
          setAppStatus("Inline edit canceled.");
          return;
        }

        const inlineTrigger = event.target.closest("[data-action='inline-edit-field']");
        if (inlineTrigger) {
          startInlineDetailFieldEdit(inlineTrigger.dataset.field || "");
          return;
        }
      });

      detailContent.addEventListener("keydown", (event) => {
        const targetElement = event.target instanceof HTMLElement ? event.target : null;
        if (!targetElement) return;

        const inlineEditor = targetElement.closest(".recipe-inline-editor");
        if (!(inlineEditor instanceof HTMLElement)) return;

        if (event.key === "Escape") {
          event.preventDefault();
          const recipe = getOpenDetailRecipe();
          if (recipe) {
            showDetail(recipe, { scrollToDetail: false });
          }
          setAppStatus("Inline edit canceled.");
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          const field = normalizeInlineEditableField(inlineEditor.dataset.field || "");
          if (!field) return;
          const saveButton = detailContent.querySelector(`button[data-action='inline-save-field'][data-field='${field}']`);
          if (saveButton instanceof HTMLButtonElement) {
            saveButton.click();
          }
        }
      });
    }

    return {
      startInlineDetailFieldEdit,
      saveInlineDetailField,
      attachListeners
    };
  }

  window.StorecipeInlineEditManager = { createInlineEditManager };
})();
