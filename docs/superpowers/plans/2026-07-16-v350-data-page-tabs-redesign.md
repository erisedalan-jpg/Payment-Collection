# V3.5.0 /data 数据管理页 Tab 化重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/data` 从「5 张高矮不齐的卡自适应换列」重构成「常驻头（状态条 + 更新数据）+ 三页签（数据源 / 配置 / 维护）」，并按数据脉络把 PMIS 域与项目域合并为「项目主域」。功能零改动。

**Architecture:** `DataView.vue`（527 行）拆成瘦壳 + 4 个新子组件；`el-tabs` 承载三签（**不设 `lazy`**）；栅格从 `auto-fit` 改显式两栏；主域上传由新纯函数 `lib/uploadDispatch.ts` 按文件名分发到两个既有端点。跨组件协作一律 props / emit，**不新建 store**。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Element Plus 2.14.1 + Pinia + Vitest + `@vue/test-utils`。

**Spec:** `docs/superpowers/specs/2026-07-16-v350-data-page-tabs-redesign-design.md`

## Global Constraints

- **纯前端**。不改 `server.py` 任何一行；不改 `usePmisSync` / `useInputFiles` 的端点与签名；不进数据管线；升级只换 `dist/`，无需点「更新数据」、无需重启后端、无需新授权 pageKey。
- **功能零改动**：不改任何 API 调用、SSE 进度反馈、权限判定、业务口径。
- **不使用任何 emoji**（CLAUDE.md 铁律）。需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **只引设计令牌，不手写散值**：颜色/间距/字号/圆角/阴影/动效一律引用 `frontend/src/styles/theme.css` 的 CSS 变量。违者被 `theme.tokens.test.ts` 拦下。
- **不引入第 16 个色号**。
- **`data-test` 钩子只增不减**：`btn-fetch-pmis-cookie` `btn-download` `pmis-row` `pmis-cookie` `files-card` `btn-fetch-yitian-cookie` `manual-import-card` `man-backup-row` `history-row` `history-rollback` `history-source-note` `dsb-agent` `dsb-cookie` `dsb-yitian` `portal-config-card` `pc-add` `pc-save` `pc-item-row` `pc-up` `pc-down` `pc-edit` `pc-del` —— 全部原名保留。
- **禁止给 `el-tab-pane` 设 `lazy`**。EP 2.14.1 的 `shouldBeRender = !props.lazy || loaded.value || active.value`，`lazy` 默认 `false` → 三签内容全渲染、非激活签仅 `v-show` 隐藏。一旦设 `lazy`，现有 `data-test` 查询与冷加载行为同时改变。
- **禁止出现字样**：`在线下载`、`云同步`、`离线导入`、`WPS`、`云文档`（`DataView.test.ts` 现存断言，重构后仍须成立）。
- **`el-collapse` 折叠内容在 DOM 中存在**（现存 `pmis-cookie` 测试即依赖此性质），不要改成 `v-if`。
- **两步确认不得简化**：清空数据必须两次 `ElMessageBox.confirm`。
- **`.dv-*` 类名沿用，不新造命名体系**。共享样式集中在 `@/styles/dataview.css`（Task 2 建），DataView 与 4 张卡在各自 `<style scoped>` 内 `@import '@/styles/dataview.css';`，**只保留本组件特有的规则**。照搬既有 `styles/followup.css` 先例。**禁止把共享规则再逐字抄进组件** —— 四份拷贝必然漂移。
- **验证必须确认 `npm run test:run` 的退出码为 0**，不能只看用例是否全绿（子组件 `onMounted` 拒绝逸出会让用例全绿但退出码非零 → `verify.sh` 判红）。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/lib/uploadDispatch.ts` | **新建** | 纯函数：按文件名把 File[] 分发到 pmis / inputs / skipped 三组 |
| `frontend/src/lib/uploadDispatch.test.ts` | **新建** | 上述纯函数的单测 |
| `frontend/src/styles/dataview.css` | **新建** | `/data` 共享 `.dv-*` 样式词汇（卡/行/按钮/提示/文件网格/进度条/徽章/折叠覆写）。由 DataView 与 4 张卡 `@import` 复用，**照搬既有 `styles/followup.css` 先例** |
| `frontend/src/views/DataView.vue` | **重写为瘦壳** | 状态条 + 更新卡 + tabs 骨架 + 子组件编排 |
| `frontend/src/views/DataView.test.ts` | **改造** | 瘦壳测试；卡内断言下沉到子组件测试 |
| `frontend/src/components/MainDomainSourceCard.vue` | **新建** | 主域：PMIS cookie / 下载 SSE / 九表 fgrid / 根文件 fgrid / 合并上传 |
| `frontend/src/components/MainDomainSourceCard.test.ts` | **新建** | |
| `frontend/src/components/YitianSourceCard.vue` | **新建** | 倚天：文件 fgrid / 上传 / holidays 模板与说明 / 倚天 cookie |
| `frontend/src/components/YitianSourceCard.test.ts` | **新建** | |
| `frontend/src/components/ProjectTagsCard.vue` | **新建** | 标签库 + 按标签排除 |
| `frontend/src/components/ProjectTagsCard.test.ts` | **新建** | |
| `frontend/src/components/MaintenanceCard.vue` | **新建** | 人工导入 / 数据历史 / 倚天累积数据 / 清空数据 |
| `frontend/src/components/MaintenanceCard.test.ts` | **新建** | |
| `frontend/src/version.ts` | 修改 | `V3.4.0` → `V3.5.0` |
| `PROGRESS.md` | 修改 | 标 `in_progress` → 记结论 |

**只挪位置、内部不改**：`YitianScopeCard.vue` `YitianRulesCard.vue` `YitianStoreCard.vue` `PortalConfigCard.vue` `DataStatusBar.vue`。

### 组件契约（各任务据此对接）

```ts
// MainDomainSourceCard.vue
defineProps<{ repRunning: boolean }>()
defineEmits<{
  (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void
  (e: 'download-done'): void
  (e: 'running-change', v: boolean): void
}>()
defineExpose({ reload: () => Promise<void>, onFetchPmisCookie: () => Promise<void> })

// YitianSourceCard.vue
defineProps<{ yitianStatus: { sessionPreview: string; updatedAt: string } }>()
defineEmits<{ (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void }>()
defineExpose({ reload: () => Promise<void>, onFetchYitianCookie: () => Promise<void> })

// ProjectTagsCard.vue —— 无 props / 无 emits
// MaintenanceCard.vue
defineEmits<{ (e: 'data-changed'): void }>()   // 历史回滚/撤销后通知父刷新两张源卡的文件状态
```

---

## 任务顺序与理由

1. **Task 1** 纯函数打底（无 UI 影响，可独立测）。
2. **Task 2** 先立 tabs 骨架 + 信息架构归属调整（倚天三折叠 → 配置/维护，门户 → 配置）。**此时卡还是内联的**，但每步结束 app 可用。
3. **Task 3–7** 逐张卡抽成组件（纯搬运，行为不变），其中 Task 4 单独做上传合并。
4. **Task 8** 版本号 + PROGRESS + 全量 verify + 目验。

每个任务结束时 `/data` 都是可用的，可独立 review。

---

### Task 1: 主域上传分发纯函数

**Files:**
- Create: `frontend/src/lib/uploadDispatch.ts`
- Test: `frontend/src/lib/uploadDispatch.test.ts`

**Interfaces:**
- Consumes: `PMIS_FILE_NAMES` from `@/composables/usePmisSync`；`INPUT_FILE_NAMES` from `@/composables/useInputFiles`
- Produces:
  ```ts
  export const YITIAN_FILE_NAMES: readonly string[]
  export type SkipReason = 'yitian' | 'unknown'
  export interface DispatchResult {
    pmis: File[]
    inputs: File[]
    skipped: { name: string; reason: SkipReason }[]
  }
  export function dispatchMainDomainFiles(files: File[]): DispatchResult
  export function formatDispatchMessage(r: DispatchResult, okPmis: number, okInputs: number): string
  ```

**背景事实（实现前必读）：**
- `PMIS_FILE_NAMES`（9 个 xlsx）与 `INPUT_FILE_NAMES`（12 项）**完全互斥**，无同名文件。
- `INPUT_FILE_NAMES` **含倚天两文件** `工时.xlsx` / `holidays.csv`（后端按 `config.INPUT_SUBDIR_MAP` 落到 `input/yitian/`，与主域根文件共用 `/api/inputs/upload` 端点）。主域分发必须排除它们，否则语义串域。
- `delivery_analysis.xlsx` 是 legacy（在 `INPUT_FILE_NAMES` 内但不在展示名单），**仍须能正常上传**至 inputs。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/uploadDispatch.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { dispatchMainDomainFiles, formatDispatchMessage, YITIAN_FILE_NAMES } from './uploadDispatch'
import { PMIS_FILE_NAMES } from '@/composables/usePmisSync'
import { INPUT_FILE_NAMES } from '@/composables/useInputFiles'

const f = (name: string) => new File(['x'], name)

describe('dispatchMainDomainFiles', () => {
  it('9 个 PMIS 九表全部进 pmis 组', () => {
    const r = dispatchMainDomainFiles(PMIS_FILE_NAMES.map(f))
    expect(r.pmis).toHaveLength(9)
    expect(r.inputs).toHaveLength(0)
    expect(r.skipped).toHaveLength(0)
  })

  it('项目域根文件进 inputs 组', () => {
    const r = dispatchMainDomainFiles([f('collection_stages.csv'), f('组织架构.xlsx'), f('payment_records.csv')])
    expect(r.inputs.map((x) => x.name)).toEqual(['collection_stages.csv', '组织架构.xlsx', 'payment_records.csv'])
    expect(r.pmis).toHaveLength(0)
    expect(r.skipped).toHaveLength(0)
  })

  it('倚天两文件进 skipped 且 reason=yitian(不串域)', () => {
    const r = dispatchMainDomainFiles([f('工时.xlsx'), f('holidays.csv')])
    expect(r.inputs).toHaveLength(0)
    expect(r.skipped).toEqual([
      { name: '工时.xlsx', reason: 'yitian' },
      { name: 'holidays.csv', reason: 'yitian' },
    ])
  })

  it('legacy delivery_analysis.xlsx 仍正常上传至 inputs', () => {
    const r = dispatchMainDomainFiles([f('delivery_analysis.xlsx')])
    expect(r.inputs.map((x) => x.name)).toEqual(['delivery_analysis.xlsx'])
    expect(r.skipped).toHaveLength(0)
  })

  it('未知文件进 skipped 且 reason=unknown', () => {
    const r = dispatchMainDomainFiles([f('乱七八糟.xlsx')])
    expect(r.skipped).toEqual([{ name: '乱七八糟.xlsx', reason: 'unknown' }])
  })

  it('混合投放各归其位', () => {
    const r = dispatchMainDomainFiles([f('项目中心.xlsx'), f('budget_data.csv'), f('工时.xlsx'), f('x.txt')])
    expect(r.pmis.map((x) => x.name)).toEqual(['项目中心.xlsx'])
    expect(r.inputs.map((x) => x.name)).toEqual(['budget_data.csv'])
    expect(r.skipped).toEqual([
      { name: '工时.xlsx', reason: 'yitian' },
      { name: 'x.txt', reason: 'unknown' },
    ])
  })

  it('空数组不炸', () => {
    expect(dispatchMainDomainFiles([])).toEqual({ pmis: [], inputs: [], skipped: [] })
  })

  it('两个白名单互斥(回归护栏)', () => {
    const overlap = PMIS_FILE_NAMES.filter((n) => INPUT_FILE_NAMES.includes(n))
    expect(overlap).toEqual([])
  })

  it('YITIAN_FILE_NAMES 是 INPUT_FILE_NAMES 的子集(回归护栏)', () => {
    expect(YITIAN_FILE_NAMES.every((n) => INPUT_FILE_NAMES.includes(n))).toBe(true)
  })
})

describe('formatDispatchMessage', () => {
  it('全部识别:只报上传结果', () => {
    const r = { pmis: [f('项目中心.xlsx')], inputs: [f('budget_data.csv')], skipped: [] }
    expect(formatDispatchMessage(r, 1, 1)).toBe('已上传 1 个 PMIS 九表 + 1 个项目域文件,请点[更新数据]生效')
  })

  it('有跳过:逐个列名并给原因', () => {
    const r = {
      pmis: [], inputs: [],
      skipped: [{ name: '工时.xlsx', reason: 'yitian' as const }, { name: 'x.txt', reason: 'unknown' as const }],
    }
    expect(formatDispatchMessage(r, 0, 0)).toBe(
      '已上传 0 个 PMIS 九表 + 0 个项目域文件,请点[更新数据]生效;' +
      '已跳过:工时.xlsx（属倚天工时域,请在「倚天工时域」卡上传）、x.txt（不在主域白名单）',
    )
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/uploadDispatch.test.ts`
Expected: FAIL —— `Failed to resolve import "./uploadDispatch"`

- [ ] **Step 3: 写实现**

创建 `frontend/src/lib/uploadDispatch.ts`：

```ts
import { PMIS_FILE_NAMES } from '@/composables/usePmisSync'
import { INPUT_FILE_NAMES } from '@/composables/useInputFiles'

/** 倚天工时域文件。它们在 INPUT_FILE_NAMES 内(后端按 INPUT_SUBDIR_MAP 落到 input/yitian/),
 *  但不属主域 —— 主域上传须排除,否则语义串域。 */
export const YITIAN_FILE_NAMES: readonly string[] = ['工时.xlsx', 'holidays.csv']

export type SkipReason = 'yitian' | 'unknown'

export interface DispatchResult {
  pmis: File[]
  inputs: File[]
  skipped: { name: string; reason: SkipReason }[]
}

/** 主域上传分发:按文件名把投放的文件分到两个既有端点,其余归 skipped(不静默丢弃)。 */
export function dispatchMainDomainFiles(files: File[]): DispatchResult {
  const r: DispatchResult = { pmis: [], inputs: [], skipped: [] }
  for (const f of files) {
    if (PMIS_FILE_NAMES.includes(f.name)) r.pmis.push(f)
    else if (YITIAN_FILE_NAMES.includes(f.name)) r.skipped.push({ name: f.name, reason: 'yitian' })
    else if (INPUT_FILE_NAMES.includes(f.name)) r.inputs.push(f)
    else r.skipped.push({ name: f.name, reason: 'unknown' })
  }
  return r
}

const SKIP_TEXT: Record<SkipReason, string> = {
  yitian: '属倚天工时域,请在「倚天工时域」卡上传',
  unknown: '不在主域白名单',
}

/** 上传反馈文案。okPmis/okInputs 是端点实际成功数(可能小于分发数)。 */
export function formatDispatchMessage(r: DispatchResult, okPmis: number, okInputs: number): string {
  let msg = `已上传 ${okPmis} 个 PMIS 九表 + ${okInputs} 个项目域文件,请点[更新数据]生效`
  if (r.skipped.length) {
    msg += ';已跳过:' + r.skipped.map((s) => `${s.name}（${SKIP_TEXT[s.reason]}）`).join('、')
  }
  return msg
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/uploadDispatch.test.ts`
Expected: PASS，10 个用例全绿

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/uploadDispatch.ts frontend/src/lib/uploadDispatch.test.ts
git commit -m "feat(data): 主域上传分发纯函数(按文件名分两端点+跳过项显式归类)"
```

---

### Task 2: tabs 骨架 + 信息架构归属调整 + 抽共享样式

**Files:**
- Create: `frontend/src/styles/dataview.css`
- Modify: `frontend/src/views/DataView.vue`（模板 `279-453` 的 `.dv-domain-grid` 整块；样式 `457-527` 整块）
- Modify: `frontend/src/views/DataView.test.ts`（新增 tabs 断言）

**Interfaces:**
- Consumes: Task 1 无（本任务不接分发函数）
- Produces:
  - 三个 `el-tab-pane`（`name="sources" | "config" | "maint"`），供 Task 3–7 往里填抽好的组件
  - `frontend/src/styles/dataview.css` —— 共享 `.dv-*` 样式词汇，Task 3/5/6/7 各组件以 `@import '@/styles/dataview.css';` 复用

**共享样式的既定事实（已实证，实现时不要再自行推翻）：**
- 本仓已有先例：`frontend/src/styles/followup.css` 被 5 个 `.vue` 在 `<style scoped>` 内 `@import`（`FollowupModals` / `KeyProjectsView` / `OpportunityFollowupView` / `PaymentKeyFollowupView` / `RiskFollowupView`），可单独用，也可后跟组件特有规则。
- **`@import` 在 scoped 变换之前解析** —— 查构建产物 `dist/assets/RiskFollowupView-*.css` 得 `.kp-title[data-v-87d7f2b4]{`，证明被导入的规则**会拿到 scope 属性**。故 `:deep(...)` 写在 `dataview.css` 里**会被正常编译**。
- **但必须验产物**：`:deep()` 若未被编译掉，会以非法伪类形式残留、被浏览器**静默丢弃**（V2.8.0 `--lift` 同类陷阱：CSS 无效值不报错、单测与 diff 全放过）。Step 8 有对应断言。

**本任务只搬运，不抽组件、不改任何脚本逻辑。** 目标是先把信息架构立对。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/DataView.test.ts` 的第一个 `describe` 内追加：

```ts
  it('三个页签齐全,默认落「数据源」签', async () => {
    const w = await mountView()
    const labels = w.findAll('.el-tabs__item').map((n) => n.text())
    expect(labels).toEqual(['数据源', '配置', '维护'])
    // 三签内容全在 DOM(el-tab-pane 未设 lazy),故 text()/find() 恒命中 —— 必须用 isVisible() 断可见性
    expect(w.find('#pane-sources').isVisible()).toBe(true)
    expect(w.find('#pane-config').isVisible()).toBe(false)
    expect(w.find('#pane-maint').isVisible()).toBe(false)
  })

  it('栅格不再用 auto-fit(改显式两栏)', async () => {
    const w = await mountView()
    expect(w.find('.dv-domain-grid').exists()).toBe(false)
    expect(w.find('.dv-pane-grid').exists()).toBe(true)
  })

  it('倚天累积数据管理归入「维护」签,合规范围/规则归入「配置」签', async () => {
    const auth = useAuthStore()
    ;(auth as any).user = { account: 'admin', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }
    const w = mount(DataView, { global: { plugins: [ElementPlus], stubs: {
      'el-switch': true, YitianRulesCard: true, YitianScopeCard: true, YitianStoreCard: true, PortalConfigCard: true,
    } } })
    await flushPromises()
    expect(w.find('#pane-maint').text()).toContain('倚天累积数据管理')
    expect(w.find('#pane-config').text()).toContain('合规检查范围')
    expect(w.find('#pane-config').text()).toContain('合规规则配置')
    expect(w.find('#pane-config').text()).toContain('首页门户')
    // 倚天源卡里不再有这三块
    expect(w.find('#pane-sources').text()).not.toContain('累积数据管理')
    expect(w.find('#pane-sources').text()).not.toContain('合规规则配置')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: FAIL —— `.el-tabs__item` 找不到、`.dv-domain-grid` 仍存在

- [ ] **Step 3: 改模板**

把 `DataView.vue` 模板中 `<div class="dv-domain-grid">…</div>`（现 279–453 行）整块替换为下列结构。

**搬运规则（逐条照做，内容一字不改）：**
- 「PMIS 域」卡 = 现 280–315 行，**原样**放进 `sources` 签。
- 「项目域文件」卡 = 现 317–331 行，**原样**放进 `sources` 签。
- 「倚天工时域」卡 = 现 333–360 行（即到 `v-if="yitianMsg"` 那行为止，**不含** 361–371 的 `el-collapse`），放进 `sources` 签。
- 「项目标签」卡 = 现 374–393 行，**原样**放进 `config` 签。
- 「维护与历史」卡 = 现 395–452 行，**去掉**其中 439–441 的 portal `el-collapse-item`，其余原样放进 `maint` 签。
- 倚天原 `el-collapse` 的三项**拆开**：`yitian-scope`（`YitianScopeCard`）与 `yitian-rules`（`YitianRulesCard`）→ `config` 签新卡「倚天合规」；`yitian-store`（`YitianStoreCard`）→ `maint` 签的 `el-collapse`，**标题改为「倚天累积数据管理」**。
- portal 的 `el-collapse-item`（现 439–441）→ `config` 签新卡「首页门户」。

```html
    <el-tabs v-model="activeTab" class="dv-tabs">
      <!-- 注意:绝不给 el-tab-pane 设 lazy(EP 2.14.1 默认 false=全渲染+v-show 隐藏);
           一旦设 lazy,现有 data-test 查询与冷加载行为同时改变。 -->
      <el-tab-pane label="数据源" name="sources">
        <div class="dv-pane-grid">
          <!-- ① 现 280-315 行「PMIS 域」卡，原样 -->
          <!-- ② 现 317-331 行「项目域文件」卡，原样 -->
          <!-- ③ 现 333-360 行「倚天工时域」卡（不含原 361-371 的 el-collapse） -->
        </div>
      </el-tab-pane>

      <el-tab-pane label="配置" name="config">
        <div class="dv-pane-grid">
          <!-- ④ 现 374-393 行「项目标签」卡，原样 -->

          <div v-if="auth.isSuper" class="dv-card">
            <div class="dv-card-head">倚天合规</div>
            <el-collapse class="dv-more">
              <el-collapse-item name="yitian-scope" title="合规检查范围（超管）">
                <YitianScopeCard />
              </el-collapse-item>
              <el-collapse-item name="yitian-rules" title="合规规则配置（超管）">
                <YitianRulesCard />
              </el-collapse-item>
            </el-collapse>
          </div>

          <div v-if="auth.isSuper" class="dv-card dv-span-all">
            <div class="dv-card-head">首页门户</div>
            <el-collapse class="dv-more">
              <el-collapse-item name="portal" title="首页门户 / 快捷入口">
                <PortalConfigCard />
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="维护" name="maint">
        <!-- ⑤ 现 395-452 行「维护与历史」卡（去掉原 439-441 的 portal collapse），
             并在 history 与 clear 之间插入下面这一项 -->
        <!--
          <el-collapse-item v-if="auth.isSuper" name="yitian-store" title="倚天累积数据管理（超管）">
            <YitianStoreCard />
          </el-collapse-item>
        -->
      </el-tab-pane>
    </el-tabs>
```

- [ ] **Step 4: 改脚本（只加一个 ref）**

在 `DataView.vue` 的 `<script setup>` 中，`const auth = useAuthStore()` 之后加：

```ts
// tab 不持久化:每次进入默认落「数据源」签(更新数据已常驻,签只在偶尔改配置/回滚时才切)
const activeTab = ref('sources')
```

- [ ] **Step 5: 抽共享样式文件**

创建 `frontend/src/styles/dataview.css`。内容为从 `DataView.vue` 现 457–527 行样式块中提取的**共享 `.dv-*` 词汇**（逐字保留取值，不得顺手调整）。`.dv-hint.warn` 是新增项（Task 4「已跳过」行要用，提前落位）：

```css
/* /data 数据管理页共享样式词汇。由 DataView 与 4 张卡在 <style scoped> 内 @import 复用。
   @import 在 scoped 变换之前解析,故这里的规则(含 :deep)会拿到各消费方自己的 scope 属性。 */
.dv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-1); }
.dv-card-head { font-weight: 700; font-size: var(--fs-2); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--line); color: var(--txt); }
.dv-sub-head { font-size: var(--fs-1); font-weight: 700; color: var(--sub); padding: var(--sp-2) var(--sp-4) 0; }
.dv-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); font-size: var(--fs-2); flex-wrap: wrap; }
.dv-actions { border-top: 1px solid var(--line); }
.dv-label { width: 70px; flex-shrink: 0; color: var(--sub); font-weight: 600; font-size: var(--fs-1); }

.dv-btn { border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-3); font-size: var(--fs-2); cursor: pointer; color: var(--txt); }
.dv-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); transition: transform var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease); }
.dv-btn.primary:hover:not(:disabled) { transform: translateY(var(--lift)); box-shadow: var(--shadow-2); }
.dv-btn.ghost { color: var(--sub); }
.dv-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.dv-btn:disabled { opacity: var(--disabled-opacity); cursor: default; }
.dv-btn-lg { font-size: var(--fs-3); padding: var(--sp-2) var(--sp-5); }

.dv-hint { font-size: var(--fs-1); color: var(--mut); }
.dv-hint.ok { color: var(--ok-text); }
.dv-hint.err { color: var(--danger-text); }
.dv-hint.warn { color: var(--warn-text); }
.dv-file { font-size: var(--fs-1); }

.dv-progress { padding: 0 var(--sp-4) var(--sp-3); }
.dv-bar { height: 8px; background: var(--line); border-radius: var(--r-sm); overflow: hidden; }
.dv-bar-fill { height: 100%; background: var(--accent); transition: width var(--dur-2) var(--ease); }
.dv-msg { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-2); }

.dv-badge { font-size: var(--fs-1); font-weight: 600; padding: 2px 8px; border-radius: var(--r-full); }
.dv-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.dv-badge.warn { background: var(--warn-bg); color: var(--warn-text); }

.dv-fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 2px var(--sp-4); padding: var(--sp-2) var(--sp-4); }
.dv-fcell { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); padding: 3px 0; border-bottom: 1px dashed var(--line); min-width: 0; }
.dv-fname2 { color: var(--txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dv-ftime2 { color: var(--mut); font-size: var(--fs-1); flex-shrink: 0; }
@media (max-width: 768px) { .dv-fgrid { grid-template-columns: 1fr; } }

.dv-more, .dv-maint { margin: 0; }
.dv-more { border-top: 1px solid var(--line); margin-top: var(--sp-1); }
.dv-maint { background: transparent; border: none; box-shadow: none; }
.dv-more :deep(.el-collapse-item__header),
.dv-maint :deep(.el-collapse-item__header) { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding-left: var(--sp-4); }
.dv-more :deep(.el-collapse-item__content),
.dv-maint :deep(.el-collapse-item__content) { padding-bottom: var(--sp-2); }
```

- [ ] **Step 6: DataView 样式块改为 @import + 仅留自有规则**

把 `DataView.vue` 的整个 `<style scoped>`（现 457–527 行）替换为：

```css
@import '@/styles/dataview.css';

.data-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-card); }
.dv-top { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); }
.dv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }

/* 主操作:更新看板,提为显眼主操作区(色调+更粗边框,不引入新色号) */
.dv-primary {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  background: color-mix(in srgb, var(--accent) 5%, var(--card));
  box-shadow: var(--shadow-2);
}
.dv-primary .dv-card-head { color: var(--accent); border-bottom-color: color-mix(in srgb, var(--accent) 25%, var(--line)); }

/* 显式两栏:卡的位置由设计决定,不由浏览器宽度决定(旧 auto-fit 让 5 张高度差 4~5 倍的卡排出参差) */
.dv-pane-grid {
  display: grid;
  gap: var(--gap-card);
  grid-template-columns: 1fr 1fr;
  align-items: start;
}
.dv-span-all { grid-column: 1 / -1; }
@media (max-width: 768px) { .dv-pane-grid { grid-template-columns: 1fr; } }
.dv-tabs :deep(.el-tabs__item) { font-size: var(--fs-2); font-weight: 700; }
.dv-tabs :deep(.el-tabs__content) { padding-top: var(--gap-section); }
```

**注意**：此时 DataView 仍内联着 5 张卡（Task 3–7 才逐张抽走），故 `@import` 进来的共享规则此刻正被这些内联卡使用 —— 页面观感必须与 Task 2 之前完全一致。

- [ ] **Step 7: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: PASS。**若原有用例（如 `not.toContain('在线下载')`、`pmis-row` 9 行、`files-card` 文本）出现失败，说明搬运时改动了内容 —— 回去逐字核对，不要改测试。**

- [ ] **Step 8: 构建并验产物（`:deep` 静默丢弃陷阱的护栏）**

```bash
cd frontend && npm run build
grep -rlo "el-collapse-item__header\[data-v-" dist/assets/*.css
grep -rc ":deep(" dist/assets/*.css | grep -v ":0$" || echo "OK: 产物中无残留 :deep("
```
Expected:
- 第一条 grep **有输出**（`:deep()` 已编译成 `.el-collapse-item__header[data-v-xxxx]` 形式，说明共享文件里的 `:deep` 生效）。
- 第二条 grep 打印 `OK: 产物中无残留 :deep(`（**若产物里还留着字面 `:deep(`，就是未被编译、将被浏览器静默丢弃 —— 必须停下来修，不要继续往下走**）。

- [ ] **Step 9: 类型检查 + 提交**

```bash
cd frontend && npm run typecheck
git add frontend/src/styles/dataview.css frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "refactor(data): /data 立 tabs 骨架(数据源/配置/维护)+归属调整,废除 auto-fit 改显式两栏,抽共享 dataview.css"
```

---

### Task 3: 抽 MainDomainSourceCard（PMIS 域 + 项目域文件合并）

**Files:**
- Create: `frontend/src/components/MainDomainSourceCard.vue`
- Create: `frontend/src/components/MainDomainSourceCard.test.ts`
- Modify: `frontend/src/views/DataView.vue`（删两张内联卡与对应脚本，改为挂组件）

**Interfaces:**
- Consumes: `usePmisSync` `useInputFiles` `useFileStatus` `usePmisDownload` `cookieAgent.fetchPmisCookie` `pingAgent`（`api.post`）
- Produces:
  ```ts
  defineProps<{ repRunning: boolean }>()
  defineEmits<{
    (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void
    (e: 'download-done'): void
    (e: 'running-change', v: boolean): void
  }>()
  defineExpose({ reload, onFetchPmisCookie })
  ```

**关键约束：**
- `data-test="files-card"` **落在本组件根节点**。现有断言查它的文本含 `collection_stages.csv` / `组织架构.xlsx` / `payment_records.csv` / `budget_data.csv` / `2026-06-12 14:46` —— 合并后全在本卡内，成立。
- 本任务**保留两个上传框**（合并留给 Task 4），只做卡合并与组件抽取。
- `agentOnline` 徽章仍在本卡显示 → 本卡自持 `pingAgent()`。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/MainDomainSourceCard.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MainDomainSourceCard from './MainDomainSourceCard.vue'
import * as cookieAgent from '@/lib/cookieAgent'

vi.mock('@/lib/cookieAgent', () => ({
  pingAgent: vi.fn().mockResolvedValue(true),
  fetchPmisCookie: vi.fn(),
  fetchYitianCookie: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/files/status')) {
      return { ok: true, json: async () => ({ files: { '项目中心.xlsx': '2026-06-12 14:09', 'payment_records.csv': '2026-06-12 14:46' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
})

const mountCard = async () => {
  const w = mount(MainDomainSourceCard, { props: { repRunning: false }, global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

describe('MainDomainSourceCard', () => {
  it('一张卡内同时含 PMIS 九表与项目域文件两分区', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('PMIS 九表')
    expect(w.text()).toContain('项目域文件')
    expect(w.findAll('.dv-fgrid')).toHaveLength(2)
  })

  it('根节点带 files-card 钩子且含核心回款源与根文件', async () => {
    const w = await mountCard()
    const card = w.find('[data-test="files-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('collection_stages.csv')
    expect(card.text()).toContain('组织架构.xlsx')
    expect(card.text()).toContain('payment_records.csv')
    expect(card.text()).toContain('2026-06-12 14:46')
  })

  it('PMIS 九行渲染', async () => {
    const w = await mountCard()
    const rows = w.findAll('[data-test="pmis-row"]')
    expect(rows).toHaveLength(9)
    expect(rows.some((r) => r.text().includes('在建项目里程碑计划数据'))).toBe(true)
  })

  it('repRunning 为真时禁用下载按钮(互斥不得丢失)', async () => {
    const w = mount(MainDomainSourceCard, { props: { repRunning: true }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('[data-test="btn-download"]').attributes('disabled')).toBeDefined()
  })

  it('取到含 SESSION 的 cookie → POST 并 emit cookie-change', async () => {
    const { api } = await import('@/api/client')
    vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'SESSION1' } as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'SESSION=z; a=b', names: ['SESSION', 'a'], hasSession: true, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()
    expect(w.emitted('cookie-change')?.[0]).toEqual([{ sessionPreview: 'SESSION1', updatedAt: '刚刚' }])
  })

  it('取到无 SESSION → 告警且不推送、不 emit', async () => {
    const { api } = await import('@/api/client')
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], hasSession: false, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()
    expect(postSpy).not.toHaveBeenCalledWith('/api/pmis/cookie', expect.anything())
    expect(w.emitted('cookie-change')).toBeUndefined()
    expect(w.text()).toContain('未检测到 PMIS 登录态')
  })

  it('点下载:cookie 非空时先 POST /api/pmis/cookie 再开 /api/pmis/download', async () => {
    const w = await mountCard()
    await w.find('[data-test="pmis-cookie"]').setValue('x=1; SESSION=abc')
    await w.find('[data-test="btn-download"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/pmis/download'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/MainDomainSourceCard.test.ts`
Expected: FAIL —— `Failed to resolve import "./MainDomainSourceCard.vue"`

- [ ] **Step 3: 建组件**

创建 `frontend/src/components/MainDomainSourceCard.vue`：

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { api } from '@/api/client'
import { pingAgent, fetchPmisCookie } from '@/lib/cookieAgent'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { usePmisDownload } from '@/composables/usePmisDownload'

defineProps<{ repRunning: boolean }>()
const emit = defineEmits<{
  (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void
  (e: 'download-done'): void
  (e: 'running-change', v: boolean): void
}>()

const { upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const { upload: inputsUpload, INPUT_FILE_NAMES } = useInputFiles()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()
const ftime = (name: string) => fileStatus.value[name] || '-'

// 展示名单:legacy xlsx 仅作上传兼容不展示;倚天两文件属另一张卡
const YITIAN_FILE_NAMES = ['工时.xlsx', 'holidays.csv']
const INPUT_DISPLAY_NAMES = INPUT_FILE_NAMES
  .filter((n) => n !== 'delivery_analysis.xlsx')
  .filter((n) => !YITIAN_FILE_NAMES.includes(n))

const agentOnline = ref(false)
async function checkAgent() { agentOnline.value = await pingAgent() }

const pmisCookie = ref('')
const cookieMsg = ref('')
const cookieErr = ref(false)

async function onFetchPmisCookie() {
  cookieMsg.value = ''; cookieErr.value = false
  const res = await fetchPmisCookie()
  if (!res.ok) { cookieErr.value = true; cookieMsg.value = 'PMIS cookie 获取失败：' + res.error; return }
  if (!res.hasSession) {
    cookieErr.value = true
    cookieMsg.value = '未检测到 PMIS 登录态（cookie 无 SESSION），请先在零信任内登录 PMIS'
    return
  }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: res.cookie })
    emit('cookie-change', { sessionPreview: r.sessionPreview, updatedAt: '刚刚' })
    cookieMsg.value = `已获取并推送 PMIS cookie（${res.names.length} 项）`
  } catch (e) {
    cookieErr.value = true; cookieMsg.value = '推送失败：' + (e instanceof Error ? e.message : String(e))
  }
}

const { progress: dlProgress, message: dlMessage, running: dlRunning, start: startDownload } =
  usePmisDownload({ onDone: () => { loadFileStatus(); emit('download-done') } })
watch(dlRunning, (v) => emit('running-change', v))

async function onDownload() {
  cookieMsg.value = ''; cookieErr.value = false
  const ck = pmisCookie.value.trim()
  if (ck) {
    try {
      const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: ck })
      emit('cookie-change', { sessionPreview: r.sessionPreview, updatedAt: '刚刚' })
      pmisCookie.value = ''
    } catch (e) {
      cookieErr.value = true
      cookieMsg.value = 'Cookie 保存失败：' + (e instanceof Error ? e.message : String(e))
      return  // cookie 失败则中止,不进入下载
    }
  }
  await startDownload()
}

const pmisInput = ref<HTMLInputElement | null>(null)
const pmisUploadMsg = ref('')
async function onPmisUpload() {
  const files = Array.from(pmisInput.value?.files || [])
  if (!files.length) return
  const ok = await pmisUpload(files)
  pmisUploadMsg.value = `已上传 ${ok}/${files.length} 个 PMIS 文件,请点[更新数据]生效`
  if (pmisInput.value) pmisInput.value.value = ''
  loadFileStatus()
}

const inputsInput = ref<HTMLInputElement | null>(null)
const inputsUploadMsg = ref('')
async function onUploadInputs() {
  const files = Array.from(inputsInput.value?.files || [])
  if (!files.length) return
  const ok = await inputsUpload(files)
  inputsUploadMsg.value = `已上传 ${ok}/${files.length} 个项目域文件,请点[更新数据]生效`
  if (inputsInput.value) inputsInput.value.value = ''
  loadFileStatus()
}

onMounted(() => { loadFileStatus(); checkAgent() })
defineExpose({ reload: loadFileStatus, onFetchPmisCookie })
</script>

<template>
  <div class="dv-card" data-test="files-card">
    <div class="dv-card-head">项目主域</div>

    <div class="dv-row">
      <button class="dv-btn primary" data-test="btn-fetch-pmis-cookie" @click="onFetchPmisCookie">获取本机 PMIS cookie 并推送</button>
      <span class="dv-badge" :class="agentOnline ? 'ok' : 'warn'">本机代理{{ agentOnline ? '已连接' : '未运行' }}</span>
    </div>
    <div v-if="cookieMsg" class="dv-row dv-hint" :class="cookieErr ? 'err' : 'ok'">{{ cookieMsg }}</div>
    <div class="dv-row">
      <button class="dv-btn" data-test="btn-download" :disabled="dlRunning || repRunning" @click="onDownload">下载数据</button>
      <span class="dv-hint">从 PMIS 抓取并覆盖 input/（只抓取不重算）</span>
    </div>
    <div v-if="dlRunning || dlProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: dlProgress + '%' }"></div></div><div class="dv-msg">{{ dlMessage }}</div></div>

    <div class="dv-sub-head">PMIS 九表（input/pmis/）</div>
    <div class="dv-fgrid">
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-fcell" data-test="pmis-row" :title="name">
        <span class="dv-fname2">{{ name }}</span>
        <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
      </div>
    </div>
    <div class="dv-row dv-actions">
      <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
      <button class="dv-btn" @click="onPmisUpload">上传 PMIS 文件</button>
      <span v-if="pmisUploadMsg" class="dv-hint">{{ pmisUploadMsg }}</span>
    </div>

    <div class="dv-sub-head">项目域文件（input/ 根）</div>
    <div class="dv-fgrid">
      <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-fcell" :title="name">
        <span class="dv-fname2">{{ name }}</span>
        <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
      </div>
    </div>
    <div class="dv-row dv-actions">
      <input ref="inputsInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
      <button class="dv-btn" @click="onUploadInputs">上传项目域文件</button>
      <span v-if="inputsUploadMsg" class="dv-hint">{{ inputsUploadMsg }}</span>
    </div>

    <el-collapse class="dv-more">
      <el-collapse-item name="pmis-cookie-manual" title="更多：手动粘贴 PMIS cookie（取备用）">
        <div class="dv-row dv-cookie">
          <span class="dv-label">手动 cookie</span>
          <textarea v-model="pmisCookie" data-test="pmis-cookie" class="dv-cookie-box" rows="2"
            placeholder="粘贴完整 PMIS cookie 串（高级兜底；正常用上方「获取本机 cookie」）"></textarea>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:手动 cookie 输入框 */
.dv-cookie { align-items: flex-start; }
.dv-cookie-box { flex: 1 1 320px; min-width: 220px; font-size: var(--fs-1); font-family: var(--font-sans);
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--txt);
  padding: var(--sp-2); resize: vertical; }
</style>
```

- [ ] **Step 4: 运行组件测试确认通过**

Run: `cd frontend && npx vitest run src/components/MainDomainSourceCard.test.ts`
Expected: PASS，7 个用例全绿

- [ ] **Step 5: 接进 DataView**

在 `DataView.vue`：

1. `import MainDomainSourceCard from '@/components/MainDomainSourceCard.vue'`
2. `sources` 签里的「PMIS 域」卡与「项目域文件」卡两块整体替换为：
   ```html
   <MainDomainSourceCard ref="mainCard" :rep-running="repRunning"
     @cookie-change="(v: {sessionPreview:string;updatedAt:string}) => cookieStatus = v"
     @download-done="loadCookieStatus"
     @running-change="(v: boolean) => dlRunning = v" />
   ```
3. 脚本中删除下列已搬走的内容：`usePmisSync` / `usePmisDownload` 的引入与解构、`pmisInput` / `pmisUploadMsg` / `onPmisUpload`、`inputsInput` / `inputsUploadMsg` / `onUploadInputs`（**注意 `useInputFiles` 仍被倚天上传使用，暂不删**）、`pmisCookie` / `cookieMsg` / `cookieErr` / `onFetchPmisCookie` / `onDownload`、`INPUT_DISPLAY_NAMES`。
4. 新增：
   ```ts
   const mainCard = ref<InstanceType<typeof MainDomainSourceCard> | null>(null)
   const dlRunning = ref(false)
   ```
5. `useReprocess` 的 `onDone` 改为：
   ```ts
   const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
     useReprocess({ onDone: () => { data.reload(); mainCard.value?.reload(); loadFileStatus(); projectTags.load() } })
   ```
6. `defineExpose` 改为转发型（**保住现有 `DataView.test.ts` 里 `w.vm.onFetchPmisCookie()` 的调用**）：
   ```ts
   defineExpose({
     onFetchPmisCookie: () => mainCard.value?.onFetchPmisCookie(),
     onFetchYitianCookie,
     checkAgent,
   })
   ```

- [ ] **Step 6: 跑 DataView 测试确认无回归**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: PASS。**若 `w.vm.onFetchPmisCookie()` 那两个用例失败，检查 `mainCard` ref 是否被 stub 掉**（该 describe 未 stub 子组件，ref 应已填充）。

- [ ] **Step 7: 类型检查 + 提交**

```bash
cd frontend && npm run typecheck
git add frontend/src/components/MainDomainSourceCard.vue frontend/src/components/MainDomainSourceCard.test.ts frontend/src/views/DataView.vue
git commit -m "refactor(data): 抽 MainDomainSourceCard,PMIS 域与项目域文件合并为「项目主域」"
```

---

### Task 4: 主域合并上传（接 uploadDispatch）

**Files:**
- Modify: `frontend/src/components/MainDomainSourceCard.vue`
- Modify: `frontend/src/components/MainDomainSourceCard.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `dispatchMainDomainFiles(files) → DispatchResult`、`formatDispatchMessage(r, okPmis, okInputs) → string`
- Produces: 无新对外接口（卡内行为变更）

- [ ] **Step 1: 写失败测试**

在 `MainDomainSourceCard.test.ts` 追加：

```ts
describe('MainDomainSourceCard 合并上传', () => {
  it('只剩一个上传框与一个上传按钮', async () => {
    const w = await mountCard()
    expect(w.findAll('input[type="file"]')).toHaveLength(1)
    expect(w.find('[data-test="btn-upload-main"]').exists()).toBe(true)
    expect(w.text()).toContain('上传主域数据文件')
  })

  it('混合投放:九表与根文件分别打两个端点,倚天/未知文件不发请求且列入已跳过', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], '项目中心.xlsx'), new File(['x'], 'budget_data.csv'),
              new File(['x'], '工时.xlsx'), new File(['x'], 'x.txt')],
    })
    await w.find('[data-test="btn-upload-main"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.filter((u: string) => u.includes('/api/pmis/upload'))).toHaveLength(1)
    expect(calls.filter((u: string) => u.includes('/api/inputs/upload'))).toHaveLength(1)
    // 倚天/未知文件绝不能被静默塞进 inputs 端点
    expect(calls.some((u: string) => u.includes(encodeURIComponent('工时.xlsx')))).toBe(false)
    const msg = w.find('[data-test="upload-main-msg"]').text()
    expect(msg).toContain('已上传 1 个 PMIS 九表 + 1 个项目域文件')
    expect(msg).toContain('工时.xlsx（属倚天工时域')
    expect(msg).toContain('x.txt（不在主域白名单）')
  })

  it('有跳过项时不阻断已识别文件的上传', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], '项目中心.xlsx'), new File(['x'], 'x.txt')] })
    await w.find('[data-test="btn-upload-main"]').trigger('click')
    await flushPromises()
    expect((fetch as any).mock.calls.map((c: any) => String(c[0])).some((u: string) => u.includes('/api/pmis/upload'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/MainDomainSourceCard.test.ts`
Expected: FAIL —— 找到 2 个 `input[type="file"]`、`btn-upload-main` 不存在

- [ ] **Step 3: 改实现**

在 `MainDomainSourceCard.vue` 脚本中：

1. 加引入：
   ```ts
   import { dispatchMainDomainFiles, formatDispatchMessage } from '@/lib/uploadDispatch'
   ```
2. 删除 `pmisInput` / `pmisUploadMsg` / `onPmisUpload` / `inputsInput` / `inputsUploadMsg` / `onUploadInputs`，替换为：
   ```ts
   const mainInput = ref<HTMLInputElement | null>(null)
   const mainUploadMsg = ref('')
   const mainSkipped = ref(false)
   async function onUploadMain() {
     const files = Array.from(mainInput.value?.files || [])
     if (!files.length) return
     const r = dispatchMainDomainFiles(files)
     const okPmis = r.pmis.length ? await pmisUpload(r.pmis) : 0
     const okInputs = r.inputs.length ? await inputsUpload(r.inputs) : 0
     mainUploadMsg.value = formatDispatchMessage(r, okPmis, okInputs)
     mainSkipped.value = r.skipped.length > 0
     if (mainInput.value) mainInput.value.value = ''
     loadFileStatus()
   }
   ```
3. `YITIAN_FILE_NAMES` 局部常量改为从 lib 引入，消除重复定义：
   ```ts
   import { dispatchMainDomainFiles, formatDispatchMessage, YITIAN_FILE_NAMES } from '@/lib/uploadDispatch'
   ```
   并删掉组件内原来那行 `const YITIAN_FILE_NAMES = ['工时.xlsx', 'holidays.csv']`。

模板中：删掉 PMIS 九表下与项目域文件下的两个 `.dv-row.dv-actions` 上传行，在最后一个 `.dv-fgrid` 之后、`el-collapse` 之前插入：

```html
    <div class="dv-row dv-actions">
      <input ref="mainInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
      <button class="dv-btn" data-test="btn-upload-main" @click="onUploadMain">上传主域数据文件</button>
    </div>
    <div v-if="mainUploadMsg" class="dv-row dv-hint" :class="{ warn: mainSkipped }" data-test="upload-main-msg">{{ mainUploadMsg }}</div>
```

样式**无需改动**：`.dv-hint.warn`（跳过不是错误，用 `--warn-text` 不用 `--danger`）已由 Task 2 落在共享的 `@/styles/dataview.css` 里，本组件 `@import` 即得。**不要在组件里重复定义它。**

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/MainDomainSourceCard.test.ts`
Expected: PASS，10 个用例全绿

- [ ] **Step 5: 类型检查 + 提交**

```bash
cd frontend && npm run typecheck
git add frontend/src/components/MainDomainSourceCard.vue frontend/src/components/MainDomainSourceCard.test.ts
git commit -m "feat(data): 主域合并上传(单框按文件名自动分发+跳过项逐个列名给原因)"
```

---

### Task 5: 抽 YitianSourceCard（含瘦身与跳过反馈）

**Files:**
- Create: `frontend/src/components/YitianSourceCard.vue`
- Create: `frontend/src/components/YitianSourceCard.test.ts`
- Modify: `frontend/src/views/DataView.vue`

**Interfaces:**
- Consumes: `useInputFiles` `useFileStatus` `cookieAgent.fetchYitianCookie`（`api.post`）；Task 1 的 `YITIAN_FILE_NAMES`
- Produces:
  ```ts
  defineProps<{ yitianStatus: { sessionPreview: string; updatedAt: string } }>()
  defineEmits<{ (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void }>()
  defineExpose({ reload, onFetchYitianCookie })
  ```

**瘦身点：** 原先内联的 holidays.csv 长格式说明（现 `DataView.vue` 348–353 行的 `.dv-fmt`）**收进 `el-collapse`**。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/YitianSourceCard.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianSourceCard from './YitianSourceCard.vue'
import * as cookieAgent from '@/lib/cookieAgent'

vi.mock('@/lib/cookieAgent', () => ({
  pingAgent: vi.fn().mockResolvedValue(true),
  fetchPmisCookie: vi.fn(),
  fetchYitianCookie: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/files/status')) {
      return { ok: true, json: async () => ({ files: { '工时.xlsx': '2026-07-14 09:00' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
})

const mountCard = async () => {
  const w = mount(YitianSourceCard, {
    props: { yitianStatus: { sessionPreview: '', updatedAt: '' } },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

describe('YitianSourceCard', () => {
  it('渲染倚天两文件与时间', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('工时.xlsx')
    expect(w.text()).toContain('holidays.csv')
    expect(w.text()).toContain('2026-07-14 09:00')
  })

  it('holidays 格式说明收进折叠(卡面瘦身)', async () => {
    const w = await mountCard()
    const heads = w.findAll('.el-collapse-item__header').map((n) => n.text())
    expect(heads.some((t) => t.includes('holidays.csv 格式说明'))).toBe(true)
  })

  it('保留倚天 cookie 钩子并透出传入的状态', async () => {
    const w = mount(YitianSourceCard, {
      props: { yitianStatus: { sessionPreview: 'SESS9', updatedAt: '2026-07-15 10:00' } },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-test="btn-fetch-yitian-cookie"]').exists()).toBe(true)
    expect(w.text()).toContain('SESS9')
    expect(w.text()).toContain('2026-07-15 10:00')
  })

  it('取倚天 cookie 成功 → emit cookie-change', async () => {
    const { api } = await import('@/api/client')
    vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'YT1' } as never)
    vi.mocked(cookieAgent.fetchYitianCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchYitianCookie()
    await flushPromises()
    expect(w.emitted('cookie-change')?.[0]).toEqual([{ sessionPreview: 'YT1', updatedAt: '刚刚' }])
  })

  it('上传非倚天文件 → 不发请求且列入已跳过', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], '项目中心.xlsx')] })
    await w.find('[data-test="btn-upload-yitian"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/inputs/upload'))).toBe(false)
    expect(w.find('[data-test="upload-yitian-msg"]').text()).toContain('已跳过:项目中心.xlsx（不在倚天白名单）')
  })

  it('上传倚天文件 → 打 inputs 端点', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], '工时.xlsx')] })
    await w.find('[data-test="btn-upload-yitian"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/inputs/upload'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/YitianSourceCard.test.ts`
Expected: FAIL —— `Failed to resolve import "./YitianSourceCard.vue"`

- [ ] **Step 3: 建组件**

创建 `frontend/src/components/YitianSourceCard.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { fetchYitianCookie } from '@/lib/cookieAgent'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { YITIAN_FILE_NAMES } from '@/lib/uploadDispatch'

defineProps<{ yitianStatus: { sessionPreview: string; updatedAt: string } }>()
const emit = defineEmits<{
  (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void
}>()

const { upload: inputsUpload } = useInputFiles()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()
const ftime = (name: string) => fileStatus.value[name] || '-'

const yitianInput = ref<HTMLInputElement | null>(null)
const yitianUploadMsg = ref('')
const yitianSkipped = ref(false)
async function onUploadYitian() {
  const files = Array.from(yitianInput.value?.files || [])
  if (!files.length) return
  const accepted = files.filter((f) => YITIAN_FILE_NAMES.includes(f.name))
  const skipped = files.filter((f) => !YITIAN_FILE_NAMES.includes(f.name))
  const ok = accepted.length ? await inputsUpload(accepted) : 0
  let msg = `已上传 ${ok} 个倚天文件，请点[更新数据]生效`
  if (skipped.length) msg += ';已跳过:' + skipped.map((f) => `${f.name}（不在倚天白名单）`).join('、')
  yitianUploadMsg.value = msg
  yitianSkipped.value = skipped.length > 0
  if (yitianInput.value) yitianInput.value.value = ''
  loadFileStatus()
}

/** holidays.csv 模板:前端生成 Blob 下载,不需要后端。 */
function onDownloadHolidayTemplate() {
  const lines = ['日期,类型', '2026-01-01,休', '2026-02-16,休', '2026-02-14,班']
  // BOM 让 Excel 打开不乱码
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'holidays.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

const yitianMsg = ref('')
const yitianErr = ref(false)
async function onFetchYitianCookie() {
  yitianMsg.value = ''; yitianErr.value = false
  const res = await fetchYitianCookie()
  if (!res.ok) { yitianErr.value = true; yitianMsg.value = '倚天 cookie 获取失败：' + res.error; return }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/yitian/cookie', { cookie: res.cookie })
    emit('cookie-change', { sessionPreview: r.sessionPreview, updatedAt: '刚刚' })
    yitianMsg.value = `已获取并存储倚天 cookie（${res.names.length} 项，备用）`
  } catch (e) {
    yitianErr.value = true; yitianMsg.value = '存储失败：' + (e instanceof Error ? e.message : String(e))
  }
}

onMounted(() => { loadFileStatus() })
defineExpose({ reload: loadFileStatus, onFetchYitianCookie })
</script>

<template>
  <div class="dv-card">
    <div class="dv-card-head">倚天工时域</div>
    <div class="dv-sub-head">倚天工时域（input/yitian/）</div>
    <div class="dv-fgrid">
      <div v-for="name in YITIAN_FILE_NAMES" :key="name" class="dv-fcell" :title="name">
        <span class="dv-fname2">{{ name }}</span>
        <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
      </div>
    </div>
    <div class="dv-row dv-actions">
      <input ref="yitianInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
      <button class="dv-btn" data-test="btn-upload-yitian" @click="onUploadYitian">上传倚天文件</button>
      <button class="dv-btn" @click="onDownloadHolidayTemplate">下载 holidays.csv 模板</button>
    </div>
    <div v-if="yitianUploadMsg" class="dv-row dv-hint" :class="{ warn: yitianSkipped }" data-test="upload-yitian-msg">{{ yitianUploadMsg }}</div>

    <div class="dv-row dv-actions">
      <button class="dv-btn" data-test="btn-fetch-yitian-cookie" @click="onFetchYitianCookie">获取本机倚天 cookie 并存储</button>
      <span class="dv-hint">当前 {{ yitianStatus.sessionPreview || '-' }} · 更新于 {{ yitianStatus.updatedAt || '-' }}</span>
    </div>
    <div v-if="yitianMsg" class="dv-row dv-hint" :class="yitianErr ? 'err' : 'ok'">{{ yitianMsg }}</div>

    <el-collapse class="dv-more">
      <el-collapse-item name="holidays-fmt" title="holidays.csv 格式说明">
        <div class="dv-hint dv-fmt">
          holidays.csv 格式（UTF-8，两列）：<code>日期,类型</code>；类型只有两种——
          <code>休</code>=法定假/调休放假（即使落在周一~周五），<code>班</code>=调休上班（即使落在周末）。
          未列出的日期按「周一~周五为工作日」处理。不提供该文件时全站按纯周一~周五近似，
          含节假日的周期饱和度会偏低。
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:holidays.csv 格式说明排版 */
.dv-fmt { padding: var(--sp-1) var(--sp-4) var(--sp-2); line-height: var(--lh-base); }
.dv-fmt code { background: var(--card2, var(--card)); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 0 4px; }
</style>
```

- [ ] **Step 4: 运行组件测试确认通过**

Run: `cd frontend && npx vitest run src/components/YitianSourceCard.test.ts`
Expected: PASS，6 个用例全绿

- [ ] **Step 5: 接进 DataView**

1. `import YitianSourceCard from '@/components/YitianSourceCard.vue'`
2. `sources` 签里的「倚天工时域」卡整块替换为：
   ```html
   <YitianSourceCard ref="yitianCard" :yitian-status="yitianStatus"
     @cookie-change="(v: {sessionPreview:string;updatedAt:string}) => yitianStatus = v" />
   ```
3. 脚本删除：`useInputFiles` 的引入与解构、`YITIAN_FILE_NAMES`、`yitianInput` / `yitianUploadMsg` / `onUploadYitian`、`onDownloadHolidayTemplate`、`yitianMsg` / `yitianErr` / `onFetchYitianCookie`、`useFileStatus` 的引入与解构、`ftime`、`loadFileStatus`。
4. 新增 `const yitianCard = ref<InstanceType<typeof YitianSourceCard> | null>(null)`。
5. `useReprocess` 的 `onDone` 改为（`loadFileStatus` 已不在 DataView）：
   ```ts
   useReprocess({ onDone: () => { data.reload(); mainCard.value?.reload(); yitianCard.value?.reload(); projectTags.load() } })
   ```
6. `defineExpose` 改为：
   ```ts
   defineExpose({
     onFetchPmisCookie: () => mainCard.value?.onFetchPmisCookie(),
     onFetchYitianCookie: () => yitianCard.value?.onFetchYitianCookie(),
     checkAgent,
   })
   ```
7. `onMounted` 中删掉 `loadFileStatus()`（两卡各自加载）。

- [ ] **Step 6: 跑 DataView 测试确认无回归**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: PASS

- [ ] **Step 7: 类型检查 + 提交**

```bash
cd frontend && npm run typecheck
git add frontend/src/components/YitianSourceCard.vue frontend/src/components/YitianSourceCard.test.ts frontend/src/views/DataView.vue
git commit -m "refactor(data): 抽 YitianSourceCard,holidays 格式说明收进折叠+上传跳过反馈"
```

---

### Task 6: 抽 ProjectTagsCard

**Files:**
- Create: `frontend/src/components/ProjectTagsCard.vue`
- Create: `frontend/src/components/ProjectTagsCard.test.ts`
- Modify: `frontend/src/views/DataView.vue`

**Interfaces:**
- Consumes: `useProjectTagsStore`（`tags` `activeTags` `addTag` `renameTag` `disableTag` `save` `load` `loaded`）、`useFilterStore`（`excludeOn` `excludeTags` `setExclude(on, tags)`）
- Produces: 无 props / 无 emits

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/ProjectTagsCard.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectTagsCard from './ProjectTagsCard.vue'
import { useProjectTagsStore } from '@/stores/projectTags'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
})

describe('ProjectTagsCard', () => {
  it('渲染标签库与按标签排除', async () => {
    const tags = useProjectTagsStore()
    tags.load = vi.fn(async () => { tags.$patch({ tags: [{ name: 'BH项目' }, { name: '框架合同' }], loaded: true }) })
    const w = mount(ProjectTagsCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
    await flushPromises()
    expect(w.text()).toContain('项目标签')
    expect(w.text()).toContain('按标签排除')
    expect(w.html()).toContain('BH项目')
  })

  it('添加标签 → 写 store 并保存', async () => {
    const tags = useProjectTagsStore()
    tags.load = vi.fn(async () => { tags.$patch({ tags: [], loaded: true }) })
    const saveSpy = vi.spyOn(tags, 'save').mockResolvedValue(undefined as never)
    const w = mount(ProjectTagsCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
    await flushPromises()
    await w.find('.el-input__inner').setValue('新标签A')
    await w.findAll('button').find((b) => b.text() === '添加')!.trigger('click')
    await flushPromises()
    expect(tags.tags.some((t) => t.name === '新标签A')).toBe(true)
    expect(saveSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/ProjectTagsCard.test.ts`
Expected: FAIL —— `Failed to resolve import "./ProjectTagsCard.vue"`

- [ ] **Step 3: 建组件**

创建 `frontend/src/components/ProjectTagsCard.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'

const projectTags = useProjectTagsStore()
const filter = useFilterStore()

const newTag = ref('')
function onAddTag() { const n = newTag.value.trim(); if (n) { projectTags.addTag(n); projectTags.save(); newTag.value = '' } }
function onRename(oldN: string, e: Event) { const v = (e.target as HTMLInputElement).value.trim(); if (v && v !== oldN) { projectTags.renameTag(oldN, v); projectTags.save() } }
function onDisable(name: string, on: boolean) { projectTags.disableTag(name, on); projectTags.save() }

const excludeOn = computed({ get: () => filter.excludeOn, set: (v: boolean) => filter.setExclude(v, filter.excludeTags) })
const excludeTags = computed({ get: () => filter.excludeTags, set: (v: string[]) => filter.setExclude(filter.excludeOn, v) })

onMounted(() => { if (!projectTags.loaded) projectTags.load() })
</script>

<template>
  <div class="dv-card">
    <div class="dv-card-head">项目标签</div>
    <div class="dv-row dv-tags-mgr">
      <span class="dv-label">标签库</span>
      <span v-for="t in projectTags.tags" :key="t.name" class="dv-tag" :class="{ off: t.disabled }">
        <input class="dv-tag-name" :value="t.name" @change="onRename(t.name, $event)" />
        <el-switch :model-value="!t.disabled" size="small" @update:model-value="(v: boolean) => onDisable(t.name, !v)" />
      </span>
      <el-input v-model="newTag" size="small" placeholder="新标签" style="width: 120px" @keyup.enter="onAddTag" />
      <button class="dv-btn" @click="onAddTag">添加</button>
    </div>
    <div class="dv-row">
      <span class="dv-label">按标签排除</span>
      <el-switch v-model="excludeOn" />
      <el-select v-model="excludeTags" size="small" multiple collapse-tags clearable placeholder="选要排除的标签" style="width: 220px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
      <span class="dv-hint">开启后，挂有所选标签的项目从所有看板隐藏（替代旧纳管）</span>
    </div>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:标签 chip */
.dv-tags-mgr { flex-wrap: wrap; gap: var(--sp-2); }
.dv-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--line); border-radius: var(--r-sm); }
.dv-tag.off { opacity: .5; }
.dv-tag-name { width: 84px; border: none; background: transparent; color: var(--txt); font-size: var(--fs-1); }
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/ProjectTagsCard.test.ts`
Expected: PASS，2 个用例全绿

- [ ] **Step 5: 接进 DataView**

1. `import ProjectTagsCard from '@/components/ProjectTagsCard.vue'`
2. `config` 签里的「项目标签」卡整块替换为 `<ProjectTagsCard />`
3. 脚本删除：`useFilterStore` 引入与 `filter`、`newTag` / `onAddTag` / `onRename` / `onDisable`、`excludeOn` / `excludeTags`。
   **`useProjectTagsStore` 保留**（`useReprocess` 的 `onDone` 仍调 `projectTags.load()`）。
4. `onMounted` 中的 `if (!projectTags.loaded) projectTags.load()` **保留**（reprocess 后需要；组件自身也有一份，`loaded` 守卫保证不重复拉）。

- [ ] **Step 6: 跑 DataView 测试确认无回归**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: PASS

- [ ] **Step 7: 类型检查 + 提交**

```bash
cd frontend && npm run typecheck
git add frontend/src/components/ProjectTagsCard.vue frontend/src/components/ProjectTagsCard.test.ts frontend/src/views/DataView.vue
git commit -m "refactor(data): 抽 ProjectTagsCard(标签库+按标签排除)"
```

---

### Task 7: 抽 MaintenanceCard

**Files:**
- Create: `frontend/src/components/MaintenanceCard.vue`
- Create: `frontend/src/components/MaintenanceCard.test.ts`
- Modify: `frontend/src/views/DataView.vue`

**Interfaces:**
- Consumes: `useDataHistory({ onChange })`（返回 `versions` `preRollback` `source` `busy` `message` `load` `rollback` `undo`）、`manualApi`（`backups()` `import(sheets, name)` `rollback(id)`）、`readWorkbook` / `parseManualSheets`、`useDataStore` `useProjectTagsStore` `useAuthStore`、`YitianStoreCard`
- Produces:
  ```ts
  defineEmits<{ (e: 'data-changed'): void }>()   // 历史回滚/撤销后通知父刷新两张源卡的文件状态
  ```

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/MaintenanceCard.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MaintenanceCard from './MaintenanceCard.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/lib/manualApi', () => ({
  manualApi: {
    backups: vi.fn(async () => ({ success: true, versions: [] })),
    import: vi.fn(async () => ({ success: true, message: '导入成功' })),
    rollback: vi.fn(async () => ({ success: true, message: '已回滚' })),
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
})

const mountCard = async (isSuper = true) => {
  const auth = useAuthStore()
  ;(auth as any).user = { account: 'admin', isSuper, allowedPages: ['*'], allowedL4: ['*'] }
  const w = mount(MaintenanceCard, { global: { plugins: [ElementPlus], stubs: { YitianStoreCard: true } } })
  await flushPromises()
  return w
}

describe('MaintenanceCard', () => {
  it('四个折叠项齐全(人工导入/数据历史/倚天累积数据/清空数据)', async () => {
    const w = await mountCard()
    const t = w.text()
    expect(t).toContain('人工数据导入')
    expect(t).toContain('数据历史')
    expect(t).toContain('倚天累积数据管理')
    expect(t).toContain('清空数据')
  })

  it('保留 manual-import-card 与 history-source-note 钩子', async () => {
    const w = await mountCard()
    expect(w.find('[data-test="manual-import-card"]').exists()).toBe(true)
    const note = w.find('[data-test="history-source-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('源数据仅保留最新 1 份')
    expect(note.text()).toContain('回滚仅还原看板数据')
  })

  it('非超管不渲染倚天累积数据管理(纵深防御)', async () => {
    const w = await mountCard(false)
    expect(w.text()).not.toContain('倚天累积数据管理')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/MaintenanceCard.test.ts`
Expected: FAIL —— `Failed to resolve import "./MaintenanceCard.vue"`

- [ ] **Step 3: 建组件**

创建 `frontend/src/components/MaintenanceCard.vue`。脚本部分把 `DataView.vue` 现 170–241 行（`useDataHistory` 解构、`fmtMB`、`onRollback`、`onUndoRollback`、人工导入全套、`clearState` / `clearing` / `onClear`）**逐字搬过来**，仅把 `useDataHistory` 的 `onChange` 由 `() => { data.reload(); loadFileStatus() }` 改为 `() => { data.reload(); emit('data-changed') }`。模板把现 395–452 行搬过来，去掉 portal 折叠项，并在 history 与 clear 之间插入倚天累积数据折叠项。

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { api } from '@/api/client'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useAuthStore } from '@/stores/auth'
import { useDataHistory } from '@/composables/useDataHistory'
import { readWorkbook, parseManualSheets } from '@/lib/manualImport'
import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'
import YitianStoreCard from '@/components/YitianStoreCard.vue'

const data = useDataStore()
const projectTags = useProjectTagsStore()
const auth = useAuthStore()

const emit = defineEmits<{ (e: 'data-changed'): void }>()

const { versions: historyVersions, preRollback: historyPre, source: historySource, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); emit('data-changed') } })
function fmtMB(bytes?: number) { return bytes ? (bytes / 1048576).toFixed(1) + ' MB' : '-' }
async function onRollback(id: string) {
  try {
    await ElMessageBox.confirm(`确定回滚到 ${id}？将用该版本覆盖当前数据与源数据，当前状态会先备份可撤销。`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await doRollback(id)
}
async function onUndoRollback() {
  try {
    await ElMessageBox.confirm('确定撤销上次回滚，恢复回滚前的状态？', '确认', { type: 'warning' })
  } catch {
    return
  }
  await doUndo()
}

const manImportInput = ref<HTMLInputElement | null>(null)
const manErrors = ref<ManualError[]>([])
const manMsg = ref('')
const manBackups = ref<ManualBackup[]>([])
const manBusy = ref(false)
async function loadManBackups() {
  try { manBackups.value = (await manualApi.backups()).versions ?? [] } catch { /* 无快照时忽略 */ }
}
async function onManImport() {
  const f = manImportInput.value?.files?.[0]; if (!f) return
  manBusy.value = true; manErrors.value = []; manMsg.value = ''
  try {
    const buf = await f.arrayBuffer()
    const sheets = parseManualSheets(readWorkbook(buf))
    if (!Object.keys(sheets).length) { manMsg.value = '未发现「项目标签」或「跟进记录」sheet'; return }
    const res = await manualApi.import(sheets, f.name)
    if (!res.success) { manErrors.value = res.errors ?? []; manMsg.value = res.message || '校验未通过'; return }
    manMsg.value = `导入成功（${res.tags ? '标签 ' + res.tags.projects + ' 项' : ''}${res.followup ? ' 跟进 ' + res.followup.count + ' 条' : ''}）`
    await loadManBackups(); await data.reload(); await projectTags.load()
  } catch (e) {
    manMsg.value = '导入异常：' + (e instanceof Error ? e.message : String(e))
  } finally { manBusy.value = false; if (manImportInput.value) manImportInput.value.value = '' }
}
async function onManRollback(id: string) {
  manBusy.value = true
  try { await manualApi.rollback(id); manMsg.value = '已回滚'; await data.reload(); await projectTags.load() }
  catch (e) { manMsg.value = '回滚失败：' + (e instanceof Error ? e.message : String(e)) }
  finally { manBusy.value = false }
}

const clearState = ref('')
const clearing = ref(false)
async function onClear() {
  try {
    await ElMessageBox.confirm('确定要清空所有数据吗？此操作不可撤销!', '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await ElMessageBox.confirm('再次确认：是否清空所有数据？', '确认', { type: 'warning' })
  } catch {
    return
  }
  clearing.value = true
  data.clearBusinessData()
  try { await api.get('/api/clear-data'); clearState.value = '已清空(含数据文件)' }
  catch { clearState.value = '内存已清空' }
  clearing.value = false
  setTimeout(() => { clearState.value = '' }, 2000)
}

onMounted(() => { loadHistory(); loadManBackups() })
</script>

<template>
  <div class="dv-card">
    <div class="dv-card-head">维护与历史</div>
    <el-collapse class="dv-maint">
      <el-collapse-item name="manual" title="人工数据导入 / 回滚">
        <div data-test="manual-import-card">
          <div class="dv-row">
            <span class="dv-label">导入 xlsx</span>
            <input ref="manImportInput" type="file" accept=".xlsx,.xls" class="dv-file" @change="onManImport" :disabled="manBusy" />
            <span class="dv-hint">仅「项目标签」「跟进记录」sheet 整表替换；导入前自动快照</span>
          </div>
          <div v-if="manMsg" class="dv-row dv-hint ok">{{ manMsg }}</div>
          <table v-if="manErrors.length" class="dv-err u-num">
            <thead><tr><th>Sheet</th><th>行</th><th>列</th><th>错误</th></tr></thead>
            <tbody>
              <tr v-for="(e, i) in manErrors" :key="i">
                <td>{{ e.sheet }}</td><td>{{ e.row }}</td><td>{{ e.col || '-' }}</td><td>{{ e.message }}</td>
              </tr>
            </tbody>
          </table>
          <div v-for="b in manBackups" :key="b.id" class="dv-row" data-test="man-backup-row">
            <span class="dv-label u-num">{{ b.createdAt || b.id }}（标签{{ b.tagProjects ?? 0 }}/跟进{{ b.followupCount ?? 0 }}）</span>
            <button class="dv-btn" :disabled="manBusy" @click="onManRollback(b.id)">回滚到此</button>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item name="history" title="数据历史 / 回滚">
        <div v-if="historyPre" class="dv-row">
          <span class="dv-label">撤销</span>
          <button class="dv-btn ghost" :disabled="historyBusy" @click="onUndoRollback">撤销上次回滚</button>
          <span class="dv-hint">恢复到最近一次回滚前的状态</span>
        </div>
        <div v-if="!historyVersions.length" class="dv-row dv-hint">暂无历史版本，"更新数据"成功后会自动保存（保留最近 5 份）。</div>
        <div v-for="v in historyVersions" :key="v.id" class="dv-row" data-test="history-row">
          <span class="dv-label u-num">{{ v.createdAt || v.id }}</span>
          <span class="dv-hint u-num">项目 {{ v.projectCount ?? '-' }} · 节点 {{ v.paymentNodeCount ?? '-' }} · {{ fmtMB(v.sizeBytes) }}</span>
          <button class="dv-btn" :disabled="historyBusy" data-test="history-rollback" @click="onRollback(v.id)">回滚到此</button>
        </div>
        <div class="dv-row dv-hint" data-test="history-source-note">
          源数据仅保留最新 1 份<template v-if="historySource?.refreshedAt">（来自 {{ historySource.refreshedAt }}{{ historySource.sizeBytes ? ' · ' + fmtMB(historySource.sizeBytes) : '' }}）</template>，回滚仅还原看板数据。
        </div>
        <div v-if="historyMsg" class="dv-row dv-hint ok">{{ historyMsg }}</div>
      </el-collapse-item>

      <el-collapse-item v-if="auth.isSuper" name="yitian-store" title="倚天累积数据管理（超管）">
        <YitianStoreCard />
      </el-collapse-item>

      <el-collapse-item name="clear">
        <template #title><span class="dv-danger-title">清空数据 ⚠</span></template>
        <div class="dv-row">
          <button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button>
          <span v-if="clearState" class="dv-hint ok">{{ clearState }}</span>
          <span class="dv-hint">删除所有已获取数据与看板，不可撤销（两步确认）。</span>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:人工导入校验错误表 + 危险区标题 */
.dv-err { width: 100%; border-collapse: collapse; font-size: var(--fs-1); margin: var(--sp-2) 0; }
.dv-err th, .dv-err td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--danger-text); }
.dv-danger-title { color: var(--danger-text); font-weight: 700; }
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/MaintenanceCard.test.ts`
Expected: PASS，3 个用例全绿

- [ ] **Step 5: 接进 DataView（DataView 至此成为瘦壳）**

1. `import MaintenanceCard from '@/components/MaintenanceCard.vue'`
2. `maint` 签内容整块替换为：
   ```html
   <MaintenanceCard @data-changed="reloadSources" />
   ```
3. 脚本删除：`useDataHistory` / `manualApi` / `manualImport` / `ElMessageBox` / `api`（若已无其他用途）的引入，以及历史、人工导入、清空的全部脚本（现 170–241 行对应内容）。
4. 新增：
   ```ts
   function reloadSources() { mainCard.value?.reload(); yitianCard.value?.reload() }
   ```
5. 至此 `DataView.vue` 的 `<script setup>` 应只剩：store 引用、`lastUpdate` / `lastPmis`、`activeTab`、`mainCard` / `yitianCard` refs、`dlRunning`、`cookieStatus` / `yitianStatus` + 两个 `load*Status`、`agentOnline` + `checkAgent`、`useReprocess`、`reloadSources`、`onMounted`、`defineExpose`。

- [ ] **Step 6: 跑全量前端测试并确认退出码**

```bash
cd frontend && npm run test:run; echo "EXIT=$?"
```
Expected: 全绿且 **`EXIT=0`**。
**若用例全绿但 `EXIT` 非 0**：是子组件 `onMounted` 的未处理拒绝逸出（V3.3.0 踩过）。到 `DataView.test.ts` 里给未 stub 的子组件补 stub，或让 `fetch` stub 覆盖其请求路径，直到 `EXIT=0`。

- [ ] **Step 7: 类型检查 + 提交**

```bash
cd frontend && npm run typecheck
git add frontend/src/components/MaintenanceCard.vue frontend/src/components/MaintenanceCard.test.ts frontend/src/views/DataView.vue
git commit -m "refactor(data): 抽 MaintenanceCard(含倚天累积数据),DataView 收敛为瘦壳"
```

---

### Task 8: 版本号、PROGRESS、全量验证与目验

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V3.5.0'
export const RELEASE_DATE = '2026-07-16'
```
（`RELEASE_DATE` 用实际发版日）

- [ ] **Step 2: 跑全量 verify**

```bash
bash verify.sh; echo "EXIT=$?"
```
Expected: 全绿且 `EXIT=0`（后端 pytest + 前端 typecheck/vitest/build）。

- [ ] **Step 3: 目验（纯前端改动仍须做，不可跳过）**

```bash
python server.py           # 另开一个终端
cd frontend && npm run dev
```

用超管账号进 `http://localhost:5173/data`，逐条确认：

| # | 检查项 | 期望 |
|---|---|---|
| 1 | 三签可切，冷加载默认落「数据源」 | 是 |
| 2 | 状态条与「更新数据」在任何签下都可见 | 是 |
| 3 | 点「更新数据」SSE 进度条走动、文案更新、完成后两卡文件时间刷新 | 是 |
| 4 | 主域卡：九表 9 行 + 根文件列表齐、时间正确 | 是 |
| 5 | 主域合并上传：混投九表+根文件+`工时.xlsx`+乱名文件 → 前两类上传成功、后两类列入「已跳过」并给出原因 | 是 |
| 6 | 「已跳过」行在 **暗色主题** 下颜色可读（`--warn-text`，不是刺眼白块也不是看不见） | 是 |
| 7 | 倚天卡：holidays 说明在折叠里、模板可下载、cookie 行正常 | 是 |
| 8 | 配置签：标签库可增改禁用、按标签排除生效、倚天合规两项、门户卡 | 是 |
| 9 | 维护签：人工导入、数据历史、倚天累积数据管理、清空数据（两步确认） | 是 |
| 10 | light / dark 两主题都正常 | 是 |
| 11 | 窄屏（< 768px）两栏降单栏 | 是 |
| 12 | 全程 console 无报错 | 是 |

**第 6 项必须实拍确认** —— 上一版（V3.2.0）的教训是颜色问题单测与 diff 全部放过，只有暗色实拍才逮得到。

- [ ] **Step 4: 更新 PROGRESS.md**

把 V3.5.0 条目从 `in_progress` 改为完成，记：三签信息架构、PMIS/项目域合并、上传分发、组件拆分、纯前端（只换 `dist/`，无需更新数据/重启/新授权）、线上基线 V3.4.0。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V3.5.0 /data Tab 化重设计"
```

---

## Self-Review

**1. Spec coverage**

| Spec 章节 | 覆盖任务 |
|---|---|
| §0 全局约束 | Global Constraints（逐条抄入，含禁用字样、禁 `lazy`、两步确认、退出码） |
| §1.3 白名单互斥 / 倚天串域 / legacy / 静默跳过 | Task 1（含两条回归护栏测试） |
| §1.4 data-test 全存活 | Global Constraints + Task 3/5/7 各自断言 |
| §1.5 陷阱一（退出码） | Task 7 Step 6、Task 8 Step 2 |
| §1.5 陷阱二（禁 `lazy` / `isVisible`） | Global Constraints、Task 2 Step 1 |
| §2 骨架 / 常驻头 / tab 不持久化 | Task 2 |
| §2.1 签内容映射 | Task 2（搬运规则逐条） |
| §2.2 累积数据→维护、按标签排除留配置 | Task 2 Step 3 + Task 6/7 |
| §3 组件拆分表 | Task 3/5/6/7 |
| §3.1 协作契约（cookie / useFileStatus 各自实例 / reload / 互斥禁用） | 组件契约块 + Task 3 Step 5、Task 5 Step 5、Task 7 Step 5 |
| §3.2 defineExpose 转发 | Task 3 Step 5.6、Task 5 Step 5.6 |
| §4 栅格 / 断点 / tabs 样式 / `.dv-*` 复用不新造命名 | Task 2 Step 5–6（抽 `styles/dataview.css`，四卡 `@import`；预检发现计划原稿要求四份逐字拷贝，与审查规则冲突，已按 `followup.css` 先例改） |
| §5 合并上传行为与文案、抽纯函数、TDD | Task 1 + Task 4 |
| §6 错误处理沿用 | Task 3/5/7 的代码逐字保留原有分支 |
| §7 测试（新增/改造/回归/目验） | Task 1/3/4/5/6/7 + Task 8 Step 3 |
| §8 不做清单 | 计划中无对应任务（正确） |
| §9 发版 | Task 8 |

无遗漏。

**2. Placeholder scan**

无 TBD / TODO / "similar to Task N" / "add appropriate error handling"。每个改代码的步骤都带完整代码或逐条搬运规则（附精确行号）。

**3. Type consistency**

- `dispatchMainDomainFiles` / `formatDispatchMessage` / `YITIAN_FILE_NAMES` / `DispatchResult` / `SkipReason` —— Task 1 定义，Task 4（主域）与 Task 5（倚天复用 `YITIAN_FILE_NAMES`）引用，名称一致。
- `reload` / `onFetchPmisCookie` / `onFetchYitianCookie` —— 组件契约块定义，Task 3/5 `defineExpose`，Task 3/5/7 在 DataView 侧调用，一致。
- `cookie-change` payload `{ sessionPreview, updatedAt }` —— 契约块、Task 3、Task 5、DataView 接线一致。
- `running-change` / `download-done` / `data-changed` —— 契约块与 Task 3/7 一致。
- `dlRunning`（DataView 侧本地 ref，由 `running-change` 写入）与 `repRunning`（prop 下发）构成 §3.1 的互斥闭环，Task 3 测试有覆盖。
