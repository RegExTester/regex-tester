# TASK-01 — Retire all `ui-angular` references

| | |
|---|---|
| **Phase** | A |
| **Depends on** | Nothing — can start immediately |
| **Blocks** | Nothing |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Not started |

## Context

The `ui-angular/` project has been deleted from the repository, but 22 references to it remain across
documentation and C# XML doc comments. Two of those XML comments are compiled into the generated
OpenAPI description, so the stale text is also present in the checked-in OpenAPI JSON.

## What changes

### 1. Delete the orphaned design doc

- Delete `docs/design/ui-angular.md`.

### 2. `CLAUDE.md`

- Remove the `| **ui-angular** | Angular 21.1 SPA | ui-angular/ |` row from the Projects table (~line 15).
- Remove the entire `### ui-angular` command block (~line 38) from the Commands section.
- Remove the entire `### ui-angular Key Files` section (~line 98) from the Architecture section.
- In the Overview, reword "two frontend SPAs and two backend APIs" to reflect **one** frontend SPA.
- Remove the sentence "The frontends are interchangeable — both call the same API contract (`POST /api/regex`)."
  and keep only the statement that the Vue.js frontend can switch backends at runtime.

### 3. `docs/design/ui-vuejs.md`

- Line ~119 currently reads "Same layout as ui-angular:" — rewrite so the section stands on its own
  (describe the layout directly instead of referring to the deleted doc).
- Line ~144 currently reads "Same algorithm as ui-angular: iterates matches in **reverse order** …" —
  rewrite to describe the algorithm directly without the cross-reference.
- Replace the `## Differences from ui-angular` section and its comparison table (~lines 154–158) with a
  short `## History` section noting that ui-angular was the original Angular 21.1 SPA and has been retired
  in favour of ui-vuejs. Do not keep the comparison table.

### 4. `api-dotnet` XML doc comments

- `api-dotnet/Controllers/HomeController.cs` line ~12:
  `<summary>Redirect to the Angular frontend.</summary>` → `<summary>Redirect to the frontend.</summary>`
- `api-dotnet/Controllers/RegexController.cs` line ~28:
  "All string fields are Base64Url-encoded by the Angular frontend before submission but …"
  → "… by the frontend before submission but …"

### 5. Regenerate the checked-in OpenAPI document

- `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json` lines ~18 and ~52 contain the two strings above.
- Regenerate the file from the running API rather than hand-editing it, so it stays byte-consistent with
  the generator:
  ```powershell
  cd api-dotnet
  dotnet build
  # start the API, then:
  Invoke-WebRequest http://localhost:5000/openapi/v1.json -OutFile ../docs/open-api/api-dotnet/RegExTester.Api.DotNet.json
  ```
- If the API cannot be started in this environment, hand-edit only those two description strings and note
  it in the final report.

## Out of scope

- Do not restore `ui-angular/`.
- Do not add `api-python` content to `CLAUDE.md` — that is TASK-08.
- Do not change any API behaviour.

## Acceptance criteria

- [ ] `docs/design/ui-angular.md` no longer exists.
- [ ] A repo-wide case-insensitive search for `angular` returns **zero** matches outside `.git/`
      (verify with `git grep -in angular`, which should exit non-zero / print nothing).
- [ ] `CLAUDE.md` Projects table lists exactly three projects: api-dotnet, api-nodejs, ui-vuejs.
- [ ] `CLAUDE.md` contains no `### ui-angular` heading of any kind.
- [ ] `docs/design/ui-vuejs.md` contains no reference to ui-angular except inside the new `## History` section,
      and that section does not link to the deleted file.
- [ ] No markdown link anywhere in the repo points to `docs/design/ui-angular.md`.
- [ ] `cd api-dotnet; dotnet build` succeeds with no new warnings.
- [ ] `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json` contains no occurrence of "Angular".
- [ ] `.github/workflows/` still contains exactly three workflow files (no ui-angular workflow existed).
- [ ] No files outside those listed above are modified.

## Report back

List every file changed, whether the OpenAPI JSON was regenerated or hand-edited, and the output of the
final `git grep -in angular` check.
