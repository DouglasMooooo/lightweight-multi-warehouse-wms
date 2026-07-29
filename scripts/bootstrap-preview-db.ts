import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { seedDemo } from "../prisma/demo-seed";

const appEnvironment = process.env.APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV;
const databaseEnvironment = process.env.DATABASE_ENV;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL is required for Vercel database bootstrap.");
if (appEnvironment === "production") {
  console.log("Skipping Preview seed in production.");
  process.exit(0);
}
if (!["preview", "staging", "development", "test"].includes(appEnvironment ?? "")) {
  throw new Error(`Preview seed rejected for unknown APP_ENV=${appEnvironment ?? "undefined"}.`);
}
if (databaseEnvironment === "production") {
  throw new Error("Preview seed cannot run against DATABASE_ENV=production.");
}
if (process.env.DEMO_MODE !== "true") {
  console.log("Skipping Preview seed because DEMO_MODE is not enabled.");
  process.exit(0);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const counts = await Promise.all([
    prisma.warehouse.count(),
    prisma.role.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.location.count(),
    prisma.inventoryBalance.count(),
    prisma.serialNumber.count(),
    prisma.stockTransaction.count(),
  ]);
  if (counts.some((count) => count > 0)) {
    console.log("Skipping Preview seed because the database already contains WMS data.");
  } else {
    await seedDemo(prisma);
    console.log("Seeded the empty non-production WMS Preview database.");
  }
} finally {
  await prisma.$disconnect();
}
