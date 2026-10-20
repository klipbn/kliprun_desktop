// Fixture-only preview; navigation and viewport edits stay in memory.
async (page, base = 'http://127.0.0.1:18796') => {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const view = () => page.locator('.workflow-world').evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    return { zoom: matrix.a, x: matrix.e, y: matrix.f };
  });
  const results = [];
  for (const width of [1440, 620]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/workflow`);
    const canvas = page.getByTestId('workflow-canvas');
    await canvas.waitFor();
    await page.keyboard.press('Control+5');
    assert(page.url().endsWith('/workflow'), 'Control+5 did not open Workflow');
    await page.keyboard.press('Control+6');
    await page.waitForURL(url => url.pathname === '/usage');
    await page.keyboard.press('Control+7');
    await page.waitForURL(url => url.pathname === '/stats');
    await page.keyboard.press('Control+5');
    await canvas.waitFor();
    const hideList = page.getByRole('button', { name: 'Hide workflow list', exact: true });
    if (await hideList.count()) await hideList.click();
    await canvas.scrollIntoViewIfNeeded();
    const before = await view();
    const rect = await canvas.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const scrollBefore = await page.locator('.workflow-view').evaluate(el => el.scrollTop);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(zoom => new DOMMatrix(getComputedStyle(document.querySelector('.workflow-world')).transform).a > zoom, before.zoom);
    const after = await view();
    assert(after.zoom > before.zoom, 'Plain wheel did not zoom in');
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(zoom => new DOMMatrix(getComputedStyle(document.querySelector('.workflow-world')).transform).a < zoom, after.zoom);
    assert(await page.locator('.workflow-view').evaluate(el => el.scrollTop) === scrollBefore, 'Wheel scrolled the surrounding page');
    await canvas.scrollIntoViewIfNeeded();
    const dragRect = await canvas.boundingBox();
    const dragBefore = await view();
    await page.mouse.move(dragRect.x + 8, dragRect.y + 8);
    await page.mouse.down();
    await page.mouse.move(dragRect.x + 38, dragRect.y + 28);
    await page.mouse.up();
    await page.waitForFunction(before => {
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.workflow-world')).transform);
      return Math.abs(matrix.e - before.x - 30) < 1 && Math.abs(matrix.f - before.y - 20) < 1;
    }, dragBefore, { timeout: 3000 });
    const dragged = await view();
    assert(Math.abs(dragged.x - dragBefore.x - 30) < 1 && Math.abs(dragged.y - dragBefore.y - 20) < 1, 'Canvas drag no longer pans');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Layout overflows');
    results.push({ width, navigation: true, wheelZoom: true, dragPan: true });
  }
  return results;
}
