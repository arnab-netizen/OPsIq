import { test, expect, type Page } from '@playwright/test';

/**
 * Real-browser (Chromium) reproduction attempt for a live-production acceptance
 * report: typing a single character into the "Request beta access" modal's Email
 * field allegedly throws focus to the modal's Close button and collapses the
 * input's value to just the last-typed character, as if the modal/input remounts
 * on every keystroke.
 *
 * This mirrors (but does not replace) the existing jsdom-based
 * src/__tests__/components/modal-focus-stability.test.tsx, using a real browser,
 * real keyboard events (page.keyboard / locator.pressSequentially), and the full
 * homepage route (BetaAccessCta -> Modal -> use-dialog-a11y), not an isolated
 * harness component.
 *
 * Scratch/investigation file — not part of the standing suite's numbered
 * sequence, added to confirm or refute the production report against current
 * source. Does not modify any existing test.
 */

const EMAIL_VALUE = 'qa.modal.test@example.com';
const FIRST_NAME_VALUE = 'Ada';
const REPEAT_COUNT = 3;

async function openBetaModal(page: Page) {
  await page.goto('/');
  // Header trigger ("Request beta access") — PublicSiteHeader.tsx.
  const trigger = page.getByRole('button', { name: 'Request beta access' }).first();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Request beta access' })).toBeVisible();
}

async function closeBetaModal(page: Page) {
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Request beta access' })).toBeHidden();
}

/**
 * Types `text` one character at a time into `locator`, asserting after EACH
 * keystroke that (a) focus is still on that exact input (not the Close button,
 * not anywhere else) and (b) the input's value matches everything typed so far
 * (i.e. it never collapses to just the last character).
 */
async function typeCharByCharAndAssert(page: Page, locator: ReturnType<Page['getByLabel']>, text: string) {
  await locator.click();
  await expect(locator).toBeFocused();

  let expected = '';
  for (const ch of text) {
    expected += ch;
    await locator.press(ch === ' ' ? 'Space' : ch);

    await expect(locator).toBeFocused();
    await expect(locator).toHaveValue(expected);

    const closeButton = page.getByRole('button', { name: 'Close' });
    const isCloseFocused = await closeButton.evaluate((el) => el === document.activeElement).catch(() => false);
    expect(isCloseFocused).toBe(false);
  }
}

for (const viewport of [
  { name: 'desktop', size: undefined as { width: number; height: number } | undefined },
  { name: 'mobile-390x844', size: { width: 390, height: 844 } },
]) {
  test.describe(`Beta access modal focus stability — ${viewport.name}`, () => {
    test.beforeEach(async ({ page }) => {
      if (viewport.size) {
        await page.setViewportSize(viewport.size);
      }
    });

    for (let attempt = 1; attempt <= REPEAT_COUNT; attempt++) {
      test(`character-by-character typing preserves focus and value (pass ${attempt}/${REPEAT_COUNT})`, async ({
        page,
      }) => {
        await openBetaModal(page);

        const emailInput = page.getByLabel('Email');
        await typeCharByCharAndAssert(page, emailInput, EMAIL_VALUE);
        await expect(emailInput).toHaveValue(EMAIL_VALUE);

        const firstNameInput = page.getByLabel('First name (optional)');
        await typeCharByCharAndAssert(page, firstNameInput, FIRST_NAME_VALUE);
        await expect(firstNameInput).toHaveValue(FIRST_NAME_VALUE);

        // Email must still hold its full value too — proves the first field's
        // state (and the modal instance) survived typing into the second field.
        await expect(emailInput).toHaveValue(EMAIL_VALUE);

        await closeBetaModal(page);
      });
    }
  });
}
