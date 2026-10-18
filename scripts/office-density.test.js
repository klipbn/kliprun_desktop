// Playwright callback against the fixture-only preview; generated coworkers are fictional.
async (page, base = 'http://127.0.0.1:18796') => {
  const context = await page.context().browser().newContext();
  const p = await context.newPage(), errors = [], external = [], checks = [];
  p.on('pageerror', error => errors.push(error.message));
  p.on('request', request => { if (!request.url().startsWith(base + '/')) external.push(request.url()); });
  const clone = value => JSON.parse(JSON.stringify(value));
  const fixture = await (await p.request.get(base + '/api/board')).json();
  const template = fixture.columns.running.cards[0];
  const crowd = (count, projects) => {
    const board = clone(fixture);
    for (const column of Object.values(board.columns)) { column.cards = []; column.count = 0; }
    board.columns.running.cards = Array.from({ length: count }, (_, i) => ({ ...template,
      session_id: `ses_demo_crowd_${i}`, title: `Demo task ${i + 1}`, children: [],
      parent_id: projects || i % 7 === 0 ? null : `ses_demo_crowd_${i - i % 7}`,
      directory: `/Users/demo/Projects/demo-${projects ? i : Math.floor(i / 7)}`,
      directory_name: `demo-${projects ? i : Math.floor(i / 7)}`,
      column: 'running', stage: 'Working', running_since: board.generated_at - 60_000,
    }));
    board.columns.running.count = count;
    return board;
  };
  let board = crowd(45, false);
  await p.route(base + '/api/board', route => route.fulfill({ json: board }));
  const choose = async name => {
    const button = p.getByRole('button', { name, exact: true });
    if (await button.isVisible()) await button.click();
    else await p.getByRole('combobox', { name: 'Office layout', exact: true }).selectOption({ label: name });
    await p.getByRole('button', { name: 'Fit', exact: true }).click();
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const inspect = async count => {
    const result = await p.evaluate(() => {
      const svg = document.querySelector('.office-world'), bounds = svg.getBoundingClientRect(), box = svg.viewBox.baseVal;
      const scale = Math.min(bounds.width / box.width, bounds.height / box.height);
      const actors = [...document.querySelectorAll('.office-resident')];
      return { count: actors.length, horizontalUse: box.width * scale / bounds.width,
        overflow: document.documentElement.scrollWidth > innerWidth,
        outside: actors.filter(actor => { const r = actor.getBoundingClientRect(); return r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1; }).length };
    });
    if (result.count !== count || result.horizontalUse < .9 || result.overflow || result.outside) throw new Error(JSON.stringify(result));
    return result;
  };
  try {
    await p.goto(base + '/office'); await p.locator('.office-resident').first().waitFor();
    for (const [width, height] of [[1440, 1000], [980, 660], [980, 330], [520, 660], [520, 330]]) {
      await p.setViewportSize({ width, height });
      for (const name of ['Shared loft', 'Team rooms', 'Long studio']) {
        await choose(name);
        checks.push({ layout: name, width, height, ...await inspect(45) });
        if (width === 1440 || width === 520 && height === 660) await p.screenshot({ path: `/private/tmp/kliprun-office-density-${name.replaceAll(' ', '-')}-${width}.png` });
      }
    }
    board = crowd(24, true);
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.evaluate(() => window.dispatchEvent(new Event('kliprun:board-refresh')));
    await p.waitForFunction(() => document.querySelectorAll('.office-resident').length === 24);
    await choose('Team rooms'); checks.push({ layout: '24 project rooms', ...await inspect(24) });
    if (errors.length || external.length) throw new Error(JSON.stringify({ errors, external }));
    return { checks, browserErrors: errors, externalRequests: external.length };
  } finally { await context.close(); }
}
