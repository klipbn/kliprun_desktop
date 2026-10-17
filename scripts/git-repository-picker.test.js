// Run against the fixture-only preview. All repository data is fictional.
async (page) => {
  const context = await page.context().browser().newContext(); page = await context.newPage();
  const base = "http://127.0.0.1:18796", errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  try {
    await page.goto(`${base}/git`);
    const trigger = page.getByRole("button", { name: "Repository", exact: true });
    await trigger.waitFor({ timeout: 10000 });
    for (const size of [{ width: 1440, height: 900 }, { width: 500, height: 650 }, { width: 500, height: 300 }]) {
      await page.setViewportSize(size); await trigger.click();
      const search = page.getByRole("searchbox", { name: "Search repositories", exact: true });
      await search.fill("aurora");
      const option = page.getByRole("option");
      assert(await option.count() === 1, "Repository path search did not filter the list");
      assert(!await page.getByText("No matching repositories", { exact: true }).count(), "Single match is incorrectly marked empty");
      const box = await page.locator(".git-repository-picker .recent-filter-popup").boundingBox();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height, "Repository popup overflows the window");
      await search.press("Enter");
      assert(await trigger.getAttribute("title") === "/Users/demo/Projects/aurora", "Keyboard selection lost the repository path");
      assert(await trigger.evaluate(element => element === document.activeElement), "Selection did not restore focus");
      await trigger.click(); await search.fill("missing-repository");
      await page.getByText("No matching repositories", { exact: true }).waitFor();
      await search.press("ArrowDown"); await search.press("Enter"); await search.press("Escape");
      assert(await trigger.getAttribute("aria-expanded") === "false", "Escape did not close the menu");
    }
    assert(!errors.length, errors.join("; "));
    return { search: true, keyboard: true, boundedLayouts: 3 };
  } finally { await context.close(); }
}
