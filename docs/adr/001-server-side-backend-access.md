# ADR-001: The browser talks only to the web app; the web server calls backend APIs

## Status

Accepted (spec 001-task-board-start-page-that-lists-tasks).

## Context

The board reads and writes tasks held by `taskboard10-api`, which is reachable in-cluster only (`http://taskboard10-api`) and has no authentication and no CORS setup. Further features (edit, delete, filters) will need the same API. Two ways exist to reach it: the browser calls the API directly (needs a public API host, CORS, a `NEXT_PUBLIC_*` URL baked into the image per environment), or the web server calls it and the browser only talks to the web app.

## Decision

- Backend APIs are called **only from the server**: Server Components for reads, the web app's own Route Handlers under `app/api/` for writes (backend-for-frontend). The browser never sees a backend URL.
- Each backend base URL is a server-side env var (`TASKS_API_URL`, never `NEXT_PUBLIC_*`), read at call time, with a localhost default for local development.
- All calls to one backend live in one module under `app/_lib/` (`app/_lib/tasks-api.ts` for the task API). It owns timeouts, response validation and error logging, and returns typed result unions instead of throwing; pages and route handlers decide only on the result kind.
- Any response a contract does not list (status, non-JSON, wrong shape), a connection error or a timeout counts as "backend unavailable". Status codes decide, error text is never parsed. The web app never retries.
- `/api/ready` does not check backends, so a down API does not take the web pods out of rotation. The page shows its own error message instead.

## Consequences

- No CORS, no public API exposure, one image for every environment (the URL comes from gitops `env`).
- Every write needs a thin Route Handler that passes the backend's result through, a small amount of duplication per endpoint.
- Tests stub the global `fetch` and set the env var per test, because the URL is read on every call and no HTTP client library sits in between.
