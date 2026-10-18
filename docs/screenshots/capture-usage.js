// Playwright callback for the fixture-only preview. No provider label overrides.
async (page, base = "http://127.0.0.1:18796", output = "docs/screenshots/usage.png") => {
  await page.setViewportSize({ width: 1600, height: 1600 });
  await page.goto(base + '/usage');
  await page.getByTestId('usage-total-tokens').waitFor();
  await page.locator('.usage-task-open').first().waitFor();
  await page.locator('.usage-provider[data-provider="kimi"] .usage-balance').waitFor();
  await page.getByText('Checking providers…', { exact: true }).waitFor({ state: 'hidden' });
  const labels = await page.locator('.usage-provider h2').allTextContents();
  if (labels.join('|') !== 'OpenAI · OpenCode|OpenAI · Codex|Claude Code|Z.ai|Kimi') throw new Error(`Unexpected cards: ${labels}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, animations: 'disabled' });
  return { labels, viewport: page.viewportSize() };
}
