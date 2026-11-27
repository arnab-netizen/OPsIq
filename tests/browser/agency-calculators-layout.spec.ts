import { test, expect, type Page } from '@playwright/test';

/**
 * Free calculators, hub and agency diagnostic: real-browser LAYOUT regression test (R31).
 *
 * Original defect (R30, production): below the `md` breakpoint the calculator shell's grid had no explicit column
 * template, so its implicit `auto` column grew to the min-content width of the 28rem comparison/scenario tables.
 * The form and result panel became about 490px wide inside a 390px viewport and the document scrolled sideways.
 *
 * What this test proves, and what it deliberately does NOT accept:
 *  - The DOCUMENT must not overflow: scrollWidth <= clientWidth + 1. html/body must not hide overflow
 *    (overflow-x hidden/clip would make the check pass without fixing anything).
 *  - The form and the result panel must fit the viewport.
 *  - A wide TABLE is acceptable only inside a scroll container (overflow-x auto/scroll) that itself fits the
 *    viewport AND really scrolls, so every column stays reachable. Any other element that sticks out of the
 *    viewport is a failure, wherever it sits.
 *
 * Measurement happens in the states where the overflow occurs (the sample state renders the tables). The R26
 * check measured only after typing large sentinel values into every input, a state that has no result tables.
 *
 * Run against a PRODUCTION build (never `next dev`):
 *   CI=1 BASE_URL=http://localhost:3112 npx playwright test tests/browser/agency-calculators-layout.spec.ts --project=chromium --workers=4 --trace off
 * (CI=1 only tells playwright.config.ts not to start a dev server or require a database: these pages are static.)
 */

const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 820, 1024, 1280];
const CALCULATORS = [
  '/tools/client-profitability-calculator',
  '/tools/agency-retainer-pricing-calculator',
  '/tools/agency-utilization-calculator',
  '/tools/agency-scope-creep-calculator',
  '/tools/agency-hourly-rate-calculator',
  '/tools/agency-capacity-calculator',
  '/tools/profit-margin-calculator',
];
const OTHER_PAGES = ['/tools', '/agency'];

function heightFor(width: number) {
  return width <= 430 ? 800 : width <= 820 ? 1100 : 900;
}

type LayoutReport = {
  clientWidth: number;
  innerWidth: number;
  scrollWidth: number;
  bodyScrollWidth: number;
  htmlOverflowX: string;
  bodyOverflowX: string;
  styled: boolean;
  devOverlay: boolean;
  form: { left: number; right: number } | null;
  result: { left: number; right: number } | null;
  tables: { containerFocusable: boolean; containerFits: boolean; containerScrollable: boolean; hasContainer: boolean; tableWidth: number; containerClient: number; containerScroll: number }[];
  offenders: string[];
};

async function measure(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const cw = doc.clientWidth;
    const box = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right) };
    };
    const isScroller = (e: Element) => {
      const ox = getComputedStyle(e).overflowX;
      return ox === 'auto' || ox === 'scroll';
    };
    const scrollerOf = (e: Element): Element | null => {
      let p: Element | null = e.parentElement;
      while (p && p !== document.body) {
        if (isScroller(p)) return p;
        p = p.parentElement;
      }
      return null;
    };
    const section = document.querySelector('section[aria-labelledby]');
    const form = section ? section.querySelector('form') : document.querySelector('main form');
    const result = section ? section.querySelector('div[aria-live]') : null;
    const tables = [...document.querySelectorAll('table')].map((t) => {
      const c = scrollerOf(t);
      const tw = Math.round(t.getBoundingClientRect().width);
      if (!c) return { containerFocusable: false, hasContainer: false, containerFits: false, containerScrollable: false, tableWidth: tw, containerClient: 0, containerScroll: 0 };
      const r = c.getBoundingClientRect();
      return {
        hasContainer: true,
        // a sideways-scrolling region must be reachable and operable from the keyboard
        containerFocusable: (c as HTMLElement).tabIndex >= 0,
        containerFits: r.left >= -1 && r.right <= cw + 1,
        // every column reachable: the container's scrollable width covers the whole table
        containerScrollable: c.scrollWidth >= tw - 1,
        tableWidth: tw,
        containerClient: c.clientWidth,
        containerScroll: c.scrollWidth,
      };
    });
    const offenders: string[] = [];
    document.querySelectorAll('body *').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right <= cw + 1 && r.left >= -1) return;
      // sticking out of the viewport is only acceptable INSIDE a scroll container that fits the viewport
      const c = scrollerOf(e);
      if (c) {
        const cr = c.getBoundingClientRect();
        if (cr.left >= -1 && cr.right <= cw + 1) return;
      }
      offenders.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0, 3).join('.')} [${Math.round(r.left)}..${Math.round(r.right)}] vs ${cw}`);
    });
    return {
      clientWidth: cw,
      innerWidth: window.innerWidth,
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      htmlOverflowX: getComputedStyle(doc).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      styled: document.styleSheets.length > 0 && !!document.querySelector('main') && getComputedStyle(document.body).fontFamily.length > 0,
      devOverlay: !!document.querySelector('nextjs-portal, [data-nextjs-dev-overlay]'),
      form: box(form),
      result: box(result),
      tables,
      offenders: offenders.slice(0, 8),
    };
  });
}

async function expectLayoutOk(page: Page, label: string, opts: { expectForm?: boolean } = {}) {
  const m = await measure(page);
  const ctx = `${label} @ ${m.clientWidth}px`;
  // the harness must be rendering the real, styled production page at the intended width
  expect(m.styled, `${ctx}: page is styled`).toBe(true);
  expect(m.devOverlay, `${ctx}: not a development build`).toBe(false);
  // the document itself must not scroll sideways, and must not hide that it would
  expect(m.htmlOverflowX, `${ctx}: html must not hide overflow`).not.toMatch(/hidden|clip/);
  expect(m.bodyOverflowX, `${ctx}: body must not hide overflow`).not.toMatch(/hidden|clip/);
  expect(m.scrollWidth, `${ctx}: document scrollWidth ${m.scrollWidth} vs clientWidth ${m.clientWidth}`).toBeLessThanOrEqual(m.clientWidth + 1);
  expect(m.bodyScrollWidth, `${ctx}: body scrollWidth`).toBeLessThanOrEqual(m.clientWidth + 1);
  if (opts.expectForm) {
    expect(m.form, `${ctx}: form exists`).not.toBeNull();
    expect(m.form!.left, `${ctx}: form left`).toBeGreaterThanOrEqual(-1);
    expect(m.form!.right, `${ctx}: form right`).toBeLessThanOrEqual(m.clientWidth + 1);
    if (m.result) {
      expect(m.result.left, `${ctx}: result panel left`).toBeGreaterThanOrEqual(-1);
      expect(m.result.right, `${ctx}: result panel right`).toBeLessThanOrEqual(m.clientWidth + 1);
    }
  }
  for (const t of m.tables) {
    expect(t.hasContainer, `${ctx}: every table sits in its own scroll container`).toBe(true);
    expect(t.containerFits, `${ctx}: table scroll container fits the viewport`).toBe(true);
    expect(t.containerFocusable, `${ctx}: the table scroll container is keyboard-focusable`).toBe(true);
    expect(t.containerScrollable, `${ctx}: all table columns are reachable (container ${t.containerScroll} vs table ${t.tableWidth})`).toBe(true);
  }
  expect(m.offenders, `${ctx}: no element outside the viewport except inside a fitting scroll container`).toEqual([]);
  return m;
}

async function ready(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('main h1').first()).toBeVisible();
}

async function numberInputs(page: Page) {
  return page.locator('form input[type=number]');
}

async function fillAll(page: Page, value: string) {
  const inputs = await numberInputs(page);
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(value);
  await page.waitForTimeout(120);
}

async function loadSample(page: Page) {
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForTimeout(120);
}

for (const width of WIDTHS) {
  test.describe(`layout @ ${width}px`, () => {
    test.use({ viewport: { width, height: heightFor(width) } });

    for (const path of CALCULATORS) {
      test(`${path}: all states fit`, async ({ page, context }) => {
        test.setTimeout(90_000);
        await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await ready(page);
        const agency = path !== '/tools/profit-margin-calculator';

        // 1. default sample state (this is where the comparison/scenario tables render)
        const base = await expectLayoutOk(page, `${path} sample`, { expectForm: true });
        if (agency && path !== '/tools/agency-scope-creep-calculator') {
          expect(base.tables.length, `${path}: the sample state really renders its table(s)`).toBeGreaterThan(0);
        }
        expect(base.innerWidth, 'viewport is the requested width').toBe(width);

        // hydration is real: an edit flips the badge
        const first = (await numberInputs(page)).first();
        await first.fill('123');
        await expect(page.getByText('Your numbers', { exact: true })).toBeVisible();

        // 2. keyboard: focus stays inside the viewport and is visibly indicated
        await page.mouse.click(1, 1).catch(() => undefined);
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press('Tab');
          const info = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (!!cs.boxShadow && cs.boxShadow !== 'none');
            return { left: r.left, right: r.right, visible, tag: el.tagName };
          });
          if (info) {
            expect(info.left, 'focused element left edge in viewport').toBeGreaterThanOrEqual(-1);
            expect(info.right, 'focused element right edge in viewport').toBeLessThanOrEqual(width + 1);
            expect(info.visible, `focus indicator on ${info.tag}`).toBe(true);
          }
        }

        // 3. currencies, including the longest names
        const select = page.locator('form select').first();
        if ((await select.count()) > 0) {
          const options = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
          for (const code of options) {
            await select.selectOption(code);
            await expectLayoutOk(page, `${path} currency ${code}`, { expectForm: true });
          }
          await select.selectOption(options[0]);
        }

        // 4. states: cleared, zeros, ones, very large, negative, invalid, custom, explicit zero cost (warnings)
        await page.getByRole('button', { name: 'Clear all' }).click();
        await page.waitForTimeout(120);
        await expectLayoutOk(page, `${path} cleared`, { expectForm: true });

        await loadSample(page);
        await fillAll(page, '0');
        await expectLayoutOk(page, `${path} all zeros`, { expectForm: true });

        await loadSample(page);
        await fillAll(page, '1');
        await expectLayoutOk(page, `${path} all ones`, { expectForm: true });

        await loadSample(page);
        await fillAll(page, '89999999999999');
        await expectLayoutOk(page, `${path} very large values`, { expectForm: true });

        await loadSample(page);
        await first.fill('-5');
        await expectLayoutOk(page, `${path} invalid first input`, { expectForm: true });

        await loadSample(page);
        await first.fill('17');
        await expectLayoutOk(page, `${path} custom first input`, { expectForm: true });

        if (path === '/tools/client-profitability-calculator') {
          const inputs = await numberInputs(page);
          await loadSample(page);
          await inputs.nth(0).fill('1000'); // revenue
          await inputs.nth(1).fill('0');
          await inputs.nth(2).fill('100'); // hours
          await inputs.nth(3).fill('100'); // rate: cost far above revenue, so a negative margin
          await expectLayoutOk(page, `${path} negative margin`, { expectForm: true });
          await loadSample(page);
          await inputs.nth(3).fill('0'); // explicit zero rate: the unpaid-labor warning
          await expectLayoutOk(page, `${path} zero-cost warning`, { expectForm: true });
        }
        if (path === '/tools/agency-capacity-calculator') {
          const inputs = await numberInputs(page);
          await loadSample(page);
          await inputs.nth(3).fill('99999'); // committed hours far above capacity: shortfall
          await expectLayoutOk(page, `${path} shortfall`, { expectForm: true });
        }

        // 5. copy action (a user action; nothing is transmitted)
        await loadSample(page);
        const copy = page.getByRole('button', { name: 'Copy my results' });
        if ((await copy.count()) > 0) {
          await copy.click();
          await page.waitForTimeout(200);
          await expectLayoutOk(page, `${path} after copy`, { expectForm: true });
        }
      });
    }

    for (const path of OTHER_PAGES) {
      test(`${path}: fits`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await ready(page);
        await expectLayoutOk(page, path, { expectForm: path === '/agency' });
      });
    }
  });
}

// The same checks with the web font blocked, so the fallback font's wider glyphs are exercised too.
for (const width of [320, 390, 430, 820]) {
  test.describe(`fallback font @ ${width}px`, () => {
    test.use({ viewport: { width, height: heightFor(width) } });
    test('calculators fit with the web font blocked', async ({ page }) => {
      test.setTimeout(90_000);
      await page.route('**/*.woff2', (r) => r.abort()); // intentional: fallback-font coverage only
      for (const path of [...CALCULATORS, ...OTHER_PAGES]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectLayoutOk(page, `${path} (fallback font)`, { expectForm: path.startsWith('/tools/') && path !== '/tools' || path === '/agency' });
      }
    });
  });
}

// Navigation keeps working at phone width: related-calculator and agency-diagnostic links are real navigations.
test.describe('navigation @ 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('related and agency links navigate and the destination fits', async ({ page }) => {
    test.setTimeout(120_000);
    for (const path of CALCULATORS.slice(0, 6)) {
      await page.goto(path);
      await ready(page);
      await page.evaluate(() => {
        (window as unknown as { __marker?: string }).__marker = 'same-document';
      });
      const related = page.locator('a[data-calc-link="related"]').first();
      const target = await related.getAttribute('href');
      await Promise.all([page.waitForURL((u) => u.pathname === target), related.click()]);
      expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker ?? null), 'full-document navigation').toBeNull();
      await ready(page);
      await expectLayoutOk(page, `${path} -> ${target}`);

      await page.goto(path);
      await ready(page);
      await Promise.all([page.waitForURL('**/agency'), page.locator('a[data-calc-link="agency"]').first().click()]);
      await ready(page);
      await expectLayoutOk(page, `${path} -> /agency`, { expectForm: true });
    }
  });
});
