// Playwright callback: pass parsed mock-api.json as the third argument. No real file API is used.
async (page, directory = "docs/screenshots", fixture, base = "http://127.0.0.1:18796") => {
  const root = fixture.git.status.root;
  const external = [];
  const watch = request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); };
  const read = route => {
    const path = decodeURIComponent(route.request().url().match(/[?&]path=([^&]*)/)[1].replace(/\+/g, " "));
    return route.fulfill({ json: { root, path, content: fixture.git.text_files[path], revision: "fixture" } });
  };
  page.on("request", watch);
  await page.route(`${base}/api/git/file?*`, read);
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    await page.evaluate(() => localStorage.removeItem("kliprun.git.sidebar-width")); await page.reload();
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("option").filter({ hasText: root }).click();
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    for (const path of ["README.md", "queries/projects.sql"]) {
      await page.getByRole("textbox", { name: "Filter files", exact: true }).fill(path);
      await page.getByRole("treeitem", { name: `Open file ${path}`, exact: true }).dblclick();
      await page.getByRole("button", { name: "Clear file filter", exact: true }).click();
    }
    await page.getByRole("textbox", { name: "Filter files", exact: true }).fill("src/api/search.ts");
    await page.getByRole("treeitem", { name: "Open file src/api/search.ts", exact: true }).click();
    await page.getByRole("textbox", { name: "Edit src/api/search.ts", exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear file filter", exact: true }).click();
    await page.getByRole("button", { name: "Show changes", exact: true }).click();
    await page.getByRole("region", { name: "Changes at line 2", exact: true }).waitFor();
    await page.screenshot({ path: `${directory}/git-files.png`, animations: "disabled" });
    await page.getByRole("treeitem", { name: "Open file src/api/search.ts", exact: true }).click({ button: "right" });
    await page.getByRole("menu", { name: "File actions", exact: true }).waitFor();
    await page.screenshot({ path: `${directory}/git-file-menu.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "README.md", exact: true }).click();
    await page.locator('button[aria-label="Preview Markdown"]:visible').click();
    await page.getByRole("heading", { name: "Atlas search", exact: true }).waitFor();
    await page.screenshot({ path: `${directory}/git-markdown.png`, animations: "disabled" });
    await page.getByRole("textbox", { name: "Filter files", exact: true }).fill("notebooks/activity.ipynb");
    await page.getByRole("treeitem", { name: "Open file notebooks/activity.ipynb", exact: true }).click();
    await page.getByRole("button", { name: "Clear file filter", exact: true }).click();
    await page.getByRole("heading", { name: "Atlas project activity", exact: true }).waitFor();
    await page.screenshot({ path: `${directory}/git-notebook.png`, animations: "disabled" });
    if (external.length) throw new Error("Capture made external requests");
    return { captures: ["git-files.png", "git-file-menu.png", "git-markdown.png", "git-notebook.png"], externalRequests: 0 };
  } finally {
    page.off("request", watch); await page.unroute(`${base}/api/git/file?*`, read);
  }
}
