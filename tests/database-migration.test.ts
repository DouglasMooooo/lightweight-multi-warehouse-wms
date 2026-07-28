import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PostgreSQL integrity migrations", () => {
  const initial = fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20260727000000_init/migration.sql"),
    "utf8",
  );
  const sprint = fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20260728000000_sprint1_integrity/migration.sql"),
    "utf8",
  );

  it("normalizes nullable relational dimensions in the logical balance key", () => {
    expect(initial).toContain('CREATE UNIQUE INDEX "InventoryBalance_relational_grain_key"');
    expect(initial).toContain('COALESCE("containerId", \'\')');
    expect(initial).toContain('COALESCE("productId", \'\')');
  });

  it("enforces one active repair return and one active outbound serial allocation", () => {
    expect(sprint).toContain('CREATE UNIQUE INDEX "RepairReturn_active_serial_key"');
    expect(sprint).toContain('WHERE "active" = true');
    expect(sprint).toContain('CREATE UNIQUE INDEX "OutboundAllocation_active_serial_key"');
  });
});
