// Playwright callback. Build the client and serve `bun docs/screenshots/preview.ts` first.
async (page) => {
  const base = "http://127.0.0.1:18796";
  let remote = true;
  await page.route(`${base}/api/session/*`, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    await route.fulfill({ json: { ...detail, branch: "feature/details",
      repository_url: remote ? "https://github.com/demo/aurora/tree/feature%2Fdetails" : null } });
  });
  try {
    for (const width of [1440, 900]) {
      remote = true;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await page.getByRole("button", { name: "Implement search API", exact: true }).click();
      const panel = page.getByTestId("details-panel");
      await panel.getByTestId("repository-link").waitFor({ timeout: 3000 });
      const tabs = await panel.locator('[data-testid^="tab-"]').allTextContents();
      if (tabs.join("|") !== "User|Agents T|Agent|Models|Kanban") throw new Error(`Unexpected tabs: ${tabs}`);
      if (await panel.getByRole("button", { name: /iTerm2/ }).count()) throw new Error("iTerm2 button is still present");
      const link = panel.getByTestId("repository-link");
      if (await link.getAttribute("href") !== "https://github.com/demo/aurora/tree/feature%2Fdetails" ||
        await link.getAttribute("target") !== "_blank") throw new Error("Branch does not link to the remote in a browser");
      for (const source of ["codex", "opencode"]) {
        const icons = page.getByTestId(`harness-icon-${source}`);
        await icons.first().waitFor();
        if (!await icons.first().evaluate(img => img.complete && img.naturalWidth > 0)) throw new Error(`${source} icon failed to load`);
      }
      await panel.getByTestId("tab-user").click();
      await panel.getByTestId("detail-message").first().waitFor();
      await panel.getByTestId("tab-agent").click();
      await panel.getByTestId("detail-message").first().waitFor();
      await panel.getByTestId("tab-kanban").click();
      await panel.getByText("Status history and time spent in each state.", { exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/kliprun-session-details-${width}.png` });
      await panel.getByRole("button", { name: "Hide details", exact: true }).click();
      await panel.waitFor({ state: "detached" });
      const showDetails = page.getByRole("button", { name: "Show details", exact: true });
      await showDetails.waitFor();
      await page.getByTestId("card-ses_demo_checks").click();
      await showDetails.waitFor();
      if (await panel.count()) throw new Error("Selecting another session reopened hidden details");
      await showDetails.click();
      await panel.locator("h2").getByText("Run integration checks", { exact: true }).waitFor();
      remote = false;
      await panel.getByRole("button", { name: "Close details" }).click();
      await panel.waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Implement search API", exact: true }).click();
      await panel.getByText("feature/details", { exact: true }).waitFor();
      if (await panel.getByTestId("repository-link").count()) throw new Error("A repository without a remote must not get a link");
    }
    return "Details verified at 1440px and 900px: branch link and no-remote fallback, tab order, User/Agent content, Kanban caption, collapse/reopen and hidden selection, both harness icons, no All or iTerm2.";
  } finally {
    await page.unroute(`${base}/api/session/*`);
  }
}
