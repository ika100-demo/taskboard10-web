import { MESSAGES } from "@/app/_lib/tasks";
import type { Task } from "@/app/_lib/tasks";

export type TaskListProps = { tasks: Task[] };

export function TaskList({ tasks }: TaskListProps) {
  return (
    <ol aria-label="Tasks" className="task-list">
      {tasks.map((task) => (
        <li key={task.id} className="task-item">
          <span className="task-title">{task.title}</span>
          <span className="task-due">{task.due_date ?? MESSAGES.noDueDate}</span>
        </li>
      ))}
    </ol>
  );
}
