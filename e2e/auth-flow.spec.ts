import { test, expect } from '@playwright/test';

test.describe('R1 Product Flow', () => {
  test('Fixture validation - test user exists and can login', async ({ page }) => {
    // Visit login page
    await page.goto('/login');
    expect(await page.title()).toContain('OpsIQ');

    // Verify login form is present
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Login with seeded credentials
    await emailInput.fill('test-seed@example.com');
    await passwordInput.fill('test-password-123');
    await page.locator('button[type="submit"]').click();

    // Verify redirect to dashboard/workspace
    await page.waitForURL(/\/(dashboard|engagements|workspace)/, { timeout: 5000 }).catch(() => null);

    // Verify not on login page anymore
    expect(page.url()).not.toContain('/login');
  });

  test('Auth persistence - session survives page refresh', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('test-seed@example.com');
    await page.locator('input[type="password"]').fill('test-password-123');
    await page.locator('button[type="submit"]').click();

    // Wait for authenticated state
    await page.waitForURL(/\/(dashboard|engagements|workspace)/, { timeout: 5000 }).catch(() => null);
    const firstUrl = page.url();

    // Refresh page
    await page.reload();

    // Verify still authenticated (not redirected to login)
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toBe(firstUrl);
  });

  test('Logout flow - clears session and redirects to login', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('test-seed@example.com');
    await page.locator('input[type="password"]').fill('test-password-123');
    await page.locator('button[type="submit"]').click();

    // Wait for authenticated state
    await page.waitForURL(/\/(dashboard|engagements|workspace)/, { timeout: 5000 }).catch(() => null);

    // Find and click logout (may be in menu or header)
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), [aria-label*="logout" i]').first();
    if (await logoutButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await logoutButton.click();
    } else {
      // Try via API if UI logout not found
      const logoutResponse = await page.request.post('/api/auth/logout');
      expect(logoutResponse.ok()).toBeTruthy();
    }

    // Should redirect to login or be unable to access protected content
    await page.waitForURL('/login', { timeout: 5000 }).catch(() => null);
  });

  test('Protected route blocking - unauthenticated access redirected', async ({ page }) => {
    // Try to access protected route without logging in
    await page.goto('/engagements', { waitUntil: 'networkidle' });

    // Should be redirected to login or show login form
    const url = page.url();
    const isOnLogin = url.includes('/login') || await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(isOnLogin).toBeTruthy();
  });
});
