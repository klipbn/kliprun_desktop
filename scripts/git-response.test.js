// Playwright callback against the fixture-only preview; no repository writes are performed.
async (page) => {
  const context = await page.context().browser().newContext(); page = await context.newPage(); page.setDefaultTimeout(5000);
  const base = "http://127.0.0.1:18796";
  await context.addInitScript(() => { window.kliprunGitRepository = "/Users/demo/Projects/atlas"; });
  let failure = "html", writes = 0;
  const errors = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${base}/api/git/status?*`, route => failure === "html"
    ? route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html>Fallback page</html>" })
    : failure === "truncated"
    ? route.fulfill({ status: 200, contentType: "application/json", body: '{"root":' })
    : route.continue());
  await page.route(`${base}/api/git/action`, route => { writes++; return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html>Fallback page</html>" }); });
  try {
    await page.goto(`${base}/git`);
    await page.getByRole("alert").getByText(/Restart KlipRun/).waitFor();
    assert(!await page.getByRole("button", { name: "Commit staged", exact: true }).isEnabled(), "A bad status response enabled commits");
    failure = "truncated";
    await page.getByRole("button", { name: "Refresh repository", exact: true }).click();
    await page.getByRole("alert").getByText(/Refresh the repository/).waitFor();
    failure = "none";
    await page.getByRole("button", { name: "Refresh repository", exact: true }).click();
    await page.locator('.git-file-select[title="src/api/search.ts"]').waitFor();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    await page.getByRole("textbox", { name: "Commit message", exact: true }).fill("Preserve this draft");
    await page.getByRole("button", { name: "Commit staged", exact: true }).click();
    await page.getByRole("alert").getByText(/Restart KlipRun/).waitFor();
    await page.waitForTimeout(200);
    assert(writes === 1, "An ambiguous commit response triggered an automatic retry");
    assert(await page.getByRole("textbox", { name: "Commit message", exact: true }).inputValue() === "Preserve this draft", "An unexpected response lost the commit draft");
    assert(!await page.getByRole("alert").getByText(/expected pattern|Unexpected token/).count(), "The UI exposed a raw browser parse error");
    assert(!errors.length, `Browser errors: ${errors.join("; ")}`);
    return { htmlResponse: true, truncatedResponse: true, refreshRecovery: true, noWriteRetry: true, draftPreserved: true };
  } finally { await context.close(); }
}
