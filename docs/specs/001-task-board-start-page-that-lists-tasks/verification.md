# Verification — 001 Task board start page that lists tasks and adds a task through the task API

**Result:** pass
**Commit:** 8f21a87 · **Base:** 074efaf · **Trace:** 6/6 criteria named by tests

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `tests/acceptance/board-page.test.tsx::AC-001.1 lists every task in API order with title and due date or 'No due date'`, `::AC-001.1 asks GET /tasks of TASKS_API_URL with no-store on every load`, `::AC-001.1 shows tasks that appeared between two loads` | `app/_components/task-list.tsx:8-14` (ordered list, `due_date ?? "No due date"`, string as returned), `app/page.tsx:4,7` (`force-dynamic`, one `listTasks()` per render), `app/_lib/tasks-api.ts:36-39` (`cache: "no-store"`) | Order of 3 items, exact date strings, null date, 2 loads = 2 fetches with `GET` + `no-store`, and new data on the second load are all asserted. |
| AC-001.2 | met | `tests/acceptance/board-page.test.tsx::AC-001.2 shows 'No tasks yet' and the add form` | `app/_components/task-board.tsx:23`, `app/_components/add-task-form.tsx:68-98` | Asserts the text, the form "Add task", the fields labelled Title and Due date, and the button. The test finds the date field by its label and does not check `type="date"`. The code has `type="date"` (`add-task-form.tsx:89`). |
| AC-001.3 | met | `tests/acceptance/add-task-form.test.tsx::AC-001.3 posts title and due date, appends the returned task, clears the form`, `::AC-001.3 sends due_date null when the date is empty and appends at the end`; `tests/acceptance/tasks-route.test.ts::AC-001.3 forwards the body unchanged to POST /tasks and returns 201 with the task`, `::AC-001.3 forwards a null due date` | `app/_components/add-task-form.tsx:43-53` (body `{title, due_date: dueDate \|\| null}`, `onCreated`, fields cleared), `app/_components/task-board.tsx:24` (append to the end), `app/api/tasks/route.ts:8-11` (raw body forwarded, 201), `app/_lib/tasks-api.ts:81-93` | The chain is proved in two steps. The form test checks the body it posts (with the date and with `null`), that the task is added at the end, that "No tasks yet" is gone, and that both fields are empty. The route test checks the URL `${API}/tasks`, the parsed body and the unchanged raw body. No page reload happens: `HomePage` renders once and the list grows from client state. |
| AC-001.4 | met | `tests/acceptance/add-task-form.test.tsx::AC-001.4 shows 'Enter a title' for an empty / whitespace-only title and sends nothing`, `::AC-001.4 shows the length message above 200 characters after trimming and sends nothing`, `::AC-001.4 accepts exactly 200 characters`, `::AC-001.4 links the message to the title field` | `app/_lib/tasks.ts:25-30` (trim, empty check, length > 200), `app/_components/add-task-form.tsx:34-38` (return before fetch), `:77-84` (`aria-invalid`, `aria-describedby`, `#task-title-error`) | Tests cover both messages, padded 201 characters (so the length is checked after trimming), the 200-character boundary, zero POSTs, the title and date kept, and the message linked next to the field. |
| AC-001.5 | met | `tests/acceptance/board-page.test.tsx::AC-001.5 shows the message on 503`, `::… another non-200 status`, `::… 201 with a valid list`, `::… body is not an array`, `::… array holds non-tasks`, `::… due date is not YYYY-MM-DD`, `::… body is not JSON`, `::… connection error`, `::… no answer within 5 seconds`, `::… still shows the add form when loading failed` | `app/_lib/tasks-api.ts:4,34` (5000 ms abort), `:57-75` (ok only for 200 + JSON + `isTaskList`), `app/_components/task-board.tsx:17-23` (alert, no list, no "No tasks yet") | Each case checks that the message is shown and that neither "No tasks yet" nor the list is. The 5 s case uses fake timers advanced by 5000 ms. |
| AC-001.6 | met | `tests/acceptance/tasks-route.test.ts::AC-001.6 answers 502 when the API answers 503 / 500 / 200 instead of 201 / 201 with a non-task / connection error / no answer within 5 seconds`; `tests/acceptance/add-task-form.test.tsx::AC-001.6 shows the message on 503 / another status such as 500 / network error / 201 with a non-task / no answer within 8 seconds` | `app/_lib/tasks-api.ts:86-104` (everything but 201-task / 422-JSON → `failed`), `app/api/tasks/route.ts:14-18` (502 `{"detail":"Task could not be saved"}`), `app/_components/add-task-form.tsx:11,41,56-60` (8 s abort, `saveFailed`, fields not cleared) | Each form case checks the message, one POST, title and date kept, and the list unchanged (still one item, "Existing"). |

## Non-goals

The spec lists no non-goals. Nothing outside the contract was added: no authentication, no retries (`tasks-api.ts`, `add-task-form.tsx`), and the browser never calls the task API (`add-task-form.tsx:43` posts to `/api/tasks`). Template-owned layout is unchanged: `app/layout.tsx` and the header, footer and navigation are not in the diff, and `app/globals.css` only appends a task-board block (lines 481-562) that uses the existing tokens. `/api/health`, `/api/ready` and `/api/metrics` are untouched. ✔

## Deviations from the plan

- `docs/adr/001-server-side-backend-access.md`, `docs/backlog.md` and `docs/specs/001-*/{spec,design,plan}.md` changed but are in no task's `files`. Acceptable: they are spec and plan artefacts. `design.md` links the ADR, and `cplat spec index` generates the backlog. The backlog row still says `approved` while the spec says `building`; the index refreshes it.
- `tests/acceptance/*` are in no task's `files`. Acceptable: these are the red-commit acceptance tests (4bc9ed6).
- Commit 52d4b71 changed `tests/acceptance/board-page.test.tsx:53-55` after the red commit. It only adds a type annotation (`let tasks: {…}[]`); no assertion, data or criterion id changed. Acceptable: the criterion is asserted as before. It is not a weakening.
- All five tasks (t1–t5) have `done: true`.

## Contract

Matches `design.md`: signatures and semantics of `tasks.ts`, `tasks-api.ts` (including the `AbortController` + `setTimeout` timeouts, the JSON error log line and no retries), the route's 201/422/502 mapping, `HomePage`, and the component DOM (`<ol aria-label="Tasks">`, labels, ids, `role="alert"`, disabled while pending, no `required`/`maxLength`). Minor and acceptable differences:
- The form also has `noValidate`, which is consistent with "browser validation never pre-empts the spec's messages".
- The save-failure `<p role="alert">` sits inside the `<form>` rather than beside it. It is still next to the form.
- `HomePage` has no explicit `Promise<JSX.Element>` return annotation; the inferred type is the same.

## Mutation check (report only)

Skipped: no mutation check for shape web-nextjs yet.
