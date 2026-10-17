// Playwright callback against the fixture-only preview; reproduces Bun's real HTTP header limit.
async (page, base = "http://127.0.0.1:18796") => {
  const context = await page.context().browser().newContext(); page = await context.newPage(); page.setDefaultTimeout(5000);
  const response = await page.request.get(`${base}/api/session-catalog`);
  const seed = await response.json();
  const projects = Array.from({ length: 100 }, (_, index) => `/Users/demo/Projects/archives/${String(index).padStart(3, "0")}-${"project".repeat(19)}/worktrees/session`);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await context.addInitScript(() => {
    window.kliprunGitRepository = "/Users/demo/Projects/atlas";
    window.__repositoryRequests = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const response = await originalFetch(input, options);
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      if (url.pathname === "/api/git/repositories") window.__repositoryRequests.push({ url: url.href, status: response.status });
      return response;
    };
  });
  await page.route(`${base}/api/session-catalog`, route => route.fulfill({ json: { ...seed, sessions: [...seed.sessions, ...projects.map((directory, i) => ({ ...seed.sessions[0], id: `ses_demo_discovery_${i}`, directory }))] } }));
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${base}/git`);
    // Two live fixture projects precede the 100 archived candidates in App.
    await page.waitForFunction(last => window.__repositoryRequests.some(request =>
      new URL(request.url).searchParams.getAll("directory").includes(last)), projects[97]);
    const requests = await page.evaluate(() => window.__repositoryRequests);
    const pathLengths = requests.map(request => request.url.slice(base.length).length);
    assert(Math.max(...pathLengths) <= 6000, `Repository discovery sent an oversized URL: ${Math.max(...pathLengths)} bytes`);
    assert(requests.every(request => request.status === 200), `Repository discovery failed: ${requests.map(request => request.status).join(", ")}`);
    await page.waitForFunction(() => !document.querySelector('.git-feedback[role="alert"]'));
    await page.locator('.git-file-select[title="src/api/search.ts"]').waitFor();
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    const options = await page.getByRole("option").count();
    assert(options === 2, "Merging repository batches duplicated roots");
    return { batches: requests.length, maxUrlBytes: Math.max(...pathLengths), successfulRequests: true, noGitError: true };
  } finally { await context.close(); }
}
