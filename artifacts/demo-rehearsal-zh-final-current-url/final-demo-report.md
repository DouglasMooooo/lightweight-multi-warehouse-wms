# WMS 最终中文 Stakeholder Demo 验证报告

## Final Status

**READY WITH LIMITATIONS**

- 当前 URL：<https://syd-wms-preview-ddmdmcgc3-douglas-mos-projects.vercel.app/>
- 验证时间：2026-08-01（Australia/Sydney）
- 仓库范围：`SYD · Sydney Service Warehouse`
- 语言：简体中文
- 定位：内部 Preview / 非生产环境
- 结论：可用于 8–10 分钟 Director / Stakeholder Demo；不可表述为 Production Ready。

## 页面逐项检查结果

| 页面 | 结果 | 验证证据 |
|---|---|---|
| Dashboard / 仓库概览 | PASS | 显示“可出库良品库存”；帮助文字为“新品 + 维修良品 − 已冻结”；当前 SYD 异常为 0 |
| Outbound / 出库管理 | PASS | 待备货工单正常加载；状态、库存属性和下一步均为中文 |
| Outbound SN Review | PASS | 支持扫描、粘贴、CSV/XLSX、未知 SN 查询、重新校验；页面说明最终确认前不修改库存 |
| Batch Label Selection | PASS | 可一次选择 11 个待提货订单；11 个提货码、11 页标签、总数量 18 |
| Batch Label Preview | PASS | 预览正常；明确说明打印/导出标签不会修改库存 |
| Bulk SN Faulty Receiving | PASS | 只读验证两个相同未知 Demo SN：一个为“未知 SN”，一个为“批次内重复”；未猜测 SH、SKU 或型号 |
| Transfer / 仓库调拨 | PASS | `DEMO-TRANSFER-001`：SYD → MEL；4 个专用 SN 全部有效，分为两个 Product，Condition 为新品 |
| Product Inventory Report | PASS | 显示“物理可用库存”；帮助文字为“产品实物库存 − 已冻结” |
| Operations Report | PASS | 历史库存明确显示“历史基线不足”；面积 KPI 明确显示“仓库面积未配置” |
| Warehouse Map Level 1 | PASS | 显示“全部库存范围 · 产品 + 物料”；R1/R2/FLEX/REPAIR/RETURN/DISPATCH 空间视图正常 |
| Warehouse Map Location Detail | PASS | R1 货架立面和 `R1-4-1-L` 抽屉正常，显示 Physical/Frozen/Available、SKU、Condition 和最近移动 |
| ERP Mapping / Boundary | PASS | 显示 `MockERPAdapter`；失败同步任务为 0；未声称真实 Kingdee 已连接 |

## 口径确认

- Dashboard “可出库良品库存”用于出库决策：`New + Repair_Good - Frozen`。
- Product Inventory Report “物理可用库存”用于产品实物口径：`Product Physical - Frozen`。
- Warehouse Map 默认包含 Product + Material，因此不能直接与 Product-only 报表总数比较。
- Prepared 增加 Frozen，不减少 Physical；只有最终 Dispatch 才减少 Physical。
- 历史基线或仓库面积缺失时，不展示无法审计的猜测 KPI。

## Raw Translation Key 与控制台

- 发现 `status.*`、`validation.*` 等 raw translation key：**否**。
- 发现明显未翻译的操作员字段：**否**。
- 浏览器控制台 warning/error：**无**。
- `ERP`、`WMS`、`SN`、`SKU`、`SH`、仓库代码、SKU/Model 和 Adapter 类名为允许保留的领域代码/主数据。

## 数据安全记录

- 本轮是否 reset / reseed Preview database：**否**。
- 是否新建数据库：**否**。
- 是否确认真实出库、坏机接收或新机入库：**否**。
- 是否执行库存调整、Move、Transfer Out 或 Transfer Receipt：**否**。
- 是否接入真实 Kingdee 凭据：**否**。
- 是否修改真实有价值库存：**否**。
- Batch Label 仅选择和预览，没有库存副作用。
- Faulty Receiving 仅对 `DEMO-UNKNOWN-FAULTY-001` 做验证；确认按钮保持未执行。
- Transfer 仅创建浏览器内临时审核状态并重新校验；未点击“确认调拨出库”。

## DEMO-TRANSFER-001 当前状态

- Reference / Transfer ID 展示值：`DEMO-TRANSFER-001`
- 路线：SYD → MEL
- Condition：New / 新品
- 专用 SN：
  - `DEMO-TRANSFER-A-001`
  - `DEMO-TRANSFER-A-002`
  - `DEMO-TRANSFER-B-001`
  - `DEMO-TRANSFER-B-002`
- 校验结果：4 有效、0 需处理、0 未识别、0 已排除。
- Product 分组：`DEMO-SKU-TRANSFER-A` × 2、`DEMO-SKU-TRANSFER-B` × 2。
- 持久化状态：**未确认调拨出库；未创建 In Transit 实物事实；未执行 MEL 收货。**
- 现场若要确认，必须单独说明这是专用 Demo 库存的一次性演示，并继续使用同一 Transfer ID 展示 In Transit / Pending Receipt / Receipt 生命周期。

## 截图文件

1. `01-dashboard.png`
2. `02-outbound.png`
3. `03-sn-review.png`
4. `04-batch-label-selection.png`
5. `05-batch-label-preview.png`
6. `06-faulty-review.png`
7. `07-transfer.png`
8. `08-inventory-report.png`
9. `09-operations-report.png`
10. `10-warehouse-map.png`
11. `11-location-detail.png`
12. `12-erp-boundary.png`

## 仍需现场说明的限制

- 当前 ERP 为 `MockERPAdapter`，不是真实 Kingdee 集成。
- ERP 写回失败的目标行为是进入 retry/manual review；已确认的物理事实不会静默回滚。
- 当前 Preview 不代表完整生产权限体系。
- 尚未验证生产备份、恢复、监控和告警流程。
- 历史期初 Ledger 基线不足，因此部分历史库存 KPI 不可用。
- 仓库面积未配置，因此面积效率和密度 KPI 不可用。
- 历史 SN 覆盖缺口属于 Legacy Traceability Gap，不应解释为当前库存丢失。

## 8–10 分钟中文最终 Demo 脚本

### 0:00–0:50 — Dashboard

> 这是仓库主管的实时工作台。ERP 订单进入 WMS 后先成为待备货，实物准备并冻结后成为待提货。这里的“可出库良品库存”只计算新品和维修良品，再减去冻结库存；当前异常数字也只属于所选的 SYD 仓库。

指向：待备货 1、待提货 11、维修队列 2、调拨途中 0、异常 0，以及“新品 + 维修良品 − 已冻结”。

### 0:50–2:00 — Outbound 与 SN Review

> Prepared 不会减少 Physical，而是增加 Frozen。设备仍在仓库，但不能再分配给其他订单。扫描、粘贴或上传的 SN 先进入临时审核批次，操作员可以处理未知、重复或错误设备；只有最终确认才改变正式库存。

打开 `SH-2607-00176177`，展示扫描、批量粘贴、CSV/XLSX、重新校验；不点击确认备货或确认出库。

### 2:00–2:45 — Batch Labels

> 11 个待提货订单可以一次选择、一次预览，生成 11 页标签，总数量 18。标签和提货码是操作辅助信息，打印或导出不会修改库存。

展示选择汇总和标签预览，不执行打印。

### 2:45–3:40 — Faulty Receiving

> 坏机收货先校验再确认。系统会回查原 SH、SKU、型号和维修库位；未知 SN 和批次内重复进入异常，不会猜测业务数据。当前示例使用专用未知 Demo SN，只展示验证结果，不执行接收。

指向“未知 SN”和“批次内重复”，说明确认数仍为 0。

### 3:40–4:45 — Transfer

> 同仓 Move 与跨仓 Transfer 是不同业务。这里使用 `DEMO-TRANSFER-001` 一次采集四个专用 SN，系统自动校验并按 Product 和 Condition 分组。确认后同一个 Transfer ID 会贯穿 In Transit、Pending Receipt 和目的仓收货，不需要重新建立第二份调拨数据。

强调 4/4 有效、SYD → MEL。现场默认停在确认前；若经批准确认，只能使用这四个 Demo SN。

### 4:45–5:50 — Product Inventory Report

> 这里的“物理可用库存”是产品实物库存减冻结库存，和 Dashboard 的“可出库良品库存”不是同一个口径。报表同时显示 Physical、Frozen、In Transit、New、Repair Good、Repair、库位数和 SN 覆盖。

指出两个 Demo Product 各有 2 个已知 SN。

### 5:50–6:45 — Operations Report

> 报表只展示可解释、可审计的 KPI。当前历史期初 Ledger 基线不足，所以系统明确显示历史期末库存不可用；仓库面积没有配置，所以面积效率和密度也明确不可用，而不是生成一个看起来完整但无法解释的数字。

### 6:45–8:00 — Warehouse Map

> Warehouse Map 是全部库存范围，包含产品和物料，所以总数不能直接与 Product-only 报表比较。第一层是仓库区域，第二层是货架立面，第三层是库位详情。搜索 SN、SKU、型号、库位或容器时，系统在空间中定位，而不是把地图替换成普通列表。

进入 R1，再打开 `R1-4-1-L`，展示 Physical 100、Frozen 0、Available 100、物料 SKU 和最近移动记录。

### 8:00–9:00 — ERP Boundary 与结束

> 当前明确使用 `MockERPAdapter` 验证 ERP/WMS 边界，并没有接入真实 Kingdee。正式流程中，WMS 先记录已发生的物理事实和不可变 Ledger；如果 ERP 写回失败，任务进入 Retry 或 Manual Review，不会静默撤销仓库已经完成的动作。

> 因此当前结论是 Ready with Limitations：适合 Director Demo 和 IT Review，但在真实 Kingdee、生产权限、备份恢复和监控完成前，不能称为 Production Ready。
