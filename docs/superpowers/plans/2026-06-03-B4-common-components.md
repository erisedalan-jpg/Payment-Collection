# Plan B4：通用组件 DataTable / ChartBox / Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立页面（B5+）复用的三个通用组件：`DataTable`（封装 el-table：列配置/格式化/排序/截断 tooltip）、`ChartBox`（封装 vue-echarts + 主题）、`Modal`（封装 el-dialog）。先补 Element Plus/ECharts 的 jsdom 测试垫片。

**Architecture:** 纯前端。组件是新的可复用封装（非旧代码直接移植）。`DataTable` 一处实现取代旧版 10+ 处重复表格渲染。Phase B 第四块，自成可测闭环；页面 B5+ 将基于这三件落地。

**Tech Stack:** Vue 3 `<script setup>` + TS + Element Plus（el-table/el-dialog）+ ECharts/vue-echarts + Vitest + @vue/test-utils（已装）。

参考：spec §6（通用组件）；列配置形状对齐数据契约 `displayColumns {key,label,visible}`（A1）。

**测试环境要点：** Element Plus 的 el-table/el-dialog 在 jsdom 下依赖 `ResizeObserver`/`matchMedia`；ECharts 需 canvas（jsdom 无）。故：Task 1 加全局测试垫片（ResizeObserver/matchMedia）；ChartBox 测试 **stub VChart**（不真实渲染 canvas）。

**不在本计划（拆到 B5+/后续）：** 各页面真实内容（B5+）；DataTable 的 Excel 导出与列枚举筛选弹窗（页面需要时再加，或 B-opt）；图表的复杂自定义图例（按页面需要再补）。

---

## File Structure（B4 产出）

```
frontend/
├── vitest.setup.ts                 # 新增：ResizeObserver/matchMedia 垫片
├── vite.config.ts                  # 改：test.setupFiles 引入 vitest.setup.ts
└── src/
    ├── components/DataTable.vue + .test.ts
    ├── components/Modal.vue + .test.ts
    ├── charts/echartsTheme.ts      # 'ent' 主题注册（最小色板）
    └── charts/ChartBox.vue + .test.ts
```

约定：从 `frontend/` 运行 npm；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，Bash 工具。

---

### Task 1: Vitest 测试垫片（Element Plus / ECharts 友好）

**Files:** Create `frontend/vitest.setup.ts`；Modify `frontend/vite.config.ts`。

- [ ] **Step 1: 创建 `frontend/vitest.setup.ts`**

```ts
import { vi } from 'vitest'

// el-table / el-dialog 等依赖 ResizeObserver（jsdom 无）
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!(globalThis as any).ResizeObserver) {
  ;(globalThis as any).ResizeObserver = ResizeObserverStub
}

// Element Plus 部分组件用 matchMedia（jsdom 无）
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
```

- [ ] **Step 2: 在 `frontend/vite.config.ts` 引入 setup**

把 `test` 配置的 `setupFiles: []` 改为 `setupFiles: ['./vitest.setup.ts']`。其余不变。

- [ ] **Step 3: 确认现有测试仍通过（垫片不破坏现状）**

Run: `cd frontend && npm run test:run`
Expected: 全部现有测试仍通过（41）。

- [ ] **Step 4: 提交**

```bash
git add frontend/vitest.setup.ts frontend/vite.config.ts
git commit -m "test(frontend): 加 ResizeObserver/matchMedia 垫片（支持 Element Plus 组件测试）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DataTable（封装 el-table）

**Files:** Create `frontend/src/components/DataTable.vue`、`frontend/src/components/DataTable.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/DataTable.test.ts
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DataTable, { type DataColumn } from './DataTable.vue'

const columns: DataColumn[] = [
  { key: 'name', label: '名称' },
  { key: 'amount', label: '金额', formatter: (v) => `¥${v}` },
]
const rows = [
  { name: 'A', amount: 100 },
  { name: 'B', amount: 200 },
]

describe('DataTable', () => {
  it('renders column headers and the row count', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('名称')
    expect(text).toContain('金额')
    expect(text).toContain('共 2 条')
  })

  it('applies the column formatter to cell values', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('¥100')
  })

  it('hides count when countLabel is false', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows, countLabel: false }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('共 2 条')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写实现 `frontend/src/components/DataTable.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

export interface DataColumn {
  key: string
  label: string
  width?: number | string
  sortable?: boolean
  /** 单元格格式化；返回展示字符串 */
  formatter?: (value: any, row: Record<string, any>) => string
}

const props = withDefaults(
  defineProps<{
    columns: DataColumn[]
    rows: Record<string, any>[]
    countLabel?: boolean
  }>(),
  { countLabel: true },
)

const count = computed(() => props.rows.length)
</script>

<template>
  <div class="data-table">
    <div v-if="props.countLabel" class="dt-count">共 {{ count }} 条</div>
    <el-table :data="props.rows" border stripe style="width: 100%">
      <el-table-column
        v-for="col in props.columns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        :width="col.width"
        :sortable="!!col.sortable"
        show-overflow-tooltip
      >
        <template #default="scope">
          {{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.data-table { width: 100%; }
.dt-count { font-size: 12px; color: #94a3b8; margin: 4px 0; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: PASS（3 passed）。
若 el-table 在 jsdom 下未渲染单元格内容（`¥100` 断言失败，但表头/计数通过），说明 el-table 的行渲染在 jsdom 受限：此时保留"表头 + 计数"两个断言，把"formatter 单元格"断言改为对组件渲染产物的检查（例如断言 `wrapper.findAll('.el-table__row').length === 2` 或 `wrapper.html()` 含 `¥100`）；若仍不稳定，则把 formatter 断言改为直接调用列的 formatter（`columns[1].formatter!(100, rows[0]) === '¥100'`）以验证格式化逻辑本身。报告你最终采用的断言方式与原因。

- [ ] **Step 5: 类型检查**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "feat(frontend): DataTable 通用表格（封装 el-table：列配置/格式化/排序/tooltip）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ChartBox（封装 vue-echarts）

**Files:** Create `frontend/src/charts/echartsTheme.ts`、`frontend/src/charts/ChartBox.vue`、`frontend/src/charts/ChartBox.test.ts`。

- [ ] **Step 1: 创建主题 `frontend/src/charts/echartsTheme.ts`**

```ts
import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

// 'ent' 主题：最小色板（沿用旧版主色系）
export const ENT_THEME = 'ent'
registerTheme(ENT_THEME, {
  color: ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif' },
})
```

- [ ] **Step 2: 写失败测试 `frontend/src/charts/ChartBox.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartBox from './ChartBox.vue'

// stub vue-echarts（jsdom 无 canvas，不真实渲染），捕获传入的 option
const VChartStub = {
  name: 'VChart',
  props: ['option', 'theme', 'autoresize'],
  template: '<div class="vchart-stub">{{ Object.keys(option || {}).join(",") }}</div>',
}

describe('ChartBox', () => {
  it('renders a chart container and forwards the option to VChart', () => {
    const wrapper = mount(ChartBox, {
      props: { option: { series: [], xAxis: {} } },
      global: { stubs: { VChart: VChartStub } },
    })
    expect(wrapper.find('.chart-box').exists()).toBe(true)
    expect(wrapper.find('.vchart-stub').text()).toContain('series')
  })

  it('applies the given height', () => {
    const wrapper = mount(ChartBox, {
      props: { option: {}, height: '480px' },
      global: { stubs: { VChart: VChartStub } },
    })
    expect((wrapper.find('.chart-box').element as HTMLElement).style.height).toBe('480px')
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `cd frontend && npx vitest run src/charts/ChartBox.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 4: 写实现 `frontend/src/charts/ChartBox.vue`**

```vue
<script setup lang="ts">
import VChart from 'vue-echarts'
import { ENT_THEME } from './echartsTheme'

withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  { height: '320px' },
)
</script>

<template>
  <div class="chart-box" :style="{ height }">
    <VChart :option="option" :theme="ENT_THEME" autoresize />
  </div>
</template>

<style scoped>
.chart-box { width: 100%; }
.chart-box :deep(.echarts) { width: 100%; height: 100%; }
</style>
```

- [ ] **Step 5: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/charts/ChartBox.test.ts`（2 passed）
Run: `cd frontend && npm run typecheck`（通过）

注：测试用 `global.stubs.VChart` 替换模板里的 `<VChart>`，故不真实加载 ECharts canvas。`echartsTheme.ts` 的 `use(...)`/`registerTheme(...)` 在导入时执行，不需要 canvas，安全。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/charts/echartsTheme.ts frontend/src/charts/ChartBox.vue frontend/src/charts/ChartBox.test.ts
git commit -m "feat(frontend): ChartBox（封装 vue-echarts + ent 主题/按需注册）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Modal（封装 el-dialog）

**Files:** Create `frontend/src/components/Modal.vue`、`frontend/src/components/Modal.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/Modal.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Modal from './Modal.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('Modal', () => {
  it('renders title and default slot content when open', async () => {
    const wrapper = mount(Modal, {
      props: { modelValue: true, title: '测试标题' },
      slots: { default: '<p>内容X</p>' },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    // el-dialog append-to-body → 内容渲染到 document.body
    expect(document.body.textContent).toContain('测试标题')
    expect(document.body.textContent).toContain('内容X')
    wrapper.unmount()
  })

  it('does not render content when closed', async () => {
    const wrapper = mount(Modal, {
      props: { modelValue: false, title: '关闭态' },
      slots: { default: '<p>隐藏内容</p>' },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).not.toContain('隐藏内容')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/Modal.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写实现 `frontend/src/components/Modal.vue`**

```vue
<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title?: string
  width?: string | number
}>()
defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="width || '50%'"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/components/Modal.test.ts`
Expected: PASS（2 passed）。
若 el-dialog 的 teleport/append-to-body 在测试中导致内容查不到：确认 `attachTo: document.body` 已设；如仍不稳定，改为断言 `wrapper.html()` 或用 `document.querySelector('.el-dialog')`。`关闭态`用例中 el-dialog 默认 `v-if`/`destroy-on-close` 行为可能保留 DOM——若 `not.toContain('隐藏内容')` 失败，给 el-dialog 加 `:destroy-on-close="true"` 后重测；报告最终方式。

- [ ] **Step 5: 类型检查**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/Modal.vue frontend/src/components/Modal.test.ts
git commit -m "feat(frontend): Modal（封装 el-dialog：v-model/title/slots）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 收尾——verify 全绿 + 更新 PROGRESS

**Files:** Modify `PROGRESS.md`。

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 75 pytest + 前端 typecheck/vitest/build 全绿）。失败则 BLOCKED。

- [ ] **Step 2: 更新 PROGRESS.md**

在 "🟦 Phase B 前端"：
- B4 行改 `[x]`：
  ```
  - [x] **B4** 通用组件：DataTable（封装 el-table：列配置/格式化/排序/截断 tooltip）、ChartBox（封装 vue-echarts + ent 主题）、Modal（封装 el-dialog）；并加 Vitest 的 ResizeObserver/matchMedia 垫片。
  ```
- 确认 `B5+`（页面）存在；若描述需要，补一句"基于 DataTable/ChartBox/Modal 落地各页"。保留 `B-opt`（并可追加：DataTable 的 Excel 导出 + 列枚举筛选弹窗待页面需要时实现）。
- 更新"最近更新"为 `2026-06-03`。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 B4 通用组件完成；页面 B5+ 基于三件落地

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 spec §6 通用组件）：**
- DataTable（封装 el-table：列配置/格式化/排序/tooltip）→ Task 2 ✓
- ChartBox（封装 vue-echarts + 主题）→ Task 3 ✓
- Modal（封装 el-dialog）→ Task 4 ✓
- 测试基建（EP/ECharts jsdom 垫片）→ Task 1 ✓
- **明确延后**：DataTable 的 Excel 导出 + 列枚举筛选弹窗（页面需要时/B-opt）；复杂自定义图例（按页面需要）。**B5+**：页面。

**Placeholder scan：** 组件/主题/测试均给出完整代码；命令含预期输出。Task 2/4 对 el-table/el-dialog 在 jsdom 下渲染的潜在不稳定给出了明确的断言降级方案并要求报告。无 TBD/TODO。

**一致性：** `DataColumn`（key/label/width/sortable/formatter）与数据契约 `displayColumns {key,label,visible}` 形状相容（页面可由后者映射出前者）；`ChartBox` 用 `ENT_THEME` 常量；三组件均 `<script setup>` + Element Plus（已在 main.ts 全局注册，测试中按需 `global.plugins:[ElementPlus]` 或 stub）。

**风险点：**
- jsdom + Element Plus/ECharts 是本计划主要风险：Task 1 垫片 + ChartBox stub VChart + Task 2/4 的断言降级方案共同兜底。
- DataTable 用 `Record<string, any>` 行类型（非泛型）以降低 SFC 泛型 + el-table 类型的复杂度；页面传 RawNode[]/projects[] 均可。
- bundle 体积已知告警（B-opt 跟踪），本计划不处理。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
