// Playwright callback against the fixture-only preview; never opens live repositories.
async (page) => {
  const context = await page.context().browser().newContext(); page = await context.newPage();
  const base = "http://127.0.0.1:18796";
  const atlas = "/Users/demo/Projects/atlas", aurora = "/Users/demo/Projects/aurora", notes = "/Users/demo/Projects/notes";
  const fixture = await (await page.request.get(`${base}/api/git/status?directory=${encodeURIComponent(atlas)}`)).json();
  const recent = await (await page.request.get(`${base}/api/recent-sessions`)).json();
  recent.sessions.find(session => session.id === "ses_demo_previous_rollout").directory = notes;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  let pendingAction, unavailable = false;
  const actions = [], errors = [];
  const onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await context.addInitScript(({ atlas }) => {
    window.kliprunGitRepository = atlas;
    window.kliprunTerminalSessionId = "ses_demo_review";
  }, { atlas });
  await page.route(`${base}/api/recent-sessions`, route => route.fulfill({ json: recent }));
  await page.route(`${base}/api/git/status?*`, route => {
    const directory = decodeURIComponent(route.request().url().match(/[?&]directory=([^&]*)/)[1].replace(/\+/g, " "));
    return directory === notes || unavailable
      ? route.fulfill({ status: 404, json: { error: "This directory is not a Git working tree." } })
      : route.fulfill({ json: { ...fixture, root: directory.replace(/\/src$/, "") } });
  });
  await page.route(`${base}/api/git/diff?*`, route => route.fulfill({ json: {
    patch: `@@ -0,0 +1 @@\n+Repository: ${decodeURIComponent(route.request().url().match(/[?&]directory=([^&]*)/)[1].replace(/\+/g, " "))}\n`, binary: false, truncated: false,
  } }));
  await page.route(`${base}/api/git/action`, route => { actions.push(route.request().postDataJSON()); pendingAction = route; });
  const repository = page.getByRole("button", { name: "Repository", exact: true });
  const message = page.getByRole("textbox", { name: "Commit message", exact: true });
  async function waitForRepository(directory) {
    await page.waitForFunction(value => document.querySelector('button[aria-label="Repository"]')?.title === value, directory, { timeout: 5000 });
    await page.locator(".git-diff").getByText(`+Repository: ${directory}`, { exact: true }).waitFor();
  }
  async function selectSession(id) {
    await page.evaluate(value => window.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: value })), id);
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/git`);
    await waitForRepository(aurora);
    assert((await page.locator(".git-repository-picker").innerText()).includes("Selected session"), "Repository context does not explain the session link");
    await message.fill("Aurora draft");
    await selectSession("ses_demo_search"); await waitForRepository(atlas);
    await message.fill("Atlas draft");
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.locator(".git-history-row").first().click();
    await selectSession("ses_demo_previous_rollout");
    await page.getByRole("region", { name: "Diff viewer" }).getByText("No Git repository", { exact: true }).waitFor();
    assert(await repository.getAttribute("title") === notes, "A session without Git fell back to a different repository");
    assert(await page.locator(".git-file-select,.git-history-row,.git-diff").count() === 0, "Old repository content survived a session without Git");
    assert(await page.getByRole("tab", { name: /Changes/ }).getAttribute("aria-selected") === "true", "Session switching did not return to working changes");
    assert(await page.getByRole("button", { name: "Commit staged", exact: true }).isDisabled(), "Commit is enabled without a repository");
    assert(await page.getByRole("button", { name: "Choose Folder…", exact: true }).isVisible(), "The empty state has no clear folder picker");
    await page.setViewportSize({ width: 500, height: 700 });
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "The no-repository layout overflows a small window");
    await page.setViewportSize({ width: 1440, height: 900 });
    await selectSession("ses_demo_review"); await waitForRepository(aurora);
    assert(await message.inputValue() === "Aurora draft", "Switching repositories lost the original draft");
    await repository.click(); await page.getByRole("option").filter({ hasText: atlas }).click(); await waitForRepository(atlas);
    assert(await message.inputValue() === "Atlas draft", "Manual repository selection lost its draft");
    await selectSession("ses_demo_release"); await waitForRepository(aurora);
    await page.getByRole("button", { name: "Commit staged", exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('textarea[aria-label="Commit message"]')?.disabled);
    await selectSession("ses_demo_search");
    assert(await repository.getAttribute("title") === aurora, "Repository changed while a write was still running");
    assert(pendingAction && actions.at(-1).directory === aurora, "Commit targeted a different session's repository");
    await pendingAction.fulfill({ json: { ok: true } }); pendingAction = null;
    await waitForRepository(atlas);
    assert(await message.inputValue() === "Atlas draft", "Completing the old session's commit cleared the new session's draft");
    // A native folder pick may be a nested directory; Git resolves the working-tree root.
    await page.evaluate(directory => window.dispatchEvent(new CustomEvent("kliprun:repository", { detail: directory })), `${atlas}/src`);
    await waitForRepository(atlas);
    assert(await message.inputValue() === "Atlas draft", "Resolving a nested folder lost the repository draft");
    await page.evaluate(() => { delete window.webkit; });
    assert(await page.getByRole("textbox", { name: "Repository directory", exact: true }).count() === 0, "The manual path form is always visible");
    await page.getByRole("button", { name: "Choose Folder…", exact: true }).click();
    await page.getByRole("textbox", { name: "Repository directory", exact: true }).fill(notes);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("region", { name: "Diff viewer" }).getByText("No Git repository", { exact: true }).waitFor();
    assert((await page.locator(".git-repository-picker").innerText()).includes("Repository folder"), "Manual folder selection still claims to follow the session");
    await repository.click(); await page.getByRole("option").filter({ hasText: atlas }).click(); await waitForRepository(atlas);
    unavailable = true;
    await page.getByRole("button", { name: "Refresh repository", exact: true }).click();
    await page.getByRole("region", { name: "Diff viewer" }).getByText("No Git repository", { exact: true }).waitFor();
    assert(await page.locator(".git-file-select").count() === 0, "A repository that disappeared still shows cached files");
    assert(await page.getByRole("button", { name: "Commit staged", exact: true }).isDisabled(), "Commit is enabled for a repository that disappeared");
    assert(!errors.length, `Browser errors: ${errors.join("; ")}`);
    return { sessionSelection: true, noRepository: true, drafts: true, switchDuringCommit: true, nestedFolder: true };
  } finally {
    if (pendingAction) await pendingAction.fulfill({ status: 409, json: { error: "Test cancelled." } }).catch(() => {});
    await page.unroute(`${base}/api/recent-sessions`);
    await page.unroute(`${base}/api/git/status?*`); await page.unroute(`${base}/api/git/diff?*`); await page.unroute(`${base}/api/git/action`);
    page.off("pageerror", onError);
    await context.close();
  }
}
