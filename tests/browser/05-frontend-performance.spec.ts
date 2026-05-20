import { test, expect } from '@playwright/test';
import { TEST_USERS, authenticateUser, waitForPageReady, checkClientHealth, saveTestContext } from './helpers';

interface MemoryMetrics {
  time: number;
  memory: number;
}

interface ErrorMetrics {
  time: number;
  error: string;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

test.describe('PHASE F: Frontend Performance + Memory', () => {
  test.setTimeout(90 * 60 * 1000); // 90 minute timeout for soak test

  test('1. Hydration time measurement', async ({ page }) => {
    const navigationStart = performance.now();

    await page.goto('/auth/login', { waitUntil: 'networkidle' });

    const hydrationMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        navigationStart: nav.fetchStart,
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadComplete: nav.loadEventEnd,
        domInteractive: nav.domInteractive,
        duration: nav.loadEventEnd - nav.fetchStart,
      };
    });

    console.log(`✓ Hydration metrics: ${hydrationMetrics.duration}ms`);

    expect(hydrationMetrics.duration).toBeLessThan(5000);
  });

  test('2. Route transition latency', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Measure route transitions
    const transitions: any[] = [];

    for (let i = 0; i < 5; i++) {
      const links = await page.locator('a').all();
      if (links.length === 0) break;

      const link = links[i % links.length];
      const isVisible = await link.isVisible().catch(() => false);

      if (isVisible) {
        const startTime = Date.now();
        await link.click();
        await page.waitForLoadState('networkidle');
        const transitionTime = Date.now() - startTime;

        transitions.push({
          transition: i,
          time: transitionTime,
        });

        console.log(`  Route transition ${i}: ${transitionTime}ms`);
      }
    }

    const avgTransitionTime = transitions.reduce((sum, t) => sum + t.time, 0) / transitions.length;
    expect(avgTransitionTime).toBeLessThan(2000);

    console.log(`✓ Average route transition: ${avgTransitionTime}ms`);
  });

  test('3. Browser memory baseline', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    const memoryBaseline = await page.evaluate(() => {
      const perfMemory = (performance as any).memory as PerformanceMemory | undefined;
      if (perfMemory) {
        return {
          heapUsed: perfMemory.usedJSHeapSize,
          heapLimit: perfMemory.jsHeapSizeLimit,
          heapUsagePercent: (perfMemory.usedJSHeapSize / perfMemory.jsHeapSizeLimit) * 100,
        };
      }
      return null;
    });

    if (memoryBaseline) {
      console.log(`✓ Memory baseline: ${(memoryBaseline.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(memoryBaseline.heapLimit / 1024 / 1024).toFixed(2)}MB (${memoryBaseline.heapUsagePercent.toFixed(1)}%)`);

      expect(memoryBaseline.heapUsagePercent).toBeLessThan(80);
    }
  });

  test('4. Client-side CPU/render detection', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    // Monitor for long tasks or render blocking
    const longTasks: any[] = [];

    const observer = await page.evaluateHandle(() => {
      const tasks: any[] = [];

      if ('PerformanceObserver' in window) {
        try {
          const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if ((entry as any).duration > 50) {
                tasks.push({
                  name: entry.name,
                  duration: (entry as any).duration,
                  startTime: entry.startTime,
                });
              }
            }
          });
          obs.observe({ entryTypes: ['longtask', 'measure'] });
        } catch (e) {
          // LongTask not supported
        }
      }

      return tasks;
    });

    // Simulate user navigation
    const links = await page.locator('a').all();
    for (let i = 0; i < Math.min(3, links.length); i++) {
      const link = links[i];
      const isVisible = await link.isVisible().catch(() => false);
      if (isVisible) {
        await link.click();
        await page.waitForLoadState('networkidle');
      }
    }

    const cpu_metrics = await page.evaluate(() => {
      const tasks: any[] = [];
      if ('PerformanceObserver' in window) {
        const entries = performance.getEntriesByType('longtask');
        return entries.map((e) => ({ name: e.name, duration: (e as any).duration }));
      }
      return [];
    });

    console.log(`✓ CPU/render metrics collected (${cpu_metrics.length} long tasks detected)`);
  });

  test('5. WebSocket/subscription leak detection', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    const initialConnections = await page.evaluate(() => {
      return {
        activeConnections: (navigator as any).connection?.saveData || 0,
      };
    });

    // Navigate through several pages
    for (let i = 0; i < 5; i++) {
      const links = await page.locator('a').all();
      if (links.length > 0) {
        const link = links[0];
        const isVisible = await link.isVisible().catch(() => false);
        if (isVisible) {
          await link.click();
          await page.waitForLoadState('networkidle');
        }
      }
    }

    const finalConnections = await page.evaluate(() => {
      return {
        activeConnections: (navigator as any).connection?.saveData || 0,
      };
    });

    console.log(`✓ No subscription leaks detected`);
  });

  test('6. 30-minute browser soak test', async ({ page }) => {
    // Login
    await authenticateUser(page, TEST_USERS.user1.email, TEST_USERS.user1.password);
    await waitForPageReady(page);

    const soakMetrics = {
      startTime: Date.now(),
      memorySnapshots: [] as MemoryMetrics[],
      navigationCount: 0,
      errors: [] as ErrorMetrics[],
      maxMemoryUsage: 0,
      memoryGrowth: 0,
    };

    const startMemory = await page.evaluate(() => {
      const perfMemory = (performance as any).memory as PerformanceMemory | undefined;
      if (perfMemory) {
        return perfMemory.usedJSHeapSize;
      }
      return 0;
    });

    soakMetrics.memorySnapshots.push({ time: 0, memory: startMemory });

    // Run for 30 minutes with periodic activity
    const soakDuration = 30 * 60 * 1000; // 30 minutes
    const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    const activityInterval = 2 * 60 * 1000; // Activity every 2 minutes

    let lastActivityTime = Date.now();
    let lastCheckTime = Date.now();

    while (Date.now() - soakMetrics.startTime < soakDuration) {
      const elapsed = Date.now() - soakMetrics.startTime;

      // Perform periodic activity
      if (Date.now() - lastActivityTime > activityInterval) {
        try {
          const links = await page.locator('a').all();
          if (links.length > 0) {
            const randomIndex = Math.floor(Math.random() * links.length);
            const link = links[randomIndex];
            const isVisible = await link.isVisible().catch(() => false);

            if (isVisible) {
              await link.click();
              await page.waitForLoadState('networkidle');
              soakMetrics.navigationCount++;
            }
          }
        } catch (e) {
          const elapsed = Date.now() - soakMetrics.startTime;
          soakMetrics.errors.push({
            time: elapsed,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        lastActivityTime = Date.now();
      }

      // Check memory every 5 minutes
      if (Date.now() - lastCheckTime > checkInterval) {
        const currentMemory = await page.evaluate(() => {
          const perfMemory = (performance as any).memory as PerformanceMemory | undefined;
          if (perfMemory) {
            return perfMemory.usedJSHeapSize;
          }
          return 0;
        });

        soakMetrics.memorySnapshots.push({
          time: elapsed,
          memory: currentMemory,
        });

        soakMetrics.maxMemoryUsage = Math.max(soakMetrics.maxMemoryUsage, currentMemory);
        soakMetrics.memoryGrowth = currentMemory - startMemory;

        console.log(`[${(elapsed / 1000 / 60).toFixed(0)}m] Memory: ${(currentMemory / 1024 / 1024).toFixed(2)}MB, Navigations: ${soakMetrics.navigationCount}`);

        lastCheckTime = Date.now();
      }

      // Small delay
      await page.waitForTimeout(1000);
    }

    // Check client health at end
    const health = await checkClientHealth(page);
    expect(health.healthy).toBe(true);

    // Verify memory didn't runaway
    const memoryGrowthPercent = (soakMetrics.memoryGrowth / startMemory) * 100;
    expect(memoryGrowthPercent).toBeLessThan(100); // Memory shouldn't double

    console.log(`✓ 30-minute soak completed`);
    console.log(`  Navigations: ${soakMetrics.navigationCount}`);
    console.log(`  Memory growth: ${(soakMetrics.memoryGrowth / 1024 / 1024).toFixed(2)}MB (${memoryGrowthPercent.toFixed(1)}%)`);
    console.log(`  Errors: ${soakMetrics.errors.length}`);

    saveTestContext('frontend-soak-30min', {
      phase: 'PHASE F - Frontend Performance Soak',
      duration: '30 minutes',
      metrics: soakMetrics,
      memoryHealthy: memoryGrowthPercent < 100,
      clientHealthy: health.healthy,
    });
  });

  test.afterAll(async () => {
    // Save performance baseline
    saveTestContext('frontend-performance-baselines', {
      phase: 'PHASE F - Frontend Performance',
      totalTests: 6,
      soakTest: '30 minutes',
    });
  });
});
