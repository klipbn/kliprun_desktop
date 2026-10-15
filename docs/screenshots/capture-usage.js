// Playwright callback for the fixture-only preview. No provider label overrides.
async (page) => {
  await page.setViewportSize({ width: 1600, height: 1500 });
  await page.goto('http://127.0.0.1:18796/usage');
  await page.locator('.usage-provider[data-provider="kimi"] .usage-balance').waitFor();
  await page.getByText('Checking providers…', { exact: true }).waitFor({ state: 'hidden' });
  const labels = await page.locator('.usage-provider h2').allTextContents();
  if (labels.join('|') !== 'OpenAI · OpenCode|OpenAI · Codex|Z.ai|Kimi') throw new Error(`Unexpected cards: ${labels}`);
  await page.screenshot({ path: 'docs/screenshots/usage.png' });
  return { labels, viewport: page.viewportSize() };
}
