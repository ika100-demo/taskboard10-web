import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTask, listTasks, tasksApiUrl, TASKS_API_TIMEOUT_MS } from "@/app/_lib/tasks-api";

const task = { id: "1", title: "a", due_date: null };

function res(status: number, body: string): Response {
  return new Response(body, { status });
}

let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.TASKS_API_URL = "http://api.test/";
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.TASKS_API_URL;
});

function lastLog(): Record<string, unknown> {
  expect(errSpy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(errSpy.mock.calls[0][0]));
}

describe("tasksApiUrl", () => {
  it("strips the trailing slash and reads env per call", () => {
    expect(tasksApiUrl()).toBe("http://api.test");
    process.env.TASKS_API_URL = "http://other";
    expect(tasksApiUrl()).toBe("http://other");
  });
  it("defaults to localhost:8080", () => {
    delete process.env.TASKS_API_URL;
    expect(tasksApiUrl()).toBe("http://localhost:8080");
  });
});

describe("listTasks", () => {
  it("returns tasks on 200 and calls the API correctly", async () => {
    const mock = vi.fn(async () => res(200, JSON.stringify([task])));
    vi.stubGlobal("fetch", mock);
    expect(await listTasks()).toEqual({ ok: true, tasks: [task] });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/tasks");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(errSpy).not.toHaveBeenCalled();
  });
  it("fails on non-200 status and logs it", async () => {
    vi.stubGlobal("fetch", async () => res(500, "boom secret"));
    expect(await listTasks()).toEqual({ ok: false });
    const log = lastLog();
    expect(log).toMatchObject({ level: "error", msg: "task API call failed", call: "GET /tasks", status: 500 });
    expect(typeof log.duration_ms).toBe("number");
    expect(JSON.stringify(log)).not.toContain("secret");
  });
  it("fails on invalid JSON", async () => {
    vi.stubGlobal("fetch", async () => res(200, "not json"));
    expect(await listTasks()).toEqual({ ok: false });
    expect(lastLog()).toMatchObject({ status: 200, error: "invalid_body" });
  });
  it("fails on wrong shape", async () => {
    vi.stubGlobal("fetch", async () => res(200, JSON.stringify([{ id: 1 }])));
    expect(await listTasks()).toEqual({ ok: false });
    expect(lastLog()).toMatchObject({ error: "invalid_body" });
  });
  it("fails on network error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await listTasks()).toEqual({ ok: false });
    expect(lastLog()).toMatchObject({ call: "GET /tasks", error: "network" });
  });
  it("times out after 5 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_u: unknown, init: RequestInit) =>
        new Promise((_r, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const p = listTasks();
    await vi.advanceTimersByTimeAsync(TASKS_API_TIMEOUT_MS);
    expect(await p).toEqual({ ok: false });
    expect(lastLog()).toMatchObject({ error: "timeout" });
  });
});

describe("createTask", () => {
  it("returns created on 201 and forwards the raw body", async () => {
    const mock = vi.fn(async () => res(201, JSON.stringify(task)));
    vi.stubGlobal("fetch", mock);
    expect(await createTask('{"title":"a"}')).toEqual({ kind: "created", task });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/tasks");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"title":"a"}');
    expect(init.cache).toBe("no-store");
  });
  it("fails on 201 with wrong body or invalid JSON", async () => {
    vi.stubGlobal("fetch", async () => res(201, JSON.stringify({ id: 1 })));
    expect(await createTask("{}")).toEqual({ kind: "failed" });
    expect(lastLog()).toMatchObject({ status: 201, error: "invalid_body" });
  });
  it("fails on 201 with invalid JSON", async () => {
    vi.stubGlobal("fetch", async () => res(201, "nope"));
    expect(await createTask("{}")).toEqual({ kind: "failed" });
  });
  it("returns invalid on 422 with JSON body", async () => {
    vi.stubGlobal("fetch", async () => res(422, JSON.stringify({ detail: "x" })));
    expect(await createTask("{}")).toEqual({ kind: "invalid", body: { detail: "x" } });
    expect(errSpy).not.toHaveBeenCalled();
  });
  it("fails on 422 with non-JSON body", async () => {
    vi.stubGlobal("fetch", async () => res(422, "nope"));
    expect(await createTask("{}")).toEqual({ kind: "failed" });
    expect(lastLog()).toMatchObject({ status: 422, error: "invalid_body" });
  });
  it("fails on other statuses", async () => {
    vi.stubGlobal("fetch", async () => res(500, ""));
    expect(await createTask("{}")).toEqual({ kind: "failed" });
    expect(lastLog()).toMatchObject({ call: "POST /tasks", status: 500 });
  });
  it("fails on network error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await createTask("{}")).toEqual({ kind: "failed" });
    expect(lastLog()).toMatchObject({ error: "network" });
  });
  it("times out after 5 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_u: unknown, init: RequestInit) =>
        new Promise((_r, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const p = createTask("{}");
    await vi.advanceTimersByTimeAsync(TASKS_API_TIMEOUT_MS);
    expect(await p).toEqual({ kind: "failed" });
    expect(lastLog()).toMatchObject({ error: "timeout" });
  });
});
