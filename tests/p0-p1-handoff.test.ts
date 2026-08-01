import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reconstructClosingPhysicalByCondition } from "@/domain/reporting";
import { translate, translateAuditOperation, translateRole } from "@/i18n/config";

describe("P0 historical inventory reporting", () => {
  it("reconstructs closing condition balances from post-period ledger deltas", () => {
    expect(reconstructClosingPhysicalByCondition(
      { New: 10, Repair_Good: 5, Repair: 2, Scrap: 0, Material: 20 },
      [
        {
          transactionType: "Inbound",
          condition: "New",
          quantity: 3,
          physicalDelta: 3,
        },
        {
          transactionType: "Outbound",
          condition: "Material",
          quantity: 4,
          physicalDelta: -4,
        },
      ],
    )).toEqual({ New: 7, Repair_Good: 5, Repair: 2, Scrap: 0, Material: 24 });
  });

  it("reverses a Repair to Repair_Good condition transition", () => {
    expect(reconstructClosingPhysicalByCondition(
      { New: 0, Repair_Good: 6, Repair: 1 },
      [{
        transactionType: "Repair_Completed",
        condition: "Repair_Good",
        sourceCondition: "Repair",
        targetCondition: "Repair_Good",
        quantity: 1,
        physicalDelta: 0,
      }],
    )).toEqual({ New: 0, Repair_Good: 5, Repair: 2 });
  });
});

describe("P0/P1 schema and presentation controls", () => {
  it("adds an explicit nullable warehouse scope to operational exceptions", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "prisma/migrations/20260801000000_exception_warehouse_scope/migration.sql"),
      "utf8",
    );
    expect(migration).toContain('ADD COLUMN "warehouseId"');
    expect(migration).toContain('FOREIGN KEY ("warehouseId")');
    expect(migration).not.toContain("DELETE FROM");
  });

  it("provides explicit Simplified Chinese labels and unavailable reasons", () => {
    expect(translate("zh-CN", "dashboard.availableUnits")).toBe("可出库良品库存");
    expect(translate("zh-CN", "dashboard.availableUnitsHelp")).toBe("新品 + 维修良品 − 已冻结");
    expect(translate("zh-CN", "report.summary.available")).toBe("物理可用库存");
    expect(translate("zh-CN", "report.summary.availableHelp")).toBe("产品实物库存 − 已冻结");
    expect(translate("zh-CN", "status.Not registered")).toBe("未登记");
    expect(translate("zh-CN", "status.Unmapped")).toBe("未映射");
    expect(translate("zh-CN", "report.historyBaselineInsufficientShort")).toContain("历史基线不足");
    expect(translate("zh-CN", "report.areaMetricUnavailable")).toContain("仓库面积未配置");
    expect(translateAuditOperation("zh-CN", "Transfer Out")).toBe("调拨出库");
    expect(translateAuditOperation("zh-CN", "Migrated demo transfer SN prefix")).toBe("迁移演示调拨 SN 前缀");
    expect(translateRole("zh-CN", "Warehouse_Supervisor")).toBe("仓库主管");
  });

  it("keeps the transfer fixture explicit, non-production and non-destructive", () => {
    const fixture = fs.readFileSync(
      path.join(process.cwd(), "scripts/ensure-demo-transfer-fixture.ts"),
      "utf8",
    );
    expect(fixture).toContain('ALLOW_DEMO_FIXTURE !== "true"');
    expect(fixture).toContain('DATABASE_ENV === "production"');
    expect(fixture).toContain("DEMO-TRANSFER-001");
    expect(fixture).toContain("DEMO-TRANSFER-A-001");
    expect(fixture).toContain("Net Physical Qty is unchanged");
    expect(fixture).not.toContain("deleteMany");
    expect(fixture).not.toContain("seedDemo");
  });
});
