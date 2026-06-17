# 详情页消费 收款条件 + 票据信息 两列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 详情页「回款」tab 阶段表新增换行「收款条件」列、「回款数据」tab 流水表新增「票据」列（有才显示），数据源 collection_stages.csv 与 payment_records.csv 已有列。

**Architecture:** 后端两个解析器各加扁平字段（`payTerm` / `billType·billDueDate·billProtocol`），schema 同步加默认空串字段、重生成 TS 类型；前端 DataTable 加按列 `wrap` 开关，ProjectDetailView 两表各加一列。全部追加、向后兼容。

**Tech Stack:** Python 标准库 + 自研 schema（`schema.py` → `json2ts`）；Vue3 + Vite + TS + Element Plus（`el-table`）+ Vitest。

参考设计：`docs/superpowers/specs/2026-06-17-pay-terms-bill-cols-design.md`

**约定（务必遵守）：**
- 简体中文沟通；不用 emoji（需符号用 → ↓ ❌ ✕ ▾）。
- 提交信息结尾固定加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 严禁 `git add -A`／`git add .`：仓库根有未跟踪文件「看板数据取值条件与计算公式.md」必须始终排除，只用显式路径 `git add`。
- `frontend/src/types/analysis.ts` 是 `npm run gen:types` 自动生成，**不手改**。
- 改了 `schema.py` 必须重生成类型（Task 3）。

---

### Task 1: 后端 — collection_stages 收款条件 → payTerm（+schema）

**Files:**
- Modify: `schema.py:157-169`（`PaymentNodePmis`）
- Modify: `collection_stages.py:68-85`（`_row_to_node`）
- Test: `tests/test_collection_stages.py:52-81`（扩充既有用例）

- [ ] **Step 1: 改测试先失败** — 在 `tests/test_collection_stages.py` 的 `test_load_groups_sorts_and_maps` 里，给「终验款」那行加 `收款条件`，并加两条断言。

把该函数中第一行（终验款 dict，约 55-57 行）改为带 `"收款条件"`：

```python
        {"项目编号": "X1", "回款类型": "终验款", "阶段名称": "终验款", "回款比例": "90.00%",
         "回款金额": "900000", "关联日期": "20", "计划回款时间": "1782057600000",
         "实际回款时间": "", "实际比例": "0.0", "已收金额": "0", "未收金额": "900000",
         "收款条件": "终验款，验收结束后20天内付款25%"},
```

并在该函数末尾（`assert fin["status"] == "待回款"` 之后）追加：

```python
    assert fin["payTerm"] == "终验款，验收结束后20天内付款25%"
    assert pre["payTerm"] == ""   # 预付款行未填收款条件 → 空串
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_collection_stages.py::test_load_groups_sorts_and_maps -q`
Expected: FAIL（`KeyError: 'payTerm'`）

- [ ] **Step 3: 加 schema 字段** — `schema.py` 的 `PaymentNodePmis`，在 `termDays` 行后、`reached` 行前插入：

```python
    payTerm: str = ""
```

改后该类应为：

```python
class PaymentNodePmis(_Base):
    stage: str
    category: str = ""
    planDate: str = ""
    actualDate: str = ""
    payRatio: Optional[float] = None
    expectedPayment: float = 0
    receivedAmount: float = 0
    unpaidAmount: float = 0
    actualRatio: Optional[float] = None
    termDays: Optional[int] = None
    payTerm: str = ""
    reached: bool = False
    status: str = ""
```

- [ ] **Step 4: 加解析字段** — `collection_stages.py` 的 `_row_to_node` 返回 dict，在 `"termDays": ...` 行后插入：

```python
        "payTerm": (row.get("收款条件") or "").strip(),
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_collection_stages.py -q`
Expected: PASS（全部用例）

- [ ] **Step 6: 提交**

```bash
git add schema.py collection_stages.py tests/test_collection_stages.py
git commit -m "$(cat <<'EOF'
feat(detail): collection_stages 收款条件 → 节点 payTerm 字段

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 后端 — payment_records 票据列 → billType/billDueDate/billProtocol（+schema）

**Files:**
- Modify: `schema.py:234-244`（`PaymentRecord`）
- Modify: `profit.py:194-205`（`load_payment_records` 的 `rec`）
- Test: `tests/test_profit.py`（新增 CSV 常量 + `TestPaymentRecords` 新方法）

- [ ] **Step 1: 加失败测试** — 在 `tests/test_profit.py` 顶部常量区（`PAY_CSV` 定义之后，约 43 行后）加：

```python
PAY_BILL_CSV = (
    "项目编号,回款类型,收款流水号,付款金额,回款确认日期,票据_互抵协议号,票据_到期日期,票据_调整类型\n"
    "SS-1,实际回款,B-1,100.0,2026-06-04,,2026-03-10,背书\n"   # 有调整类型+到期日
    "SS-1,实际回款,B-2,200.0,2026-06-05,PROT-9,,\n"           # 仅互抵协议号
    "SS-1,实际回款,B-3,300.0,2026-06-06,,,\n"                 # 无票据信息
)
```

并在 `class TestPaymentRecords:` 内（`test_missing` 之后）加方法：

```python
    def test_bill_fields(self, tmp_path):
        _write(tmp_path, "payment_records.csv", PAY_BILL_CSV)
        recs, _ = P.load_payment_records(str(tmp_path), {"SS-1"})
        rs = {r["serial"]: r for r in recs["SS-1"]["records"]}
        assert rs["B-1"]["billType"] == "背书"
        assert rs["B-1"]["billDueDate"] == "2026-03-10"
        assert rs["B-1"]["billProtocol"] == ""
        assert rs["B-2"]["billProtocol"] == "PROT-9"
        assert rs["B-2"]["billType"] == "" and rs["B-2"]["billDueDate"] == ""
        assert rs["B-3"]["billType"] == "" and rs["B-3"]["billDueDate"] == ""
        assert rs["B-3"]["billProtocol"] == ""
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_profit.py::TestPaymentRecords::test_bill_fields -q`
Expected: FAIL（`KeyError: 'billType'`）

- [ ] **Step 3: 加 schema 字段** — `schema.py` 的 `PaymentRecord`，在 `note: str = ""` 行后插入三行：

```python
    billType: str = ""
    billDueDate: str = ""
    billProtocol: str = ""
```

- [ ] **Step 4: 加解析字段** — `profit.py` 的 `load_payment_records`，在 `rec` 字典里 `"note": ...` 行后插入：

```python
            "billType": str(r.get("票据_调整类型") or "").strip(),
            "billDueDate": str(r.get("票据_到期日期") or "").strip()[:10],
            "billProtocol": str(r.get("票据_互抵协议号") or "").strip(),
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_profit.py -q`
Expected: PASS（全部用例，含既有 `test_group_and_summary` 不受影响）

- [ ] **Step 6: 提交**

```bash
git add schema.py profit.py tests/test_profit.py
git commit -m "$(cat <<'EOF'
feat(detail): payment_records 票据_* → 流水记录 bill 字段

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 重生成 TS 类型

**Files:**
- Modify（自动生成，勿手改）: `frontend/src/types/analysis.ts`

- [ ] **Step 1: 重生成类型**

Run: `cd frontend && npm run gen:types`
Expected: 命令成功（`schema.py` → `schema.json` → `json2ts`）。

- [ ] **Step 2: 确认新字段已生成**

Run: `cd frontend && grep -E "payTerm|billType|billDueDate|billProtocol" src/types/analysis.ts`
Expected: 命中 4 个字段（`payTerm` 在 `PaymentNodePmis`、三个 bill 字段在 `PaymentRecord`）。

- [ ] **Step 3: typecheck 确认无破**

Run: `cd frontend && npm run typecheck`
Expected: 无报错。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types/analysis.ts
git commit -m "$(cat <<'EOF'
chore(types): 重生成 analysis.ts（payTerm + bill 字段）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: DataTable 按列换行开关 `wrap`

**Files:**
- Modify: `frontend/src/components/DataTable.vue`
- Test: `frontend/src/components/DataTable.test.ts`（追加 describe）

- [ ] **Step 1: 加失败测试** — 在 `frontend/src/components/DataTable.test.ts` 末尾追加：

```ts
describe('DataTable wrap 列', () => {
  it('wrap:true 列单元格挂 dt-wrap-col 类、普通列不挂', async () => {
    const w = mount(DataTable, {
      props: {
        columns: [
          { key: 'term', label: '收款条件', wrap: true },
          { key: 'x', label: 'X' },
        ] as DataColumn[],
        rows: [{ term: '合同签订后付款30%，剩余货款4个月帐期', x: '1' }],
      },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const wrapCell = w.find('.dt-wrap-col')
    expect(wrapCell.exists()).toBe(true)
    expect(wrapCell.text()).toContain('剩余货款4个月帐期')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: FAIL（`.dt-wrap-col` 不存在；`wrap` 也尚未在 `DataColumn` 类型上）

- [ ] **Step 3: 实现 wrap** — 改 `frontend/src/components/DataTable.vue`：

(a) `DataColumn` 接口加字段（在 `formatter?` 后）：

```ts
  /** 为真时该列不截断、单元格内换行（长文本列用） */
  wrap?: boolean
```

(b) `<el-table-column>` 标签：把 `show-overflow-tooltip` 改为按列绑定，并加 `class-name`：

```vue
      <el-table-column
        v-for="col in props.columns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        :width="col.width"
        :sortable="!!col.sortable"
        :show-overflow-tooltip="!col.wrap"
        :class-name="col.wrap ? 'dt-wrap-col' : ''"
      >
```

(c) `<style scoped>` 内加：

```css
:deep(.dt-wrap-col .cell) { white-space: normal; word-break: break-word; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: PASS（含既有 3 个 describe 不受影响）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): DataTable 支持按列 wrap（长文本列换行不截断）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 回款 tab 新增「收款条件」列

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue:113-123`（`PMIS_NODE_COLS`）
- Test: `frontend/src/views/ProjectDetailView.test.ts:295-316`（扩充 2A 节点用例）

- [ ] **Step 1: 改测试先失败** — 在 `ProjectDetailView.test.ts` 的「回款 tab:PMIS 回款摘要与节点表(2A)」用例里，给第一个节点（到货款）加 `payTerm`，并加断言。

把该用例里 `paymentNodes` 的到货款节点（约 304-306 行）改为带 `payTerm`：

```ts
      { stage: '到货款', category: '到货款', planDate: '2026-01-01', actualDate: '2026-01-02',
        payRatio: 0.7, expectedPayment: 700000, receivedAmount: 700000, unpaidAmount: 0,
        actualRatio: 1, termDays: 90, payTerm: '到货后20天内付款70%', reached: true, status: '已回款' },
```

并在该用例末尾（`expect(w.text()).toContain('延期')` 之后）追加：

```ts
    expect(w.text()).toContain('收款条件')          // 列表头
    expect(w.text()).toContain('到货后20天内付款70%') // 收款条件全文换行显示
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts -t "PMIS 回款摘要与节点表"`
Expected: FAIL（找不到「收款条件」/「到货后20天内付款70%」）

- [ ] **Step 3: 加列** — `ProjectDetailView.vue` 的 `PMIS_NODE_COLS`，在 `termDays`（账期(天)）行后、`status`（状态）行前插入：

```ts
  { key: 'payTerm', label: '收款条件', width: 240, wrap: true, formatter: (v) => (v ? String(v) : '-') },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "$(cat <<'EOF'
feat(detail): 回款 tab 阶段表新增「收款条件」换行列

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 回款数据 tab 新增「票据」列（有才显示）

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue:158-166`（`PAYREC_COLS` + 新增 `fmtBill`）
- Test: `frontend/src/views/ProjectDetailView.test.ts:129-137`（扩充 R2 流水用例）

- [ ] **Step 1: 改测试先失败** — 在「回款数据 tab:流水汇总 chips+明细表+非 CNY 汇率(R2)」用例里，给 seed 的两条流水加票据字段。

该用例 mount 前先改注入数据（在 `seed()` 之后、`mountAt` 之前插入）：

```ts
    const ds0 = useDataStore()
    ;(ds0.data as any).paymentRecords['P-1'].records[0] = {
      ...(ds0.data as any).paymentRecords['P-1'].records[0],
      billType: '背书', billDueDate: '2026-03-10', billProtocol: '',
    }
    ;(ds0.data as any).paymentRecords['P-1'].records[1] = {
      ...(ds0.data as any).paymentRecords['P-1'].records[1],
      billType: '', billDueDate: '', billProtocol: 'PROT-9',
    }
```

并在该用例末尾（`expect(w.text()).toContain('USD(汇率 7.1)')` 之后）追加：

```ts
    expect(w.text()).toContain('票据')           // 列表头
    expect(w.text()).toContain('背书·2026-03-10') // 类型·到期日
    expect(w.text()).toContain('互抵:PROT-9')     // 仅协议号兜底
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts -t "流水汇总"`
Expected: FAIL（找不到「背书·2026-03-10」/「互抵:PROT-9」）

- [ ] **Step 3: 加 fmtBill + 列** — `ProjectDetailView.vue`：

(a) 在 `<script setup>` 内（紧邻 `PAYREC_COLS` 定义之前）加函数：

```ts
function fmtBill(r: Record<string, any>): string {
  const td = [r.billType, r.billDueDate].filter(Boolean).join('·')
  if (td) return td
  if (r.billProtocol) return `互抵:${r.billProtocol}`
  return ''
}
```

(b) `PAYREC_COLS` 数组末尾（`currency` 列后）追加一列：

```ts
  { key: 'bill', label: '票据', width: 150, formatter: (_v, r) => fmtBill(r) },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "$(cat <<'EOF'
feat(detail): 回款数据 tab 流水表新增「票据」列（有才显示）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 版本 V1.6.3 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本** — `frontend/src/version.ts` 改为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.3'
export const RELEASE_DATE = '2026-06-17'
```

- [ ] **Step 2: 更新 PROGRESS.md** — 在 PROGRESS.md 顶部版本行同步 V1.6.3，并在程序/记录区追加一条（具体位置随当前文件结构，紧跟 3A 条目之后）：

```markdown
- 详情页消费两列新数据：collection_stages.收款条件 → 回款 tab 阶段表换行列；payment_records.票据_*（承兑/背书/到期日/互抵协议号）→ 回款数据 tab 流水「票据」列（有才显示）。V1.6.3（2026-06-17）。数据源 5 文件列变更经精读+全管线证实皆追加式、解析已对齐。
```

- [ ] **Step 3: 实跑预处理确认产物含新字段**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py 2>&1 | tail -5`
Expected: `数据已通过 schema 校验` + 正常完成（产物 `data/analysis_data.json` 未被 git 跟踪，无需提交）。

- [ ] **Step 4: 全量 verify.sh 全绿**

Run: `bash verify.sh`
Expected: python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
chore: 版本 V1.6.3 + PROGRESS（详情页消费 收款条件/票据 两列）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成定义

- 7 个任务全部提交；`bash verify.sh` 全绿；`preprocess_data.py` 产物 schema 校验通过。
- 回款 tab 阶段表显示「收款条件」换行列；回款数据 tab 流水表显示「票据」列（仅带票据行有内容）。
- 版本 V1.6.3；PROGRESS 已记。
- 未触碰：导出（projectExport）、其它 4 文件解析、`调整原因`/`备注`/`订单号`、仓库根未跟踪文件。
