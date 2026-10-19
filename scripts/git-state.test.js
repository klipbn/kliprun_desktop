// Fixture-only Playwright callback; no repository or file writes.
async (page, base = "http://127.0.0.1:18816") => {
  const context = await page.context().browser().newContext();
  page = await context.newPage(); page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const tab = name => page.locator(`#git-${name.toLowerCase()}-tab`);
  const file = path => page.getByRole("treeitem", { name: `Open file ${path}`, exact: true });
  const editor = path => page.locator(`[aria-label="Edit ${path}"]:visible`);
  const settings = page.getByRole("button", { name: "Changes view settings", exact: true });
  const panel = page.locator("#git-sidebar-panel");
  const diffPath = () => page.locator(".git-diff-heading strong").getAttribute("title");
  async function returnToGit() {
    await page.getByTestId("kanban-button").click();
    await Promise.all([page.waitForResponse(response => response.url().includes("/api/git/status?")), page.getByTestId("git-button").click()]);
  }
  try {
    await page.goto(`${base}/git`);
    await settings.click();
    await page.getByRole("menuitemradio", { name: "Tree", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Staged & Unstaged", exact: true }).click();
    await page.keyboard.press("Escape");
    const chosen = panel.locator('.git-file-select').last();
    const selectedPath = await chosen.getAttribute("title");
    await chosen.click();
    await page.getByRole("button", { name: "Collapse all folders", exact: true }).click();
    await returnToGit();
    await panel.locator("details").first().waitFor({ state: "attached" });
    check(await panel.locator("details[open]").count() === 0, "Returning to Git expanded collapsed Changes folders");
    check(await diffPath() === selectedPath, "Returning to Git reset the selected Changes file");
    await tab("Files").click();
    await page.getByRole("treeitem", { name: "src", exact: true }).click();
    await file("src/search.py").click(); await editor("src/search.py").waitFor();
    await file("src/search.py").dblclick();
    await file("README.md").click(); await editor("README.md").waitFor();
    await page.getByRole("tab", { name: "src/search.py", exact: true }).click();
    await page.getByRole("button", { name: "Collapse all folders", exact: true }).click();
    await tab("Changes").click();
    check(await panel.locator("details[open]").count() === 0, "Tab switch expanded collapsed Changes folders");
    check(await diffPath() === selectedPath, "Tab switch reset the selected Changes file");
    await tab("Files").click();
    check(await page.getByRole("treeitem", { expanded: true }).count() === 0, "Tab switch expanded collapsed Files folders");
    await returnToGit();
    check(await tab("Files").getAttribute("aria-selected") === "true", "Returning to Git reset the active tab");
    await editor("src/search.py").waitFor();
    check(await page.getByRole("tablist", { name: "Open files" }).getByRole("tab").count() === 2, "Returning to Git lost open file tabs");
    check(await page.getByRole("treeitem", { expanded: true }).count() === 0, "Returning to Git expanded Files folders");
    await page.reload(); await editor("src/search.py").waitFor();
    check(await page.getByRole("tablist", { name: "Open files" }).getByRole("tab").count() === 2, "Reload lost file tabs");
    check(await page.getByRole("treeitem", { expanded: true }).count() === 0, "Reload expanded Files folders");
    await tab("Changes").click();
    check(await panel.locator("details[open]").count() === 0, "Reload expanded Changes folders");
    check(await diffPath() === selectedPath, "Reload reset the selected Changes file");
    await page.getByRole("button", { name: "Close diff", exact: true }).click();
    await returnToGit();
    check(await page.getByRole("button", { name: "Close diff", exact: true }).count() === 0, "Returning to Git reopened a closed diff");
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem("kliprun.git.workspace")));
    check(snapshot, "Git workspace was not saved");
    await context.addInitScript(value => { window.kliprunGitWorkspace = value; }, snapshot);
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await settings.waitFor();
    await settings.click();
    check(await page.getByRole("menuitemradio", { name: "Tree", exact: true }).getAttribute("aria-checked") === "true", "Native snapshot lost Tree mode on a new origin");
    await page.keyboard.press("Escape");
    check(await panel.locator("details[open]").count() === 0, "Native snapshot expanded Changes folders");
    await tab("Files").click(); await editor("src/search.py").waitFor();
    for (const width of [1440, 720, 500]) {
      await page.setViewportSize({ width, height: 800 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Git overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.getByRole("treeitem", { name: "src", exact: true }).click();
    await page.getByRole("textbox", { name: "Filter files", exact: true }).fill("search.py");
    await returnToGit(); await editor("src/search.py").waitFor();
    check(await page.getByRole("textbox", { name: "Filter files", exact: true }).inputValue() === "search.py", "Returning to Git cleared the Files filter");
    async function repository(name) {
      await page.getByRole("button", { name: "Repository", exact: true }).click();
      await page.getByRole("option").filter({ hasText: name }).click();
    }
    await repository("aurora");
    await file("README.md").click(); await editor("README.md").waitFor();
    check(await page.getByRole("tablist", { name: "Open files" }).getByRole("tab").count() === 1, "Open files leaked between repositories");
    await repository("atlas"); await editor("src/search.py").waitFor();
    check(await page.getByRole("tablist", { name: "Open files" }).getByRole("tab").count() === 2, "Repository switch lost its open files");
    check(await page.getByRole("textbox", { name: "Filter files", exact: true }).inputValue() === "search.py", "Repository switch lost its filter");
    await tab("Changes").click();
    const staged = panel.locator('.git-file-group[aria-label="Staged changes"]');
    await staged.locator(":scope > summary").click();
    await staged.locator("details").first().locator(":scope > summary").click();
    const openCount = await panel.locator("details[open]").count();
    check(openCount === 2, "Opening a folder also opened unrelated folders");
    await returnToGit();
    check(await panel.locator("details[open]").count() === openCount, "Returning to Git lost individually expanded folders");
    await Promise.all([page.waitForResponse(response => response.url().includes("/api/git/status?")), page.getByRole("button", { name: "Refresh repository", exact: true }).click()]);
    check(await panel.locator("details[open]").count() === openCount, "Refreshing Git reset folder expansion");
    check(!errors.length, errors.join("; "));
    return { changesCollapse: true, individualFolders: true, filesCollapse: true, fileFilter: true, repositoryIsolation: true, openFiles: true, activeFile: true, selectedDiff: true, closedDiff: true, nativeRestore: true, layouts: 3 };
  } finally { await context.close(); }
}
