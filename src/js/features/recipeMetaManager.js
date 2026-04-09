function createRecipeMetaManager({
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
  defaultDifficulty,
  helpers
}) {
  const { normalizeDifficulty, getDifficultyLabel, parseTimePair, validateServesValue, formatDuration } = helpers;

  function syncDifficultyUi() {
    if (!difficultyInput || !difficultyValue) return;
    const normalized = normalizeDifficulty(difficultyInput.value, defaultDifficulty);
    difficultyInput.value = String(normalized);
    difficultyValue.textContent = `${normalized} — ${getDifficultyLabel(normalized)}`;
  }

  function setFieldValidity(input, message = "") {
    if (!input) return;
    input.setCustomValidity(message);
    input.classList.toggle("field-error", Boolean(message));
  }

  function setTimeWarning(warningElement, message = "") {
    if (!warningElement) return;
    warningElement.textContent = message;
    warningElement.classList.toggle("hidden", !message);
  }

  function getRecipeMetaFromFormData(formData) {
    syncDifficultyUi();
    const prepHours = prepHoursInput?.value ?? "";
    const prepMinutes = prepMinutesInput?.value ?? "";
    const cookHours = cookHoursInput?.value ?? "";
    const cookMinutes = cookMinutesInput?.value ?? "";

    const prep = parseTimePair(prepHours, prepMinutes, "Prep time");
    const cook = parseTimePair(cookHours, cookMinutes, "Cooking time");

    setFieldValidity(prepHoursInput, prep.hoursError);
    setFieldValidity(prepMinutesInput, prep.minutesError);
    setFieldValidity(cookHoursInput, cook.hoursError);
    setFieldValidity(cookMinutesInput, cook.minutesError);
    setTimeWarning(prepTimeWarning, prep.message);
    setTimeWarning(cookTimeWarning, cook.message);
    const servesValidation = validateServesValue(formData.get("serves"));
    setFieldValidity(servesInput, servesValidation.message);
    setTimeWarning(servesWarning, servesValidation.message);

    const validationMessage = prep.message || cook.message || servesValidation.message || "";
    if (validationMessage) {
      if (totalTimeInput) {
        totalTimeInput.value = "";
      }
      return { error: validationMessage };
    }

    const prepText = prep.totalMinutes == null ? null : formatDuration(prep.totalMinutes);
    const cookText = cook.totalMinutes == null ? null : formatDuration(cook.totalMinutes);
    const hasAnyTimeValue = prep.totalMinutes != null || cook.totalMinutes != null;
    const totalMinutes = (prep.totalMinutes || 0) + (cook.totalMinutes || 0);
    const totalText = hasAnyTimeValue ? formatDuration(totalMinutes) : null;

    if (totalTimeInput) {
      totalTimeInput.value = totalText || "";
    }

    return {
      prep_time: prepText,
      cooking_time: cookText,
      total_time: totalText,
      serves: servesValidation.value,
      difficulty: normalizeDifficulty(formData.get("difficulty") ?? difficultyInput?.value ?? defaultDifficulty, defaultDifficulty)
    };
  }

  function resetValidationUi() {
    setFieldValidity(prepHoursInput, "");
    setFieldValidity(prepMinutesInput, "");
    setFieldValidity(cookHoursInput, "");
    setFieldValidity(cookMinutesInput, "");
    setFieldValidity(servesInput, "");
    setTimeWarning(prepTimeWarning, "");
    setTimeWarning(cookTimeWarning, "");
    setTimeWarning(servesWarning, "");
    if (totalTimeInput) {
      totalTimeInput.value = "";
    }
  }

  return {
    syncDifficultyUi,
    setFieldValidity,
    setTimeWarning,
    getRecipeMetaFromFormData,
    resetValidationUi
  };
}

window.StorecipeRecipeMetaManager = {
  createRecipeMetaManager
};
