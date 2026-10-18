// Playwright callback against the fixture preview. Saves stay in memory.
async (page, base = "http://127.0.0.1:18796") => {
  const path = "notebooks/activity.ipynb";
  const errors = [], external = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const onError = error => errors.push(error.message);
  const onRequest = request => { if (!request.url().startsWith(base) && !request.url().startsWith("data:")) external.push(request.url()); };
  let saved = null, writes = 0;
  const routeFile = async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      saved = { root: body.directory, path: body.path, content: body.content, revision: "notebook-saved" };
      writes++;
      return route.fulfill({ json: saved });
    }
    if (saved && route.request().url().includes("activity.ipynb")) return route.fulfill({ json: saved });
    return route.continue();
  };
  page.on("pageerror", onError); page.on("request", onRequest);
  await page.route(`${base}/api/git/file**`, routeFile);
  const notebook = () => page.getByRole("treeitem", { name: `Open file ${path}`, exact: true });
  const preview = () => page.getByLabel("Notebook preview", { exact: true });
  const source = () => page.locator(`[role="textbox"][aria-label="Edit ${path}"]:visible`);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/git`);
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("option").filter({ hasText: "atlas" }).click();
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await notebook().click(); await preview().waitFor();
    await preview().getByRole("heading", { name: "Atlas project activity", exact: true }).waitFor();
    check(await preview().locator("table").count() === 2, "Markdown or saved HTML table is missing");
    check(await preview().locator(".notebook-code .repository-token-number").count() > 0, "Code cells have no syntax highlighting");
    check(await preview().locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), "Saved image failed to load");
    check(!await page.getByLabel("Unsaved changes", { exact: true }).count(), "Opening a notebook changes its source");
    for (const width of [1440, 720, 500]) {
      await page.setViewportSize({ width, height: 760 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Notebook overflows the workspace at ${width}px`);
      const bounds = await preview().boundingBox();
      check(bounds && bounds.width > 100 && bounds.height > 100, `Notebook preview disappeared at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Edit notebook JSON", exact: true }).click(); await source().waitFor();
    await source().press("ControlOrMeta+a"); await page.keyboard.insertText('{"nbformat":4,"cells":[');
    await page.getByRole("button", { name: "Preview notebook", exact: true }).click();
    await preview().getByRole("alert").waitFor();
    await page.getByRole("button", { name: "Edit notebook JSON", exact: true }).click();
    const content = JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { custom: "keep metadata" }, cells: [
      { cell_type: "markdown", metadata: {}, source: "# Edited notebook" },
      { cell_type: "code", execution_count: 1, metadata: {}, source: "print(42)", outputs: [
        { output_type: "display_data", metadata: {}, data: { "text/html": '<table><tr><td>Safe result</td></tr></table><script>window.notebookExecuted=true</script><img src="https://example.invalid/pixel" onerror="alert(1)">' } },
      ] },
    ] }, null, 1);
    await source().press("ControlOrMeta+a"); await page.keyboard.insertText(content);
    await page.getByRole("button", { name: "Preview notebook", exact: true }).click();
    await preview().getByRole("heading", { name: "Edited notebook", exact: true }).waitFor();
    check(await page.evaluate(() => window.notebookExecuted !== true), "Notebook HTML executed a script");
    await preview().focus(); await page.keyboard.press("ControlOrMeta+s");
    await page.getByText("Saved", { exact: true }).waitFor();
    check(writes === 1 && saved.content === content, "Notebook JSON was rewritten or saved more than once");
    await page.getByRole("treeitem", { name: "Open file README.md", exact: true }).click();
    await page.getByRole("tablist", { name: "Open files", exact: true }).getByRole("tab").filter({ hasText: "activity.ipynb" }).click();
    await preview().getByRole("heading", { name: "Edited notebook", exact: true }).waitFor();
    await page.getByRole("button", { name: `Close ${path}`, exact: true }).click();
    saved = { ...saved, content: JSON.stringify({ nbformat: 4, cells: [
      { cell_type: "markdown", source: "# Large notebook loaded" },
      { cell_type: "code", source: "plot()", outputs: [{ output_type: "display_data", data: {
        "text/html": `<div><script>${"const chart = '<div>';".repeat(240000)}</script></div>`, "text/plain": "Saved chart fallback",
      } }] },
    ] }) };
    const started = await page.evaluate(() => performance.now());
    await notebook().click(); await preview().getByRole("heading", { name: "Large notebook loaded", exact: true }).waitFor();
    const largeNotebookMs = Math.round(await page.evaluate(() => performance.now()) - started);
    check(await preview().getByText("Saved chart fallback", { exact: true }).count() === 1, "Large HTML lost its text fallback");
    check(await page.locator('.git-document-view:not([hidden]) .cm-editor').count() === 0, "Notebook preview eagerly created its hidden JSON editor");
    check((await preview().innerText()).length < 10000, "Notebook expanded the embedded JavaScript bundle into the DOM");
    check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
    check(external.length === 0, `External requests: ${external.join("; ")}`);
    return { readableCells: true, savedTablesAndImages: true, jsonEditingAndSave: true, malformedFallback: true, metadataPreserved: true, largeNotebookMs, lazyJSONEditor: true, layouts: 3, externalRequests: external.length, browserErrors: errors.length };
  } finally {
    page.off("pageerror", onError); page.off("request", onRequest);
    await page.unroute(`${base}/api/git/file**`, routeFile);
  }
}
