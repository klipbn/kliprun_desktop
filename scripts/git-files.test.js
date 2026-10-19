// Playwright callback (page, parsed mock-api.json). All file saves stay in memory.
async (page, fixture) => {
  const base = "http://127.0.0.1:18796", saved = new Map(), errors = [];
  let writes = 0, rejectSave = false, delaySave = false, delayRead = false, rejectRead = false;
  const parameter = (url, name) => decodeURIComponent((url.match(new RegExp(`[?&]${name}=([^&]*)`))?.[1] ?? "").replace(/\+/g, " "));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errorListener = error => errors.push(error.message);
  const dialogListener = dialog => dialog.accept();
  const fileRoute = async route => {
    const request = route.request(), url = request.url();
    if (request.method() === "POST") {
      writes++;
      const body = request.postDataJSON();
      if (delaySave) await page.waitForTimeout(400);
      if (rejectSave) return route.fulfill({ status: 409, json: { error: "File changed on disk. Reopen it before saving." } });
      const data = { root: body.directory, path: body.path, content: body.content, revision: `fixture-save-${writes}` };
      saved.set(`${body.directory}:${body.path}`, data);
      return route.fulfill({ json: data });
    }
    const path = parameter(url, "path"), root = parameter(url, "directory");
    if (rejectRead && path === "src/search.py") return route.fulfill({ status: 404, json: { error: "File no longer exists." } });
    if (delayRead && path === "src/search.py") await page.waitForTimeout(400);
    return route.fulfill({ json: saved.get(`${root}:${path}`) ?? { root, path, content: fixture.git.text_files[path], revision: "fixture-original" } });
  };
  const filesRoute = route => {
    const url = route.request().url(), root = parameter(url, "directory"), path = parameter(url, "path"), search = parameter(url, "search");
    const names = root.endsWith("/aurora") ? ["README.md"] : Object.keys(fixture.git.text_files);
    const matches = names.filter(name => path ? name.startsWith(`${path}/`) : true);
    const directories = search ? [] : [...new Set(matches.filter(name => name.slice(path ? path.length + 1 : 0).includes("/")).map(name => `${path ? `${path}/` : ""}${name.slice(path ? path.length + 1 : 0).split("/")[0]}`))];
    const files = search ? names.filter(name => name.toLowerCase().includes(search)) : matches.filter(name => !name.slice(path ? path.length + 1 : 0).includes("/"));
    return route.fulfill({ json: { root, files, directories, truncated: false } });
  };
  const item = path => page.getByRole("treeitem", { name: `Open file ${path}`, exact: true });
  const source = path => page.locator(`[role="textbox"][aria-label="Edit ${path}"]:visible`);
  const tabs = () => page.getByRole("tablist", { name: "Open files", exact: true });
  const close = path => page.getByRole("button", { name: `Close ${path}`, exact: true });
  const activeSave = () => page.locator('button[aria-label="Save file"]:visible');
  const text = async path => (await source(path).innerText()).replace(/\r/g, "");
  const edit = async (path, value) => { await source(path).click(); await source(path).press("ControlOrMeta+a"); await page.keyboard.insertText(value); };
  async function chooseRepository(name) {
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("option").filter({ hasText: name }).click();
  }
  page.on("pageerror", errorListener); page.on("dialog", dialogListener);
  await page.route("**/api/git/files?*", filesRoute);
  await page.route("**/api/git/file?*", fileRoute);
  await page.route("**/api/git/file", fileRoute);
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`); await chooseRepository("atlas");
    await page.getByRole("button", { name: "Close diff", exact: true }).click();
    await Promise.all([page.waitForResponse(r => r.url().includes("/api/git/status")), page.getByRole("button", { name: "Refresh repository", exact: true }).click()]);
    check(await page.getByRole("button", { name: "Close diff", exact: true }).count() === 0, "Refresh reopened a closed diff");
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    const filter = page.getByRole("textbox", { name: "Filter files", exact: true });
    await filter.fill("projects.sql");
    check(await item("src/search.py").count() === 0, "Tree filter did not hide other files");
    await item("queries/projects.sql").waitFor(); await filter.press("Escape");
    await page.getByRole("button", { name: "Collapse all folders", exact: true }).click();
    check(await item("src/search.py").count() === 0, "Collapse all left nested files visible");
    const srcFolder = page.getByRole("treeitem", { name: "src", exact: true });
    await srcFolder.focus(); await srcFolder.press("ArrowRight");
    await item("src/search.py").waitFor(); await item("src/search.py").focus(); await item("src/search.py").press(" ");
    await item("src/search.py").click(); await source("src/search.py").waitFor();
    await tabs().waitFor();
    const sidebar = await page.locator(".git-sidebar").boundingBox(), pane = await page.locator(".git-diff-pane").boundingBox();
    check(sidebar.x > pane.x, "Project tree is not right of the editor");
    check(await tabs().getByRole("tab").count() === 1, "First preview did not open exactly one tab");
    check(await source("src/search.py").locator("span").count() > 0, "Python has no syntax tokens");
    const queriesFolder = page.getByRole("treeitem", { name: "queries", exact: true });
    await queriesFolder.focus(); await queriesFolder.press("ArrowRight");
    await item("queries/projects.sql").click(); await source("queries/projects.sql").waitFor();
    check(await tabs().getByRole("tab").count() === 1, "A clean preview was not replaced");
    await item("queries/projects.sql").dblclick();
    await item("src/search.py").click(); await source("src/search.py").waitFor();
    check(await tabs().getByRole("tab").count() === 2, "Double click did not keep the SQL tab open");
    await edit("src/search.py", "def demo():"); await source("src/search.py").press("Enter"); await page.keyboard.insertText("return 42");
    check((await text("src/search.py")).includes("\n    return 42"), "Python Enter did not indent its block");
    await source("src/search.py").press("Home"); await source("src/search.py").press("Tab");
    check((await text("src/search.py")).includes("\n        return 42"), "Tab did not indent source");
    await source("src/search.py").press("Shift+Tab");
    check((await text("src/search.py")).includes("\n    return 42"), "Shift+Tab did not outdent source");
    await source("src/search.py").press("ControlOrMeta+End"); await page.keyboard.insertText(" # keep this draft");
    await item("README.md").click(); await source("README.md").waitFor();
    check(await tabs().getByRole("tab").count() === 3, "Editing did not pin the Python tab");
    check(!await page.getByRole("dialog").isVisible(), "Switching tabs unnecessarily asks to discard edits");
    await tabs().getByRole("tab").filter({ hasText: "search.py" }).click(); await source("src/search.py").waitFor();
    check((await text("src/search.py")).includes("keep this draft"), "Tab switch lost edited text");
    await source("src/search.py").press("ControlOrMeta+z");
    check(!(await text("src/search.py")).includes("keep this draft"), "Undo history was lost across tab switches");
    await source("src/search.py").press("ControlOrMeta+Shift+z");
    check((await text("src/search.py")).includes("keep this draft"), "Redo did not restore the edit");
    await source("src/search.py").press("ControlOrMeta+f");
    const find = page.locator('.cm-search input[name="search"]:visible'); await find.waitFor(); await find.pressSequentially("return");
    await page.locator(".cm-searchMatch").first().waitFor(); await find.press("Escape");
    await close("src/search.py").click(); await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    check((await text("src/search.py")).includes("keep this draft"), "Cancel close lost edited text");
    delaySave = true; await activeSave().click();
    await page.waitForFunction(() => { const e = [...document.querySelectorAll('[aria-label="Edit src/search.py"]')].find(e => e.getBoundingClientRect().height); return e?.getAttribute("contenteditable") === "false" || e?.getAttribute("aria-readonly") === "true"; });
    await page.getByText("Saved", { exact: true }).waitFor(); check(writes === 1, "Save did not write once");
    await close("src/search.py").click(); await item("src/search.py").click(); await source("src/search.py").waitFor();
    check((await text("src/search.py")).includes("keep this draft"), "Reopened file did not load the save");
    await source("src/search.py").press("ControlOrMeta+End"); await page.keyboard.insertText("\n# conflicted draft");
    rejectSave = true; await activeSave().click(); await page.getByText("File changed on disk. Reopen it before saving.", { exact: true }).waitFor();
    check((await text("src/search.py")).includes("conflicted draft"), "Save conflict lost the draft");
    await page.getByTestId("kanban-button").click(); rejectRead = true; await page.getByTestId("git-button").click();
    await page.getByRole("tab", { name: "Files", exact: true }).click(); await item("src/search.py").click(); await source("src/search.py").waitFor();
    check((await text("src/search.py")).includes("conflicted draft"), "Leaving Git or failed disk read lost the draft");
    rejectRead = false; rejectSave = false; delaySave = false;
    await close("src/search.py").click(); await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await item("README.md").click(); await source("README.md").waitFor();
    await edit("README.md", `${fixture.git.text_files["README.md"]}\nSaved with the keyboard.\n`);
    await source("README.md").press("ControlOrMeta+s"); await page.getByText("Saved", { exact: true }).waitFor();
    check(writes === 3, "Keyboard Save did not write the Markdown file");
    await page.locator('button[aria-label="Preview Markdown"]:visible').click(); await page.getByRole("heading", { name: "Atlas search", exact: true }).waitFor();
    await page.locator('button[aria-label="Edit Markdown"]:visible').click(); await source("README.md").waitFor();
    await source("README.md").press("ControlOrMeta+End"); await page.keyboard.insertText("\nSave and close.\n");
    await close("README.md").click(); await page.getByRole("button", { name: "Save and close", exact: true }).click();
    await close("README.md").waitFor({state:"hidden"}); check(writes === 4, "Save and close did not save");
    delayRead = true; await item("src/search.py").click(); await item("queries/projects.sql").click(); await source("queries/projects.sql").waitFor();
    await page.waitForTimeout(500); check((await text("queries/projects.sql")).includes("SELECT"), "Stale read replaced the active file");
    await edit("queries/projects.sql", "-- Unsaved fixture change"); await item("README.md").click(); await source("README.md").waitFor();
    await chooseRepository("aurora"); await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    check(await tabs().getByRole("tab").filter({hasText:"projects.sql"}).count() === 1, "Repository cancel lost an inactive dirty tab");
    await chooseRepository("aurora"); await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await item("README.md").waitFor(); check(await item("src/search.py").count() === 0, "Files leaked across repositories");
    await item("README.md").click(); await source("README.md").waitFor();
    for (const width of [720,500]) { await page.setViewportSize({width,height:760}); check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Workspace overflows at ${width}px`); }
    check(errors.length===0,`Browser errors: ${errors.join("; ")}`);
    return {previewTabs:true,pinnedTabs:true,dirtyTabs:true,undoAcrossTabs:true,indentation:true,find:true,saveAndClose:true,markdown:true,repositoryIsolation:true,layouts:3,fixtureWrites:writes,browserErrors:errors.length};
  } finally {
    page.off("pageerror",errorListener); page.off("dialog",dialogListener);
    await page.unroute("**/api/git/files?*", filesRoute); await page.unroute("**/api/git/file?*", fileRoute); await page.unroute("**/api/git/file", fileRoute);
  }
}
