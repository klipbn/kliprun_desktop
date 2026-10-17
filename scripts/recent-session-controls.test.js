// Playwright callback against fictional fixture data; never opens the user's session API.
async (page) => {
  const browser = await page.context().browser().browserType().launch({ headless: true });
  const context = await browser.newContext(); page = await context.newPage();
  page.setDefaultTimeout(5000);
  const base = "http://127.0.0.1:18796";
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], external = [];
  const projects = Array.from({ length: 240 }, (_, index) => `/Users/demo/Projects/${"long-parent-directory/".repeat(6)}workspace-${index}`);
  projects.push("/Users/demo/Projects/primary/shared", "/Users/demo/Projects/secondary/shared", "/Users/demo/Projects/Поиск/Проект");
  await page.route(`${base}/api/recent-sessions*`, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ json: { ...data, projects: [...data.projects, ...projects] } });
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base);
    const panel = page.getByRole("complementary", { name: "Recent sessions", exact: true });
    await panel.getByRole("searchbox", { name: "Search sessions", exact: true }).waitFor();
    const handle = panel.getByRole("separator", { name: "Resize recent sessions", exact: true });
    assert(await handle.count() === 1, "Recent Sessions has no resize handle");
    const width = async () => (await panel.boundingBox()).width;
    async function drag(delta) {
      const box = await handle.boundingBox(), x = box.x + box.width / 2, y = box.y + 80;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + delta, y, { steps: 10 }); await page.mouse.up();
      assert(await panel.getAttribute("data-resizing") !== "true", "The resize state remained active after release");
    }
    const original = await width();
    await drag(140); assert(Math.abs(await width() - original - 140) < 2, "Dragging right did not enlarge the sidebar by the pointer distance");
    await drag(-80); assert(Math.abs(await width() - original - 60) < 2, "Dragging the moving divider accumulated distance");
    await drag(1200); assert(Math.abs(await width() - 480) < 2, "Sidebar exceeded maximum width");
    await drag(-1200); assert(Math.abs(await width() - 176) < 2, "Sidebar fell below minimum width");
    await handle.focus(); await handle.press("ArrowRight");
    assert(Math.abs(await width() - 196) < 2, "Right arrow did not enlarge sidebar");
    await handle.press("ArrowLeft"); assert(Math.abs(await width() - 176) < 2, "Left arrow did not shrink sidebar");
    await drag(244); assert(Math.abs(await width() - 420) < 2, "Could not choose sidebar width");
    await panel.getByRole("button", { name: "Hide recent sessions", exact: true }).click();
    assert(Math.abs(await width() - 40) < 2 && !await handle.count(), "Collapsed sidebar retained its resize handle or width");
    await panel.getByRole("button", { name: "Show recent sessions", exact: true }).click();
    assert(Math.abs(await width() - 420) < 2, "Expanding lost the chosen width");
    await page.getByTestId("git-button").click(); await page.getByTestId("kanban-button").click();
    assert(Math.abs(await width() - 420) < 2, "Navigation lost the chosen width");
    await page.reload(); await handle.waitFor();
    assert(Math.abs(await width() - 420) < 2, "Reload lost the saved width");
    await page.setViewportSize({ width: 650, height: 700 });
    await page.waitForFunction(() => document.querySelector('[aria-label="Recent sessions"]').getBoundingClientRect().width <= 310);
    await drag(-20); assert(Math.abs(await width() - 290) < 2, "Dragging a viewport-clamped sidebar jumped to the saved width");
    for (const small of [500, 375]) {
      await page.setViewportSize({ width: small, height: 650 });
      await page.waitForFunction(() => document.querySelector('[aria-label="Recent sessions"]').getBoundingClientRect().width <= 176);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "Resized sidebar overflowed the small window");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.querySelector('[aria-label="Recent sessions"]').getBoundingClientRect().width === 290);
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 80); await page.mouse.down();
    await handle.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.move(box.x + 60, box.y + 80); await page.mouse.up();
    assert(Math.abs(await width() - 290) < 2 && await panel.getAttribute("data-resizing") !== "true", "Canceled drag continued resizing");
    await panel.getByRole("button", { name: "Filter sessions", exact: true }).click();
    const project = panel.getByRole("button", { name: "Session project", exact: true });
    assert(await project.count() === 1, "Project still uses an unbounded native dropdown");
    async function bounded() {
      const popup = page.locator(".recent-filter-popup"); await popup.waitFor();
      const a = await popup.boundingBox(), b = await panel.boundingBox();
      assert(a.x >= b.x && a.x + a.width <= b.x + b.width && a.y >= b.y && a.y + a.height <= b.y + b.height,
        `Filter escaped the sidebar: ${JSON.stringify({ popup: a, panel: b })}`);
      assert(!await popup.evaluate(element => element.scrollWidth > element.clientWidth), "Long project path overflowed its popup");
    }
    await project.click(); await bounded();
    const search = panel.getByRole("searchbox", { name: "Search projects", exact: true });
    assert(await search.evaluate(element => element === document.activeElement), "Project search did not receive focus");
    assert(await panel.getByRole("option").count() > 240, "Project filter dropped history entries");
    const list = panel.getByRole("listbox", { name: "Session project", exact: true });
    assert(await list.evaluate(element => element.scrollHeight > element.clientHeight), "Long project list is not scrollable");
    await search.fill("secondary shared");
    assert(await panel.getByRole("option").count() === 2, "Project search did not match full path and multiple words");
    await search.press("ArrowDown"); await search.press("Enter");
    assert(await project.getAttribute("title") === "/Users/demo/Projects/secondary/shared", "Keyboard search chose the wrong duplicate project name");
    assert(await project.evaluate(element => element === document.activeElement), "Choosing a project lost keyboard focus");
    await project.click(); await search.fill("пОиСк пРоЕкТ");
    assert(await panel.getByRole("option").count() === 2, "Project search failed for Cyrillic");
    await search.fill("missing-project");
    await panel.getByText("No matching projects", { exact: true }).waitFor();
    await search.press("Escape");
    assert(!await page.locator(".recent-filter-popup").count() && await project.evaluate(element => element === document.activeElement), "Escape did not dismiss and restore focus");
    for (const size of [{ width: 1440, height: 900 }, { width: 500, height: 650 }, { width: 500, height: 300 }]) {
      await page.setViewportSize(size);
      for (const label of ["Session agent", "Session project", "Updated period"]) {
        await panel.getByRole("button", { name: label, exact: true }).click(); await bounded();
        await page.keyboard.press("Escape");
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await project.click(); await search.fill("atlas");
    await panel.getByRole("option", { name: "All projects", exact: true }).click();
    assert(await project.getAttribute("title") === "All projects", "Could not reset project while searching");
    const agent = panel.getByRole("button", { name: "Session agent", exact: true });
    await agent.focus(); await agent.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    assert(await agent.getAttribute("title") === "Codex", "Agent keyboard selection failed");
    await project.click(); await panel.getByRole("searchbox", { name: "Search sessions", exact: true }).click();
    assert(!await page.locator(".recent-filter-popup").count(), "Outside click did not dismiss project filter");
    assert(!errors.length && !external.length, `Browser errors or external requests: ${errors.join("; ")}, ${external.length}`);
    return { drag: true, keyboard: true, savedWidth: true, viewportClamp: true, cancellation: true, boundedFilters: true, projects: projects.length, projectSearch: true };
  } finally { await browser.close(); }
}
