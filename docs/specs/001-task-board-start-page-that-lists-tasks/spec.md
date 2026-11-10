---
spec_id: 001-task-board-start-page-that-lists-tasks
title: Task board start page that lists tasks and adds a task through the task API
status: approved
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard10-gitops:001-persistent-tasks-and-web-task-board
---

# 001 — Task board start page that lists tasks and adds a task through the task API

## Problem

The taskboard10 task API keeps tasks in its own memory: every restart or redeploy loses all tasks, and each running instance of the API keeps its own separate list, so two calls can disagree about which tasks exist. People also have no way to use the board except by calling the API by hand, because the taskboard10 web front end does not show or create tasks yet. Until tasks survive a restart and can be seen and added in a browser, the system cannot be used or demonstrated by anyone but a developer.

## System context

Slice of the system plan `001-persistent-tasks-and-web-task-board` in `ika100-demo/taskboard10-gitops` for `taskboard10-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.1** Given tasks "A" and then "B" were created, when every running instance of the task API is restarted or replaced by a new version, then `GET /tasks` and the web board both still show "A" before "B", each with the same `id`, `title` and `due_date` as before the restart.
- **AC-001.3** Given tasks exist, when a person opens the web board's start page, then it lists every task, oldest first, each showing its title and its due date as `YYYY-MM-DD`, or the text "No due date" when it has none.
- **AC-001.4** Given no task exists, when a person opens the web board's start page, then it shows the text "No tasks yet" and the form to add a task.
- **AC-001.5** Given the web board is open, when a person enters the title "Buy milk", picks the due date 2026-12-01 (or leaves it empty) and submits the form, then the task appears at the end of the list without a manual page reload, the form is emptied, and `GET /tasks` on the task API returns the same task.
- **AC-001.6** Given the web board is open, when a person submits the form with an empty or whitespace-only title, or a title longer than 200 characters, then the board shows a message next to the title field ("Enter a title" or "Title must be at most 200 characters"), keeps the entered values, and no task is created.
- **AC-001.7** Given the database is unreachable, when a client sends `GET /tasks` or `POST /tasks`, then the task API answers 503 with a `detail` saying the task store is unavailable, and when a person opens the web board, then it shows "Tasks could not be loaded. Try again later." instead of an empty list.
- **AC-001.8** Given the web board is open and the task API or its database becomes unreachable, when a person submits a valid task, then the board shows "Task could not be saved. Try again." and keeps the entered title and due date in the form.

### Contract

No authentication anywhere (spec Non-goals). Bodies are `application/json; charset=utf-8`. The task model and the
two task endpoints are those of taskboard10-api spec 001, unchanged; this spec adds the 503 answer and the web
app's own route.

### Task (the shape every endpoint returns)

| Field | Type | Notes |
|---|---|---|
| `id` | string | uuid4 assigned by the API; unique; never chosen by a client |
| `title` | string | trimmed, 1 to 200 characters |
| `due_date` | string `YYYY-MM-DD` or `null` | always present, never omitted |

### Task API (`taskboard10-api`, in-cluster `http://taskboard10-api`, from the web app `TASKS_API_URL`)

`GET /tasks`

- `200`: JSON array of Task, every stored task, creation order, oldest first. No cap, no pagination, no query parameters. Empty store: `[]`.
- `503`: `{"detail": "Task store is unavailable"}` when the database cannot be reached, a connection cannot be had within 2 s, or the query does not finish within 2 s.

`POST /tasks`

- Request: `{"title": "<string>", "due_date": "YYYY-MM-DD" | null}`; `due_date` may be omitted (= `null`); unknown fields are ignored.
- `201`: the created Task. It is committed to the database before the response is sent, so any instance's next `GET /tasks` contains it.
- `422`: FastAPI's default validation body `{"detail": [{"loc": ["body", "title" | "due_date"], "msg": "...", "type": "...", "input": ...}]}` for the spec-001 rules (title missing, not a string, empty after trimming, over 200 characters; due_date not a real `YYYY-MM-DD` date). Nothing is stored.
- `503`: `{"detail": "Task store is unavailable"}` as for `GET`; nothing is stored. Validation runs first: an invalid body gets 422 even when the database is down.

`GET /health` and `GET /ready` answer 200 whether or not the database is reachable (unchanged).

Database wiring: the API reads `DATABASE_URL` (set by the gitops `uses: postgres`; `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER`, `PGPASSWORD` are set too). Without `DATABASE_URL` the service starts and answers 503 on both task endpoints.

### Web board (`taskboard10-web`, exposed as `taskboard10-web.taskboard10-dev.localhost` in dev)

`GET /` (the board, server-rendered on every request)

- Calls `GET {TASKS_API_URL}/tasks` once per page load, uncached.
- 200 with tasks: an ordered list, one item per task in API order; each item shows the title and either the due date string `YYYY-MM-DD` or `No due date`.
- 200 with `[]`: the text `No tasks yet`.
- Anything else (see Errors): the text `Tasks could not be loaded. Try again later.`, no list and no `No tasks yet`.
- The add form is shown in all three cases: a text field labelled "Title", a date field (`<input type="date">`) labelled "Due date" and a submit button "Add task".

`POST /api/tasks` (the web app's own route handler, called only by the board's form)

- Request: `{"title": "<string>", "due_date": "YYYY-MM-DD" | null}` as typed by the person (the API trims).
- Forwards the body to `POST {TASKS_API_URL}/tasks` and answers:
  - `201` with the API's Task body when the API answered 201;
  - `422` with the API's body when the API answered 422;
  - `502` with `{"detail": "Task could not be saved"}` for every other outcome (API 503, other status, invalid body, connection error, timeout).

Board behaviour in the browser

- Before sending, the form trims the title: empty → `Enter a title`; more than 200 characters → `Title must be at most 200 characters`, shown next to the title field; nothing is sent and the fields keep their values. The message disappears on the next successful submit.
- On `201`: the returned Task is appended to the end of the list (replacing `No tasks yet`), both fields are cleared, no reload.
- On `422` from the route: the title message from the local rules is shown when `loc` names `title`; otherwise it is handled like a `502`.
- On `502`, any other status, or no route answer within 8 s: `Task could not be saved. Try again.` near the form, fields keep their values, list unchanged. The message is cleared on the next submit.
- The submit button is disabled while a request is in flight, so one click creates at most one task.

### Errors

- **Format.** The task API answers errors as `{"detail": <string>}` (503) or FastAPI's `{"detail": [<validation entries>]}` (422). The web route `/api/tasks` answers errors as `{"detail": <string>}` (502) or passes the API's 422 body through. A person never sees a raw error body: only the messages above.
- **Unlisted responses.** A caller treats any status the contract does not list for that call, a non-JSON body, or a body not matching Task / array of Task, as the other side being unavailable: the board's page load shows `Tasks could not be loaded. Try again later.`, the web route answers 502, the form shows `Task could not be saved. Try again.`. Nobody parses error text to decide; status codes decide.
- **No retries.** The web app does not retry: `POST` is not idempotent (a retry after a timeout could create a duplicate), and a failed page load is repeated by the person reloading. The API does not retry a failed database call within a request; it answers 503.
- **Logging.** The API logs a database failure once per request at `error` with the exception type (never `DATABASE_URL` or the password). The web app logs a failed API call at `error` with the call, status or error kind and duration.

### Timeouts

| Call | Timeout | When the other side is down or slow |
|---|---|---|
| task API → Postgres: get a pooled connection / connect | 2 s (`connect_timeout=2`, pool wait 2 s) | 503 `Task store is unavailable` |
| task API → Postgres: one statement | 2 s (`statement_timeout`) | 503; a `POST` whose insert did not commit stores nothing |
| task API overall, database down | answers within 3 s | 503 |
| web server → `GET {TASKS_API_URL}/tasks` (page render) | 5 s | page shows `Tasks could not be loaded. Try again later.` |
| web server → `POST {TASKS_API_URL}/tasks` (route `/api/tasks`) | 5 s | route answers 502; form shows `Task could not be saved. Try again.` |
| browser → web `POST /api/tasks` | 8 s | form shows `Task could not be saved. Try again.`, fields kept |

The timeouts nest (2 s < 3 s < 5 s < 8 s), so an unreachable database reaches the person as the spec's message and
not as a timeout one layer up. After the database comes back, the API's next request reconnects without a restart.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASKS_API_URL=http://taskboard10-api`

### Notes for this repo

The page fetches the API on the server only: TASKS_API_URL (server-side env, no NEXT_PUBLIC_, default
http://localhost:8080 for local dev); the browser never calls the task API directly, so no CORS. Render `/`
dynamically (no static generation, `cache: "no-store"`). The add form is a client component posting to the web
app's own route handler `POST /api/tasks` (see Contract), which forwards to the API. Show due_date as the string
the API returned; never parse it into a Date (time zones shift the day). Replace the template's landing content
on `/`; keep /api/health, /api/ready and /api/metrics. Document TASKS_API_URL in docs/env-vars.md. Keep a
read-only smoke test (the board loads and shows a list, "No tasks yet" or the load error) and a @writes one
that adds a `smoke-<uuid>` task in dev.

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given `GET /tasks` of the task API returns tasks, when a person opens the start page `/`, then it lists every task in the order the API returned (oldest first), each showing its `title` and its `due_date` exactly as `YYYY-MM-DD`, or the text "No due date" when `due_date` is null; the page asks the API on every load (no cached list), so tasks that exist after an API restart or were created elsewhere appear on the next load (system AC-001.1, AC-001.3)
- **AC-001.2** Given `GET /tasks` returns `[]`, when a person opens the start page, then it shows the text "No tasks yet" and the add form with a title field, a date field and a submit button (system AC-001.4)
- **AC-001.3** Given the board is open, when a person enters the title "Buy milk", picks the due date 2026-12-01 (or leaves the date empty) and submits, then `POST /tasks` reaches the task API with `{"title": "Buy milk", "due_date": "2026-12-01"}` (or `"due_date": null`), the task the API returned appears at the end of the list without a page reload, "No tasks yet" is gone, and both form fields are empty (system AC-001.5)
- **AC-001.4** Given the board is open, when a person submits an empty or whitespace-only title, then "Enter a title" is shown next to the title field; when the title is longer than 200 characters after trimming, then "Title must be at most 200 characters" is shown there; in both cases the entered title and date stay in the form and no request reaches `POST /tasks` (system AC-001.6)
- **AC-001.5** Given `GET /tasks` answers 503, any status other than 200, a body that is not a JSON array of tasks, or no answer within 5 seconds, when a person opens the start page, then it shows "Tasks could not be loaded. Try again later." instead of the list and instead of "No tasks yet" (system AC-001.7)
- **AC-001.6** Given `POST /tasks` answers 503, any status other than 201 and 422, or no answer within 5 seconds, when a person submits a valid task, then the board shows "Task could not be saved. Try again.", the entered title and due date stay in the form, and the list is unchanged (system AC-001.8)

## Non-goals

## Assumptions

<!-- Spec 149: decisions taken by default, approved with the spec. One bullet each: - **A1** <the decision> (other option: <…>; affects AC-…). A revised one is struck through (~~…~~), never deleted. -->

## Open questions

<!-- Only what may not be decided by default (spec 149): security or access, money, destroying or migrating data, or a request too ambiguous to build. Approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

## Changelog

- 2026-11-10 created from the system plan, with its criteria (spec 147)
- 2026-11-10 approved
