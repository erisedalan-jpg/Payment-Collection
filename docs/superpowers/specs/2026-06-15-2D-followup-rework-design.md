# 2D 跟进记录重调设计（去云回写 + 项目化 + 删 /followup）

> 状态：设计已与用户确认（2026-06-15），进入 spec。下一步 `superpowers:writing-plans`。
> 这是「回款看板重建程序」的 **2D**（承 2C 项目标签体系 32ecca2）。把跟进记录从"本地 JSON + Playwright 回写 WPS 云 + 独立 /followup 临期信号板"重调为"**纯本地、入口迁入项目清单**"：`/projects` 行内「跟进」按钮弹 Modal 编辑、`/project:id` 展示编辑、**删除 /followup 整页与临期信号、废弃 fuData**。
> 范围：后端去云回写 + 前端入口迁移与删页。版本 V1.4.0 → **V1.5.0**（整页级：删页 + 跨页重调）。

## 0. 背景（现状）

- **跟进记录存储**：本地 `data/followup_records.json`（11 字段：`记录编号/项目编号/项目名称/节点动作完成时间/跟进时间/跟进人/跟进类型/跟进内容/下次跟进计划日期/跟进状态/备注` + 内部 `syncStatus`）。`记录编号` 自动递增 `FU-YYYYMMDD-NNNN`（`server.py` `_get_next_record_num`）。
- **云回写（要废）**：add/update/delete 触发 `_write_followup_async(record, cloud_url)`（`server.py:280-330`，后台线程）→ `write_followup.py`（Playwright 打开 WPS 云文档「项目回款跟进记录」Sheet 增改）；前端 `useFollowupSync` 轮询 `GET /api/followup/sync-status`（每 2s，最多 2 分钟）显示同步状态。frozen 分支 `_run_script_direct` 依赖 `write_followup.py` 存在 + Playwright 预导入。
- **/followup 页（要删）**：`views/FollowupView.vue` 是基于 `filter.filteredNodes`(rawNodes 旧口径，`isPaymentRelated`) 的**部门级临期信号板**（7/15/30 天/延期统计 + 跟进率），跟进率来自 `stores/fuData.ts`（localStorage `fu_data` 的逐项目 `flw` 标记）。链上组件：`FollowupSignalRow`/`FollowupExpandModal`/`FuProjectRow`/`FuNodeTable`，库 `lib/followup.ts`(followupDeptStats)/`lib/followupProjects.ts`。
- **记录 CRUD（保留）**：`components/FollowupRecords.vue`(新增/编辑/删除/查历史) + `FollowupRecordForm.vue`(3 只读 + 5 可编辑字段) + `lib/followupApi.ts`，**已接入 `/project/:id` 详情页**（`ProjectDetailView.vue` "跟进记录"区）。`/projects` 清单当前**无**跟进信息。

## 1. 已确认的边界决策（用户钦定 2026-06-15）

1. **去云回写**：跟进记录纯本地，彻底删除 WPS 云回写（write_followup + 异步线程 + syncStatus + 轮询）。
2. **入口迁入项目清单（方案 A）**：`/projects` 每行加「跟进」按钮 → 弹 Modal 复用现有 `FollowupRecords`（全功能 CRUD）；`/project:id` 详情页保留同款记录区；三处复用同一 `FollowupRecords` 组件（DRY）。
3. **删 /followup 整页**：抛弃临期信号板与"跟进工作台"（暂不符需求），`/followup` 路由与 nav 入口一并删除；不保留重定向（YAGNI）。
4. **废弃 fuData**：删 `stores/fuData.ts` 与 localStorage `fu_data` 标记；"是否已跟进"语义由"该项目有无跟进记录"自然派生（本期不在清单显式做"已跟进"列，仅提供跟进入口；如需汇总列留后续）。
5. **版本 V1.5.0**（整页级）。

## 2. 后端：去云回写（记录纯本地）

**删除**：
- `write_followup.py`（整文件）。
- `server.py`：`_write_followup_async`（约 :280-330）、`_update_followup_sync_status`（约 :332-343）、`followup_sync_state` dict + 锁 + `_FOLLOWUP_STATE_MAX`（约 :143-146）、`handle_followup_sync_status`（约 :938-952）及其路由 `GET /api/followup/sync-status`；add/update/delete handler 内的云同步分支与 `cloud_url`/全局 `sync_url` 参数；frozen 分支对 `write_followup.py` 的 `_run_script_direct`/`_find_script` 与 Playwright 预导入（约 :73-81，**仅删跟进相关，云同步抓取 fetch_yundocs 的 Playwright 不动**）。
- `PaymentReviewApp.spec`：`write_followup.py` 入口/datas 声明（frozen 硬依赖随删）。

**保留并简化**（全部只读写本地 `data/followup_records.json`，同步返回，无异步/无 syncStatus）：
- `GET /api/followup/types`（枚举：跟进类型含「邮件推动」、跟进状态 5 种）。
- `GET /api/followup/list/<pid>?limit=N`。
- `POST /api/followup/add`（生成 `FU-YYYYMMDD-NNNN`、6 必填校验、自动填 `节点动作完成时间`/`下次跟进计划日期` 默认值；写入即返回 `{success, 记录编号, message:"已保存到本地"}`）。
- `POST /api/followup/update`（仅改 5 可编辑字段、保 3 只读；写入即返回成功）。
- `POST /api/followup/delete`（按 `记录编号` 删本地记录；去 `cloudUrl` 参数）。
- 记录写入时**不再写 `syncStatus` 字段**；读取旧记录含 `syncStatus` 容忍（不报错，可在 add/update 时顺手剔除）。

## 3. 前端：复用 FollowupRecords + 去 sync

- `lib/followupApi.ts`：删 `syncStatus()` 方法；`add/update/remove` 保留（`remove` 去 `cloudUrl` 入参）。
- `composables/useFollowupSync.ts`：**整体删除**（轮询状态机随云回写一并废）；`FollowupRecords` 内原 `notify(message, recordId)` 轮询调用改为**直接** `ElMessage.success('已保存到本地')` / 失败 `ElMessage.error(...)`。
- `components/FollowupRecords.vue`：去掉对 `useFollowupSync` 轮询的依赖，提交后仅本地 toast + `loadRecords()` 刷新；CRUD 流程与表单不变。
- `components/FollowupRecordForm.vue`：不变（3 只读 / 5 可编辑、跟进人≤20、跟进内容≤500、「邮件推动」枚举）。

## 4. 前端：`/projects` 行内「跟进」按钮 + Modal

- `ProjectsView.vue`：新增「操作」列（或行尾），放「跟进」按钮；`@click.stop` 防触发既有 `@row-click` 行下钻。点击设当前 `activeProject = { projectId, projectName }` 并打开 Modal。
- 新增轻容器组件 `components/FollowupModal.vue`：复用 `components/Modal.vue` 包一层，内嵌 `<FollowupRecords :project-id :project-name />`，props `{ modelValue, projectId, projectName }`。`ProjectsView` 引用之（不内联，便于复用与测试）。
- Modal 内的 CRUD 与详情页同款（同一组件）。关闭 Modal 不影响清单。

## 5. 前端：删除 /followup 整页与临期信号链

删除前 **grep 全仓确认仅 /followup 链消费**（防误删其它页共享件）：
- `views/FollowupView.vue`、`components/FollowupSignalRow.vue`、`components/FollowupExpandModal.vue`、`components/FuProjectRow.vue`、`components/FuNodeTable.vue` 及各 `.test.ts`。
- `lib/followup.ts`（`followupDeptStats`/`FuFlag`/`FuData`）、`lib/followupProjects.ts`、`stores/fuData.ts` 及各 `.test.ts`。
- `nav.ts`：删 `PAYMENT_LINKS` 的 `{ label: '临期跟进', to: '/followup' }`。
- `router/index.ts`：删 `/followup` 路由与 `FollowupView` import。
- **保留**：`FollowupRecords.vue`/`FollowupRecordForm.vue`/`lib/followupApi.ts`（记录 CRUD，迁项目侧复用）。
- **注意**：`lib/followupProjects.ts` 若复用了 `lib/dashboardStats.groupByProject` 等共享件，只删 followupProjects 本身，共享件不动；`fuData` 若被其它页引用需先核实（预期仅 /followup 链）。

## 6. 记录模型与约定

- 字段：去内部 `syncStatus`，其余 11 字段不变。枚举「邮件推动」、跟进状态 5 种不变。表单三只读字段（记录编号/项目编号/项目名称）、**无 amountTier**，约定不变（CLAUDE.md §4）。
- `记录编号` 生成 `FU-YYYYMMDD-NNNN`、`节点动作完成时间`/`下次跟进计划日期` 自动填充逻辑保留（读 `analysis_data.json`，不涉云）。

## 7. 测试

- **pytest**：add/update/delete/list 纯本地往返（无云分支、写入无 `syncStatus`）；`记录编号` 递增 `FU-YYYYMMDD-NNNN`；types 枚举含「邮件推动」；旧含 `syncStatus` 记录读取不崩。
- **vitest**：`FollowupRecords` CRUD（去 sync 后仅 toast）、`FollowupRecordForm` 校验、`/projects` 跟进按钮开 Modal 且 `@click.stop` 不触发行下钻、Modal 内 CRUD；删除链相关 `.test.ts` 同步移除。
- **真实数据冒烟**：`python server.py`（无 write_followup 依赖也能启动）→ `/projects` 点「跟进」加一条 → 刷新仍在（本地 JSON）、无网络回写动作；`/project:id` 同款；旧 `/followup` 入口与路由已无（直达 404 或被路由兜底）。
- `bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

## 8. 版本与不做（YAGNI 边界）

- 版本 **V1.5.0**（`frontend/src/version.ts` 单一来源）；`PROGRESS.md` 2D 项标完成 + SHA。
- **不做**：2E（标签/跟进的导入导出 + 历史快照回滚，独立子项，本期仅 2C 已记 L-22 导出待办，2E 立项时统办）；不保留临期信号/跟进工作台；不回写云文档；不在清单显式做"已跟进"汇总列（YAGNI，留后续）；不动 rawNodes 其它消费方（/payment·日历·台账仍用 rawNodes，仅删 /followup 独占的 followup/fuData 链）。

## 9. 实现注意（易踩坑）

- `server.py` 打包(frozen)/开发两套分支都要维护（CLAUDE.md §5）：删 write_followup 的 `_run_script_direct` 分支时，确认其它三个内嵌脚本（preprocess/fetch_yundocs/pmis_download）的 frozen 分支不受影响。
- `.spec` 删 write_followup 入口后需确认打包仍成功（frozen 不再硬依赖该文件）。
- 删旧件前 grep 全仓引用（尤其 `fuData`/`lib/followup`/`followupProjects` 是否被 /followup 之外消费）；只删 /followup 独占件。
- `useFollowupSync` 若被 `FollowupRecords` 外的组件引用需一并核实；删/改后 typecheck 0 错误为切净标志。
- 跟进 Modal 与详情页复用同一 `FollowupRecords`——改其内部（去 sync）后两处同时生效，回归两处都要测。
