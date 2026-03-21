# ui-angular — Design Document

## Overview

Angular 21.1 Single Page Application providing a real-time regex testing interface. Connects to the .NET backend API. Features debounced input, match highlighting, group/capture display, and URL-based sharing.

## Technology Stack

- **Framework**: Angular 21.1.2 (standalone components)
- **Language**: TypeScript 5.9.3
- **Build**: Angular CLI with webpack
- **HTTP**: Angular HttpClient with RxJS
- **Styling**: Bootstrap 5.3.8, Font Awesome 4.7.0
- **Testing**: Karma + Jasmine

## Project Structure

```
ui-angular/
├── src/
│   ├── app/
│   │   ├── app.component.ts           # Root component (router outlet)
│   │   ├── app.routing.ts             # Route definitions
│   │   └── regex/
│   │       ├── regex.component.ts     # Main component logic
│   │       ├── regex.component.html   # Template
│   │       ├── regex.component.css    # Component styles
│   │       ├── regex.component.spec.ts# Unit tests
│   │       └── regex.config.ts        # Configuration constants
│   ├── model/
│   │   └── regextesterresult.model.ts # Response type definitions
│   ├── utils/
│   │   └── encodeUriHelper.ts         # Base64Url codec (RFC7515)
│   ├── environments/
│   │   ├── environment.ts             # Dev: localhost:5000
│   │   └── environment.prod.ts        # Prod: Azure
│   ├── main.ts                        # Bootstrap entry
│   ├── index.html                     # HTML shell
│   └── styles.css                     # Global styles
├── angular.json                       # Build configuration
└── package.json
```

## Component Architecture

### AppComponent
- Standalone component with `<router-outlet>`
- No logic; pure routing shell

### RegexComponent
- Standalone component using `CommonModule` + `FormsModule`
- `EncodeUriHelper` injected via component-level provider

**State**:
- `pattern`, `text`, `replace` — form inputs
- `result: RegExTesterResult` — API response
- `options` — checkbox array with bitwise values
- `engine` — server version string (from `/api/version`)
- `highlightText` — HTML string with colored match spans
- `busy` — loading flag
- `expandMatchResult` — tracks expanded match cards

**Key Methods**:
- `warmUpApiServer()` — fetches `/api/version` via HttpClient
- `delaySubmit(time?)` — debounces input (800ms default, 500ms on mobile options)
- `submit()` — validates, updates URL, POSTs to API, builds highlight HTML
- `updateUrl()` — uses `Location.replaceState()` for shareable URL
- `initFromRoute()` — restores state from URL parameters on load

## Routing

```
/                                    → RegexComponent
/:pattern                            → RegexComponent
/:pattern/:text                      → RegexComponent
/:pattern/:text/:options             → RegexComponent
/:pattern/:text/:options/:engine     → RegexComponent (unused engine param)
/**                                  → redirect
```

Parameters are Base64Url-encoded. Decoded on init via `ActivatedRoute.params` subscription.

## API Integration

- Uses Angular `HttpClient` with RxJS `subscribe()`
- Connects to .NET backend only (single engine)
- Engine dropdown in header is present but disabled (decorative)

**Environment Config**:
| Environment | API Base URL |
|-------------|-------------|
| Dev | `http://localhost:5000` |
| Production | `https://regex-tester-api-dotnet.azurewebsites.net` |

## UI Layout (Bootstrap Grid)

```
┌──────────────────────────────────────────┐
│ Header: Title | Engine dropdown | Status │
├──────────────────────┬───────────────────┤
│ Pattern textarea     │ Options checkboxes│
│ Text textarea        │ (desktop sidebar) │
├──────────────────────┴───────────────────┤
│ Tabs: [Matches] [Replace]                │
│ ┌──────────────────────────────────────┐ │
│ │ Highlighted text                     │ │
│ │ Expandable match cards with groups   │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Options (mobile, below results)          │
├──────────────────────────────────────────┤
│ Footer                                   │
└──────────────────────────────────────────┘
```

- Desktop: col-md-9 (inputs) + col-md-3 (options sidebar)
- Mobile: options move below results (`d-block d-md-none`)

## Match Highlighting

Iterates matches in **reverse order** to preserve string indices, wrapping each match in a `<span>` with one of 5 cycling color classes (`match-0` through `match-4`).

## Build & Deployment

```bash
npm run build-prod    # Production build with AOT
npm run deploy        # Deploy to GitHub Pages via angular-cli-ghpages
```

- Budget: 2MB initial warning, 5MB error
- Output: `dist/`
- Deploy target: GitHub Pages (`https://regextester.github.io/`)
