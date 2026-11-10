import { TaskBoard } from "@/app/_components/task-board";
import { listTasks } from "@/app/_lib/tasks-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <>
      <h1>Task board</h1>
      <TaskBoard initialTasks={result.ok ? result.tasks : []} loadFailed={!result.ok} />
    </>
  );
}
