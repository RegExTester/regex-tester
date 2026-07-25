# Task index — Shared v1 API Contract + api-python Backend

Source plan: [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md)

| Task | Title | Depends on | Status |
|---|---|---|---|
| [TASK-01](TASK-01-retire-ui-angular.md) | Retire all `ui-angular` references | — | Done |
| [TASK-02](TASK-02-canonical-api-contract.md) | Define the canonical v1 API contract | — | Done |
| [TASK-03](TASK-03-api-python.md) | New backend: `api-python` (FastAPI) | 02 | Done |
| [TASK-04](TASK-04-normalize-api-dotnet.md) | Normalize `api-dotnet` to the v1 contract | 02 | Done |
| [TASK-05](TASK-05-normalize-api-nodejs.md) | Normalize `api-nodejs` to the v1 contract | 02 | Done |
| [TASK-06](TASK-06-conformance-test-suite.md) | Cross-backend conformance test suite | 02 | Done |
| [TASK-07](TASK-07-frontend-capability-driven-engines.md) | Frontend: capability-driven engines + Python | 02, 03, 04, 05 | Done |
| [TASK-08](TASK-08-cicd-and-docs.md) | CI/CD workflows and documentation | 01, 03–07 | Done |

## Execution order

```mermaid
graph LR
  T01[TASK-01<br/>retire ui-angular]
  T02[TASK-02<br/>canonical contract]
  T03[TASK-03<br/>api-python]
  T04[TASK-04<br/>normalize dotnet]
  T05[TASK-05<br/>normalize nodejs]
  T06[TASK-06<br/>conformance suite]
  T07[TASK-07<br/>frontend]
  T08[TASK-08<br/>CI/CD + docs]

  T02 --> T03 --> T07
  T02 --> T04 --> T07
  T02 --> T05 --> T07
  T02 --> T06
  T07 --> T08
  T06 --> T08
  T01 --> T08
```

**Wave 1** — TASK-01 and TASK-02 (independent, parallel)
**Wave 2** — TASK-03, TASK-04, TASK-05, TASK-06 (parallel; disjoint file sets)
**Wave 3** — TASK-07
**Wave 4** — TASK-08

## File ownership

Each task owns a disjoint set of paths so parallel execution cannot conflict.

| Task | Owns |
|---|---|
| TASK-01 | `docs/design/ui-angular.md` (delete), `CLAUDE.md`, `docs/design/ui-vuejs.md`, `api-dotnet/Controllers/*.cs` (XML comments only), `docs/open-api/api-dotnet/` |
| TASK-02 | `docs/open-api/regex-tester-api.v1.yaml`, `docs/design/api-contract.md` |
| TASK-03 | `api-python/**` |
| TASK-04 | `api-dotnet/**`, `docs/open-api/api-dotnet/` |
| TASK-05 | `api-nodejs/**` |
| TASK-06 | `tests/contract/**` |
| TASK-07 | `ui-vuejs/**` |
| TASK-08 | `.github/workflows/**`, `docs/design/*.md`, `CLAUDE.md`, task/plan status fields |

TASK-01 and TASK-04 both touch `api-dotnet/` and the generated OpenAPI JSON, so they run in **different
waves**. TASK-01 changes only XML doc comment prose; TASK-04 regenerates the OpenAPI JSON afterwards.
