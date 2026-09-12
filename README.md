# OpsIQ

A governed business-diagnosis tool: feed in your Money, Sales, and Operations numbers and get a prioritized, evidence-backed read on what's actually wrong and what to do about it.

**[Live beta: o-ps-iq.vercel.app](https://o-ps-iq.vercel.app)**

## What OpsIQ does

Most owners and operators don't lack advice — they lack a clear, honest read on where the pressure actually is and what to do next. OpsIQ turns the numbers you already track into a structured diagnosis:

- **Diagnose** — run a structured diagnosis on Money, Sales, or Operations from your own data.
- **Prioritize** — findings are ordered by severity and urgency, not just listed.
- **Act** — every finding comes with a recommended action: who owns it, and a timeframe.
- **Verify** — record the real outcome of an action afterward, tracked separately from the original recommendation.

OpsIQ recommends; it never runs, sends, or changes anything in your business on its own.

## Current controlled-beta capabilities

**Available today:** Start Here onboarding, Home dashboard, Money / Sales / Operations diagnosis, Priorities, Actions, Evidence & Trust, Customer records, and user accounts.

**Preview** (reachable, real functionality, not yet part of the core workflow): Recovery, Strategy, Marketing & Campaigns, Compliance, Procurement, and Starting Up.

**Coming soon** (not yet built): AI Copilot, third-party Integrations.

## How it works

```
data → diagnosis → priority → action → verification
```

You bring your business numbers; OpsIQ runs a deterministic diagnosis engine (with an optional LLM-assisted layer) to surface findings, rank them, and attach a recommended owner action to each one. Nothing is executed automatically — every action stays owner-approved and owner-executed, and outcomes are captured and fed back into future diagnoses.

## Tech stack

- [Next.js](https://nextjs.org/) 16 (App Router) + [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/), strict mode
- [Prisma](https://www.prisma.io/) 7 + PostgreSQL ([Neon](https://neon.tech/) in production)
- [Zod](https://zod.dev/) for schema validation
- [Vitest](https://vitest.dev/) for testing, [Playwright](https://playwright.dev/) for browser/e2e
- Deployed on [Vercel](https://vercel.com/)

## Local development

Requires Node 20 (see `.nvmrc`) and a local or hosted PostgreSQL instance.

```bash
npm install
cp .env.example .env
# edit .env — at minimum, set DATABASE_URL
npm run db:migrate:deploy
npm run db:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See [`.env.example`](.env.example) for the full, documented list. Only `DATABASE_URL`, `NODE_ENV`, and `NEXT_PUBLIC_APP_URL` are required to boot and serve the core customer journey (signup, login, diagnosis) — everything else (Stripe billing, AI providers, external connectors, observability) is optional and fails closed (disabled, not broken) when unset.

Never commit real credentials. `.env.example` and `.env.staging.example` should only ever contain placeholder values.

## Database setup

```bash
npm run db:migrate:deploy   # apply pending migrations
npm run db:generate         # generate the Prisma client
npm run db:studio           # browse the DB with Prisma Studio
```

## Running tests

```bash
npm test              # fast suite, no DB required
TEST_WITH_DB=true npm run test:all   # full suite including DB-backed tests
```

Tests that need a real database only run when `TEST_WITH_DB=true` is set; the default `npm test` run does not require `DATABASE_URL`.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability. Please do not open a public issue for security reports.

## Contributing

This repository is public so the code is inspectable, but it is not currently accepting external code contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for details, and feel free to open issues for bugs or questions.

## License

No license has been assigned yet. In the absence of a `LICENSE` file, standard copyright applies: all rights are reserved by the project owner, and no permission is granted to copy, modify, or redistribute this code. This repository is public for transparency and inspection, not as an open-source release. A licensing decision for public release is pending.
