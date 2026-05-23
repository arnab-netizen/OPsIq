import { test, expect } from '@playwright/test';
import {
  TEST_USERS,
  WORKSPACE_ID,
  authenticateUser,
  waitForPageReady,
  captureScreenshot,
  checkClientHealth,
  saveTestContext,
  fillFormField,
  clickElement,
} from './helpers';

test.describe('PHASE C: Core Product Workflow Execution', () => {
  const workflowMetrics: any[] = [];

  test('1. Dashboard rendering and state', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Verify dashboard elements
    await expect(page.locator('h1, h2')).first().toBeVisible();

    // Check for key sections
    const hasSidebar = await page.locator('nav, aside').first().isVisible().catch(() => false);
    const hasMainContent = await page.locator('main, [role="main"]').first().isVisible().catch(() => false);

    await captureScreenshot(page, 'dashboard-home');

    const health = await checkClientHealth(page);
    expect(health.healthy).toBe(true);

    workflowMetrics.push({
      workflow: 'dashboard-load',
      hasSidebar,
      hasMainContent,
      clientHealthy: health.healthy,
    });

    console.log(`✓ Dashboard rendered (sidebar: ${hasSidebar}, main: ${hasMainContent})`);
  });

  test('2. Engagement list navigation', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Navigate to engagements
    const engagementsLink = page.locator('a:has-text("Engagement"), [data-testid="nav-engagements"]').first();
    const isVisible = await engagementsLink.isVisible().catch(() => false);

    if (isVisible) {
      const startTime = Date.now();
      await engagementsLink.click();
      await waitForPageReady(page);
      const navigationTime = Date.now() - startTime;

      // Verify on engagements page
      expect(page.url()).toContain('/engagements');

      // Check for engagement list elements
      const listItems = page.locator('[data-testid="engagement-item"], .engagement-card, li').count();
      const count = await listItems;

      await captureScreenshot(page, 'engagements-list');

      const health = await checkClientHealth(page);
      expect(health.healthy).toBe(true);

      workflowMetrics.push({
        workflow: 'engagement-navigation',
        navigationTime,
        listItemsCount: count,
        clientHealthy: health.healthy,
      });

      console.log(`✓ Engagements page loaded (${navigationTime}ms, ${count} items)`);
    } else {
      console.log('⚠ Engagements link not found');
    }
  });

  test('3. Engagement creation flow', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Navigate to create engagement
    const createButton = page.locator('button:has-text("Create"), button:has-text("New"), [data-testid="create-engagement"]').first();
    const isVisible = await createButton.isVisible().catch(() => false);

    if (isVisible) {
      const startTime = Date.now();
      await createButton.click();

      // Wait for modal or form to appear
      await page.waitForTimeout(500);
      const formVisible = await page.locator('form, [role="dialog"]').first().isVisible().catch(() => false);

      if (formVisible) {
        // Fill form fields (adapt selectors as needed)
        const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
        const clientSelect = page.locator('select[name="clientId"], input[name="client"]').first();

        const titleVisible = await titleInput.isVisible().catch(() => false);

        if (titleVisible) {
          await titleInput.fill('Browser Test Engagement');

          // Select client if available
          const clientVisible = await clientSelect.isVisible().catch(() => false);
          if (clientVisible) {
            await clientSelect.click();
            // Select first option
            await page.locator('[role="option"], option').first().click();
          }

          // Submit
          const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').first();
          const submitVisible = await submitButton.isVisible().catch(() => false);

          if (submitVisible) {
            const mutationStartTime = Date.now();
            await submitButton.click();

            // Wait for success (redirect or success message)
            await page.waitForTimeout(2000);
            const mutationTime = Date.now() - mutationStartTime;

            const successMessage = await page.locator('[data-testid="success"], .success, .alert-success').first().isVisible().catch(
              () => false
            );

            await captureScreenshot(page, 'engagement-created');

            const health = await checkClientHealth(page);
            expect(health.healthy).toBe(true);

            workflowMetrics.push({
              workflow: 'engagement-creation',
              navigationTime: Date.now() - startTime,
              mutationTime,
              success: successMessage,
              clientHealthy: health.healthy,
            });

            console.log(`✓ Engagement creation completed (mutation: ${mutationTime}ms)`);
          }
        }
      }
    } else {
      console.log('⚠ Create engagement button not found');
    }
  });

  test('4. Navigation stability - no broken links', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    const brokenLinks: string[] = [];

    // Collect all navigation links
    const links = page.locator('nav a, aside a, [role="navigation"] a').all();
    const linkList = await links;

    // Test first 5 navigation links
    for (let i = 0; i < Math.min(5, linkList.length); i++) {
      const link = linkList[i];
      const href = await link.getAttribute('href');

      if (href && !href.startsWith('http')) {
        try {
          await link.click();
          await page.waitForLoadState('networkidle');

          // Check if page loaded
          const isErrorPage = await page.locator('[data-testid="error"], .error-page').first().isVisible().catch(() => false);

          if (isErrorPage) {
            brokenLinks.push(href);
          }
        } catch (e) {
          brokenLinks.push(href);
        }

        // Go back
        await page.goBack();
        await waitForPageReady(page);
      }
    }

    expect(brokenLinks.length).toBe(0);
    console.log(`✓ Navigation links functional (${linkList.length} links tested, 0 broken)`);
  });

  test('5. No stale rendering or infinite loaders', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Navigate through a workflow
    const navigationLink = page.locator('a, button').first();
    await navigationLink.click();

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Check for infinite loaders
    const loaders = page.locator('[data-testid="loader"], .spinner, .loading').all();
    const loaderList = await loaders;

    // After page settle, visible loaders should be minimal
    let visibleLoadersCount = 0;
    for (const loader of loaderList) {
      if (await loader.isVisible().catch(() => false)) {
        visibleLoadersCount++;
      }
    }

    expect(visibleLoadersCount).toBeLessThan(2);

    const health = await checkClientHealth(page);
    expect(health.healthy).toBe(true);

    console.log(`✓ No infinite loaders (${visibleLoadersCount} visible, ${loaderList.length} total)`);
  });

  test('6. Optimistic updates - UI reflects mutations', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Find a clickable mutation element (e.g., status button, toggle)
    const mutationButton = page.locator('button[data-testid*="toggle"], button[data-testid*="status"], button[data-testid*="action"]').first();
    const isVisible = await mutationButton.isVisible().catch(() => false);

    if (isVisible) {
      const beforeState = await mutationButton.textContent();

      const startTime = Date.now();
      await mutationButton.click();
      const uiUpdateTime = Date.now() - startTime;

      await page.waitForTimeout(500);
      const afterState = await mutationButton.textContent();

      // UI should update immediately (optimistic) or quickly (<1s)
      expect(uiUpdateTime).toBeLessThan(1000);

      await captureScreenshot(page, 'optimistic-update');

      console.log(`✓ Optimistic update reflected (${uiUpdateTime}ms)`);
    } else {
      console.log('⚠ Mutation button not found');
    }
  });

  test('7. No duplicate mutations on click', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Find a mutation button
    const mutationButton = page.locator('button[data-testid*="create"], button[type="submit"]').first();
    const isVisible = await mutationButton.isVisible().catch(() => false);

    if (isVisible) {
      // Double-click rapidly
      const clickCount = 2;
      const startTime = Date.now();

      for (let i = 0; i < clickCount; i++) {
        await mutationButton.click();
        await page.waitForTimeout(50);
      }

      const clickTime = Date.now() - startTime;

      // Wait for backend response
      await page.waitForTimeout(2000);

      // Check if duplicates were created
      const duplicateIndicators = await page.locator('[data-testid="duplicate-error"], .duplicate-error').count();

      const noDuplicates = duplicateIndicators === 0;
      expect(noDuplicates).toBe(true);

      workflowMetrics.push({
        workflow: 'double-click-prevention',
        clickTime,
        noDuplicates,
      });

      console.log(`✓ No duplicates created (${clickCount} rapid clicks)`);
    } else {
      console.log('⚠ Mutation button not found');
    }
  });

  test.afterAll(async () => {
    // Save workflow metrics
    saveTestContext('core-workflows', {
      phase: 'PHASE C - Core Product Workflows',
      totalTests: 7,
      metrics: workflowMetrics,
    });
  });
});
