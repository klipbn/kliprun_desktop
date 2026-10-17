// Playwright callback against the fixture-only preview; Git actions update in-memory responses only.
async (page) => {
  const context = await page.context().browser().newContext(); page = await context.newPage(); page.setDefaultTimeout(5000);
  const base = "http://127.0.0.1:18796";
  const fixture = await (await page.request.get(`${base}/api/git/status?directory=%2FUsers%2Fdemo%2FProjects%2Fatlas`)).json();
  const state = JSON.parse(JSON.stringify(fixture));
  state.files.find(file => file.path === "src/api/search.ts").index = "M";
  state.files.find(file => file.path === "src/api/search.ts").staged = { additions: 1, deletions: 0 };
  for (const path of ["a/zebra.txt", "z/alpha.txt"]) state.files.push({ path, index: " ", worktree: "M", staged: { additions: 0, deletions: 0 }, unstaged: { additions: 1, deletions: 0 } });
  const actions = [], errors = [], external = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); });
  await page.route(`${base}/api/git/status?*`, route => route.fulfill({ json: state }));
  await page.route(`${base}/api/git/action`, route => {
    const action = route.request().postDataJSON(); actions.push(action);
    state.files = state.files.map(file => action.paths?.includes(file.path) ? { ...file,
      index: action.action === "stage" ? "M" : " ", worktree: action.action === "stage" ? " " : "M" } : file);
    return route.fulfill({ json: { ok: true } });
  });
  const trigger = page.getByRole("button", { name: "Changes view settings", exact: true });
  const menu = page.getByRole("menu", { name: "Changes view settings", exact: true });
  const paths = async () => page.locator('#git-sidebar-panel .git-file-select').evaluateAll(buttons => buttons.map(button => button.title));
  async function choose(label) { await menu.getByRole("menuitemradio", { name: label, exact: true }).click(); }
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    await trigger.click(); await menu.waitFor();
    assert(await menu.getByRole("menuitemradio").count() === 7, "The display menu omits screenshot options");
    for (const label of ["List", "Path", "None"]) assert(await menu.getByRole("menuitemradio", { name: label, exact: true }).getAttribute("aria-checked") === "true", `Incorrect initial ${label} option`);
    assert(await page.locator(".git-file-group").count() === 0, "None grouping still shows group headings");
    const pathOrder = await paths();
    assert(pathOrder.indexOf("a/zebra.txt") < pathOrder.indexOf("z/alpha.txt"), "Path sorting is incorrect");
    await choose("Name"); const nameOrder = await paths();
    assert(nameOrder.indexOf("z/alpha.txt") < nameOrder.indexOf("a/zebra.txt"), "Name sorting did not update the visible files");
    await choose("Tracked & Untracked");
    assert(await page.locator('.git-file-group[aria-label="Tracked changes"]').count() === 1 && await page.locator('.git-file-group[aria-label="Untracked changes"]').count() === 1, "Tracked grouping is incorrect");
    await choose("Staged & Unstaged");
    assert(await page.locator('.git-file-group[aria-label="Staged changes"] .git-file-select').count() === 2, "The staged group lost a partially staged file");
    assert(await page.locator('.git-file-group[aria-label="Unstaged changes"] .git-file-select').count() === 5, "The unstaged group lost working or untracked files");
    await choose("Tree");
    assert(await page.locator(".git-tree details").count() > 0, "Tree view did not create folders");
    await choose("List"); await choose("None"); await menu.press("Escape");
    assert(await menu.count() === 0 && await trigger.evaluate(element => element === document.activeElement), "Escape did not dismiss the menu and restore focus");
    const partial = page.locator('.git-file-select[title="src/api/search.ts"]');
    assert(await partial.count() === 2, "Ungrouped view hid one side of a partially staged file");
    await partial.filter({ has: page.getByText("Unstaged", { exact: true }) }).click();
    await page.locator(".git-diff-heading .git-badge").getByText("Working tree", { exact: true }).waitFor();
    assert(await partial.filter({ has: page.getByText("Unstaged", { exact: true }) }).getAttribute("aria-pressed") === "true", "The working diff was not selected");
    await partial.filter({ has: page.getByText("Staged", { exact: true }) }).click();
    await page.locator(".git-diff-heading .git-badge").getByText("Staged", { exact: true }).waitFor();
    assert(actions.length === 0, "Display settings changed the Git repository");
    await page.getByRole("button", { name: "Stage src/api/search.ts", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.git-file-select[title="src/api/search.ts"]').length === 1);
    assert(actions.at(-1).action === "stage" && actions.at(-1).paths.join("|") === "src/api/search.ts", "The mixed list staged another file");
    await page.getByRole("button", { name: "Unstage src/api/search.ts", exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('[aria-label="Stage src/api/search.ts"]'));
    assert(actions.at(-1).action === "unstage", "The mixed list did not unstage the file");
    await trigger.click(); await choose("Tree"); await choose("Tracked & Untracked"); await menu.press("Escape");
    await page.getByTestId("kanban-button").click(); await page.getByTestId("git-button").click();
    await trigger.click();
    for (const label of ["Tree", "Name", "Tracked & Untracked"]) assert(await menu.getByRole("menuitemradio", { name: label, exact: true }).getAttribute("aria-checked") === "true", `Navigation lost ${label}`);
    await menu.getByRole("menuitemradio", { name: "List", exact: true }).focus(); await page.keyboard.press("ArrowDown");
    assert(await menu.getByRole("menuitemradio", { name: "Tree", exact: true }).evaluate(element => element === document.activeElement), "Arrow keys do not navigate the menu");
    await page.keyboard.press("End");
    assert(await menu.getByRole("menuitemradio", { name: "Staged & Unstaged", exact: true }).evaluate(element => element === document.activeElement), "End did not focus the last option");
    await page.keyboard.press("Home"); await page.keyboard.press("Enter");
    assert(await menu.getByRole("menuitemradio", { name: "List", exact: true }).getAttribute("aria-checked") === "true", "Home/Enter did not select List");
    await page.keyboard.press("Escape");
    for (const [width, height] of [[900, 600], [500, 700]]) {
      await page.setViewportSize({ width, height }); await trigger.click();
      const box = await menu.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `Changes menu overflows at ${width}×${height}`);
      await page.keyboard.press("Escape");
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "Changes settings overflow the window");
    }
    await page.setViewportSize({ width: 1440, height: 900 }); await trigger.click(); await page.locator(".git-diff-heading").click();
    assert(await menu.count() === 0, "Clicking outside did not dismiss the menu");
    assert(!errors.length && !external.length, `Browser errors or external requests: ${errors.join("; ")}, ${external.length}`);
    return { view: true, sorting: true, grouping: true, partialStaging: true, savedOptions: true, keyboard: true, layouts: 3 };
  } finally { await context.close(); }
}
