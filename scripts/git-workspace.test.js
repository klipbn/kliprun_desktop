// Playwright callback; run against the fixture-only preview after building the client.
async (page) => {
  const base = "http://127.0.0.1:18796";
  const root = "/Users/demo/Projects/atlas";
  const fixture = await (await page.request.get(`${base}/api/git/status?directory=${encodeURIComponent(root)}`)).json();
  let state = JSON.parse(JSON.stringify(fixture)), failCommit = true;
  const actions = [], errors = [], outside = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errorListener = error => errors.push(error.message);
  const requestListener = request => { if (!request.url().startsWith(`${base}/`)) outside.push(request.url()); };
  page.on("pageerror", errorListener); page.on("request", requestListener);
  await page.route(`${base}/api/git/status?*`, route => route.fulfill({ json: { ...state, root: decodeURIComponent(route.request().url().match(/[?&]directory=([^&]*)/)[1].replace(/\+/g, " ")) } }));
  await page.route(`${base}/api/git/action`, async route => {
    const body = route.request().postDataJSON(); actions.push(body);
    await page.waitForTimeout(120);
    if (body.action === "commit" && failCommit) return route.fulfill({ status: 409, json: { error: "Demo hook rejected this commit." } });
    if (body.action === "commit") {
      state.files = state.files.filter(file => file.worktree !== " ").map(file => ({ ...file, index: file.index === "?" ? "?" : " ", staged: { additions: 0, deletions: 0 } }));
      state.head = "f".repeat(40);
    }
    if (body.action === "switch-branch" || body.action === "create-branch") {
      const branch = state.branches.find(branch => branch.name === body.branch);
      state.branch = body.branch;
      state.upstream = branch?.upstream ?? null;
      if (!branch) state.branches.push({ name: body.branch, current: false, remote: false, upstream: null, author: "Morgan Lee", date: 1791975600000, subject: "Add project filters to search" });
      state.branches = state.branches.map(branch => ({ ...branch, current: !branch.remote && branch.name === body.branch }));
    }
    if (body.action === "push" && !state.upstream) {
      state.upstream = `${body.remote}/${state.branch}`;
      state.branches = state.branches.map(branch => branch.current ? { ...branch, upstream: state.upstream } : branch);
    }
    if (body.action === "stage" || body.action === "unstage") state.files = state.files.map(file => body.paths.includes(file.path) ? {
      ...file, index: body.action === "stage" ? (file.index === "?" ? "A" : "M") : " ",
      worktree: body.action === "stage" ? " " : "M", staged: body.action === "stage" ? file.unstaged : { additions: 0, deletions: 0 },
    } : file);
    return route.fulfill({ json: { ok: true } });
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    await page.locator('.git-file-select[title="src/api/search.ts"]').waitFor();
    const tabs = await page.locator('header [data-testid$="-button"]').evaluateAll(elements => elements.filter(element => ["kanban-button", "git-button", "statistics-button", "office-button", "usage-button"].includes(element.dataset.testid)).map(element => element.getAttribute("aria-label")));
    assert(tabs.join("|") === "Kanban|Git|Office|Usage|Statistics", "Navigation order is incorrect");
    await page.locator('.git-file-select[title="src/api/search.ts"]').click();
    await page.locator(".git-diff").waitFor();
    assert((await page.locator(".git-diff").innerText()).includes("query.trim()"), "Working diff did not render");
    let delayedDiff;
    const olderDiff = await (await page.request.get(`${base}/api/git/diff?directory=${encodeURIComponent(root)}&path=README.md&mode=unstaged`)).json();
    await page.route(`${base}/api/git/diff?*`, async route => {
      if (route.request().url().includes("path=README.md")) { delayedDiff = route; return; }
      await route.continue();
    });
    await page.locator('.git-file-select[title="README.md"]').click();
    for (let i = 0; i < 100 && !delayedDiff; i++) await page.waitForTimeout(5);
    assert(delayedDiff, "Delayed diff was not requested");
    await page.locator('.git-file-select[title="src/api/search.ts"]').click(); await page.locator(".git-diff").waitFor();
    await delayedDiff.fulfill({ json: olderDiff }).catch(() => {});
    assert((await page.locator(".git-diff-heading").innerText()).includes("src/api/search.ts"), "A stale request replaced the selected file");
    assert((await page.locator(".git-diff").innerText()).includes("query.trim()"), "A stale response replaced the current diff");
    await page.unroute(`${base}/api/git/diff?*`);
    await page.getByRole("button", { name: "Stage src/api/search.ts", exact: true }).click();
    await page.getByRole("button", { name: "Unstage src/api/search.ts", exact: true }).waitFor();
    await page.getByRole("button", { name: "Unstage src/api/search.ts", exact: true }).click();
    await page.getByRole("button", { name: "Stage src/api/search.ts", exact: true }).waitFor();

    await page.getByRole("textbox", { name: "Commit message", exact: true }).fill("Add scoped search");
    await page.getByTestId("kanban-button").click(); await page.getByTestId("git-button").click();
    await page.getByRole("textbox", { name: "Commit message", exact: true }).waitFor();
    assert(await page.getByRole("textbox", { name: "Commit message", exact: true }).inputValue() === "Add scoped search", "Navigating between tabs lost the commit message");
    await page.getByRole("button", { name: "Commit staged", exact: true }).click();
    const dialog = page.locator(".git-confirmation[open]"); await dialog.waitFor();
    assert(actions.length === 2, `Unexpected operations before confirmation: ${JSON.stringify(actions)}`);
    assert((await dialog.innerText()).includes("feature/search"), "Confirmation omitted the branch");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert(actions.length === 2, "Cancel performed an operation");
    await page.getByRole("button", { name: "Commit staged", exact: true }).click();
    await dialog.getByRole("button", { name: "Commit", exact: true }).click();
    await page.getByRole("alert").getByText("Demo hook rejected this commit.", { exact: true }).waitFor();
    await page.waitForTimeout(2700);
    assert(await page.getByRole("alert").isVisible(), "A Git error disappeared before it could be reviewed");
    assert(await page.getByRole("textbox", { name: "Commit message", exact: true }).inputValue() === "Add scoped search", "Failed commit lost the message");
    assert(actions.at(-1).expected.branch === "feature/search" && actions.at(-1).expected.head === fixture.head, "Commit did not preserve the confirmed HEAD");
    failCommit = false;
    await page.getByRole("button", { name: "Commit staged", exact: true }).click();
    await dialog.getByRole("button", { name: "Commit", exact: true }).click();
    await page.getByText("Commit completed.", { exact: true }).waitFor();
    assert(await page.getByRole("button", { name: "Dismiss notification", exact: true }).count() === 0, "Success still requires closing a notification");
    assert(await page.getByRole("textbox", { name: "Commit message", exact: true }).inputValue() === "", "Successful commit did not clear the message");
    assert(await page.getByRole("button", { name: "Commit staged", exact: true }).isDisabled(), "Commit remained enabled without staged files");
    await page.getByText("Commit completed.", { exact: true }).waitFor({ state: "hidden", timeout: 4500 });
    const layoutBefore = await page.locator(".git-layout").boundingBox();
    await page.getByRole("button", { name: "Pull", exact: true }).click();
    assert(await page.locator("dialog[open]").count() === 0, "Pull still opens a confirmation window");
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".git-remote-controls button")).some(button => button.textContent.trim() === "Pull" && !button.disabled));
    assert(actions.at(-1).action === "pull", "Pull did not run immediately");
    assert(await page.getByText("Pull completed.", { exact: true }).count() === 0, "Pull displayed a success notification");
    const layoutAfter = await page.locator(".git-layout").boundingBox();
    assert(layoutBefore.y === layoutAfter.y && layoutBefore.height === layoutAfter.height, "Success notification shifted the workspace");
    for (const name of ["Fetch", "Fetch", "Push"]) {
      await page.getByRole("button", { name, exact: true }).click();
      assert(await page.locator("dialog[open]").count() === 0, `${name} still opens a confirmation window`);
      await page.waitForFunction(label => Array.from(document.querySelectorAll(".git-remote-controls button")).some(button => button.textContent.trim() === label && !button.disabled), name);
      assert(actions.at(-1).action === name.toLowerCase() && actions.at(-1).remote === "origin", `${name} did not immediately use the configured remote`);
      assert(await page.locator(".git-toast").count() === 0, `${name} displayed a success notification`);
    }
    assert(await page.getByRole("combobox", { name: "Remote", exact: true }).count() === 0, "The redundant remote selector is still visible");
    assert(await page.locator(".git-remote-controls .git-branch-toggle").count() === 1, "Branch selection is not in the bottom action row");
    await page.locator(".git-branch-toggle").click();
    const branchSearch = page.getByRole("combobox", { name: "Switch or create a branch", exact: true });
    assert(await branchSearch.evaluate(element => element === document.activeElement), "Branch search did not receive focus");
    await page.getByRole("group", { name: "Local Branches", exact: true }).waitFor();
    assert((await page.getByRole("option", { name: "Switch to main", exact: true }).innerText()).includes("Improve keyboard navigation"), "Branch rows omit their last commit");
    await branchSearch.fill("main");
    assert(await page.locator(".git-branch-popover").getByRole("option").count() === 2, "Branch filtering did not narrow local and remote choices");
    await page.getByRole("option", { name: "Switch to main", exact: true }).click();
    await page.getByText("Switch branch completed.", { exact: true }).waitFor();
    assert(await page.locator("dialog[open]").count() === 0, "Switching a branch opened an extra dialog");
    assert(actions.at(-1).action === "switch-branch" && actions.at(-1).branch === "main", "Selecting a branch did not switch it directly");
    await page.locator(".git-branch-name").getByText("main", { exact: true }).waitFor();
    await page.locator(".git-branch-toggle").click(); await branchSearch.fill("feature/quick-picker");
    await branchSearch.press("Enter");
    await page.locator(".git-branch-name").getByText("feature/quick-picker", { exact: true }).waitFor();
    assert(actions.at(-1).action === "create-branch" && actions.at(-1).branch === "feature/quick-picker", "Typing a new branch did not create it directly");
    assert(await page.locator("dialog[open]").count() === 0, "Branch creation opened an extra dialog");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    assert(await page.locator("dialog[open]").count() === 0, "Publishing a branch still opens a confirmation window");
    await page.getByRole("button", { name: "Push", exact: true }).waitFor();
    assert(actions.at(-1).action === "push" && actions.at(-1).expected.branch === "feature/quick-picker", "Publish did not run for the selected branch");
    assert(await page.locator(".git-toast").count() === 0, "Publish displayed a success notification");
    await page.locator(".git-branch-toggle").click(); await branchSearch.fill("feature/search"); await branchSearch.press("Enter");
    await page.locator(".git-branch-name").getByText("feature/search", { exact: true }).waitFor();
    await page.locator(".git-branch-toggle").click();
    const firstActive = await branchSearch.getAttribute("aria-activedescendant");
    await branchSearch.press("ArrowDown"); assert(await branchSearch.getAttribute("aria-activedescendant") !== firstActive, "Arrow keys did not move the active branch");
    await branchSearch.press("ArrowUp"); assert(await branchSearch.getAttribute("aria-activedescendant") === firstActive, "Arrow keys did not restore the active branch");
    await branchSearch.press("Escape");
    assert(await page.locator(".git-branch-popover").count() === 0, "Escape did not close branch selection");
    assert(await page.locator(".git-branch-toggle").evaluate(element => element === document.activeElement), "Escape did not restore focus to the branch button");
    await page.locator(".git-branch-toggle").click(); await page.locator(".git-diff-heading").click();
    assert(await page.locator(".git-branch-popover").count() === 0, "Clicking outside did not close branch selection");

    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.locator(".git-history-row").first().click();
    await page.locator('.git-commit-files .git-file-select[title="src/api/search.ts"]').click();
    await page.locator(".git-diff").waitFor();
    for (const [width, height] of [[1440, 500], [760, 650], [500, 700]]) {
      await page.setViewportSize({ width, height });
      const dimensions = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, diffHeight: document.querySelector(".git-diff-scroll").getBoundingClientRect().height }));
      assert(!dimensions.overflow && dimensions.diffHeight >= 80, `Diff is unusable at ${width}×${height}: ${JSON.stringify(dimensions)}`);
      await page.getByRole("button", { name: "Push", exact: true }).scrollIntoViewIfNeeded();
      await page.locator(".git-branch-toggle").click();
      const box = await page.locator(".git-branch-popover").boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `Branch picker overflows at ${width}×${height}`);
      await branchSearch.press("Escape");
    }
    assert(!errors.length, `Browser errors: ${errors.join("; ")}`);
    assert(!outside.length, "Preview made external requests");
    return { layouts: 4, actions: actions.map(action => action.action), browserErrors: errors.length, externalRequests: outside.length };
  } finally {
    await page.unroute(`${base}/api/git/diff?*`);
    await page.unroute(`${base}/api/git/status?*`); await page.unroute(`${base}/api/git/action`);
    page.off("pageerror", errorListener); page.off("request", requestListener);
  }
}
