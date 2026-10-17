async (page, base = "http://127.0.0.1:19876") => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const click = name => p.getByRole('button', { name, exact: true }).click();
  const row = title => p.locator('.sw-row').filter({ has: p.getByRole('button', { name: `Open session: ${title}`, exact: true }) });
  const section = name => p.locator('.sw-section').filter({ has: p.locator('.sw-section-heading span', { hasText: new RegExp(`^${name}$`) }) });
  const view = name => p.locator('.sw-sidebar button').filter({ has: p.locator('span', { hasText: new RegExp(`^${name}$`) }) }).click();
  async function create(kind, name) {
    await click(`New ${kind}`); await p.getByLabel(`${kind === 'group' ? 'Group' : 'Project'} name`, { exact: true }).fill(name); await click(`Create ${kind}`);
  }
  try {
    await p.goto(`${base}/sessions`);
    await p.getByRole('button', { name: 'New project', exact: true }).waitFor();
    await p.waitForFunction(() => document.querySelectorAll('.sw-row').length === 7);
    check(await section('No project').locator('.sw-row').count() === 7, 'Initially unassigned');
    const text = await row('Implement search API').innerText();
    check(text.includes('10h 59m') && text.includes('42%') && text.includes('glm-5.3'), 'Metrics');
    await create('project', 'aurora'); await create('group', 'Research'); await create('group', 'Work');
    await click('New group'); await p.getByLabel('Group name', { exact: true }).fill('research'); await click('Create group');
    check(await p.getByRole('alert').count() === 1, 'Duplicate group rejected'); await click('Cancel');
    await view('All sessions');
    for (const title of ['Review database migration', 'Investigate flaky tests', 'Refine onboarding UI', 'Draft release notes']) await p.getByRole('checkbox', { name: `Select ${title}`, exact: true }).check();
    await click('Move to…'); await p.locator('#sw-destination').selectOption({label:'aurora'}); await click('Move sessions');
    await view('aurora'); check(await section('Uncategorized').locator('.sw-row').count() === 4, 'Project assignment');
    for (const title of ['Review database migration', 'Investigate flaky tests']) await p.getByRole('checkbox', { name: `Select ${title}`, exact: true }).check();
    await click('Move to…'); await p.locator('#sw-destination-group').selectOption({ label: 'Research' }); await click('Move sessions');
    await row('Refine onboarding UI').dragTo(section('Work').locator('.sw-section-heading'));
    check(await section('Research').locator('.sw-row').count() === 2, 'Two research sessions');
    check(await section('Work').locator('.sw-row').count() === 1, 'One work session');
    check(await section('Uncategorized').locator('.sw-row').count() === 1, 'One uncategorized session');
    await click('Undo'); check(await section('Uncategorized').locator('.sw-row').count() === 2, 'Undo group move');
    await row('Refine onboarding UI').dragTo(section('Work').locator('.sw-section-heading')); await click('Dismiss notice');
    await section('Research').locator('.sw-section-heading').click(); check(!await row('Review database migration').isVisible(), 'Collapse');
    await section('Research').locator('.sw-section-heading').focus(); await p.keyboard.press('Enter'); check(await row('Review database migration').isVisible(), 'Keyboard expand');
    await click('Favorite Draft release notes'); await view('Favorites'); check(await p.locator('.sw-row').count() === 1, 'Favorites');
    await p.reload(); await p.getByRole('button', { name: 'New project', exact: true }).waitFor();
    await view('aurora'); check(await section('Research').locator('.sw-row').count() === 2, 'Groups persist');
    await create('project', 'atlas'); await view('All sessions');
    await click('Move Implement search API'); await p.locator('#sw-destination').selectOption({label:'atlas'}); await click('Move sessions'); await click('Dismiss notice');
    check(await section('No project').locator('.sw-row').count() === 2, 'No project retained');
    check((await p.locator('.sw-section').last().innerText()).includes('No project'), 'No project last');
    await p.getByLabel('Search sessions', { exact: true }).fill('cache'); check(await p.locator('.sw-row').count() === 1, 'Search');
    await p.getByLabel('Session agent', { exact: true }).selectOption('opencode'); check(await p.getByText('No matching sessions', {exact:true}).isVisible(), 'Empty filter'); await click('Clear filters');
    for (const [i,path] of ['/sessions','/','/office','/git','/usage','/stats'].entries()) {
      await p.keyboard.press(`Control+${i+1}`); await p.waitForFunction(expected=>location.pathname===expected,path);
    }
    await p.keyboard.press('Control+2'); check(await p.locator('aside[aria-label="Recent sessions"]').count() === 0, 'Kanban sidebar removed');
    await p.keyboard.press('Control+1'); await p.getByRole('button',{name:'New project',exact:true}).waitFor();
    await click('Keyboard shortcuts'); check((await p.getByRole('dialog').innerText()).includes('⌃ 6'), 'Shortcut help'); await click('Close keyboard shortcuts');
    await view('aurora');
    for (const width of [1440,980,700,600]) {
      await p.setViewportSize({width,height:850});
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `Page width ${width}`);
      check(await p.locator('.sw-list').evaluate(el=>el.scrollWidth<=el.clientWidth), `List width ${width}`);
      await click('Open session: Review database migration');
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `Details width ${width}`);
      await click('Close details'); await click('New group');
      check(await p.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth), `Dialog width ${width}`); await click('Cancel');
    }
    await p.screenshot({path:'/private/tmp/kliprun-sessions-small.png'}); await p.setViewportSize({width:1440,height:900});
    await p.screenshot({path:'/private/tmp/kliprun-sessions-groups.png'}); await view('All sessions'); await p.screenshot({path:'/private/tmp/kliprun-sessions-all.png'});
    const original = await (await p.request.get(`${base}/api/session-catalog`)).json();
    const extended = {...original,sessions:[...original.sessions,...Array.from({length:205},(_,i)=>({...original.sessions[0],id:`ses_demo_extra_${i}`,title:`Fictional archive ${i}`,directory:'/Users/demo/Projects/archive',updated_at:i}))]};
    await p.route('**/api/session-catalog',route=>route.fulfill({json:extended})); await p.reload(); await p.getByRole('button',{name:'Next sessions',exact:true}).waitFor();
    check(await p.locator('.sw-row').count()===100,'Bounded rendering');
    await p.getByLabel('Search sessions',{exact:true}).fill('Fictional archive 204'); check(await p.locator('.sw-row').count()===1,'Search beyond first page');
    await click('Favorite Fictional archive 204'); await p.getByLabel('Search sessions',{exact:true}).fill(''); await view('Favorites'); check(await row('Fictional archive 204').isVisible(),'Favorite beyond first page');
    await p.unroute('**/api/session-catalog'); await p.route('**/api/session-catalog',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
    await p.reload(); await p.getByRole('button',{name:'Retry',exact:true}).waitFor(); check((await p.locator('.sw-sidebar').innerText()).includes('aurora'),'Failure preserves organization');
    check(!errors.length,errors.join('\n')); return {passed:true,checks:'Groups 2/1/1, bulk move, drag, undo, collapse, persistence, favorites, metrics, filters, Control+1–6, details, four sizes, pagination, catalog failure',errors};
  } finally {await context.close();}
}
