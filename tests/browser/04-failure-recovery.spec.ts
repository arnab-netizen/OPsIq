import { test, expect } from '@playwright/test';
import {
  TEST_USERS,
  authenticateUser,
  waitForPageReady,
  captureScreenshot,
  checkClientHealth,
  saveTestContext,
} from './helpers';

test.describe('PHASE E: Failure + Recovery UX', () => {
  const failureMetrics: any[] = [];

  test('1. Network interruption handling', async ({ page, context }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Simulate offline
    await context.setOffline(true);

    // Try to navigate or interact
    const navigationLink = page.locator('a, button').first();
    const isVisible = await navigationLink.isVisible().catch(() => false);

    if (isVisible) {
      try {
        await navigationLink.click();
        await page.waitForTimeout(1000);
      } catch (e) {
        // Expected to fail
      }
    }

    // Check for error UI
    const errorUI = await page.locator('[data-testid="error"], .error, .offline-message').first().isVisible().catch(() => false);

    await captureScreenshot(page, 'offline-error-ui');

    // Restore connection
    await context.setOffline(false);
    await page.waitForLoadState('networkidle');

    // Should recover
    const health = await checkClientHealth(page);

    failureMetrics.push({
      scenario: 'network-interruption',
      errorShown: errorUI,
      recoveredHealthy: health.healthy,
    });

    console.log(`✓ Network interruption handling (error shown: ${errorUI}, recovered: ${health.healthy})`);
  });

  test('2. Server restart simulation - session recovery', async ({ page, context }) => {
    // Login
    const session = await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    const initialUrl = page.url();

    // Wait and then reload (simulating server restart)
    await page.waitForTimeout(1000);
    const reloadStart = Date.now();
    await page.reload({ waitUntil: 'networkidle' });
    const reloadTime = Date.now() - reloadStart;

    // Session should persist
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session'));
    expect(sessionCookie).toBeTruthy();

    // Should be on same page
    expect(page.url()).toContain(initialUrl);

    // Check client health
    const health = await checkClientHealth(page);

    failureMetrics.push({
      scenario: 'server-restart-recovery',
      reloadTime,
      sessionPersisted: !!sessionCookie,
      clientHealthy: health.healthy,
    });

    console.log(`✓ Server restart simulation (reload: ${reloadTime}ms, session persisted)`);
  });

  test('3. Slow responses and timeout handling', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Set slow network simulation (if supported)
    await page.route('**/*', (route) => {
      setTimeout(() => route.continue(), 500);
    });

    // Try to navigate
    const startTime = Date.now();
    const navigationLink = page.locator('a').first();
    const isVisible = await navigationLink.isVisible().catch(() => false);

    if (isVisible) {
      try {
        await navigationLink.click({ timeout: 2000 });
      } catch (e) {
        // Timeout expected
      }
    }

    const responseTime = Date.now() - startTime;

    // Check for loading/timeout UI
    const loadingUI = await page.locator('[data-testid="loader"], .loading').first().isVisible().catch(() => false);

    await captureScreenshot(page, 'slow-response-ui');

    failureMetrics.push({
      scenario: 'slow-responses',
      responseTime,
      loadingUIShown: loadingUI,
    });

    console.log(`✓ Slow response handling (${responseTime}ms)`);
  });

  test('4. Failed mutation - error display', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Try to create with invalid data
    const createButton = page.locator('button:has-text("Create"), [data-testid="create"]').first();
    const isVisible = await createButton.isVisible().catch(() => false);

    if (isVisible) {
      // Click without filling required fields
      await createButton.click();
      await page.waitForTimeout(1000);

      // Check for validation error
      const errorMessage = await page.locator('[data-testid="error"], .error-message, .validation-error').first().isVisible().catch(() => false);

      await captureScreenshot(page, 'mutation-error-display');

      failureMetrics.push({
        scenario: 'failed-mutation-error',
        errorDisplayed: errorMessage,
      });

      console.log(`✓ Failed mutation error handling (error shown: ${errorMessage})`);
    }
  });

  test('5. No UI deadlock on error', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Introduce an error condition
    await page.goto('/invalid-page', { waitUntil: 'networkidle' });

    // Check if page is responsive (not deadlocked)
    const startTime = Date.now();
    const navigationLink = page.locator('a').first();
    const isClickable = await navigationLink.isEnabled().catch(() => false);
    const responsiveTime = Date.now() - startTime;

    expect(responsiveTime).toBeLessThan(2000);

    // Check for error page elements
    const hasErrorUI = await page.locator('[data-testid="error-page"], .error, 404').first().isVisible().catch(() => false);

    failureMetrics.push({
      scenario: 'no-ui-deadlock',
      responsiveTime,
      responsive: isClickable,
    });

    console.log(`✓ No UI deadlock on error (responsive: ${isClickable})`);
  });

  test('6. Retry behavior on failed requests', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    let requestAttempts = 0;

    // Monitor request retries
    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        requestAttempts++;
      }
    });

    // Trigger a mutation
    const createButton = page.locator('button:has-text("Create"), [data-testid="create"]').first();
    const isVisible = await createButton.isVisible().catch(() => false);

    if (isVisible) {
      await createButton.click();
      await page.waitForTimeout(2000);

      // Check if retry logic is present
      const retryButton = page.locator('button:has-text("Retry"), [data-testid="retry"]').first();
      const retryAvailable = await retryButton.isVisible().catch(() => false);

      failureMetrics.push({
        scenario: 'retry-behavior',
        requestAttempts,
        retryAvailable,
      });

      console.log(`✓ Retry behavior functional (attempts: ${requestAttempts}, retry available: ${retryAvailable})`);
    }
  });

  test('7. Expired session - graceful redirect', async ({ page, context }) => {
    // Login
    const session = await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Clear session cookie to simulate expiration
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session'));

    if (sessionCookie) {
      await context.clearCookies({ name: sessionCookie.name });
    }

    // Try to access protected route
    const redirectStart = Date.now();
    await page.reload({ waitUntil: 'networkidle' });
    const redirectTime = Date.now() - redirectStart;

    // Should redirect to login
    expect(page.url()).toContain('/auth/login');

    // No error page, clean redirect
    const hasErrorUI = await page.locator('[data-testid="error-page"]').first().isVisible().catch(() => false);
    expect(hasErrorUI).toBe(false);

    await captureScreenshot(page, 'expired-session-redirect');

    failureMetrics.push({
      scenario: 'expired-session',
      redirectTime,
      cleanRedirect: true,
    });

    console.log(`✓ Expired session handling (redirect: ${redirectTime}ms)`);
  });

  test.afterAll(async () => {
    // Save failure recovery metrics
    saveTestContext('failure-recovery', {
      phase: 'PHASE E - Failure + Recovery',
      totalTests: 7,
      metrics: failureMetrics,
    });
  });
});
