# ui-vuejs — Design Document

## Overview

Vue 3 Single Page Application providing a real-time regex testing interface with multi-engine support. Users can switch between .NET and Node.js backends at runtime. Features debounced input, match highlighting, group/capture display, and URL-based sharing.

## Technology Stack

- **Framework**: Vue 3.5.0 (Composition API with `<script setup>`)
- **Build**: Vite 6.0.0
- **Routing**: Vue Router 4.5.0
- **HTTP**: Native Fetch API
- **Styling**: Bootstrap 5.3.3, Font Awesome 4.7.0

## Project Structure

```
ui-vuejs/
├── src/
│   ├── components/
│   │   └── RegexTester.vue         # Main component (template + logic)
│   ├── router/
│   │   └── index.js                # Route definitions
│   ├── utils/
│   │   └── encodeUriHelper.js      # Base64Url codec (RFC7515)
│   ├── App.vue                     # Root component (RouterView)
│   ├── config.js                   # Configuration (endpoints, options, engines)
│   ├── main.js                     # Vue app bootstrap
│   └── styles.css                  # Global styles
├── .env                            # Dev environment variables
├── .env.production                 # Prod environment variables
├── vite.config.js                  # Vite configuration
├── index.html                      # HTML entry point
└── package.json
```

## Component Architecture

### App.vue
- Renders `<RouterView />` — pure routing shell

### RegexTester.vue
Single-file component using `<script setup>` (Composition API).

**State (refs)**:
- `selectedEngine` — `'DOTNET'` or `'NODEJS'`
- `engine` — version string from `/api/version` (or `'offline'`)
- `pattern`, `text`, `replace` — form inputs
- `result` — API response object
- `highlightText` — HTML string with colored match spans
- `busy` — loading flag
- `activeTab` — `'matches'` or `'replace'`
- `expandMatchResult` — tracks expanded match cards
- `options` — reactive array of checkboxes with `{ name, value, checked }`

**Computed**:
- `engineTooltip` — tooltip text based on engine status
- `engineIconClass` — Font Awesome icon class (spinner/exclamation/info)

**Key Functions**:
- `apiConfig()` — returns `CONFIG.API[selectedEngine]` endpoints
- `warmUpApiServer()` — fetches `/api/version` for selected engine
- `onEngineChange()` — re-pings version endpoint + re-submits regex
- `delaySubmit(time?)` — debounces input (800ms default)
- `submit()` — validates, updates URL, POSTs to selected engine, builds highlight HTML
- `updateUrl(url)` — uses `router.replace()` + updates og: meta tags
- `initFromRoute()` — restores state from URL parameters on mount

## Engine Switching

The header contains a Bootstrap dropdown listing engines from `CONFIG.ENGINES`:

```
ENGINES: {
  DOTNET: { Name: '.Net',    Key: 'DOTNET' },
  NODEJS: { Name: 'Node.js', Key: 'NODEJS' },
}
```

On selection change:
1. `selectedEngine` ref updates
2. `warmUpApiServer()` pings the new engine's `/api/version`
3. Engine status icon shows loading → online/offline
4. `delaySubmit()` re-runs the current regex against the new engine

Both engines share the same API contract, so results are directly comparable.

## Routing

```
/                              → RegexTester
/:pattern                      → RegexTester
/:pattern/:text                → RegexTester
/:pattern/:text/:options       → RegexTester
```

Uses `createWebHistory('/')` (HTML5 History API). Parameters are Base64Url-encoded.

## API Integration

Uses native `fetch()` with Promises. Endpoint resolved dynamically via `apiConfig()`.

```javascript
fetch(apiConfig().REGEX, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pattern, text, replace, options })
})
```

**Environment Config**:
| Variable | Dev (.env) | Production (.env.production) |
|----------|-----------|------------------------------|
| `VITE_API_DOTNET` | `http://localhost:5000` | `https://regex-tester-api-dotnet.azurewebsites.net` |
| `VITE_API_NODEJS` | `http://localhost:5100` | `https://regex-tester-api-nodejs.azurewebsites.net` |

## UI Layout (Bootstrap Grid)

```
┌──────────────────────────────────────────────┐
│ Header: Title | Engine dropdown ▾ | Status   │
├──────────────────────┬───────────────────────┤
│ Pattern textarea     │ Options checkboxes    │
│ Text textarea        │ (desktop sidebar)     │
├──────────────────────┴───────────────────────┤
│ Tabs: [Matches] [Replace]                    │
│ ┌──────────────────────────────────────────┐ │
│ │ Highlighted text                         │ │
│ │ Expandable match cards with groups       │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ Options (mobile, below results)              │
├──────────────────────────────────────────────┤
│ Footer                                       │
└──────────────────────────────────────────────┘
```

The engine dropdown is a functional Bootstrap 5 dropdown (`data-bs-toggle="dropdown"`) with active state highlighting on the selected engine.

## Match Highlighting

Iterates matches in **reverse order**, inserts colored `<span>` elements with 5 cycling CSS classes, rendered via `v-html`.

## Data Flow

```
User Input → Debounce (800ms) → Validation → Base64Url Encode
  → Update URL → POST /api/regex (selected engine)
  → Parse Response → Build Highlight HTML → Render
```

## History

ui-vuejs replaces ui-angular, the original Angular 21.1 SPA, which has been retired.

## Build & Deployment

```bash
npm run build-prod    # Vite production build
npm run preview       # Preview production build locally
```

- Output: `dist/`
- Deploy target: GitHub Pages (`https://regextester.github.io/`)
