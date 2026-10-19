// Playwright callback against the fixture-only preview; native actions are recorded, not executed.
async (page) => {
  const base = "http://127.0.0.1:18796";
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const ids = ["sessions-button", "kanban-button", "office-button", "git-button", "usage-button", "statistics-button", "check-updates-button", "keyboard-shortcuts-button", "settings-button", "toolbar-labels-button"];
  const labels = ["Sessions", "Kanban", "Office", "Git", "Usage", "Statistics", "Check for Updates", "Keyboard shortcuts", "Settings", "Show labels"];
  for (const width of [1440, 900, 500]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(base);
    await page.getByTestId("card-ses_demo_search").waitFor();
    const order = await page.locator("header button[data-testid]").evaluateAll((buttons, ids) => buttons.filter(button => ids.includes(button.dataset.testid)).map(button => button.getAttribute("aria-label") || button.textContent.trim()), ids);
    assert(order.join("|") === labels.join("|"), `Unexpected toolbar order: ${order.join("|")}`);
    const utilities = await page.locator('[aria-label="Utilities"] button[data-testid]').evaluateAll(buttons => buttons.map(button => button.dataset.testid));
    assert(utilities.join("|") === "check-updates-button|keyboard-shortcuts-button|settings-button", "Updates, shortcuts, and Settings are not grouped together");
    for (const id of [...ids, "new-opencode-button", "new-codex-button", "new-claude-button", "show-terminal-button"]) {
      const button = page.getByTestId(id);
      assert((await button.innerText()).trim() === "", `${id} still has a text label`);
      assert(await button.getAttribute("aria-label"), `${id} has no accessible name`);
      assert(await button.getAttribute("title"), `${id} has no tooltip`);
    }
    for (const source of ["opencode", "codex", "claude"]) {
      const image = page.getByTestId(`new-${source}-button`).locator("img");
      await image.evaluate(img => img.decode());
      assert((await image.getAttribute("src")).endsWith(`/harness-icons/${source}.svg`), `Missing ${source} toolbar logo`);
    }
    await page.evaluate(() => { window.__toolbarActions = []; window.webkit.messageHandlers.desktopAction.postMessage = action => window.__toolbarActions.push(action); });
    for (const id of ["new-opencode-button", "new-codex-button", "new-claude-button", "show-terminal-button", "settings-button", "check-updates-button"]) await page.getByTestId(id).click();
    const actions = await page.evaluate(() => window.__toolbarActions);
    assert(actions.join("|") === "new-opencode|new-codex|new-claude|show-terminal|settings|check-updates", "Icon actions changed their native targets");
    const idleColor = await page.getByTestId("check-updates-button").evaluate(element => getComputedStyle(element).color);
    await page.evaluate(() => { window.kliprunUpdateVersion = "99.0.0"; window.dispatchEvent(new Event("kliprun:update")); });
    await page.getByRole("button", { name: "Update available: KlipRun 99.0.0", exact: true }).waitFor();
    await page.waitForFunction(color => {
      const button = document.querySelector('[data-testid="check-updates-button"]');
      return button.querySelector('span[aria-hidden="true"]') && getComputedStyle(button).color !== color;
    }, idleColor);
    await page.evaluate(() => { window.kliprunUpdateVersion = null; window.dispatchEvent(new Event("kliprun:update")); });
    await page.getByRole("button", { name: "Check for Updates", exact: true }).waitFor();
    await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    const help = page.locator("dialog[open]"); await help.waitFor();
    const shortcuts = await help.locator("li").allTextContents();
    for (const [label, number] of [["Sessions", 1], ["Kanban board", 2], ["Office", 3], ["Git", 4], ["Usage", 5], ["Statistics", 6]]) assert(shortcuts.some(text => text.includes(label) && text.includes(`⌃ ${number}`)), `Wrong shortcut for ${label}`);
    await help.getByRole("button", { name: "Close keyboard shortcuts", exact: true }).click();
    for (const tab of ["user", "agent-text", "agent", "models", "kanban"]) {
      await page.evaluate(detailTab => { window.kliprunPreferences = { detailTab, reduceMotion: true }; window.dispatchEvent(new Event("kliprun:preferences")); }, tab);
      await page.getByRole("button", { name: "Implement search API", exact: true }).click();
      await page.waitForFunction(tab => document.querySelector(`[data-testid="tab-${tab}"]`)?.getAttribute("aria-pressed") === "true", tab);
      await page.getByRole("button", { name: "Close details", exact: true }).click();
    }
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `Toolbar overflows at ${width}px`);
  }
  return { iconActions: true, order: labels, defaultTabs: 5, layouts: 3 };
}
