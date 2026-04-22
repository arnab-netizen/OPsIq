import { PrismaPg } from "@prisma/adapter-pg";
import * as PrismaPostgres from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function createPrismaClient(): any {
  const { PrismaClient } = PrismaPostgres as any;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter }) as any;
}

// Lazy initialization - don't create until first use
let _db: any;

export function getDb() {
  if (!_db) {
    _db = globalForPrisma.prisma || createPrismaClient();
    globalForPrisma.prisma = _db;
  }
  return _db;
}

// For backward compatibility, use a Proxy
export const db = new Proxy({} as any, {
  get(_, prop) {
    return getDb()[prop as string];
  },
});
