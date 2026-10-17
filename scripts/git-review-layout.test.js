// Playwright callback against fixture-only preview.ts; isolated browser state and no Git writes.
async (page) => {
  const context = await page.context().browser().newContext();
  page = await context.newPage();
  const base = "http://127.0.0.1:18796", root = "/Users/demo/Projects/atlas";
  const check = (value, message) => { if (!value) throw new Error(message); };
  const parameter = (url, name) => decodeURIComponent((url.match(new RegExp(`[?&]${name}=([^&]*)`))?.[1] ?? "").replace(/\+/g, " "));
  const errors = [], actions = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.addInitScript(directory => { window.kliprunGitRepository = directory; }, root);
  await page.route(`${base}/api/git/action`, route => { actions.push(route.request().postDataJSON()); return route.fulfill({ status: 409, json: { error: "Review layout test never writes Git state." } }); });
  const history = (await (await page.request.get(`${base}/api/git/history?directory=${encodeURIComponent(root)}`)).json()).commits;
  const firstCommit = await (await page.request.get(`${base}/api/git/commit?directory=${encodeURIComponent(root)}&revision=${history[0].hash}`)).json();
  const rows = page.locator(".git-history-row");
  const selected = page.locator('.git-history-row[aria-pressed="true"]');
  async function filtered(query, expected) {
    await page.getByRole("textbox", { name: "Search commits", exact: true }).fill(query);
    await page.waitForFunction(count => document.querySelectorAll(".git-history-row").length === count, expected.length);
    const text = await rows.allTextContents();
    check(expected.every(commit => text.some(value => value.includes(commit.subject))), `Commit search omitted an expected result for ${query}`);
  }
  async function selectedCommit(commit) {
    await page.waitForFunction(subject => document.querySelector('.git-history-row[aria-pressed="true"]')?.textContent.includes(subject), commit.subject);
    check((await selected.innerText()).includes(commit.hash.slice(0, 7)), "Selected commit row does not expose its hash");
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/git`);
    await page.locator(".git-diff").waitFor();
    const toolbar = await page.locator(".git-toolbar").boundingBox();
    const picker = page.getByRole("button", { name: "Repository", exact: true });
    const pickerBox = await picker.boundingBox();
    check(toolbar.height <= 40, `Repository toolbar is ${toolbar.height}px tall; expected at most 40px`);
    check(pickerBox.width <= 240, `Repository selector is ${pickerBox.width}px wide; expected at most 240px`);
    check(!/Selected session|Repository folder/.test(await page.locator(".git-toolbar").innerText()), "Toolbar still shows a redundant repository metadata label");
    check((await picker.innerText()).includes("atlas"), "Compact repository selector hides the repository name");
    check(await picker.getAttribute("title") === root, "Repository selector lost its full path tooltip");
    const folder = page.getByRole("button", { name: "Choose Folder…", exact: true });
    check(await folder.isVisible(), "Compact toolbar lost its accessible folder picker");
    check((await folder.innerText()).trim() === "", "Folder picker is not an icon-only control");
    const longRoot = `/Users/demo/Projects/${"long-repository-name-".repeat(12)}`;
    await page.evaluate(directory => window.dispatchEvent(new CustomEvent("kliprun:repository", { detail: directory })), longRoot);
    await page.waitForFunction(directory => document.querySelector('button[aria-label="Repository"]')?.title === directory, longRoot);
    check((await picker.boundingBox()).width <= 240, "Long repository name expands the compact selector");
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "Long repository name overflows the window");
    await page.evaluate(directory => window.dispatchEvent(new CustomEvent("kliprun:repository", { detail: directory })), root);
    await page.waitForFunction(directory => document.querySelector('button[aria-label="Repository"]')?.title === directory, root);
    await page.locator(".git-file-action").first().waitFor();
    const sidebar = await page.locator(".git-sidebar").boundingBox(), pane = await page.locator(".git-diff-pane").boundingBox();
    check(sidebar.x > pane.x && sidebar.x >= pane.x + pane.width - 1, "Repository panel is not on the right of the review area");
    const changeRow = page.locator(".git-file").filter({ has: page.locator(".git-file-action") }).first();
    const stageBox = await changeRow.locator(".git-file-action").boundingBox();
    const nameBox = await changeRow.locator(".git-file-name").boundingBox();
    check(stageBox.x + stageBox.width <= nameBox.x, "Staging control does not precede the filename");
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await rows.first().waitFor();
    await Promise.all([
      page.waitForResponse(response => response.url().startsWith(`${base}/api/git/diff?`) && parameter(response.url(), "revision") === history[0].hash && parameter(response.url(), "path") === firstCommit.files[0].path),
      rows.first().click(),
    ]);
    await page.locator(".git-diff").waitFor();
    check(await page.locator(".git-diff-heading strong").getAttribute("title") === firstCommit.files[0].path, "Selecting a commit did not automatically open its first file diff");
    await selectedCommit(history[0]);
    await filtered(history[0].author.toLowerCase(), history.filter(commit => commit.author.toLowerCase().includes(history[0].author.toLowerCase())));
    await filtered(history[1].subject, [history[1]]);
    await filtered(history[2].hash.slice(0, 7), [history[2]]);
    await filtered("no such fixture commit", []);
    await page.getByText("No matching commits.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear commit search", exact: true }).click();
    check(await rows.count() === history.length, "Clearing commit search did not restore the loaded history");
    await rows.first().focus(); await rows.first().press("ArrowDown"); await selectedCommit(history[1]);
    check((await page.locator(".git-history-row:focus").innerText()).includes(history[1].subject), "ArrowDown did not move commit focus");
    await page.locator(".git-history-row:focus").press("End"); await selectedCommit(history.at(-1));
    await page.locator(".git-history-row:focus").press("Home"); await selectedCommit(history[0]);
    await page.locator(".git-diff").waitFor();
    await page.getByRole("button", { name: "Close diff", exact: true }).click();
    await Promise.all([
      page.waitForResponse(response => response.url().startsWith(`${base}/api/git/commit?`) && parameter(response.url(), "revision") === history[0].hash),
      page.getByRole("button", { name: "Refresh repository", exact: true }).click(),
    ]);
    await page.waitForTimeout(150);
    check(await page.getByRole("button", { name: "Close diff", exact: true }).count() === 0, "History refresh reopened the closed diff");
    check(await page.locator(".git-diff").count() === 0, "Closed history diff is still rendered");
    await rows.first().click(); await page.locator(".git-diff").waitFor();
    check(await page.getByRole("button", { name: "Close diff", exact: true }).count() === 1, "Explicitly selecting the commit did not reopen its diff");
    await page.setViewportSize({ width: 500, height: 700 });
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "Review layout overflows a small window");
    check(await folder.isVisible(), "Compact folder picker disappears in a small window");
    check(!actions.length, "Review navigation unexpectedly tried to write Git state");
    check(!errors.length, `Browser errors: ${errors.join("; ")}`);
    return { compactToolbar: true, rightPanel: true, stagingBeforeFilename: true, search: ["author", "message", "hash"], keyboardHistory: true, automaticFirstDiff: true, closeSurvivesRefresh: true, layouts: 2 };
  } finally { await context.close(); }
}
