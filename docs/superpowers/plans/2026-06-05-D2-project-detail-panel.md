# Plan D2：全局项目详情面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个全局、可复用的"项目详情"抽屉面板——任意页面调用 `useProjectDetailStore().open(projectId)` 即弹出，展示该项目的聚合信息 + 其全部回款节点明细，全站一致、逻辑复用。

**Architecture:** 一个纯函数 `lib/projectDetail.buildProjectDetail(rawNodes, projectId)`（复用现有 `groupByProject`）产出 `{ project, nodes }`；一个极简全局单例 store `stores/projectDetail`（`openId` + `open/close/visible`）；一个 `ProjectDetailDrawer.vue`（基于 Element Plus `el-drawer`，读 store + dataStore，渲染项目汇总网格 + 节点明细 `DataTable`），在 `AppLayout` 全局挂载一次，使任意页面可唤起。颜色吃 D1 的主题变量。

**Tech Stack:** Vue3 `<script setup lang="ts">`、Pinia、Element Plus（el-drawer / el-table）、Vitest + @vue/test-utils（jsdom）。

参考设计：`docs/superpowers/specs/2026-06-04-phase-d-frontend-redesign-design.md` 决策 6 与 §4.2。

## 范围说明（重要，与 spec 的差异已记录）

spec 中 D2 含"上下文跳转机制（navContext）"。但 navContext 的真实消费者（看板排名/多维看板下钻带筛选跳转）依赖尚不存在的路由 `/board`（D4）等；现有页面要么已有内联下钻（回款台账）、要么将在 D3-D10 被重写或删除（看板首页/日历/项目经理视图）。按 YAGNI，**本计划只交付"全局项目详情面板"地基**，navContext 与各页"点项目→唤起面板/带筛选跳转"的接入，挪到有真实消费者的 D3（看板首页延期项）、D4（多维看板下钻 + navContext）、D7（日历选中日明细）。面板本身在本计划全量测试覆盖，属与 D1 同类的"地基先行、消费者随后"模式，不产生废弃代码。

## 文件结构（本计划涉及）

- Create `frontend/src/lib/projectDetail.ts` —— 纯函数 buildProjectDetail（项目聚合 + 全部节点）。
- Create `frontend/src/lib/projectDetail.test.ts` —— 纯函数单测。
- Create `frontend/src/stores/projectDetail.ts` —— 全局单例 store（openId/open/close/visible）。
- Create `frontend/src/stores/projectDetail.test.ts` —— store 单测。
- Create `frontend/src/components/ProjectDetailDrawer.vue` —— 抽屉面板（汇总网格 + 节点明细表）。
- Create `frontend/src/components/ProjectDetailDrawer.test.ts` —— 组件单测。
- Modify `frontend/src/layout/AppLayout.vue` —— 全局挂载 ProjectDetailDrawer。
- Modify `PROGRESS.md` —— 记录 D2 完成。

> 命令约定同 D1：测试在 `frontend/` 下跑。单文件 `npx vitest run <相对 src 路径>`；全量 `npm run test:run`；类型 `npm run typecheck`；构建 `npm run build`；提交在仓库根 `C:\Users\tjusu\Desktop\cc\work\tools\Payment Collection`。

---

### Task 1：buildProjectDetail 纯函数

**Files:**
- Create: `frontend/src/lib/projectDetail.ts`
- Test: `frontend/src/lib/projectDetail.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/projectDetail.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildProjectDetail } from './projectDetail'
import type { RawNode } from '@/types/analysis'

const nodes = [
  { projectId: 'P1', projectName: '甲项目', orgL4: '一部', projectManager: '张', tier: '100万以上', isPaymentRelated: true, expectedPayment: 200000, actualPayment: 50000, nodeStatus: '延期' },
  { projectId: 'P1', projectName: '甲项目', isPaymentRelated: false, nodeStatus: '' },
  { projectId: 'P2', projectName: '乙项目', isPaymentRelated: true, expectedPayment: 100000, actualPayment: 100000, nodeStatus: '已全额回款' },
] as unknown as RawNode[]

describe('buildProjectDetail', () => {
  it('聚合该项目并返回其全部节点(含非回款节点)', () => {
    const d = buildProjectDetail(nodes, 'P1')
    expect(d.project?.projectId).toBe('P1')
    expect(d.project?.projectName).toBe('甲项目')
    expect(d.nodes.length).toBe(2)
    expect(d.project?.expectedPayment).toBe(200000)
    expect(d.project?.actualPayment).toBe(50000)
    expect(d.project?.paymentStatus).toBe('延期')
  })
  it('未知 id 返回 project=null、nodes=[]', () => {
    const d = buildProjectDetail(nodes, 'NOPE')
    expect(d.project).toBeNull()
    expect(d.nodes).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/projectDetail.test.ts`
Expected: FAIL（找不到模块 / buildProjectDetail 未定义）。

- [ ] **Step 3: 写实现**

`frontend/src/lib/projectDetail.ts`：

```ts
import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'

export interface ProjectDetail {
  project: ProjectAgg | null
  nodes: RawNode[]
}

/**
 * 按 projectId 从全量 rawNodes 构建项目详情：项目聚合(复用 groupByProject) + 该项目全部节点。
 * 详情是对单个项目的"下钻查看"，不经纳管/年份/视角过滤——展示项目完整面貌。
 */
export function buildProjectDetail(rawNodes: RawNode[], projectId: string): ProjectDetail {
  const nodes = rawNodes.filter((n) => (n as Record<string, any>).projectId === projectId)
  if (!nodes.length) return { project: null, nodes: [] }
  return { project: groupByProject(nodes)[0], nodes }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/projectDetail.test.ts`
Expected: PASS（2 用例）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/projectDetail.ts frontend/src/lib/projectDetail.test.ts
git commit -m "feat(D2): buildProjectDetail 纯函数(项目聚合+全部节点)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2：projectDetail store（全局单例）

**Files:**
- Create: `frontend/src/stores/projectDetail.ts`
- Test: `frontend/src/stores/projectDetail.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/stores/projectDetail.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectDetailStore } from './projectDetail'

beforeEach(() => setActivePinia(createPinia()))

describe('projectDetail store', () => {
  it('open 设置 id 与 visible；close 清空', () => {
    const s = useProjectDetailStore()
    expect(s.visible).toBe(false)
    s.open('P1')
    expect(s.openId).toBe('P1')
    expect(s.visible).toBe(true)
    s.close()
    expect(s.openId).toBeNull()
    expect(s.visible).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/projectDetail.test.ts`
Expected: FAIL（找不到模块）。

- [ ] **Step 3: 写实现**

`frontend/src/stores/projectDetail.ts`：

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 全局单例：任意页面调用 open(projectId) 即唤起项目详情抽屉。
export const useProjectDetailStore = defineStore('projectDetail', () => {
  const openId = ref<string | null>(null)
  const visible = computed(() => openId.value !== null)
  function open(id: string) {
    openId.value = id
  }
  function close() {
    openId.value = null
  }
  return { openId, visible, open, close }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/projectDetail.test.ts`
Expected: PASS（1 用例）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/projectDetail.ts frontend/src/stores/projectDetail.test.ts
git commit -m "feat(D2): projectDetail 全局单例 store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3：ProjectDetailDrawer 抽屉组件

**Files:**
- Create: `frontend/src/components/ProjectDetailDrawer.vue`
- Test: `frontend/src/components/ProjectDetailDrawer.test.ts`

> 复用：`DataTable`（el-table 封装）+ `formatCellValue`（单元格格式化）+ `fmtYuan/fmtRatio`（汇总）。测试用桩替换 `el-drawer`（teleport 内容在 jsdom 不易断言），让插槽内容直接渲染到 wrapper。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/ProjectDetailDrawer.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectDetailDrawer from './ProjectDetailDrawer.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

const DrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'size'],
  template: '<div class="drawer-stub"><slot /></div>',
}

const rawNodes = [
  { projectId: 'P1', projectName: '甲项目', orgL4: '一部', projectManager: '张', projectType: '集成', tier: '100万以上', projectAmount: 1500000, isPaymentRelated: true, nodeName: '验收款', planDate: '2026-06-08', expectedPayment: 200000, actualPayment: 50000, actualPaymentRatio: 0.25, nodeStatus: '延期', delayDays: 12 },
  { projectId: 'P1', projectName: '甲项目', isPaymentRelated: false, nodeName: '启动会', nodeStatus: '' },
]

function mountDrawer() {
  return mount(ProjectDetailDrawer, {
    global: { plugins: [ElementPlus], stubs: { ElDrawer: DrawerStub } },
  })
}

describe('ProjectDetailDrawer', () => {
  it('打开时渲染项目汇总与节点明细', () => {
    const data = useDataStore()
    data.data = { rawNodes } as any
    useProjectDetailStore().open('P1')
    const w = mountDrawer()
    expect(w.text()).toContain('甲项目')
    expect(w.text()).toContain('项目经理')
    expect(w.text()).toContain('回款节点明细（2）')
    expect(w.text()).toContain('验收款')
  })

  it('未知项目显示空态', () => {
    const data = useDataStore()
    data.data = { rawNodes } as any
    useProjectDetailStore().open('NOPE')
    const w = mountDrawer()
    expect(w.text()).toContain('未找到该项目数据')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ProjectDetailDrawer.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写组件**

`frontend/src/components/ProjectDetailDrawer.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useDataStore } from '@/stores/data'
import { buildProjectDetail } from '@/lib/projectDetail'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtYuan, fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from './DataTable.vue'

const pd = useProjectDetailStore()
const data = useDataStore()

const visible = computed({
  get: () => pd.visible,
  set: (v: boolean) => {
    if (!v) pd.close()
  },
})

const detail = computed(() =>
  pd.openId
    ? buildProjectDetail((data.data?.rawNodes ?? []) as never, pd.openId)
    : { project: null, nodes: [] },
)

const NODE_COLS: DataColumn[] = [
  { key: 'nodeName', label: '节点' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款' },
  { key: 'actualPayment', label: '已回款' },
  { key: 'actualPaymentRatio', label: '实际比例' },
  { key: 'nodeStatus', label: '状态' },
  { key: 'delayDays', label: '延期天数' },
].map((c) => ({ ...c, formatter: (v: unknown) => formatCellValue(v, c.key) }))

const summary = computed(() => {
  const p = detail.value.project
  if (!p) return []
  return [
    { k: '项目编号', v: p.projectId },
    { k: '项目名称', v: p.projectName || '-' },
    { k: '服务组(L4)', v: p.orgL4 || '-' },
    { k: '项目经理', v: p.projectManager || '-' },
    { k: '项目类型', v: p.projectType || '-' },
    { k: '金额区间', v: p.tier || '-' },
    { k: '项目金额', v: fmtYuan(p.projectAmount) },
    { k: '回款状态', v: p.paymentStatus },
    { k: '完成率', v: fmtRatio(p.paymentRatio) },
    { k: '计划回款', v: fmtYuan(p.expectedPayment) },
    { k: '已回款', v: fmtYuan(p.actualPayment) },
    { k: '待回款', v: fmtYuan(p.remainingAmount) },
  ]
})
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="detail.project ? detail.project.projectName || detail.project.projectId : '项目详情'"
    size="600px"
    append-to-body
  >
    <div v-if="detail.project" class="pd">
      <div class="pd-grid">
        <div v-for="item in summary" :key="item.k" class="pd-cell">
          <span class="pd-k">{{ item.k }}</span>
          <span class="pd-v">{{ item.v }}</span>
        </div>
      </div>
      <div class="pd-nodes-title">回款节点明细（{{ detail.nodes.length }}）</div>
      <DataTable :columns="NODE_COLS" :rows="detail.nodes" :show-count="false" />
    </div>
    <div v-else class="pd-empty">未找到该项目数据</div>
  </el-drawer>
</template>

<style scoped>
.pd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin-bottom: 16px; }
.pd-cell { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px;
  background: var(--card2); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.pd-k { color: var(--mut); }
.pd-v { color: var(--txt); font-weight: 600; text-align: right; }
.pd-nodes-title { font-weight: 700; color: var(--accent); font-size: 13px; margin-bottom: 8px; }
.pd-empty { color: var(--mut); padding: 24px; text-align: center; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/ProjectDetailDrawer.test.ts`
Expected: PASS（2 用例）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ProjectDetailDrawer.vue frontend/src/components/ProjectDetailDrawer.test.ts
git commit -m "feat(D2): ProjectDetailDrawer 项目详情抽屉(汇总+节点明细)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4：全局挂载 + 验证 + PROGRESS

**Files:**
- Modify: `frontend/src/layout/AppLayout.vue`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 在 AppLayout 全局挂载抽屉**

把 `frontend/src/layout/AppLayout.vue` 整体替换为：

```vue
<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import FilterBar from './FilterBar.vue'
import ProjectDetailDrawer from '@/components/ProjectDetailDrawer.vue'
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <FilterBar />
        <router-view />
      </main>
    </div>
    <ProjectDetailDrawer />
  </div>
</template>

<style scoped>
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.app-body { display: flex; flex: 1; min-height: 0; }
.app-main { flex: 1; overflow: auto; background: var(--bg); }
</style>
```

- [ ] **Step 2: 跑相关测试 + 整仓验证**

Run: `cd frontend && npx vitest run src/layout/AppLayout.test.ts && cd .. && bash verify.sh`
Expected: AppLayout 测试 PASS（header/sidebar/routed/filter-bar 仍在；抽屉 visible=false 不渲染内容、不报错）；verify.sh 四步全绿（含本计划新增 5 个前端单测）。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md`：
1. 顶部"最近更新"改为 D2 完成（2026-06-05）。
2. Backlog 的 Phase D 段把 `- [ ] **D2** ...` 改为 `- [x] **D2** 全局项目详情面板（projectDetail store + buildProjectDetail + ProjectDetailDrawer，全局挂载）；上下文跳转(navContext)按 YAGNI 挪到 D4（有真实消费者时）。`
3. 在"会话交接备注（Handoff）"顶部新增 `### ✅ Plan D2 完成（2026-06-05）`，记录：分支、各任务提交 SHA、产物（lib/projectDetail 纯函数 / projectDetail store / ProjectDetailDrawer / AppLayout 全局挂载）、范围（仅面板地基；navContext + 各页接入挪到 D3/D4/D7）、整体进度（Phase D：D1-D2 完成，下一步 D3 看板首页重做）。

- [ ] **Step 4: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(D2): PROGRESS 记录 Plan D2 完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 自审（Self-Review）

**1. Spec 覆盖（对照决策 6 与 §4.2）：**
- 全局统一"项目详情"面板，任意页面可唤起 → projectDetail store（open/close）+ ProjectDetailDrawer + AppLayout 全局挂载（Task 2/3/4）。✓
- 展示项目全字段 + 其回款节点 → 汇总网格 12 项 + 节点明细 DataTable（Task 3）；buildProjectDetail 用全量 rawNodes（不经纳管/年份/视角），展示项目完整面貌（Task 1）。✓
- 跟进记录：§4.2 提"+ 跟进记录"。本计划范围内**未含**——它复用 followup 页的重组件且与本面板的"快速下钻"定位偏离；记录为后续可选增强（非本计划缺口），已在范围说明标注。
- 上下文跳转机制（navContext）：按 YAGNI 挪到 D4（无现存消费者，目标路由 /board 尚不存在）——已在"范围说明"显式记录，非静默删除。

**2. 占位扫描：** 无 TBD/省略；每步给出完整文件或完整代码 + 确切命令与预期。✓

**3. 类型/命名一致性：** `buildProjectDetail`/`ProjectDetail`（Task 1）被 Drawer 引用一致；`useProjectDetailStore`/`openId`/`open`/`close`/`visible`（Task 2）在 Drawer、AppLayout、测试一致；复用 `groupByProject`/`ProjectAgg`（dashboardStats，字段 projectId/projectName/orgL4/projectManager/projectType/projectAmount/tier/paymentStatus/paymentRatio/expectedPayment/actualPayment/remainingAmount 均存在）、`formatCellValue`、`fmtYuan`/`fmtRatio`、`DataTable`/`DataColumn`（show-count 默认 true、此处传 false）均与现有签名一致；节点字段 nodeName/planDate/expectedPayment/actualPayment/actualPaymentRatio/nodeStatus/delayDays 由 preprocess 输出。✓
