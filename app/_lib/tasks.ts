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

export function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return false;
  return o.due_date === null || (typeof o.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.due_date));
}

export function isTaskList(v: unknown): v is Task[] {
  return Array.isArray(v) && v.every(isTask);
}

export function validateTitle(raw: string): string | null {
  const title = raw.trim();
  if (title === "") return MESSAGES.titleEmpty;
  if (title.length > TITLE_MAX_LENGTH) return MESSAGES.titleTooLong;
  return null;
}
