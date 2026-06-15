# 数据历史版本化与回滚设计（V1.1.0）

> 状态：设计已与用户确认（方案 A + 全部决策点），进入 spec。
> 目标：每次"更新数据"成功后自动保留该次完整数据快照，留最近 3 份（按处理次数），并在数据管理页提供回滚以恢复历史数据。
> 版本定级：功能级新增（新增"数据历史/回滚"能力 + 后端模块 + API + 前端卡）→ Y 位，V1.0.3 → **V1.1.0**（发布日 2026-06-15）。

## 0. 背景与现状

数据流（已核实）：sync/import 仅落地源数据到 `yundocs_data/`；PMIS 下载到 `input/pmis/`；处理永远由"更新数据"按钮触发 → `server.py run_reprocess` 跑 `preprocess_data.main()` → 写 `data/analysis_data.json`（~11.6MB，前端数据源）+ 派生 `data/events.json`（项目动态流）+ `data/snapshots/<日期>.json`（项目域 diff 基线）。当前 `analysis_data.json` 无任何备份；`/api/clear-data` 直接删除。

**名词澄清（务必区分，二者无关）：**
- `data/snapshots/`（Phase P3）= 项目域**逐日**快照，供 `snapshots.py` 算项目动态 diff，90 天留存。
- 本设计的"数据历史版本"= 一次处理运行的**整份**数据快照（源+产出），供回滚，按处理次数留 3 份。命名独立放 `data/history/`，不碰 `data/snapshots/` 机制。

## 1. 用户已确认的决策

1. **回滚范围 = 完整快照（处理产出 + 派生活动 + 源数据）**：每份版本含 `analysis_data.json` + `events.json` + 当次 `snapshots/` + `yundocs_data/` + `input/`。回滚同时还原前端可见状态与源数据（据此可重新处理复现）。**不含** `followup_records.json`（用户手填跟进记录）与 `analysis_data.js`（旧前端遗留）。
2. **时机 = 更新成功后自动存档**。
3. **粒度 = 按处理次数，留最近 3 份**，超出删最旧。
4. 版本号用"处理完成本地时刻"时间戳目录；manifest 的项目数/节点数取自 `analysis_data.json` 的 `meta`。
5. 回滚前自动把"当前状态"备份到 `_pre_rollback`（仅留 1 份），供撤销误回滚。

## 2. 存储布局

```
data/history/
  20260615-143052/          # 版本号 = datetime.now().strftime("%Y%m%d-%H%M%S")(处理完成时刻)
    manifest.json
    analysis_data.json
    events.json              # 若存在
    snapshots/               # 当次项目域快照副本(若存在)
    yundocs_data/            # 源:云文档抓取副本(若存在)
    input/                   # 源:PMIS/组织/映射/预算(含真实人事数据 → gitignore)
  20260615-101130/  ...      # 最近 3 份
  _pre_rollback/             # 回滚前自动备份的"当前状态"(单份,结构同上 + manifest)
```

存储足迹估算：单份 ≈ analysis_data.json(11.6MB) + 源数据(数 MB) ≈ 15–40MB，×3 + 1 备份 ≈ 60–160MB。本工具单机离线、磁盘充裕，可接受。

**manifest.json**：
```json
{
  "id": "20260615-143052",
  "createdAt": "2026-06-15 14:30:52",
  "trigger": "reprocess",
  "projectCount": 633,
  "paymentNodeCount": 1234,
  "dataLastUpdate": "2026-06-15 14:30",
  "sizeBytes": 24117248,
  "contents": ["analysis_data.json", "events.json", "snapshots", "yundocs_data", "input"]
}
```
`projectCount`/`paymentNodeCount`/`dataLastUpdate` 取自该份 `analysis_data.json` 的 `meta.totalProjects` / `meta.totalPaymentNodes` / `meta.lastUpdate`（缺失则置 0/`"-"`）。

## 3. 新模块 `data_history.py`（纯函数 + 管理器，pytest 先行）

集中所有"哪些文件算一份数据"的知识，server.py 只调接口。常量：

```python
HISTORY_DIRNAME = "history"          # data/history/
PRE_ROLLBACK = "_pre_rollback"
KEEP = 3
# 一份"数据"= 这些 live 项(相对 base_dir);缺失项跳过,不报错
LIVE_ITEMS = [
    ("data/analysis_data.json", "file"),
    ("data/events.json",        "file"),
    ("data/snapshots",          "dir"),
    ("yundocs_data",            "dir"),
    ("input",                   "dir"),
]
```

接口契约：
- `archive_version(base_dir, version_id=None) -> dict`：version_id 默认取当前时刻；把 `LIVE_ITEMS` 存在项复制进 `data/history/<id>/`；读 `analysis_data.json` 的 meta 与目录总字节写 `manifest.json`；调 `prune`；返回 manifest。
- `list_versions(base_dir) -> dict`：`{"versions": [manifest...降序], "preRollback": manifest|None}`。
- `rollback(base_dir, version_id) -> dict`：①校验版本目录存在 ②把当前 `LIVE_ITEMS` 备份到 `history/_pre_rollback/`（覆盖，含 manifest）③把该版本各项覆盖回 live 位置（文件直接覆盖；目录先删后整目录复制）④任一步异常 → 从 `_pre_rollback` 回退并抛错。返回 `{"id", "restored": [...]}`。
- `undo_rollback(base_dir) -> dict`：从 `_pre_rollback` 把各项覆盖回 live 位置（撤销上次回滚）。
- `prune(base_dir, keep=KEEP)`：列版本目录（排除 `_pre_rollback`）按 id 降序，`shutil.rmtree` 超出 keep 的最旧者。

目录覆盖式还原须稳：先复制到同级临时目录再替换（避免半途失败留下残缺 live 目录）；Windows 文件占用时 try/except 落到错误响应而非裸异常。

## 4. 接入点 `server.py`

**4.1 归档钩子（reprocess 成功后自动）**
`run_reprocess`（`server.py:1148`）中 frozen 与 subprocess 两分支**均 fall through 到成功汇合点** `server.py:1198`（`reprocess_state = {... "数据更新完成"}` 之前）。在该唯一汇合点插入一次归档即覆盖两模式（避开 CLAUDE.md §5 双分支坑）：

```python
        # 更新成功 → 自动存一份数据历史(失败只告警,不推翻"更新成功")
        try:
            import data_history
            mf = data_history.archive_version(BASE_DIR)
            logger.info(f"[history] 已存历史版本 {mf['id']}(项目 {mf['projectCount']},占用 {mf['sizeBytes']} 字节)")
        except Exception as e:
            logger.warning(f"[history] 存历史版本失败(不影响本次更新): {e}")
        reprocess_state = {"running": True, "progress": 100, "message": "数据更新完成"}
```
`BASE_DIR`（`server.py:91-95`，frozen=exe 目录 / dev=文件目录）已是 `data/`、`yundocs_data/`、`input/` 的根，归档/回滚同源用它，frozen/dev 自洽。

**4.2 三个 API**
do_GET 路由块（`server.py:348` 起）加：
```python
        elif parsed.path == '/api/data-history':
            self.handle_data_history()
```
do_POST 路由块（`server.py:436` 起）加：
```python
        elif parsed.path == '/api/data-history/rollback':
            self.handle_data_history_rollback()
        elif parsed.path == '/api/data-history/undo-rollback':
            self.handle_data_history_undo()
```
handler 行为：
- `handle_data_history`（GET）→ `data_history.list_versions(BASE_DIR)` → JSON。
- `handle_data_history_rollback`（POST `{id}`）→ 先互斥校验（`sync_state/import_state/pmis_state/reprocess_state` 任一 running 则拒，返回 `{success:false,code,message}`，沿用 A3 错误契约）→ 模块级锁内 `data_history.rollback(BASE_DIR, id)` → `{success:true,message}`；id 非法/版本不存在 → `{success:false,code:"not_found"}`。
- `handle_data_history_undo`（POST）→ 同互斥 → `data_history.undo_rollback(BASE_DIR)`。
回滚为本地拷贝、秒级，JSON 同步响应即可（无需 SSE）。

## 5. 前端

**5.1 composable `useDataHistory`**（仿 `useReprocess`）：暴露 `versions`、`preRollback`、`busy`、`message`；`load()`→GET；`rollback(id)`→POST（前置 `window.confirm`）；`undo()`→POST。成功后回调 `data.reload()` + `loadFileStatus()` + 重新 `load()` 列表。

**5.2 `DataView.vue` 新增「数据历史 / 回滚」卡**（置于"更新数据"卡之后，沿用 `.dv-card/.dv-row/.dv-btn` 样式）：
- 列出近 3 份：`createdAt` / 项目数·节点数 / 占用大小(字节→MB) / 「回滚到此」按钮。
- 「回滚到此」二次确认（提示："将用该版本覆盖当前数据与源数据，当前状态会先备份，可撤销"）；成功 toast + `data.reload()`。
- 若 `preRollback` 非空 → 顶部显示「撤销上次回滚（恢复回滚前状态）」入口。
- 空态：无历史版本时提示"暂无历史版本，"更新数据"成功后会自动保存"。
- 大小格式化复用/新增小工具（bytes→MB，1 位小数）。

## 6. 错误处理与并发/安全

- 归档失败**不**推翻"更新成功"（数据已处理好，归档是附加保险）：try/except + 日志告警。
- 回滚原子性：先备份当前到 `_pre_rollback` 再覆盖；中途失败从 `_pre_rollback` 回退后报错，保证不留半个状态。
- 并发互斥：回滚/撤销与 sync/import/PMIS/reprocess 互斥（复用现有 running 状态判断）+ 模块级锁串行化回滚自身。
- 安全：`input/` 含真实人事/成本源数据，其历史副本同样敏感 → `data/history/` 必须 gitignore，绝不入库；上传/路径仍走既有严格白名单，回滚只在 `data/history/` 与固定 live 位置间拷贝，无路径拼接穿越。

## 7. 测试

**pytest `tests/test_data_history.py`**（`tmp_path` 造假 base_dir：含 `data/analysis_data.json`(带 meta) / `data/events.json` / `data/snapshots/2026-06-15.json` / `yundocs_data/x.json` / `input/y.csv`）：
- `archive_version` → 生成版本目录含全部 live 项 + manifest，`projectCount`/`paymentNodeCount` 来自 meta。
- 连续 archive 4 次 → `prune` 后只剩最新 3 个版本目录。
- `rollback`：改动 live 后回滚到某版本 → live 各项还原为该版本内容，且生成 `_pre_rollback`。
- `undo_rollback` → live 还原为 `_pre_rollback`（回滚前）内容。
- `list_versions` → 降序 + `preRollback` 正确。
- 缺失项（如无 `input/`）archive 不报错、只存在的项入档。

**vitest**：`useDataHistory`/`DataView` 历史卡：mock GET 返回 3 版本 → 渲染时间/项目数/大小；点「回滚到此」→ 触发 confirm + POST + 成功后 `data.reload()` 调用；`preRollback` 存在时显示撤销入口；空态文案。

## 8. 打包与收尾

- `.gitignore` 增 `data/history/`（含真实源数据副本，不入库）。
- `PaymentReviewApp.spec`：datas 列表（`:65-75`）加 `('data_history.py', '.')`；hiddenimports（`:87`）加 `'data_history'`（server.py 顶层/惰性 import 它，确保 frozen 可加载）。
- `frontend/src/version.ts` → `V1.1.0` / `2026-06-15`；`PROGRESS.md` 收尾。
- 全量门禁 `bash verify.sh` 全绿。

## 9. 不做清单（YAGNI）

- 不做版本"命名/备注"编辑（manifest 自动元数据足够）；不做手动"另存历史"按钮（已定全自动）。
- 不做差量/去重/压缩存储（方案 A 目录式整份，单机磁盘够用，优先稳与透明）。
- 不版本化 `followup_records.json`（用户数据，回滚不应抹掉用户跟进记录）。
- 不做跨机/远程备份、不做导出下载历史版本。
- 不改 `data/snapshots/`（Phase P3 项目域 diff）既有机制。
- 不做超过 3 份的可配置保留数（已定 3）。
