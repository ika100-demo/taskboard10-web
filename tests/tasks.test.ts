import { describe, expect, it } from "vitest";

import { isTask, isTaskList, MESSAGES, validateTitle } from "@/app/_lib/tasks";

describe("isTask", () => {
  it("accepts a task with or without due date", () => {
    expect(isTask({ id: "1", title: "a", due_date: null })).toBe(true);
    expect(isTask({ id: "1", title: "a", due_date: "2026-12-01" })).toBe(true);
  });
  it("rejects wrong shapes", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask("x")).toBe(false);
    expect(isTask([])).toBe(false);
    expect(isTask({ id: 1, title: "a", due_date: null })).toBe(false);
    expect(isTask({ id: "1", title: 2, due_date: null })).toBe(false);
    expect(isTask({ id: "1", title: "a" })).toBe(false);
    expect(isTask({ id: "1", title: "a", due_date: "12/01/2026" })).toBe(false);
    expect(isTask({ id: "1", title: "a", due_date: 5 })).toBe(false);
  });
});

describe("isTaskList", () => {
  it("accepts lists of tasks", () => {
    expect(isTaskList([])).toBe(true);
    expect(isTaskList([{ id: "1", title: "a", due_date: null }])).toBe(true);
  });
  it("rejects non-lists and bad items", () => {
    expect(isTaskList({})).toBe(false);
    expect(isTaskList([{ id: "1" }])).toBe(false);
  });
});

describe("validateTitle", () => {
  it("rejects empty and blank", () => {
    expect(validateTitle("")).toBe(MESSAGES.titleEmpty);
    expect(validateTitle("   ")).toBe(MESSAGES.titleEmpty);
  });
  it("rejects over 200 after trim, accepts exactly 200", () => {
    expect(validateTitle("a".repeat(201))).toBe(MESSAGES.titleTooLong);
    expect(validateTitle("a".repeat(200))).toBeNull();
    expect(validateTitle(` ${"a".repeat(200)} `)).toBeNull();
  });
  it("accepts a normal title", () => {
    expect(validateTitle("Buy milk")).toBeNull();
  });
});
