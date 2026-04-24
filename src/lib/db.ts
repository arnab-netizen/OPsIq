const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
  prismaPromise: Promise<any> | undefined;
};

async function createPrismaClient() {
  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const client = new PrismaClient();

    // Extend client to auto-parse audit event payloads
    return client.$extends({
      result: {
        auditEvent: {
          payload: {
            needs: { payload: true },
            compute(event: { payload: string | null }) {
              if (!event.payload) return null;
              if (typeof event.payload === "string") {
                try {
                  return JSON.parse(event.payload);
                } catch {
                  return null;
                }
              }
              return event.payload;
            },
          },
        },
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to initialize Prisma client: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function getDb() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  if (globalForPrisma.prismaPromise) {
    return globalForPrisma.prismaPromise;
  }

  globalForPrisma.prismaPromise = createPrismaClient();
  globalForPrisma.prisma = await globalForPrisma.prismaPromise;
  return globalForPrisma.prisma;
}

export const db = await getDb();
