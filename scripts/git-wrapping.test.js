// Playwright callback against the fixture-only preview; long file contents stay in memory.
async (page, base = "http://127.0.0.1:18796") => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const long = `${"Aurora search results and release notes. ".repeat(25)}${"segment".repeat(200)}`;
  const patch = `diff --git a/src/search.py b/src/search.py\n--- a/src/search.py\n+++ b/src/search.py\n@@ -1 +1 @@\n-${long}\n+${long}!\n`;
  const diffRoute = route => route.fulfill({ json: { patch, binary: false, truncated: false } });
  const fileRoute = async route => {
    const response = await route.fetch(), file = await response.json();
    await route.fulfill({ response, json: { ...file, content: `${long}\nnext line\n` } });
  };
  await page.route("**/api/git/diff?*", diffRoute);
  await page.route("**/api/git/file?*", fileRoute);
  const checkDiff = async label => {
    const container = page.getByLabel("File diff", { exact: true }); await container.waitFor();
    const sizes = await container.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth,
      rowHeight: element.querySelector(".git-line-add pre").getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element.querySelector("pre")).lineHeight),
      text: element.querySelector(".git-line-add pre").textContent }));
    check(sizes.scroll <= sizes.width + 1, `${label} diff requires horizontal scrolling`);
    check(sizes.rowHeight > sizes.lineHeight * 2, `${label} long diff line did not wrap`);
    check(sizes.text === `+${long}!`, `${label} wrapping changed the diff text`);
  };
  try {
    for (const width of [1440, 900, 500]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(`${base}/git`);
      await page.getByRole("button", { name: "Repository", exact: true }).click();
      await page.getByRole("option").filter({ hasText: "atlas" }).click();
      await page.locator(".git-file-select").first().click();
      await checkDiff(`Changes at ${width}`);
      await page.getByRole("tab", { name: "History", exact: true }).click();
      await page.locator(".git-history-row").first().click();
      await checkDiff(`History at ${width}`);
      await page.getByRole("tab", { name: "Files", exact: true }).click();
      await page.getByRole("treeitem", { name: "Open file README.md", exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Edit README.md", exact: true }); await editor.waitFor();
      const geometry = await editor.evaluate(element => ({ height: element.querySelector(".cm-line").getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(element).lineHeight), width: element.closest(".cm-scroller").clientWidth,
        scroll: element.closest(".cm-scroller").scrollWidth }));
      check(geometry.height > geometry.lineHeight * 2, `Files line did not wrap at ${width}`);
      check(geometry.scroll <= geometry.width + 1, `Files editor overflows at ${width}`);
      check(await page.getByLabel("Unsaved changes", { exact: true }).count() === 0, "Wrapping marked the file dirty");
    }
    await page.goto(`${base}/sessions`);
    await page.locator(".sw-status.running").first().waitFor();
    const indicators = await page.locator(".sw-status").evaluateAll(elements => elements.map(e => ({ width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,color:getComputedStyle(e).backgroundColor,title:e.title })));
    check(indicators.length > 1 && indicators.every(i => i.width >= 10 && i.height >= 10), "Session indicators are too small");
    check(new Set(indicators.map(i => i.color)).size >= 2, "Session status colors became indistinguishable");
    check(indicators.every(i => i.title), "Session statuses lost their descriptions");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "/private/tmp/kliprun-session-status-dots.png" });
    return { diffWrapping: ["Changes", "History"], fileWrapping: true, textPreserved: true, largerStatusDots: true, layouts: 3 };
  } finally { await page.unroute("**/api/git/diff?*", diffRoute); await page.unroute("**/api/git/file?*", fileRoute); }
}
