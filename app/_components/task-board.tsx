"use client";

import { useState } from "react";

import { AddTaskForm } from "@/app/_components/add-task-form";
import { TaskList } from "@/app/_components/task-list";
import { MESSAGES } from "@/app/_lib/tasks";
import type { Task } from "@/app/_lib/tasks";

export type TaskBoardProps = { initialTasks: Task[]; loadFailed: boolean };

export function TaskBoard({ initialTasks, loadFailed }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  return (
    <div className="task-board">
      {loadFailed ? (
        <p role="alert" className="field-message">
          {MESSAGES.loadFailed}
        </p>
      ) : null}
      {tasks.length > 0 ? <TaskList tasks={tasks} /> : null}
      {!loadFailed && tasks.length === 0 ? <p>{MESSAGES.noTasks}</p> : null}
      <AddTaskForm onCreated={(task) => setTasks((prev) => [...prev, task])} />
    </div>
  );
}
