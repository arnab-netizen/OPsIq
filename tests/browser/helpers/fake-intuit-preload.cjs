'use strict';
/**
 * TEST HARNESS ONLY - a controlled FAKE of Intuit for a LOCAL acceptance server. This is NOT Intuit, NOT a Sandbox company and
 * NOT a real OAuth acceptance; it proves OpsIQ's own browser -> connect -> callback -> import -> canonical evidence -> first read
 * path against deterministic books.
 *
 * Loaded into the test SERVER process with `NODE_OPTIONS=--require <this file>`. Product code is unchanged: the server still
 * calls its fixed Intuit URLs through native fetch; this file only answers those hostnames. It is inert unless
 *   OPSIQ_FAKE_INTUIT=1 AND OPSIQ_DB_TARGET=local AND DATABASE_URL points at a loopback database,
 * and every OTHER intuit.com host is answered with a failure so nothing can ever reach the real provider.
 * Every call is appended to OPSIQ_FAKE_INTUIT_LOG (method, host, path only - never headers/bodies) so a test can prove the
 * provider was only READ.
 */
const fs = require('fs');
const enabled = process.env.OPSIQ_FAKE_INTUIT === '1' && process.env.OPSIQ_DB_TARGET === 'local' && /@(127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL || '');
if (enabled) {
  const realFetch = globalThis.fetch;
  const LOG = process.env.OPSIQ_FAKE_INTUIT_LOG || '/var/tmp/fake-intuit-calls.log';
  const log = (o) => { try { fs.appendFileSync(LOG, JSON.stringify(o) + '\n'); } catch {} };
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', intuit_tid: 'tid-fake', ...extra } });
  const cd = (...v) => v.map((value) => ({ value }));
  const fmt = (n) => Number(n).toFixed(2);
  const money = (title, key) => ({ ColTitle: title, ColType: 'Money', MetaData: [{ Name: 'ColKey', Value: key }] });
  const acct = { ColTitle: '', ColType: 'Account', MetaData: [{ Name: 'ColKey', Value: 'account' }] };
  // The fake company's home currency must match the OpsIQ test business (OpsIQ refuses to import a different currency: CURRENCY_MISMATCH).
  const CURRENCY = process.env.OPSIQ_FAKE_INTUIT_CURRENCY || 'GBP';
  const hdr = (name, extra) => ({ ReportName: name, ReportBasis: 'Accrual', Currency: CURRENCY, Option: [{ Name: 'NoReportData', Value: 'false' }], ...extra });
  // Deterministic books: every closed month has income, cost of goods and a bank balance; receivables/payables aged.
  const booksFor = (endDate) => { const n = Number(String(endDate).slice(5, 7)); return { income: 20000 + n, cogs: 9000, bank: 15000, arTotal: 8000, arCurrent: 3000, apTotal: 6000, apCurrent: 1000 }; };
  const pl = (s, e, b) => ({ Header: hdr('ProfitAndLoss', { StartPeriod: s, EndPeriod: e }), Columns: { Column: [acct, money('Total', 'total')] }, Rows: { Row: [
    { type: 'Section', group: 'Income', Header: { ColData: cd('Income', '') }, Rows: { Row: [] }, Summary: { ColData: cd('Total Income', fmt(b.income)) } },
    { type: 'Section', group: 'COGS', Rows: { Row: [] }, Summary: { ColData: cd('Total Cost of Goods Sold', fmt(b.cogs)) } } ] } });
  const bs = (e, b) => ({ Header: hdr('BalanceSheet', { EndPeriod: e }), Columns: { Column: [acct, money('Total', 'total')] }, Rows: { Row: [
    { type: 'Section', group: 'BankAccounts', Header: { ColData: cd('Bank Accounts', '') }, Rows: { Row: [] }, Summary: { ColData: cd('Total Bank Accounts', fmt(b.bank)) } } ] } });
  const aged = (name, e, total, current) => ({ Header: hdr(name, { EndPeriod: e }), Columns: { Column: [acct, money('Current', 'current'), money('Total', 'total')] }, Rows: { Row: [
    { type: 'Data', ColData: cd('Some Customer', '1.00', '1.00') },
    { type: 'Section', group: 'GrandTotal', Summary: { ColData: cd('TOTAL', fmt(current), fmt(total)) } } ] } });

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : (input && input.url) || String(input));
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const host = url.hostname;
    if (!host.endsWith('intuit.com')) return realFetch(input, init);
    log({ method, host, path: url.pathname });
    if (host === 'oauth.platform.intuit.com') {
      // Token endpoint (authorization-code exchange / refresh): a fresh grant; the code and secrets are never inspected or stored.
      return json(200, { access_token: 'fake-access-' + Math.random().toString(36).slice(2), refresh_token: 'fake-refresh-' + Math.random().toString(36).slice(2), token_type: 'bearer', expires_in: 3600, x_refresh_token_expires_in: 8726400 });
    }
    if (host === 'developer.api.intuit.com') return json(200, {}); // revoke
    if (host === 'quickbooks.api.intuit.com' || host === 'sandbox-quickbooks.api.intuit.com') {
      if (method !== 'GET') return json(405, { fault: 'read-only fake' });
      const m = url.pathname.match(/^\/v3\/company\/(\d+)\/(.+)$/);
      if (!m) return json(404, {});
      const seg = m[2];
      if (seg.startsWith('companyinfo/')) return json(200, { CompanyInfo: { CompanyName: 'Fake Acceptance Bakery (simulated)' } });
      const rep = seg.match(/^reports\/(\w+)$/);
      if (rep) {
        const p = url.searchParams; const end = p.get('end_date') || p.get('report_date') || '1970-01-31'; const b = booksFor(end);
        if (rep[1] === 'ProfitAndLoss') return json(200, pl(p.get('start_date') || end, end, b));
        if (rep[1] === 'BalanceSheet') return json(200, bs(end, b));
        if (rep[1] === 'AgedReceivables') return json(200, aged('AgedReceivables', end, b.arTotal, b.arCurrent));
        if (rep[1] === 'AgedPayables') return json(200, aged('AgedPayables', end, b.apTotal, b.apCurrent));
      }
      return json(404, {});
    }
    return json(503, { fault: 'fake intuit: host not simulated' }); // any other intuit.com host fails closed
  };
  process.stderr.write('[fake-intuit] ACTIVE (local acceptance harness; not real Intuit)\n');
}
