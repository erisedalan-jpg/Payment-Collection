# P4 五页分页 + /risk 两列筛选（V2.6.3）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐任务实现。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 给 5 个跟进/风险列表页加「同 /projects」的分页 + 总数统计（避免单页渲染过大），并给 /risk 的 rev结论/下次rev时间两列加列头筛选。

**Architecture:** 纯前端。**忠实复刻 /projects 的分页范式**（`filtered → paged=slice(filtered)` + `watch(filtered)→回第1页` + pager 显 `共 {{ filtered.length }} 条`；列保持现有 native `sortable`，排序为**逐页**，与 /projects 一致）。不改排序机制、不引 externalSort（保持与 /projects 同款）。

**Tech Stack:** Vue3+TS+Element Plus / Vitest。

## Global Constraints（每任务隐含遵守）

- **不使用任何 emoji**；只引设计令牌不手写散值。
- 版本单一来源 `frontend/src/version.ts`，本期 **V2.6.3**（2.6.X 末期，Z 级）。
- 分页 pager 显 `共 {{ filtered.length }} 条`；**数据量小(≤页大小)也显示总数**（`v-if="filtered.length"` 恒显 count，el-pagination 单页也渲染，无害）。
- 排序沿用各页现有 native `sortable`（withSortable），分页后为**逐页排序**（与 /projects 同款，不做 externalSort）。
- 数字列 `.u-num`；改逻辑先补/改测试；声称完成前 `bash verify.sh` 全绿。
- **本轮 P2-P4 到本期(P4)收官**：P4 合 master 后**统一出累积升级包 V2.6.3**（从在线基线 V2.5.9 增量，累积含 V2.6.0/1/2/3）。
- commit 仅在特性分支按任务提交（尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`）；不动本期外既有未提交工作树改动。

## 复刻范式（ProjectsView 现成，逐字参照）

script（现成于 ProjectsView L105-108）：
```ts
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })
```
template（现成于 ProjectsView L217-222，DataTable `:rows` 由 `filtered` 改 `paged`；pager 放表后）：
```vue
<div v-if="filtered.length" class="xx-pager">
  <span class="u-num">共 {{ filtered.length }} 条</span>
  <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
    :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
    layout="sizes, prev, pager, next" size="small" background />
</div>
```
CSS：加 `.xx-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }`（`.u-num` 用 `font-size: var(--fs-1); color: var(--sub);` 可选）。

## 文件结构（P4 落点）

- 修改：`frontend/src/views/KeyProjectsView.vue`、`OpportunityFollowupView.vue`、`TempFollowupView.vue`、`PaymentKeyFollowupView.vue`、`RiskFollowupView.vue`、`version.ts`、`PROGRESS.md`
- 测试：各视图 `*.test.ts`（追加 pager/总数断言）

---

### Task 1: 四页分页 + 总数（KeyProjects / OpportunityFollowup / TempFollowup / PaymentKey）

**Files:**
- Modify: `frontend/src/views/KeyProjectsView.vue`、`frontend/src/views/OpportunityFollowupView.vue`、`frontend/src/views/TempFollowupView.vue`、`frontend/src/views/PaymentKeyFollowupView.vue`
- Test: 对应 4 个 `*.test.ts`（追加）

**四页同款改动**（各页均已有 `filtered` computed + `:rows="filtered"` 的 DataTable）：
- script：确认 import 了 `ref, computed, watch`（TempFollowup/PaymentKey 已有 watch；KeyProjects/OppFollowup 若缺 watch 需补 import）；加上「复刻范式」的 4 行（pageSize/currentPage/paged/watch）。
- template：DataTable `:rows="filtered"` → `:rows="paged"`；在 DataTable 所在 `.kp-scroll`（或等价）之后加 pager 块（见范式，class 用各页前缀如 `kp-pager`）。
- CSS：加 pager 样式。

- [ ] **Step 1: 写失败测试**（4 个 test 各追加 1 例）：构造 **> 50 行** 数据（触发分页），断言：① 渲染行数 ≤ pageSize（`.el-table__body-wrapper tbody tr` ≤ 50）；② 存在 `.el-pagination`；③ 总数文本 `共 N 条`（N=filtered 全量）。**注意**:这些页有超管门/范围/mode,测试需照各自既有 stub 让 `filtered` 有 >50 行(如 KeyProjects 需 >50 个 isKeyProject 命中;temp/paykey 需设 scope 或直接注入 current+inScope;若难造 >50,退而验证 pager 元素存在 + `共 X 条` 文本正确即可)。既有断言(按行查数据)若因分页只剩前 50 行而失败,同步改为查 `共 N 条` 或放宽为 paged 语义。
- [ ] **Step 2: 失败** `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts src/views/OpportunityFollowupView.test.ts src/views/TempFollowupView.test.ts src/views/PaymentKeyFollowupView.test.ts`
- [ ] **Step 3: 实现** 四页按范式改（paged + pager）。
- [ ] **Step 4: 全绿 + typecheck + 全量 vitest 无回归**
- [ ] **Step 5: Commit** `feat(followup): 四跟进页分页+总数统计(同/projects)`

---

### Task 2: /risk 分页 + 总数 + rev两列筛选

**Files:**
- Modify: `frontend/src/views/RiskFollowupView.vue`
- Test: `frontend/src/views/RiskFollowupView.test.ts`（追加）

**改动**：
- **分页**：同范式（paged + watch + pager）。注意 RiskFollowupView 用 `useDeferredMount`（`ready` 门）+ `filtered` 在 `ready` 块内的 DataTable（现 `:rows="filtered"` L197）；pager 放该块内、表后。`filtered` computed 已存在。
- **两列筛选**：`FILTERABLE` set（现约 L94，含 风险等级/风险状态/... 等)追加 `'revConclusion'`、`'nextRevDate'`——列头 `ColumnFilter` 由 `v-if="FILTERABLE.has(c.key)"` 自动生效（`ColumnFilter` 从 rows 抽 distinct 值,`applyColumnFilters` 过滤,无需改后端;revConclusion 自由文本、nextRevDate 日期字符串,按值去重可用）。

- [ ] **Step 1: 写失败测试**（RiskFollowupView.test.ts 追加）：① 分页——>50 行时行数≤50 + `.el-pagination` + `共 N 条`；② `FILTERABLE` 含 revConclusion/nextRevDate（可断言这两列表头渲染出 ColumnFilter，或直接 import 组件断言 set——按该测试既有风格）。
- [ ] **Step 2: 失败** `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`
- [ ] **Step 3: 实现** 分页范式 + `FILTERABLE` 追加两 key。
- [ ] **Step 4: 全绿 + typecheck + 全量 vitest 无回归**
- [ ] **Step 5: Commit** `feat(risk): 分页+总数 + rev结论/下次rev时间两列加筛选`

---

### Task 3: 版本 + PROGRESS + 验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1:** `version.ts`：`APP_VERSION='V2.6.3'`、`RELEASE_DATE='2026-07-02'`。
- [ ] **Step 2:** `PROGRESS.md`：加 V2.6.3 版本节（五页分页+总数、/risk 两列筛选；纯前端;**P4 收官——合 master 后统一出累积包 V2.6.3[从 V2.5.9 增量,含 V2.6.0/1/2/3]**;提醒累积包含 P2 的新 pageKey payment-key 授权 + server.py 改动须重启）。
- [ ] **Step 3: 全量验证** `bash verify.sh` 全绿。
- [ ] **Step 4: 真机冒烟**（承 design-review-screenshot-harness）：五页各有分页器 + 「共 N 条」总数（小数据也显）；翻页/改每页条数正常；/risk 的 rev结论、下次rev时间列头出现筛选 ▼ 且可筛；0 console 报错。（/payment/key、/risk 等需超管；/payment/key 需先设范围出行——或验证 pager 元素存在即可。）
- [ ] **Step 5: Commit** `chore(release): V2.6.3 五页分页+/risk两列筛选 版本+PROGRESS`

---

## 自查（写完计划的检查）

- **spec/用户 item 10+11 覆盖**：五页分页+总数(item 10:/projects/key·/opportunities/key·/projects/temp·/risk·/payment/key)→ Task 1(四页)+Task 2(/risk);/risk 两列筛选(item 11)→ Task 2;收尾 Task 3。✓
- **占位扫描**：范式代码 + pager 模板逐字给出(复刻 ProjectsView);FILTERABLE 追加明确。✓
- **同/projects**：分页=slice(filtered)+total,排序沿用 native(逐页,与 /projects 一致),不引 externalSort。✓
- **顺序**：Task 1(四页,同款)→Task 2(/risk,分页+筛选)→Task 3 收尾。各页独立。✓
- **测试脆性提醒**：分页后按行查数据的既有断言若 >50 行会只剩 50,已在 Step 1 提示同步改断言。✓
