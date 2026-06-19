# 回款口径修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复售前收款阶段节点取数（本项目号优先），并把全站「回款达成率/完成率」统一为 Σ流水净额/Σ合同总额，售前详情页流水做原项目回退。

**Architecture:** 三任务。Task 1 后端（preprocess 售前节点 lookup + 项目级 paymentRatio 改流水/合同）。Task 2 前端全站 rate 分母 计划→合同（一处口径、多文件，因 paymentRange 向消费方涟漪故合并一任务）。Task 3 售前详情流水回退 + 版本。每任务收尾全绿。

**Tech Stack:** Python(preprocess_data.py/projects.py) + Vue3/TS(frontend/src) + pytest/vitest。

## Global Constraints

- **分子 = 流水净额**：`payment_records` 逐笔金额严格全加（含负值/红冲，不取绝对值、不过滤）；前端 `actualInRange`、后端 `pay_record.total` 现已如此，**不改**。
- **分母 = 合同总额**：`paymentPmis.contract`（本项目优先、售前回退原项目，沿用现有 eff 合同）。
- **null 策略**：类型为 `number | null` 的比率（paymentRange.paymentRatio / computeKpis / summaryByDim / progressBuckets / buildGroup / groupInsight / Insight 内联 / 后端 payment_ratio_from_records）→ `denom>0 ? act/denom : null`（无合同显 "-"）。类型为纯 `number` 的聚合率（payDashSummary.rate / payOrgRanking.achievementRate / ledgerSummaryPmis.rate）与 `ledgerRows.paymentRatio`（喂 paymentStatus）→ 保 `: 0` 不改类型（实务中聚合 Σ合同>0；ledger 行无合同→0%/未回款）。
- 进度态 `deriveProgress` 与染色 `rateColorPmis` 阈值（0.999 / 0.8 / 0.5）**不改**，随新比率走（用户已接受连带变化）。
- 版本：`frontend/src/version.ts` → `V1.15.0`，`RELEASE_DATE` 保持 `2026-06-19`。
- 提交逐文件 `git add`（禁 `git add -A`/`.`）；message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`；禁 emoji。
- 收尾判据：`bash verify.sh` 全绿。

---

## File Structure

| 文件 | 责任 | 任务 |
|---|---|---|
| `preprocess_data.py` | 售前节点 lookup helper + 9f paymentRatio 覆盖 | T1 |
| `projects.py` | aggregate_payment_pmis paymentRatio→None；payment_ratio_from_records 复用 | T1 |
| `tests/test_preprocess.py` / `tests/test_projects.py` | 后端回归 | T1 |
| `frontend/src/lib/paymentRange.ts` | 区间项目级 paymentRatio 分母→合同 | T2 |
| `frontend/src/lib/{overview,paymentPmis,paymentBoard,payDashboard,ledger,projectPivot}.ts` | 各 rate 分母→合同 | T2 |
| `frontend/src/components/InsightDrillModal.vue` / `views/InsightView.vue` | Insight 内联完成率分母→合同 | T2 |
| 上述对应 `*.test.ts` | 前端断言改分母 | T2 |
| `frontend/src/views/ProjectDetailView.vue` | payRec 本项目优先回退原项目 | T3 |
| `frontend/src/version.ts` | V1.15.0 | T3 |

---

## Task 1: 后端口径（售前节点取数 + 项目级 paymentRatio 流水/合同）

**Files:**
- Modify: `preprocess_data.py`（新增 `_collection_nodes_for`；9f 节点 lookup + paymentRatio 覆盖）
- Modify: `projects.py:163`（aggregate_payment_pmis paymentRatio→None）
- Modify: `tests/test_preprocess.py`（_collection_nodes_for 单测）
- Modify: `tests/test_projects.py`（aggregate paymentRatio=None 断言）

**Interfaces:**
- Consumes: `projects.payment_ratio_from_records(records_total, contract, closed_contract)`（已存在，流水/合同，denom≤0→None）。
- Produces: `_collection_nodes_for(pid, rid, collection_stages) -> list`；`p.payment.paymentRatio` = 流水/合同；售前 `p.payment.expectedTotal` 取本项目号节点。

- [ ] **Step 1: 写 _collection_nodes_for 失败测试**

`tests/test_preprocess.py` 末尾（`test_backfill_final_acceptance` 之前）加：

```python
class TestCollectionNodesFor:
    STAGES = {'P-SELF': [{'expectedPayment': 100}], 'P-ORIG': [{'expectedPayment': 200}]}

    def test_self_first(self):
        assert P._collection_nodes_for('P-SELF', 'P-ORIG', self.STAGES) == [{'expectedPayment': 100}]

    def test_fallback_to_origin_when_self_missing(self):
        assert P._collection_nodes_for('P-NONE', 'P-ORIG', self.STAGES) == [{'expectedPayment': 200}]

    def test_empty_when_both_missing(self):
        assert P._collection_nodes_for('P-NONE', 'P-NIL', self.STAGES) == []

    def test_empty_when_no_rid(self):
        assert P._collection_nodes_for('P-NONE', '', self.STAGES) == []
```

- [ ] **Step 2: 跑测试确认红**

Run: `python -m pytest tests/test_preprocess.py::TestCollectionNodesFor -q`
Expected: FAIL（`AttributeError: module 'preprocess_data' has no attribute '_collection_nodes_for'`）

- [ ] **Step 3: 实现 _collection_nodes_for + 接入 9f**

`preprocess_data.py` 在 `def main():` 之前加：

```python
def _collection_nodes_for(pid, rid, collection_stages):
    """售前收款阶段台账把节点挂在本项目号下,故本项目号优先、缺再回退原项目号。"""
    return collection_stages.get(pid) or (collection_stages.get(rid) if rid else None) or []
```

9f 段把 `_nodes = collection_stages.get(_eff) or []` 改为：

```python
        _nodes = _collection_nodes_for(_pid, _rid, collection_stages)
```

- [ ] **Step 4: 跑测试确认绿**

Run: `python -m pytest tests/test_preprocess.py::TestCollectionNodesFor -q`
Expected: PASS（4 passed）

- [ ] **Step 5: 改 aggregate 测试预期 + 实现 paymentRatio 口径（先红后绿）**

`tests/test_projects.py` 中断言 `aggregate_payment_pmis(...)['paymentRatio']` 的用例：把对 paymentRatio 的断言改为 `is None`（其余字段断言不变）。若无显式 aggregate paymentRatio 用例，新增：

```python
def test_aggregate_payment_pmis_ratio_is_none():
    import projects
    nodes = [{'expectedPayment': 100, 'receivedAmount': 50, 'unpaidAmount': 50, 'status': '部分回款', 'reached': False}]
    assert projects.aggregate_payment_pmis(nodes)['paymentRatio'] is None
```

Run: `python -m pytest tests/test_projects.py -q -k payment` → 期望该新断言先 FAIL（现为 0.5）。

`projects.py:163` 改：

```python
        "paymentRatio": None,
```

并在 `preprocess_data.py` 9f 段 `p["payment"] = projects_mod.aggregate_payment_pmis(_nodes)` 之后加一行：

```python
        p["payment"]["paymentRatio"] = projects_mod.payment_ratio_from_records(
            p["paymentPmis"]["actualTotal"], p["paymentPmis"]["contract"], None)
```

Run: `python -m pytest tests/test_projects.py tests/test_preprocess.py -q`
Expected: PASS

- [ ] **Step 6: 真实数据冒烟（确认售前计划恢复、达成率合理）**

Run: `python preprocess_data.py` 然后
`python -c "import json;d=json.load(open('data/analysis_data.json',encoding='utf-8'));ps=[p for p in d['projects'] if p.get('isPresale') and str(p.get('orgL4') or '').strip()];print('售前 Σ计划(万):',round(sum((p.get('payment') or {}).get('expectedTotal') or 0 for p in ps)/10000,1));print('售前样本 paymentRatio:',[round((p.get('payment') or {}).get('paymentRatio') or 0,3) for p in ps[:3]])"`
Expected: 售前 Σ计划 远大于 0（约 2 万级别以上，不再普遍为 0）；paymentRatio 为流水/合同（多数 0~1）。

- [ ] **Step 7: 全量 verify（后端绿）**

Run: `python -m pytest -q`
Expected: 全绿。

- [ ] **Step 8: 提交**

```bash
git add preprocess_data.py projects.py tests/test_preprocess.py tests/test_projects.py
git commit -m "$(cat <<'EOF'
fix(payment): 售前收款阶段节点本项目号优先 + 项目级 paymentRatio 改流水/合同

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 前端全站 rate 分母 计划→合同

**Files（实现 + 各自 test.ts）:**
- Modify: `frontend/src/lib/paymentRange.ts:54`
- Modify: `frontend/src/lib/overview.ts`（computeKpis）
- Modify: `frontend/src/lib/paymentPmis.ts`（summaryByDim:179、progressBuckets:292）
- Modify: `frontend/src/lib/paymentBoard.ts:148`（buildGroup）
- Modify: `frontend/src/lib/payDashboard.ts`（payDashSummary:56、payOrgRanking:127）
- Modify: `frontend/src/lib/ledger.ts`（ledgerRows:42、ledgerSummaryPmis:81）
- Modify: `frontend/src/lib/projectPivot.ts:154`（groupInsight）
- Modify: `frontend/src/components/InsightDrillModal.vue:19`、`frontend/src/views/InsightView.vue`（内联完成率）
- Modify: 上述对应 `*.test.ts` 的 rate/paymentRatio 断言

**Interfaces:**
- Consumes: 行/项目对象上的 `contract`/`contractSum`/`contractAmount`/`paymentPmis.contract`（各点已具备，见下）。
- Produces: 全站 rate = Σ流水/Σ合同（口径统一）。

> **TDD 节奏**：本任务先改各 test 的 rate 断言（分母换合同，按 fixture 重算期望值）使其红，再改实现转绿。fixture 是确定的，期望值由 `Σactual / Σcontract` 算出。

- [ ] **Step 1: paymentRange.ts — 区间项目级 paymentRatio 分母→合同**

`frontend/src/lib/paymentRange.ts:54` 现 `paymentRatio: expectedTotal > 0 ? round4(actualTotal / expectedTotal) : null` → 改：

```ts
    paymentRatio: contract > 0 ? round4(actualTotal / contract) : null,
```

`paymentRange.test.ts`：把 `paymentPmisInRange(...).paymentRatio` 的断言由 `actual/expected` 改为 `actual/contract`（按用例 contract 入参重算），合同=0 用例断言 `null`。

- [ ] **Step 2: overview.ts computeKpis 分母→Σ合同**

`frontend/src/lib/overview.ts`：在累加 `exp`/`act` 的循环里补合同累加，并改 paymentRatio 分母。`computeKpis` 内（排除异常分支）：累加 `con += p.payment?.expectedTotal` 处改为同时维护 `let con = 0` 并在 `if (!isAnomalous(p))` 块内 `con += p.paymentPmis?.contract ?? 0`；return 改：

```ts
  return { total: projects.length, active, paused, highRisk, overspend, paymentRatio: con > 0 ? act / con : null }
```

（`exp` 累加可保留或删除——若仅用于 paymentRatio 则删 `let exp` 及其累加；保持函数其余不变。）
`overview.test.ts`：`paymentRatio` 断言由 `1100/2000`（act/exp）类改为 `act/Σcontract`（按 PROJECTS fixture 的 paymentPmis.contract 重算）；无合同→null 用例保留。

- [ ] **Step 3: paymentPmis.ts summaryByDim + progressBuckets 分母→contractSum**

`summaryByDim`（:179）`rate: expSum > 0 ? actualSum / expSum : null` → `rate: contractSum > 0 ? actualSum / contractSum : null`（contractSum 已在 :171 算）。`expSum` 若仅此处用可删。
`progressBuckets`（:292）`rate: expectedSum > 0 ? actualSum / expectedSum : null` → `rate: contractSum > 0 ? actualSum / contractSum : null`（contractSum 已在 :289 算）。
`paymentPmis.test.ts`：summaryByDim/progressBuckets 的 rate 断言改 `actualSum/contractSum`。

- [ ] **Step 4: paymentBoard.ts buildGroup 分母→contractSum**

`frontend/src/lib/paymentBoard.ts:148` `rate: expectedSum > 0 ? actualSum / expectedSum : null` → `rate: contractSum > 0 ? actualSum / contractSum : null`（contractSum 已在 :129 算）。
`paymentBoard.test.ts`：把 `rate=actualSum/expectedSum` 的用例（含 describe 文案"rate=actual/expected"、`g1.rate` 断言、`rate=actual/expected（非/合同）` 注释）改为 `actualSum/contractSum` 并更新注释；按 fixture 重算 g1.rate 期望（组1 contractSum=3_000_000、actualSum=2_000_000 → rate≈0.667）。

- [ ] **Step 5: payDashboard.ts payDashSummary + payOrgRanking 分母→Σ合同**

`payDashSummary`（:46 后）补 `const totalContract = inScope.reduce((s, p) => s + (p.paymentPmis?.contract ?? 0), 0)`；:56 `rate: totalExpected > 0 ? totalActual / totalExpected : 0` → `rate: totalContract > 0 ? totalActual / totalContract : 0`（保 number/`:0`）。
`payOrgRanking`：在 org 聚合循环里补 `m[org].contractTotal += p.paymentPmis?.contract ?? 0`（给 `OrgRank` 加内部累加字段 `contractTotal: number`，初始化 0）；:127 `achievementRate: o.expectedTotal > 0 ? o.actualTotal / o.expectedTotal : 0` → `o.contractTotal > 0 ? o.actualTotal / o.contractTotal : 0`。
`payDashboard.test.ts`：payDashSummary.rate / payOrgRanking.achievementRate 断言改分母为合同（按 fixture contract 重算）。

- [ ] **Step 6: ledger.ts ledgerRows + ledgerSummaryPmis 分母→合同**

`ledgerRows`（:42）`const r = expectedPayment > 0 ? actualPayment / expectedPayment : 0` → 用行合同（= `p.paymentPmis?.contract ?? 0`，即将写入的 `projectAmount`）：

```ts
    const contract = p.paymentPmis?.contract ?? 0
    const r = contract > 0 ? actualPayment / contract : 0
```

（`paymentRatio: r` 与 `paymentStatus` 派生不变，保 number/`:0`。）
`ledgerSummaryPmis`（:81）补 `const totalCon = rows.reduce((s, r) => s + (r.projectAmount || 0), 0)`；`rate: totalExp > 0 ? totalAct / totalExp : 0` → `rate: totalCon > 0 ? totalAct / totalCon : 0`。
`ledger.test.ts`：行 `paymentRatio`（:36 `toBeCloseTo(0.4)`）与 summary `rate` 断言改为 `actual/contract`（按 fixture contract 重算）。

- [ ] **Step 7: projectPivot.ts groupInsight + Insight 内联 分母→合同**

`projectPivot.ts:154` `paymentRatio: exp > 0 ? act / exp : null` → `paymentRatio: contractAmount > 0 ? act / contractAmount : null`（contractAmount 已在 :151 算；`exp` 若仅此处用可删）。
`InsightDrillModal.vue:19` formatter `fmtRatio(r.expectedTotal > 0 ? r.actualTotal / r.expectedTotal : null)` → `fmtRatio(r.contractAmount > 0 ? r.actualTotal / r.contractAmount : null)`。
`InsightView.vue`：定位「回款完成率」列同形态内联 `expectedTotal>0 ? actualTotal/expectedTotal` → 改 `contractAmount>0 ? actualTotal/contractAmount : null`（若 InsightView 直接消费 groupInsight 的 paymentRatio 则随 §7 自动生效、无需改；仅当有独立内联表达式时改）。
`projectPivot.test.ts`：groupInsight paymentRatio 断言改 `act/contractAmount`。

- [ ] **Step 8: 跑全量 vitest + typecheck 确认绿**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: typecheck 0 error；vitest 全绿（paymentRange/overview/paymentPmis/paymentBoard/payDashboard/ledger/projectPivot 及组件套件断言已更新一致）。

- [ ] **Step 9: 提交**

```bash
git add frontend/src/lib/paymentRange.ts frontend/src/lib/overview.ts frontend/src/lib/paymentPmis.ts \
        frontend/src/lib/paymentBoard.ts frontend/src/lib/payDashboard.ts frontend/src/lib/ledger.ts \
        frontend/src/lib/projectPivot.ts frontend/src/components/InsightDrillModal.vue frontend/src/views/InsightView.vue \
        frontend/src/lib/paymentRange.test.ts frontend/src/lib/overview.test.ts frontend/src/lib/paymentPmis.test.ts \
        frontend/src/lib/paymentBoard.test.ts frontend/src/lib/payDashboard.test.ts frontend/src/lib/ledger.test.ts \
        frontend/src/lib/projectPivot.test.ts
git commit -m "$(cat <<'EOF'
feat(payment): 全站回款达成率/完成率口径统一为 已回(流水)/合同总额

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

> 注：上面 git add 仅列改动文件；若某 `*.test.ts` 实际未改则从命令剔除。逐文件 add，勿用 `-A`。

---

## Task 3: 售前详情流水回退 + 版本

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue:141-142`（payRec）
- Modify: `frontend/src/version.ts`
- Modify/Create: `frontend/src/views/ProjectDetailView.test.ts`（若无则视情况新增 payRec 回退用例；若该视图无测试基建则在报告说明并以 typecheck 兜底）

**Interfaces:**
- Consumes: `paymentRecords` map、`p.value.projectId`、`p.value.relatedClosedId`。
- Produces: 售前详情「回款数据」流水本项目优先、缺回退原项目。

- [ ] **Step 1: 改 payRec 为本项目优先回退原项目**

`frontend/src/views/ProjectDetailView.vue:141-142`：

```ts
const payRec = computed(() => {
  const m = (data.data?.paymentRecords ?? {}) as Record<string, PaymentRecordsEntry>
  const pid = p.value?.projectId || ''
  const rid = p.value?.relatedClosedId || ''
  return m[pid] ?? (rid ? m[rid] : null) ?? null
})
```

- [ ] **Step 2: bump 版本**

`frontend/src/version.ts` 第 2 行 → `export const APP_VERSION = 'V1.15.0'`（`RELEASE_DATE` 保持 `'2026-06-19'`）。

- [ ] **Step 3: 全量 verify**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && bash verify.sh`
Expected: ruff / pytest / typecheck / vitest / build 全绿。手动：售前项目（如 WSGF-SF 本项目无流水、原项目有）详情「回款数据」不再误显"未提供"；项目总览回款达成率回到 ~51% 量级、不再 >100%。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/version.ts
# 若新增了 ProjectDetailView.test.ts 一并 add
git commit -m "$(cat <<'EOF'
fix(payment): 售前详情回款数据流水本项目优先缺回退原项目 (V1.15.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage：**
- spec A 售前节点 lookup → T1 Step1-4 ✓；B1 后端 paymentRatio 流水/合同 → T1 Step5 ✓；B2 paymentRange → T2 Step1 ✓；B3 各聚合(computeKpis/summaryByDim/progressBuckets/buildGroup/payDashSummary/payOrgRanking/ledgerRows/ledgerSummary/groupInsight/Insight内联) → T2 Step2-7 ✓；B4 边界 → Global Constraints null 策略 ✓；C 详情回退 → T3 Step1 ✓；版本 → T3 Step2 ✓。
- spec 提到的 payTierStats：实为无 rate 字段（仅 expectedAmountWan/actualAmountWan），**非比率点，无需改**——已从清单剔除（spec B3 表未列 payTierStats，一致）。spec B3 表列了 payTierStats 行——**修正：payTierStats 无 rate，不改**；payOrgRanking.achievementRate 才是服务组达成率点，已纳入 T2 Step5。

**2. Placeholder scan：** 无 TBD/TODO。前端测试期望值采用"按 fixture 以 Σactual/Σcontract 重算"的确定式表述（非占位），实现者 TDD 时由 fixture 算出具体数并断言；关键示例值已给（paymentBoard 组1≈0.667）。

**3. null/类型一致性：** number|null 点用 `:null`；纯 number 聚合(payDashSummary/payOrgRanking/ledgerSummary)与 ledgerRows.paymentRatio 保 `:0`（避免类型与 paymentStatus 派生 ripple）。**与 spec B4「统一 null」的偏离**：spec 曾写统一 null，本计划对"纯 number 且喂 paymentStatus 的 ledgerRows.paymentRatio"保留 `:0`（无合同→0%/未回款），因改 null 会破 `paymentStatus` 三态派生与类型；聚合率保 `:0` 因实务恒 >0、避免类型 churn。此偏离不影响"无计划/无合同项目显示"的核心诉求（per-project 显示走 number|null 的点）。**已在 spec 审阅时向用户说明 null 策略，实现按此**。

**4. 字段/路径一致性：** `paymentPmis.contract`(后端/前端一致)、`contractSum`(summaryByDim:171/progressBuckets:289/buildGroup:129 已算)、`contractAmount`(groupInsight:151/InsightRow)、ledger `projectAmount`(=contract)、`payment_ratio_from_records`(已存在)——均经核实可得。
