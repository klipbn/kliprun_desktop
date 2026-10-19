// Playwright callback against the fixture-only preview. Saves are intercepted in memory.
async (page, base = "http://127.0.0.1:18796") => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], saved = [];
  const onError = error => errors.push(error.message);
  const onDialog = dialog => dialog.accept();
  let forbiddenRequests = 0;
  const onForbidden = route => { forbiddenRequests++; return route.fulfill({ json: {} }); };
  const onSave = route => {
    const body = route.request().postDataJSON(); saved.push(body);
    return route.fulfill({ json: { root: body.directory, path: body.path, content: body.content, revision: "html-fixture-save" } });
  };
  const onRead = route => {
    const parameter = name => decodeURIComponent((route.request().url().match(new RegExp(`[?&]${name}=([^&]*)`))?.[1] ?? "").replace(/\+/g, " "));
    const body = saved.findLast(body => body.directory === parameter("directory") && body.path === parameter("path"));
    return body ? route.fulfill({ json: { root: body.directory, path: body.path, content: body.content, revision: "html-fixture-save" } }) : route.continue();
  };
  const report = () => page.frameLocator('iframe[title="HTML preview"]');
  const source = () => page.getByRole("textbox", { name: "Edit report.html", exact: true });
  const text = async () => (await source().locator(".cm-line").allTextContents()).join("\n");
  const active = () => page.locator('.git-document-view:not([hidden])');
  page.on("pageerror", onError);
  page.on("dialog", onDialog);
  await page.route("**/api/html-preview-probe*", onForbidden);
  await page.route("**/api/git/file", onSave);
  await page.route("**/api/git/file?*", onRead);
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("option").filter({ hasText: "atlas" }).click();
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await page.getByRole("treeitem", { name: "Open file report.html", exact: true }).dblclick();
    await source().waitFor();
    check(await page.locator('iframe[title="HTML preview"]').count() === 0, "HTML executed while opening source");
    check(await source().locator("span").count() > 0, "HTML source is not highlighted");
    const original = await text();
    await page.getByRole("button", { name: "Preview HTML", exact: true }).click();
    await report().getByRole("heading", { name: "Aurora project report", exact: true }).waitFor();
    await report().locator("body").evaluate(() => new Promise(resolve => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    }));
    check(await report().locator("body").evaluate(e => getComputedStyle(e).backgroundColor) === "rgb(246, 248, 252)", "Inline HTML CSS did not render");
    await report().getByRole("button", { name: "Show notes", exact: true }).click();
    check(await report().locator("#notes").isVisible(), "Inline report JavaScript did not run");
    for (const width of [1440, 900, 500]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await page.locator('iframe[title="HTML preview"]').boundingBox();
      check(box && box.width > 100 && box.height > 200, `HTML preview collapsed at ${width}`);
      await report().locator("body").evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `HTML workspace overflows at ${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await report().locator("body").evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: "/private/tmp/kliprun-html-preview.png" });
    await page.getByRole("treeitem", { name: "Open file README.md", exact: true }).click();
    check(await page.locator('iframe[title="HTML preview"]').count() === 0, "Inactive file still has a running iframe");
    await page.getByRole("tab", { name: "report.html", exact: true }).click();
    await report().getByRole("heading", { name: "Aurora project report", exact: true }).waitFor();
    await page.getByRole("tab", { name: /^Changes/ }).click();
    check(await page.locator('iframe[title="HTML preview"]').count() === 0, "Leaving Files retained the preview");
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "Edit HTML", exact: true }).click();
    await source().waitFor();
    check(await text() === original, "Rendering changed source text");
    const draft = original.replaceAll("Aurora project report", "Unsaved HTML report") + `\n<script>
      window.previewChecks = {parentBlocked:false, networkBlocked:false};
      try { parent.document.body.dataset.htmlEscaped = 'yes'; } catch { previewChecks.parentBlocked = true; }
      fetch('/api/html-preview-probe').then(() => {}, () => { previewChecks.networkBlocked = true; });
    </script>`;
    await source().click(); await source().press("ControlOrMeta+a"); await page.keyboard.insertText(draft);
    const edited = await text();
    await page.getByRole("button", { name: "Preview HTML", exact: true }).click();
    await report().getByRole("heading", { name: "Unsaved HTML report", exact: true }).waitFor();
    const checks = await report().locator("body").evaluate(async () => {
      for (let attempt = 0; attempt < 100 && !window.previewChecks?.networkBlocked; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
      return window.previewChecks;
    });
    check(checks?.networkBlocked, "HTML network access was not blocked");
    check(checks?.parentBlocked, "HTML can read the parent application");
    check(forbiddenRequests === 0, "HTML accessed the application API");
    check(await page.evaluate(() => document.body.dataset.htmlEscaped) === undefined, "HTML changed the parent DOM");
    check(saved.length === 0, "Preview automatically saved the draft");
    await active().getByRole("button", { name: "Save file", exact: true }).click();
    await active().getByText("Saved", { exact: true }).waitFor();
    check(saved.length === 1 && saved[0].content === edited, "Preview or save changed the editor's HTML draft");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('kliprun:menu-command', {detail:'find'})));
    await source().waitFor();
    check(await page.locator('iframe[title="HTML preview"]').count() === 0, "Find did not unload the preview");
    await page.locator('.cm-search input[name="search"]:visible').press("Escape");
    await source().click(); await source().press("ControlOrMeta+z");
    check(await text() === original, "Preview lost the source editor's undo history");
    await source().press("ControlOrMeta+Shift+z");
    check(await text() === edited, "Preview lost the source editor's redo history");
    check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { highlightedHTML: true, inlineStyles: true, inlineScripts: true, draftAndUndo: true, lazyPreview: true, isolatedOrigin: true, blockedAPI: true, layouts: 3 };
  } finally {
    page.off("pageerror", onError);
    page.off("dialog", onDialog);
    await page.unroute("**/api/html-preview-probe*", onForbidden); await page.unroute("**/api/git/file", onSave);
    await page.unroute("**/api/git/file?*", onRead);
  }
}
