import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

import { callsTo, hangingFetch, json } from "./helpers";

const SAVE_FAILED = "Task could not be saved. Try again.";

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** GET /tasks (page load) answers `initial`; every POST goes to `onPost`. */
async function openBoard(initial: unknown[], onPost: Handler) {
  process.env.TASKS_API_URL = "http://tasks-api.test:9000";
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET" && url.endsWith("/tasks")) return json(200, initial);
    return onPost(url, init);
  });
  vi.stubGlobal("fetch", mock);
  render(await HomePage());
  mock.mockClear();
  return mock;
}

function form() {
  return screen.getByRole("form", { name: "Add task" });
}
function fill(title: string, date = "") {
  fireEvent.change(within(form()).getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(within(form()).getByLabelText("Due date"), { target: { value: date } });
}
function submit() {
  fireEvent.click(within(form()).getByRole("button", { name: "Add task" }));
}
function posts(mock: ReturnType<typeof vi.fn>) {
  return callsTo(mock, "POST", "/tasks");
}
function postedBody(mock: ReturnType<typeof vi.fn>) {
  return JSON.parse(String((posts(mock)[0][1] as RequestInit).body));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.TASKS_API_URL;
});

describe("AC-001.3 adding a task", () => {
  it("AC-001.3 posts title and due date, appends the returned task, clears the form", async () => {
    const mock = await openBoard([], () => json(201, { id: "n1", title: "Buy milk", due_date: "2026-12-01" }));
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    fill("Buy milk", "2026-12-01");
    submit();
    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(postedBody(mock)).toEqual({ title: "Buy milk", due_date: "2026-12-01" });
    expect(within(list).getByText("Buy milk")).toBeInTheDocument();
    expect(within(list).getByText(/2026-12-01/)).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(within(form()).getByLabelText("Title")).toHaveValue("");
    expect(within(form()).getByLabelText("Due date")).toHaveValue("");
  });

  it("AC-001.3 sends due_date null when the date is empty and appends at the end", async () => {
    const mock = await openBoard([{ id: "1", title: "Existing", due_date: null }], () =>
      json(201, { id: "n2", title: "Buy milk", due_date: null }),
    );
    fill("Buy milk");
    submit();
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(2));
    expect(postedBody(mock)).toEqual({ title: "Buy milk", due_date: null });
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Existing");
    expect(items[1]).toHaveTextContent("Buy milk");
    expect(items[1]).toHaveTextContent("No due date");
  });
});

describe("AC-001.4 title validation", () => {
  it.each([
    ["empty", ""],
    ["whitespace-only", "    "],
  ])("AC-001.4 shows 'Enter a title' for an %s title and sends nothing", async (_n, title) => {
    const mock = await openBoard([], () => json(201, { id: "x", title: "x", due_date: null }));
    fill(title, "2026-12-01");
    submit();
    expect(await screen.findByText("Enter a title")).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(0);
    expect(within(form()).getByLabelText("Title")).toHaveValue(title);
    expect(within(form()).getByLabelText("Due date")).toHaveValue("2026-12-01");
  });

  it("AC-001.4 shows the length message above 200 characters after trimming and sends nothing", async () => {
    const mock = await openBoard([], () => json(201, { id: "x", title: "x", due_date: null }));
    const long = "a".repeat(201);
    fill(`  ${long}  `, "2026-12-01");
    submit();
    expect(await screen.findByText("Title must be at most 200 characters")).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(0);
    expect(within(form()).getByLabelText("Title")).toHaveValue(`  ${long}  `);
    expect(within(form()).getByLabelText("Due date")).toHaveValue("2026-12-01");
  });

  it("AC-001.4 accepts exactly 200 characters", async () => {
    const mock = await openBoard([], () => json(201, { id: "x", title: "a".repeat(200), due_date: null }));
    fill("a".repeat(200));
    submit();
    await waitFor(() => expect(posts(mock)).toHaveLength(1));
    expect(screen.queryByText("Title must be at most 200 characters")).not.toBeInTheDocument();
  });

  it("AC-001.4 links the message to the title field", async () => {
    await openBoard([], () => json(201, { id: "x", title: "x", due_date: null }));
    fill("   ");
    submit();
    const message = await screen.findByText("Enter a title");
    const input = within(form()).getByLabelText("Title");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
  });
});

describe("AC-001.6 saving fails", () => {
  async function expectSaveFailure(mock: ReturnType<typeof vi.fn>) {
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(1);
    expect(within(form()).getByLabelText("Title")).toHaveValue("Buy milk");
    expect(within(form()).getByLabelText("Due date")).toHaveValue("2026-12-01");
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Existing");
  }
  const existing = [{ id: "1", title: "Existing", due_date: null }];

  it("AC-001.6 shows the message on 503", async () => {
    const mock = await openBoard(existing, () => json(503, { detail: "down" }));
    fill("Buy milk", "2026-12-01");
    submit();
    await expectSaveFailure(mock);
  });

  it("AC-001.6 shows the message on another status such as 500", async () => {
    const mock = await openBoard(existing, () => json(500, {}));
    fill("Buy milk", "2026-12-01");
    submit();
    await expectSaveFailure(mock);
  });

  it("AC-001.6 shows the message on a network error", async () => {
    const mock = await openBoard(existing, () => {
      throw new TypeError("network");
    });
    fill("Buy milk", "2026-12-01");
    submit();
    await expectSaveFailure(mock);
  });

  it("AC-001.6 shows the message when 201 carries a body that is not a task", async () => {
    const mock = await openBoard(existing, () => json(201, { nope: 1 }));
    fill("Buy milk", "2026-12-01");
    submit();
    await expectSaveFailure(mock);
  });

  it("AC-001.6 shows the message when there is no answer within 8 seconds", async () => {
    const mock = await openBoard(existing, () => new Response(null));
    mock.mockImplementation(hangingFetch() as never);
    vi.useFakeTimers();
    fill("Buy milk", "2026-12-01");
    submit();
    await vi.advanceTimersByTimeAsync(8000);
    vi.useRealTimers();
    await expectSaveFailure(mock);
  });
});
