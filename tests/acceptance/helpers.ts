import { vi } from "vitest";

export const API = "http://tasks-api.test:9000";

export type Task = { id: string; title: string; due_date: string | null };

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fetch stub that never answers and rejects when its signal aborts. */
export function hangingFetch(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
}

export function stubFetch(impl: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => impl(String(input), init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

export function callsTo(mock: ReturnType<typeof vi.fn>, method: string, pathEnd: string) {
  return mock.mock.calls.filter(([url, init]) => {
    const u = String(url);
    return ((init as RequestInit | undefined)?.method ?? "GET") === method && u.endsWith(pathEnd);
  });
}
