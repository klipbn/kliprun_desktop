// Playwright callback against the fixture-only preview; no agent or repository is changed.
async (page, base = 'http://127.0.0.1:18856') => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const preview = await context.newPage();
  preview.setDefaultTimeout(5000);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const longModel = 'demo-labs/very-long-model-name-with-extra-context-and-reasoning-preview';
  const models = { codex: [longModel, ...Array.from({ length: 35 }, (_, i) => `demo-codex-${i}`)], opencode: ['demo-provider/demo-model'], claude: ['demo-claude'] };
  await preview.route(`${base}/api/workflows/models`, route => route.fulfill({ json: { models } }));
  try {
    const status = await (await preview.request.get(`${base}/api/workflows/status`)).json();
    const id = status.workflows[0].id;
    const doc = await (await preview.request.get(`${base}/api/workflows/document?id=${id}`)).json();
    const task = doc.definition.nodes.find(node => node.id === 'plan');
    task.agent = 'codex'; task.model = '';
    check((await preview.request.post(`${base}/api/workflows/save`, { data: { definition: doc.definition, revision: doc.revision } })).ok(), 'Could not prepare fixture');
    await preview.request.post(`${base}/api/workflows/selection`, { data: { workflowId: id, nodeId: 'plan' } });
    await preview.goto(`${base}/workflow`);
    const model = preview.getByLabel('Model', { exact: true });
    await model.click();
    const choices = preview.getByRole('listbox', { name: 'Model choices', exact: true });
    check(await choices.count() === 1 && await choices.isVisible(), 'Model choices are not visible in the page');
    const search = preview.getByRole('combobox', { name: 'Search model', exact: true });
    await search.fill('reasoning-preview');
    await preview.getByRole('option', { name: longModel, exact: true }).waitFor();
    await preview.getByRole('option', { name: longModel, exact: true }).click();
    check((await model.innerText()).includes(longModel), 'Long selected model was lost');
    const agentBox = await preview.getByLabel('Agent', { exact: true }).boundingBox(), modelBox = await model.boundingBox();
    check(agentBox && modelBox && modelBox.y >= agentBox.y + agentBox.height, 'Model still shares the cramped agent row');

    await model.click(); await search.press('ArrowUp'); await search.press('ArrowUp');
    const activeID = await search.getAttribute('aria-activedescendant');
    const activeOption = preview.locator(`[id="${activeID}"]`);
    check((await activeOption.innerText()).includes('demo-codex-34'), 'Keyboard navigation did not reach the last model');
    const activeBox = await activeOption.boundingBox(), listBox = await choices.boundingBox();
    check(activeBox && listBox && activeBox.y >= listBox.y && activeBox.y + activeBox.height <= listBox.y + listBox.height + 1, 'Keyboard selection scrolled out of view');
    await search.press('Enter');
    check((await model.innerText()).includes('demo-codex-34'), 'Keyboard selection was not applied');

    await model.click(); await search.fill('demo/custom-model-not-in-cache'); await search.press('Enter');
    check((await model.innerText()).includes('demo/custom-model-not-in-cache'), 'Custom model ID was lost');
    await model.click(); await search.fill('discarded-edit'); await search.press('Escape');
    check(await model.evaluate(e => e === document.activeElement), 'Escape did not restore focus');
    check((await model.innerText()).includes('demo/custom-model-not-in-cache'), 'Escape committed an unfinished search');
    await model.click(); await search.press('Tab');
    check(await preview.getByLabel('Task', { exact: true }).evaluate(e => e === document.activeElement), 'Tab did not continue through the form');
    await model.click(); await preview.getByLabel('Title', { exact: true }).click();
    check(await choices.count() === 0, 'Clicking outside did not close the menu');
    await model.click();
    await preview.locator('.workflow-inspector-content').evaluate(pane => {
      const trigger = pane.querySelector('[aria-label="Model"]');
      pane.scrollTop += trigger.getBoundingClientRect().bottom - pane.getBoundingClientRect().top + 5;
    });
    await preview.waitForFunction(() => !document.querySelector('.workflow-picker-popup'), null, { timeout: 3000 });

    const layouts = [];
    for (const [width, height, theme] of [[1440, 900, 'graphite'], [900, 600, 'paper'], [500, 500, 'graphite'], [900, 320, 'graphite']]) {
      await preview.setViewportSize({ width, height });
      await preview.evaluate(theme => { window.kliprunPreferences = { theme, reduceMotion: true }; window.dispatchEvent(new Event('kliprun:preferences')); }, theme);
      await model.scrollIntoViewIfNeeded();
      check(await model.evaluate(e => {
        const text = e.querySelector('span').getBoundingClientRect();
        return e.contains(document.elementFromPoint(text.left + 4, text.top + Math.min(8, text.height / 2)));
      }), `Selected model is covered by another panel at ${width}x${height}`);
      await model.click();
      await preview.getByRole('listbox', { name: 'Model choices' }).waitFor();
      const menu = preview.locator('.workflow-picker-popup');
      const box = await menu.boundingBox();
      check(box && box.x >= 4 && box.y >= 4 && box.x + box.width <= width - 3 && box.y + box.height <= height - 3, `Menu clipped at ${width}x${height}`);
      check(await menu.evaluate(e => e.parentElement === document.body), 'Menu is trapped inside the scrolling inspector');
      check(await menu.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Menu text overflows horizontally');
      await search.fill('reasoning-preview');
      const option = preview.getByRole('option', { name: longModel, exact: true });
      check(await option.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Long model name is clipped');
      await preview.screenshot({ path: `/private/tmp/kliprun-workflow-model-${width}-${height}.png` });
      await search.press('Escape');
      if (width === 500) {
        await preview.getByLabel('Show workflow list', { exact: true }).click();
        check(await preview.locator('.workflow-sidebar').isVisible(), 'Narrow workflow list did not open');
        await preview.getByLabel('Close workflow list', { exact: true }).click();
        check(await preview.locator('.workflow-sidebar').count() === 0, 'Narrow workflow list did not close');
        await preview.getByLabel('Show workflow list', { exact: true }).click();
        await preview.locator(`.workflow-sidebar [data-workflow-id="${id}"] .workflow-list-item`).click();
        await preview.locator('.workflow-sidebar').waitFor({ state: 'detached' });
        await preview.locator('.workflow-run-order button').first().click();
      }
      layouts.push({ width, height, theme });
    }
    await preview.setViewportSize({ width: 1440, height: 900 });
    await preview.getByLabel('Agent', { exact: true }).click();
    const agents = preview.getByRole('listbox', { name: 'Agent choices', exact: true });
    await agents.press('End'); await agents.press('Space');
    check((await preview.getByLabel('Agent', { exact: true }).innerText()).includes('Claude Code'), 'Space did not select the highlighted agent');
    check((await model.innerText()).includes('Agent default'), 'Agent switch did not reset the previous model');
    await model.click();
    check(await preview.getByRole('option', { name: 'demo-claude', exact: true }).count() === 1, 'Agent model list was not updated');
    check(await preview.getByRole('option', { name: longModel, exact: true }).count() === 0, 'Previous agent models leaked into the list');
    await preview.getByRole('combobox', { name: 'Search model' }).press('Escape');
    await preview.getByLabel('Expected result', { exact: true }).click();
    await preview.getByRole('option', { name: 'Review verdict', exact: true }).click();
    check((await preview.getByLabel('Expected result', { exact: true }).innerText()).includes('Review verdict'), 'Result selection failed');
    await preview.getByLabel('Task preset', { exact: true }).click();
    await preview.getByRole('listbox', { name: 'Task preset choices' }).getByRole('option', { name: 'Review text', exact: true }).click();
    check((await preview.getByLabel('Task', { exact: true }).inputValue()).includes('Review the latest draft'), 'Preset selection failed');
    await preview.getByLabel('Close inspector', { exact: true }).click();
    await preview.locator('.workflow-run-order button').nth(3).click();
    check(await preview.getByLabel('Publication mode', { exact: true }).count() === 0, 'Obsolete publication mode is still shown');
    await preview.getByLabel('Branch', { exact: true }).click();
    await preview.getByRole('combobox', { name: 'Search branch', exact: true }).fill('feature/workflow-menu-check');
    await preview.getByRole('combobox', { name: 'Search branch', exact: true }).press('Enter');
    check((await preview.getByLabel('Branch', { exact: true }).innerText()).includes('feature/workflow-menu-check'), 'Branch selection failed');
    await preview.locator('.workflow-publish-options>summary').click();
    await preview.getByLabel('Remote', { exact: true }).click();
    await preview.getByRole('listbox', { name: 'Remote choices' }).getByRole('option', { name: 'origin', exact: true }).click();
    return { layouts, verified: 'Model filtering, long labels, custom IDs, focus, keyboard selection, agent changes, result, preset and branch menus' };
  } finally { await context.close(); }
}
