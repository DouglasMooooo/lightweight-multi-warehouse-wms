# WMS 中文 Stakeholder Demo — Presenter Guide V2

> 演示定位：Working Prototype + Target-State Validation + ICT Business Process Optimisation Showcase  
> 建议时长：8–10 分钟  
> 演示环境：[SYD WMS Preview](https://syd-wms-preview-ddmdmcgc3-douglas-mos-projects.vercel.app/)
> 演示结论：**READY WITH LIMITATIONS**  
> 重要说明：这是仓库运营流程原型，不是已完成的生产 ERP 替代系统。

---

## 1. 演示前 2 分钟检查

- [ ] 打开 Preview，语言切换为 **简体中文**。
- [ ] 仓库选择 **Sydney Service Warehouse / SYD**。
- [ ] 浏览器缩放保持 100%，窗口宽度足够显示表格。
- [ ] 依次预打开以下页面，减少现场等待：
  1. Dashboard
  2. Outbound
  3. Batch Labels
  4. Faulty Receiving
  5. Transfers
  6. New Inbound
  7. Product Inventory Report
  8. Operations Report
  9. Warehouse Map
  10. ERP Mapping
- [ ] 不点击任何最终确认按钮：确认出库、确认收货、创建/发出/接收调拨、库存调整。
- [ ] Transfer 环节若没有批准的专用演示数据，只讲目标流程，不创建真实记录。
- [ ] ERP 页面只能说明 Adapter 边界，不能声称 Kingdee 已连接。

### 推荐演示路线

```text
/dashboard
  → /outbound
  → Outbound SN Review
  → Batch Label Preview
  → /bulk-sn?mode=FAULTY_RECEIVING
  → /transfers
  → /bulk-sn?mode=NEW_INBOUND
  → /reports/inventory
  → /reports/operations
  → /warehouse-map
  → /admin/erp-mapping
```

---

## 2. 现场核心信息

演示过程中始终围绕四个业务价值：

1. **库存正确性**：Physical、Frozen、Available 分开管理。
2. **异常先于确认**：扫码和上传先进入 Review Batch，确认后才影响正式库存。
3. **减少重复操作**：批量标签、批量 SN、Transfer 一次采集复用。
4. **可审计、可追溯**：库存变化进入不可变 Ledger；ERP 失败不会静默撤销已确认的物理操作。

不要把重点放在“页面很多”或“UI 很漂亮”。应强调系统如何降低重复扫描、手工判断和 Excel 状态维护。

---

## 3. 9 分钟完整演示脚本

## 0:00–0:50 — Dashboard：从工作队列开始

**页面**：Dashboard  
**点击动作**：确认语言和仓库；依次指向待备货、待提货、维修、调拨、异常、可用库存。

**屏幕应显示**：

- 待备货：1
- 待提货：11
- 维修队列：2
- 调拨途中：0
- 异常处理：0
- 可出库良品库存：295
- 帮助文字：新品 + 维修良品 − 已冻结

**我说：**

> 这是仓库主管的操作工作台，不是一个装饰性的管理 Dashboard。ERP 订单进入 WMS 后，首先进入待备货；仓库完成实物准备和冻结以后，订单进入待提货。主管可以直接看到今天真正需要处理的工作，而不是在共享 Excel 里筛选不同状态的行。

**业务价值**：把工作按真实业务状态排队，减少口头询问和人工筛选。  
**旧流程对比**：Excel 依赖文字状态、颜色和人员经验判断下一步。  
**下一页过渡**：

> 我们先从一张待备货订单进入出库流程。

---

## 0:50–2:00 — Outbound：Prepared、Frozen 与 SN Review

**页面**：Outbound  
**点击动作**：

1. 查看待备货订单 `SH-2607-00176177`。
2. 再进入已有 Awaiting Pickup 订单 `SH-2607-00175722` 的 SN Review。
3. 指向扫码、批量粘贴、CSV/XLSX、未解析 SN 查询、删除、替换和重新校验功能。

**我说：**

> ERP 订单进入 WMS 时是待备货。Prepared 不会减少 Physical Qty，而是增加 Frozen Qty。设备仍然在仓库，但已经分配给这张订单，不能再分配给其他订单。
>
> 扫描、粘贴或上传 SN 后，系统先建立临时 Review Batch。操作员可以删除错误行、查询未知 SN、替换错误设备并重新校验。只有最终确认出库时，系统才产生正式库存交易。

**业务价值**：把输入错误和正式库存变更隔离。  
**旧流程对比**：Excel 容易把扫描结果、状态修改和库存变化混在同一步骤里。  
**不要做**：不要点击最终确认出库或确认备货。  
**下一页过渡**：

> 订单完成备货后，我们需要一次性生成提货标签。

---

## 2:00–2:50 — Batch Labels：11 张订单一次处理

**页面**：Outbound → Batch Labels  
**点击动作**：选择符合条件的 Awaiting Pickup 订单，进入预览；不要执行打印。

**屏幕应显示**：

- 11 张订单
- 11 个 Pickup Code
- 11 页标签
- 18 个单位

**我说：**

> 这里把 11 张订单整合成一次批量选择和一次标签生成。标签和 Pickup Code 都是操作辅助信息，不会修改实物库存。以前仓库通常需要逐张打开订单和打印；现在可以在一个批次中统一检查、预览和打印。

**业务价值**：减少重复页面操作、漏打和错打标签。  
**旧流程对比**：约 11 次独立标签操作压缩成一次批处理。  
**注意**：若看到 `Unmapped`，说明两张订单尚未完成 ERP 仓库映射，不要解释为库存异常。  
**下一页过渡**：

> 接下来展示一个更容易出现异常的场景：故障机收货。

---

## 2:50–3:50 — Faulty Receiving：先校验，后确认

**页面**：Bulk SN → Faulty Receiving  
**点击动作**：展示已经完成的只读校验结果，不点击“确认 1”。

演练数据：

- 已登记 SN：`60E5M4805C3F242`
- 同批次重复的同一 SN
- 未知测试值：`DEMO-UNKNOWN-NONDESTRUCTIVE`

**屏幕应显示**：

- 提交：3
- 有效：1
- 需处理：2
- 有效项关联原订单 `SH-2607-00165610`
- SKU `97-223-00107-00`
- Model `EQ4800-S`
- Condition `Repair / 维修品`
- Location `REPAIR-01`
- 两个异常分别为批次内重复和未知 SN

**我说：**

> 故障机收货允许仓库先扫描，再由系统解析原始订单、SKU、型号和维修库位。批次内重复会被拦截，未知 SN 会进入待处理，而不是由系统猜测 SKU 或库位。
>
> 即使 ERP 暂时缺少部分资料，WMS 仍然保留故障机的接收和追踪证据，但不会凭空补全业务数据。

**业务价值**：保留可追溯性，阻止重复收货和错误绑定。  
**旧流程对比**：Excel 中未知 SN 往往需要人工搜索并复制资料。  
**现场提示**：若显示 `status.Not registered`，这是当前中文翻译缺口，不是校验引擎失效。  
**下一页过渡**：

> 同仓移动和跨仓调拨在业务上必须是两种不同操作。

---

## 3:50–4:40 — Transfer：取消第二遍重复扫描

**页面**：Transfers  
**点击动作**：打开 `DEMO-TRANSFER-001`，选择 New，粘贴四个
`DEMO-TRANSFER-*` 专用 SN 并重新校验；默认不点击确认调拨出库。

**我说：**

> 普通 Move 只用于同一个仓库内部，并且必须是一笔原子的来源减少和目标增加。跨仓库移动必须使用 Transfer。
>
> 目标流程是在出发仓首次采集设备后形成一个 Transfer ID。运输中状态和目的仓待收货继续使用同一批数据，不要求仓库为了生成同一份清单再完整扫描一次。

**关键句：**

> 提高效率不是让第二次扫描更快，而是取消第二次重复扫描。

**业务价值**：100 台设备的调拨，从约 200 次扫描降到不超过 100 次初始采集。  
**演示状态**：4 个专用 SN 应显示 4 有效、0 需处理、0 未解析，并按两个
Product 分组。现场若要确认必须单独说明，并只使用该专用 Demo 库存。
**下一页过渡**：

> 调拨解决仓库之间的移动，新采购收货则从 Expected Data 开始。

---

## 4:40–5:25 — New Inbound：从完整录入转向异常处理

**页面**：Bulk SN → New Inbound  
**点击动作**：指向 Warehouse、Location、SKU、Expected Qty、Reference，以及扫码、粘贴和文件上传入口。

**我说：**

> 当前原型可以针对一个 SKU 批次验证 Expected Qty 和实际扫描数量，并要求明确库位和参考单据。
>
> 目标状态是 ERP 或 Supply Chain 的预期数据自动生成 Receiving Batch，仓库只处理数量差异、未知 SN 和错误 SKU。这个自动预期数据集成仍属于下一阶段，不能声称已经完全完成。

**业务价值**：从重新录入全部收货资料，转为只处理例外。  
**旧流程对比**：Excel 需要手工建立批次并核对预计数量。  
**不要做**：不要执行最终收货确认。  
**下一页过渡**：

> 完成物理操作后，库存报表需要回答库存在哪里、是什么状态。

---

## 5:25–6:25 — Product Inventory Report：数量权威与 SN 追踪

**页面**：Product Inventory Report  
**点击动作**：先展示 Product 汇总，再打开 SKU `97-223-00107-00`。

**Product 汇总应显示**：

- Physical：314
- 物理可用库存：297
- Frozen：17
- In Transit：0
- New：206
- Repair Good：106
- Repair：2

**SKU 明细应显示**：

- Physical：92
- Frozen：2
- Available：90
- 已知 SN：2
- 历史未覆盖 SN：90
- 分布库位：5

**我说：**

> InventoryBalance 是数量权威，Serial Number 是设备身份和追踪证据。登记一个 SN 只把身份绑定到已有 Physical Qty，不会增加库存。
>
> 这里同时展示 Physical、Frozen、Available、Condition、库位和 SN 覆盖率。历史未覆盖属于 Legacy Traceability Gap，不等于当前仓库操作产生的库存错误。

**业务价值**：在同一个可解释模型中连接数量、状态、位置和 SN。  
**旧流程对比**：Excel 依赖拼接 Key、公式列和人工维护这些关系。  
**下一页过渡**：

> 单个 SKU 回答库存在哪里；运营报表回答一段时间内发生了什么。

---

## 6:25–7:15 — Operations Report：只展示可解释 KPI

**页面**：Operations Report  
**点击动作**：展示 SYD 周报，再切换 All Warehouses 或月度范围。

**SYD 本周应显示**：

- Prepared：12 SH
- Dispatched：1 SH
- Frozen：17
- In Transit：0
- Repair：2
- 历史库存 KPI：数据不可用
- 面积 KPI：数据不可用

**我说：**

> 运营报表按所选仓库时区解释业务日期，并使用实际 outboundAt 作为出库时间，不使用导入、创建或备货时间。
>
> 当前历史库存基线和仓库面积尚未完整配置，所以周转率、库存天数和面积密度不应显示猜测值。正式版本应在指标旁明确写出“历史基线不足”或“仓库面积未配置”。

**业务价值**：避免看起来完整、实际无法审计的 KPI。  
**旧流程对比**：Excel 可能在缺少前提数据时仍给出貌似有效的结果。  
**下一页过渡**：

> 最后，我们从报表数字回到真实仓库空间。

---

## 7:15–8:15 — Warehouse Map：在空间中找到库存

**页面**：Warehouse Map  
**点击动作**：搜索 SN `60E5M48R57TG089`，进入 SYD → R2 → `R2-2-5-L`。

**屏幕应显示**：

- Physical：12
- Frozen：2
- Available：10
- SN：2
- Container：1
- Exceptions：0
- 位置中的 SKU、Model、Condition 和最近移动

**我说：**

> 搜索不会把仓库地图替换成普通结果列表，而是在真实空间中高亮目标位置。第一层是仓库区域，第二层是货架立面，第三层是库位抽屉。
>
> SN、SKU、Model、Location 或 Container 都可以定位到实际库位，同时查看库存状态和最近移动记录。

**业务价值**：把数据库结果转化为现场人员可以立即行动的空间信息。  
**旧流程对比**：以前先在 Excel 找库位代码，再依靠现场经验寻找货架。  
**下一页过渡**：

> 最后说明仓库物理执行和 ERP 之间的系统边界。

---

## 8:15–9:00 — ERP Boundary：失败可重试，物理事实不回滚

**页面**：ERP Mapping  
**点击动作**：指向 `MockERPAdapter`、连接状态、同步任务和失败任务区域。

**我说：**

> 当前使用 MockERPAdapter 证明系统边界，不能声称已经完成 Kingdee 集成。目标架构是：ERP 提供正式业务单据，WMS 执行物理操作，确认后的库存交易写入不可变 Ledger，然后通过 ERPSyncJob 写回 ERP。
>
> 如果 ERP 通信失败，已经确认的物理操作不会被静默撤销。系统保留同步异常，支持 Retry 和 Manual Review。
>
> 这个原型的重点不是替代 ERP，而是让仓库执行、序列号追踪、冻结库存、调拨和审计记录成为可控制、可解释的业务流程。

**结束语：**

> 这是一个可工作的 WMS 原型、目标状态验证工具，也是一个 ICT Business Analyst 流程优化方案。下一阶段重点是修复多仓指标范围、准备批准的 Transfer Demo 数据，并接入真实 ERP Adapter。

---

## 4. Stakeholder 可能提问：标准回答

### 为什么 Dashboard 可出库良品库存和产品报表物理可用库存不同？

> Dashboard 的 295 是可出库良品库存，只包括 New 和 Repair_Good，再减去
> Frozen。产品报表的 297 是 Product Physical 减 Frozen，其中还包括 2 台
> Repair。两个指标已经使用不同标签和帮助文字，数据没有丢失。

当前标签：

- Dashboard：`可出库良品库存`，帮助文字为 `新品 + 维修良品 − 已冻结`
- Inventory Report：`物理可用库存`，帮助文字为 `产品实物库存 − 已冻结`

### 为什么 Warehouse Map 是 2323，产品报表只有 310？

> Warehouse Map 默认包含 Product 和 Material；产品报表默认只筛选 Product。在库存报表选择“全部”后，Physical 2323、Available 2306、Frozen 17 与地图完全一致。

### Prepared 会不会把库存扣掉？

> 不会。Prepared 保留 Physical Qty，并增加 Frozen Qty。设备还在仓库，但已经被订单占用。只有最终 Dispatch 才减少 Physical；对应冻结数量也会一起释放。

### SN 数量和库存数量不一致是不是系统错误？

> 不一定。InventoryBalance 是数量权威，SN 是身份追踪。旧 Excel 数据可能存在历史 SN 覆盖缺口，系统会明确显示 Legacy Gap，但不会为了凑数创造 SN，也不会因为补登记 SN 而增加库存。

### ERP 失败时库存会不会回滚？

> 已确认的物理操作代表真实仓库事实，不会因为 ERP 网络或接口失败被静默回滚。系统创建可重试的同步异常，由 Retry 或 Manual Review 处理。

### 现在是否已经连接 Kingdee？

> 没有。当前是 MockERPAdapter，用于验证集成边界和失败处理机制。真实 Kingdee Adapter 属于后续集成工作。

### 为什么部分 KPI 显示数据不可用？

> 周转率和库存天数需要可重建的历史库存基线；面积密度需要正式仓库面积。前提数据缺失时，系统选择不显示猜测结果。

---

## 5. 已知演示限制

| 等级 | 限制 | 现场处理方式 |
|---|---|---|
| P1 | 当前 ERP 是 `MockERPAdapter`，不是真实 Kingdee | 明确说明 Adapter 边界，不声称真实 Kingdee 已连接 |
| P1 | 尚未完成生产权限、备份恢复和监控验收 | 结论保持 `READY WITH LIMITATIONS`，不能称 Production Ready |
| P2 | 历史期初 Ledger 基线不足 | 展示系统给出的具体不可用原因，不提供猜测 KPI |
| P2 | 仓库面积未配置 | 展示面积 KPI 的具体不可用原因 |
| P2 | 非零多仓异常视觉样例依赖获批测试数据 | 当前仓库过滤逻辑由自动化测试覆盖 |
| P3 | New Inbound 尚未自动接入完整 Expected Dataset | 明确区分当前能力与目标状态 |

---

## 6. 绝对不要现场执行的操作

- 不确认真实 Outbound。
- 不确认 Prepared。
- 不确认 Faulty Receiving。
- 不创建、发出或接收真实 Transfer。
- 不确认 New Inbound。
- 不执行 Adjustment、Move 或任何库存修正。
- 不删除或修改历史交易。
- 不现场猜测 SKU、SN、库位或 ERP 结果。
- 不声称 `MockERPAdapter` 是真实 Kingdee 连接。
- 不把 `Unmapped`、Legacy SN Gap 或 KPI unavailable 描述成库存丢失。

---

## 7. 演示截图备份

若 Preview 网络不稳定，可使用以下截图继续讲解：

1. [Dashboard](../artifacts/demo-rehearsal-zh-final-current-url/01-dashboard.png)
2. [Outbound Queue](../artifacts/demo-rehearsal-zh-final-current-url/02-outbound.png)
3. [Outbound SN Review](../artifacts/demo-rehearsal-zh-final-current-url/03-sn-review.png)
4. [Batch Label Selection](../artifacts/demo-rehearsal-zh-final-current-url/04-batch-label-selection.png)
5. [Batch Label Preview](../artifacts/demo-rehearsal-zh-final-current-url/05-batch-label-preview.png)
6. [Faulty Receiving Review](../artifacts/demo-rehearsal-zh-final-current-url/06-faulty-review.png)
7. [Transfer Review](../artifacts/demo-rehearsal-zh-final-current-url/07-transfer.png)
8. [Inventory Report](../artifacts/demo-rehearsal-zh-final-current-url/08-inventory-report.png)
9. [Operations Report](../artifacts/demo-rehearsal-zh-final-current-url/09-operations-report.png)
10. [Warehouse Floor](../artifacts/demo-rehearsal-zh-final-current-url/10-warehouse-map.png)
11. [Warehouse Location Detail](../artifacts/demo-rehearsal-zh-final-current-url/11-location-detail.png)
12. [ERP Boundary](../artifacts/demo-rehearsal-zh-final-current-url/12-erp-boundary.png)

---

## 8. 一页速记版

| 时间 | 页面 | 只讲这一句 |
|---|---|---|
| 0:00 | Dashboard | 从 Excel 状态筛选变成真实仓库工作队列 |
| 0:50 | Outbound | Prepared 冻结但不减少 Physical；确认 Dispatch 才改变实物库存 |
| 2:00 | Batch Labels | 11 张订单从逐张操作变成一次批处理 |
| 2:50 | Faulty Receiving | 未知或重复 SN 先进入异常，不猜测业务数据 |
| 3:50 | Transfer | 优化重点是取消第二遍扫描，不只是扫描得更快 |
| 4:40 | New Inbound | 从录入所有数据转向只处理 Expected vs Actual 异常 |
| 5:25 | Inventory | Balance 管数量，SN 管身份，两者不可互相造数 |
| 6:25 | Operations | 缺少前提时不生成无法审计的 KPI |
| 7:15 | Warehouse Map | 搜索结果在真实空间中高亮，而不是替换成卡片列表 |
| 8:15 | ERP | 物理事实先落账；ERP 失败进入可重试异常，不静默回滚 |
