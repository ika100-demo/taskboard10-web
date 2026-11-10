import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/tasks/route";

import { API, callsTo, hangingFetch, json, stubFetch } from "./helpers";

function req(body: string) {
  return new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  process.env.TASKS_API_URL = `${API}/`;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.TASKS_API_URL;
});

describe("AC-001.3 POST /api/tasks forwards to the task API", () => {
  it("AC-001.3 forwards the body unchanged to POST /tasks and returns 201 with the task", async () => {
    const created = { id: "n1", title: "Buy milk", due_date: "2026-12-01" };
    const mock = stubFetch(() => json(201, created));
    const body = '{"title": "Buy milk", "due_date": "2026-12-01"}';
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    const posts = callsTo(mock, "POST", "/tasks");
    expect(posts).toHaveLength(1);
    expect(String(posts[0][0])).toBe(`${API}/tasks`);
    expect(JSON.parse(String((posts[0][1] as RequestInit).body))).toEqual({ title: "Buy milk", due_date: "2026-12-01" });
    expect((posts[0][1] as RequestInit).body).toBe(body);
  });

  it("AC-001.3 forwards a null due date", async () => {
    const mock = stubFetch(() => json(201, { id: "n2", title: "Buy milk", due_date: null }));
    const res = await POST(req('{"title":"Buy milk","due_date":null}'));
    expect(res.status).toBe(201);
    expect(JSON.parse(String((callsTo(mock, "POST", "/tasks")[0][1] as RequestInit).body))).toEqual({
      title: "Buy milk",
      due_date: null,
    });
  });

  it("AC-001.3 passes a 422 from the API through unchanged", async () => {
    const detail = { detail: [{ loc: ["body", "title"], msg: "too short", type: "x" }] };
    stubFetch(() => json(422, detail));
    const res = await POST(req('{"title":"","due_date":null}'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(detail);
  });
});

describe("AC-001.6 POST /api/tasks when the task API fails", () => {
  async function expect502() {
    const res = await POST(req('{"title":"Buy milk","due_date":null}'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Task could not be saved" });
  }

  it("AC-001.6 answers 502 when the API answers 503", async () => {
    stubFetch(() => json(503, { detail: "down" }));
    await expect502();
  });

  it("AC-001.6 answers 502 when the API answers 500", async () => {
    stubFetch(() => json(500, {}));
    await expect502();
  });

  it("AC-001.6 answers 502 when the API answers 200 instead of 201", async () => {
    stubFetch(() => json(200, { id: "1", title: "Buy milk", due_date: null }));
    await expect502();
  });

  it("AC-001.6 answers 502 when 201 carries a body that is not a task", async () => {
    stubFetch(() => json(201, { nope: true }));
    await expect502();
  });

  it("AC-001.6 answers 502 on a connection error", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect502();
  });

  it("AC-001.6 answers 502 when there is no answer within 5 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(hangingFetch()));
    const pending = POST(req('{"title":"Buy milk","due_date":null}'));
    await vi.advanceTimersByTimeAsync(5000);
    const res = await pending;
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Task could not be saved" });
  });
});
