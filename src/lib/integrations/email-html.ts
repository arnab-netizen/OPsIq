/**
 * Minimal HTML-escaping for values interpolated into operator-notification
 * email HTML (beta-request/feedback notifications, beta approval emails).
 * These emails embed visitor/user-supplied strings (name, email, UTM values,
 * feedback description) directly in HTML — without escaping, a submitter
 * could inject arbitrary markup into the email an operator opens. Plain-text
 * email bodies are unaffected: they never need escaping.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
