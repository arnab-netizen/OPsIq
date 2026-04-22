import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaSqlite } from "prisma-adapter-sqlite";
import * as PrismaPostgres from "../generated/prisma/client";
import * as PrismaSQLite from "../generated/prisma-sqlite/client";

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function createPrismaClient(): any {
  if (process.env.NODE_ENV === "test") {
    const { PrismaClient } = PrismaSQLite as any;
    const dbUrl = process.env.DATABASE_URL || "file:./prisma/test.db";
    const adapter = new PrismaSqlite({ url: dbUrl });
    return new PrismaClient({ adapter }) as any;
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
