function createSupabaseServices({ config, state, helpers }) {
  const {
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
  } = config;

  const { withTimeout, normalizeStoragePath, getDirectImageUrl } = helpers;

  async function debugFetch(input, init = {}, { retries = 1 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
      try {
        return await window.fetch(input, { ...init, signal: controller.signal });
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }
    throw lastError;
  }

  const hasSupabaseConfig =
    Boolean(window.supabase) &&
    SUPABASE_URL !== SUPABASE_URL_PLACEHOLDER &&
    SUPABASE_PUBLISHABLE_KEY !== SUPABASE_KEY_PLACEHOLDER;
  const client = hasSupabaseConfig
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: { fetch: debugFetch }
      })
    : null;

  function getAccessToken() {
    const accessToken = state.currentSession?.access_token;
    if (!accessToken) {
      throw new Error("No access token found. Sign out and sign in again.");
    }
    return accessToken;
  }

  async function parseResponse(response, fallback) {
    const rawText = await response.text();
    try {
      return rawText ? JSON.parse(rawText) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  async function fetchThemePreferenceViaRest(userId) {
    const accessToken = getAccessToken();
    const query = new URLSearchParams({
      select: "theme",
      user_id: `eq.${userId}`,
      limit: "1"
    });
    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/${THEME_PREFERENCES_TABLE}?${query.toString()}`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await parseResponse(response, []);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `Theme fetch failed with status ${response.status}`;
      throw new Error(message);
    }

    return Array.isArray(data) ? data : [];
  }

  async function upsertThemePreferenceViaRest(userId, theme) {
    const accessToken = getAccessToken();
    const t = String(theme).toLowerCase();
    const normalizedTheme = t === "dark" ? "dark" : t === "sunset" ? "sunset" : "light";
    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/${THEME_PREFERENCES_TABLE}?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([{ user_id: userId, theme: normalizedTheme }])
    });

    const data = await parseResponse(response, []);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `Theme upsert failed with status ${response.status}`;
      throw new Error(message);
    }

    return Array.isArray(data) ? data : [];
  }

  async function insertRecipeViaRest(payload) {
    const accessToken = getAccessToken();
    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/recipes`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    const data = await parseResponse(response, null);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `REST insert failed with status ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function updateRecipeViaRest(recipeId, userId, payload) {
    const accessToken = getAccessToken();
    const query = new URLSearchParams({
      id: `eq.${recipeId}`,
      user_id: `eq.${userId}`
    });
    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/recipes?${query.toString()}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    const data = await parseResponse(response, null);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `REST update failed with status ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function fetchRecipesViaRest(userId) {
    const accessToken = getAccessToken();
    const query = new URLSearchParams({
      select: "*",
      user_id: `eq.${userId}`,
      order: "created_at.desc"
    });

    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/recipes?${query.toString()}`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await parseResponse(response, []);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `REST fetch failed with status ${response.status}`;
      throw new Error(message);
    }

    return Array.isArray(data) ? data : [];
  }

  async function importRecipeFromUrlViaFunction(url, prompt) {
    if (!hasSupabaseConfig) {
      throw new Error("Recipe import needs a configured Supabase project.");
    }

    const accessToken = getAccessToken();
    const normalizedPrompt = String(prompt ?? "").trim();
    const response = await debugFetch(`${SUPABASE_URL}/functions/v1/${RECIPE_IMPORT_FUNCTION}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        prompt: normalizedPrompt
      })
    });

    const data = await parseResponse(response, {});
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "error" in data
          ? data.error
          : `Recipe import failed with status ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function fetchExternalImageAsFile(imageUrl) {
    if (!hasSupabaseConfig) {
      throw new Error("Image preservation needs a configured Supabase project.");
    }
    const trimmed = String(imageUrl || "").trim();
    if (!trimmed) throw new Error("Missing image URL.");

    const accessToken = getAccessToken();
    const response = await debugFetch(`${SUPABASE_URL}/functions/v1/image-proxy`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: trimmed })
    });

    if (!response.ok) {
      let message = `Image fetch failed with status ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data === "object") {
          if ("error" in data && data.error) message = String(data.error);
          else if ("message" in data && data.message) message = String(data.message);
          else if ("msg" in data && data.msg) message = String(data.msg);
        }
      } catch (_error) {
        // ignore
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const contentType = (blob.type || "image/jpeg").toLowerCase();
    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg"
    };
    const extension = extensionMap[contentType] || "jpg";
    const fileName = `imported-${Date.now()}.${extension}`;
    return new File([blob], fileName, { type: contentType });
  }

  async function uploadImage(file, userId) {
    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error } = await client.storage.from(BUCKET).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

    if (error) throw error;
    return filePath;
  }

  async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });
  }

  async function getSignedImageUrl(path) {
    evictExpiredCacheEntries();
    if (!path || !hasSupabaseConfig) return null;

    const rawValue = String(path).trim();
    if (!rawValue) return null;

    const normalizedPath = normalizeStoragePath(rawValue, BUCKET);
    if (!normalizedPath) return getDirectImageUrl(rawValue);
    const cached = state.signedImageUrlByPath[normalizedPath];
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    let downloadResult;
    try {
      downloadResult = await withTimeout(
        client.storage.from(BUCKET).download(normalizedPath),
        IMAGE_RESOLVE_TIMEOUT_MS,
        "storage.download"
      );
    } catch (timeoutError) {
      downloadResult = { data: null, error: timeoutError };
    }
    const { data: blobData, error: downloadError } = downloadResult;
    if (!downloadError && blobData) {
      const objectUrl = URL.createObjectURL(blobData);
      state.signedImageUrlByPath[normalizedPath] = { url: objectUrl, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
      return objectUrl;
    }

    let signResult;
    try {
      signResult = await withTimeout(
        client.storage.from(BUCKET).createSignedUrl(normalizedPath, 3600),
        IMAGE_SIGN_TIMEOUT_MS,
        "createSignedUrl"
      );
    } catch (error) {
      signResult = { data: null, error };
    }

    const { data, error } = signResult;
    if (!error && data?.signedUrl) {
      state.signedImageUrlByPath[normalizedPath] = { url: data.signedUrl, expiresAt: Date.now() + 50 * 60 * 1000 };
      return data.signedUrl;
    }

    const { data: publicData } = client.storage.from(BUCKET).getPublicUrl(normalizedPath);
    if (publicData?.publicUrl) {
      state.signedImageUrlByPath[normalizedPath] = { url: publicData.publicUrl, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
      return publicData.publicUrl;
    }

    return null;
  }

  let lastEvictionTime = 0;
  const EVICTION_INTERVAL_MS = 5 * 60 * 1000;

  function evictExpiredCacheEntries() {
    const now = Date.now();
    if (now - lastEvictionTime < EVICTION_INTERVAL_MS) return;
    lastEvictionTime = now;
    for (const key of Object.keys(state.signedImageUrlByPath)) {
      const entry = state.signedImageUrlByPath[key];
      if (entry && entry.expiresAt <= now) {
        if (entry.url && entry.url.startsWith("blob:")) {
          try { URL.revokeObjectURL(entry.url); } catch (_e) { /* ignore */ }
        }
        delete state.signedImageUrlByPath[key];
      }
    }
  }

  async function toggleRecipePublicViaRest(recipeId, userId, makePublic) {
    const accessToken = getAccessToken();
    const shareToken = makePublic ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : null;
    const query = new URLSearchParams({
      id: `eq.${recipeId}`,
      user_id: `eq.${userId}`
    });
    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/recipes?${query.toString()}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ is_public: makePublic, share_token: shareToken })
    });

    const data = await parseResponse(response, null);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `Share toggle failed with status ${response.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function fetchPublicRecipeViaRest(shareToken) {
    const query = new URLSearchParams({
      select: "*",
      share_token: `eq.${shareToken}`,
      is_public: "eq.true",
      limit: "1"
    });
    const response = await debugFetch(`${SUPABASE_URL}/rest/v1/recipes?${query.toString()}`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY
      }
    });

    const data = await parseResponse(response, []);
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : `Public recipe fetch failed with status ${response.status}`;
      throw new Error(message);
    }
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  }

  return {
    hasSupabaseConfig,
    client,
    debugFetch,
    fetchThemePreferenceViaRest,
    upsertThemePreferenceViaRest,
    insertRecipeViaRest,
    updateRecipeViaRest,
    fetchRecipesViaRest,
    importRecipeFromUrlViaFunction,
    uploadImage,
    fetchExternalImageAsFile,
    readFileAsDataUrl,
    getSignedImageUrl,
    toggleRecipePublicViaRest,
    fetchPublicRecipeViaRest
  };
}

window.StorecipeSupabaseServices = {
  createSupabaseServices
};
