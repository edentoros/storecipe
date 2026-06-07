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
  helpers,
  i18n
}) {
  const { normalizeDifficulty, getDifficultyLabel: getDifficultyLabelHelper, parseTimePair, validateServesValue, formatDuration } = helpers;
  const t = i18n ? (k, p) => i18n.t(k, p) : (k) => k;
  const getDifficultyLabel = i18n && i18n.getDifficultyLabel ? (n) => i18n.getDifficultyLabel(n) : getDifficultyLabelHelper;
  function getTimeMessages() {
    return {
      hoursMax: t("validation.hoursMax"),
      minutesMax: t("validation.minutesMax"),
      required: t("validation.timeRequired")
    };
  }
  function getServesMessages() {
    return {
      wholeNumbers: t("validation.servesWhole"),
      range: t("validation.servesRange")
    };
  }

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

    const timeMsgs = getTimeMessages();
    const prep = parseTimePair(prepHours, prepMinutes, t("form.prepTime"), timeMsgs);
    const cook = parseTimePair(cookHours, cookMinutes, t("form.cookingTime"), timeMsgs);

    setFieldValidity(prepHoursInput, prep.hoursError);
    setFieldValidity(prepMinutesInput, prep.minutesError);
    setFieldValidity(cookHoursInput, cook.hoursError);
    setFieldValidity(cookMinutesInput, cook.minutesError);
    setTimeWarning(prepTimeWarning, prep.message);
    setTimeWarning(cookTimeWarning, cook.message);
    const servesValidation = validateServesValue(formData.get("serves"), getServesMessages());
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
