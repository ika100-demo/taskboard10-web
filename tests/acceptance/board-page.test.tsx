import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

import { API, hangingFetch, json, stubFetch } from "./helpers";

const FAILED = "Tasks could not be loaded. Try again later.";

beforeEach(() => {
  process.env.TASKS_API_URL = API;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.TASKS_API_URL;
});

describe("AC-001.1 the start page lists the tasks", () => {
  it("AC-001.1 lists every task in API order with title and due date or 'No due date'", async () => {
    stubFetch(() =>
      json(200, [
        { id: "1", title: "First", due_date: "2026-12-01" },
        { id: "2", title: "Second", due_date: null },
        { id: "3", title: "Third", due_date: "2027-01-31" },
      ]),
    );
    render(await HomePage());
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First");
    expect(items[0]).toHaveTextContent("2026-12-01");
    expect(items[1]).toHaveTextContent("Second");
    expect(items[1]).toHaveTextContent("No due date");
    expect(items[2]).toHaveTextContent("Third");
    expect(items[2]).toHaveTextContent("2027-01-31");
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.1 asks GET /tasks of TASKS_API_URL with no-store on every load", async () => {
    const mock = stubFetch(() => json(200, [{ id: "1", title: "A", due_date: null }]));
    render(await HomePage());
    render(await HomePage());
    expect(mock).toHaveBeenCalledTimes(2);
    for (const [url, init] of mock.mock.calls) {
      expect(String(url)).toBe(`${API}/tasks`);
      expect((init as RequestInit).method).toBe("GET");
      expect((init as RequestInit).cache).toBe("no-store");
    }
  });

  it("AC-001.1 shows tasks that appeared between two loads", async () => {
    let tasks: { id: string; title: string; due_date: string | null }[] = [
      { id: "1", title: "Old one", due_date: null },
    ];
    stubFetch(() => json(200, tasks));
    const first = render(await HomePage());
    expect(screen.getByText("Old one")).toBeInTheDocument();
    first.unmount();
    tasks = [...tasks, { id: "2", title: "Created elsewhere", due_date: "2026-05-05" }];
    render(await HomePage());
    expect(screen.getByText("Created elsewhere")).toBeInTheDocument();
  });
});

describe("AC-001.2 empty board", () => {
  it("AC-001.2 shows 'No tasks yet' and the add form", async () => {
    stubFetch(() => json(200, []));
    render(await HomePage());
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Add task" });
    expect(within(form).getByLabelText("Title")).toBeInTheDocument();
    expect(within(form).getByLabelText("Due date")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Add task" })).toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });
});

describe("AC-001.5 the task API fails on load", () => {
  async function expectFailureShown() {
    render(await HomePage());
    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
  }

  it("AC-001.5 shows the message on 503", async () => {
    stubFetch(() => json(503, { detail: "down" }));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message on another non-200 status", async () => {
    stubFetch(() => json(500, []));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message on 201 with a valid list", async () => {
    stubFetch(() => json(201, []));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message when the body is not an array", async () => {
    stubFetch(() => json(200, { tasks: [] }));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message when the array holds non-tasks", async () => {
    stubFetch(() => json(200, [{ id: "1", title: "ok", due_date: null }, { nope: true }]));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message when a due date is not YYYY-MM-DD", async () => {
    stubFetch(() => json(200, [{ id: "1", title: "x", due_date: "01.12.2026" }]));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message when the body is not JSON", async () => {
    stubFetch(() => new Response("<html>oops</html>", { status: 200 }));
    await expectFailureShown();
  });

  it("AC-001.5 shows the message on a connection error", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expectFailureShown();
  });

  it("AC-001.5 shows the message when there is no answer within 5 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(hangingFetch()));
    const pending = HomePage();
    await vi.advanceTimersByTimeAsync(5000);
    render(await pending);
    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.5 still shows the add form when loading failed", async () => {
    stubFetch(() => json(503, {}));
    render(await HomePage());
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
  });
});
