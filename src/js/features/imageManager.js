(() => {
  function createImageManager({ dom, state, helpers, getSignedImageUrl, i18n }) {
    const { editImageTools, editImagePreview, editImageEmpty, imageUrlInput, clearImageButton, undoImageButton } = dom;
    const { isValidHttpUrl, getDisplayImageUrl } = helpers;
    const t = i18n ? (k, p) => i18n.t(k, p) : (k) => k;

    function clearEditPreviewObjectUrl() {
      if (state.localEditPreviewObjectUrl) {
        URL.revokeObjectURL(state.localEditPreviewObjectUrl);
        state.localEditPreviewObjectUrl = null;
      }
    }

    function hideEditImageTools() {
      clearEditPreviewObjectUrl();
      state.pendingImageAction = "keep";
      state.pendingImageFile = null;
      state.pendingImageUrl = "";
      if (editImageTools) {
        editImageTools.classList.remove("hidden");
      }
      if (editImagePreview) {
        editImagePreview.classList.add("hidden");
        editImagePreview.removeAttribute("src");
      }
      if (editImageEmpty) {
        editImageEmpty.classList.remove("hidden");
        editImageEmpty.textContent = t("form.noImage");
      }
      if (imageUrlInput) {
        imageUrlInput.value = "";
      }
      if (clearImageButton) {
        clearImageButton.disabled = true;
      }
      if (undoImageButton) {
        undoImageButton.classList.add("hidden");
        undoImageButton.disabled = true;
      }
    }

    function showEditImagePreview(previewUrl, canDeleteImage, helperText = "") {
      if (!editImageTools || !editImagePreview || !editImageEmpty || !clearImageButton) return;
      editImageTools.classList.remove("hidden");

      if (previewUrl) {
        editImagePreview.src = previewUrl;
        editImagePreview.classList.remove("hidden");
        editImageEmpty.textContent = helperText;
        editImageEmpty.classList.toggle("hidden", !helperText);
      } else {
        editImagePreview.classList.add("hidden");
        editImagePreview.removeAttribute("src");
        editImageEmpty.textContent = helperText || "No image selected.";
        editImageEmpty.classList.remove("hidden");
      }

      clearImageButton.disabled = !canDeleteImage;
      if (undoImageButton) {
        undoImageButton.classList.toggle("hidden", state.pendingImageAction === "keep");
        undoImageButton.disabled = state.pendingImageAction === "keep";
      }
    }

    async function refreshEditImageTools(recipe = null) {
      if (!editImageTools) return;

      const isEditingThisRecipe = Boolean(state.editingRecipeId && recipe && recipe.id === state.editingRecipeId);
      let previewUrl = null;
      let canDeleteImage = false;
      let helperText = "No image selected.";

      if (state.pendingImageAction === "replace_file" && state.pendingImageFile && state.localEditPreviewObjectUrl) {
        previewUrl = state.localEditPreviewObjectUrl;
        canDeleteImage = true;
        helperText = state.editingRecipeId ? "New image will be saved on update." : "Image will be saved on save.";
      } else if (state.pendingImageAction === "replace_url" && isValidHttpUrl(state.pendingImageUrl)) {
        previewUrl = state.pendingImageUrl;
        canDeleteImage = true;
        helperText = state.editingRecipeId ? "Image URL will be saved on update." : "Image URL will be saved on save.";
      } else if (state.pendingImageAction === "remove") {
        if (isEditingThisRecipe) {
          previewUrl = null;
          canDeleteImage = false;
          helperText = "Image will be removed on update.";
        } else {
          previewUrl = null;
          canDeleteImage = false;
          helperText = "No image selected.";
        }
      } else if (isEditingThisRecipe) {
        const hasStoredImage = Boolean(recipe.image_url);
        previewUrl = getDisplayImageUrl(recipe);
        if (!previewUrl && hasStoredImage) {
          previewUrl = await getSignedImageUrl(recipe.image_url);
          if (previewUrl) {
            recipe._resolvedImageUrl = previewUrl;
            const current = state.recipes.find((item) => item.id === recipe.id);
            if (current) {
              current._resolvedImageUrl = previewUrl;
            }
          }
        }
        canDeleteImage = hasStoredImage;
        helperText = hasStoredImage ? "" : "No image selected.";
      }

      if (isEditingThisRecipe && state.editingRecipeId !== recipe.id) {
        return;
      }
      showEditImagePreview(previewUrl, canDeleteImage, helperText);
    }

    return {
      clearEditPreviewObjectUrl,
      hideEditImageTools,
      showEditImagePreview,
      refreshEditImageTools
    };
  }

  window.StorecipeImageManager = { createImageManager };
})();
