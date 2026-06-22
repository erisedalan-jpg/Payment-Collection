# 数据管理界面调整：彻底移除 WPS + 双数据来源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「数据管理」页重构为「页面导入 / 本地放置」两条数据来源路径，彻底拆除 WPS 同步与一切在线抓取入口，并补齐核心回款源 `collection_stages.csv` 的页面可见性与可上传性。

**Architecture:** 后端先做安全的增量（collection_stages 可见可传）与 `pay_projects` 换源，再原子化删除 yundocs 数据源 + schema 死键 + 类型重生成，随后删 WPS/在线下载端点与脚本，最后重构前端页面、删冗余 composable，收尾版本与文档。每个任务以 `bash verify.sh` 全绿为完成判据。

**Tech Stack:** Python 标准库 HTTP（`server.py`）+ pydantic（`schema.py`）+ 数据管线（`preprocess_data.py`）；前端 Vue3 + Vite + TS + Pinia + Element Plus；测试 pytest + vitest。

## Global Constraints

- 版本单一来源 `frontend/src/version.ts`，本次目标 **V1.16.2**，`RELEASE_DATE = '2026-06-22'`（仅改此处，CLAUDE/PROGRESS 不逐版同步代码版本号）。
- 交流与代码注释用**简体中文**；**不使用任何 emoji**，需符号时用 `→ ↓ ❌ ✕ ▾`。
- 跟进类型术语用「**邮件推动**」（非「邮件催收」）。
- 完成判据 = `bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。改后端计算逻辑**先补/改测试再改实现**（TDD）。
- 打包/开发两套路径同改（CLAUDE §5）：删 Playwright 预导入与 `_run_script_direct('fetch_yundocs_full')` 时，frozen 与 dev 分支一并处理。
- 提交信息结尾固定：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 改了 `schema.py` 后必须 `cd frontend && npm run gen:types` 重生成 `src/types/analysis.ts`。
- 设计令牌只引用 `theme.css` 变量，前端样式**不手写散值**。
- 仓库内 `.claude/worktrees/*` 是陈旧副本，**所有 grep/改动一律排除**它。

---

## File Structure

| 文件 | 改动 |
|---|---|
| `config.py` | `INPUT_UPLOAD_NAMES` 加 `collection_stages.csv`；删 `SHEET_*`/`WPS_LINK_KEY`/`DEFAULT_LINKS`/`TAG_SEED_*` |
| `server.py` | 删 WPS/在线下载端点与 handler、`_SUPER_ONLY_PATHS` 对应项、`sync_state/import_state`、`merged_pmis_links` |
| `preprocess_data.py` | 删 yundocs 读取链；`pay_projects` 换源 collection_stages；`followupRecords` 改读本地 json；`tagSeed={}` |
| `schema.py` | 删 `ProjectOverview` 类与 `projectOverview/naguanMap/naguanExclude` 字段 |
| `data_scope.py` | `_PID_KEYED` 去 naguan；删 projectOverview 裁切块 |
| `fetch_yundocs_full.py`、`pmis_download.py` | **删除整个文件** |
| `frontend/src/views/DataView.vue` | 删 WPS 卡 + PMIS 在线下载；新增数据来源说明卡 + 统一文件清单卡 |
| `frontend/src/composables/useInputFiles.ts` | `INPUT_FILE_NAMES` 加 `collection_stages.csv` |
| `frontend/src/composables/usePmisSync.ts` | 删 links/download，仅留 upload |
| `frontend/src/composables/useCloudSync.ts`、`useExcelImport.ts`、`frontend/src/lib/excelImport.ts` | **删除整个文件** |
| `frontend/src/stores/data.ts` | `clearBusinessData` 去 projectOverview 引用 |
| `frontend/src/version.ts` | → V1.16.2 |
| `tests/*`、`frontend/src/**/*.test.ts` | 增/改/删（见各任务） |
| `CLAUDE.md`、`PROGRESS.md` | 架构地图去 WPS；进度更新 |

---

## Task 1: collection_stages.csv 纳入页面（可见 + 可上传）

纯增量、零删除，最安全，先落地。`is_valid_input_name` 与 `collect_file_status` 都基于 `config.INPUT_UPLOAD_NAMES`，加一项即同时打通"上传白名单 + 文件状态展示"。

**Files:**
- Modify: `config.py:83-84`（`INPUT_UPLOAD_NAMES`）
- Modify: `frontend/src/composables/useInputFiles.ts:1-4`（`INPUT_FILE_NAMES`）
- Test: `tests/test_server_pmis_upload.py`（加后端断言）、`frontend/src/composables/useInputFiles.test.ts`（加前端断言）

**Interfaces:**
- Produces: `config.COLLECTION_STAGES_FILE`（已存在 = `"collection_stages.csv"`）进入 `config.INPUT_UPLOAD_NAMES`，使 `server.is_valid_input_name("collection_stages.csv") is True` 且 `server.collect_file_status(base)` 含该键。

- [ ] **Step 1: 写后端失败测试**

在 `tests/test_server_pmis_upload.py` 末尾追加：

```python
def test_collection_stages_is_valid_input_name():
    """核心回款源 collection_stages.csv 必须可经 /api/inputs/upload 页面上传。"""
    import server
    assert server.is_valid_input_name("collection_stages.csv") is True


def test_collection_stages_in_file_status(tmp_path):
    """文件状态清单必须包含 collection_stages.csv（缺失则值为 None，但键须在）。"""
    import server
    status = server.collect_file_status(str(tmp_path))
    assert "collection_stages.csv" in status
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_pmis_upload.py::test_collection_stages_is_valid_input_name tests/test_server_pmis_upload.py::test_collection_stages_in_file_status -v`
Expected: FAIL（`collection_stages.csv` 不在白名单 / 不在状态键）

- [ ] **Step 3: 改 config.INPUT_UPLOAD_NAMES**

`config.py` 当前（83-84）：

```python
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY,
                      PAYMENT_RECORDS_FILE, PROFIT_DIRECT_FILE, PROFIT_BRIDGE_FILE, BUDGET_FILE]
```

改为（追加 `COLLECTION_STAGES_FILE`）：

```python
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY,
                      PAYMENT_RECORDS_FILE, PROFIT_DIRECT_FILE, PROFIT_BRIDGE_FILE, BUDGET_FILE,
                      COLLECTION_STAGES_FILE]
```

- [ ] **Step 4: 跑后端测试确认通过**

Run: `python -m pytest tests/test_server_pmis_upload.py -v`
Expected: PASS

- [ ] **Step 5: 写前端失败测试**

`frontend/src/composables/useInputFiles.test.ts` 内，给"白名单含核心文件"类断言追加（若无则新增）：

```ts
import { INPUT_FILE_NAMES } from './useInputFiles'

it('白名单包含核心回款源 collection_stages.csv', () => {
  expect(INPUT_FILE_NAMES).toContain('collection_stages.csv')
})
```

- [ ] **Step 6: 跑前端测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useInputFiles.test.ts`
Expected: FAIL（不含 collection_stages.csv）

- [ ] **Step 7: 改 useInputFiles.INPUT_FILE_NAMES**

`frontend/src/composables/useInputFiles.ts:1-4` 改为：

```ts
export const INPUT_FILE_NAMES = [
  '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
  'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
  'collection_stages.csv',
]
```

- [ ] **Step 8: 跑前端测试确认通过**

Run: `cd frontend && npx vitest run src/composables/useInputFiles.test.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add config.py frontend/src/composables/useInputFiles.ts tests/test_server_pmis_upload.py frontend/src/composables/useInputFiles.test.ts
git commit -m "$(cat <<'EOF'
feat(data): 核心回款源 collection_stages.csv 纳入页面上传白名单 + 文件状态展示

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: preprocess `pay_projects` 换源到 collection_stages

`pay_projects`（"回款项目"清单）当前由 yundocs 的 `project_overview` 派生，喂给 `pmis.load_project_pmis`。Task 3 将删除 `project_overview`，故先把 `pay_projects` 换源到 `collection_stages.csv` 的项目号集合（语义正确：回款项目 = 收款台账里的项目）。引入纯函数 helper 便于单测；`main()` 内把 `collection_stages` 的加载提前到 `load_project_pmis` 之前，9f 段复用同一对象。

**Files:**
- Modify: `preprocess_data.py`（新增 helper；`main()` 重排 collection_stages 加载位置 + 换 pay_projects 来源）
- Test: `tests/test_preprocess_pay_projects.py`（新建）

**Interfaces:**
- Produces: `preprocess_data._pay_projects_from_collection(collection_stages: dict) -> list[dict]`，返回 `[{"projectId": pid, "projectName": ""}, ...]`，`pid` 取自 `collection_stages` 的键，顺序稳定（按插入序）。Task 3 依赖此函数已就位。
- Consumes: `collection_mod.load_collection_stages(input_dir, today) -> dict[str, list]`（已存在），其键为项目号。

- [ ] **Step 1: 写失败测试**

新建 `tests/test_preprocess_pay_projects.py`：

```python
import preprocess_data as pre


def test_pay_projects_from_collection_maps_keys():
    cs = {"P1": [{"node": 1}], "P2": [], "P3": [{"node": 2}]}
    out = pre._pay_projects_from_collection(cs)
    assert out == [
        {"projectId": "P1", "projectName": ""},
        {"projectId": "P2", "projectName": ""},
        {"projectId": "P3", "projectName": ""},
    ]


def test_pay_projects_from_collection_empty():
    assert pre._pay_projects_from_collection({}) == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_preprocess_pay_projects.py -v`
Expected: FAIL（`AttributeError: module 'preprocess_data' has no attribute '_pay_projects_from_collection'`）

- [ ] **Step 3: 加 helper 函数**

在 `preprocess_data.py` 的 `main()` 之前（如紧邻 `_collection_nodes_for` 附近）新增：

```python
def _pay_projects_from_collection(collection_stages):
    """回款项目清单换源:取收款阶段台账(collection_stages.csv)的项目号。
    取代旧的 yundocs project_overview 派生,语义=回款项目即收款台账里的项目。"""
    return [{"projectId": pid, "projectName": ""} for pid in collection_stages]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_preprocess_pay_projects.py -v`
Expected: PASS

- [ ] **Step 5: main() 重排 collection_stages 加载并换 pay_projects 来源**

在 `preprocess_data.py:main()` 中，**把 collection_stages 的加载提前**到 `load_project_pmis`（当前约 857 行）之前。具体：

1. 在 `# === 9b. 摄取 PMIS 项目域 ===` 之前新增（紧接 9a 项目映射之后即可）：

```python
    # 提前加载收款阶段台账(系统核心回款源),供 pay_projects 换源与 9f 复用
    _today = datetime.now().strftime("%Y-%m-%d")
    collection_stages = collection_mod.load_collection_stages(
        os.path.join(BASE_DIR, "input"), _today)
```

2. 把当前（约 853-855）的：

```python
    # 换源:pay_projects 改由 project_overview 取,不再遍历 all_nodes
    pay_projects = [{"projectId": p.get("projectId", ""), "projectName": p.get("projectName", "")}
                    for p in project_overview]
```

改为：

```python
    # 换源:pay_projects 取收款阶段台账项目号(原 yundocs project_overview 已下线)
    pay_projects = _pay_projects_from_collection(collection_stages)
```

3. 删除 9f 段（约 913-915）里**重复的** `_today`/`collection_stages` 加载（已提前），保留其余 9f 逻辑：

```python
    # === 9f. 系统核心口径回款(3A):收款阶段台账 collection_stages.csv;售前回退原项目 ===
    def _pmis_contract(_pid):
        return ((project_pmis.get(_pid) or {}).get("customer") or {}).get("合同总额")
    # _today / collection_stages 已在 9b 前加载,此处直接复用
    payment_nodes = {}
```

- [ ] **Step 6: 冒烟核对 main() 仍产出有效数据**

Run（需真实 input/ 数据）：`python preprocess_data.py`
Expected: 正常输出 `data/analysis_data.json`，打印 `[OK] 数据已通过 schema 校验`；`收款阶段项目` 数量 > 0；无 traceback。

- [ ] **Step 7: 跑全量后端测试确认无回归**

Run: `python -m pytest -q`
Expected: 全绿（无新失败）

- [ ] **Step 8: 提交**

```bash
git add preprocess_data.py tests/test_preprocess_pay_projects.py
git commit -m "$(cat <<'EOF'
refactor(preprocess): pay_projects 换源到 collection_stages.csv(为下线 yundocs 铺路)

提前加载收款阶段台账供 pay_projects 与 9f 复用;数据治理匹配/未匹配指标改以收款台账为基数。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 删除 yundocs 数据源 + schema 死键 + 类型重生成

原子化协调改动：后端停读 `yundocs_data/`、删 schema 死键、前端重生成类型并清理引用，必须同一提交内落地以保持 verify 全绿。`followupRecords` 改为只读本地 `data/followup_records.json` 重建（保护实时数据、绝不写回）；`tagSeed` 恒为 `{}`。

**Files:**
- Modify: `preprocess_data.py`（删 yundocs 读取链；新增 followup 本地重建 helper；`final_data` 删死键、`tagSeed={}`）
- Modify: `schema.py`（删 `ProjectOverview` 类与三字段）
- Modify: `data_scope.py`（`_PID_KEYED` 去 naguan；删 projectOverview 裁切块）
- Modify: `frontend/src/stores/data.ts`（`clearBusinessData` 去 projectOverview）
- Regenerate: `frontend/src/types/analysis.ts`（`npm run gen:types`）
- Test: `tests/test_preprocess_followup_local.py`（新建）、`tests/test_data_scope.py`（改）；删 `tests/test_tag_seed.py`

**Interfaces:**
- Produces: `preprocess_data._followup_records_from_local(records: list) -> dict[str, list]`，把扁平记录数组按 `项目编号` 分组、每项目按 `跟进时间` 降序取最近 5 条。
- Consumes: Task 2 的 `_pay_projects_from_collection` 已就位；`collection_stages` 已在 9b 前加载。

- [ ] **Step 1: 写 followup 本地重建失败测试**

新建 `tests/test_preprocess_followup_local.py`：

```python
import preprocess_data as pre


def test_followup_from_local_groups_and_caps():
    records = [
        {"项目编号": "P1", "跟进时间": "2026-01-01", "内容": "a"},
        {"项目编号": "P1", "跟进时间": "2026-03-01", "内容": "b"},
        {"项目编号": "P2", "跟进时间": "2026-02-01", "内容": "c"},
    ]
    out = pre._followup_records_from_local(records)
    assert set(out.keys()) == {"P1", "P2"}
    # 每项目按跟进时间降序
    assert [r["内容"] for r in out["P1"]] == ["b", "a"]


def test_followup_from_local_top5():
    records = [{"项目编号": "P1", "跟进时间": f"2026-01-{i:02d}", "i": i} for i in range(1, 9)]
    out = pre._followup_records_from_local(records)
    assert len(out["P1"]) == 5
    assert [r["i"] for r in out["P1"]] == [8, 7, 6, 5, 4]  # 最近5条


def test_followup_from_local_empty():
    assert pre._followup_records_from_local([]) == {}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_preprocess_followup_local.py -v`
Expected: FAIL（`_followup_records_from_local` 未定义）

- [ ] **Step 3: 加 followup 本地重建 helper，并删旧 yundocs followup 读取**

在 `preprocess_data.py` 新增（取代旧 `process_followup_records`）：

```python
def _followup_records_from_local(records):
    """从本地 data/followup_records.json(扁平数组)重建按项目分组的跟进记录快照。
    只读不写,保护 /api/followup 维护的实时数据;每项目按跟进时间降序取最近 5 条。"""
    by_project = {}
    for r in records or []:
        pid = r.get("项目编号", "")
        if not pid:
            continue
        by_project.setdefault(pid, []).append(r)
    for pid in by_project:
        by_project[pid] = sorted(
            by_project[pid], key=lambda x: x.get("跟进时间", ""), reverse=True)[:5]
    return by_project
```

删除旧函数 `process_followup_records`（约 456-548，整段含写 `followup_records.json` 的逻辑）。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_preprocess_followup_local.py -v`
Expected: PASS

- [ ] **Step 5: 删除 yundocs 读取链与死代码**

在 `preprocess_data.py` 删除以下定义（均为 yundocs/旧口径，已无活调用）：
- `load_sheet`（约 36-43）
- `process_below100_nodes` 及其节点状态助手（约 256-443，旧 yundocs 回款节点路径，`main()` 无调用点）
- `process_project_overview`（约 558-611）、`_overview_or_empty`（约 783-797）
- `compute_classification`、`compute_service_groups`（约 633-737）
- `derive_tag_seed`（约 614 起整函数）
- 顶部常量 `INPUT_DIR = os.path.join(BASE_DIR, "yundocs_data")`（约 29）

> 删除后 grep 自检无残留调用：`grep -nE "load_sheet|process_below100|process_above100|process_project_overview|_overview_or_empty|compute_classification|compute_service_groups|derive_tag_seed|process_followup_records|yundocs_data" preprocess_data.py`（应为空）。

- [ ] **Step 6: main() 移除 yundocs 段并改 final_data 输出**

在 `preprocess_data.py:main()`：

1. 删除"=== 2. 处理项目验收日期Sheet ==="（约 809-817）、"=== 4. 计算分类分布 ==="（819-822）、"=== 5. 计算服务组重点关注 ==="（824-827）、`overview_cols` 构建（829-836）三段，以及顶部初始化 `naguan_map/project_overview/classification/service_groups/...`（约 802-807）。
2. 把 `# === 9. 处理跟进记录 ===` 改为读本地 json：

```python
    # === 9. 跟进记录:只读本地 data/followup_records.json 重建快照(不写回) ===
    print("[INFO] 读取本地跟进记录...")
    _fpath = os.path.join(BASE_DIR, 'data', 'followup_records.json')
    try:
        with open(_fpath, 'r', encoding='utf-8') as f:
            _flat = json.load(f)
    except (OSError, ValueError):
        _flat = []
    followup_records = _followup_records_from_local(_flat)
```

3. `final_data`（约 949-973）删除三个死键、`tagSeed` 改 `{}`：

```python
    final_data = {
        "meta": {
            "lastUpdate": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "totalProjects": len(dept_projects),
            "totalClosed": len(closed_projects),
            "totalPaymentNodes": sum(len(v) for v in payment_nodes.values()),
        },
        "followupRecords": followup_records,
        "projectPmis": project_pmis,
        "dataQuality": data_quality,
        "projects": dept_projects,
        "closedProjects": closed_projects,
        "projectsQuality": projects_quality,
        "projectMilestones": project_milestones,
        "paymentRecords": payment_records,
        "paymentNodes": payment_nodes,
        "projectProfit": project_profit,
        "tagSeed": {},
    }
```

4. 删除收尾打印里引用已删变量的行（约 996-999 的 `项目总数(验收日期表)`/`分类总数`/`重点关注`）。

- [ ] **Step 7: 删 schema 死键**

`schema.py`：删除 `class ProjectOverview`（27-29）；删除 `AnalysisData` 中（322-324）：

```python
    projectOverview: ProjectOverview
    naguanMap: Dict[str, bool] = {}
    naguanExclude: Dict[str, bool] = {}
```

保留 `followupRecords: Dict[str, Any] = {}` 与 `tagSeed: Dict[str, List[str]] = {}`。

- [ ] **Step 8: 改 data_scope 死键裁切**

`data_scope.py`：`_PID_KEYED`（5-9）去掉 `'naguanMap', 'naguanExclude'`：

```python
_PID_KEYED = (
    'projectPmis', 'paymentNodes', 'projectMilestones', 'paymentRecords',
    'projectProfit', 'followupRecords', 'tagSeed',
)
```

删除 projectOverview 裁切块（55-60，`ov = data.get('projectOverview') ...` 整段）。

- [ ] **Step 9: 改 test_data_scope.py（移除 projectOverview）**

`tests/test_data_scope.py`：删除 `_fixture()` 中的 `projectOverview` 块（20-26）；删除 `test_filter_by_l4` 中 projectOverview 两行断言（66-68）。`followupRecords`/`tagSeed` 相关断言保留。

- [ ] **Step 10: 删 test_tag_seed.py**

```bash
git rm tests/test_tag_seed.py
```

- [ ] **Step 11: 改 stores/data.ts（去 projectOverview）**

`frontend/src/stores/data.ts` 的 `clearBusinessData`（26-34）改为（业务数据现以 `projects` 为底座；清空内存项目列表，保留其它）：

```ts
  /** 清空内存业务数据（projects），保留 meta。忠实移植 clearData 的内存清空。 */
  function clearBusinessData() {
    if (!data.value) return
    data.value = { ...data.value, projects: [] }
  }
```

- [ ] **Step 12: 重新生成前端类型**

Run: `cd frontend && npm run gen:types`
Expected: `src/types/analysis.ts` 重新生成，不再含 `ProjectOverview`/`projectOverview`/`naguanMap`/`naguanExclude`。

- [ ] **Step 13: 全仓孤儿消费方自检（排除 worktrees）**

Run:
```bash
grep -rnE "projectOverview|naguanMap|naguanExclude" --include=*.py --include=*.ts --include=*.vue . | grep -v ".claude/worktrees/"
```
Expected: 空输出。若有残留消费方，逐一清理后再继续。

- [ ] **Step 14: 跑 verify 确认全绿**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`（含 preprocess 冒烟需另跑 `python preprocess_data.py` 核对 schema 校验通过）

- [ ] **Step 15: 提交**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(data): 彻底下线 yundocs 数据源 + 删 schema 死键(projectOverview/naguan)

preprocess 停读 yundocs_data;followupRecords 改只读本地 json 重建(不写回);tagSeed 置空;
删 ProjectOverview/naguanMap/naguanExclude(前端零消费),重生成 analysis.ts;data_scope 同步。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 删除 WPS / 在线下载 端点与脚本

拆除一切在线抓取入口：WPS 同步、离线 milestone 导入、PMIS 直链下载、PMIS 链接配置。删对应 handler、路由、`_SUPER_ONLY_PATHS` 项、全局状态、`fetch_yundocs_full.py`/`pmis_download.py` 脚本与 Playwright 依赖。保留页面上传（`/api/pmis/upload`、`/api/inputs/upload`）与 `/api/reprocess`、`/api/files/status`。

**Files:**
- Modify: `server.py`（删端点路由 + handler + `_SUPER_ONLY_PATHS` + 状态 + 脚本调度 + `merged_pmis_links`）
- Modify: `config.py`（删 `SHEET_*`/`WPS_LINK_KEY`/`DEFAULT_LINKS`/`TAG_SEED_*`/Playwright 预导入）
- Delete: `fetch_yundocs_full.py`、`pmis_download.py`
- Test: `tests/test_server_authz.py`（改）；删 `tests/test_pmis_download.py`

**Interfaces:**
- Produces: `/api/sync`、`/api/sync-status`、`/api/stop-sync`、`/api/import`、`/api/import-status`、`/api/stop-import`、`/api/pmis/download`、`/api/pmis/links` 这些路径**不再存在**（非超管访问由 404 而非 403 兜底）。

- [ ] **Step 1: 改 test_server_authz.py（去掉已删端点断言）**

`tests/test_server_authz.py:77` 删除该行（`/api/import` 将不复存在，不再属 super-only）：

```python
        assert _status(conn, "POST", "/api/import", ck, body="") == 403
```

其余 P0-2 断言（clear-data/reprocess/stop/files-status/data-history/inputs-upload/manual-rollback）保留。

- [ ] **Step 2: 跑测试确认当前仍绿（基线）**

Run: `python -m pytest tests/test_server_authz.py -v`
Expected: PASS（删行后基线绿；端点尚未删，但该断言已移除）

- [ ] **Step 3: 删 server.py 路由分发**

`do_GET`（约 384-415）删除这些 `elif` 分支：`/api/sync`、`/api/sync-status`、`/api/stop-sync`、`/api/stop-import`、`/api/import-status`、`/api/pmis/links`、`/api/pmis/download`。
`do_POST`（489-500）删除：`/api/import`、`/api/pmis/links`。
保留：`/api/pmis/upload`、`/api/inputs/upload`、`/api/reprocess`、`/api/files/status`、followup/tags/manual/admin/auth。

- [ ] **Step 4: 删 server.py handler 方法**

删除整段方法：`handle_sync`(527-568)、`handle_sync_status`(569-625)、`handle_import`(626-651)、`handle_stop_sync`(652-663)、`handle_stop_import`(664-674)、`handle_import_status`(675 起整函数)、`handle_pmis_links_get`(988-1014)、`handle_pmis_links_post`(1015-1030)、`handle_pmis_download`(1093-1115)、`merged_pmis_links`(53-55)。
保留：`handle_pmis_upload`、`handle_inputs_upload`、`handle_reprocess`、`handle_files_status`。

- [ ] **Step 5: 删 server.py 全局状态与脚本调度**

删除：`sync_state`/`sync_url`/`import_state`（config 段约 138-142，注意 `import_state` 在多处互斥判断被引用，需一并清理其引用点，如 reprocess/manual 的互斥检查里 `import_state["running"]` 条件）、`pmis_state`、`fetch_yundocs_full.py` 的 `_find_script`/`_run_script_direct` 调用分支（约 1483、1607-1626、1779-1833 的导入数据处理段）。
从 `_SUPER_ONLY_PATHS`（179-187）移除：`'/api/sync'`、`'/api/stop-sync'`、`'/api/stop-import'`、`'/api/import'`、`'/api/pmis/links'`、`'/api/pmis/download'`。保留 `'/api/pmis/upload'`、`'/api/inputs/upload'`、`'/api/reprocess'`、`'/api/files/status'` 等。

> 删除引用 `import_state`/`sync_state` 后，grep 自检：`grep -nE "sync_state|import_state|pmis_state|sync_url|fetch_yundocs|pmis_download|merged_pmis_links" server.py`（应为空）。任一互斥判断若依赖 `import_state["running"]`，改为去掉该条件（页面导入已下线，仅余回滚/reprocess 互斥）。

- [ ] **Step 6: 删 config.py WPS 相关常量与 Playwright 预导入**

`config.py` 删除：`SHEET_PAYMENT_NODES`/`SHEET_PROJECT_OVERVIEW`/`SHEET_FOLLOWUP`（4-7）、`WPS_LINK_KEY`/`DEFAULT_LINKS`（69-75）、`TAG_SEED_WHITELIST`/`TAG_SEED_COLUMNS`（97-98）。
删除 `server.py` 顶部的 Playwright 预导入块（`config.py:76-90` 等价代码实际在 `server.py` 引用处；按 CLAUDE §5 frozen/dev 两分支一并删——搜索 `from playwright` 与 `PLAYWRIGHT_BROWSERS_PATH` 删除其 import 守卫块）。`requirements`/打包 spec 若声明 playwright，一并去除。

> grep 自检：`grep -rnE "playwright|SHEET_PAYMENT_NODES|SHEET_PROJECT_OVERVIEW|SHEET_FOLLOWUP|WPS_LINK_KEY|DEFAULT_LINKS|TAG_SEED_" --include=*.py . | grep -v ".claude/worktrees/"`（应为空）。

- [ ] **Step 7: 删脚本文件与其测试**

```bash
git rm fetch_yundocs_full.py pmis_download.py tests/test_pmis_download.py
```

- [ ] **Step 8: 跑 verify 确认全绿**

Run: `bash verify.sh`
Expected: `[PASS]`。若 ruff 报未用 import / pytest 报残留引用，按提示清理。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(server): 拆除 WPS 同步/离线导入/PMIS 在线下载 端点与脚本 + Playwright 依赖

删 /api/sync /api/import /api/pmis/download /api/pmis/links 等及 handler、全局状态;
删 fetch_yundocs_full.py、pmis_download.py;config 清理 WPS Sheet 名/直链/TAG_SEED 列。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 前端 DataView.vue 重构 + 删冗余 composable

把页面重排为「数据来源说明 → 数据文件清单与状态 → 更新数据」+ 保留卡片；删 WPS 卡、PMIS 在线下载入口；删 `useCloudSync`/`useExcelImport`/`lib/excelImport` 与其测试；`usePmisSync` 砍到只剩 upload。

**Files:**
- Modify: `frontend/src/views/DataView.vue`
- Modify: `frontend/src/composables/usePmisSync.ts`（删 links/download）
- Delete: `frontend/src/composables/useCloudSync.ts`、`useExcelImport.ts`、`frontend/src/lib/excelImport.ts` 及对应 `*.test.ts`
- Test: `frontend/src/composables/usePmisSync.test.ts`（删 download/links 用例）；`frontend/src/views/DataView.test.ts`（改：去 WPS/下载断言，加文件清单含 collection_stages 断言）

**Interfaces:**
- Consumes: `usePmisSync()` 现仅暴露 `{ upload, PMIS_FILE_NAMES }`；`useInputFiles()` 的 `INPUT_FILE_NAMES`（含 collection_stages.csv）；`useFileStatus()`；`useReprocess()`；`useDataHistory()`；`manualApi`；`projectTags`。

- [ ] **Step 1: 精简 usePmisSync.ts（只留 upload）**

`frontend/src/composables/usePmisSync.ts` 删除 `links/defaults/progress/message/running` 状态与 `loadLinks/saveLinks/download` 函数，仅保留：

```ts
import { ref } from 'vue'

export const PMIS_FILE_NAMES = [
  '项目中心.xlsx', '项目基础信息数据.xlsx', '项目状态信息数据.xlsx', '项目风险数据.xlsx',
  '项目中心-已关闭.xlsx', '项目基础信息数据-已关闭.xlsx', '项目状态信息数据-已关闭.xlsx',
  '在建项目里程碑计划数据.xlsx', '已结项里程碑计划数据.xlsx',
]

export function usePmisSync() {
  async function upload(files: File[]): Promise<number> {
    let ok = 0
    for (const f of files) {
      if (!PMIS_FILE_NAMES.includes(f.name)) continue
      const buf = await f.arrayBuffer()
      const res = await fetch('/api/pmis/upload?name=' + encodeURIComponent(f.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
      })
      if (res.ok) ok++
    }
    return ok
  }
  return { upload, PMIS_FILE_NAMES }
}
```

- [ ] **Step 2: 删冗余 composable / lib 及其测试**

```bash
git rm frontend/src/composables/useCloudSync.ts frontend/src/composables/useCloudSync.test.ts
git rm frontend/src/composables/useExcelImport.ts frontend/src/composables/useExcelImport.test.ts
git rm frontend/src/lib/excelImport.ts frontend/src/lib/excelImport.test.ts
```

- [ ] **Step 3: 改 usePmisSync.test.ts**

删除该文件内一切 `download`/`links`/`loadLinks`/`saveLinks` 相关 `it(...)` 用例与对应 import；仅保留（或新增）对 `upload` 与 `PMIS_FILE_NAMES` 的断言。若删后文件为空壳，至少保留：

```ts
import { usePmisSync, PMIS_FILE_NAMES } from './usePmisSync'

it('PMIS_FILE_NAMES 含九表', () => {
  expect(PMIS_FILE_NAMES.length).toBe(9)
})

it('usePmisSync 仅暴露 upload', () => {
  const api = usePmisSync()
  expect(typeof api.upload).toBe('function')
})
```

- [ ] **Step 4: 重构 DataView.vue 脚本块**

`frontend/src/views/DataView.vue` `<script setup>`：
- 删除 import：`useCloudSync`、`useExcelImport`，以及 `WPS_KEY` 常量、`onSync`/`importInput`/`onPickImport`/`importing`/`stopExcelImport`/`syncPhase` 等 WPS 相关变量。
- `usePmisSync` 解构改为 `const { upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()`；删除 `pmisLinks/linkDefaults/pmisProgress/pmisMessage/pmisRunning/pmisLoadLinks/pmisSaveLinks/pmisDownload/onPmisDownload/resetLink/hasDefault` 及 `onMounted` 里的 `pmisLoadLinks()`。
- 保留：`useFileStatus`、`useInputFiles`、`useReprocess`、`useDataHistory`、`manualApi`、`projectTags`、`onClear`、标签管理、人工导入、历史回滚。

- [ ] **Step 5: 重构 DataView.vue 模板（两条来源 + 统一文件清单）**

把模板顶部三张卡（原「回款数据 WPS」「PMIS 数据」「项目域文件」）替换为下面两张卡（数据来源说明 + 统一文件清单），其余卡（更新数据/设置/项目标签/人工导入/数据历史）保留不动：

```html
    <div class="dv-card">
      <div class="dv-card-head">数据来源（两种方式）</div>
      <div class="dv-row dv-hint">
        ① 页面导入：在下方「数据文件清单」逐类上传。
        ② 本地放置：把文件放到服务器目录后点「更新数据」生效——
        PMIS 九表放 <b>input/pmis/</b>，其余 CSV/xlsx（含核心回款源 collection_stages.csv）放 <b>input/</b> 根；
        服务器定时任务投放后，凭下方各文件「最近修改时间」核对是否到位。
      </div>
    </div>

    <div class="dv-card" data-test="files-card">
      <div class="dv-card-head">数据文件清单与状态</div>
      <div class="dv-sub-head">PMIS 九表（input/pmis/）</div>
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-frow" data-test="pmis-row">
        <span class="dv-fname">{{ name }}</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
        <button class="dv-btn" @click="onPmisUpload">上传 PMIS 文件</button>
        <span v-if="pmisUploadMsg" class="dv-hint">{{ pmisUploadMsg }}</span>
      </div>

      <div class="dv-sub-head">项目域文件（input/ 根）</div>
      <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-frow">
        <span class="dv-fname">{{ name }}</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <input ref="inputsInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
        <button class="dv-btn" @click="onUploadInputs">上传项目域文件</button>
        <span v-if="inputsUploadMsg" class="dv-hint">{{ inputsUploadMsg }}</span>
      </div>
    </div>
```

`INPUT_DISPLAY_NAMES` 改为含 collection_stages.csv（legacy xlsx 仍隐藏）：

```ts
const INPUT_DISPLAY_NAMES = INPUT_FILE_NAMES.filter((n) => n !== 'delivery_analysis.xlsx')
```

（`INPUT_FILE_NAMES` 已在 Task 1 含 collection_stages.csv，故清单自动出现该行。）新增样式（沿用令牌，勿手写散值）：

```css
.dv-sub-head { font-size: var(--fs-1); font-weight: 700; color: var(--sub); padding: var(--sp-2) var(--sp-4) 0; }
```

- [ ] **Step 6: 改 DataView.test.ts**

`frontend/src/views/DataView.test.ts`：删除一切针对 `data-test="wps-input"`/`wps-reset`/「云同步」/「离线导入」/「在线下载」/`link-reset` 的断言；新增断言「文件清单含 collection_stages.csv 行」：

```ts
it('数据文件清单展示核心回款源 collection_stages.csv', async () => {
  // 挂载 DataView 后,files-card 文本应包含 collection_stages.csv
  const wrapper = mountDataView()   // 复用本文件既有挂载工具
  expect(wrapper.find('[data-test="files-card"]').text()).toContain('collection_stages.csv')
})
```

> 若本测试文件无现成 `mountDataView` 工具，按文件既有挂载方式（`mount(DataView, { global: ... })`）改写该断言。

- [ ] **Step 7: 跑前端检查确认全绿**

Run: `cd frontend && npm run typecheck && npm run test:run && npm run build`
Expected: 全绿，无 TS 报错、无残留对已删 composable 的 import。

- [ ] **Step 8: 手动冒烟**

Run: `python server.py`（另开）+ `cd frontend && npm run dev`，打开 `/data`。
Expected: 页面只剩两条来源说明 + 统一文件清单（含 collection_stages.csv 行及其 mtime）+ 更新数据/标签/人工导入/历史；无 WPS/在线下载入口；无 console 报错。上传一个 PMIS xlsx 与 collection_stages.csv，提示成功；点「更新数据」重算后回款看板可加载。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(data-ui): 数据管理页重构为「页面导入/本地放置」两条来源 + 统一文件清单

删 WPS 卡与 PMIS 在线下载入口;新增数据来源说明 + 含 collection_stages.csv 的文件清单;
删 useCloudSync/useExcelImport/lib/excelImport,usePmisSync 砍至仅 upload。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 版本号 + 文档收尾

**Files:**
- Modify: `frontend/src/version.ts`、`CLAUDE.md`、`PROGRESS.md`

- [ ] **Step 1: bump 版本**

`frontend/src/version.ts` 改为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.16.2'
export const RELEASE_DATE = '2026-06-22'
```

- [ ] **Step 2: 更新 CLAUDE.md 架构地图（去 WPS/yundocs/Playwright）**

`CLAUDE.md`：
- §1 摘要去掉「WPS 云文档仅残留少量历史依赖」「同步功能需 playwright」等表述，改为「数据来源=PMIS 导出 + CSV，经页面上传或本地放置进入 input/」。
- §2 架构图与文件职责表：删 `fetch_yundocs_full.py`、`pmis_download.py` 行；`server.py` 职责去掉 `/api/sync`/`/api/import`/`/api/pmis`(下载)/历史 WPS 字样，保留 `/api/inputs/upload`、`/api/pmis/upload`、`/api/reprocess`。
- §3 运行/调试：删「同步功能依赖 playwright」「同步走 /api/sync」「离线导入」两段，改为「数据更新走页面上传或本地放置 input/ 后点更新数据（/api/reprocess）」。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本史记一条 V1.16.2 条目：

```markdown
## V1.16.2（2026-06-22）数据管理界面调整：彻底移除 WPS + 双数据来源
- 拆除 WPS 同步/离线导入/PMIS 在线下载 全部在线抓取入口与脚本（fetch_yundocs_full.py、pmis_download.py）、Playwright 依赖。
- 数据来源收敛为两条：页面上传 / 本地放置（cron 投放 input/ 与 input/pmis/ 后点「更新数据」）。
- 核心回款源 collection_stages.csv 纳入页面上传白名单 + 文件状态展示。
- 数据血缘清理：yundocs 数据源下线，删 projectOverview/naguanMap/naguanExclude（schema+类型）；pay_projects 换源到 collection_stages；followupRecords 改只读本地 json 重建（不写回）；tagSeed 置空。
- 设计/计划：docs/superpowers/specs/2026-06-22-data-management-wps-removal-design.md、docs/superpowers/plans/2026-06-22-data-management-wps-removal.md。
```

同时订正既有过期技术债条目中「无认证/单线程阻塞/2MB」等若顺手可改（非必须）。

- [ ] **Step 4: 跑 verify 确认全绿**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(release): V1.16.2 数据管理界面调整 + 更新 CLAUDE/PROGRESS 架构地图(去 WPS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 自检：spec 覆盖

- 双来源（页面导入/本地放置）→ Task 5（页面）+ Task 1（collection_stages 可传）。
- 彻底移除 WPS（含数据源下线）→ Task 3（数据源）+ Task 4（端点/脚本/Playwright）。
- PMIS 在线下载移除 → Task 4。
- 死键删除（projectOverview/naguanMap/naguanExclude 连 schema/类型）→ Task 3。
- pay_projects 换源 → Task 2。
- followupRecords 只读重建 / tagSeed 置空 → Task 3。
- collection_stages 可见可传 → Task 1。
- 版本 V1.16.2 + 文档 → Task 6。
- 完成判据 verify.sh 全绿 → 各任务末步。
