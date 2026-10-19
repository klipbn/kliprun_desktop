// Run against docs/screenshots/preview.ts. Native commands are recorded, never executed.
async (page, base = "http://127.0.0.1:18810") => {
  const context = await page.context().browser().newContext();
  const test = await context.newPage(), errors = [];
  test.on("pageerror", error => errors.push(error.message));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const labels = ["OpenCode", "Codex", "Claude Code", "Terminal", "Sessions", "Kanban", "Office", "Git", "Workflow", "Usage", "Statistics", "Updates", "Shortcuts", "Settings"];
  const actions = ["new-opencode", "new-codex", "new-claude", "show-terminal", "check-updates", "settings"];
  const expanded = () => test.getByTestId("toolbar-labels-button").getAttribute("aria-expanded");
  try {
    for (const width of [1440, 980, 700, 500]) {
      await test.setViewportSize({ width, height: 900 }); await test.goto(base);
      await test.getByTestId("card-ses_demo_search").waitFor();
      const toggle = test.getByTestId("toolbar-labels-button");
      await toggle.waitFor({ timeout: 2000 });
      // Only the OS boundary is replaced: mirror native preference delivery after a click.
      await test.evaluate(() => {
        window.__toolbarActions = [];
        window.webkit.messageHandlers.desktopAction.postMessage = action => {
          window.__toolbarActions.push(action);
          if (action === "toggle-toolbar-labels") {
            window.kliprunPreferences = { ...window.kliprunPreferences, toolbarExpanded: !window.kliprunPreferences.toolbarExpanded };
            window.dispatchEvent(new Event("kliprun:preferences"));
          }
        };
      });
      check(await expanded() === "false", "Fresh toolbar is compact");
      check(await test.locator(".toolbar-label:visible").count() === 0, "Compact toolbar hides labels");
      check(await test.getByTestId("details-panel").count() === 0, "No session is selected initially");
      await toggle.focus(); await test.keyboard.press("Enter");
      await test.waitForFunction(() => document.querySelector('[data-testid="toolbar-labels-button"]').getAttribute("aria-expanded") === "true");
      check(await toggle.getAttribute("aria-label") === "Hide labels", "Expanded toggle describes collapse");
      const visibleLabels = await test.locator(".toolbar-label:visible").allTextContents();
      check(visibleLabels.join("|") === labels.join("|"), `Toolbar labels: ${visibleLabels.join("|")}`);
      const layout = await test.evaluate(() => {
        const header = document.querySelector(".app-toolbar"), bounds = header.getBoundingClientRect();
        const views = header.querySelector('[aria-label="Views"]').getBoundingClientRect();
        const top = [...header.querySelectorAll('[aria-label="Agent terminals"], [aria-label="Utilities"]')].map(e => e.getBoundingClientRect());
        const buttons = [...header.querySelectorAll("button[data-testid]")];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          navigationBelow: top.every(rect => views.top >= rect.bottom),
          twoRows: Math.abs(top[0].top - top[1].top) < 1,
          clipped: buttons.some(button => { const r = button.getBoundingClientRect(); return r.left < bounds.left || r.right > bounds.right || r.bottom > bounds.bottom; }),
          truncated: [...header.querySelectorAll(".toolbar-label")].some(label => { const r = label.getBoundingClientRect(), b = label.parentElement.getBoundingClientRect(); return r.left < b.left || r.right > b.right; }),
        };
      });
      check(!layout.overflow && !layout.clipped && !layout.truncated && layout.navigationBelow, `Expanded layout at ${width}: ${JSON.stringify(layout)}`);
      if (width >= 980) check(layout.twoRows, `Toolbar should use two rows at ${width}`);
      check(await test.getByTestId("kanban-button").getAttribute("aria-pressed") === "true", "Expansion preserves the selected view");
      check(await test.getByTestId("details-panel").count() === 0, "Expansion does not select a session");
      await test.getByRole("button", { name: "Implement search API", exact: true }).click();
      await test.getByTestId("details-panel").waitFor();
      await toggle.click(); await toggle.click();
      check(await test.getByTestId("details-panel").isVisible(), "Toggling keeps the selected session open");
      await test.getByRole("button", { name: "Close details", exact: true }).click();
      for (const action of actions) await test.getByTestId(action === "settings" ? "settings-button" : action === "check-updates" ? "check-updates-button" : `${action}-button`).click();
      check((await test.evaluate(() => window.__toolbarActions)).join("|") === ["toggle-toolbar-labels", "toggle-toolbar-labels", "toggle-toolbar-labels", ...actions].join("|"), "Native action targets are unchanged");
      await test.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
      await test.getByRole("dialog").waitFor();
      await test.getByRole("button", { name: "Close keyboard shortcuts", exact: true }).click();
      await test.evaluate(() => { window.kliprunUpdateVersion = "99.0.0"; window.dispatchEvent(new Event("kliprun:update")); });
      await test.getByRole("button", { name: "Update available: KlipRun 99.0.0", exact: true }).waitFor();
      check(await test.getByTestId("check-updates-button").locator(".toolbar-label").innerText() === "Updates", "Update feedback retains its label");
      await test.getByTestId("sessions-button").click();
      check(await test.getByTestId("sessions-button").getAttribute("aria-pressed") === "true", "Navigation remains usable");
      await toggle.focus(); await test.keyboard.press("Space");
      await test.waitForFunction(() => document.querySelector('[data-testid="toolbar-labels-button"]').getAttribute("aria-expanded") === "false");
      check(await test.locator(".toolbar-label:visible").count() === 0, "Collapsing hides every label");
      check(await test.getByTestId("sessions-button").getAttribute("aria-pressed") === "true", "Collapsing preserves selection");
      check(await toggle.getAttribute("aria-label") === "Show labels", "Compact toggle describes expansion");
    }
    await test.setViewportSize({ width: 1440, height: 900 }); await test.goto(base);
    for (const theme of ["graphite", "daybreak"]) {
      await test.evaluate(theme => { window.kliprunPreferences = { ...window.kliprunPreferences, theme, toolbarExpanded: true }; window.dispatchEvent(new Event("kliprun:preferences")); }, theme);
      await test.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
      check(await expanded() === "true", "Native expanded preference is rendered live");
      await test.screenshot({ path: `/private/tmp/kliprun-toolbar-C-${theme}.png` });
    }
    check(errors.length === 0, `Browser exceptions: ${errors.join("; ")}`);
    return { passed: true, widths: [1440, 980, 700, 500], themes: ["graphite", "daybreak"], nativeActions: actions, errors };
  } finally { await context.close(); }
}
