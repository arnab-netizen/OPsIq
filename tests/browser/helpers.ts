import { Page, BrowserContext, Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const TEST_USERS = {
  user1: { email: 'test1@staging.local', password: 'password123', name: 'Test User 1' },
  user2: { email: 'test2@staging.local', password: 'password123', name: 'Test User 2' },
  user3: { email: 'test3@staging.local', password: 'password123', name: 'Test User 3' },
};

export const WORKSPACE_ID = '30000000-0000-0000-0000-000000000002';

// Helper: Authenticate and return session cookies
export async function authenticateUser(
  page: Page,
  email: string,
  password: string
): Promise<{ sessionToken: string; timestamp: string }> {
  const startTime = new Date().toISOString();

  // Navigate to login page
  await page.goto('/auth/login', { waitUntil: 'networkidle' });

  // Verify page loaded
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // Fill email and password
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit form
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('button[type="submit"]'),
  ]);

  // Extract session token from cookies
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.includes('session') || c.name.includes('auth'));

  if (!sessionCookie) {
    throw new Error(`No session cookie found for ${email}`);
  }

  return {
    sessionToken: sessionCookie.value,
    timestamp: startTime,
  };
}

// Helper: Create isolated browser context with pre-authenticated session
export async function createAuthenticatedContext(
  browser: Browser,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page; session: { sessionToken: string; timestamp: string } }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const session = await authenticateUser(page, email, password);

  return { context, page, session };
}

// Helper: Verify page loaded and ready
export async function waitForPageReady(page: Page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
  // Wait for any React hydration to complete
  await page.waitForFunction(() => !document.querySelector('[data-loading="true"]'), {
    timeout,
  });
}

// Helper: Take timestamped screenshot
export async function captureScreenshot(page: Page, label: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${label}-${timestamp}.png`;
  const filepath = path.join('test-results/screenshots', filename);

  // Create directory if it doesn't exist
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await page.screenshot({ path: filepath });
  return filepath;
}

// Helper: Get console messages (errors, warnings, logs)
export async function captureConsoleMessages(page: Page): Promise<Array<{ type: string; text: string; location: unknown; timestamp: string }>> {
  const messages: Array<{ type: string; text: string; location: unknown; timestamp: string }> = [];

  page.on('console', (msg) => {
    messages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: new Date().toISOString(),
    });
  });

  return messages;
}

// Helper: Monitor network traffic
export async function captureNetworkMetrics(page: Page): Promise<Array<{ method: string; url: string; status: number; duration: number; timestamp: string }>> {
  const metrics: Array<{ method: string; url: string; status: number; duration: number; timestamp: string }> = [];

  page.on('request', (request) => {
    const startTime = Date.now();
    request.response().then((response) => {
      if (response) {
        metrics.push({
          method: request.method(),
          url: request.url(),
          status: response.status(),
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });

  return metrics;
}

// Helper: Check for hydration mismatches and client errors
export async function checkClientHealth(page: Page): Promise<{ healthy: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check for React hydration mismatches
  const hydrationErrors = await page.evaluate(() => {
    return (window as unknown as { __HYDRATION_ERRORS__?: string[] }).__HYDRATION_ERRORS__ || [];
  });

  if (hydrationErrors.length > 0) {
    errors.push(...hydrationErrors);
  }

  // Check for console errors
  const consoleErrors = await page.evaluate(() => {
    return (window as unknown as { __CONSOLE_ERRORS__?: string[] }).__CONSOLE_ERRORS__ || [];
  });

  if (consoleErrors.length > 0) {
    errors.push(...consoleErrors);
  }

  return {
    healthy: errors.length === 0,
    errors,
  };
}

// Helper: Wait for specific element and click
export async function clickElement(page: Page, selector: string, timeout = 5000) {
  const element = await page.waitForSelector(selector, { timeout });
  await element?.click();
}

// Helper: Wait for and fill form field
export async function fillFormField(page: Page, selector: string, value: string, timeout = 5000) {
  const field = await page.waitForSelector(selector, { timeout });
  await field?.fill(value);
}

// Helper: Get current URL path
export function getUrlPath(page: Page): string {
  return new URL(page.url()).pathname;
}

// Helper: Save test context for debugging
export function saveTestContext(
  label: string,
  data: unknown
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `context-${label}-${timestamp}.json`;
  const filepath = path.join('test-results/context', filename);

  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}
