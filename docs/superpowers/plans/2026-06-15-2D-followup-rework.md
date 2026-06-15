# 2D 跟进记录重调（去云回写 + 项目化 + 删 /followup）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把跟进记录从"本地 JSON + Playwright 回写 WPS 云 + 独立 /followup 临期信号板"改为**纯本地、入口迁入项目清单**：`/projects` 行内「跟进」按钮弹 Modal 编辑、`/project:id` 保留记录区、删 `/followup` 整页与临期信号、废 `fuData`。

**Architecture:** 后端删除云回写链（`write_followup.py` + `_write_followup_async` + `syncStatus` + `followup_sync_state` + `/api/followup/sync-status`），`/api/followup/add|update|delete|list|types` 全改纯本地同步返回；前端删轮询（`useFollowupSync`）改本地 toast，新增 `FollowupModal` 复用 `FollowupRecords` 给 `/projects` 行内按钮用，删除 `/followup` 信号板链（视图+4 组件+2 库+fuData+nav/router）。

**Tech Stack:** Python 标准库 HTTP（server.py）；Vue3+Vite+TS+Pinia+Element Plus；Vitest + pytest。

**版本：** `frontend/src/version.ts` 单一来源 **V1.4.0 → V1.5.0**（整页级）。

---

## 关键事实（已核实，落地照此）

后端（`server.py` 行号）：
- 全局/枚举/文件：`sync_url=""`(:136)、`followup_sync_state`+`_followup_lock`+`_write_followup_lock`+`_FOLLOWUP_STATE_MAX`(:143-146)、`FOLLOWUP_TYPES/STATUSES`(:163-164)、`FOLLOWUP_FILE`(:162)。
- 本地持久化（**保留**）：`_load_followup_records`/`_save_followup_records`(:182-196)、`_get_next_record_num`(:242-256)、`_get_node_action_date`(:268-278)。
- 云回写（**删**）：`_set_followup_state`(:149-156)、`_write_followup_async`(:280-330)、`_update_followup_sync_status`(:332-343)。
- handler：`handle_followup_add`(:686-760，删 `data['syncStatus']='待同步'`:741 + threading 启动:752 + cloud_url 分支)、`handle_followup_update`(:803-876，删 `r['syncStatus']='待同步'`:844 + cloud_url 块:863-868)、`handle_followup_delete`(:762-801，删 `followup_sync_state.pop`:791-792 + cloud_url 块:795-798)、`handle_followup_list`(:878-900，**保留** `r.pop('syncStatus',None)` 兼容旧记录)、`handle_followup_types`(:902-908，不动)、`handle_followup_sync_status`(:938-950，**删**)。
- 路由：GET `/api/followup/list|types|sync-status`(:412-417)、POST `/api/followup/add|delete|update`(:490-495)。
- `sync_url` 赋值在 `handle_sync`(:513-517，数据同步)；followup 三 handler 读 `sync_url`（:750/:795/:862）。**注意：`sync_url` 可能也服务数据同步——本期只删 followup 对它的读取，不动 `handle_sync`；实现前 grep `sync_url` 确认是否 followup 独占再决定是否删全局。**
- frozen：`_find_script`(:1221-1234，**保留**，服务其它脚本)、Playwright 预导入(:73-81，**grep 确认是否 followup/写回独占；若 fetch_yundocs 共享则保留**)。
- `write_followup.py`：整文件可删（仅被 `_write_followup_async` 调）。`PaymentReviewApp.spec:70` `('write_followup.py', '.')` 删。
- 要删的测试：`tests/test_server_followup_state.py`（测 `_set_followup_state` 限容）、`tests/test_server_write_lock.py`（测 `_write_followup_lock`）。

前端（`frontend/src` 行号）：
- **保留改造**：`components/FollowupRecords.vue`（props `projectId/projectName/defaultNextDate?`:7；`const { toasts, notify } = useFollowupSync()`:15；`notify(...)` 调用:66/:79；`loadRecords`:29-38）、`lib/followupApi.ts`（`remove(recordId, cloudUrl?)`:60-61、`syncStatus()`:62-63、`SyncResp`:47-51）、`components/FollowupRecordForm.vue`（不动）。
- **删**：`composables/useFollowupSync.ts`（仅 FollowupRecords 引用）。
- **删 /followup 链**（grep 确认仅链内消费）：`views/FollowupView.vue`、`components/FollowupSignalRow.vue`/`FollowupExpandModal.vue`/`FuProjectRow.vue`/`FuNodeTable.vue`、`lib/followup.ts`、`lib/followupProjects.ts`、`stores/fuData.ts` + 各 `.test.ts`。
- 导航/路由：`nav.ts` 「临期跟进」(:32)、`router/index.ts` FollowupView import(:6) + `/followup` 路由(:32)。
- 接入：`views/ProjectsView.vue`（DataTable :126，columns:60-76，`@row-click="onRow"`）、`components/Modal.vue`（props `modelValue/title?/width?`）、`views/ProjectDetailView.vue`（FollowupRecords 接入:323-324，**不动**）。

---

## File Structure

新增：
- `frontend/src/components/FollowupModal.vue` — 包 `Modal` + `FollowupRecords`，给 `/projects` 行内跟进按钮用。
- `frontend/src/components/FollowupModal.test.ts`。

修改：
- `server.py` — 删云回写链、三 handler 改纯本地、删 sync-status 路由+handler。
- `PaymentReviewApp.spec` — 删 write_followup 入口。
- `frontend/src/lib/followupApi.ts` — 删 syncStatus/SyncResp、remove 去 cloudUrl。
- `frontend/src/components/FollowupRecords.vue` — 去 useFollowupSync 改 ElMessage。
- `frontend/src/views/ProjectsView.vue` — 操作列 + 跟进按钮 + FollowupModal。
- `frontend/src/nav.ts` / `frontend/src/router/index.ts` — 删 /followup。
- `frontend/src/version.ts` / `PROGRESS.md`。

删除：
- `write_followup.py`、`tests/test_server_followup_state.py`、`tests/test_server_write_lock.py`。
- `frontend/src/composables/useFollowupSync.ts`(+test)、`views/FollowupView.vue`(+test)、`components/FollowupSignalRow.vue`/`FollowupExpandModal.vue`/`FuProjectRow.vue`/`FuNodeTable.vue`(+test)、`lib/followup.ts`(+test)、`lib/followupProjects.ts`(+test)、`stores/fuData.ts`(+test)。

**不做（YAGNI）**：2E（导入导出+回滚）；临期信号/工作台；云回写；清单"已跟进"汇总列；不动 rawNodes 其它消费方。

---

## Task 1: 后端去云回写（记录纯本地）

**难度：易踩坑（删云链不破数据同步）→ opus。**

**Files:**
- Modify: `server.py`
- Modify: `PaymentReviewApp.spec`
- Delete: `write_followup.py`、`tests/test_server_followup_state.py`、`tests/test_server_write_lock.py`
- Test: `tests/test_followup_local.py`（新增，纯本地行为）

- [ ] **Step 1: grep 守门——确认 sync_url / Playwright 预导入是否 followup 独占**

Run:
```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && grep -n "sync_url\|playwright\|_write_followup_async\|followup_sync_state\|_set_followup_state\|_update_followup_sync_status\|write_followup" server.py
```
判定：`sync_url` 若在 `handle_sync`(:513-517) 赋值后**仅** followup 三处读取 → 删全局可（本任务保守起见**保留** `sync_url` 全局与 handle_sync 赋值不动，仅删 followup 的读取，避免误伤数据同步）。Playwright 预导入(:73-81) 若 grep 显示服务 fetch_yundocs（数据抓取）→ **保留**；若注释/上下文明确仅为 write_followup → 删。

- [ ] **Step 2: 写纯本地测试 `tests/test_followup_local.py`**

```python
import json
import server


def test_add_followup_local_only(tmp_path, monkeypatch):
    """add 纯本地:写入不含 syncStatus、不触发云线程、返回记录编号。"""
    f = tmp_path / "followup_records.json"
    monkeypatch.setattr(server, "FOLLOWUP_FILE", str(f))
    monkeypatch.setattr(server, "_get_node_action_date", lambda pid: "")
    # 直接测持久化层 + 编号生成(handler 的 HTTP 壳难单测,测其本地内核)
    recs = server._load_followup_records()
    assert recs == []
    num = server._get_next_record_num("20260615")
    rec = {"记录编号": f"FU-20260615-{num:04d}", "项目编号": "P1", "项目名称": "甲",
           "跟进人": "张三", "跟进类型": "邮件推动", "跟进内容": "x", "跟进状态": "跟进中"}
    server._save_followup_records([rec])
    loaded = server._load_followup_records()
    assert loaded[0]["记录编号"] == "FU-20260615-0001"
    assert "syncStatus" not in loaded[0]            # 纯本地不写 syncStatus


def test_cloud_writeback_symbols_removed():
    """云回写相关符号已删除(纯本地化标志)。"""
    assert not hasattr(server, "_write_followup_async")
    assert not hasattr(server, "_update_followup_sync_status")
    assert not hasattr(server, "followup_sync_state")
```

- [ ] **Step 3: 运行确认失败**

Run: `python -m pytest tests/test_followup_local.py -q`
Expected: `test_cloud_writeback_symbols_removed` FAIL（符号仍存在）

- [ ] **Step 4: 改 `server.py` 三 handler 为纯本地**

`handle_followup_add`：删 `data['syncStatus'] = '待同步'`（:741）；删云线程块（:750-752 的 `cloud_url = ...` 取值 + `if cloud_url: threading.Thread(...).start()` + else 日志）；响应 message 改固定：
```python
        self._json_response({"success": True, "记录编号": data['记录编号'], "message": "已保存到本地"})
```
`handle_followup_update`：删 `r['syncStatus'] = '待同步'`（:844）；删云块（:863-868：`updated_record` 查找 + `cloud_url` + `followup_sync_state.pop` + `threading.Thread`）；响应：
```python
        self._json_response({"success": True, "记录编号": record_id, "message": "已更新（本地）"})
```
`handle_followup_delete`：删 `with _followup_lock: followup_sync_state.pop(...)`（:791-792）+ 云块（:795-798）；响应：
```python
        self._json_response({"success": True, "message": f"跟进记录 {record_id} 已删除"})
```

- [ ] **Step 5: 删云回写辅助 + sync-status 路由/handler**

- 删 `_set_followup_state`(:149-156)、`_write_followup_async`(:280-330)、`_update_followup_sync_status`(:332-343)。
- 删 `followup_sync_state`/`_write_followup_lock`/`_FOLLOWUP_STATE_MAX`(:143/:146)；`_followup_lock`(:144) 若 grep 确认无其它使用一并删（删 `_set_followup_state` 与 pop 后通常已无用）。
- 删 `handle_followup_sync_status`(:938-950) 与 GET 路由 `elif parsed.path.startswith('/api/followup/sync-status'): self.handle_followup_sync_status()`(:416-417)。
- `handle_followup_add` 顶的 `global sync_url` 与 update/delete 同——若保留 `sync_url` 全局（Step 1 决定）则保留 `global` 声明无害；若删全局则一并删这三处 `global sync_url` 与读取行。

- [ ] **Step 6: 删 write_followup.py + .spec 入口 + 两个旧测试**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && git rm write_followup.py tests/test_server_followup_state.py tests/test_server_write_lock.py
```
`PaymentReviewApp.spec`：删第 70 行 `('write_followup.py', '.'),`。

- [ ] **Step 7: 验证**

Run:
```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile server.py && python -m ruff check server.py && python -m pytest tests/test_followup_local.py -q && python -m pytest -q
```
Expected: py_compile OK；ruff 通过（注意删除后无未用 import/变量——如 `subprocess`/`threading` 若 followup 是唯一用户需评估，通常 server 其它处仍用，保留）；新测试 2 PASS；全量 pytest 全绿（少了删的两个测试文件）。

- [ ] **Step 8: Commit**

```bash
git add server.py PaymentReviewApp.spec tests/test_followup_local.py
git commit -m "feat(2d): 跟进记录去云回写——add/update/delete 纯本地;删 write_followup/异步/syncStatus/sync-status"
```

---

## Task 2: 前端 followupApi + 删 useFollowupSync + FollowupRecords 去 sync

**难度：常规组件 → sonnet。**

**Files:**
- Modify: `frontend/src/lib/followupApi.ts`
- Delete: `frontend/src/composables/useFollowupSync.ts`(+ `.test.ts`)
- Modify: `frontend/src/components/FollowupRecords.vue`（+ `.test.ts` 对齐）

- [ ] **Step 1: grep 守门——确认 useFollowupSync 仅 FollowupRecords 用**

Run:
```bash
cd frontend && grep -rn "useFollowupSync\|syncStatus" src --include=*.ts --include=*.vue | grep -v ".test.ts"
```
Expected: `useFollowupSync` 仅 `FollowupRecords.vue` import；`followupApi.syncStatus` 仅 useFollowupSync 用。确认后安全删。

- [ ] **Step 2: 改 `lib/followupApi.ts`**

- 删 `SyncResp` 接口（约 :47-51）与 `syncStatus` 方法（:62-63）。
- `remove` 去 cloudUrl 参数：
```ts
  remove: (recordId: string) => api.post<DelResp>('/api/followup/delete', { 记录编号: recordId }),
```

- [ ] **Step 3: 改 `components/FollowupRecords.vue`（先读全文）**

- 删 `import { useFollowupSync }`、删 `const { toasts, notify } = useFollowupSync()`（:15）。
- 顶部加 `import { ElMessage } from 'element-plus'`（若未引入）。
- `notify(res.message, ...)`（:66）→ `ElMessage.success(res.message || '已保存到本地')`。
- delete 处 `notify(res.message, id)`（:79）→ `ElMessage.success(res.message || '已删除')`。
- 删 template 内渲染 `toasts` 的块（若有，如自绘 toast 列表）。
- `followupApi.remove(id)` 调用去掉 cloudUrl 第二参（若有传）。

- [ ] **Step 4: 删 useFollowupSync**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && git rm frontend/src/composables/useFollowupSync.ts frontend/src/composables/useFollowupSync.test.ts
```

- [ ] **Step 5: 对齐 `FollowupRecords.test.ts`**

读现有测试，删/改对 `useFollowupSync`/轮询/syncStatus 的断言（mock `followupApi` 即可；断言 add/delete 后 `loadRecords` 被调、列表刷新）。若测试 stub 了 ElMessage 需补 `vi.mock('element-plus', ...)` 或用 ElMessage 真组件。

- [ ] **Step 6: 验证**

Run: `cd frontend && npx vitest run src/components/FollowupRecords.test.ts && npm run typecheck`
Expected: PASS（typecheck 0 错误=无悬空 useFollowupSync/syncStatus 引用）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/followupApi.ts frontend/src/components/FollowupRecords.vue frontend/src/components/FollowupRecords.test.ts
git commit -m "feat(2d): followupApi 去 syncStatus/cloudUrl;FollowupRecords 去轮询改本地 toast;删 useFollowupSync"
```

---

## Task 3: `FollowupModal` + `/projects` 行内跟进按钮

**难度：常规组件 → sonnet。**

**Files:**
- Create: `frontend/src/components/FollowupModal.vue` + `.test.ts`
- Modify: `frontend/src/views/ProjectsView.vue` + `.test.ts`

- [ ] **Step 1: 写失败测试 `FollowupModal.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import FollowupModal from './FollowupModal.vue'

describe('FollowupModal', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('开启时渲染标题含项目名 + 内嵌 FollowupRecords', () => {
    const w = mount(FollowupModal, {
      props: { modelValue: true, projectId: 'P1', projectName: '甲' },
      global: { plugins: [ElementPlus], stubs: { FollowupRecords: true } },
    })
    expect(w.text()).toContain('甲')
    expect(w.findComponent({ name: 'FollowupRecords' }).exists()).toBe(true)
  })
})
```
> `FollowupRecords` 用 stub 避免其内部 api 调用；组件需有 `name` 或用文件名匹配（必要时 `findComponent` 改按选择器）。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/FollowupModal.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `FollowupModal.vue`**

```vue
<script setup lang="ts">
import Modal from './Modal.vue'
import FollowupRecords from './FollowupRecords.vue'

const props = defineProps<{ modelValue: boolean; projectId: string; projectName: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    :title="`跟进记录 - ${props.projectName || props.projectId}`"
    width="80%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <FollowupRecords v-if="props.modelValue" :project-id="props.projectId" :project-name="props.projectName" />
  </Modal>
</template>
```

- [ ] **Step 4: 改 `views/ProjectsView.vue` 加操作列 + 跟进按钮 + Modal**

- `<script setup>` 增：
```ts
import FollowupModal from '@/components/FollowupModal.vue'
const fuOpen = ref(false)
const fuProject = ref<{ projectId: string; projectName: string }>({ projectId: '', projectName: '' })
function openFollowup(row: Record<string, any>) {
  fuProject.value = { projectId: row.projectId, projectName: row.projectName || '' }
  fuOpen.value = true
}
```
- `columns` 末尾加：`{ key: 'action', label: '操作', width: 80 }`。
- DataTable 内加插槽（与 cell-tags 等并列）：
```vue
      <template #cell-action="{ row }">
        <button class="pv-fu-btn" @click.stop="openFollowup(row)">跟进</button>
      </template>
```
- DataTable 之后（或视图根末）加：
```vue
    <FollowupModal v-model="fuOpen" :project-id="fuProject.projectId" :project-name="fuProject.projectName" />
```
- `<style>` 加：`.pv-fu-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 8px; cursor: pointer; }`

- [ ] **Step 5: 对齐 `ProjectsView.test.ts`**

加测试：操作列「跟进」按钮存在；点它（`@click.stop`）打开 Modal 且不触发行下钻（断言 `fuOpen`/Modal 渲染，且 `pd.open`/路由跳转未被调）。挂载样板照现有（含 ElementPlus + projectTags.load mock）。若现有断言列数需 +1。

- [ ] **Step 6: 验证**

Run: `cd frontend && npx vitest run src/components/FollowupModal.test.ts src/views/ProjectsView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/FollowupModal.vue frontend/src/components/FollowupModal.test.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(2d): /projects 行内跟进按钮 + FollowupModal(复用 FollowupRecords)"
```

---

## Task 4: 删除 /followup 整页与临期信号链 + nav/router

**难度：易踩坑（删前 grep 守门）→ opus。**

**Files（删除）:**
- `frontend/src/views/FollowupView.vue`(+test)
- `frontend/src/components/FollowupSignalRow.vue`/`FollowupExpandModal.vue`/`FuProjectRow.vue`/`FuNodeTable.vue`(+各 test)
- `frontend/src/lib/followup.ts`(+test)、`frontend/src/lib/followupProjects.ts`(+test)、`frontend/src/stores/fuData.ts`(+test)
**Files（修改）:**
- `frontend/src/nav.ts`、`frontend/src/router/index.ts`

- [ ] **Step 1: grep 守门**

Run:
```bash
cd frontend && for s in FollowupView FollowupSignalRow FollowupExpandModal FuProjectRow FuNodeTable "from '@/lib/followup'" "from '@/lib/followupProjects'" useFuDataStore followupDeptStats; do echo "== $s =="; grep -rn "$s" src --include=*.ts --include=*.vue | grep -v ".test.ts"; done
```
Expected: 除各自定义文件 + router import(FollowupView) + nav 外，**无其它 prod 消费方**（确认 ProjectsView/ProjectDetailView/DashboardView/Calendar/Ledger 不引用 fuData 或这些组件/库）。`lib/followupProjects.ts` 若 import 了 `dashboardStats.groupByProject` 等共享件——只删 followupProjects 本身，共享件不动。若仍有 prod 引用 → 停，先解引用。

- [ ] **Step 2: 删文件**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && git rm \
  frontend/src/views/FollowupView.vue frontend/src/views/FollowupView.test.ts \
  frontend/src/components/FollowupSignalRow.vue frontend/src/components/FollowupSignalRow.test.ts \
  frontend/src/components/FollowupExpandModal.vue frontend/src/components/FollowupExpandModal.test.ts \
  frontend/src/components/FuProjectRow.vue frontend/src/components/FuProjectRow.test.ts \
  frontend/src/components/FuNodeTable.vue frontend/src/components/FuNodeTable.test.ts \
  frontend/src/lib/followup.ts frontend/src/lib/followup.test.ts \
  frontend/src/lib/followupProjects.ts frontend/src/lib/followupProjects.test.ts \
  frontend/src/stores/fuData.ts frontend/src/stores/fuData.test.ts
```
> 若某 `.test.ts` 不存在，从命令中剔除该项（先 `ls` 确认）。

- [ ] **Step 3: 改 `nav.ts`**

删 `PAYMENT_LINKS` 的 `{ label: '临期跟进', to: '/followup' }`（:32）。

- [ ] **Step 4: 改 `router/index.ts`**

删 `import FollowupView from '@/views/FollowupView.vue'`（:6）与 `{ path: '/followup', name: 'followup', component: FollowupView, ... }`（:32）。不留重定向（YAGNI）。

- [ ] **Step 5: 验证**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: typecheck 0 错误（无悬空 import=切净）；全量 vitest 全绿（少了删的测试）。grep 复核 `grep -rn "followup\|fuData\|Followup" src --include=*.ts --include=*.vue | grep -v ".test.ts"` 仅剩保留件（FollowupRecords/FollowupRecordForm/FollowupModal/followupApi + ProjectsView/ProjectDetailView 接入）。

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src
git commit -m "chore(2d): 删 /followup 整页与临期信号链(FollowupView/4 组件/2 lib/fuData)+nav/router;废 fuData"
```

---

## Task 5: 版本 V1.5.0 + 全量验证 + 真实数据冒烟 + PROGRESS

**难度：机械 + 核实 → 主循环。**

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本号** — `frontend/src/version.ts`：`APP_VERSION = 'V1.5.0'`。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 四步全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

- [ ] **Step 3: 真实数据冒烟（人工，spec §7）**

`python server.py`（确认无 write_followup 也能启动、启动日志无报错）→ `cd frontend && npm run dev`：
- `/projects` 行点「跟进」→ Modal 开，新增一条 → 刷新仍在（`data/followup_records.json` 本地，新记录无 `syncStatus`）；删除/编辑同款；提示「已保存到本地」，**无云同步网络动作/轮询**。
- `@click.stop` 生效：点「跟进」不跳详情页。
- `/project:id` 跟进区同款可用。
- 侧栏「回款」组无「临期跟进」；直达 `/followup` 无路由（404/兜底）。

- [ ] **Step 4: 更新 `PROGRESS.md`**

- 头部「当前版本」→ **V1.5.0**、「最近更新」补 2D 一句。
- 第 43 行 2D 项标完成 + SHA（合并后补）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(2d): 版本 V1.5.0 + PROGRESS(2D 跟进记录重调)"
```

---

## 合并（finishing-a-development-branch）

全部任务完成且 `bash verify.sh` 全绿后，用 **superpowers:finishing-a-development-branch** 的**选项 1（合回 master）**：`git checkout master && git merge --no-ff feat/phase-2d-followup-rework`，补 PROGRESS 合并 SHA。

---

## Self-Review（写完计划后自查）

**1. Spec 覆盖**：
- §1 去云回写(Task1)✓ / 入口项目化 A:/projects 按钮+Modal(Task3)、/project:id 保留(不动,随 Task2 生效)✓ / 删 /followup 整页(Task4)✓ / 废 fuData(Task4)✓ / V1.5.0(Task5)✓。
- §2 后端删云链+本地 API(Task1)✓。§3 followupApi/useFollowupSync/FollowupRecords(Task2)✓。§4 FollowupModal+ProjectsView(Task3)✓。§5 删链+nav/router(Task4)✓。§6 记录去 syncStatus 其余不变(Task1)✓。§7 测试(各任务 pytest/vitest + Task5 冒烟)✓。
- §9 frozen/`.spec`/grep 守门(Task1 Step1/Step6、Task4 Step1)✓。

**2. 占位扫描**：无 TBD/TODO。行号为"约 :NNN"（来自普查），实现前按实际文件核对——指向**现有可读文件**的定位，非占位。Task1 Step1/Task4 Step1 的 grep 判定（sync_url/Playwright/followupProjects 共享件）是**必要的删前核实**，非含糊。

**3. 类型一致**：`followupApi.remove(recordId)` 单参在 Task2 定义、Task3 不直接调（经 FollowupRecords）一致；`FollowupModal` props `{modelValue, projectId, projectName}` 在 Task3 定义与 ProjectsView 消费一致；删除清单(Task4)与"保留件"(FollowupRecords/Form/Modal/followupApi)不冲突；`syncStatus` 字段在后端(Task1)停写、前端(Task2)停读一致。

> 偏离记录：无对 spec 的功能偏离。Task1 对 `sync_url` 全局采**保守保留**（仅删 followup 读取，不动 handle_sync），比 spec §2"删 sync_url"更稳——避免误伤数据同步；实现期 grep 确认 followup 独占后可再删全局（spec 意图不变）。
