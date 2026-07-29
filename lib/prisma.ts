import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assertSafeEnvironment } from "@/lib/environment";

const globalForPrisma = globalThis as unknown as { wmsPrisma?: PrismaClient };

export function getPrisma() {
  assertSafeEnvironment({
    appEnv: process.env.APP_ENV,
    databaseEnv: process.env.DATABASE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  });
  if (globalForPrisma.wmsPrisma) return globalForPrisma.wmsPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.wmsPrisma = client;
  return client;
}
