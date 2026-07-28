import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { wmsPrisma?: PrismaClient };

export function getPrisma() {
  if (globalForPrisma.wmsPrisma) return globalForPrisma.wmsPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.wmsPrisma = client;
  return client;
}
