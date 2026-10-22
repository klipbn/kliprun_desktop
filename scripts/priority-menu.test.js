// Playwright callback. Build the client and serve `bun docs/screenshots/preview.ts` first.
async (page, base = "http://127.0.0.1:18796") => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  const card = page.getByTestId("card-ses_demo_search");
  const trigger = card.getByTestId("card-priority").first();
  if (await trigger.evaluate(element => element.tagName.toLowerCase()) === "select") {
    throw new Error("Priority still uses the native select");
  }
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Priority for Implement search API", exact: true });
  await menu.waitFor();
  for (const name of ["Critical", "Medium", "Low", "Question", "Warning", "Urgent", "Blocked", "No priority"]) {
    await menu.getByRole("menuitemradio", { name, exact: true }).waitFor();
  }
  await menu.getByRole("menuitemradio", { name: "Urgent", exact: true }).click();
  if (await trigger.getAttribute("data-priority") !== "urgent") throw new Error("Urgent marker was not selected");
  if (await menu.count()) throw new Error("Priority menu stayed open after selection");
  await trigger.click();
  if (await menu.getByRole("menuitemradio", { name: "Urgent", exact: true }).getAttribute("aria-checked") !== "true") {
    throw new Error("Selected marker was not checked when reopening the menu");
  }
  await menu.getByRole("menuitemradio", { name: "No priority", exact: true }).click();
  if (await trigger.getAttribute("data-priority") !== "none") throw new Error("Priority marker was not cleared");
  return "Custom priority menu, all markers, selection, and clearing verified.";
}
