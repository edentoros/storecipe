const _config = window.StorecipeConfig || {};
const SUPABASE_URL = _config.SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = _config.SUPABASE_PUBLISHABLE_KEY || "YOUR_SUPABASE_PUBLISHABLE_KEY";
const SUPABASE_URL_PLACEHOLDER = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_KEY_PLACEHOLDER = "YOUR_SUPABASE_PUBLISHABLE_KEY";
const NETWORK_TIMEOUT_MS = 45000;
const IMAGE_RESOLVE_TIMEOUT_MS = 8000;
const IMAGE_SIGN_TIMEOUT_MS = 1500;
const BUCKET = "recipes";
const LOCAL_RECIPES_KEY = "recipes_local_data_v1";
const THEME_PREFERENCES_TABLE = "user_preferences";
const DEFAULT_THEME = "light";
const DEFAULT_DIFFICULTY = 4;
const THEME_LOCAL_KEY_PREFIX = "storecipe_theme_";
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const RECIPE_IMPORT_FUNCTION = "recipe-import";
const RECIPE_IMPORT_PROMPT_LOCAL_KEY_PREFIX = "storecipe_import_prompt_";
const RECIPE_IMPORT_PROMPT_DEFAULT_KEY = `${RECIPE_IMPORT_PROMPT_LOCAL_KEY_PREFIX}default`;
const DEFAULT_RECIPE_IMPORT_PROMPT = `Extract a recipe from the provided page text.
Return only valid JSON with:
- title: string
- ingredients: array of strings
- method: array of short steps
- prep_hours: integer 0..10 or null
- prep_minutes: integer 0..60 or null
- cook_hours: integer 0..10 or null
- cook_minutes: integer 0..60 or null
- serves: integer 1..15 or null
- difficulty: integer 1..10 (default 4 when unknown)
- image_url: absolute http/https URL or null
Rules:
- Keep only useful recipe data, remove ads/stories.
- Keep ingredient quantities and units.
- Keep method concise and practical.
- If unsure, use null.`;

const RECIPE_CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Drinks", "Other"
];

window.StorecipeConstants = {
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
  DEFAULT_RECIPE_IMPORT_PROMPT,
  RECIPE_CATEGORIES
};
