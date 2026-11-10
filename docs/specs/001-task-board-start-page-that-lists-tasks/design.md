# Design — 001 Task board start page that lists tasks and adds a task through the task API

The system contract in `spec.md` (Task model, task API, web board, Errors, Timeouts) is binding and is not repeated here. This file fixes how the web app implements it and the module interfaces the acceptance tests target.

## Decisions

- **Backend-for-frontend.** The page reads tasks in a Server Component; the form posts to the app's own route `POST /api/tasks`, which forwards to the task API. The browser never calls the task API. ADR: [docs/adr/001-server-side-backend-access.md](../../adr/001-server-side-backend-access.md).
- **One API client module** `app/_lib/tasks-api.ts` returns result unions and never throws, so the page and the route only branch on `ok` / `kind` (AC-001.5, AC-001.6).
- **Shared validation** `app/_lib/tasks.ts` is plain TypeScript with no server imports, used by the form (title rules, AC-001.4) and by the API client (response shape checks, AC-001.5).
- **Timeouts use `AbortController` + `setTimeout`**, not `AbortSignal.timeout`, so tests can advance them with `vi.useFakeTimers()`. The `signal` is passed to `fetch`; on timeout the controller aborts and the fetch rejects.
- **The route forwards the request body as received** (`await request.text()`), unchanged. The API does the trimming and validation, and its 422 is passed through. The route adds no rules of its own.
- **`due_date` is rendered as the string the API returned**, never through `Date` (time zones shift the day).
- **The list lives in client state.** `TaskBoard` gets the server-loaded tasks as `initialTasks` and appends each created task. No `router.refresh()`, so there is no second API call and no reload (AC-001.3).
- **Load error plus a later add:** when the page load failed, the load error text stays. Tasks created in this session are listed below it, so the person sees that the add worked. The list stays partial until a reload succeeds.
- **Template landing content is removed**: `feature-card.tsx` and `icons.tsx` are deleted together, as `icons.tsx` asks. Unused files under `app/` would count against the 80 % coverage gate. Header, footer, layout, error and not-found pages stay. `/api/health`, `/api/ready`, `/api/metrics` are unchanged. `/api/ready` does not check the task API (ADR-001).

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/tasks.ts` | `Task` type, shape guards, title rules, user-facing message constants | new |
| `app/_lib/tasks-api.ts` | server-only client for `GET`/`POST {TASKS_API_URL}/tasks`: timeout, validation, error log | new |
| `app/api/tasks/route.ts` | `POST /api/tasks` → task API, maps to 201 / 422 / 502 | new |
| `app/page.tsx` | dynamic Server Component: loads tasks, renders heading and `TaskBoard` | changed (replaces landing) |
| `app/_components/task-board.tsx` | client: holds the list state, renders load error / empty text / list, and the form | new |
| `app/_components/task-list.tsx` | presentational ordered list of tasks | new |
| `app/_components/add-task-form.tsx` | client: the add form, local title rules, posts to `/api/tasks` | new |
| `app/globals.css` | styles for list, form, field messages (existing tokens only) | changed |
| `docs/env-vars.md` | documents `TASKS_API_URL` | changed |

## Contract (internal interfaces the acceptance tests target)

### `app/_lib/tasks.ts`

```ts
export type Task = { id: string; title: string; due_date: string | null };
export const TITLE_MAX_LENGTH = 200;
export const MESSAGES = {
  titleEmpty: "Enter a title",
  titleTooLong: "Title must be at most 200 characters",
  noTasks: "No tasks yet",
  noDueDate: "No due date",
  loadFailed: "Tasks could not be loaded. Try again later.",
  saveFailed: "Task could not be saved. Try again.",
} as const;
export function isTask(v: unknown): v is Task;        // id: string, title: string, due_date: null | /^\d{4}-\d{2}-\d{2}$/
export function isTaskList(v: unknown): v is Task[];  // Array.isArray && every isTask
export function validateTitle(raw: string): string | null; // trims; "" → titleEmpty; length > 200 → titleTooLong; else null
```

### `app/_lib/tasks-api.ts` (server only, import from Server Components and route handlers only)

```ts
export const TASKS_API_TIMEOUT_MS = 5000;
export function tasksApiUrl(): string;  // process.env.TASKS_API_URL ?? "http://localhost:8080", trailing "/" stripped, read on every call

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export function listTasks(): Promise<ListResult>;
//   fetch(`${tasksApiUrl()}/tasks`, { method: "GET", cache: "no-store", headers: { accept: "application/json" }, signal })
//   ok only for status 200 AND JSON body AND isTaskList(body); everything else (incl. reject/timeout) → { ok: false }

export type CreateResult =
  | { kind: "created"; task: Task }   // status 201 and isTask(body)
  | { kind: "invalid"; body: unknown } // status 422 and body parses as JSON
  | { kind: "failed" };                // anything else, connection error, timeout
export function createTask(rawBody: string): Promise<CreateResult>;
//   fetch(`${tasksApiUrl()}/tasks`, { method: "POST", cache: "no-store",
//          headers: { "content-type": "application/json", accept: "application/json" }, body: rawBody, signal })
```

Every non-ok outcome logs one line to `console.error`, a JSON string:
`{"level":"error","msg":"task API call failed","call":"GET /tasks"|"POST /tasks","status":<number>?,"error":"timeout"|"network"|"invalid_body"?,"duration_ms":<number>}`.
Request and response bodies are never logged. No retries.

### `POST /api/tasks` (`app/api/tasks/route.ts`)

```ts
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response>;
```

| `createTask` result | Response |
|---|---|
| `created` | `201`, the Task as JSON |
| `invalid` | `422`, the API's body unchanged |
| `failed` | `502`, `{"detail": "Task could not be saved"}` |

Bodies are `application/json`. Next.js answers 405 for other methods.

### `GET /` (`app/page.tsx`)

```ts
export const dynamic = "force-dynamic";
export default async function HomePage(): Promise<JSX.Element>;
//   const r = await listTasks();
//   <h1>Task board</h1>
//   <TaskBoard initialTasks={r.ok ? r.tasks : []} loadFailed={!r.ok} />
```

### Components (DOM the tests query)

- `TaskBoard({ initialTasks: Task[]; loadFailed: boolean })`, `"use client"`.
  - `loadFailed` → `<p role="alert">Tasks could not be loaded. Try again later.</p>`. No "No tasks yet" text, and no list unless tasks were added in this session.
  - not failed and the list is empty → `<p>No tasks yet</p>`.
  - list not empty → `TaskList`.
  - always `AddTaskForm onCreated={(t) => append t}`.
- `TaskList({ tasks: Task[] })` → `<ol aria-label="Tasks">`, one `<li>` per task in the given order, containing the title and then `due_date ?? "No due date"`. The `aria-label` keeps it distinct from the header's navigation list: query it with `getByRole("list", { name: "Tasks" })`.
- `AddTaskForm({ onCreated: (task: Task) => void })`, `"use client"`, `<form aria-label="Add task">` with controlled fields:
  - `<input type="text" id="task-title" name="title">` labelled **Title**. When there is a title message: `aria-invalid="true"`, `aria-describedby="task-title-error"`, and `<p id="task-title-error">` holds the message next to the field.
  - `<input type="date" id="task-due-date" name="due_date">` labelled **Due date**.
  - `<button type="submit">Add task</button>`, `disabled` while a request is in flight.
  - save failure: `<p role="alert">Task could not be saved. Try again.</p>` next to the form.
  - The form has no `required` or `maxLength` attributes, so browser validation never pre-empts the spec's messages (AC-001.4).

Submit sequence:

```
clear title message and save message
msg = validateTitle(title); if msg → show next to title, keep fields, return (no fetch)       AC-001.4
pending = true
POST /api/tasks  body JSON {"title": title (as typed), "due_date": dueDate || null}
                 signal aborts after 8000 ms (AbortController + setTimeout)
201 and isTask(body)                     → onCreated(body); title = ""; dueDate = ""          AC-001.3
422 and body.detail is an array with an entry whose loc[1] === "title"
                                         → show validateTitle(title) ?? saveFailed next to title
anything else / reject / timeout         → show saveFailed; keep fields; list unchanged        AC-001.6
pending = false
```

## Testing notes for the acceptance tests

- Vitest acceptance tests go in `tests/acceptance/` (picked up by `tests/**/*.test.{ts,tsx}`), one file per surface. Suggested: `board-page.test.tsx` (AC-001.1, .2, .5), `add-task-form.test.tsx` (AC-001.3, .4, .6 in the browser), `tasks-route.test.ts` (AC-001.3, .6 at the route). The plan's coders delete or rewrite `tests/page.test.tsx` and `e2e/home.spec.ts` and own `e2e/smoke.spec.ts`. Acceptance tests should not use those paths.
- Stub the task API with `vi.stubGlobal("fetch", ...)` and set `process.env.TASKS_API_URL` per test. The client reads both on every call.
- Render the page with `render(await HomePage())`.
- Call the route with `await POST(new Request("http://localhost/api/tasks", { method: "POST", body }))`. "Reaches the task API with …" (AC-001.3) is asserted on the stubbed fetch's URL, method and parsed JSON body.
- Timeouts (5 s server, 8 s browser): use fake timers and a fetch stub that rejects when its `signal` aborts.
- Playwright cannot intercept the server's fetch, so the error paths are covered in Vitest. The smoke tests (`e2e/smoke.spec.ts`) check the real deployment: a read-only one and a `@smoke @writes` one that adds `smoke-<uuid>`.
