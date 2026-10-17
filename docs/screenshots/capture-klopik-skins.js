// Pass the HTML emitted by engine/src/client/scripts/render-klopik-previews.tsx.
async (page, html, directory = 'engine/src/client/public/klopik-skins') => {
  const context = await page.context().browser().newContext({ viewport: { width: 1020, height: 650 }, deviceScaleFactor: 2 });
  const preview = await context.newPage();
  try {
    await preview.setContent(html);
    await preview.screenshot({ path: '/private/tmp/kliprun-klopik-skins.png' });
    await preview.evaluate(() => document.body.style.background = 'transparent');
    for (const skin of ['default', 'robot', 'astronaut', 'knight', 'wizard', 'explorer']) {
      await preview.locator(`svg#${skin}`).screenshot({ path: `${directory}/${skin}.png`, omitBackground: true });
    }
    return { thumbnails: 6 };
  } finally { await context.close(); }
}
