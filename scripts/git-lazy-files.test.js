// Fixture-only Playwright callback. No repository or file writes.
async (page, base = "http://127.0.0.1:18837") => {
  const context = await page.context().browser().newContext();
  page = await context.newPage();
  page.setDefaultTimeout(5000);
  const calls = [], errors = [];
  const parameter = (url, name) => decodeURIComponent((url.match(new RegExp(`[?&]${name}=([^&]*)`))?.[1] ?? "").replace(/\+/g, " "));
  let rejectSearch = true;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const file = path => page.getByRole("treeitem", { name: `Open file ${path}`, exact: true });
  const folder = name => page.getByRole("treeitem", { name, exact: true });
  const routeFiles = async route => {
    const url = route.request().url(), path = parameter(url, "path"), query = parameter(url, "search"), offset = Number(parameter(url, "offset"));
    calls.push({ path, query, offset });
    let files = [], directories = [], ignored = [], trackedDirectories = [], nextOffset;
    if (query) {
      if (query === "readme" && rejectSearch) return route.fulfill({ status: 503, json: { error: "Fixture search failure" } });
      if (query === "readme") { await page.waitForTimeout(450); files = ["README.md"]; }
      else if (query === "src") { files = offset ? ["src/api/search.ts"] : ["src/search.py"]; if (!offset) nextOffset = 500; }
      else if (query.includes("projects")) files = ["queries/projects.sql"];
      else if (query === "demo") { files = parameter(url, "includeIgnored") === "false" ? [] : ["demo.local.txt"]; ignored = files; }
    } else if (path === "src") {
      if (offset) files = ["src/search.py"]; else { directories = ["src/api"]; nextOffset = 500; }
    } else if (path === "src/api") files = ["src/api/search.ts"];
    else if (path === "queries") files = ["queries/projects.sql"];
    else if (path === "cache") { files = ["cache/demo.json"]; directories = ["cache/nested"]; ignored = ["cache/nested"]; }
    else if (path === "cache/nested") { files = ["cache/nested/readme.txt"]; ignored = files; }
    else if (offset) { files = ["report.html"]; directories = ["queries", "notebooks"]; }
    else { files = ["README.md", "demo.local.txt"]; directories = ["src", "cache"]; ignored = ["cache", "demo.local.txt"]; trackedDirectories = ["cache"]; nextOffset = 500; }
    await route.fulfill({ json: { root: parameter(url, "directory"), files, directories, ignored, trackedDirectories, ...(nextOffset === undefined ? {} : { nextOffset }), truncated: false } });
  };
  const onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await page.route("**/api/git/files?*", routeFiles);
  try {
    await page.goto(`${base}/git`);
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await folder("src").waitFor();
    check(await folder("src").getAttribute("aria-expanded") === "false", "A lazy folder opened without being selected");
    check(calls.every(call => !call.path), "Collapsed folders were fetched on startup");
    check(!await page.getByText("File list truncated.", { exact: false }).count(), "The old truncation warning remains");
    await page.getByRole("button", { name: "Load more repository files", exact: true }).click();
    await folder("queries").waitFor(); await file("README.md").waitFor();
    check(!await page.getByRole("button", { name: "Load more repository files", exact: true }).count(), "The root's final page still offers more");
    await folder("src").click(); await folder("api").waitFor();
    check(!calls.some(call => call.path === "src/api"), "An unopened child folder was fetched");
    await page.getByRole("button", { name: "Load more in src", exact: true }).click();
    await file("src/search.py").waitFor();
    await folder("api").click(); await file("src/api/search.ts").waitFor();
    await file("src/api/search.ts").click();
    await page.getByRole("textbox", { name: "Edit src/api/search.ts", exact: true }).waitFor();
    const filter = page.getByRole("textbox", { name: "Filter files", exact: true });
    await filter.fill("projects.sql"); await file("queries/projects.sql").waitFor();
    check(!calls.some(call => call.path === "queries"), "Search fetched unopened directories instead of searching the repository");
    await filter.fill("src"); await file("src/search.py").waitFor();
    await page.getByRole("button", { name: "Load more search results", exact: true }).click();
    await file("src/api/search.ts").waitFor(); await file("src/search.py").waitFor();
    await filter.fill("readme"); await page.getByRole("button", { name: "Retry search", exact: true }).waitFor();
    rejectSearch = false;
    await page.getByRole("button", { name: "Retry search", exact: true }).click(); await file("README.md").waitFor();
    const slow = page.waitForRequest(request => parameter(request.url(), "search") === "readme");
    await filter.fill("src"); await file("src/search.py").waitFor();
    await filter.fill("readme"); await slow;
    await filter.fill("projects.sql"); await file("queries/projects.sql").waitFor();
    await page.waitForTimeout(500);
    check(!await file("README.md").count(), "A stale search replaced the current results");
    await filter.press("Escape"); await file("src/api/search.ts").waitFor();
    await page.getByRole("button", { name: "Hide ignored files", exact: true }).click();
    await file("demo.local.txt").waitFor({ state: "hidden" }); await folder("cache").waitFor();
    await folder("cache").click(); await file("cache/demo.json").waitFor();
    check(!await folder("nested").count(), "An ignored child folder remains visible with ignored files hidden");
    for (const width of [1440, 720, 500]) {
      await page.setViewportSize({ width, height: 800 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Workspace overflows at ${width}px`);
    }
    await page.reload(); await folder("cache").waitFor(); await file("cache/demo.json").waitFor();
    await page.getByRole("button", { name: "Show ignored files", exact: true }).click();
    await folder("nested").waitFor();
    await filter.fill("projects.sql"); await file("queries/projects.sql").click();
    await filter.press("Escape"); await file("queries/projects.sql").waitFor();
    for (const width of [1440, 500]) {
      await page.setViewportSize({ width, height: 800 });
      await page.screenshot({ path: `/private/tmp/kliprun-lazy-files-${width}.png` });
    }
    check(!errors.length, errors.join("; "));
    return { lazyFolders: true, rootAndFolderPages: true, globalSearch: true, searchPages: true, retryAndStaleResponses: true, ignoredTrackedException: true, restoredExpansion: true, selectedSearchResultRevealed: true, layouts: 3, browserErrors: errors.length };
  } finally { page.off("pageerror", onError); await page.unroute("**/api/git/files?*", routeFiles); await context.close(); }
}
