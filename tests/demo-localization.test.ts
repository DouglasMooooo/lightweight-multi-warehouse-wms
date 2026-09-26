import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/demo-zh";
import {
  auditSample,
  createDemoSession,
  executeDemoCommand,
} from "@/domain/leadership-demo";

describe("Chinese demo presentation", () => {
  it("preserves business identifiers and numeric quantities", () => {
    for (const value of [
      "EQ48S260700001",
      "SH-2607-00175008",
      "FLEX-01",
      "97-223-00107-00",
      0,
      2,
      undefined,
    ])
      expect(zh(value)).toBe(value);
    const session = createDemoSession();
    expect(zh(session)).toBe(session);
    expect(session.stock.outboundOrders[0].status).toBe("Ready");
  });
  it("distinguishes status and location labels without changing domain codes", () => {
    expect(zh("Repair")).toBe("维修");
    expect(zh("REPAIR")).toBe("维修区");
    expect(zh("Repair_Good")).toBe("维修良品");
    expect(zh("Repair Good")).toBe("维修良品");
    expect(zh("Unlinked SN Record")).toBe("SN 关联记录不完整");
  });
  it("translates all deterministic sample findings including interpolated counts", () => {
    for (const issue of auditSample()) {
      for (const value of [
        issue.code,
        issue.reason,
        issue.investigation,
        issue.severity,
        issue.status,
      ])
        expect(zh(value), value).toMatch(/[\u4e00-\u9fff]/);
    }
    expect(zh("Physical 8; physically present SNs 2.")).toBe(
      "实物数量 8；在库 SN 数量 2。",
    );
  });
  it("translates domain rejection messages at presentation boundary", () => {
    try {
      executeDemoCommand(createDemoSession(), {
        type: "location",
        value: "WRONG",
      });
    } catch (error) {
      expect(zh((error as Error).message)).toBe(
        "库位不正确，请前往 FLEX-01 并扫描库位码。",
      );
    }
    expect(
      zh("Repair cannot complete from Pending_Repair. Start Repair first."),
    ).toContain("请先开始维修");
    expect(zh("FLEX-01 · frozen reservation; physically present")).toBe(
      "FLEX-01 · 已冻结预留，实物仍在库",
    );
  });
});
