import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mkdir, writeFile } from 'node:fs/promises';

for (const [name, path, expected] of [
  ['pages-and-blocks', '/help/create-your-first-page', /page/i],
  ['sidebar', '/help/navigate-with-the-sidebar', /sidebar/i],
  ['databases', '/help/intro-to-databases', /database/i],
  ['search', '/help/search', /search/i],
] as const) {
  test(`analyze Notion ${name}`, async ({ app, screen, browser }) => {
    await app.open(path);
    await expect(screen.getByRole('heading', expected).first()).toBeVisible();
    const evidence = await browser.evaluate(() => ({
      title: document.title, url: location.href,
      headings: [...document.querySelectorAll('h1,h2,h3')].map(el => el.textContent),
      text: (document.querySelector('main') ?? document.body).innerText.slice(0, 22000),
    }));
    await mkdir('docs/research', { recursive: true });
    await writeFile(`docs/research/notion-${name}.json`, JSON.stringify(evidence, null, 2));
    await app.screenshot(`notion-${name}`);
    expect(evidence.text.length).toBeGreaterThan(400);
  });
}
