import { NextResponse } from "next/server";

import { createTask } from "@/app/_lib/tasks-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const result = await createTask(await request.text());
  switch (result.kind) {
    case "created":
      return NextResponse.json(result.task, { status: 201 });
    case "invalid":
      return NextResponse.json(result.body, { status: 422 });
    case "failed":
      return NextResponse.json(
        { detail: "Task could not be saved" },
        { status: 502 },
      );
  }
}
