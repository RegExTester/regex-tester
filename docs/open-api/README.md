# OpenAPI documents

| File | Status | Description |
|---|---|---|
| [regex-tester-api.v1.yaml](regex-tester-api.v1.yaml) | **Canonical, hand-maintained** | Engine-agnostic OpenAPI 3.1.1 contract. This is the source of truth for the v1 API — the conformance suite in [tests/contract](../../tests/contract) validates every response against it. |
| [api-dotnet.v1.json](api-dotnet.v1.json) | Generated | Live document exported from api-dotnet's `GET /openapi/v1.json`. |
| [api-nodejs.v1.json](api-nodejs.v1.json) | Generated | Live document exported from api-nodejs's `GET /openapi/v1.json`. |
| [api-python.v1.json](api-python.v1.json) | Generated | Live document exported from api-python's `GET /openapi/v1.json`. |

## Regenerating the per-backend documents

The three `*.v1.json` files are **not** hand-edited. Each is a snapshot of the document a running
backend serves at `GET /openapi/v1.json`, exported and pretty-printed. Regenerate them whenever a
backend's controllers/routes/schemas change.

Start each backend (from the repository root, PowerShell):

```powershell
# .NET — http://localhost:5000
Set-Location api-dotnet; $env:ASPNETCORE_URLS='http://localhost:5000'; $env:ASPNETCORE_ENVIRONMENT='Development'; dotnet run --no-launch-profile

# Node.js — http://localhost:5100
Set-Location api-nodejs; node src/index.js

# Python — http://localhost:5200
Set-Location api-python; .\.venv\Scripts\python.exe -m uvicorn src.main:app --port 5200
```

Then, with the backend running, export its document (run from the repository root):

```powershell
node -e "fetch('http://localhost:5000/openapi/v1.json').then(r=>r.json()).then(o=>require('fs').writeFileSync('docs/open-api/api-dotnet.v1.json', JSON.stringify(o,null,2)+'\n'))"
node -e "fetch('http://localhost:5100/openapi/v1.json').then(r=>r.json()).then(o=>require('fs').writeFileSync('docs/open-api/api-nodejs.v1.json', JSON.stringify(o,null,2)+'\n'))"
node -e "fetch('http://localhost:5200/openapi/v1.json').then(r=>r.json()).then(o=>require('fs').writeFileSync('docs/open-api/api-python.v1.json', JSON.stringify(o,null,2)+'\n'))"
```

`ConvertTo-Json` is deliberately avoided here — it mangles deeply nested OpenAPI documents (arrays
of objects get truncated by its default `-Depth`). Node's `JSON.stringify` has no such limit.

Each generated document must declare exactly the paths `/`, `/api/capabilities` and `/api/regex`.
Verify with:

```powershell
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('docs/open-api/api-dotnet.v1.json','utf8')).paths))"
```

Remember to stop each backend afterwards so its port is free for the next one.
