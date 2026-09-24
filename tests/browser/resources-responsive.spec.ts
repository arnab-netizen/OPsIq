import { test, expect, type Page } from '@playwright/test';

/**
 * Owned resource surface — real-browser responsive + keyboard smoke test.
 *
 * Viewports: 375x812, 390x844 (the two required phone sizes) and desktop.
 * Covers the /resources index, the 404 for an unknown slug, and — when an
 * article is available — the article page: no page-level horizontal overflow,
 * tables contained in their own scroll region, beta modal fits and closes with
 * Escape returning focus to its trigger.
 *
 * Which article: RESOURCE_E2E_SLUG if set, else the first article linked from
 * /resources. Before Resource #1 is published, run against a local build that
 * includes a draft (see docs/opsiq/resources/AUTHORING.md, "Preview").
 */

const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function resolveArticlePath(page: Page): Promise<string | null> {
  if (process.env.RESOURCE_E2E_SLUG) return `/resources/${process.env.RESOURCE_E2E_SLUG}`;
  await page.goto('/resources');
  const first = page.locator('main ul a[href^="/resources/"]').first();
  return (await first.count()) > 0 ? await first.getAttribute('href') : null;
}

for (const vp of VIEWPORTS) {
  test.describe(`resources @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('index renders publicly without overflow and links from the footer', async ({ page }) => {
      const res = await page.goto('/resources');
      expect(res?.status()).toBe(200);
      expect(page.url()).not.toMatch(/\/login|\/signup/);
      await expect(page.getByRole('heading', { level: 1, name: 'Resources' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole('navigation', { name: 'Resources, legal, and support' }).getByRole('link', { name: 'Resources' })).toHaveAttribute('href', '/resources');
    });

    test('unknown slug is a real 404 with a way back', async ({ page }) => {
      const res = await page.goto('/resources/this-resource-does-not-exist-verification');
      expect(res?.status()).toBe(404);
      await expect(page.getByRole('link', { name: /homepage/ })).toHaveAttribute('href', '/');
      await expectNoHorizontalOverflow(page);
    });

    test('article: no overflow, contained tables, modal fits and returns focus', async ({ page }) => {
      const articlePath = await resolveArticlePath(page);
      test.skip(articlePath === null, 'No resource article is available on this deployment yet.');

      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      const res = await page.goto(articlePath!);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expectNoHorizontalOverflow(page);

      const regions = page.locator('div[role="region"][tabindex="0"]');
      for (let i = 0; i < (await regions.count()); i++) {
        const box = await regions.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 0.5);
      }

      const trigger = page.getByRole('button', { name: 'Request beta access' }).last();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Request beta access' });
      await expect(dialog).toBeVisible();
      const dbox = await dialog.boundingBox();
      expect(dbox!.width).toBeLessThanOrEqual(vp.width);
      await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();

      expect(errors).toEqual([]);
    });
  });
}
