// Playwright callback against the fixture-only preview; never opens live repositories.
async (page) => {
  const base = "http://127.0.0.1:18796";
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/git`);
  await page.evaluate(() => localStorage.removeItem("kliprun.git.sidebar-width")); await page.reload();
  await page.locator(".git-sidebar").waitFor();
  const handle = page.getByRole("separator", { name: "Resize Git panel", exact: true });
  assert(await handle.count() === 1, "The Git panel has no resize handle");
  const sidebar = page.locator(".git-sidebar");
  const width = async () => (await sidebar.boundingBox()).width;
  async function drag(delta) {
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(80, box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, box.y + Math.min(80, box.height / 2), { steps: 10 });
    await page.mouse.up();
    assert(await page.locator(".git-diff-heading").evaluate(element => getComputedStyle(element).cursor) !== "col-resize", "Releasing the divider left the resize cursor active");
  }
  const original = await width();
  await drag(-140);
  assert(Math.abs(await width() - original - 140) < 2, "Left drag did not enlarge the Git panel by the pointer distance");
  await drag(80);
  assert(Math.abs(await width() - original - 60) < 2, "Dragging the moving divider accumulated distance");
  await drag(-1200); assert(Math.abs(await width() - 850) < 2, "Git panel exceeded its maximum width");
  await drag(1600); assert(Math.abs(await width() - 320) < 2, "Git panel collapsed below its minimum width");
  await handle.focus(); await handle.press("ArrowLeft");
  assert(Math.abs(await width() - 340) < 2, "Keyboard resizing did not enlarge the panel");
  await handle.press("ArrowRight"); assert(Math.abs(await width() - 320) < 2, "Keyboard resizing did not shrink the panel");
  await drag(-380); assert(Math.abs(await width() - 700) < 2, "Could not select a wider Git panel");
  await page.getByTestId("kanban-button").click(); await page.getByTestId("git-button").click();
  await sidebar.waitFor(); assert(Math.abs(await width() - 700) < 2, "Changing views lost the chosen Git panel width");
  await page.setViewportSize({ width: 900, height: 700 });
  assert(await width() <= 561, "Narrowing the window hid the diff area");
  await drag(60); assert(Math.abs(await width() - 500) < 2, "Resizing after a viewport clamp jumped to the old width");
  for (const smallWidth of [760, 500]) {
    await page.setViewportSize({ width: smallWidth, height: 700 });
    assert(!await handle.isVisible(), "The horizontal resize handle remained active in stacked layout");
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "Resized panel overflowed the small layout");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const restored = await page.evaluate(() => ({ width: document.querySelector(".git-sidebar").getBoundingClientRect().width,
    variable: document.querySelector(".git-layout").style.getPropertyValue("--git-sidebar-width"), saved: localStorage.getItem("kliprun.git.sidebar-width"), viewport: innerWidth }));
  assert(Math.abs(restored.width - 500) < 2, `Returning to a wide window lost the saved panel width: ${JSON.stringify(restored)}`);
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 80); await page.mouse.down();
  await handle.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.move(box.x - 60, box.y + 80); await page.mouse.up();
  assert(Math.abs(await width() - 500) < 2, "A canceled drag continued resizing the panel");
  return { drag: true, keyboard: true, limits: true, navigation: true, cancellation: true, layouts: 4 };
}
