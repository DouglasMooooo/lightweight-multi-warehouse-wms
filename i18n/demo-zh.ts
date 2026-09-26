/** Presentation-only Chinese. Business identifiers and domain codes stay unchanged. */
const entries: Record<string, string> = {
  Overview: "作业总览",
  Outbound: "出库",
  "Digital Pickup": "数字取货",
  "Faulty Return": "故障退回收货",
  Transfer: "跨仓调拨",
  "Repair → Good": "维修转良品",
  "Warehouse Map": "仓库地图",
  "SN Trace": "SN 全程追溯",
  "Audit / Exceptions": "审计与异常",
  "AI Audit Concept": "AI 审计概念",
  Inventory: "库存明细",
  Reporting: "管理报表",
  "Live execution queue and warehouse position": "实时作业队列与仓库库存状态",
  "Verify location and scan two units to prepare":
    "核验库位，扫描两台设备，自动完成出库准备",
  "Simulated identity or driver handover dispatches stock":
    "模拟身份核验或司机交接，确认领取即完成出库",
  "Receive units, route missing documentation to after-sales":
    "先完成实物收货，缺失单据自动转交售后处理",
  "Separate source and destination SN evidence":
    "发出与接收分别扫描，保留独立 SN 证据",
  "Complete repair while preserving the same SN":
    "维修完成后转为良品，保留同一 SN 身份",
  "Explore locations, balances and movement history":
    "点击库位，查看库存、SN 与流转记录",
  "Follow one serial through its warehouse lifecycle":
    "按 SN 查看设备在仓库中的完整生命周期",
  "Deterministic checks and investigation queue": "规则自动检查，异常集中排查",
  "Mock analysis only; human decisions remain authoritative":
    "仅展示模拟分析，所有业务决策由人工确认",
  "Physical, frozen and available by location and condition":
    "按库位和成色查看实物、冻结与可用数量",
  "Current position and weekly / monthly movement evidence":
    "当前库存概览与周／月流转记录",
  "Verify scan": "确认扫描",
  "All warehouses": "全部仓库",
  Sydney: "悉尼",
  Melbourne: "墨尔本",
  "Operation failed.": "操作未完成，请检查输入后重试。",
  "All demo workflows, scans, exceptions and audit history reset. Ready for another presentation.":
    "所有演示流程、扫描记录、异常和审计历史已重置，可以重新演示。",
  "Ready for Pickup": "待领取",
  "To prepare": "待备货",
  Collected: "已领取",
  "WORKFLOW PREVIEW": "仓库作业流程预览",
  "Consolidated view": "汇总视图",
  "Current task context": "当前作业仓库",
  "Demo workflows": "演示流程导航",
  "Prototype / Demo Data": "原型演示 · 模拟数据",
  "Synthetic session · no ERP connection": "独立模拟会话 · 未连接 ERP",
  "Existing operational preview ↗": "打开原业务预览 ↗",
  "WMS Workflow Preview": "WMS 仓库作业预览",
  "Leadership demo": "管理层演示",
  "Reset Demo": "重置演示",
  "WAREHOUSE EXECUTION /": "仓库作业 /",
  "Every unit. Every movement.": "每台设备，每次流转，都可追溯。",
  "Action required": "请检查",
  Confirmed: "操作成功",
  "Dismiss message": "关闭提示",
  "NEXT TASK · SYDNEY": "下一项任务 · 悉尼仓",
  "Prepare the service replacement.": "开始准备售后换机出库。",
  "Collection complete. Keep work moving.": "领取已完成，继续下一项作业。",
  "Two units ready. Verify collection.": "两台设备已备妥，请核验领取。",
  "· EQ4800-S · 2 units · FLEX-01": "· EQ4800-S · 2 台 · FLEX-01",
  "Start Pick Task": "开始拣货",
  "Open pickup": "前往取货",
  "SCAN. VERIFY. COMPLETE.": "扫描 · 核验 · 完成",
  "Demo units · all warehouses": "模拟数量 · 全部仓库",
  "Leadership demo scenarios": "管理层演示场景",
  "Run a workflow. Inspect the evidence. Reset.":
    "执行流程 → 查看证据 → 一键重置",
  "Start Demo": "开始演示",
  "Order validated": "订单已校验",
  "Location verified": "库位已核验",
  "SNs verified": "SN 已核验",
  "Pick task": "拣货任务",
  "Model / SKU": "型号 / SKU",
  "Required quantity": "需求数量",
  "2 units · New": "2 台 · 全新",
  "Suggested location": "建议库位",
  "Pickup code": "取货码",
  "✓ Location verified": "✓ 库位核验通过",
  "Location verification pending": "等待扫描库位",
  "Next action": "下一步操作",
  "Task completed. Pickup evidence is recorded.":
    "任务已完成，领取证据已记录。",
  "Physical stock unchanged. Two units frozen for collection.":
    "实物数量未减少，已冻结 2 台设备等待领取。",
  "Continue to pickup": "继续取货流程",
  "Print batch pickup label": "打印批次取货标签",
  Pickup: "取货码",
  "2 units · FLEX-01": "2 台 · FLEX-01",
  "02 / SCAN SN": "02 / 扫描设备 SN",
  "01 / GO TO LOCATION": "01 / 前往库位",
  "Scan the next unit.": "扫描下一台设备。",
  "Go to FLEX-01.": "请前往 FLEX-01。",
  "Scan unit SN": "扫描设备 SN",
  "Scan location QR / code": "扫描库位二维码／库位码",
  "SN accepted. Readiness updates automatically when both units are validated.":
    "SN 校验通过；两台设备全部核验后，系统自动更新为待领取。",
  "Location verified. Now scan the two units.":
    "库位核验通过，请依次扫描两台设备。",
  "Presenter scan values": "演示扫码示例",
  "Type or paste a value, then press Enter. Location QR scanners supply the location code.":
    "输入或粘贴示例后按回车确认。库位二维码扫描结果应为库位码。",
  "Collection verification": "领取核验",
  "Prototype workflow · simulated identity": "原型流程 · 模拟身份",
  "Engineer pickup": "工程师领取",
  "Logistics driver": "物流司机提货",
  Engineer: "工程师",
  Driver: "司机",
  "Alex Chen": "陈工（Alex Chen）",
  "Simulated after-sales identity": "模拟售后工程师身份",
  "After-sales order / shipment": "售后订单 / 发运单",
  Authorised: "领取授权",
  "Yes · demo grant for this shipment": "已授权 · 仅为本单模拟授权",
  "Enter / scan Pickup Order Number": "输入／扫描取货单号",
  "Driver / carrier handover name": "司机／承运商交接人",
  "Enter collector name": "请输入领取人姓名",
  "No company identity required. Shipment reference and readiness are validated.":
    "司机无需公司内部身份；系统核验取货单与备货状态。",
  "Pickup Verified. Shipment Collected; SNs Outbound; inventory reduced; audit event created.":
    "领取核验通过：发运单已领取，SN 已出库，库存已扣减，审计已记录。",
  "Confirm Collection": "确认领取并出库",
  "Confirm Handover": "确认交接并出库",
  "Complete the": "请先完成",
  "pick task": "拣货任务",
  "first.": "。",
  "Shipment evidence": "发运与领取证据",
  "No prepared units yet.": "尚未完成设备备货。",
  "Pickup Verified": "领取核验通过",
  "Sydney time": "悉尼时间",
  "Shipment → Collected": "发运单 → 已领取",
  "SN → Outbound": "SN → 已出库",
  "Order / task → Completed": "订单 / 任务 → 已完成",
  "Pickup confirmation is the dispatch event. The mock identity is not real authentication.":
    "确认领取即完成出库，无需再次确认发货。此身份仅为演示，不是真实认证。",
  "Receive faulty units": "接收故障设备",
  "Single SN or multiple SNs": "输入一个或多个 SN",
  "Demo fixtures": "演示数据",
  "Matched SH / order": "已匹配 SH / 订单",
  "Known unit identity; documentation missing": "设备身份已知，业务单据缺失",
  "Confirm physical repair location": "确认实物维修库位",
  "Scan / enter REPAIR-01": "扫描／输入 REPAIR-01",
  "Warehouse receipt completed. Matched units entered Repair; missing documentation routed to After-sales Action Required.":
    "仓库实物收货完成，设备进入维修库存；缺失单据已转交售后补单。",
  "Receive physically": "确认实物收货",
  "Identity & history lookup": "设备身份与历史查询",
  Matched: "已匹配",
  "Documentation pending": "等待补充单据",
  "Unknown identity — no SKU inferred": "身份未知，系统不会猜测 SKU",
  "SH / order:": "SH / 订单：",
  "Missing SH reference": "缺少 SH 关联",
  "Existing status:": "当前状态：",
  Unresolved: "待核实",
  "Physical receiving is permitted for the known demo unit. After-sales must complete business documentation.":
    "已知身份的演示设备可先实物入库，售后团队随后补齐业务单据。",
  "Enter an SN to inspect its history.": "输入 SN 即可查看设备历史。",
  "Open repair queue": "打开维修队列",
  "SOURCE WAREHOUSE": "调出仓库",
  "DESTINATION WAREHOUSE": "调入仓库",
  "EQ4800-S · 1 unit · New": "EQ4800-S · 1 台 · 全新",
  "Expected SN list": "期望 SN 清单",
  "Sent SN scans": "调出扫描记录",
  "Received SN scans": "调入扫描记录",
  "No scan evidence yet": "暂无扫描证据",
  "Sydney · source task": "悉尼 · 调出任务",
  "Melbourne · receiving task": "墨尔本 · 接收任务",
  "Transfer complete": "调拨已完成",
  "SN located at Melbourne /": "SN 当前库位：墨尔本 /",
  "Scan source SN": "扫描调出设备 SN",
  "Scan actual destination SN": "扫描目的仓实际收到的 SN",
  "SN matched to expected transfer. Scan evidence recorded for this warehouse.":
    "SN 与期望调拨清单一致，已记录本仓扫描证据。",
  "Transfer Out recorded. Unit is In Transit; Melbourne has a receiving task.":
    "调出已记录，设备进入在途状态；墨尔本仓收到接收任务。",
  "Confirm Transfer Out": "确认调出",
  "Destination location": "调入库位",
  "Transfer In recorded. Expected and actual SNs match; location updated to Melbourne.":
    "调入已记录，期望与实际 SN 一致，设备库位已更新至墨尔本。",
  "Confirm Transfer In": "确认调入",
  "Expected vs actual": "期望与实收对比",
  "missing scans": "台设备待扫描",
  "Unexpected, duplicate and wrong SNs are rejected with an explanation. Source scans never count as destination receipt.":
    "意外、重复或错误 SN 会被拒绝并说明原因。调出扫描不能作为调入凭证。",
  "Source validation": "调出核验",
  "Destination validation": "调入核验",
  "Repair completion": "维修完成入库",
  "Scan repair SN once": "扫描维修设备 SN（一次即可）",
  "Receive this SN through Faulty Return first.":
    "请先在故障退回收货中接收此 SN。",
  "Repair started. You can complete this unit without scanning it again.":
    "维修已开始，后续完成操作无需再次扫描此 SN。",
  "Start repair": "开始维修",
  "Target good-stock location": "目标良品库位",
  "Repair → Repair_Good complete. Same SN, same total physical quantity; audit and ledger recorded.":
    "维修转良品完成：SN 身份与实物总数不变，账本和审计已记录。",
  "Mark repair completed": "确认维修完成",
  "✓ Returned to usable stock at": "✓ 已转回可用良品库存，库位：",
  "Repair queue": "维修队列",
  "No units awaiting repair": "暂无待维修设备",
  "Receive a faulty unit to create a native repair job.":
    "接收故障设备后，系统自动创建维修任务。",
  "Start faulty receiving": "前往故障收货",
  "A condition change, separate from Transfer. Native repair must be In Repair before completion.":
    "这是成色转换流程，与调拨独立。必须先进入维修中，才能确认维修完成。",
  Warehouse: "仓库",
  "Schematic · not to scale · click a location":
    "仓库示意图 · 非等比例 · 点击库位查看详情",
  "WAREHOUSE FLOOR": "仓库平面示意",
  "↑ RECEIVING": "↑ 收货方向",
  units: "件",
  "Fixed location": "固定库位",
  "CLEAR ACCESS AISLE": "请保持通道畅通",
  "Repair area": "维修区域",
  "Dispatch staging": "发运暂存区",
  "Flexible location": "弹性库位",
  "Temporary location": "临时库位",
  Fixed: "固定库位",
  Flexible: "弹性库位",
  Temporary: "临时库位",
  Repair: "维修",
  Dispatch: "发运暂存",
  Quarantine: "隔离区",
  Occupied: "已占用",
  Empty: "空库位",
  "· location entity": "· 独立库位档案",
  Physical: "实物数量",
  Frozen: "冻结数量",
  Available: "可用数量",
  "Available*": "可用数量*",
  "physical /": "件实物 /",
  frozen: "件冻结",
  "SNs physically present": "库位内实物 SN",
  "No SNs at this location.": "此库位暂无设备 SN。",
  "Recent movements": "近期流转",
  "units ·": "件 ·",
  "Occupancy is occupied / empty. Capacity is not configured. *Physical less frozen; Repair is not allocatable.":
    "占用状态仅区分已占用／空库位，尚未设置容量。*可用数量为实物减冻结；维修库存不可分配。",
  "Search by SN": "按 SN 查询",
  Location: "库位",
  "Outside physical stock": "不在实物库存中",
  Condition: "成色",
  "Business reference": "业务关联单据",
  "SN-level lifecycle evidence connects identity, location and business movement.":
    "SN 级全生命周期证据，将设备身份、物理库位与业务流转关联起来。",
  "Lifecycle timeline": "生命周期时间线",
  "· Sydney": "· 悉尼时间",
  "Pickup / Outbound": "领取 / 出库",
  "Outside source location": "已离开源库位",
  External: "仓外",
  "Synthetic opening baseline": "模拟期初库存",
  "No warehouse movements recorded in this reset session. Historical identity reference:":
    "本次演示会话暂无仓库流转记录。历史业务关联：",
  "not available": "暂无",
  "Receive this return": "接收此退回设备",
  "SN not found": "未找到此 SN",
  "Check the serial or use one of the synthetic examples above.":
    "请核对 SN，或使用上方模拟示例。",
  "Live demo checks": "当前演示检查",
  "Sample discrepancies": "差异样本演示",
  "Read-only inconsistent sample": "只读差异样本",
  "Deterministic rules": "确定性审计规则",
  "These deliberately inconsistent fixtures demonstrate detection. They do not change the live demo inventory.":
    "这些特意设置的差异样本用于展示异常检测，不会改变当前演示库存。",
  "Suggested investigation": "建议排查步骤",
  "No unresolved exceptions": "暂无未解决异常",
  "SN coverage, outbound status, repair state, transfer age, balance validity and ledger reconciliation checks passed.":
    "SN 数量、出库状态、维修状态、调拨时效、库存有效性及账本对账检查均通过。",
  "Inspect sample discrepancies": "查看差异样本",
  "Immutable operation evidence": "不可修改的操作记录",
  "Run a scenario to generate audit evidence.":
    "执行演示流程后，将在此生成审计证据。",
  "Concept Preview": "概念预览",
  "Mocked structured analysis. No external AI API. No inventory write access.":
    "模拟结构化分析，未连接外部 AI API，无权修改库存。",
  "Structured Data": "结构化数据",
  "Audit Rules": "审计规则",
  "Exception Queue": "异常队列",
  "AI Analysis": "AI 分析",
  "Human Decision": "人工决策",
  "Explore an example question": "选择示例问题",
  "Why does Repair inventory differ by 7 units?": "为什么维修库存相差 7 台？",
  "What SNs were dispatched but still appear in stock?":
    "哪些 SN 已出库却仍显示在库？",
  "Which transfers are overdue?": "哪些调拨尚未按时接收？",
  "Show unresolved exceptions today.": "查看今天尚未解决的异常。",
  "Mock analysis": "模拟分析结果",
  "Concept Preview · illustrative response": "概念预览 · 示例回答",
  "The seven-unit discrepancy is an illustrative scenario, not a claim about current demo balances.":
    "7 台差异仅为讲解示例，不代表当前演示库存存在此差异。",
  "Repair → Good residual records": "维修转良品后残留记录",
  "5 units": "5 台",
  "Outbound status not closed": "出库状态未关闭",
  "1 unit": "1 台",
  "Transfer not completed": "调拨尚未完成",
  "Human action: inspect each SN, compare completion and movement evidence, and approve any correcting operation.":
    "人工处理建议：逐台检查 SN，核对完成状态与流转证据，再审批必要的更正操作。",
  "unresolved exception(s) in the live synthetic session.":
    "项当前模拟会话中的未解决异常。",
  "Review the exception queue and supporting transaction history before making a decision.":
    "请先核对异常队列及相关交易历史，再作出业务决定。",
  "No inventory changes made. Answers are fixed templates with deterministic demo counts.":
    "未修改任何库存。回答来自固定模板及确定性演示统计。",
  "Select a question to show the proposed analysis format.":
    "选择一个问题，查看未来分析助手的输出形式。",
  "Inventory position": "库存明细",
  "All warehouses · product and material · balances are the quantity authority.":
    "全部仓库 · 包含产品与物料 · 库存余额是数量权威来源。",
  "In Transit": "在途",
  "*Physical less Frozen; Repair inventory remains non-allocatable. Product and material units are included.":
    "*可用数量为实物减冻结；维修库存不可分配。数量包含产品与物料。",
  "Demo records": "模拟记录",
  "Demo units": "模拟数量",
  "Movement reporting": "库存流转报表",
  "Last 7 days": "最近 7 天",
  "Last 30 days": "最近 30 天",
  "Rolling period · Sydney display time · outbound uses actual outboundAt. Current balances above are not historical closing balances.":
    "滚动统计周期 · 按悉尼时间展示 · 出库按实际出库时间统计。上方当前余额不代表历史期末库存。",
  "No movements in this reset session. Run a warehouse scenario to populate the report.":
    "本次重置后暂无流转记录。执行仓库演示流程后，报表将自动更新。",
  "Reporting concept": "报表能力概念",
  "Structured WMS data → automated reporting → future BI → future AI querying. Scheduled reports and BI connections are not implemented.":
    "结构化 WMS 数据 → 自动报表 → 未来 BI → 未来 AI 查询。定时报表发送和 BI 连接尚未实现。",
  "SN-first traceability · system-driven execution":
    "SN 优先追溯 · 系统驱动作业",
  "Synthetic browser session · refresh or Reset Demo restores fixtures":
    "独立模拟会话 · 刷新或重置演示即可恢复初始数据",
  "Synthetic fixture": "模拟数据初始化",
  "Demo operator": "演示操作员",
  "Demo Supervisor": "演示主管",
  Recorded: "已记录",
  "Outbound Today": "今日出库",
  "Open Exceptions": "待处理异常",
  "Transfer Pending": "待完成调拨",
  "Repair Backlog": "待完成维修",
  New: "全新",
  Repair_Good: "维修良品",
  Material: "物料",
  Scrap: "报废",
  Draft: "待执行",
  Ready: "待备货",
  Prepared: "已备货",
  In_Stock: "在库",
  In_Transit: "在途",
  Received: "已接收",
  Pending_Repair: "待维修",
  In_Repair: "维修中",
  Repair_Completed: "维修完成",
  Return_to_Repair: "退回维修",
  Transfer_Out: "调拨出库",
  Transfer_In: "调拨入库",
  Opening: "期初入库",
  Low: "低",
  Medium: "中",
  High: "高",
  Critical: "严重",
  Open: "待处理",
  Investigating: "排查中",
  Resolved: "已解决",
  SN_COUNT_MISMATCH: "SN 数量不一致",
  OUTBOUND_STATUS_MISMATCH: "出库状态不一致",
  REPAIR_STATUS_RESIDUAL: "维修状态残留",
  TRANSFER_NOT_RECEIVED: "调拨超时未接收",
  NEGATIVE_INVENTORY: "库存数量异常",
  UNLINKED_SN_RECORD: "SN 关联记录不完整",
  TRANSACTION_BALANCE_MISMATCH: "交易账本与库存余额不一致",
  MISSING_SH_REFERENCE: "缺少 SH 关联 · 售后待补单",
  "This pick task is already complete.": "此拣货任务已完成。",
  "Wrong location. Go to FLEX-01 and scan its location code.":
    "库位不正确，请前往 FLEX-01 并扫描库位码。",
  "FLEX-01 scanned for pick task.": "已扫描 FLEX-01 核验拣货库位。",
  "Scan FLEX-01 before scanning units.": "请先扫描 FLEX-01 库位，再扫描设备。",
  "Duplicate SN. This unit is already scanned.": "SN 重复，此设备已扫描。",
  "Wrong SN, SKU, condition or location. Scan an available New EQ4800-S at FLEX-01.":
    "SN、SKU、成色或库位不匹配，请扫描 FLEX-01 中可用的全新 EQ4800-S。",
  "SN belongs to the expected transfer list. Use the outbound units.":
    "此 SN 属于调拨清单，请扫描出库任务指定设备。",
  "Exact location, SKU, condition and both unique SNs validated atomically.":
    "库位、SKU、成色与两个唯一 SN 已通过完整校验。",
  "Shipment must be Ready for Pickup and not already collected.":
    "发运单必须处于待领取状态，且未被领取。",
  "Unknown pickup flow.": "无法识别此取货流程。",
  "Pickup number does not match this shipment.": "取货单号与当前发运单不匹配。",
  "Collector name is required for handover evidence.":
    "请填写领取人姓名，以便记录交接证据。",
  "This simulated engineer is not authorised for this shipment.":
    "此模拟工程师没有领取当前发运单的权限。",
  "Prepared SN evidence no longer matches shipment.":
    "备货 SN 证据与发运单不再匹配，请重新核查。",
  "Pickup Verified / Collected": "领取核验通过 / 已领取",
  "Confirm physical location REPAIR-01.": "请确认实物库位为 REPAIR-01。",
  "Scan at least one SN.": "请至少扫描一个 SN。",
  "Duplicate SN in receiving batch.": "收货批次中存在重复 SN。",
  "Unknown SN identity. Use a documented demo SN; no SKU will be guessed.":
    "SN 身份未知，请使用已登记的演示 SN；系统不会猜测 SKU。",
  "Warehouse receipt completed. Business documentation pending. After-sales Action Required: link the original SH/order.":
    "仓库实物收货完成，业务单据待补充。售后待办：关联原 SH / 订单。",
  "Transfer is not at this scan stage.": "当前调拨状态不允许此阶段扫描。",
  "Duplicate SN. Each unit must be scanned once at this warehouse.":
    "SN 重复，同一设备在当前仓库只需扫描一次。",
  "Unexpected / wrong SN. It is not in the expected transfer list.":
    "意外／错误 SN，不在期望调拨清单中。",
  "SN state, warehouse, location or condition does not match the transfer.":
    "SN 状态、仓库、库位或成色与调拨要求不一致。",
  "Missing source SN scan.": "缺少调出仓 SN 扫描。",
  "Missing destination SN scan. Source scans cannot prove receipt.":
    "缺少目的仓 SN 扫描；调出记录不能证明已收货。",
  "Scan an SN received into Repair with an active repair job.":
    "请扫描已进入维修库存、且有关联维修任务的 SN。",
  "Repair started": "维修已开始",
  "Native repair job now In_Repair.": "维修任务已进入维修中状态。",
  "Choose an active Sydney good-stock location.": "请选择有效的悉尼良品库位。",
  "Repair balance does not cover this unit.": "维修库存余额不足以覆盖此设备。",
  "Repair completed": "维修已完成",
  "Recount units and verify SN coverage.": "重新清点实物，核对 SN 登记完整性。",
  "Physical / frozen balance is invalid.": "实物／冻结数量不符合库存规则。",
  "Review reservations and correcting transactions.":
    "检查库存预留及更正交易。",
  "Reconcile immutable movement history to opening balance.":
    "从期初余额开始，逐笔核对不可修改的流转记录。",
  "SN location or inventory chain cannot be reconciled.":
    "SN 库位或库存链条无法正确对账。",
  "Review location, inventory state and business references.":
    "核对库位、库存状态及业务关联单据。",
  "Dispatched order still has an in-stock SN.":
    "订单已出库，但关联 SN 仍显示在库。",
  "Review dispatch closure and SN state.": "核查出库完成记录及 SN 状态。",
  "Completed repair still appears in Repair inventory.":
    "维修已完成，但设备仍残留在维修库存中。",
  "Compare repair completion with condition movement.":
    "比对维修完成记录与成色转换交易。",
  "Dispatched over 24 hours ago; no destination receipt.":
    "调出已超过 24 小时，目的仓尚无收货记录。",
  "Ask destination to verify expected versus actual SNs.":
    "请目的仓核对期望 SN 清单与实收设备。",
  "After-sales team: attach the original order reference.":
    "售后团队：补充原订单关联。",
  "Frozen inventory cannot be negative.": "冻结库存不能为负数。",
  "Invalid location for the selected warehouse.":
    "此库位不属于所选仓库或已停用。",
  "Outbound order line not found.": "未找到出库订单行。",
  "Prepared quantity must be positive.": "备货数量必须大于零。",
  "Insufficient available stock.": "可用库存不足。",
  "Prepared quantity exceeds the requested quantity.": "备货数量超过需求数量。",
  "Prepared outbound SH": "出库单备货完成",
  "This product does not require serial scanning.": "此产品无需扫描 SN。",
  "Serial number already scanned.": "此 SN 已扫描。",
  "All prepared units already have serial numbers.":
    "所有已备货设备均已绑定 SN。",
  "Serial number does not match the requested SKU.": "SN 与需求 SKU 不匹配。",
  "Serial number is allocated to another order.": "此 SN 已被其他订单占用。",
  "Serial number is not in the allocated location.": "此 SN 不在分配库位中。",
  "Scanned outbound SN": "出库 SN 扫描",
  "Outbound order not found.": "未找到出库订单。",
  "All requested stock must be prepared before dispatch.":
    "所有需求库存完成备货后才能出库。",
  "Product outbound must have all required serial numbers.":
    "产品出库必须提供全部需求 SN。",
  "Prepared inventory is no longer available.": "已备货库存不可用，请核查。",
  "Serial allocation is invalid.": "SN 分配关系无效。",
  "Confirmed outbound": "确认出库",
  "Physical dispatch recorded.": "实物出库已记录。",
  "This serial number has already been received into repair inventory.":
    "此 SN 已接收至维修库存，请勿重复收货。",
  "Serial number already exists in active inventory.":
    "此 SN 已存在于在库库存中。",
  "Received faulty SN": "故障 SN 收货",
  "Transfer order not found.": "未找到调拨单。",
  "Cross-warehouse Transfer requires different warehouses.":
    "跨仓调拨的调出仓与调入仓必须不同。",
  "Insufficient stock for Transfer Out.": "调出库存不足。",
  "All transfer serial numbers are required.": "必须提供全部调拨 SN。",
  "Transfer serial is not available.": "调拨 SN 当前不可用。",
  "Dispatched transfer": "调拨已发出",
  "Serials now In_Transit.": "SN 已进入在途状态。",
  "Transfer is not ready to receive.": "此调拨尚未进入可接收状态。",
  "In-transit balance is inconsistent.": "在途库存余额不一致。",
  "Transfer serial status is inconsistent.": "调拨 SN 状态不一致。",
  "Received transfer": "调拨已接收",
  "Repair job has already been completed.": "维修任务已完成，请勿重复操作。",
  "Only Pending_Repair jobs can start repair.": "只有待维修任务可以开始维修。",
  "Only In_Repair jobs can be completed.": "只有维修中的任务可以确认完成。",
  "Battery service cable": "电池维修线缆",
  "PCBA H1-G2 3–6kW power board": "H1-G2 3–6kW 功率板 PCBA",
  "KH cable cover": "KH 线缆盖板",
  FLEX: "弹性区",
  REPAIR: "维修区",
  DISPATCH: "发运区",
  RETURN: "退货区",
  TEMP: "临时区",
  QUARANTINE: "隔离区",
  RECEIVING: "收货区",
};

const dictionary = new Map<string, string>();
for (const [key, value] of Object.entries(entries)) {
  dictionary.set(key.toLowerCase(), value);
  dictionary.set(key.replaceAll("_", " ").toLowerCase(), value);
}

/** Only visible strings are translated; JSX nodes, numeric quantities and IDs pass through. */
export function zh<T>(value: T): T {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/\s+/g, " ").trim();
  const translated =
    entries[normalized] ?? dictionary.get(normalized.toLowerCase());
  if (translated) return translated as T;
  const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
    [
      /^Repair cannot start from (.+)\. Expected Pending_Repair\.$/,
      (status) => `当前状态为${zh(status)}，只有待维修任务可以开始维修。`,
    ],
    [
      /^Repair cannot complete from (.+)\. Start Repair first\.$/,
      (status) => `当前状态为${zh(status)}，请先开始维修，再确认完成。`,
    ],
    [
      /^Physical ([-\d]+); physically present SNs ([-\d]+)\.$/,
      (physical, serials) => `实物数量 ${physical}；在库 SN 数量 ${serials}。`,
    ],
    [
      /^Ledger ([-\d]+); balance ([-\d]+)\.$/,
      (ledger, balance) => `账本数量 ${ledger}；库存余额 ${balance}。`,
    ],
    [
      /^Reserved (\d+) at (.+)\.$/,
      (qty, location) => `已在 ${location} 预留 ${qty} 件库存。`,
    ],
    [
      /^Repair → Repair_Good at (.+)\. Physical total unchanged\.$/,
      (location) => `设备在 ${location} 从维修转为维修良品，实物总数不变。`,
    ],
    [
      /^(Engineer|Driver) pickup (.+); confirmation is the dispatch event\. Identity is simulated\.$/,
      (kind, code) =>
        `${zh(kind)}领取 ${code}；确认领取即完成出库，身份仅为模拟。`,
    ],
    [
      /^(.+) · frozen reservation; physically present$/,
      (location) => `${location} · 已冻结预留，实物仍在库`,
    ],
    [/^(.+) → (.+)$/, (from, to) => `${zh(from)} → ${zh(to)}`],
  ];
  for (const [pattern, format] of patterns) {
    const match = normalized.match(pattern);
    if (match) return format(...match.slice(1)) as T;
  }
  return value;
}
