// Playwright callback. All rendered data comes from mock-api.json via preview.ts.
async (page, directory = "docs/screenshots") => {
  const base = "http://127.0.0.1:18796";
  const external = [];
  const listener = request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); };
  page.on("request", listener);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/git`);
    await page.evaluate(() => { localStorage.removeItem("kliprun.git.sidebar-width"); localStorage.removeItem("kliprun.git.changes-view"); });
    await page.reload();
    await page.locator('.git-file-select[title="src/api/search.ts"]').click();
    await page.locator(".git-diff-heading").getByText("src/api/search.ts", { exact: true }).waitFor();
    await page.locator(".git-diff").waitFor();
    await page.screenshot({ path: `${directory}/git-changes.png`, animations: "disabled" });
    await page.getByRole("button", { name: "Changes view settings", exact: true }).click();
    await page.getByRole("menu", { name: "Changes view settings", exact: true }).waitFor();
    await page.screenshot({ path: `${directory}/git-changes-settings.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page.locator(".git-history-row").first().click();
    await page.locator('.git-commit-files .git-file-select[title="src/api/search.ts"]').click();
    await page.locator(".git-diff").waitFor();
    await page.screenshot({ path: `${directory}/git-history.png`, animations: "disabled" });
    await page.getByRole("tab", { name: "Changes", exact: false }).click();
    await page.locator(".git-branch-toggle").click();
    await page.locator(".git-branch-popover").waitFor();
    await page.screenshot({ path: `${directory}/git-branches.png`, animations: "disabled" });
    await page.getByRole("combobox", { name: "Switch or create a branch", exact: true }).press("Escape");
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(base);
    await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    await page.locator("dialog[open]").waitFor();
    await page.screenshot({ path: `${directory}/shortcuts.png`, animations: "disabled" });
    if (external.length) throw new Error("Capture made external requests");
    return { captures: ["git-changes.png", "git-changes-settings.png", "git-history.png", "git-branches.png", "shortcuts.png"], externalRequests: external.length };
  } finally { page.off("request", listener); }
}
