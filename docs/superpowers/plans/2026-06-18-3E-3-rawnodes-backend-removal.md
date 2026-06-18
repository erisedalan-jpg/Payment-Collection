# 3E-3 后端移除 rawNodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全 purge 后端 rawNodes/all_nodes/WPS 回款节点 sheet，活功能全换收款阶段(paymentNodes)，删 RawNode 类型与前端死链。

**Architecture:** 先换源后删：snapshots/totalPaymentNodes/projects.payment/pay_projects/dirty 改吃 paymentNodes(收款阶段)，node_action 抛弃；再删 all_nodes 构建与 rawNodes/dashboard/summary/displayColumns 产出、compute_dashboard/compute_tier_summary、RawNode 类型、前端僵尸(dataQuality/dashboardSignals/DataQualityTable)。`Project.payment` 保留但换收款阶段口径(用户 2026-06-18 改 spec G5：保留+换源，非删)。

**Tech Stack:** Python 标准库后端 + Vue3/TS/Vitest 前端。

参考 spec：`docs/superpowers/specs/2026-06-18-3E-3-rawnodes-backend-removal-design.md`（注：G5 已改为"保留 payment、后端换源收款阶段"）。

## Global Constraints
- 简体中文注释；不用 emoji（用 → ↓ ❌ ✕ ▾）。
- 提交两个 -m，结尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **严禁 `git add -A`／`git add .`**：仓库根「看板数据取值条件与计算公式.md」未跟踪必须排除，只用显式路径。
- 跑 Python 用 `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python ...`；前端命令在 `frontend/`。
- **删除/换源型任务一律跑全量回归**（`python -m pytest -q` 全量 + 前端 `npx vitest run` 全量），不只本文件（3E-2 教训）。
- 改 `schema.py` 后 `cd frontend && npm run gen:types`。
- 版本单一来源 `frontend/src/version.ts` → V1.6.9。
- **上线运维（G2）**：发布本版前手动清空 `data/snapshots/`，详见 Task 11。

**关键背景事实（备料已核，行号为现状参考，实现前以实际 grep 为准）：**
- `snapshots.build_snapshot(date_str, dept_projects, project_pmis, raw_nodes, project_profit=None)`（snapshots.py:32-77）：节点循环按 `pid|nodeName#k` 存 `{pid,pname,node,status,planDate,actual,expected}`，读 isPaymentRelated/nodeName/nodeStatus/actualPayment/expectedPayment。`run_snapshot_pipeline`(preprocess:1002-1011) 传 `final_data["rawNodes"]`。
- `PaymentNodePmis`(收款阶段节点) 字段：stage/planDate/actualDate/payRatio/actualRatio/expectedPayment/receivedAmount/unpaidAmount/status/category/termDays/reached。
- `server.node_action_date_from_data`(270-278)/`_get_node_action_date`(280-290)；`handle_followup_create` 自动填充(684-690)。
- `projects.build_projects(project_pmis, org_names, org_l4s, mapping, delivery_rows, all_nodes, org_l3_map=None)`(198-201)：`nodes_by_pid`(205-209)、名称回填(231 `if not name and nodes`)、`payment=aggregate_payment(nodes)`(233)、`"payment":payment`(245)；`load_dept_projects` 调用传 all_nodes(308)。`aggregate_payment`(166-179) 从 isPaymentRelated 节点算。`compute_health(pm, delayed_count)`(182-195)：`paymentAbnormal = delayed_count > 0`。
- preprocess：all_nodes 构建(1039-1060)；纳管循环(1073-1081)、followup 循环(1185-1188)、dirty(1203-1209)；`compute_dashboard`(551-)（totalPaymentNodes=len(isPaymentRelated 节点)、totalProjectCount 被 1096 用 project_overview 覆盖）；`compute_tier_summary`(674-)；pay_projects(1201-1202)；build_projects 调用(1220-1221)；S1 payment.paymentRatio 覆盖为流水÷合同(1255-1263)；**9f 收款阶段循环(1269-1291)：collection_stages 加载(1273)、eff/fromOrigin、`_nodes=collection_stages.get(_eff)`、`p["paymentPmis"]=build_payment_summary(...)`、`payment_nodes[_pid]=_nodes`**；displayColumns 构建(1143-1170)；final_data(1294-1320) 含 rawNodes(1302)/dashboard/summary/displayColumns。
- schema：`RawNode`(26-39，无 alias，直接 List[RawNode])；`AnalysisData.rawNodes/dashboard/summary/displayColumns`(312-332)；`Project.payment: ProjectPayment`(186-198)、`ProjectPayment`(132-138)、`ProjectPaymentPmis`(173-183)。
- 前端 `Project.payment` 活消费 8 处：ProjectDetailView.vue:80(回款完成率)、overview.ts:29-30(KPI 回款达成率 expectedTotal/actualTotal)、projectList.ts:48/78(paymentRatio)、projectPivot.ts:59-61(expectedTotal/actualTotal/delayedCount)。**这些全保留不动**(payment 后端换源即自动得收款阶段口径)，仅核对值。
- 前端死链(仅自身 test 引用，无活消费)：`lib/dashboardSignals.ts`+test、`lib/dataQuality.ts`(函数 dataQualityRows/dataQualityDrill)+test、`components/DataQualityTable.vue`(无活引用方)。`stores/data.ts:33-35` rawNodes/summary/dashboard 占位。`overview.test.ts:2` 死 RawNode import。

---

### Task 1: snapshots 稳定键换 paymentNodes

**Files:** Modify `snapshots.py`、`preprocess_data.py`（run_snapshot_pipeline 调用）；Test `tests/test_snapshots.py`、`tests/test_preprocess_snapshots.py`

**Interfaces:** Produces `build_snapshot(date_str, dept_projects, project_pmis, payment_nodes, project_profit=None)`（第 4 参数 raw_nodes→payment_nodes: `{pid: PaymentNodePmis[]}`）。

- [ ] **Step 1: 改测试** `tests/test_snapshots.py`：`_nodes()` 夹具从 all_nodes 列表(含 isPaymentRelated/nodeName/nodeStatus/actualPayment)换为 paymentNodes 字典 `{pid: [PaymentNodePmis]}`，节点含 stage/planDate/receivedAmount/expectedPayment/status；断言节点键为 `f"{pid}|{stage}#{k}"`、存储字段 actual=receivedAmount/expected=expectedPayment/status=status/node=stage：
```python
def test_build_snapshot_node_key_uses_stage():
    pn = {"P1": [
        {"stage": "到货款", "planDate": "2026-02-01", "receivedAmount": 600000, "expectedPayment": 1000000, "status": "部分回款"},
        {"stage": "验收款", "planDate": "2026-03-01", "receivedAmount": 0, "expectedPayment": 1000000, "status": "延期"},
    ]}
    snap = S.build_snapshot("2026-06-18", [{"projectId": "P1", "projectName": "甲"}], {}, pn)
    assert "P1|到货款#0" in snap["nodes"]
    assert snap["nodes"]["P1|到货款#0"]["actual"] == 600000
    assert snap["nodes"]["P1|验收款#0"]["status"] == "延期"
```

- [ ] **Step 2: 跑确认失败** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_snapshots.py -q` → FAIL（旧实现 `for n in raw_nodes` 遍历列表、读 nodeName）。

- [ ] **Step 3: 改 snapshots.py `build_snapshot`** —— 节点段（61-76 行）替换为遍历 payment_nodes 字典：
```python
    nodes: Dict[str, dict] = {}
    seen: Dict[tuple, int] = {}
    for pid, plist in (payment_nodes or {}).items():
        pid = str(pid)
        pname = (projs.get(pid) or {}).get("name", "")
        for n in plist:
            st = str(n.get("stage") or "")
            k = seen.get((pid, st), 0)
            seen[(pid, st)] = k + 1
            nodes[f"{pid}|{st}#{k}"] = {
                "pid": pid,
                "pname": pname,
                "node": st,
                "status": n.get("status") or "",
                "planDate": n.get("planDate") or "",
                "actual": float(n.get("receivedAmount") or 0),
                "expected": float(n.get("expectedPayment") or 0),
            }
```
签名 `raw_nodes: List[dict]` → `payment_nodes: Dict[str, List[dict]]`；删 isPaymentRelated 过滤（收款阶段节点天然回款）。`projs` 已在函数前段构建（pid→{name,...}），pname 取自它（原从 node.projectName 取，现项目名用 projs）。

- [ ] **Step 4: 改 preprocess `run_snapshot_pipeline`**（约 1009-1011）：`build_snapshot(today, final_data["projects"], final_data["projectPmis"], final_data["paymentNodes"], final_data.get("projectProfit"))`（rawNodes→paymentNodes）。

- [ ] **Step 5: 改 `tests/test_preprocess_snapshots.py`** `_final_data()`：`"rawNodes": [...]` 换 `"paymentNodes": {pid: [收款阶段节点]}`。

- [ ] **Step 6: 跑确认通过 + 全量** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_snapshots.py tests/test_preprocess_snapshots.py -q && python -m ruff check snapshots.py preprocess_data.py`。

- [ ] **Step 7: 提交**
```bash
git add snapshots.py preprocess_data.py tests/test_snapshots.py tests/test_preprocess_snapshots.py
git commit -m "feat(3e-3): snapshots 稳定键换 paymentNodes(projectId|stage)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 删 node_action + 跟进自动填充

**Files:** Modify `server.py`；Delete `tests/test_server_node_action.py`；Modify `tests/test_followup_local.py`

- [ ] **Step 1: grep 确认 node_action 仅 followup 用** `grep -rn "node_action_date_from_data\|_get_node_action_date" server.py tests/` → 仅 server.py 定义+followup 调用、test_server_node_action.py。

- [ ] **Step 2: 改 server.py** —— 删 `node_action_date_from_data`(270-278) 与 `_get_node_action_date`(280-290) 两函数；`handle_followup_create` 删自动填充段(684-690)：
```python
        # （3E-3 移除 nextActionDate 自动填充：collection_stages 无该字段，跟进两字段改手填/留空）
```
（即删那 7 行；`data` 里「节点动作完成时间」「下次跟进计划日期」若前端传了就用前端值，不再后端默认。）

- [ ] **Step 3: 测试** —— `git rm tests/test_server_node_action.py`；`tests/test_followup_local.py` 去掉对 `_get_node_action_date`/自动填充的 mock 与断言（保留记录保存断言；先 `cat` 该文件确认改点）。

- [ ] **Step 4: 跑确认 + ruff** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_followup_local.py -q && python -m ruff check server.py`。

- [ ] **Step 5: 提交**
```bash
git add server.py tests/test_followup_local.py
git rm tests/test_server_node_action.py
git commit -m "feat(3e-3): 删 node_action + 跟进 nextActionDate 自动填充(G1 抛弃)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: projects.aggregate_payment_pmis（收款阶段聚合）

**Files:** Modify `projects.py`；Test `tests/test_projects.py`

**Interfaces:** Produces `aggregate_payment_pmis(nodes: List[Dict]) -> Dict`（收款阶段节点级聚合，形态同旧 `payment`：relatedNodeCount/expectedTotal/actualTotal/remainingTotal/paymentRatio/delayedCount）。

- [ ] **Step 1: 写失败测试** `tests/test_projects.py` 追加：
```python
class TestAggregatePaymentPmis:
    def test_node_level(self):
        nodes = [
            {"expectedPayment": 1000000, "receivedAmount": 600000, "unpaidAmount": 400000, "status": "部分回款"},
            {"expectedPayment": 1000000, "receivedAmount": 0, "unpaidAmount": 1000000, "status": "延期"},
        ]
        r = P.aggregate_payment_pmis(nodes)
        assert r["relatedNodeCount"] == 2
        assert r["expectedTotal"] == 2000000
        assert r["actualTotal"] == 600000
        assert r["remainingTotal"] == 1400000
        assert r["paymentRatio"] == 0.3
        assert r["delayedCount"] == 1
    def test_empty(self):
        r = P.aggregate_payment_pmis([])
        assert r["relatedNodeCount"] == 0 and r["paymentRatio"] is None
```

- [ ] **Step 2: 跑确认失败** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py::TestAggregatePaymentPmis -q` → FAIL。

- [ ] **Step 3: 实现** `projects.py`（紧邻 `aggregate_payment` 后新增）：
```python
def aggregate_payment_pmis(nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """项目回款子域聚合(收款阶段节点级,3E-3);形态同旧 payment 以兼容前端消费方。"""
    exp = sum(float(n.get("expectedPayment") or 0) for n in nodes)
    act = sum(float(n.get("receivedAmount") or 0) for n in nodes)
    rem = sum(float(n.get("unpaidAmount") or 0) for n in nodes)
    delayed = sum(1 for n in nodes if n.get("status") == "延期")
    return {
        "relatedNodeCount": len(nodes),
        "expectedTotal": round(exp, 2),
        "actualTotal": round(act, 2),
        "remainingTotal": round(rem, 2),
        "paymentRatio": round(act / exp, 4) if exp > 0 else None,
        "delayedCount": delayed,
    }
```
（待回款取 Σunpaid 与台账一致；延期取 status=='延期'。）

- [ ] **Step 4: 跑确认通过** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q && python -m ruff check projects.py`。

- [ ] **Step 5: 提交**
```bash
git add projects.py tests/test_projects.py
git commit -m "feat(3e-3): projects.aggregate_payment_pmis(收款阶段节点级聚合)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: build_projects 脱 all_nodes + health 临时态

**Files:** Modify `projects.py`；Test `tests/test_projects.py`

**Interfaces:** Produces `build_projects(project_pmis, org_names, org_l4s, mapping, delivery_rows, org_l3_map=None)`（去 all_nodes 参数）；project dict 不再带 all_nodes 版 payment（payment 由 Task 5 的 9f 循环填）；health 的 paymentAbnormal 在 build_projects 内以 delayed_count=0 临时算、Task 5 重算。

- [ ] **Step 1: 改测试** `tests/test_projects.py` 现有 build_projects 用例：去掉 all_nodes 实参（调用改 `P.build_projects(pmis, names, l4s, mapping, delivery, l3_map)`）、去掉对 project["payment"] 由 all_nodes 来的断言（payment 改由后续填，本任务断言 build_projects 不再需要 all_nodes、health 字段存在）。`TestOrgL3Map.test_build_projects_sets_orgL3` 等同步去 all_nodes 参数。

- [ ] **Step 2: 跑确认失败** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q` → FAIL（签名仍含 all_nodes）。

- [ ] **Step 3: 改 projects.py `build_projects`**：
- 签名去 `all_nodes` 参数（保留 org_l3_map）。
- 删 `nodes_by_pid` 段(205-209)。
- 名称回填(231)：`if not name and nodes:` 这段删（无 nodes）；名称仅来自 PMIS team/customer 既有逻辑（保持其余 name 取值不变）。
- 删 `payment = aggregate_payment(nodes)`(233) 与 dict 里 `"payment": payment`(245)——payment 改由 Task 5 在 9f 循环填（schema Project.payment 有默认值，dict 暂不含即可）。
- health：原 `compute_health(pm, payment["delayedCount"])` 改 `compute_health(pm, 0)`（临时 paymentAbnormal=False，Task 5 用收款阶段 delayed 重算）。

- [ ] **Step 4: 改 `load_dept_projects`**(308) 调用：去 all_nodes 实参 `build_projects(project_pmis, names, l4s, mapping, delivery, l3_map)`；`load_dept_projects` 自身签名若含 all_nodes 形参则一并去（并改 preprocess 调用，见 Task 6 统一）。**注**：本任务先让 projects.py 自洽；preprocess 的 load_dept_projects 调用(1220 传 all_nodes)在 Task 6 改。为不破坏 import，`load_dept_projects` 形参 all_nodes 暂保留但内部不传给 build_projects（或加默认 `all_nodes=None`），Task 6 彻底去。

- [ ] **Step 5: 跑确认通过** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q && python -m ruff check projects.py` → 绿（注：preprocess 此时仍传 all_nodes 给 load_dept_projects，靠 Step4 的默认参数兼容，整管线 Task 6 后才完全自洽）。

- [ ] **Step 6: 提交**
```bash
git add projects.py tests/test_projects.py
git commit -m "feat(3e-3): build_projects 脱 all_nodes(payment/health 延后收款阶段填)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: preprocess 9f 填收款阶段 payment + 重算 health + 删 S1

**Files:** Modify `preprocess_data.py`；Test `tests/test_projects.py`（aggregate_payment_pmis+compute_health 联动，已有）或新增 preprocess 集成点

**Interfaces:** Consumes `aggregate_payment_pmis`(Task3)、`compute_health`。9f 循环后每个 dept_project 带收款阶段 `payment` + 据其 delayedCount 重算的 `health`。

- [ ] **Step 1: 改 preprocess 9f 循环**(1276-1288)：在 `payment_nodes[_pid] = _nodes` 后追加：
```python
        p["payment"] = projects_mod.aggregate_payment_pmis(_nodes)
        p["health"] = projects_mod.compute_health(project_pmis.get(_pid) or {}, p["payment"]["delayedCount"])
```
（payment 收款阶段节点级；health 用收款阶段 delayed 重算 paymentAbnormal+overall，覆盖 Task4 的临时态。）

- [ ] **Step 2: 删 S1 流水÷合同覆盖**(1255-1263 整段 `if pr_stat["provided"]: ... 口径")`)——payment.paymentRatio 现为收款阶段节点级 Σ已收÷Σ计划，不再被流水÷合同覆盖。

- [ ] **Step 3: 跑** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q && python -m ruff check preprocess_data.py`（projects 联动测试覆盖 aggregate_payment_pmis+compute_health；preprocess 集成在 Task 7 末产物冒烟验）。

- [ ] **Step 4: 提交**
```bash
git add preprocess_data.py
git commit -m "feat(3e-3): 9f 填收款阶段 payment + 重算 health;删 S1 流水÷合同覆盖" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: preprocess 换源 totalPaymentNodes / pay_projects / dirty（删 all_nodes 前置）

**Files:** Modify `preprocess_data.py`、`projects.py`(load_dept_projects 去 all_nodes)；Test `tests/test_pipeline_integration.py`

- [ ] **Step 1: pay_projects 换源**(1201-1202)：PMIS 匹配用的项目集改由 project_overview 取（不再遍历 all_nodes）：
```python
    pay_projects = [{"projectId": p.get("projectId", ""), "projectName": p.get("projectName", "")}
                    for p in project_overview]
```
（先确认 project_overview 元素有 projectId/projectName；若 PMIS 匹配对 pay_projects 内容有特定依赖，读其用法对齐。）

- [ ] **Step 2: load_dept_projects 去 all_nodes**：`projects.load_dept_projects` 签名去 all_nodes 形参；preprocess 调用(1220-1221) 改 `load_dept_projects(os.path.join(BASE_DIR,"input"), project_pmis, mapping)`。

- [ ] **Step 3: dirty 换源**(1203-1209)：actualPaymentRatio>1 脏值检测改吃 payment_nodes（收款阶段 actualRatio>1）。**注意 payment_nodes 在 9f(1273+) 才建**——把 dirty 段移到 9f 之后，遍历 payment_nodes：
```python
    dirty = []
    for _pid, _nodes in payment_nodes.items():
        for n in _nodes:
            r = n.get("actualRatio")
            if r is not None and r > 1:
                dirty.append({"type": "回款比例>1", "projectId": _pid,
                              "field": "actualRatio", "value": r})
```

- [ ] **Step 4: meta.totalPaymentNodes 换源**(1298)：`"totalPaymentNodes": sum(len(v) for v in payment_nodes.values())`（主域收款阶段节点计数；不再用 dashboard["totalPaymentNodes"]）。

- [ ] **Step 5: 跑** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py tests/test_pipeline_integration.py -q && python -m ruff check preprocess_data.py projects.py`（注：此时 all_nodes 仍构建、dashboard 仍算，整体未崩；Task 7 删）。

- [ ] **Step 6: 提交**
```bash
git add preprocess_data.py projects.py tests/test_pipeline_integration.py
git commit -m "feat(3e-3): totalPaymentNodes/pay_projects/dirty 换 paymentNodes;load_dept_projects 去 all_nodes" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: preprocess 删 all_nodes 链 + rawNodes/dashboard/summary/displayColumns 产出

**Files:** Modify `preprocess_data.py`；Test `tests/test_pipeline_integration.py`

- [ ] **Step 1: grep 证 all_nodes 已无残留消费** `grep -n "all_nodes" preprocess_data.py` → 应仅剩"待删"处（构建 1039-1060、纳管 1073-1081、followup 1185-1188、compute_dashboard/compute_tier_summary 调用、displayColumns 1143-1170）。若有 Task 1-6 未覆盖的消费点，**停止汇报 BLOCKED**。

- [ ] **Step 2: 删 all_nodes 构建段**(1047-1060 的 `=== 1. 处理...回款节点清单 ===` 含 load_sheet(SHEET_PAYMENT_NODES))；删 `all_nodes = []`(1039) 及相关初始化（保留 naguan_map/project_overview 等非 all_nodes 变量）。

- [ ] **Step 3: 删三关联循环**：纳管(1073-1081)、followup(1185-1188)（这些写 node["纳管"]/["followupRecords"]，节点不存在即无意义）。

- [ ] **Step 4: 删 dashboard/summary 计算**：删 `compute_dashboard(all_nodes)` 调用与 `final_data["dashboard"]`；删 `compute_tier_summary` 调用与 `final_data["summary"]`；删 `compute_dashboard`/`compute_tier_summary` 两函数定义(551-/674-)。`totalProjectCount` 原由 dashboard 覆盖(1096)——改 meta.totalProjects 直接 `len(project_overview)`。

- [ ] **Step 5: 删 displayColumns**：删构建段(1143-1170) 与 `final_data["displayColumns"]`。

- [ ] **Step 6: 删 rawNodes 产出**：删 `final_data` 里 `"rawNodes": all_nodes`(1302)、`"dashboard"`、`"summary"`、`"displayColumns"` 四行。

- [ ] **Step 7: 改集成测试** `tests/test_pipeline_integration.py`：删 compute_dashboard/compute_tier_summary 测试（函数已删）；其余按需。

- [ ] **Step 8: 实跑产物冒烟** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py 2>&1 | tail -5`（应正常完成）；`python -c "import json;d=json.load(open('data/analysis_data.json',encoding='utf-8'));assert 'rawNodes' not in d and 'dashboard' not in d and 'summary' not in d and 'displayColumns' not in d;print('OK totalPaymentNodes=',d['meta']['totalPaymentNodes']);print('payment 样本:',next((p['payment'] for p in d['projects'] if p.get('payment')),None))"`。

- [ ] **Step 9: 跑全量 pytest + ruff** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest -q && python -m ruff check preprocess_data.py`。

- [ ] **Step 10: 提交**
```bash
git add preprocess_data.py tests/test_pipeline_integration.py
git commit -m "feat(3e-3): 删 all_nodes 链 + rawNodes/dashboard/summary/displayColumns 产出" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: schema 删 RawNode/rawNodes/dashboard/summary/displayColumns

**Files:** Modify `schema.py`；Test `tests/test_schema.py`

- [ ] **Step 1: 改测试** `tests/test_schema.py`：最小有效数据 fixture 去 `rawNodes`/`dashboard`/`summary`/`displayColumns` 键（先 cat 看 fixture 结构）；断言 AnalysisData 校验通过且无这些字段。

- [ ] **Step 2: 跑确认失败** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_schema.py -q` → FAIL（schema 仍要求 rawNodes 等）。

- [ ] **Step 3: 改 schema.py**：删 `RawNode` 类(26-39)、`Dashboard`/`TierSummary` 类（若仅 dashboard/summary 用，先 grep 确认）、`AnalysisData` 的 `dashboard`/`summary`/`rawNodes`/`displayColumns` 字段(312-332 对应行)。**保留** `Project.payment: ProjectPayment` 与 `ProjectPayment` 类(132-138，payment 字段保留、换源不改结构)。

- [ ] **Step 4: 跑确认通过 + 全量** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest -q && python -m ruff check schema.py`。

- [ ] **Step 5: 提交**
```bash
git add schema.py tests/test_schema.py
git commit -m "feat(3e-3): schema 删 RawNode/rawNodes/dashboard/summary/displayColumns" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: gen:types + 前端占位/死 import 清理

**Files:** Modify `frontend/src/types/analysis.ts`(自动生成)、`frontend/src/stores/data.ts`、`frontend/src/lib/overview.test.ts`

- [ ] **Step 1: 重生成类型** `cd frontend && npm run gen:types`，确认 `RawNode`/`Rawnodes`/`Dashboard`/`TierSummary` 等随 schema 消失：`grep -nE "RawNode|interface Dashboard|TierSummary" src/types/analysis.ts`（应大幅减少/无）。

- [ ] **Step 2: 改 data.ts `clearBusinessData`**(33-35)：删 `rawNodes: []`、`summary: {} as any`、`dashboard: {} as any` 三行（这些键已不在 AnalysisData）；保留 projectOverview.projects 清空。更新该函数注释去掉 rawNodes/summary/dashboard。

- [ ] **Step 3: 删 overview.test.ts 死 import**(:2 `import ... RawNode`)：若该 import 已无使用则删整行（grep 该文件确认 RawNode 无引用）。

- [ ] **Step 4: typecheck** `cd frontend && npm run typecheck` → 若报 dashboardSignals/dataQuality 仍引 RawNode 的错属预期（Task 10 删），本步只要 data.ts/overview.test/types 自洽；记录剩余报错供 Task 10。

- [ ] **Step 5: 提交**
```bash
git add frontend/src/types/analysis.ts frontend/src/stores/data.ts frontend/src/lib/overview.test.ts
git commit -m "chore(3e-3): gen:types(去 RawNode 等) + data.ts 占位/死 import 清理" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 删前端 RawNode 死链 + 核对 payment 4 消费方

**Files:** Delete `frontend/src/lib/dashboardSignals.ts`(+test)、`frontend/src/lib/dataQuality.ts`(+test)、`frontend/src/components/DataQualityTable.vue`(+test 若有)；Modify 4 个 payment 消费方测试（核对口径）

- [ ] **Step 1: grep 证三死链零活消费**（逐个，活消费=非自身/非 .test 的 .vue/.ts）：
```bash
cd frontend
grep -rnE "dashboardSignals" src --include=*.vue --include=*.ts | grep -vE "dashboardSignals\.(ts|test\.ts):"
grep -rnE "dataQualityRows|dataQualityDrill|QualityRow|DATA_CHECKS|from '@/lib/dataQuality'" src --include=*.vue --include=*.ts | grep -vE "dataQuality\.(ts|test\.ts):"
grep -rnE "DataQualityTable" src --include=*.vue --include=*.ts | grep -vE "DataQualityTable\.(vue|test\.ts):"
```
预期三者均无输出（全死）。若某类型(如 QualityRow)仍被活文件引，则该文件保留该类型、只删 RawNode 函数——汇报具体命中。

- [ ] **Step 2: 删死链** `git rm src/lib/dashboardSignals.ts src/lib/dashboardSignals.test.ts src/lib/dataQuality.ts src/lib/dataQuality.test.ts src/components/DataQualityTable.vue`（DataQualityTable.test.ts 若存在一并 rm）。`riskGroups.ts` 注释里提及 dashboardSignals 的那句顺手改/删（非功能）。

- [ ] **Step 3: 核对 4 个 payment 消费方口径**（payment 已换收款阶段节点级，值会变）—— 跑这些文件相关测试，按收款阶段口径调断言（只调因口径变化而失真的数值断言，不弱化结构断言）：
```bash
cd frontend && npx vitest run src/lib/overview.test.ts src/lib/projectList.test.ts src/lib/projectPivot.test.ts src/views/ProjectDetailView.test.ts
```
若某断言因 payment 口径变化失败：fixture 的 payment 字段改收款阶段口径值（expectedTotal/actualTotal/paymentRatio=Σ已收÷Σ计划/delayedCount），或 seed 提供 paymentNodes 让 payment 真实驱动；保留断言意图。**注**：overview.ts/projectList.ts/projectPivot.ts 仍读 `p.payment`，本任务不改其实现，仅核对测试。

- [ ] **Step 4: 全量 typecheck + vitest + build** `cd frontend && npm run typecheck && npx vitest run && npm run build` → 全绿。

- [ ] **Step 5: 提交**
```bash
git add frontend/src/lib/riskGroups.ts frontend/src/lib/overview.test.ts frontend/src/lib/projectList.test.ts frontend/src/lib/projectPivot.test.ts frontend/src/views/ProjectDetailView.test.ts
git rm frontend/src/lib/dashboardSignals.ts frontend/src/lib/dashboardSignals.test.ts frontend/src/lib/dataQuality.ts frontend/src/lib/dataQuality.test.ts frontend/src/components/DataQualityTable.vue
git commit -m "feat(3e-3): 删前端 RawNode 死链(dashboardSignals/dataQuality/DataQualityTable) + 核对 payment 口径" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
（仅 add/rm 实际改动文件；DataQualityTable.test.ts 等按实际存在与否。）

---

### Task 11: 版本 V1.6.9 + PROGRESS + 快照运维 + 全量验证

**Files:** Modify `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 升版本** `frontend/src/version.ts`：`APP_VERSION = 'V1.6.9'`、`RELEASE_DATE = '2026-06-18'`。

- [ ] **Step 2: PROGRESS.md** —— 「全局下线 rawNodes 程序」⑤ 下记 3E-3 + **整体收官**：
```markdown
**3E-3 后端移除 rawNodes（spec/plan 2026-06-18-3E-3-rawnodes-backend-removal，V1.6.9，feat/3e-3-backend-removal）**：完全 purge——截停 WPS 回款节点 sheet、删 all_nodes 链 + rawNodes/dashboard/summary/displayColumns 产出 + compute_dashboard/compute_tier_summary + RawNode 类型 + 前端死链(dashboardSignals/dataQuality/DataQualityTable)。换源：snapshots 稳定键→projectId|stage 吃 paymentNodes；totalPaymentNodes→Σ paymentNodes 计数；pay_projects→project_overview；dirty→paymentNodes actualRatio>1;projects.payment 保留但 aggregate_payment_pmis 换收款阶段节点级(Σ已收÷Σ计划,删 S1 流水÷合同覆盖),4 前端消费方(概览KPI/清单/透视/详情页)不动自动得新口径;health.paymentAbnormal 用收款阶段 delayed 重算。G1:node_action+跟进自动填充抛弃。**⚠️ 运维:上线前已清空 data/snapshots/ 重建基线**。verify.sh 全绿。**rawNodes 下线程序整体收官(3A-3E 全数合并 master)**。
```

- [ ] **Step 3: 快照运维（G2 执行）** —— 清空旧基线，避免假事件：
```bash
cd "/c/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
rm -f data/snapshots/*.json data/events.json 2>/dev/null || true
```
（说明：下次 preprocess 以收款阶段重建基线、不出假事件。若 data/snapshots/ 为目录结构按实际清。）

- [ ] **Step 4: 全量 verify.sh** `bash verify.sh` → python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 5: 产物 + 手验** `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py`（产物无 rawNodes/dashboard/summary/displayColumns、快照管线不报错）；手验治理页"节点行数"(主域数)、详情页回款完成率(收款阶段)、跟进新建(两字段不自动填)、概览 KPI/清单/透视回款达成率合理。

- [ ] **Step 6: 提交**
```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(3e-3): 版本 V1.6.9 + PROGRESS(rawNodes 下线程序收官) + 快照基线重建" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- 11 任务全部提交；`bash verify.sh` 全绿；产物无 rawNodes/dashboard/summary/displayColumns、schema 通过。
- 后端不再加载 WPS 回款节点 sheet/不构建 all_nodes；snapshots/totalPaymentNodes/pay_projects/dirty/projects.payment 全收款阶段口径；node_action+跟进自动填充已删。
- `RawNode` 类型与前端死链(dashboardSignals/dataQuality/DataQualityTable)清除；`Project.payment` 保留(收款阶段口径)，4 前端消费方口径已核对。
- 快照基线已清空重建（G2）。
- 版本 V1.6.9；PROGRESS 记 3E-3 + 程序收官。
- 未触碰：仓库根未跟踪文件；收款阶段口径/计算；已换源页面（除 payment 口径自动更新）。
