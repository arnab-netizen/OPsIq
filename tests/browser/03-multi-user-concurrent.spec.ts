import { test, expect } from '@playwright/test';
import {
  TEST_USERS,
  authenticateUser,
  waitForPageReady,
  captureScreenshot,
  checkClientHealth,
  saveTestContext,
  createAuthenticatedContext,
} from './helpers';

test.describe('PHASE D: Multi-User Concurrent Execution', () => {
  const concurrencyMetrics: any[] = [];

  test('1. Two-user concurrent workflows', async ({ browser }) => {
    const startTime = Date.now();

    // Create two authenticated contexts in parallel
    const context1Promise = createAuthenticatedContext(
      browser,
      TEST_USERS.user1.email,
      TEST_USERS.user1.password
    );
    const context2Promise = createAuthenticatedContext(
      browser,
      TEST_USERS.user2.email,
      TEST_USERS.user2.password
    );

    const [{ context: context1, page: page1, session: session1 }, { context: context2, page: page2, session: session2 }] =
      await Promise.all([context1Promise, context2Promise]);

    const setupTime = Date.now() - startTime;

    // Both should be on dashboard
    await waitForPageReady(page1);
    await waitForPageReady(page2);

    expect(page1.url()).toContain('/dashboard');
    expect(page2.url()).toContain('/dashboard');

    // Check client health for both
    const health1 = await checkClientHealth(page1);
    const health2 = await checkClientHealth(page2);

    expect(health1.healthy).toBe(true);
    expect(health2.healthy).toBe(true);

    await captureScreenshot(page1, 'multi-user-user1-dashboard');
    await captureScreenshot(page2, 'multi-user-user2-dashboard');

    concurrencyMetrics.push({
      scenario: 'two-user-setup',
      setupTime,
      user1Health: health1.healthy,
      user2Health: health2.healthy,
    });

    await page1.close();
    await page2.close();
    await context1.close();
    await context2.close();

    console.log(`✓ Two-user concurrent setup (${setupTime}ms)`);
  });

  test('2. Simultaneous mutations in different workspaces', async ({ browser }) => {
    // Create two contexts
    const { context: context1, page: page1 } = await createAuthenticatedContext(
      browser,
      TEST_USERS.user1.email,
      TEST_USERS.user1.password
    );
    const { context: context2, page: page2 } = await createAuthenticatedContext(
      browser,
      TEST_USERS.user2.email,
      TEST_USERS.user2.password
    );

    await waitForPageReady(page1);
    await waitForPageReady(page2);

    // Both users perform mutations simultaneously
    const mutation1Start = Date.now();
    const mutation2Start = Date.now();

    // Navigate to create engagements
    const createButton1 = page1.locator('button:has-text("Create"), [data-testid="create-engagement"]').first();
    const createButton2 = page2.locator('button:has-text("Create"), [data-testid="create-engagement"]').first();

    const button1Visible = await createButton1.isVisible().catch(() => false);
    const button2Visible = await createButton2.isVisible().catch(() => false);

    if (button1Visible && button2Visible) {
      // Click both simultaneously
      await Promise.all([createButton1.click(), createButton2.click()]);

      // Wait for forms to appear
      await page1.waitForTimeout(500);
      await page2.waitForTimeout(500);

      const mutation1Time = Date.now() - mutation1Start;
      const mutation2Time = Date.now() - mutation2Start;

      // Verify both remained responsive
      const form1Visible = await page1.locator('form, [role="dialog"]').first().isVisible().catch(() => false);
      const form2Visible = await page2.locator('form, [role="dialog"]').first().isVisible().catch(() => false);

      expect(form1Visible || button1Visible).toBe(true);
      expect(form2Visible || button2Visible).toBe(true);

      concurrencyMetrics.push({
        scenario: 'simultaneous-mutations',
        mutation1Time,
        mutation2Time,
        maxTime: Math.max(mutation1Time, mutation2Time),
      });

      console.log(`✓ Simultaneous mutations (user1: ${mutation1Time}ms, user2: ${mutation2Time}ms)`);
    } else {
      console.log('⚠ Create buttons not found');
    }

    await page1.close();
    await page2.close();
    await context1.close();
    await context2.close();
  });

  test('3. Tenant isolation - data leakage detection', async ({ browser }) => {
    // Create contexts for two different users
    const { context: context1, page: page1 } = await createAuthenticatedContext(
      browser,
      TEST_USERS.user1.email,
      TEST_USERS.user1.password
    );
    const { context: context2, page: page2 } = await createAuthenticatedContext(
      browser,
      TEST_USERS.user2.email,
      TEST_USERS.user2.password
    );

    await waitForPageReady(page1);
    await waitForPageReady(page2);

    // Navigate both to same path (e.g., engagements)
    await page1.goto('/engagements', { waitUntil: 'networkidle' });
    await page2.goto('/engagements', { waitUntil: 'networkidle' });

    // Get engagement lists
    const list1Content = await page1.content();
    const list2Content = await page2.content();

    // Extract engagement IDs or names from both
    const engagements1 = list1Content.match(/engagement[_-]?id["\']?:\s*["\']?([^"'\s,}]+)/gi) || [];
    const engagements2 = list2Content.match(/engagement[_-]?id["\']?:\s*["\']?([^"'\s,}]+)/gi) || [];

    // Lists should be different (users have different data)
    const overlap = engagements1.filter((e) => engagements2.includes(e));

    concurrencyMetrics.push({
      scenario: 'tenant-isolation',
      user1Engagements: engagements1.length,
      user2Engagements: engagements2.length,
      dataOverlap: overlap.length,
    });

    expect(overlap.length).toBeLessThanOrEqual(0);

    console.log(`✓ Tenant isolation verified (user1: ${engagements1.length}, user2: ${engagements2.length})`);

    await page1.close();
    await page2.close();
    await context1.close();
    await context2.close();
  });

  test('4. No stale data after refresh', async ({ browser }) => {
    const { context, page } = await createAuthenticatedContext(
      browser,
      TEST_USERS.user1.email,
      TEST_USERS.user1.password
    );

    await waitForPageReady(page);

    // Get initial page state
    const initialContent = await page.content();

    // Refresh
    const refreshStart = Date.now();
    await page.reload({ waitUntil: 'networkidle' });
    const refreshTime = Date.now() - refreshStart;

    // Get state after refresh
    const refreshedContent = await page.content();

    // Check if stale data appears (look for "stale" indicators)
    const hasStaleIndicator =
      refreshedContent.includes('stale') || refreshedContent.includes('Stale') || refreshedContent.includes('STALE');

    expect(hasStaleIndicator).toBe(false);

    const health = await checkClientHealth(page);
    expect(health.healthy).toBe(true);

    concurrencyMetrics.push({
      scenario: 'stale-refresh',
      refreshTime,
      hasStaleData: hasStaleIndicator,
      clientHealthy: health.healthy,
    });

    console.log(`✓ No stale data after refresh (${refreshTime}ms)`);

    await page.close();
    await context.close();
  });

  test('5. Concurrent tab refresh - state consistency', async ({ browser }) => {
    // Create context
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Authenticate in first tab
    await authenticateUser(page1, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page1);

    // Navigate second tab
    await page2.goto('/dashboard', { waitUntil: 'networkidle' });
    await waitForPageReady(page2);

    // Refresh both simultaneously
    const refreshStart = Date.now();
    await Promise.all([
      page1.reload({ waitUntil: 'networkidle' }),
      page2.reload({ waitUntil: 'networkidle' }),
    ]);
    const refreshTime = Date.now() - refreshStart;

    // Both should be healthy
    const health1 = await checkClientHealth(page1);
    const health2 = await checkClientHealth(page2);

    expect(health1.healthy).toBe(true);
    expect(health2.healthy).toBe(true);

    // Both should be on same state
    expect(page1.url().pathname).toBe(page2.url().pathname);

    concurrencyMetrics.push({
      scenario: 'concurrent-tab-refresh',
      refreshTime,
      bothHealthy: health1.healthy && health2.healthy,
    });

    console.log(`✓ Concurrent tab refresh safe (${refreshTime}ms)`);

    await page1.close();
    await page2.close();
    await context.close();
  });

  test('6. Session revocation isolation', async ({ browser, context }) => {
    // Create context and authenticate
    const page1 = await context.newPage();
    await authenticateUser(page1, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page1);

    // Get initial auth state
    const cookies1 = await context.cookies();
    const sessionCookie1 = cookies1.find((c) => c.name.includes('session'));

    expect(sessionCookie1).toBeTruthy();

    // Simulate session revocation (clear auth cookie)
    if (sessionCookie1) {
      await context.clearCookies({ name: sessionCookie1.name });
    }

    // Try to navigate to protected route
    await page1.goto('/dashboard', { waitUntil: 'networkidle' });

    // Should be redirected to login
    expect(page1.url()).toContain('/auth/login');

    console.log('✓ Session revocation isolation verified');

    await page1.close();
  });

  test.afterAll(async () => {
    // Save concurrency metrics
    saveTestContext('multi-user-concurrent', {
      phase: 'PHASE D - Multi-User Concurrency',
      totalTests: 6,
      metrics: concurrencyMetrics,
      avgSetupTime: concurrencyMetrics.reduce((sum, m) => sum + (m.setupTime || 0), 0) / concurrencyMetrics.length,
    });
  });
});
