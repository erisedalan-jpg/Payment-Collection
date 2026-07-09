# /data 数据管理页重设计（工作流导向 + 状态总览）Implementation Plan · V2.8.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 /data 全部功能与所有 data-test 钩子的前提下，把 `DataView.vue` 从扁平 8 卡堆叠改为「状态总览条 + 主区工作流（获取→更新）+ 折叠维护区」。

**Architecture:** 新增表现型 `DataStatusBar.vue`（props 驱动、无副作用）承载状态总览条；`DataView.vue` 的 `<script setup>`（refs/handlers/composables/onMounted/defineExpose）**保持不动**，只重排 `<template>` + 重写 `<style scoped>`，用 `el-collapse` 收纳维护与「更多」。纯前端、零后端改动。

**Tech Stack:** Vue3 + TS + Element Plus（`el-collapse`）+ Vitest；项目设计令牌（`theme.css`）。

## Global Constraints

- 交流与文案用**简体中文**；**不使用任何 emoji**（需要符号用 `→ ↓ ❌ ✕ ▾ ⚠`）。
- 版本单一来源 `frontend/src/version.ts`，本期 **V2.8.0**、日期 `2026-07-09`。
- **只准引用设计令牌**（`--sp-*/--fs-*/--card/--line/--accent/--ok-bg/--ok-text/--warn-bg/--warn-text/--danger-bg/--danger-text/--gap-card/--gap-section/--r-*/--shadow-1/--hover-tint/--lift/--mut/--on-accent/--sub/--txt` 等），**不手写散值**；金额/时间/数字挂 `.u-num`。
- 状态徽标用**状态语义色三态（淡底深字）**，禁实底小字；主操作 `--accent`；危险 danger 淡底深字。
- 不引新前端框架、不外链字体/资源；折叠只用 Element Plus `el-collapse`。
- **功能一个不删**：PMIS/项目域上传、获取本机 PMIS cookie、手动粘贴 cookie、下载数据、更新数据、倚天 cookie 取存、项目标签增改禁用+按标签排除、人工导入/回滚、历史回滚/撤销、清空数据（两步确认）、状态/时间显示——全保留，仅重排+改样式。
- **所有 data-test 钩子保留**：`pmis-cookie`、`btn-download`、`btn-fetch-pmis-cookie`、`btn-fetch-yitian-cookie`、`files-card`、`pmis-row`、`manual-import-card`、`man-backup-row`、`history-row`、`history-rollback`、`history-source-note`。
- **禁止出现字符串「在线下载」**（既有测试断言其不存在；在线获取路径的标题用「在线获取（PMIS）」）。
- 后端零改动、无新页面/路由/pageKey；倚天不加下载。
- 完成定义：`bash verify.sh` 全绿（前端 typecheck/vitest/build）+ `PROGRESS.md` 更新。**纯前端包：升级无需重启后端、无需点更新数据**。

## File Structure

| 文件 | 职责 |
|---|---|
| `frontend/src/components/DataStatusBar.vue`（新增） | 状态总览条：props 驱动、无副作用；处理/PMIS 时间 + 代理/cookie/倚天 状态徽标 |
| `frontend/src/components/DataStatusBar.test.ts`（新增） | 状态条各状态渲染单测 |
| `frontend/src/views/DataView.vue`（改） | `<template>` 重排 + `<style>` 重写；`<script setup>` 不动；集成 DataStatusBar + el-collapse |
| `frontend/src/views/DataView.test.ts`（改） | 更新 3 个断言旧结构的用例 + 补状态条/折叠区用例；其余保持绿 |
| `frontend/src/version.ts`（改） | V2.8.0 |

---

## Task 1: DataStatusBar.vue 状态总览条

**Files:**
- Create: `frontend/src/components/DataStatusBar.vue`
- Test: `frontend/src/components/DataStatusBar.test.ts`

**Interfaces:**
- Produces: `<DataStatusBar>` 组件，props：
  - `lastUpdate: string`、`lastPmis: string`、`agentOnline: boolean`
  - `cookieStatus: { sessionPreview: string; updatedAt: string }`
  - `yitianStatus: { sessionPreview: string; updatedAt: string }`
  - 关键 data-test：`dsb-agent`、`dsb-cookie`、`dsb-yitian`（状态徽标）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/DataStatusBar.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataStatusBar from './DataStatusBar.vue'

const base = {
  lastUpdate: '2026-07-09 10:00',
  lastPmis: '2026-07-08',
  agentOnline: true,
  cookieStatus: { sessionPreview: 'abc12345', updatedAt: '刚刚' },
  yitianStatus: { sessionPreview: '', updatedAt: '' },
}

describe('DataStatusBar', () => {
  it('渲染处理/PMIS 时间', () => {
    const w = mount(DataStatusBar, { props: base })
    expect(w.text()).toContain('2026-07-09 10:00')
    expect(w.text()).toContain('2026-07-08')
  })

  it('代理在线=ok/离线=warn 三态', () => {
    const on = mount(DataStatusBar, { props: base })
    expect(on.get('[data-test="dsb-agent"]').classes()).toContain('ok')
    expect(on.get('[data-test="dsb-agent"]').text()).toBe('已连接')
    const off = mount(DataStatusBar, { props: { ...base, agentOnline: false } })
    expect(off.get('[data-test="dsb-agent"]').classes()).toContain('warn')
    expect(off.get('[data-test="dsb-agent"]').text()).toBe('未运行')
  })

  it('cookie 有效显预览、未设置显 warn', () => {
    const has = mount(DataStatusBar, { props: base })
    expect(has.get('[data-test="dsb-cookie"]').classes()).toContain('ok')
    expect(has.get('[data-test="dsb-cookie"]').text()).toContain('abc12345')
    const none = mount(DataStatusBar, { props: { ...base, cookieStatus: { sessionPreview: '', updatedAt: '' } } })
    expect(none.get('[data-test="dsb-cookie"]').classes()).toContain('warn')
    expect(none.get('[data-test="dsb-cookie"]').text()).toBe('未设置')
  })

  it('倚天 已存/无', () => {
    const none = mount(DataStatusBar, { props: base })
    expect(none.get('[data-test="dsb-yitian"]').text()).toBe('-')
    const has = mount(DataStatusBar, { props: { ...base, yitianStatus: { sessionPreview: 'x', updatedAt: '刚刚' } } })
    expect(has.get('[data-test="dsb-yitian"]').text()).toContain('已存')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DataStatusBar.test.ts`
Expected: FAIL（`Cannot find module './DataStatusBar.vue'`）

- [ ] **Step 3: 写组件**

创建 `frontend/src/components/DataStatusBar.vue`：

```vue
<script setup lang="ts">
defineProps<{
  lastUpdate: string
  lastPmis: string
  agentOnline: boolean
  cookieStatus: { sessionPreview: string; updatedAt: string }
  yitianStatus: { sessionPreview: string; updatedAt: string }
}>()
</script>

<template>
  <div class="dsb">
    <div class="dsb-item">
      <span class="dsb-label">上次处理</span>
      <span class="dsb-val u-num">{{ lastUpdate }}</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">PMIS</span>
      <span class="dsb-val u-num">{{ lastPmis }}</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">本机代理</span>
      <span class="dsb-badge" :class="agentOnline ? 'ok' : 'warn'" data-test="dsb-agent">{{ agentOnline ? '已连接' : '未运行' }}</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">PMIS cookie</span>
      <span v-if="cookieStatus.sessionPreview" class="dsb-badge ok u-num" data-test="dsb-cookie">有效 · {{ cookieStatus.sessionPreview }} · {{ cookieStatus.updatedAt || '-' }}</span>
      <span v-else class="dsb-badge warn" data-test="dsb-cookie">未设置</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">倚天 cookie</span>
      <span class="dsb-val" :class="{ mut: !yitianStatus.sessionPreview }" data-test="dsb-yitian">{{ yitianStatus.sessionPreview ? '已存 · ' + (yitianStatus.updatedAt || '-') : '-' }}</span>
    </div>
  </div>
</template>

<style scoped>
.dsb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-5);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-1);
  padding: var(--sp-3) var(--sp-4);
}
.dsb-item { display: flex; align-items: baseline; gap: var(--sp-2); }
.dsb-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.dsb-val { font-size: var(--fs-2); color: var(--txt); }
.dsb-val.mut { color: var(--mut); }
.dsb-badge { font-size: var(--fs-1); font-weight: 600; padding: 2px 8px; border-radius: var(--r-full); }
.dsb-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.dsb-badge.warn { background: var(--warn-bg); color: var(--warn-text); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/DataStatusBar.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DataStatusBar.vue frontend/src/components/DataStatusBar.test.ts
git commit -m "feat(data): DataStatusBar 状态总览条(表现型,props驱动,三态徽标) (V2.8.0)"
```

---

## Task 2: DataView.vue 模板重排 + 样式重写 + 版本号 + 测试更新

**Files:**
- Modify: `frontend/src/views/DataView.vue`（`<template>` 全替 + `<style>` 追加；`<script setup>` 不动）
- Modify: `frontend/src/views/DataView.test.ts`（更新 3 用例 + 补 2 用例）
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: Task 1 的 `<DataStatusBar>`（props：lastUpdate/lastPmis/agentOnline/cookieStatus/yitianStatus）；DataView 现有 refs/handlers 全部沿用

**背景（务必遵守）：**
- `<script setup>`（第 1-214 行的逻辑）**一行都不要改**；只改 `<template>` 与 `<style scoped>`，并在 `<script setup>` 顶部已有的 `import` 之外**补一行** `import DataStatusBar from '@/components/DataStatusBar.vue'`（其它 import 不动）。
- 所有 handler 绑定、data-test、按钮文案（除下述允许的重排/新增标题外）保持；`el-collapse`/`el-collapse-item` 默认收起（不加 v-model）。
- 严禁出现字符串「在线下载」；在线获取路径标题用「在线获取（PMIS）」。

- [ ] **Step 1: 更新既有测试 + 写新测试（先让其失败）**

在 `frontend/src/views/DataView.test.ts` 中：

(a) 顶部补 import：

```ts
import DataStatusBar from '@/components/DataStatusBar.vue'
```

(b) **替换**「数据来源说明卡存在且含两种方式说明」用例为：

```ts
  it('主区含两种获取方式的说明文本', async () => {
    const w = await mountView()
    expect(w.text()).toContain('两种方式')
    expect(w.text()).toContain('上传文件')
    expect(w.text()).not.toContain('在线下载')   // 沿用旧约束:不得出现该字样
  })
```

(c) **替换**「数据文件清单卡存在，含 PMIS 九表与项目域文件分区」用例为：

```ts
  it('上传文件区含 PMIS 九表与项目域文件两分区', async () => {
    const w = await mountView()
    expect(w.text()).toContain('PMIS 九表')
    expect(w.text()).toContain('项目域文件')
    expect(w.find('[data-test="files-card"]').exists()).toBe(true)
  })
```

(d) **替换**「更新数据卡与设置卡保留」用例为：

```ts
  it('主区含「获取与更新数据」，清空数据进维护折叠区', async () => {
    const w = await mountView()
    const heads = w.findAll('.dv-card-head').map((n) => n.text())
    expect(heads.some((t) => t.includes('获取与更新数据'))).toBe(true)
    expect(w.text()).toContain('清空数据')
  })
```

(e) 在 `describe('DataView(两条来源重构)')` 内追加两个新用例：

```ts
  it('渲染状态总览条 DataStatusBar', async () => {
    const w = await mountView()
    expect(w.findComponent(DataStatusBar).exists()).toBe(true)
  })

  it('维护区四折叠面板标题齐全', async () => {
    const w = await mountView()
    const t = w.text()
    expect(t).toContain('项目标签')
    expect(t).toContain('人工数据导入')
    expect(t).toContain('数据历史')
    expect(t).toContain('清空数据')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: FAIL（新/改用例失败：找不到 DataStatusBar、`获取与更新数据` 头不存在等）

- [ ] **Step 3a: 版本号 V2.8.0**

改 `frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V2.8.0'
export const RELEASE_DATE = '2026-07-09'
```

- [ ] **Step 3b: script 补一行 import**

在 `frontend/src/views/DataView.vue` 的 `import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'` 之后追加：

```ts
import DataStatusBar from '@/components/DataStatusBar.vue'
```

（`<script setup>` 其余不动。）

- [ ] **Step 3c: 全量替换 `<template>`**

把 `frontend/src/views/DataView.vue` 的整个 `<template> ... </template>` 替换为：

```html
<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
    </div>

    <DataStatusBar :last-update="lastUpdate" :last-pmis="lastPmis" :agent-online="agentOnline"
      :cookie-status="cookieStatus" :yitian-status="yitianStatus" />

    <div class="dv-card dv-main">
      <div class="dv-card-head">获取与更新数据</div>

      <div class="dv-step">① 获取数据</div>
      <div class="dv-row dv-src-note dv-hint">
        两种方式二选一：从 PMIS 在线抓取覆盖 input/，或手动上传文件到 input/（PMIS 九表放
        <b>input/pmis/</b>，其余 CSV/xlsx（含核心回款源 collection_stages.csv）放 <b>input/</b> 根）；获取后点「更新数据」生效。
      </div>

      <div class="dv-paths u-grid-auto">
        <div class="dv-path">
          <div class="dv-path-head">在线获取（PMIS）</div>
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
        </div>

        <div class="dv-path" data-test="files-card">
          <div class="dv-path-head">上传文件</div>
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
        </div>
      </div>

      <el-collapse class="dv-more">
        <el-collapse-item name="more" title="更多：手动粘贴 cookie / 倚天 cookie（取备用）">
          <div class="dv-row dv-cookie">
            <span class="dv-label">手动 cookie</span>
            <textarea v-model="pmisCookie" data-test="pmis-cookie" class="dv-cookie-box" rows="2"
              placeholder="粘贴完整 PMIS cookie 串（高级兜底；正常用上方「获取本机 cookie」）"></textarea>
          </div>
          <div class="dv-row">
            <button class="dv-btn" data-test="btn-fetch-yitian-cookie" @click="onFetchYitianCookie">获取本机倚天 cookie 并存储</button>
            <span class="dv-hint">当前 {{ yitianStatus.sessionPreview || '-' }} · 更新于 {{ yitianStatus.updatedAt || '-' }}</span>
          </div>
          <div v-if="yitianMsg" class="dv-row dv-hint" :class="yitianErr ? 'err' : 'ok'">{{ yitianMsg }}</div>
        </el-collapse-item>
      </el-collapse>

      <div class="dv-step">② 更新看板</div>
      <div class="dv-row">
        <button class="dv-btn primary dv-btn-lg" :disabled="repRunning || dlRunning" @click="startReprocess()">更新数据（重新处理）</button>
        <span class="dv-hint">读取已获取数据重算看板</span>
      </div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>

    <div class="dv-section-label">维护</div>
    <el-collapse class="dv-maint">
      <el-collapse-item name="tags" title="项目标签">
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
      </el-collapse-item>

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
```

- [ ] **Step 3d: 追加新样式（保留现有 `<style scoped>` 全部类，在其末尾 `}` 之前追加下列新类）**

在 `frontend/src/views/DataView.vue` 现有 `<style scoped>` 内**追加**（不要删既有类）：

```css
.dv-main { padding-bottom: var(--sp-3); }
.dv-step { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding: var(--sp-3) var(--sp-4) 0; }
.dv-section-label { font-size: var(--fs-1); font-weight: 700; color: var(--sub); margin-top: var(--sp-3); padding: 0 var(--sp-1); }
.dv-src-note { padding-top: var(--sp-2); }
.dv-paths { padding: var(--sp-2) var(--sp-4) var(--sp-3); }
.dv-path { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card2, var(--card)); padding-bottom: var(--sp-2); }
.dv-path-head { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding: var(--sp-2) var(--sp-3) 0; }
.dv-path .dv-row { padding: var(--sp-2) var(--sp-3); }
.dv-path .dv-sub-head { padding-left: var(--sp-3); }
.dv-path .dv-fgrid { padding-left: var(--sp-3); padding-right: var(--sp-3); }
.dv-path .dv-actions { border-top: 1px dashed var(--line); }
.dv-badge { font-size: var(--fs-1); font-weight: 600; padding: 2px 8px; border-radius: var(--r-full); }
.dv-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.dv-badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.dv-hint.err { color: var(--danger-text); }
.dv-btn-lg { font-size: var(--fs-3); padding: var(--sp-2) var(--sp-5); }
.dv-btn.primary:hover:not(:disabled) { box-shadow: var(--lift); }
.dv-danger-title { color: var(--danger-text); font-weight: 700; }
.dv-more, .dv-maint { margin: 0; }
.dv-more :deep(.el-collapse-item__header),
.dv-maint :deep(.el-collapse-item__header) { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding-left: var(--sp-4); }
.dv-more :deep(.el-collapse-item__content),
.dv-maint :deep(.el-collapse-item__content) { padding-bottom: var(--sp-2); }
.dv-maint { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-1); }
.dv-more { border-top: 1px solid var(--line); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts src/components/DataStatusBar.test.ts`
Expected: PASS（既有用例保持绿 + 改后/新用例通过）

- [ ] **Step 5: 前端全量校验**

Run: `cd frontend && npm run typecheck && npx vitest run && npm run build`
Expected: typecheck 通过、vitest 全绿、build 成功

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts frontend/src/version.ts
git commit -m "feat(data): /data 页工作流导向重设计(状态总览条+主区+折叠维护) + V2.8.0"
```

---

## Task 3: 全量 verify + PROGRESS（控制者直接做）

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 2: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本日志把 V2.7.1 降为「上一版本」，新增 V2.8.0「当前版本」条目：/data 数据管理页工作流导向重设计——新增 `DataStatusBar.vue` 状态总览条 + 主区「获取与更新数据」（在线获取/上传两路径→更新看板）+ el-collapse 折叠维护区（项目标签/人工导入/历史回滚/清空数据）；手动粘贴 cookie 与倚天区收进「更多」折叠；功能一个不删、所有 data-test 保留；纯前端零后端改动，升级无需重启后端/无需点更新数据。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): V2.8.0 /data 数据管理页重设计收官"
```

---

## Self-Review 检查（已随计划完成）

- **Spec 覆盖**：状态总览条(§3)→Task 1；主区两路径+更新(§4)+维护折叠(§5)+视觉令牌(§6)→Task 2 模板/样式；保留清单(§7)→Task 2 全 data-test/handler 保留 + Global Constraints；架构/测试/版本/交付(§8)→Task 1/2/3。后端零改动（无任务碰后端）。无遗漏。
- **占位符**：无 TBD/TODO；模板/样式/测试均给完整代码或精确替换指令。
- **既有测试破坏已显式处理**：3 个断言旧结构的用例（数据来源卡/数据文件清单卡头/设置卡）在 Task 2 Step 1 给出更新后的等价断言（保留意图、指向新结构）；`在线下载` 字符串规避（路径标题用「在线获取（PMIS）」，下载说明用「只抓取不重算」）；`下载数据`仍在`更新数据`之前（DOM 顺序测试通过）；el-collapse 内容 v-show 常驻 DOM，data-test 查询/setValue/trigger 不受收起影响。
- **类型/命名一致**：`DataStatusBar` props（lastUpdate/lastPmis/agentOnline/cookieStatus/yitianStatus）Task 1 定义、Task 2 绑定一致；data-test `dsb-agent/dsb-cookie/dsb-yitian`（Task 1）与既有钩子无冲突；新样式类 `.dv-step/.dv-section-label/.dv-path/.dv-path-head/.dv-badge/.dv-btn-lg/.dv-danger-title/.dv-more/.dv-maint` 模板与样式一致。
