import { isTask, isTaskList } from "./tasks";
import type { Task } from "./tasks";

export const TASKS_API_TIMEOUT_MS = 5000;

export function tasksApiUrl(): string {
  return (process.env.TASKS_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };

export type CreateResult =
  | { kind: "created"; task: Task }
  | { kind: "invalid"; body: unknown }
  | { kind: "failed" };

type CallName = "GET /tasks" | "POST /tasks";
type Outcome = { response: Response } | { error: "timeout" | "network" };

function logFailure(call: CallName, started: number, extra: { status?: number; error?: string }): void {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "task API call failed",
      call,
      ...extra,
      duration_ms: Date.now() - started,
    }),
  );
}

async function call(init: RequestInit): Promise<Outcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TASKS_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${tasksApiUrl()}/tasks`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    return { response };
  } catch {
    return { error: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false };
  }
}

export async function listTasks(): Promise<ListResult> {
  const name: CallName = "GET /tasks";
  const started = Date.now();
  const outcome = await call({ method: "GET", headers: { accept: "application/json" } });
  if ("error" in outcome) {
    logFailure(name, started, { error: outcome.error });
    return { ok: false };
  }
  const { response } = outcome;
  if (response.status !== 200) {
    logFailure(name, started, { status: response.status });
    return { ok: false };
  }
  const parsed = await readJson(response);
  if (!parsed.ok || !isTaskList(parsed.body)) {
    logFailure(name, started, { status: response.status, error: "invalid_body" });
    return { ok: false };
  }
  return { ok: true, tasks: parsed.body };
}

export async function createTask(rawBody: string): Promise<CreateResult> {
  const name: CallName = "POST /tasks";
  const started = Date.now();
  const outcome = await call({
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: rawBody,
  });
  if ("error" in outcome) {
    logFailure(name, started, { error: outcome.error });
    return { kind: "failed" };
  }
  const { response } = outcome;
  if (response.status === 201) {
    const parsed = await readJson(response);
    if (parsed.ok && isTask(parsed.body)) return { kind: "created", task: parsed.body };
    logFailure(name, started, { status: response.status, error: "invalid_body" });
    return { kind: "failed" };
  }
  if (response.status === 422) {
    const parsed = await readJson(response);
    if (parsed.ok) return { kind: "invalid", body: parsed.body };
    logFailure(name, started, { status: response.status, error: "invalid_body" });
    return { kind: "failed" };
  }
  logFailure(name, started, { status: response.status });
  return { kind: "failed" };
}
