import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

// Read-only, so it runs in every environment. A smoke test that creates or changes data also carries
// @writes in its title (or { tag: "@writes" }) and then runs only in dev (#474).

test("the task board page loads and shows its state @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Task board" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Add task" })).toBeVisible();

  const list = page.getByRole("list", { name: "Tasks" });
  const empty = page.getByText("No tasks yet");
  const failed = page.getByText("Tasks could not be loaded. Try again later.");
  await expect(list.or(empty).or(failed)).toHaveCount(1);
  await expect(list.or(empty).or(failed)).toBeVisible();
});

test("a task added on the board is listed and survives a reload @smoke @writes", async ({
  page,
}) => {
  const title = `smoke-${randomUUID()}`;
  await page.goto("/");

  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();

  const items = page.getByRole("list", { name: "Tasks" }).getByRole("listitem");
  await expect(items.last()).toContainText(title);
  await expect(items.last()).toContainText("No due date");
  await expect(page.getByLabel("Title")).toHaveValue("");

  await page.reload();
  const reloaded = page
    .getByRole("list", { name: "Tasks" })
    .getByRole("listitem")
    .filter({ hasText: title });
  await expect(reloaded).toHaveCount(1);
  await expect(reloaded).toContainText("No due date");
});
