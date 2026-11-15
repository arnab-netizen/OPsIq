/**
 * Full-document navigations used by the Clarity privacy boundary. Thin wrappers so the behaviour is observable in tests
 * (jsdom cannot stub window.location). A full-document load is the only supported way to destroy a Clarity runtime.
 */
export const reloadDocument = (): void => window.location.reload();
export const replaceDocument = (href: string): void => window.location.replace(href);
export const assignDocument = (href: string): void => window.location.assign(href);
