// Playwright callback against the fixture-only preview. Native selections are recorded only.
async (page, base = "http://127.0.0.1:18796") => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const board = await (await page.request.get(`${base}/api/board`)).json();
  const titles = new Map();
  const visit = card => { titles.set(card.session_id, card.title); card.children.forEach(visit); };
  Object.values(board.columns).forEach(column => column.cards.forEach(visit));
  const detailRoute = async route => {
    const response = await route.fetch(), detail = await response.json();
    const id = decodeURIComponent(route.request().url().split("/").at(-1));
    await route.fulfill({ response, json: { ...detail, session_id: id, title: titles.get(id) } });
  };
  await page.route("**/api/session/*", detailRoute);
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/sessions`);
    await page.evaluate(() => { localStorage.removeItem("kliprun.sessionWorkspace"); localStorage.removeItem("kliprun-bun.read-idle.v1"); });
    await page.reload();
    const sidebar = page.getByRole("complementary", { name: "Session views", exact: true });
    const handle = page.getByRole("separator", { name: "Resize session sidebar", exact: true });
    await handle.waitFor();
    const before = await sidebar.boundingBox(), drag = await handle.boundingBox();
    await page.mouse.move(drag.x + drag.width / 2, drag.y + 100); await page.mouse.down();
    await page.mouse.move(drag.x + drag.width / 2 + 100, drag.y + 100, { steps: 8 }); await page.mouse.up();
    const after = await sidebar.boundingBox();
    check(Math.abs(after.width - before.width - 100) <= 2, "Sidebar drag did not track pointer distance");
    await page.reload(); await handle.waitFor();
    check(Math.abs((await sidebar.boundingBox()).width - after.width) <= 2, "Sidebar width was not restored");
    await handle.focus(); await handle.press("ArrowLeft");
    check(Math.abs((await sidebar.boundingBox()).width - after.width + 20) <= 2, "Sidebar keyboard resize failed");
    await page.evaluate(() => { window.__statusSelection = []; window.webkit.messageHandlers.sessionSelected.postMessage = id => window.__statusSelection.push(id); });
    const running = page.getByRole("button", { name: "Running sessions", exact: true });
    await running.hover();
    const runningList = page.getByRole("dialog", { name: "Running sessions", exact: true });
    await runningList.waitFor();
    check(await runningList.getByRole("button").count() === 3, "Running list omitted main agents or subagents");
    check(await runningList.getByText(/Subagent/).count() > 0, "Subagent is not identified");
    await runningList.getByRole("button", { name: "Open session: Run integration checks", exact: true }).click();
    check((await page.evaluate(() => window.__statusSelection.at(-1))) === "ses_demo_checks", "Footer opened the wrong running session");
    check(page.url().endsWith("/sessions"), "Footer unnecessarily left Sessions");
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await page.getByRole("button", { name: "Unread sessions", exact: true }).hover();
    const unreadList = page.getByRole("dialog", { name: "Unread sessions", exact: true });
    await unreadList.waitFor();
    check(await unreadList.getByRole("button").count() === 2, "Unread list does not match its count");
    await unreadList.getByRole("button", { name: "Open session: Draft release notes", exact: true }).click();
    check((await page.getByTestId("unread-count").innerText()).trim() === "1", "Opening an unread session did not mark it read");
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await page.getByRole("button", { name: "build sessions", exact: true }).hover();
    const buildList = page.getByRole("dialog", { name: "build sessions", exact: true }); await buildList.waitFor();
    check(await buildList.getByRole("button").count() === 1, "Agent badge list includes other agents");
    await page.mouse.move(700, 200);
    await buildList.waitFor({ state: "hidden" });
    for (const width of [1440, 900, 500]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("button", { name: "Running sessions", exact: true }).hover();
      const list = page.getByRole("dialog", { name: "Running sessions", exact: true }); await list.waitFor();
      const box = await list.boundingBox();
      check(box.x >= 0 && box.x + box.width <= width, `Status popup clipped at ${width}`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Workspace overflows at ${width}`);
      await page.mouse.move(width - 15, 200);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Running sessions", exact: true }).hover();
    await page.getByRole("dialog", { name: "Running sessions", exact: true }).waitFor();
    await page.screenshot({ path: "/private/tmp/kliprun-workspace-controls.png" });
    return { resize: true, savedWidth: true, keyboardResize: true, runningAndUnreadLists: true, agentLists: true, selectionAndReadState: true, layouts: 3 };
  } finally { await page.unroute("**/api/session/*", detailRoute); }
}
