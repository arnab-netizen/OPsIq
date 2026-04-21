import { PrismaPg } from "@prisma/adapter-pg";
import * as PrismaPostgres from "../generated/prisma/client";
import { mockDb } from "./db.mock";

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function createPrismaClient(): any {
  if (process.env.NODE_ENV === "test") {
    return mockDb;
  }
  const { PrismaClient } = PrismaPostgres as any;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter }) as any;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
