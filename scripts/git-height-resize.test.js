// Fixture-only Playwright callback; these checks never submit a commit or change Git state.
async (page, base = "http://127.0.0.1:18796") => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const commit = page.getByRole("textbox", { name: "Commit message", exact: true });
  let actions = 0;
  const rejectAction = route => { actions++; return route.fulfill({ status: 409, json: { error: "Fixture-only resize test" } }); };
  await page.route("**/api/git/action", rejectAction);
  const height = async target => (await target.boundingBox()).height;
  async function drag(handle, delta) {
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + delta, { steps: 8 }); await page.mouse.up();
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    await page.evaluate(() => { localStorage.removeItem("kliprun.git.commit-height"); localStorage.removeItem("kliprun.git.changed-files-height"); });
    await page.reload();
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("option").filter({ hasText: "atlas" }).click();
    const commitHandle = page.getByRole("separator", { name: "Resize commit message", exact: true });
    check(await commitHandle.count() === 1, "Commit message has no height divider");
    await commit.fill("Resize-only draft");
    const initial = await height(commit);
    await drag(commitHandle, -100);
    check(Math.abs(await height(commit) - initial - 100) <= 2, "Commit field did not grow with the divider");
    check(await commit.inputValue() === "Resize-only draft", "Resizing lost the commit draft");
    await commitHandle.focus(); await commitHandle.press("ArrowUp");
    const commitHeight = await height(commit);
    check(Math.abs(commitHeight - initial - 120) <= 2, "Commit divider keyboard resizing failed");
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.locator(".git-history-row").first().click();
    const files = page.locator(".git-commit-files"); await files.waitFor();
    await files.locator(".git-file-select").first().waitFor();
    const filesHandle = page.getByRole("separator", { name: "Resize changed files", exact: true });
    check(await filesHandle.count() === 1, "Changed files has no height divider");
    const filesInitial = await height(files);
    await drag(filesHandle, -100);
    check(Math.abs(await height(files) - filesInitial - 100) <= 2, "Changed files did not grow with the divider");
    await filesHandle.focus(); await filesHandle.press("ArrowDown");
    const filesHeight = await height(files);
    check(Math.abs(filesHeight - filesInitial - 80) <= 2, "Changed-files keyboard resizing failed");
    await page.getByRole("tab", { name: /^Changes/ }).click();
    await page.waitForFunction(expected => Math.abs(document.querySelector('.git-commit-form textarea').getBoundingClientRect().height - expected) <= 2, commitHeight);
    check(Math.abs(await height(commit) - commitHeight) <= 2, "Switching tabs lost the commit height");
    check(await commit.inputValue() === "Resize-only draft", "Switching tabs lost the commit draft");
    await page.screenshot({ path: "/private/tmp/kliprun-resized-commit.png" });
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.locator(".git-history-row").first().click();
    await page.waitForFunction(expected => Math.abs(document.querySelector('.git-commit-files')?.getBoundingClientRect().height - expected) <= 2, filesHeight);
    check(Math.abs(await height(files) - filesHeight) <= 2, "Switching tabs lost the changed-files height");
    await page.screenshot({ path: "/private/tmp/kliprun-resized-changed-files.png" });
    for (const width of [1440, 900, 500]) {
      await page.setViewportSize({ width, height: 760 });
      await drag(filesHandle, -1800);
      const listHeight = await height(page.locator(".git-sidebar-content"));
      check(listHeight >= 60, `Resizing hid the commit list at ${width}`);
      const fits = await page.locator(".git-sidebar").evaluate(el => el.scrollHeight <= el.clientHeight + 2);
      check(fits, `Resizing pushed controls outside the panel at ${width}`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Layout overflows at ${width}`);
      await page.getByRole("tab", { name: /^Changes/ }).click();
      await drag(commitHandle, -1800);
      check(await height(page.locator(".git-sidebar-content")) >= 60, `Commit resize hid the changes at ${width}`);
      check(await commit.inputValue() === "Resize-only draft", `Commit resize lost text at ${width}`);
      check(await page.locator(".git-sidebar").evaluate(el => el.scrollHeight <= el.clientHeight + 2), `Commit controls overflow at ${width}`);
      await page.getByRole("tab", { name: "History", exact: true }).click();
      await page.locator(".git-history-row").first().click();
    }
    check(actions === 0, "Resizing submitted a Git action");
    return { commitHeight: true, changedFilesHeight: true, pointer: true, keyboard: true, draftPreserved: true, tabRestoration: true, layouts: 3, gitWrites: actions };
  } finally { await page.unroute("**/api/git/action", rejectAction); }
}
