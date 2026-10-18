// Playwright callback against the fixture preview. Moves and ignore rules stay in memory.
async (page, base = "http://127.0.0.1:18796") => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [], actions = [];
  const contents = new Map([["src/search.py", "print('original')\n"]]);
  let rejectMove = false;
  let files = ["README.md", "src/search.py", "src/sub/note.md", "queries/projects.sql"];
  const routeFiles = route => route.fulfill({ json: { root: decodeURIComponent((route.request().url().match(/[?&]directory=([^&]*)/)?.[1] ?? "").replace(/\+/g, " ")), files, truncated: false } });
  const routeAction = async route => {
    const body = route.request().postDataJSON(); actions.push(body);
    if (body.action === "move") {
      if (rejectMove) return route.fulfill({ status: 409, json: { error: "A file or folder already exists at the destination." } });
      const moved = path => path === body.path || path.startsWith(`${body.path}/`) ? body.destination + path.slice(body.path.length) : path;
      files = files.map(moved);
      for (const [path, content] of [...contents]) { contents.delete(path); contents.set(moved(path), content); }
    }
    return route.fulfill({ json: body });
  };
  const routeFile = async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : await page.evaluate(url => Object.fromEntries(new URL(url).searchParams), route.request().url());
    if (body.content !== undefined) contents.set(body.path, body.content);
    return route.fulfill({ json: { root: body.directory, path: body.path, content: contents.get(body.path) ?? "# Fixture\n", revision: `fixture-${contents.get(body.path)?.length ?? 0}` } });
  };
  const onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await page.route("**/api/git/files?*", routeFiles);
  await page.route("**/api/git/file-action", routeAction);
  await page.route("**/api/git/file?*", routeFile); await page.route("**/api/git/file", routeFile);
  await page.addInitScript(() => {
    window.fileActions = [];
    localStorage.setItem("kliprun.git.changes-view", JSON.stringify({ view: "tree", sortBy: "path", groupBy: "staged" }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { window.copiedPath = value; } } });
  });
  const item = name => page.getByRole("treeitem", { name, exact: true });
  const openFile = path => item(`Open file ${path}`);
  const menu = () => page.getByRole("menu", { name: "File actions", exact: true });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    await page.evaluate(() => { window.webkit.messageHandlers.repositoryFile = { postMessage: value => window.fileActions.push(value) }; });
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("option").filter({ hasText: "atlas" }).click();
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await openFile("README.md").click({ button: "right" });
    await menu().getByRole("menuitem", { name: "Copy Path", exact: true }).click();
    check(await page.evaluate(() => window.fileActions.at(-1)?.action === "copy" && window.fileActions.at(-1).path.endsWith("/atlas/README.md")), "Copy Path lost the repository root");
    await item("src").click({ button: "right" });
    await menu().getByRole("menuitem", { name: "Copy Relative Path", exact: true }).click();
    check(await page.evaluate(() => window.fileActions.at(-1)?.action === "copy" && window.fileActions.at(-1).path === "src"), "Relative folder path is wrong");
    await item("src").click({ button: "right" });
    await menu().getByRole("menuitem", { name: "Reveal in Finder", exact: true }).click();
    check(await page.evaluate(() => window.fileActions.at(-1)?.action === "reveal" && window.fileActions.at(-1).path.endsWith("/atlas/src")), "Finder request lost its path");
    await openFile("README.md").click({ button: "right" });
    await menu().getByRole("menuitem", { name: "Open in Default App", exact: true }).click();
    check(await page.evaluate(() => window.fileActions.at(-1)?.action === "open"), "Default app request is missing");
    await item("src").focus(); await item("src").press("Shift+F10"); await menu().waitFor();
    await page.keyboard.press("Escape"); check(await item("src").evaluate(e => e === document.activeElement), "Escape did not restore tree focus");
    await openFile("src/search.py").click();
    const source = () => page.locator('[role="textbox"][aria-label="Edit src/search.py"]:visible');
    await source().press("ControlOrMeta+End"); await page.keyboard.insertText("# keep this draft");
    await item("src").dragTo(item("queries"));
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    check(actions.length === 0 && (await source().innerText()).includes("keep this draft"), "Cancelling a folder move lost edits or moved it anyway");
    await item("src").dragTo(item("queries"));
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await openFile("queries/src/search.py").waitFor();
    await page.locator('[role="textbox"][aria-label="Edit queries/src/search.py"]:visible').waitFor();
    check(contents.get("queries/src/search.py").includes("keep this draft"), "Moving an edited folder lost its saved draft");
    check(actions.some(action => action.action === "move" && action.path === "src" && action.destination === "queries/src"), "Folder drop did not move its subtree");
    rejectMove = true;
    await openFile("README.md").dragTo(item("queries"));
    await page.getByRole("alert").filter({ hasText: "already exists" }).waitFor();
    await openFile("README.md").waitFor(); rejectMove = false;
    await item("queries").click({ button: "right" });
    await menu().getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page.getByRole("textbox", { name: "New name", exact: true }).fill("reports");
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await item("reports").waitFor();
    check(actions.some(action => action.destination === "reports"), "Rename did not use the move operation");
    await item("reports").click({ button: "right" });
    await menu().getByRole("menuitem", { name: "Add to .gitignore", exact: true }).click();
    check(actions.some(action => action.action === "ignore" && action.path === "reports"), "Folder ignore request is missing");
    for (const width of [1440, 720, 500]) {
      await page.setViewportSize({ width, height: 760 });
      await openFile("README.md").click({ button: "right" });
      const rect = await menu().boundingBox();
      check(rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 760, `Menu overflows at ${width}px`);
      await page.keyboard.press("Escape");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Workspace overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("tab", { name: /^Changes/ }).click();
    check(await page.locator(".git-file-group[open]").count() > 0 && await page.locator(".git-review-tree details[open]").count() > 0, "Fixture must have expanded Changes groups and folders");
    await page.getByRole("button", { name: "Collapse all folders", exact: true }).click();
    check(await page.locator(".git-file-group[open]").count() === 0, "Changes groups stayed expanded");
    check(await page.locator(".git-review-tree details[open]").count() === 0, "Changes folders stayed expanded");
    await Promise.all([page.waitForResponse(response => response.url().includes("/api/git/status")), page.getByRole("button", { name: "Refresh repository", exact: true }).click()]);
    check(await page.locator(".git-file-group[open]").count() === 0, "Refresh expanded collapsed groups");
    for (const width of [720, 500]) {
      await page.setViewportSize({ width, height: 760 });
      check(await page.getByRole("button", { name: "Collapse all folders", exact: true }).isVisible(), `Changes collapse button disappeared at ${width}px`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Changes overflows at ${width}px`);
    }
    check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
    return { folderMoves: true, unsavedDrafts: true, moveConflicts: true, rename: true, copyPaths: true, nativeActions: true, ignore: true, keyboardMenu: true, collapseChanges: true, layouts: 3, browserErrors: errors.length };
  } finally {
    page.off("pageerror", onError);
    await page.unroute("**/api/git/files?*", routeFiles); await page.unroute("**/api/git/file-action", routeAction);
    await page.unroute("**/api/git/file?*", routeFile); await page.unroute("**/api/git/file", routeFile);
  }
}
