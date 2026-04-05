## JavaScript structure

The frontend code is split into focused modules. Each module uses an IIFE that
exposes a factory function on `window.StorecipeXxx`. Factories receive their
dependencies via constructor injection. `app.js` creates all instances and wires
them together.

### `core/`
- `config.js`: Supabase credentials (gitignored). Copy `config.example.js` to get started.
- `config.example.js`: template for `config.js`.
- `constants.js`: central app constants/config values. Reads credentials from `config.js` at load time; falls back to placeholders (demo mode).
- `domRefs.js`: all DOM selectors in one place.
- `helpers.js`: pure utility functions (formatting, URL checks, parsing, validation helpers).
- `appState.js`: shared mutable state bag. All modules receive the same state object.

### `services/`
- `supabaseServices.js`: network-facing logic (REST calls, edge function calls, storage upload/download/signed URLs).

### `features/`
- `authUiManager.js`: auth status display, loading states, setAuthUi, setAppStatus.
- `imageManager.js`: image preview/edit state (choose, clear, undo, refresh).
- `importPromptManager.js`: editable import prompt persistence by user/local storage.
- `inlineEditManager.js`: inline detail field editing (ingredients, method, time, difficulty).
- `recipeMetaManager.js`: recipe meta validation + UI sync (time fields, serves, difficulty).
- `recipeRenderer.js`: list/detail rendering and image hydration behavior.
- `settingsManager.js`: settings panel open/close, positioning, focus trap.
- `themeManager.js`: light/dark theme toggle, persistence (local + Supabase).
- `viewManager.js`: panel visibility (list, add/edit form, detail view).

### Entry
- `app.js`: orchestrator — creates all managers, wires event listeners, CRUD operations, auth flow, and init.
