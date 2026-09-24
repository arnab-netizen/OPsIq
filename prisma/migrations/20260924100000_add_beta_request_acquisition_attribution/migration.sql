-- AlterTable: acquisition attribution for public beta requests (owned
-- resource surface). Additive-only: four NULLABLE columns with no default, so
-- this is a metadata-only change in PostgreSQL (no table rewrite, no backfill)
-- and every existing row and read path is unaffected (existing rows read NULL).
--
-- utm_term completes the standard utm_* set already stored; landing_path and
-- referrer_host are the first-touch landing page (path only, no query string)
-- and external referring hostname (never a full URL) for the visitor's
-- browser tab; conversion_path is the page the request was submitted from.
ALTER TABLE "beta_requests" ADD COLUMN "utm_term" TEXT;
ALTER TABLE "beta_requests" ADD COLUMN "landing_path" TEXT;
ALTER TABLE "beta_requests" ADD COLUMN "conversion_path" TEXT;
ALTER TABLE "beta_requests" ADD COLUMN "referrer_host" TEXT;
