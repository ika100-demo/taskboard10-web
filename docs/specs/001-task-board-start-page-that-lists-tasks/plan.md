---
spec_id: 001-task-board-start-page-that-lists-tasks
shape: web-nextjs
spec_hash: 7cc810b8a0f9
summary: Server-rendered task board on / with an add form posting through the web app's POST /api/tasks to the task API
tasks:
  - id: t1
    title: Task model, title rules and server-side task API client
    files: [app/_lib/tasks.ts, app/_lib/tasks-api.ts, docs/env-vars.md, tests/tasks.test.ts, tests/tasks-api.test.ts]
    covers: [AC-001.1, AC-001.3, AC-001.4, AC-001.5, AC-001.6]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t5
    title: Smoke tests for the board (read-only and @writes)
    files: [e2e/smoke.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.5]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Task board client components (list, add form, board state)
    files: [app/_components/task-list.tsx, app/_components/add-task-form.tsx, app/_components/task-board.tsx, app/globals.css]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.6]
    parallel_safe: true
    depends_on: [t1]
  - id: t3
    title: Route handler POST /api/tasks forwarding to the task API
    files: [app/api/tasks/route.ts]
    covers: [AC-001.3, AC-001.6]
    parallel_safe: true
    depends_on: [t1]
  - id: t4
    title: Replace the landing page with the dynamic task board page
    files: [app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.5]
    parallel_safe: true
    depends_on: [t1, t2]
---

# Plan — 001 Task board start page that lists tasks and adds a task through the task API

Levels: t1, t5 → t2, t3 → t4. Interfaces, DOM and messages: [design.md](design.md). Acceptance tests live in `tests/acceptance/` and are not edited by any task.

## t1 — Task model, title rules and server-side task API client

**Files:** app/_lib/tasks.ts, app/_lib/tasks-api.ts, docs/env-vars.md, tests/tasks.test.ts, tests/tasks-api.test.ts
**Covers:** AC-001.1, AC-001.3, AC-001.4, AC-001.5, AC-001.6
**Goal:** Build the two modules every other task imports. `tasks.ts` holds the `Task` type, the shape guards, `validateTitle` and the message constants. `tasks-api.ts` is the only code that talks to the task API, with a 5 s timeout, strict response checks and structured error logs.

**Implementation notes:**
- Signatures and semantics exactly as in design.md "Contract": `isTask`, `isTaskList`, `validateTitle`, `MESSAGES`, `TITLE_MAX_LENGTH`, `tasksApiUrl`, `listTasks`, `createTask`, `TASKS_API_TIMEOUT_MS`.
- `tasks.ts` must not import anything server-only: the client form imports it.
- `tasksApiUrl()` reads `process.env.TASKS_API_URL` on every call (default `http://localhost:8080`, trailing `/` stripped).
- Every fetch uses `cache: "no-store"` and a `signal` from `AbortController` + `setTimeout(5000)` (not `AbortSignal.timeout`), and clears the timer in `finally`.
- `listTasks`: ok only for status 200 with a JSON body that passes `isTaskList`. `createTask`: `created` only for 201 with `isTask`; `invalid` for 422 with a JSON body; `failed` otherwise. Neither function throws.
- One `console.error(JSON.stringify({...}))` line per failure with `call`, `status` or `error` kind (`timeout` | `network` | `invalid_body`) and `duration_ms`. Never log bodies. No retries.
- `docs/env-vars.md`: add a "Backends" table with the row `TASKS_API_URL` | `http://localhost:8080` | base URL of taskboard10-api, server-side only (gitops sets it to `http://taskboard10-api`).
- Unit tests `tests/tasks.test.ts` and `tests/tasks-api.test.ts` cover every branch: each status, invalid JSON, wrong shape, network error, timeout under fake timers, and the log line.

**Done when:** `devbox run quality` and `devbox run test-fast` are clean, and the acceptance tests that need only these modules pass.

## t5 — Smoke tests for the board (read-only and @writes)

**Files:** e2e/smoke.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.5
**Goal:** Replace the template smoke test with two tests that check the deployed board through `SMOKE_BASE_URL` only.

**Implementation notes:**
- Keep `test.skip(!process.env.SMOKE_BASE_URL, ...)`.
- Read-only `@smoke`: `/` loads, the h1 "Task board" is visible, the "Add task" form is visible, and exactly one of these is visible: the list named "Tasks", the text "No tasks yet", or "Tasks could not be loaded. Try again later.".
- `@smoke @writes`: fill Title with `smoke-<crypto.randomUUID()>`, submit "Add task", and expect a list item with that title and "No due date" as the last item of the "Tasks" list, and an empty Title field. Then reload and expect the item to still be there, which proves it reached the API.
- Never change or delete data the test did not create.

**Done when:** `devbox run quality` is clean. The tests run against dev after the deploy (`devbox run smoke`).

## t2 — Task board client components (list, add form, board state)

**Files:** app/_components/task-list.tsx, app/_components/add-task-form.tsx, app/_components/task-board.tsx, app/globals.css
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.6
**Goal:** The interactive board. It renders the load error, "No tasks yet" or the ordered list, and offers the add form, which validates locally, posts to `/api/tasks` and appends the created task without a reload.

**Implementation notes:**
- DOM, labels, ids, roles and the submit sequence exactly as in design.md "Components" (`<ol aria-label="Tasks">`, labels "Title" / "Due date", button "Add task", `#task-title-error`, `role="alert"` for the load and save errors).
- `due_date` is rendered as the API's string, or `MESSAGES.noDueDate` when it is null. Never construct a `Date`.
- The form sends `{"title": <as typed>, "due_date": <date value or null>}`. The browser timeout is 8 s via `AbortController` + `setTimeout`. The button is disabled while the request is pending.
- No `required` or `maxLength` attributes on the inputs.
- After a load error the alert stays, and tasks created in this session are listed below it (design.md decision).
- `globals.css`: list, form and field-message styles that use only the existing design tokens. No horizontal overflow at 375 px.

**Done when:** `devbox run quality` is clean, and the component-level acceptance tests pass: form behaviour for AC-001.3, AC-001.4 and AC-001.6, and list rendering for AC-001.1 and AC-001.2.

## t3 — Route handler POST /api/tasks forwarding to the task API

**Files:** app/api/tasks/route.ts
**Covers:** AC-001.3, AC-001.6
**Goal:** The web app's own write endpoint. It forwards the raw request body to `createTask` and maps the result to 201 / 422 / 502 as in design.md.

**Implementation notes:**
- `export const dynamic = "force-dynamic"`, and only `POST` is exported.
- `const result = await createTask(await request.text())`. Then `created` → `NextResponse.json(task, { status: 201 })`, `invalid` → `NextResponse.json(body, { status: 422 })`, `failed` → `NextResponse.json({ detail: "Task could not be saved" }, { status: 502 })`.
- No validation, trimming or retries here. Logging happens in `tasks-api.ts`.

**Done when:** `devbox run quality` is clean, and the route acceptance tests pass: AC-001.3 (the API receives the exact body at `${TASKS_API_URL}/tasks`) and AC-001.6 (503 / other status / timeout → 502).

## t4 — Replace the landing page with the dynamic task board page

**Files:** app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.5
**Goal:** Make `/` the board. It is rendered on every request from `listTasks()`, with the h1 "Task board" and `TaskBoard`. The template landing content goes.

**Implementation notes:**
- `export const dynamic = "force-dynamic"`. `HomePage` is an async Server Component as in design.md: `<h1>Task board</h1>` + `<TaskBoard initialTasks={r.ok ? r.tasks : []} loadFailed={!r.ok} />`.
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx`. Nothing else uses them, and unused files under `app/` lower coverage.
- Delete `tests/page.test.tsx`: it tests the removed landing content, and the acceptance tests cover the page.
- `e2e/home.spec.ts`: expect the h1 "Task board" instead of "taskboard10-web". Drop the "Check health" link assertion but keep the `/api/health` request check. Keep the landmarks, 404 and 375 px tests. Locally no task API runs, so the page shows the load error, which these tests accept.
- Leave `app/layout.tsx` (title, header nav to the probes) unchanged.

**Done when:** `devbox run ci` is green (coverage at least 80 %), and the page acceptance tests for AC-001.1, AC-001.2 and AC-001.5 pass, including the `cache: "no-store"` fetch on every render and the 5 s timeout.
