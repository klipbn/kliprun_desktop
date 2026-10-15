// Playwright callback for the fixture-only preview described in README.md.
// Presentation overrides illustrate requested providers; they do not add integrations.
async (page) => {
  await page.setViewportSize({ width: 1600, height: 1500 });
  await page.goto('http://127.0.0.1:18796/usage');
  await page.locator('.usage-provider[data-provider="kimi"] .usage-balance').waitFor();
  await page.getByText('Checking providers…', { exact: true }).waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    const examples = {
      codex: { label: 'OpenAI · Codex', plan: 'ChatGPT Pro', source: 'Codex', icon: 'O' },
      zai: { label: 'Claude', plan: 'Claude Max', source: 'OpenCode', icon: 'C' },
      openai: { label: 'OpenAI · OpenCode', plan: 'ChatGPT Pro', source: 'OpenCode', icon: 'O' },
      kimi: { label: 'OpenCode Go', plan: 'Go subscription', source: 'OpenCode', icon: 'G' },
    };
    const grid = document.querySelector('.usage-provider-grid');
    for (const [provider, example] of Object.entries(examples)) {
      const card = grid.querySelector(`[data-provider="${provider}"]`);
      card.querySelector('h2').textContent = example.label;
      card.setAttribute('aria-label', example.label);
      card.querySelector('.usage-provider-identity p').textContent = example.plan;
      card.querySelector('.usage-monogram').textContent = example.icon;
      card.querySelector('.usage-provider-footer span').textContent = `Via ${example.source}`;
      card.querySelector('.usage-balance').setAttribute('aria-label', `${example.label}: synthetic remaining allowance`);
      grid.append(card);
    }
    for (const row of document.querySelectorAll('.usage-reset-item')) {
      const provider = row.querySelector('[data-provider]').dataset.provider;
      row.querySelector('strong').textContent = examples[provider].label;
    }
    const nextReset = document.querySelector('.usage-next-reset + p');
    nextReset.textContent = nextReset.textContent.replace('Z.ai', 'Claude').replace('Kimi', 'OpenCode Go');
    document.querySelector('.usage-footnote p').textContent = 'Synthetic demo data. Provider names, plans, balances and reset times are illustrative. Claude and OpenCode Go are screenshot examples; these integrations are not currently available in the app.';
  });
  const labels = await page.locator('.usage-provider h2').allTextContents();
  if (labels.join('|') !== 'OpenAI · Codex|Claude|OpenAI · OpenCode|OpenCode Go') throw new Error(`Unexpected cards: ${labels}`);
  await page.screenshot({ path: '/Users/a.voronko/Documents/github/kliprun_desktop/docs/screenshots/usage.png', fullPage: true });
  return { labels, viewport: page.viewportSize() };
}
