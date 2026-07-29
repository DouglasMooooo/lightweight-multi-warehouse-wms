import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";
import { assertSafeEnvironment } from "@/lib/environment";

const globalForPrisma = globalThis as unknown as {
  wmsPrisma?: PrismaClient;
  wmsPgPool?: Pool;
};

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
  const pool =
    globalForPrisma.wmsPgPool ??
    new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 5 : 10)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  globalForPrisma.wmsPgPool = pool;
  globalForPrisma.wmsPrisma = client;
  return client;
}
