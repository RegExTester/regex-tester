# TASK-31 — Documentation: api-java on Javalin

| | |
|---|---|
| **Phase** | 24 |
| **Depends on** | TASK-30 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-08-30-api-java-javalin.md](../plan/2026-08-30-api-java-javalin.md) |
| **Status** | Done |

## Context

TASK-30 replaced Spring Boot with Javalin. Every document that names the framework, lists the file
layout, or explains *how* a contract rule is enforced in api-java is now wrong. The contract itself
did not change, so nothing describing behaviour needs touching — only the mechanism.

## Decisions

### D1 — Correct the mechanism, never the behaviour

The 5 s timeout, the 413-before-400 ordering, the never-`*` CORS rule, the 15 s mid-match
preemption and the option registry all still hold. Only the sentences explaining *how* change:
`@Size` → explicit length checks, `AsyncRequestTimeoutException` → `Future.get`, `CorsFilter` →
`before` handler, `MaxBodySizeFilter` → `maxRequestSize` + error mapper, springdoc → the
javalin-openapi annotation processor.

Resist rewriting anything that merely *mentions* Java. A sentence that was correct about behaviour
is still correct.

### D2 — Plan and task records are history; do not rewrite them

`docs/plan/2026-07-25-add-java-backend.md`, `TASK-15`, `TASK-26` and `TASK-27` describe decisions
that were true when made. They stay as they are. TASK-15's choice of Spring Boot was not a mistake —
it was superseded, which is what the new plan and TASK-30 record.

Only `docs/tasks/README.md` changes, because it is an index of current state, not a record.

### D3 — Document the two Javalin-specific hazards

Both cost real debugging time in TASK-30 and would cost it again:

1. **`HttpResponseException` must be rethrown** out of the `bodyAsClass` catch, or Javalin's 413
   surfaces as a 400.
2. **slf4j-simple defaults to `System.err`**, which App Service classifies as errors; the fix is
   `simplelogger.properties`.

A future contributor touching this file will otherwise reintroduce both.

### D4 — Record what the OpenAPI snapshot lost

`docs/open-api/README.md` gains a note that `maxLength` is now emitted as a JSON string in
`api-java.v1.json`, because `@OpenApiStringValidation` takes a `String`. Someone will notice the
difference between engines and needs to find the explanation without re-deriving it.

## Deliverables

| File | Change |
|---|---|
| `api-java/ARCHITECTURE.md` | §1 stack, §2 layout, §3 pipeline (new mermaid), §5 request timeout, §6 400/413, §7 telemetry lifecycle. New §8 on the two hazards. |
| `docs/design/api-java.md` | §1, §2, §3, §4 (OpenAPI routes), §7, §8, §9, §10, §11, §12 comparison row. |
| `CLAUDE.md` | api-java stack row, commands block, key-files list, `add-engine`/`update-be` parity. |
| `README.md` | api-java stack row. |
| `ARCHITECTURE.md` (root) | Diagram node; any Spring-specific cross-engine note. |
| `docs/design/api-python.md` | One cell in the OpenAPI-generation comparison row. |
| `docs/open-api/README.md` | Note the `maxLength`-as-string quirk (D4). |
| `.github/skills/add-engine/references/repo-map.md` | api-java stack row + key-files. |
| `.github/skills/update-be/references/repo-map.md` | Same. |
| `api-java/.gitignore` | Header comment naming Spring Boot. |
| `DEPLOYMENT.md` | §12 cold-start paragraph (see below). |
| `docs/tasks/README.md` | Register TASK-30 and TASK-31: status table, mermaid graph, wave list, file-ownership table. |

## Out of scope

- Any code change (TASK-30 owns those).
- Rewriting historical plan/task documents (D2).

`DEPLOYMENT.md` was expected to be out of scope — the artifact, App Service plan, startup command and
app settings are all unchanged — but §12 claimed api-java "has the heaviest baseline of the four
(2.1 s)" as the justification for a plan upgrade. TASK-30 invalidated that, so the paragraph was
corrected.

## Acceptance criteria

- [x] No document outside `docs/plan/` and `docs/tasks/TASK-{15,26,27}` describes api-java as a
      Spring Boot application.
- [x] A repo-wide grep for `Spring Boot|springdoc|spring-boot|application.properties|MaxBodySizeFilter|CorsConfig|ApiExceptionHandler|Tomcat`
      across `*.md` returns only historical records and sentences that deliberately describe the
      replacement.
- [x] All 18 file paths listed in the updated layouts exist on disk.
- [x] `docs/tasks/README.md` registers both tasks in all five places it tracks them (source plans,
      status table, mermaid graph, wave list, file-ownership table).

## Incidental corrections

Two paragraphs in `api-java/ARCHITECTURE.md` §7 were left stale by TASK-28 and are now removed:

- A description of a hand-rolled `AccountEndpoint=...;AccountKey=...` parser — that code was deleted
  when telemetry moved to Entra ID, and the paragraph directly contradicted the Entra ID paragraph
  three lines above it.
- A claim that the database and container are "created (if missing) with 400 RU/s" — the Data
  Contributor role cannot create either; they are provisioned out of band.
