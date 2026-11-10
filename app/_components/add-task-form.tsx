"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { isTask, MESSAGES, validateTitle } from "@/app/_lib/tasks";
import type { Task } from "@/app/_lib/tasks";

export type AddTaskFormProps = { onCreated: (task: Task) => void };

const TIMEOUT_MS = 8000;

function hasTitleError(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const detail = (body as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return false;
  return detail.some((entry: unknown) => {
    const loc = typeof entry === "object" && entry !== null ? (entry as { loc?: unknown }).loc : undefined;
    return Array.isArray(loc) && loc[1] === "title";
  });
}

export function AddTaskForm({ onCreated }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleMessage, setTitleMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTitleMessage(null);
    setSaveMessage(null);
    const invalid = validateTitle(title);
    if (invalid) {
      setTitleMessage(invalid);
      return;
    }
    setPending(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, due_date: dueDate || null }),
        signal: controller.signal,
      });
      const body: unknown = await res.json().catch(() => null);
      if (res.status === 201 && isTask(body)) {
        onCreated(body);
        setTitle("");
        setDueDate("");
      } else if (res.status === 422 && hasTitleError(body)) {
        setTitleMessage(validateTitle(title) ?? MESSAGES.saveFailed);
      } else {
        setSaveMessage(MESSAGES.saveFailed);
      }
    } catch {
      setSaveMessage(MESSAGES.saveFailed);
    } finally {
      clearTimeout(timer);
      setPending(false);
    }
  }

  return (
    <form aria-label="Add task" className="task-form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input
          type="text"
          id="task-title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleMessage ? "true" : undefined}
          aria-describedby={titleMessage ? "task-title-error" : undefined}
        />
        {titleMessage ? (
          <p id="task-title-error" className="field-message">
            {titleMessage}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="task-due-date">Due date</label>
        <input
          type="date"
          id="task-due-date"
          name="due_date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        Add task
      </button>
      {saveMessage ? (
        <p role="alert" className="field-message">
          {saveMessage}
        </p>
      ) : null}
    </form>
  );
}
