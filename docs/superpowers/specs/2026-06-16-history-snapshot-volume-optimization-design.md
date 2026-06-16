# 历史快照体积优化（分组留存）Design

> 子项目：数据历史快照体积优化。独立立项（回款看板重建程序 2A–2E 已收官，本项非其延续）。
> 状态：设计已与用户确认，待写实施计划。
> 版本影响：`frontend/src/version.ts` **V1.6.0 → V1.6.1**（/data 数据历史卡的本地行为调整，Z 级）。

## 1. 背景与现状

`data_history.py`：每次「更新数据」(reprocess) 成功后，把一份**完整数据快照**（产出 + 源）存为新版本，按处理次数留最近 `KEEP=3` 份，支持回滚/撤销/剪枝（copy-then-swap 近原子）。当前一份快照的 `LIVE_ITEMS`：

| LIVE_ITEM | kind | 实测体积 | 占比 | 性质 |
|---|---|---|---|---|
| `input` | dir | **58M** | 76% | 源（上传的 Excel） |
| `yundocs_data` | dir | 4.5M | 6% | 源（云抓取） |
| `data/analysis_data.json` | file | **12M** | 16% | JSON 产出（看板唯一数据源） |
| `data/snapshots` | dir | 1.3M | 2% | 产出（Phase P3 日 diff） |
| `data/events.json` | file | 12K | ~0 | 产出 |

合计 ≈ 76MB/份 × 3 份 = ~228MB。**源数据占 82%**（尤其 `input` 58M），是体积主因；而看板实际显示只依赖 JSON 产出（17%）。

**问题**：留存份数少（仅 3）、体积大；用户希望省体积并延长可回滚版本数。

## 2. 目标

- 大幅降低历史快照总体积。
- 把可回滚的「看板数据」版本数从 3 提升到 **5**。
- 不触碰云同步功能与 live 数据流（仅改快照层）。

## 3. 方案：分组留存（用户钦定）

按数据性质分两组、各自独立留存策略：

- **JSON 产出组**（`data/analysis_data.json` + `data/events.json` + `data/snapshots`）：每次 reprocess 存一个新版本目录，剪枝保 **5** 份。
- **Excel 源组**（`input`）：不进版本目录，统一刷新到全局共享的 `_source/input`，**永远只留最新 1 份**。
- **`yundocs_data`：不再归档进历史快照**（live 的 `yundocs_data` 与云同步 `/api/sync`、`fetch_yundocs_full.py` 照常保留、不受影响）。

### 3.1 新目录布局

```
data/history/
├── 20260616-101500/          ← JSON 产出版本（留近 5 份）
│   ├── analysis_data.json
│   ├── events.json
│   ├── snapshots/
│   └── manifest.json
├── 20260616-093000/          ← 更早的 JSON 版本…
├── ...（剪枝后最多 5 份）
├── _source/                  ← Excel 源，全局共享，只留最新 1 份
│   ├── input/                  (每次 reprocess copy-then-swap 刷新)
│   └── manifest.json           (记录来自哪次 reprocess / 刷新时间)
└── _pre_rollback/            ← 回滚前的 JSON 产出备份（撤销用，沿用现状，只含 JSON 产出）
```

- 体积估算：5 × 13.3MB（JSON 产出）+ 1 × 58MB（input）≈ **125MB**，对比现 228MB（仅 3 版）减约 45%，版本数 3→5。

### 3.2 archive_version（更新数据成功时）

1. 新建版本目录 `data/history/<ts>/`，只 copy-then-swap 进 **JSON 产出组** 三项（缺失项跳过）。
2. 刷新 `_source/input`：copy-then-swap 把当前 live `input` 覆盖到 `_source/input`（只 1 份，不带时间戳）；写 `_source/manifest.json`（`refreshedFrom=<ts>`、`refreshedAt`）。`input` 缺失则跳过、不报错。
3. 写版本 `manifest.json`（见 §4）。
4. 剪枝 JSON 产出版本，保 **5** 份（`_source`/`_pre_rollback` 不计入、不被剪）。

> `yundocs_data` 不再出现在任何归档路径。

## 4. 回滚语义（已与用户确认）

> **回滚 = 把某版本的 JSON 产出还原回 live；Excel 源（`input`）与 `yundocs_data` 保持最新不动。**

依据：看板只读 `analysis_data.json`，源仅供下次「更新数据」重算。回滚旧版本即"恢复那次的看板显示数据"；源不参与逐版回滚（也无旧版源可还原）。

- `rollback(version_id)`：① 先把当前 **JSON 产出** 备份到 `_pre_rollback`（含 manifest，沿用现状）；② 把目标版本目录里的 JSON 产出项覆盖回 live；③ 中途失败从 `_pre_rollback` 回退并抛错。**不动** live `input`/`yundocs_data`。
- `undo_rollback()`：从 `_pre_rollback` 把 JSON 产出覆盖回 live（沿用现状）。
- 含义提示：回滚到旧版后若再点「更新数据」，会用最新源重算并覆盖 JSON 产出（符合预期）。

## 5. Manifest 与 /data 展示

- **版本 manifest**：去掉源相关统计，`contents` 只列 JSON 产出项；`sizeBytes` 只统计版本目录（JSON 产出）。保留 `id/createdAt/trigger/projectCount/paymentNodeCount/dataLastUpdate`。
- **`_source/manifest.json`**：`{ refreshedFrom: <版本 id>, refreshedAt, sizeBytes }`。
- **`list_versions`** 返回结构增加 `source` 字段（`_source/manifest.json` 内容，供前端展示"源副本来自哪次更新、体积"）；`versions`/`preRollback` 沿用。
- **DataView「数据历史」卡**：版本行体积变小；新增一行只读说明——"源数据仅保留最新 1 份（来自最近一次更新），回滚仅还原看板数据"。文案与样式实现时按设计令牌落地，不手写散值。

## 6. 迁移与向后兼容

- `data/history` 为运行时生成且 gitignored（本仓库 checkout 无此目录），无需迁移脚本。
- 用户机上若残留**旧全量布局**版本目录（含 input/yundocs/analysis_data 等）：
  - 列表：旧版本 manifest 仍可读、正常列出。
  - 回滚：`_restore_into_live` 只还原 **JSON 产出** 三项（旧目录里多余的 `input/yundocs_data` 子项被忽略、不还原），与新语义一致、安全。
  - 剪枝：新 `KEEP=5` 生效后，旧全量目录与新目录统一按时间序剪枝（旧的更早、会先被剪掉，自然腾出空间）。

## 7. 范围与非目标（YAGNI）

- **做**：`data_history.py` 分组留存重构（archive/list/rollback/undo/prune）+ manifest 调整 + DataView 展示文案 + pytest。
- **不做**：① 停用/删除云同步（`/api/sync`、`fetch_yundocs`）——明确仅快照层；② 内容哈希去重（用户选了分组留存的简单方案）；③ 压缩/打包归档（zip 等）；④ 把 `KEEP` 做成 UI 可配置项（常量即可）；⑤ 触碰 `manual_history.py`（2E 人工数据快照，独立模块，不在本次范围）。

## 8. 测试（pytest，扩充 `tests/test_data_history.py`）

1. **新版本只含 JSON 产出**：archive 后版本目录有 `analysis_data.json/events.json/snapshots`，**无** `input`/`yundocs_data`。
2. **源只 1 份且刷新**：连续两次 archive 后 `_source/input` 存在且为最新内容；`_source` 不随版本增多而增加。
3. **JSON 剪枝保 5**：archive 6 次后版本目录恰 5 个（`_source`/`_pre_rollback` 不计、不被剪）。
4. **回滚只还原 JSON 产出**：改 live `analysis_data.json` 与 live `input` 后回滚旧版，`analysis_data.json` 恢复、live `input` **保持不变**。
5. **copy-then-swap 无残渣**：archive/rollback 后无 `.tmp` 残留。
6. **向后兼容**：手工造一个旧全量布局版本目录（含 input），回滚它只还原 JSON 产出、不报错、不动 live input。
7. **缺失项容错**：`input` 缺失时 archive 不报错、跳过源刷新。

## 9. 验证

`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。改了 `data_history.py` 计算/留存逻辑须先补/改 pytest 再改实现（TDD）。
