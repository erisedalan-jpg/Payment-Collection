# 回款口径修正 设计：售前节点取数 + 全站 已回/合同 + 售前详情流水回退

**日期:** 2026-06-19
**版本:** V1.15.0（Y 级：跨页回款口径修正——回款达成率/完成率全站改分母）
**范围:** 三件一体。**A** 修 preprocess 售前收款阶段节点取数（找回被丢弃的售前计划节点）；**B** 全站「回款达成率/完成率/paymentRatio」统一口径为 **Σ流水净额(含负) / Σ合同总额**（分子各处已是流水，主要改分母 计划→合同 + 后端项目级 paymentRatio 对齐）；**C** 售前详情页「回款数据」流水做本项目优先、缺回退原项目。纯前端 + 后端 preprocess/projects；不改 schema 结构。

> 根因背景：清空数据→重算后回款达成率 103% 失真。已查实：① 后端 9f 对 `fromOrigin` 售前按**原项目号**查 collection_stages 节点，而台账把售前节点挂在**本项目号**下 → 207/207 售前的 ~19429 万计划节点被计 0、达成率虚高；② 现口径分母用"计划节点额"，对售前/数据缺口项目失真；用户钦定改为「Σ流水/Σ合同」更符合预期。

---

## 0. 已敲定决策（与用户逐项确认）
1. **分子 = 流水净额**：`payment_records.csv` 逐笔金额**严格全加（含负值/红冲，不取绝对值、不过滤）**。实测 595 笔含 9 笔负值(−239.1 万)，净额 20721.5 万。
2. **分母 = 合同总额**：`paymentPmis.contract`（本项目优先、售前回退原项目，沿用现有 eff 合同来源）。
3. **范围 = 全站统一**：项目总览 KPI / /payment 六卡 / L4 表 / 多维看板 / 台账 / Insight 透视 / 项目清单 / 详情抽屉 全部一致。
4. **合同≤0 → rate=null**（前端显 "-"，沿用现有 null 处理，防除零）。
5. **进度态 / 完成率染色阈值不变**：`deriveProgress`(≥0.999 已全额/>0 部分/≤0 未回款) 与 `rateColorPmis`(≥0.8 绿/≥0.5 黄/<0.5 红) 继续作用在新比率上；因合同通常 > 计划节点额，比率整体走低、进度桶/颜色右移变红——**用户已接受为口径统一的自然结果**。
6. **A、B、C 全做**。

---

## A. 售前 collection_stages 节点取数（`preprocess_data.py` 9f 段，约 902-916 行）

现状（节点与合同都用 `_eff`）：
```python
        _eff, _from_origin = _pid, False
        if not _pmis_contract(_pid) and _rid and _pmis_contract(_rid):
            _eff, _from_origin = _rid, True
        _rec = payment_records.get(_pid) or (payment_records.get(_rid) if _rid else None)
        _nodes = collection_stages.get(_eff) or []
```
**改动**：节点 lookup 改为**本项目号优先、缺回退原项目号**（与流水同策略）；合同 `_pmis_contract(_eff)` 与 `_rec` 不动。为可单测，抽纯函数 `_collection_nodes_for`（置于 `preprocess_data.py`）：
```python
def _collection_nodes_for(pid, rid, collection_stages):
    """售前收款阶段台账把节点挂在本项目号下,故本项目号优先、缺再回退原项目号。"""
    return collection_stages.get(pid) or (collection_stages.get(rid) if rid else None) or []
```
9f 段把 `_nodes = collection_stages.get(_eff) or []` 改为：
```python
        _nodes = _collection_nodes_for(_pid, _rid, collection_stages)
```
- `_eff`/`_from_origin` 仍用于合同（`build_payment_summary(_pmis_contract(_eff), _nodes, _rec)`）与 fromOrigin 标记，**不变**。
- 效果：售前本项目（WSGF-SF，台账有节点）的计划节点不再被丢弃；售前 `payment.expectedTotal`/`delayedCount` 恢复真实值。

---

## B. 全站口径 = Σ流水净额 / Σ合同

### B1. 后端项目级 paymentRatio（`projects.py` + `preprocess_data.py`）
为避免"算节点口径又被覆盖"的死计算，把 paymentRatio 的**唯一计算点**放到 9f：
- `aggregate_payment_pmis`（`projects.py:163`）`"paymentRatio": round(act/exp,4) if exp>0 else None` → `"paymentRatio": None`（占位；项目级口径不在此算，由调用方设；其余字段不变）。`aggregate_payment_pmis` 仅 preprocess:9f 与 test_projects 消费（Explore 已核），改动安全。
- `preprocess_data.py` 9f 段，`p["payment"] = projects_mod.aggregate_payment_pmis(_nodes)` 之后加一行，用**已存在的** `payment_ratio_from_records`（流水/合同）设置项目级完成率：
```python
        p["payment"]["paymentRatio"] = projects_mod.payment_ratio_from_records(
            p["paymentPmis"]["actualTotal"], p["paymentPmis"]["contract"], None)
```
（`paymentPmis.actualTotal` = 流水净额；`paymentPmis.contract` = eff 合同。`payment_ratio_from_records` 已实现：denom≤0→None。）
- 消费方 `p.payment.paymentRatio`：项目清单(`projectList.ts:20`)、详情(`ProjectDetailView.vue:80`)、抽屉(`ProjectDetailDrawer.vue:61`)、`deriveProgress`(`paymentPmis.ts:226`) 自动得新口径，断言随之改。
- `payment.actualTotal`（节点已收汇总）字段**不动**（非本次口径目标；前端展示的"已回款金额"走流水，见下）。

### B2. 区间项目级（`frontend/src/lib/paymentRange.ts:54`）
```ts
    paymentRatio: expectedTotal > 0 ? round4(actualTotal / expectedTotal) : null,
```
→ 分母改 `contract`（入参已有），分子 `actualTotal`(流水) 不变：
```ts
    paymentRatio: contract > 0 ? round4(actualTotal / contract) : null,
```
此点覆盖 board/L4/projects/plan/risk/ledger 全部经 `projectPaymentRows`/`paymentPmisInRange` 的项目级比率。

### B3. 聚合 rate（分子 Σ流水 不变，分母 Σexpected → Σcontract）
| 文件:行 | 现状 | 改为 |
|---|---|---|
| `overview.ts:46` computeKpis | `exp>0 ? act/exp` (exp=ΣexpectedTotal) | 累加 `con += paymentPmis.contract`（排除异常），`con>0 ? act/con : null` |
| `paymentPmis.ts:179` summaryByDim | `expSum>0 ? actualSum/expSum` | `contractSum>0 ? actualSum/contractSum`（contractSum 已在该函数聚合） |
| `paymentPmis.ts:292` progressBuckets | `expectedSum>0 ? actualSum/expectedSum` | `contractSum>0 ? actualSum/contractSum`（需在桶内累加 contractSum） |
| `paymentBoard.ts:148` buildGroup | `expectedSum>0 ? actualSum/expectedSum` | `contractSum>0 ? actualSum/contractSum`（contractSum 已在 buildGroup 算） |
| `payDashboard.ts` payDashSummary rate | `totalExpected>0 ? totalActual/totalExpected` | 分母改 Σcontract（累加项目 contract） |
| `payDashboard.ts` payTierStats rate | 同上按档 | 分母改该档 Σcontract |
| `ledger.ts:42` ledgerRows r | `expectedPayment>0 ? actualPayment/expectedPayment` | `contract>0 ? actualPayment/contract`（行级 contract 来自项目 paymentPmis.contract，需在 ledgerRows 取到） |
| `ledger.ts:81` ledgerSummary rate | `totalExp>0 ? totalAct/totalExp` | 分母改 Σcontract（汇总累加 contract） |
| `projectPivot.ts:154` groupInsight rate | `exp>0 ? act/exp` | `contractSum>0 ? act/contractSum`（Insight 项目透视回款完成率列；需在分桶累加 contract） |
| `InsightView.vue` / `InsightDrillModal.vue` 内联 `expectedTotal>0 ? actualTotal/expectedTotal` | 同上 | 改分母为 contract（行/项目级） |

> 实现要点：凡聚合点都需要"Σ合同"。多数 group 结构已带 `contractSum`（summaryByDim/buildGroup），直接换；computeKpis/payDashSummary/payTierStats/ledgerSummary/groupInsight 需补一处 `contract` 累加。行级（ledgerRows/InsightDrill）需把项目 `paymentPmis.contract` 取到行上。

### B4. 边界
- 合同 ≤ 0（或缺）→ rate = `null`（显 "-"）。所有点统一此判别（沿用现有 `>0 ? : null/0` 形态，注意 ledger/payDash 现用 `:0`，改为 `: null` 以与"无合同"语义一致；若组件不接受 null 则保 `:0` 并在 spec 标注——**统一为 null**，组件 `fmtRatio(null)`→"-" 已支持）。
- 分子流水**净额含负**：`actualInRange`/后端 total 现已严格全加，**不改**。

---

## C. 售前详情页流水回退（`frontend/src/views/ProjectDetailView.vue:141-142`）
现状：
```ts
const payRec = computed(() =>
  ((data.data?.paymentRecords ?? {}) as Record<string, PaymentRecordsEntry>)[p.value?.projectId || ''] ?? null)
```
→ 本项目优先、缺回退原项目号（`relatedClosedId`），与 `build_payment_summary` 的 `_rec` 口径一致：
```ts
const payRec = computed(() => {
  const m = (data.data?.paymentRecords ?? {}) as Record<string, PaymentRecordsEntry>
  const pid = p.value?.projectId || ''
  const rid = p.value?.relatedClosedId || ''
  return m[pid] ?? (rid ? m[rid] : null) ?? null
})
```
- 表格仍 `payRec.records ?? []` 全量展示（含负值原样）；页内"售前取原项目"note 即名副其实。

---

## 4. 测试

### 后端
- `tests/test_projects.py`：① `aggregate_payment_pmis` 用例改为断言 `paymentRatio is None`（不再自算节点口径），其余字段(expectedTotal/actualTotal/delayedCount 等)断言不变；② `payment_ratio_from_records` 已有 4 用例（流水/合同、denom≤0→None）保持；可补"本项目合同缺→回退 closed_contract(原项目合同)"用例。
- 新增 `_collection_nodes_for` 纯函数单测（`tests/test_preprocess.py`）：本项目号有节点→取本项目；本项目缺、原项目有→回退原项目；两者皆缺→`[]`。这直接守护 A（售前节点本项目优先）的回归，无需跑 main()。

### 前端
- `paymentRange.test`：`paymentPmisInRange.paymentRatio` 改为 `actualTotal/contract`；合同=0→null；全部不变式。
- `overview.test`：computeKpis paymentRatio 分母改合同（改现有 `1100/2000` 类断言为 act/Σcontract）。
- `paymentPmis.test`：summaryByDim/progressBuckets rate 分母断言改 contractSum。
- `paymentBoard.test`：buildGroup rate 断言改 actualSum/contractSum（含现有 `rate=actual/expected` 用例改写、注释更新）。
- `payDashboard.test` / `ledger.test` / `projectPivot.test`：各 rate 分母断言改合同。
- `ProjectDetailView`（若有测试）或新增：售前 payRec 回退用例（本项目无流水、原项目有 → 取到原项目流水）。
- 染色/进度态：`rateColorPmis`/`deriveProgress` 函数本身不改，受影响的快照/阈值断言（若有）随新比率更新。

### 验证
- `bash verify.sh` 全绿。
- 真实数据冒烟：回款达成率回到合理区间——非售前 合同口径 ~25.9%、售前 ~77.4%、整体 ~51%；售前 `payment.expectedTotal` 不再普遍为 0（A 修复生效）；详情页售前「回款数据」不再误显"未提供"（C 生效）。

---

## 5. 版本 / 边界
- 版本：`frontend/src/version.ts` → `V1.15.0` / `2026-06-19`。
- 边界（不在本轮）：进度态/染色**阈值重定**（保持 0.8/0.5、0.999）；collection_stages 数据补全由用户导出端处理；`payment.actualTotal`（节点已收汇总字段）语义不动；schema 结构不变（仅值口径变）。
