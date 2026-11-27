/**
 * Canonical public contact address for OpsIQ (owner-confirmed). It is the only authorized OpsIQ contact mailbox:
 * every customer-facing contact link, legal/support page and data-export notice reads it from here so a future
 * mailbox change is one edit. Do not add another address without explicit owner confirmation. Having this address
 * says nothing about response-time commitments.
 */
export const CONTACT_EMAIL = "contact.us@opsiq.solutions";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
