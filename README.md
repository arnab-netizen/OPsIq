# OpsIQ

OpsIQ is a governed business intervention and consulting operating system. It models consulting lifecycle, business condition, intervention mode/phase, and human execution reality.

## Prerequisites

- Node.js v22.22.2 or later (LTS recommended)
- PostgreSQL 13+ (local or Neon)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your database connection:

```bash
cp .env.example .env
```

Edit `.env` and set your PostgreSQL connection string:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/opsiq_dev?schema=public"
```

For Neon PostgreSQL, use:
```env
DATABASE_URL="postgresql://neondb_owner:password@host-pooler.c-5.us-east-1.aws.neon.tech/opsiq?sslmode=require&channel_binding=require"
```

### 3. Run Database Migrations

Apply all pending migrations to your database:

```bash
npm run db:migrate:deploy
```

This creates all required tables including:
- User management (User, EngagementMembership, Role)
- Engagement & Client management
- Evidence & Findings vault
- Shock events & Interventions
- Audit logs and idempotency records

### 4. Verify Setup

Generate the Prisma client and build the project:

```bash
npm run db:generate
npm run build
```

## Running the Application

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Production Build

```bash
npm run build
npm start
```

## Testing

Run the full test suite:

```bash
npm test
```

Tests require `DATABASE_URL` or `TEST_DATABASE_URL` environment variable. Tests will:
1. Check database connectivity
2. Run all pending migrations
3. Execute service and integration tests
4. Validate business logic and constraints

Run tests in watch mode:

```bash
npm run test:watch
```

## Database Management

### View Database Schema

```bash
npm run db:studio
```

Opens Prisma Studio at [http://localhost:5555](http://localhost:5555) to browse and edit database records.

### Create New Migration

After schema changes in `prisma/schema.prisma`:

```bash
npm run db:migrate:dev
```

Name the migration descriptively (e.g., `add_user_roles`).

### Reset Database (Development Only)

⚠️ **Warning**: This deletes all data.

```bash
npm run db:reset
```

## Architecture

- **Frontend**: Next.js 16 App Router with React 19
- **Database**: PostgreSQL with Prisma v7 ORM
- **Type Safety**: TypeScript with strict mode
- **Validation**: Zod schema validation
- **Testing**: Vitest with jsdom

## Key Services

- **Evidence Vault**: Manage investigation evidence and findings
- **Shock Events**: Track and respond to critical incidents
- **Business Conditions**: Monitor engagement health metrics
- **Interventions**: Model consulting deliverables and phases
- **Audit Logging**: Track all meaningful mutations with full context

## Common Issues

### `DATABASE_URL not set`

Set the environment variable before running commands:

```bash
export DATABASE_URL="postgresql://..."
npm test
```

### Migration Fails on Existing Tables

If migrations fail because tables exist, ensure `prisma.config.ts` is configured correctly:

```bash
npx prisma validate
```

### Port 5432 Connection Timeout

- Verify PostgreSQL is running and accepting connections
- Check firewall rules allow port 5432 (or your custom port)
- For Neon, ensure compute is not paused
- Test with `nc -vz <host> 5432`

## Learn More

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## License

Private - OpsIQ Proprietary
