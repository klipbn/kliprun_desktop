// Run this Playwright callback against docs/screenshots/preview.ts, never a live engine.
async (page, base = 'http://127.0.0.1:18799') => {
  const assert = (value, message) => { if (!value) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/workflow`);
  await page.locator('[data-testid="workflow-card-plan"]').waitFor();
  if (await page.getByRole('button', { name: 'Accept result', exact: true }).count()) {
    await page.getByRole('button', { name: 'Accept result', exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Fit view', exact: true }).click();
  await page.locator('[data-testid="workflow-card-plan"] .workflow-card-title').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
  await page.getByLabel('Task', { exact: true }).fill('Plan the fixture API change and verify empty-response handling.');
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  const title = page.locator('[data-testid="workflow-card-plan"] .workflow-card-title');
  const box = await title.boundingBox();
  await page.mouse.move(box.x + 50, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 95, box.y + 45, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  const read = () => page.evaluate(async () => (await (await fetch('/api/workflows')).json()).workflows.find(d => d.definition.id === 'demo-workflow'));
  const saved = await read();
  await page.reload(); await page.locator('[data-testid="workflow-card-plan"]').waitFor();
  assert((await read()).definition.nodes[0].x === saved.definition.nodes[0].x, 'Card position was not persisted');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert((await dialog.innerText()).includes('feature/empty-response') && !(await dialog.innerText()).includes('Target:'), 'Commit/push branch was lost');
  await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Start workflow' }).click();
  await page.getByRole('button', { name: 'Kanban', exact: true }).click();
  await page.getByRole('button', { name: 'Workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Accept result', exact: true }).waitFor({ timeout: 10000 });
  const run = (await read()).runs[0];
  assert(run.status === 'human_review', 'Did not reach human review');
  assert(run.returns['review-return'] === 1, 'Review did not return exactly once');
  assert(run.attempts.some(a => a.nodeId === 'build' && a.input.includes('Plan: add empty-response')), 'Plan was not handed off');
  assert(run.attempts.some(a => a.nodeId === 'publish' && a.result.publication.sha && !a.result.publication.url), 'Publication result is missing');
  await page.setViewportSize({ width: 620, height: 780 });
  await page.locator('.workflow-layout.is-narrow').waitFor();
  if (await page.getByRole('button', { name: 'Hide workflow list', exact: true }).count()) await page.getByRole('button', { name: 'Hide workflow list', exact: true }).click();
  await page.getByRole('button', { name: 'Fit view', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow layout overflows');
  await page.getByRole('button', { name: 'Accept result', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  assert((await read()).runs[0].status === 'completed', 'Accept did not complete the run');
  return { status: 'passed', normal: '1440×1000', narrow: '620×780', attempts: run.attempts.length, returns: run.returns };
}
