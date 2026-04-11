function createRecipeRenderer({
  dom,
  state,
  hasSupabaseConfig,
  helpers,
  getSignedImageUrl,
  setDetailOpen,
  logSupabaseError
}) {
  const { recipeList, detailContent, recipeDetail } = dom;
  const {
    formatDate,
    escapeHtml,
    normalizeDifficulty,
    getDifficultyLabel,
    parseDurationText,
    formatDuration,
    getDisplayImageUrl,
    getDirectImageUrl,
    scaleIngredients
  } = helpers;

  function patchRecipeCardImage(recipe) {
    if (!recipe?.id || !recipe?._resolvedImageUrl) return;
    const card = recipeList.querySelector(`article.recipe-card[data-id="${recipe.id}"]`);
    if (!card) return;

    const existingImage = card.querySelector("img");
    if (existingImage) {
      if (existingImage.src !== recipe._resolvedImageUrl) {
        existingImage.src = recipe._resolvedImageUrl;
      }
      return;
    }

    const placeholder = card.querySelector(".recipe-card__image--placeholder");
    if (!placeholder) return;

    const image = document.createElement("img");
    image.src = recipe._resolvedImageUrl;
    image.alt = String(recipe.title ?? "Recipe image");
    image.loading = "lazy";
    placeholder.replaceWith(image);
  }

  function patchOpenDetailImage(recipe) {
    if (!recipe?.id || !recipe?._resolvedImageUrl) return;
    const openedDeleteButton = detailContent.querySelector("button[data-action='delete']");
    if (openedDeleteButton?.dataset?.id !== recipe.id) return;

    const existingImage = detailContent.querySelector(".recipe-detail-card img");
    if (existingImage) {
      if (existingImage.src !== recipe._resolvedImageUrl) {
        existingImage.src = recipe._resolvedImageUrl;
      }
      return;
    }

    const placeholder = detailContent.querySelector(".recipe-detail-card__image--placeholder");
    if (!placeholder) return;

    const image = document.createElement("img");
    image.src = recipe._resolvedImageUrl;
    image.alt = String(recipe.title ?? "Recipe image");
    placeholder.replaceWith(image);
  }

  async function hydrateImagesInBackground(items) {
    await Promise.all(
      items.map(async (item) => {
        if (!item.image_url) return;
        try {
          const resolvedImageUrl = await getSignedImageUrl(item.image_url);
          if (!resolvedImageUrl) return;
          if (item._resolvedImageUrl === resolvedImageUrl) return;
          item._resolvedImageUrl = resolvedImageUrl;
          patchRecipeCardImage(item);
          patchOpenDetailImage(item);
        } catch (error) {
          if (logSupabaseError) logSupabaseError("image hydration", error);
        }
      })
    );
  }

  function durationToMinutes(durationText) {
    const parsed = parseDurationText(String(durationText ?? ""));
    return Number(parsed.hours || 0) * 60 + Number(parsed.minutes || 0);
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function sortRecipes(items, sortBy) {
    const [sortField, sortDir] = (sortBy || "created_at_desc").split(/_(?=asc$|desc$)/);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sortField === "title") {
        return dir * String(a.title || "").toLowerCase().localeCompare(String(b.title || "").toLowerCase());
      }
      if (sortField === "difficulty") {
        return dir * ((Number(a.difficulty) || 0) - (Number(b.difficulty) || 0));
      }
      const aVal = new Date(a.created_at || 0).getTime();
      const bVal = new Date(b.created_at || 0).getTime();
      return dir * (aVal - bVal);
    });
  }

  function renderList(query = "", { category = "", favouritesOnly = false, sortBy = "created_at_desc" } = {}) {
    try {
      const safeQuery = String(query ?? "").toLowerCase();
      let filtered = (Array.isArray(state.recipes) ? state.recipes : []).filter((item) =>
        String(item?.title ?? "")
          .toLowerCase()
          .includes(safeQuery)
      );

      if (category) {
        filtered = filtered.filter((item) => (item.category || "") === category);
      }
      if (favouritesOnly) {
        filtered = filtered.filter((item) => item.is_favourite);
      }
      filtered = sortRecipes(filtered, sortBy);

      recipeList.replaceChildren();

      if (!filtered.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = state.currentUser || !hasSupabaseConfig ? "No recipes found." : "Sign in to view your recipes.";
        recipeList.appendChild(empty);
      } else {
        filtered.forEach((recipe) => {
          const safeImageUrl = getDisplayImageUrl(recipe);
          const title = String(recipe.title ?? "Untitled recipe");

          const article = document.createElement("article");
          article.className = "recipe-card";
          article.dataset.id = recipe.id || "";

          const favButton = document.createElement("button");
          favButton.className = "recipe-card__fav-button" + (recipe.is_favourite ? " recipe-card__fav-button--active" : "");
          favButton.type = "button";
          favButton.dataset.action = "toggle-fav";
          favButton.dataset.id = recipe.id || "";
          favButton.setAttribute("aria-label", recipe.is_favourite ? "Remove from favourites" : "Add to favourites");
          favButton.innerHTML = recipe.is_favourite ? "&#9829;" : "&#9825;";
          article.appendChild(favButton);

          if (safeImageUrl) {
            const image = document.createElement("img");
            image.src = safeImageUrl;
            image.alt = title;
            image.loading = "lazy";
            image.dataset.action = "view";
            image.dataset.id = recipe.id || "";
            article.appendChild(image);
          } else {
            const placeholder = document.createElement("div");
            placeholder.className = "recipe-card__image recipe-card__image--placeholder";
            placeholder.setAttribute("aria-hidden", "true");
            placeholder.dataset.action = "view";
            placeholder.dataset.id = recipe.id || "";
            article.appendChild(placeholder);
          }

          const body = document.createElement("div");
          body.className = "recipe-card__body";

          const heading = document.createElement("h3");
          heading.textContent = title;
          heading.dataset.action = "view";
          heading.dataset.id = recipe.id || "";
          heading.classList.add("recipe-card__title-link");
          body.appendChild(heading);

          const dateText = document.createElement("p");
          dateText.textContent = formatDate(recipe.created_at);
          body.appendChild(dateText);

          if (recipe.category) {
            const badge = document.createElement("span");
            badge.className = "recipe-card__category-badge";
            badge.textContent = capitalize(recipe.category);
            body.appendChild(badge);
          }

          const prepTimeValue = String(recipe.prep_time ?? recipe.prepTime ?? "").trim();
          const cookingTimeValue = String(recipe.cooking_time ?? recipe.cookingTime ?? "").trim();
          const prepParsed = parseDurationText(prepTimeValue);
          const cookParsed = parseDurationText(cookingTimeValue);
          const totalMinutes =
            Number(prepParsed.hours || 0) * 60 +
            Number(prepParsed.minutes || 0) +
            Number(cookParsed.hours || 0) * 60 +
            Number(cookParsed.minutes || 0);
          const storedTotalTime = String(recipe.total_time ?? recipe.totalTime ?? "").trim();
          const totalTimeValue = totalMinutes > 0 ? formatDuration(totalMinutes) : storedTotalTime;
          const servesValue = String(recipe.serves ?? recipe.servings ?? "").trim();
          const difficultyNum = normalizeDifficulty(recipe.difficulty, 4);
          const difficultyLevel = `${difficultyNum} — ${getDifficultyLabel(difficultyNum)}`;
          const metaItems = [
            { label: "Total Time", value: totalTimeValue },
            { label: "Serves", value: servesValue },
            { label: "Difficulty", value: difficultyLevel }
          ].filter((item) => Boolean(item.value));

          if (metaItems.length) {
            const meta = document.createElement("div");
            meta.className = "recipe-card__meta";
            metaItems.forEach((item) => {
              const line = document.createElement("p");
              line.className = "recipe-card__meta-item";
              const label = document.createElement("strong");
              label.textContent = `${item.label}:`;
              line.appendChild(label);
              line.append(` ${item.value}`);
              meta.appendChild(line);
            });
            body.appendChild(meta);
          }

          const button = document.createElement("button");
          button.className = "button";
          button.type = "button";
          button.dataset.action = "view";
          button.dataset.id = recipe.id || "";
          button.textContent = "View";
          body.appendChild(button);

          article.appendChild(body);
          recipeList.appendChild(article);
        });
      }

    } catch (error) {
      recipeList.innerHTML = '<p class="empty">Could not render recipes.</p>';
    }
  }

  function showDetail(recipe, options = {}) {
    const { scrollToDetail = true } = options;
    const renderDetail = (resolvedImageUrl) => {
      const toMetaText = (value) => {
        const text = value == null ? "" : String(value).trim();
        return text ? escapeHtml(text) : "";
      };
      const prepTime = recipe.prep_time ?? recipe.prepTime ?? "";
      const cookingTime = recipe.cooking_time ?? recipe.cookingTime ?? "";
      const prepParsed = parseDurationText(prepTime);
      const cookParsed = parseDurationText(cookingTime);
      const prepMinutesTotal = Number(prepParsed.hours || 0) * 60 + Number(prepParsed.minutes || 0);
      const cookMinutesTotal = Number(cookParsed.hours || 0) * 60 + Number(cookParsed.minutes || 0);
      const computedTotalTime =
        prepMinutesTotal > 0 || cookMinutesTotal > 0 ? formatDuration(prepMinutesTotal + cookMinutesTotal) : "";
      const totalTime = recipe.total_time ?? recipe.totalTime ?? computedTotalTime;
      const serves = recipe.serves ?? recipe.servings ?? "";
      const difficultyNum = normalizeDifficulty(recipe.difficulty, 4);
      const difficulty = `${difficultyNum} — ${getDifficultyLabel(difficultyNum)}`;
      const metaItems = [
        { label: "Prep Time", value: toMetaText(prepTime), field: "prep_time", editable: true },
        { label: "Cooking Time", value: toMetaText(cookingTime), field: "cooking_time", editable: true },
        { label: "Total Time", value: toMetaText(totalTime) },
        { label: "Serves", value: toMetaText(serves) },
        { label: "Difficulty", value: toMetaText(difficulty), field: "difficulty", editable: true }
      ].filter((item) => Boolean(item.value));
      const renderMetaItem = (item) => {
        if (item.editable && item.field) {
          const ariaLabel = `Click to edit ${item.label.toLowerCase()}`;
          return `<p class="recipe-detail-card__meta-item recipe-detail-card__meta-item--editable"><button class="inline-edit-trigger" data-action="inline-edit-field" data-field="${item.field}" type="button" aria-label="${ariaLabel}"><strong>${item.label}:</strong> <span data-field-content="${item.field}">${item.value}</span></button></p>`;
        }
        return `<p class="recipe-detail-card__meta-item"><strong>${item.label}:</strong> ${item.value}</p>`;
      };
      const metaHtml = metaItems.length
        ? `
        <div class="recipe-detail-card__meta" aria-label="Recipe timing and servings">
          ${metaItems.map((item) => renderMetaItem(item)).join("")}
        </div>`
        : "";
      const imageHtml = resolvedImageUrl
        ? `<div class="recipe-detail-card__image-wrap" style="--detail-img: url('${escapeHtml(resolvedImageUrl)}')"><img src="${escapeHtml(resolvedImageUrl)}" alt="${escapeHtml(recipe.title)}" /></div>`
        : '<div class="recipe-detail-card__image recipe-detail-card__image--placeholder" aria-hidden="true"></div>';

      const categoryHtml = recipe.category
        ? `<span class="recipe-detail-card__category-badge">${escapeHtml(capitalize(recipe.category))}</span>`
        : "";
      const favActive = recipe.is_favourite;
      const favHeart = favActive ? "&#9829;" : "&#9825;";
      const favLabel = favActive ? "Remove from favourites" : "Add to favourites";
      const favClass = "recipe-detail-card__fav-button" + (favActive ? " recipe-detail-card__fav-button--active" : "");

      let galleryImages = [];
      try { galleryImages = JSON.parse(recipe.gallery_images || "[]"); } catch (_) { /* ignore */ }
      const galleryHtml = galleryImages.length
        ? `<div class="recipe-gallery">
            ${galleryImages.map((url, idx) => `<div class="recipe-gallery__item">
              <img src="${escapeHtml(url)}" alt="Gallery image ${idx + 1}" loading="lazy" />
              <button type="button" class="recipe-gallery__remove" data-action="remove-gallery-image" data-idx="${idx}" data-id="${recipe.id}" aria-label="Remove image">&times;</button>
            </div>`).join("")}
          </div>`
        : "";

      detailContent.innerHTML = `
      <article class="recipe-detail-card">
        ${imageHtml}
        ${galleryHtml}
        <div class="recipe-gallery__add-wrap">
          <button type="button" class="button button--ghost" data-action="add-gallery-image" data-id="${recipe.id}">+ Add Gallery Image</button>
          <input type="file" class="recipe-gallery__file-input hidden" accept="image/*" data-id="${recipe.id}" />
          <input type="text" class="recipe-gallery__url-input hidden" placeholder="Or paste image URL and press Enter" data-id="${recipe.id}" />
        </div>
        <div class="recipe-detail-card__header">
          <div class="recipe-detail-card__title-row">
            <h2>${escapeHtml(recipe.title)}</h2>
            <button class="${favClass}" type="button" data-action="toggle-fav" data-id="${recipe.id}" aria-label="${favLabel}">${favHeart}</button>
          </div>
          <p class="recipe-detail-card__date">Added ${formatDate(recipe.created_at)} ${categoryHtml}</p>
        </div>
        ${metaHtml}

        <section class="recipe-detail-card__section" data-field="ingredients">
          <h3 class="recipe-detail-card__editable-title">
            <button class="inline-edit-trigger" data-action="inline-edit-field" data-field="ingredients" type="button" aria-label="Click to edit ingredients">Ingredients</button>
          </h3>
          ${serves ? `<div class="serving-scaler" data-original-serves="${escapeHtml(String(serves))}" data-original-ingredients="${escapeHtml(recipe.ingredients)}">
            <button type="button" class="serving-scaler__btn" data-action="scale-down" aria-label="Decrease servings">&minus;</button>
            <span class="serving-scaler__value" data-scale-display>${escapeHtml(String(serves))}</span>
            <span class="serving-scaler__label">servings</span>
            <button type="button" class="serving-scaler__btn" data-action="scale-up" aria-label="Increase servings">&plus;</button>
            <button type="button" class="serving-scaler__reset button--ghost" data-action="scale-reset">Reset</button>
          </div>` : ""}
          <button
            class="inline-edit-trigger recipe-detail-card__editable"
            data-action="inline-edit-field"
            data-field="ingredients"
            data-field-content="ingredients"
            type="button"
            aria-label="Click to edit ingredients"
          >${escapeHtml(recipe.ingredients).replace(/\n/g, "<br />")}</button>
        </section>

        <section class="recipe-detail-card__section" data-field="method">
          <h3 class="recipe-detail-card__editable-title">
            <button class="inline-edit-trigger" data-action="inline-edit-field" data-field="method" type="button" aria-label="Click to edit method">Method</button>
          </h3>
          <button
            class="inline-edit-trigger recipe-detail-card__editable"
            data-action="inline-edit-field"
            data-field="method"
            data-field-content="method"
            type="button"
            aria-label="Click to edit method"
          >${escapeHtml(recipe.method).replace(/\n/g, "<br />")}</button>
        </section>

        ${recipe.notes ? `<section class="recipe-detail-card__section" data-field="notes">
          <h3 class="recipe-detail-card__editable-title">
            <button class="inline-edit-trigger" data-action="inline-edit-field" data-field="notes" type="button" aria-label="Click to edit notes">Notes / Tips</button>
          </h3>
          <button
            class="inline-edit-trigger recipe-detail-card__editable"
            data-action="inline-edit-field"
            data-field="notes"
            data-field-content="notes"
            type="button"
            aria-label="Click to edit notes"
          >${escapeHtml(recipe.notes).replace(/\n/g, "<br />")}</button>
        </section>` : `<button class="button button--ghost recipe-detail-card__add-notes" type="button" data-action="inline-edit-field" data-field="notes" data-id="${recipe.id}">+ Add Notes / Tips</button>`}

        <div class="recipe-detail-card__actions">
          <button class="button button--secondary" type="button" data-action="edit" data-id="${recipe.id}">
            Edit Recipe
          </button>
          <button class="button button--secondary hidden" type="button" data-action="duplicate" data-id="${recipe.id}">
            Duplicate
          </button>
          <button class="button button--secondary hidden" type="button" data-action="share" data-id="${recipe.id}">
            Share
          </button>
          <button class="button button--secondary recipe-detail-card__print-button" type="button" onclick="window.print()">
            Print
          </button>
          <button class="button button--secondary" type="button" data-action="add-to-shopping" data-id="${recipe.id}">
            + Shopping List
          </button>
          <button class="button button--danger" type="button" data-action="delete" data-id="${recipe.id}">
            Delete Recipe
          </button>
        </div>
      </article>
    `;
    };

    const immediateImageUrl = getDisplayImageUrl(recipe);
    renderDetail(immediateImageUrl);
    setDetailOpen(true);
    if (scrollToDetail) {
      recipeDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (!immediateImageUrl && recipe.image_url) {
      getSignedImageUrl(recipe.image_url)
        .then((signedUrl) => {
          if (!signedUrl) return;
          recipe._resolvedImageUrl = signedUrl;
          const current = state.recipes.find((item) => item.id === recipe.id);
          if (current) {
            current._resolvedImageUrl = signedUrl;
          }

          const openedDeleteButton = detailContent.querySelector("button[data-action='delete']");
          const openedRecipeId = openedDeleteButton?.dataset?.id;
          if (openedRecipeId === recipe.id) {
            renderDetail(signedUrl);
          }
        })
        .catch((error) => {
          if (logSupabaseError) logSupabaseError("image hydration", error);
        });
    }
  }

  function normalizeLoadedRecipes(items, defaultDifficulty) {
    return (items || []).map((item) => ({
      ...item,
      difficulty: normalizeDifficulty(item?.difficulty, defaultDifficulty),
      _resolvedImageUrl: null
    }));
  }

  return {
    patchRecipeCardImage,
    patchOpenDetailImage,
    hydrateImagesInBackground,
    renderList,
    showDetail,
    normalizeLoadedRecipes
  };
}

window.StorecipeRecipeRenderer = {
  createRecipeRenderer
};
