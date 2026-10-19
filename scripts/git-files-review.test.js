// Fixture-only review. Saves are intercepted in memory; no Git or filesystem writes.
async (page, base = "http://127.0.0.1:18810") => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const p = await context.newPage(), errors = [], saves = [], directoryRequests = [];
  const disk = new Map();
  let gitWrites = 0;
  const parameter = (url, name) => decodeURIComponent((url.match(new RegExp(`[?&]${name}=([^&]*)`))?.[1] ?? "").replace(/\+/g, " "));
  p.on("pageerror", error => errors.push(error.message));
  p.on("request", request => { const url = request.url(); if (url.includes("/api/git/files?") && parameter(url, "path")) directoryRequests.push(parameter(url, "path")); });
  const check = (value, message) => { if (!value) throw new Error(message); };
  const active = () => p.locator(".git-document-view:not([hidden])");
  const source = () => active().getByRole("textbox");
  const text = async () => (await source().locator(".cm-line").allTextContents()).join("\n");
  const open = async path => {
    await p.getByRole("textbox", { name: "Filter files", exact: true }).fill(path);
    await p.getByRole("treeitem", { name: `Open file ${path}`, exact: true }).dblclick();
    await active().getByRole("textbox", { name: `Edit ${path}`, exact: true }).waitFor();
    await p.getByRole("button", { name: "Clear file filter", exact: true }).click();
  };
  await p.route("**/api/git/file", route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON(); saves.push(body);
    const file = { root: body.directory, path: body.path, content: body.content, revision: `fixture-save-${saves.length}` };
    disk.set(`${body.directory}:${body.path}`, file);
    return route.fulfill({ json: file });
  });
  await p.route("**/api/git/file?*", route => {
    const url = route.request().url(), file = disk.get(`${parameter(url, "directory")}:${parameter(url, "path")}`);
    return file ? route.fulfill({ json: file }) : route.continue();
  });
  await p.route("**/api/git/action", route => { gitWrites++; return route.fulfill({ status: 409, json: { error: "No Git writes in this preview" } }); });
  try {
    await p.goto(`${base}/git`);
    await p.getByRole("button", { name: "Repository", exact: true }).click();
    await p.getByRole("option").filter({ hasText: "atlas" }).click();
    await p.getByRole("tab", { name: "Files", exact: true }).click();
    const cache = p.getByRole("treeitem", { name: "cache", exact: true });
    await cache.waitFor();
    check(await cache.getAttribute("aria-expanded") === "false", "Ignored root should start collapsed");
    check(directoryRequests.length === 0, "Ignored files loaded before expansion");
    await cache.click();
    await p.getByRole("treeitem", { name: "Open file cache/demo.json", exact: true }).waitFor();
    check(directoryRequests.includes("cache"), "Ignored folder was not loaded lazily");
    await p.getByRole("treeitem", { name: "nested", exact: true }).click();
    await p.getByRole("treeitem", { name: "Open file cache/nested/readme.txt", exact: true }).waitFor();
    await p.getByRole("treeitem", { name: "Open file cache/demo.json", exact: true }).dblclick();
    await active().getByText("Ignored by Git", { exact: true }).waitFor();
    check(await source().getAttribute("aria-readonly") === "false", "Ignored text is not editable");
    check(await active().locator(".cm-git-marker").count() === 0, "Ignored files should not invent a Git baseline");
    await p.getByRole("button", { name: "Hide ignored files", exact: true }).click();
    check(await cache.count() === 0, "Hide ignored did not remove ignored entries");
    await p.reload(); await p.getByRole("button", { name: "Show ignored files", exact: true }).waitFor();
    check(await cache.count() === 0, "Ignored visibility did not persist");
    await p.getByRole("button", { name: "Show ignored files", exact: true }).click();
    await cache.waitFor();
    await open("src/api/search.ts");
    await active().locator(".cm-git-marker.is-modified").first().waitFor();
    const original = await text();
    await active().locator(".cm-git-marker.is-modified").first().focus(); await p.keyboard.press("Enter");
    await active().getByRole("region", { name: "Changes at line 2", exact: true }).waitFor();
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const aligned = await active().evaluate(editor => {
      const lines = [...editor.querySelectorAll(".cm-line")];
      const numbers = [...editor.querySelectorAll(".cm-lineNumbers .cm-gutterElement")].filter(node => node.getBoundingClientRect().height > 0);
      return lines.every((line, index) => {
        const number = numbers.find(node => Number(node.textContent) === index + 1);
        return number && Math.abs(number.getBoundingClientRect().top - line.getBoundingClientRect().top) < 1;
      });
    });
    check(aligned, "Inline review shifted line numbers away from source lines");
    check((await active().locator(".cm-git-diff-old pre").innerText()).includes("return query;"), "Committed text is missing");
    check((await active().locator(".cm-git-diff-new pre").innerText()).includes("query.trim()"), "Current text is missing");
    check(await active().locator(".cm-git-diff-widget mark").count() > 0, "Changed words are not highlighted");
    check(await text() === original && saves.length === 0, "Opening a change modified or saved source");
    await p.keyboard.press("Escape");
    check(await active().locator(".cm-git-diff-widget").count() === 0, "Escape did not collapse the change");
    await active().getByRole("button", { name: "Show changes", exact: true }).click();
    const edited = original + "// Local draft\n";
    await source().click(); await source().press("ControlOrMeta+a"); await p.keyboard.insertText(edited);
    check(await text() === edited, "Inline widgets were inserted into the editable document");
    await source().press("ControlOrMeta+z"); check(await text() === original, "Undo was disturbed by Git review");
    await source().press("ControlOrMeta+Shift+z"); check(await text() === edited, "Redo was disturbed by Git review");
    await active().getByRole("button", { name: "Save file", exact: true }).click();
    await active().getByText("Saved", { exact: true }).waitFor();
    check(saves.length === 1 && saves[0].content === edited, "Save included review text or lost the draft");
    await active().locator(".cm-git-marker").first().waitFor();
    for (const width of [1440, 980, 500]) {
      await p.setViewportSize({ width, height: 900 });
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Files overflows at ${width}`);
      check(await source().isVisible(), `Editor missing at ${width}`);
      check(await active().locator(".cm-git-diff-widget").count() > 0, `Inline diff disappeared at ${width}`);
    }
    await p.setViewportSize({ width: 1440, height: 900 });
    await source().press("ArrowRight");
    for (const theme of ["graphite", "daybreak"]) {
      await p.evaluate(theme => { window.kliprunPreferences = { ...window.kliprunPreferences, theme }; window.dispatchEvent(new Event("kliprun:preferences")); }, theme);
      await p.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
      await p.screenshot({ path: `/private/tmp/kliprun-files-review-${theme}.png`, animations: "disabled" });
    }
    const status = await (await p.request.get(`${base}/api/git/status?directory=/Users/demo/Projects/atlas`)).json();
    await p.route("**/api/git/status*", route => route.fulfill({ json: { ...status, head: "b".repeat(40) } }));
    let baselineContent = edited;
    await p.route("**/api/git/file-base*", route => parameter(route.request().url(), "path") === "src/api/search.ts" ? route.fulfill({ json: { content: baselineContent } }) : route.continue());
    await p.getByRole("button", { name: "Refresh repository", exact: true }).click();
    await p.waitForFunction(() => !document.querySelector('.git-document-view:not([hidden]) .cm-git-marker'));
    check(await text() === edited, "HEAD refresh overwrote editor contents");
    const key = `${saves[0].directory}:src/api/search.ts`, saved = disk.get(key);
    const agentText = edited + "// Agent update\n";
    disk.set(key, { ...saved, content: agentText, revision: "fixture-agent-1" });
    await p.getByRole("button", { name: "Refresh repository", exact: true }).click();
    await p.waitForFunction(() => document.querySelector('.git-document-view:not([hidden]) .cm-content')?.textContent.includes("// Agent update"), undefined, { timeout: 5000 });
    check(await text() === agentText, "Clean open file did not follow disk changes");
    const draft = agentText + "// Keep my draft\n";
    await source().click(); await source().press("ControlOrMeta+a"); await p.keyboard.insertText(draft);
    disk.set(key, { ...saved, content: agentText + "// Later agent update\n", revision: "fixture-agent-2" });
    await p.getByRole("button", { name: "Refresh repository", exact: true }).click();
    check(await text() === draft, "Disk refresh replaced an unsaved draft");
    const examples = await (await p.request.get(`${base}/__preview/git-diff-examples`)).json();
    for (const kind of ["deleted", "added"]) {
      baselineContent = examples[`${kind}_before`];
      const after = examples[`${kind}_after`];
      await source().click(); await source().press("ControlOrMeta+a"); await p.keyboard.insertText(after);
      await p.getByRole("button", { name: "Refresh repository", exact: true }).click();
      const marker = active().locator(`.cm-git-marker.is-${kind}`).first(); await marker.waitFor(); await marker.click();
      await active().locator(".cm-git-diff-widget").waitFor();
      check(await text() === after, `${kind} review changed source`);
      check((await active().locator(kind === "deleted" ? ".cm-git-diff-old pre" : ".cm-git-diff-new pre").innerText()).includes(kind === "deleted" ? "removed" : "added"), `Missing ${kind} text`);
    }
    baselineContent = examples.unsafe_before;
    await p.getByRole("button", { name: "Refresh repository", exact: true }).click();
    await p.waitForFunction(() => !document.querySelector('.git-document-view:not([hidden]) .cm-git-diff-widget'));
    await active().getByRole("button", { name: "Show changes", exact: true }).click();
    check((await active().locator(".cm-git-diff-old pre").innerText()).includes("<img"), "Baseline text was lost");
    check(await active().locator(".cm-git-diff-widget img, .cm-git-diff-widget script").count() === 0, "Review parsed baseline HTML");
    check(await p.evaluate(() => window.diffScriptExecuted) === undefined, "Baseline HTML executed");
    check(gitWrites === 0, "Change review performed a Git write");
    check(errors.length === 0, errors.join("; "));
    return { passed: true, checks: "Lazy ignored folders, visibility persistence, ignored editing, added/modified/deleted gutter and word diff, keyboard/Escape, undo/redo/save, HEAD and agent refresh, draft preservation, HTML safety, narrow/light/dark layouts", saves: saves.length, gitWrites, errors };
  } catch (error) {
    await p.screenshot({ path: "/private/tmp/kliprun-files-review-failure.png", animations: "disabled" }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
