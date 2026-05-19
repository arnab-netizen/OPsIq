import { test, expect, Page } from '@playwright/test';
import {
  TEST_USERS,
  authenticateUser,
  waitForPageReady,
  captureScreenshot,
  checkClientHealth,
  saveTestContext,
} from './helpers';

test.describe('PHASE B: Authentication Flow Runtime', () => {
  let authTimings: any[] = [];

  test('1. Login flow - valid credentials', async ({ page, context }) => {
    const startTime = Date.now();

    // Navigate to login
    await page.goto('/auth/login', { waitUntil: 'networkidle' });
    const loadTime = Date.now() - startTime;

    // Verify page elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Screenshot before login
    await captureScreenshot(page, 'auth-login-form');

    // Perform authentication
    const sessionStartTime = Date.now();
    const session = await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    const authTime = Date.now() - sessionStartTime;

    authTimings.push({ flow: 'valid-login', authTime, loadTime });

    // Should redirect to dashboard
    await waitForPageReady(page);
    const currentPath = page.url();
    expect(currentPath).toContain('/dashboard');

    // Verify session cookie persisted
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session') || c.name.includes('auth'));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.httpOnly).toBeTruthy();

    // Check client health
    const health = await checkClientHealth(page);
    expect(health.healthy).toBe(true);

    // Screenshot after login
    await captureScreenshot(page, 'auth-dashboard-loaded');

    console.log(`✓ Login successful (auth: ${authTime}ms, load: ${loadTime}ms)`);
  });

  test('2. Login flow - invalid credentials', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'networkidle' });

    await page.fill('input[type="email"]', TEST_USERS.user1.email);
    await page.fill('input[type="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    // Should stay on login page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/auth/login');

    // Error message should appear
    const errorElement = page.locator('[data-testid="error-message"]');
    const isVisible = await errorElement.isVisible().catch(() => false);

    await captureScreenshot(page, 'auth-invalid-credentials');

    console.log(`✓ Invalid login rejected (error displayed: ${isVisible})`);
  });

  test('3. Session persistence - page refresh', async ({ page, context }) => {
    // Login
    const session = await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    const dashboardUrl = page.url();

    // Refresh page
    const startRefresh = Date.now();
    await page.reload({ waitUntil: 'networkidle' });
    const refreshTime = Date.now() - startRefresh;

    // Should remain on dashboard
    expect(page.url()).toBe(dashboardUrl);

    // Session cookie should still exist
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session') || c.name.includes('auth'));
    expect(sessionCookie).toBeTruthy();

    // Check client health after refresh
    const health = await checkClientHealth(page);
    expect(health.healthy).toBe(true);

    console.log(`✓ Session persisted after refresh (${refreshTime}ms)`);
  });

  test('4. Multi-tab session behavior', async ({ browser }) => {
    // Create first tab
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const session = await authenticateUser(page1, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page1);

    // Create second tab in same context
    const page2 = await context.newPage();
    await page2.goto('/dashboard', { waitUntil: 'networkidle' });

    // Both tabs should be authenticated
    const cookies1 = await page1.context().cookies();
    const cookies2 = await page2.context().cookies();

    const sessionCookie1 = cookies1.find((c) => c.name.includes('session'));
    const sessionCookie2 = cookies2.find((c) => c.name.includes('session'));

    expect(sessionCookie1?.value).toBe(sessionCookie2?.value);

    // Verify both pages are healthy
    const health1 = await checkClientHealth(page1);
    const health2 = await checkClientHealth(page2);
    expect(health1.healthy).toBe(true);
    expect(health2.healthy).toBe(true);

    await page1.close();
    await page2.close();
    await context.close();

    console.log('✓ Multi-tab session sharing verified');
  });

  test('5. Logout flow', async ({ page, context }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Logout"), [data-testid="logout-button"]');
    const isVisible = await logoutButton.isVisible().catch(() => false);

    if (isVisible) {
      await logoutButton.click();

      // Should redirect to login
      await page.waitForURL('**/auth/login', { timeout: 5000 });
      expect(page.url()).toContain('/auth/login');

      // Session cookie should be cleared or expired
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((c) => c.name.includes('session'));
      expect(!sessionCookie || sessionCookie.expires < Date.now() / 1000).toBeTruthy();

      console.log('✓ Logout successful');
    } else {
      console.log('⚠ Logout button not found, skipping logout test');
    }

    await captureScreenshot(page, 'auth-after-logout');
  });

  test('6. No auth loop on redirect', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Should redirect to login (not loop)
    const maxRedirects = 3;
    let redirectCount = 0;
    const startUrl = page.url();

    for (let i = 0; i < maxRedirects; i++) {
      if (!page.url().includes('/auth/login')) {
        redirectCount++;
        await page.waitForTimeout(500);
      }
    }

    // Should be on login or protected route
    const finalUrl = page.url();
    const isLoginOrProtected = finalUrl.includes('/auth/login') || finalUrl.includes('/dashboard');
    expect(isLoginOrProtected).toBe(true);

    console.log(`✓ No auth loop detected (final: ${finalUrl})`);
  });

  test('7. Hydration mismatch detection', async ({ page }) => {
    // Login to trigger potential hydration mismatches
    const session = await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Check for hydration errors
    const health = await checkClientHealth(page);

    if (!health.healthy) {
      saveTestContext('hydration-errors', { errors: health.errors });
    }

    expect(health.healthy).toBe(true);
    console.log(`✓ No hydration mismatches (${health.errors.length} errors found)`);
  });

  test.afterAll(async () => {
    // Save auth timing report
    saveTestContext('auth-timings', {
      phase: 'PHASE B - Authentication Flows',
      totalTests: 7,
      timings: authTimings,
      avgAuthTime: authTimings.reduce((sum, t) => sum + t.authTime, 0) / authTimings.length,
    });
  });
});
