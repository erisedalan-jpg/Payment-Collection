# 2A 数据底座设计（PMIS 核心回款模型）

> 状态：设计已与用户确认，进入 spec。
> 这是「回款看板重建程序」的 **2A 数据底座**（项目清单为平台数据底座的地基）。把项目行的回款表示从"云文档 rawNodes 聚合"换骨为"PMIS 核心"，供 2B/2C/2D 派生。
> 范围：**后端数据层 + /project/:id 详情最小接入**；新增 PMIS 回款模型，**旧 rawNodes / 旧 `payment` / panalysis 页一律保留不动**（2B 再切换删除）。版本 V1.1.0 → **V1.2.0**。

## 0. 背景（第一期结论 → 2A 换骨）

现状：`Project.payment`（ProjectPayment）的金额/节点数由**云文档 rawNodes** 经 `projects.aggregate_payment` 聚合，仅 `paymentRatio` 在 S1 改为流水÷合同——口径不统一且建在要废弃的云文档节点上。

第一期诊断已验证（均真实数据）：
- 节点级**计划回款比例在 PMIS** 里程碑 `到货/初验/终验/驻场关联回款阶段` 列（如 `到货款1，70.00%`），`milestones.py` 未解析（解析缺口）；1823 项目有比例，与云文档仅 14 项目分歧。
- 售前服务* 项目自身全无 PMIS 合同（368/368），经 A.xlsx 映射取**原项目**（328/368 命中）的合同/流水。
- 手填"已回款比例"残缺（仅 103/712 可比）→ **弃用**；实际侧走 PMIS 流水（项目级）。

2A 据此把回款"计划侧"全 PMIS 化、"实际侧"走项目流水+里程碑达成。

## 1. 范围

**做**：① `milestones.py` 解析节点级计划回款比例；② 新增 PMIS 回款模型（项目行摘要 `paymentPmis` + 逐节点 map `paymentNodes`），售前回退原项目；③ schema + gen:types；④ `/project/:id` 回款 tab 最小接入新模型展示。

**不做（2A 边界）**：不动 `rawNodes` / 旧 `payment` / `aggregate_payment` / panalysis 5 tab（2B 切换删除）；不动 `/projects` 清单列与筛选（2B/2C）；不做任何聚合看板（2B）；里程碑/风险/预算已在 `projectMilestones`/`projectPmis`/`projectProfit` map 中，2A 不重做、仅在回款节点里复用里程碑。

## 2. 模块改动

### 2.1 `milestones.py` — 解析节点级计划回款比例
`row_to_milestones`（`milestones.py:80-92`）每个里程碑 item 现含 `name/planDate/actualDate/payStage/pct/priority`。新增纯函数并在 item 加字段：

```python
import re

def parse_pay_stage_ratio(pay_stage: str) -> Optional[float]:
    """从 '到货款1，70.00%' / 多期 '到货款1，70%；到货款2，30%' 抽计划回款比例;
    累加该阶段所有期百分比(/100);无 % → None。"""
    if not pay_stage:
        return None
    pcts = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*%", str(pay_stage))
    if not pcts:
        return None
    return round(sum(float(p) for p in pcts) / 100, 4)
```
item 增 `"payRatio": parse_pay_stage_ratio(pay)`（`pay` 即现有 `payStage`）。`MilestoneItem`（schema）增 `payRatio: Optional[float] = None`。

注：累加多期（比第一期 first-% 更准）；`_norm_stage` 已用"；"拼接多行，正则对原串/拼接串均可。

### 2.2 新增 `projects.build_payment_pmis(...)` — PMIS 回款摘要 + 节点
纯函数，输入：项目 PMIS 合同总额、该项目里程碑列表（已解析 payRatio）、该项目流水记录（payment_records entry）、今天日期（注入便于测试）。输出 `(summary_dict, nodes_list)`。售前回退在 9f 调用前完成（传入的合同/里程碑/流水已是 eff 口径，见 §5）。

```python
PAY_STAGES = ("到货", "初验", "终验", "驻场")   # 有"关联回款阶段"的里程碑名

def _node_status(plan_date, reached, today):
    if reached:
        return "已达成"
    if plan_date and plan_date < today:
        return "延期"
    return "待达成"

def build_payment_pmis(contract, milestones, pay_record, today):
    nodes = []
    for ms in milestones or []:
        if ms.get("name") not in PAY_STAGES or ms.get("payRatio") is None:
            continue
        reached = bool(ms.get("actualDate"))
        pr = ms["payRatio"]
        nodes.append({
            "stage": ms["name"], "planDate": ms.get("planDate") or "",
            "actualDate": ms.get("actualDate") or "", "payRatio": pr,
            "expectedPayment": round((contract or 0) * pr, 2),
            "reached": reached, "status": _node_status(ms.get("planDate") or "", reached, today),
        })
    actual_total = (pay_record or {}).get("total")
    summary = {
        "contract": contract,
        "actualTotal": actual_total,
        "paymentCount": (pay_record or {}).get("count", 0),
        "paymentRatio": round(actual_total / contract, 4) if (actual_total is not None and contract) else None,
        "expectedTotal": round(sum(n["expectedPayment"] for n in nodes), 2),
        "nodeCount": len(nodes),
        "reachedCount": sum(1 for n in nodes if n["reached"]),
        "delayedCount": sum(1 for n in nodes if n["status"] == "延期"),
        "lastPaymentDate": (pay_record or {}).get("lastDate", ""),
    }
    return summary, nodes
```

### 2.3 `preprocess_data.py` 9f 段 — 逐项目回填
在 9e（里程碑/流水/全预算摄取与 S1 回款率回填）之后新增 9f：对每个 `dept_project`，按 §5 解析 eff（本项目优先、售前回退 relatedClosedId），取 eff 的合同/里程碑/流水，调 `build_payment_pmis`，写 `p["paymentPmis"]` 与 `payment_nodes[pid]`；`paymentPmis` 加 `fromOrigin`(bool)。`today` 用 `datetime.now().strftime("%Y-%m-%d")`。`payment_nodes` 进 `final_data["paymentNodes"]`。

### 2.4 `schema.py` + 类型
- `MilestoneItem` 加 `payRatio: Optional[float] = None`。
- 新增 `class PaymentNodePmis`（stage/planDate/actualDate/payRatio/expectedPayment/reached/status）。
- 新增 `class ProjectPaymentPmis`（contract/actualTotal/paymentCount/paymentRatio/expectedTotal/nodeCount/reachedCount/delayedCount/lastPaymentDate/fromOrigin）。
- `Project` 加 `paymentPmis: Optional[ProjectPaymentPmis] = None`（与旧 `payment` 并存）。
- `AnalysisData` 加 `paymentNodes: Dict[str, List[PaymentNodePmis]] = {}`。
- `cd frontend && npm run gen:types` 同步 `analysis.ts`。

## 3. 数据模型（落地形态）

```
Project.paymentPmis = {
  contract, actualTotal, paymentCount, paymentRatio,   // 实际侧:项目级流水÷合同
  expectedTotal, nodeCount, reachedCount, delayedCount, // 计划侧:Σ合同×节点payRatio
  lastPaymentDate, fromOrigin                           // fromOrigin=售前取原项目
}
paymentNodes[pid] = [ { stage, planDate, actualDate, payRatio,
                        expectedPayment, reached, status }, ... ]
```

## 4. 节点状态口径（弃旧六态手填机，PMIS 三态）

- `已达成`：`actualDate` 非空（里程碑完成＝回款条件达成）。
- `延期`：`planDate < 今天` 且未达成。
- `待达成`：未到期且未达成。
- **实际现金不落节点**：项目级 `paymentRatio`(流水÷合同) 表达真实到账；节点只表达"计划比例/计划金额/是否达成"。

## 5. 售前 → 原项目（eff 口径）

9f 对每个项目算 `eff_id`：本项目 PMIS 有合同则 `eff=pid`；否则若 `relatedClosedId` 命中则 `eff=relatedClosedId` 且 `fromOrigin=True`。`contract` 取 `project_pmis[eff].customer.合同总额`、`milestones` 取 `project_milestones[eff]`、`pay_record` 取 `payment_records[eff]`。`relatedClosedId` 已由现管线（projects.read_mapping）填入项目行，原项目 PMIS/里程碑经 `extra_closed_ids`/`keep_ids` 已收录（9e 现状）。

## 6. `/project/:id` 接入（最小）

回款 tab 顶部增 `paymentPmis` 摘要 chips（合同/流水累计/笔数/完成率/计划回款总额/达成 n/节点 N；`fromOrigin` 时标"售前·取原项目"）；下方增"PMIS 回款节点"表（stage/计划日/实际日/计划比例/计划金额/状态，状态走三态淡底深字）。**旧云文档回款节点表暂保留**（2B 清）。`/projects` 列不改。

## 7. 测试

- **pytest**：`parse_pay_stage_ratio`（单期/多期累加/无%/空）；`build_payment_pmis`（节点派生仅四阶段且 payRatio 非空、expectedPayment=合同×比例、status 三态边界含 planDate<today、summary 各字段、流水 None/合同 None 的鲁棒）；`_node_status` 边界。
- **真实数据冒烟**：跑 preprocess，抽样核对 `paymentPmis`（售前 fromOrigin 取原项目、paymentRatio 与第一期报告同量级）、`paymentNodes` 节点比例与里程碑原值一致。
- `bash verify.sh` 全绿（含新 pytest + 前端 typecheck/gen:types/build）。

## 8. 版本与不做

- 版本 **V1.2.0**（`frontend/src/version.ts`）；PROGRESS 更新；`.spec` 无新增 py 模块（改的是既有 milestones/projects/preprocess/schema，已在 .spec）。
- **不做（YAGNI）**：不动 rawNodes/旧 payment/aggregate_payment/panalysis（2B）；不动 /projects 列筛选（2B/2C）；不做聚合看板（2B）；不做节点级现金分摊（已定达成+项目流水口径）；不做纳管→标签（2C）；不迁跟进（2D）。
