// Playwright callback against docs/screenshots/preview.ts; native actions are recorded only.
async (page, base = "http://127.0.0.1:18796") => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const layouts = [];
  for (const width of [1440, 900, 500]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await page.getByTestId("new-claude-button").waitFor();
    const order = await page.locator('[aria-label="Agent terminals"] button').evaluateAll(buttons => buttons.map(b => b.getAttribute("aria-label")));
    assert(order.join("|") === "New OpenCode|New Codex|New Claude Code|Terminal", `Wrong agent button order at ${width}`);
    const button = page.getByRole("button", { name: "New Claude Code", exact: true });
    assert((await button.getAttribute("title")).includes("⌘⇧A"), "Missing Claude shortcut tooltip");
    await button.locator("img").evaluate(img => img.decode());
    await page.evaluate(() => { window.__claudeActions = []; window.webkit.messageHandlers.desktopAction.postMessage = action => window.__claudeActions.push(action); });
    await button.click();
    assert((await page.evaluate(() => window.__claudeActions)).join() === "new-claude", "Wrong native launch action");
    const buttons = await page.locator('header button[data-testid]').evaluateAll(elements => elements.map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.testid, x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
    for (const a of buttons) for (const b of buttons) if (a.id < b.id) assert(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `Overlapping ${a.id} and ${b.id} at ${width}`);
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `Horizontal overflow at ${width}`);
    for (const theme of ["graphite", "paper"]) {
      await page.evaluate(theme => { window.kliprunPreferences = { theme, reduceMotion: true }; window.dispatchEvent(new Event("kliprun:preferences")); }, theme);
      assert(await button.isVisible(), `Claude launch hidden in ${theme}`);
    }
    const footer = page.getByRole("button", { name: "Claude Code. Open Usage", exact: true });
    await footer.waitFor();
    assert(await footer.getByRole("meter", { name: "Claude Code 5-hour: 72.5% remaining", exact: true }).isVisible(), "Missing Claude footer limit");
    const providers = await page.locator(".status-quota-name").allTextContents();
    assert(providers.indexOf("Claude") === providers.indexOf("Codex") + 1, "Claude quota is not after Codex");
    const footerBox = await footer.boundingBox();
    assert(footerBox && footerBox.x >= 0 && footerBox.x + footerBox.width <= width, `Claude footer clipped at ${width}`);
    await footer.click();
    const usage = page.locator('.usage-provider[data-provider="claude"]');
    await usage.waitFor();
    assert(await usage.getByRole("meter", { name: "5-hour: 72.5% remaining", exact: true }).isVisible(), "Missing Claude 5-hour Usage");
    assert(await usage.getByRole("meter", { name: "Weekly: 46% remaining", exact: true }).isVisible(), "Missing Claude weekly Usage");
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `Usage overflows at ${width}`);
    await page.getByTestId("sessions-button").click();
    await page.getByLabel("Session agent").selectOption("claude");
    assert(await page.getByText("No matching sessions", { exact: true }).isVisible(), "Claude session filter did not apply");
    layouts.push(width);
  }
  await page.route("**/api/board", async route => {
    const response = await route.fetch(), board = await response.json();
    const card = board.columns.running.cards.find(card => card.source === "codex");
    card.source = "claude"; card.session_id = card.session_id.replace(/^codex:/, "claude:"); card.agent = { name: "Claude Code" };
    await route.fulfill({ response, json: board });
  });
  await page.route("**/api/session/claude*", async route => {
    const response = await route.fetch(), detail = await response.json();
    detail.source = "claude"; detail.session_id = decodeURIComponent(route.request().url().split("/").at(-1));
    await route.fulfill({ response, json: detail });
  });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base);
  await page.getByTestId("new-claude-button").waitFor();
  const claudeCard = page.locator('[data-testid^="card-claude:"]');
  await claudeCard.waitFor();
  assert(await claudeCard.getByTestId("card-source").textContent() === "Claude Code", "Wrong Claude card label");
  await claudeCard.locator("h3 button").click();
  await page.getByTestId("harness-icon-claude").last().waitFor();
  assert(await page.getByRole("button", { name: "Close details", exact: true }).isVisible(), "Claude details did not open");
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="card-"]')].filter(e => e.tagName === "ARTICLE").every(e => getComputedStyle(e).opacity === "1"));
  await page.screenshot({ path: "/private/tmp/kliprun-claude-toolbar.png" });
  await page.getByTestId("usage-button").click();
  await page.locator('.usage-provider[data-provider="claude"] .usage-balance').waitFor();
  await page.screenshot({ path: "/private/tmp/kliprun-claude-usage.png" });
  await page.unrouteAll({ behavior: "wait" });
  return { layouts, themes: ["graphite", "paper"], order: "OpenCode → Codex → Claude Code → Terminal", nativeLaunch: true, sourceFilter: true, cardAndDetails: true, usageAndFooter: true };
}
