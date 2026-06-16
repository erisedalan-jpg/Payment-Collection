# 2E 人工数据导入导出 + 快照回滚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给项目清单一套离线导入导出 + 轻量快照回滚：`/projects` 按勾选范围导出多 sheet xlsx（清单+标签+跟进+回款节点+里程碑）；`/data` 导入人工数据（2C 标签 + 2D 跟进），强校验、导入前快照可回滚；PMIS 取数只读不导入。

**Architecture:** 后端新增纯函数 `manual_import.validate_and_build`（强校验+构建两 store）与轻量快照模块 `manual_history`（镜像 `data_history` 的 copy-then-swap，只备份两小 JSON），server.py 加 `/api/manual/import|backups|rollback` + `/api/followup/all`；前端 `lib/exportXlsx.exportSheets`（多表）+ `lib/projectExport`（按范围构建 sheet 行）+ `lib/manualImport`（复用 excelImport 解析层）+ `lib/manualApi`，`/projects` 加导出按钮+范围弹窗、`/data` 加「人工数据导入/回滚」卡（复用 useDataHistory/useExcelImport 卡范式）。

**Tech Stack:** Python 标准库 HTTP（server.py）；Vue3+Vite+TS+Pinia+Element Plus；SheetJS(xlsx)；Vitest + pytest。

**版本：** `frontend/src/version.ts` 单一来源 **V1.5.0 → V1.6.0**（整页级）。

---

## 关键事实（已核实，落地照此）

后端（`server.py`/`data_history.py`/`schema.py` 行号）：
- 路由：`do_GET`(:309-356，followup/list 在 :333)、`do_POST`(:405-429，data-history/rollback 在 :423)。错误响应 `_error_payload`(:163-165)、`_json_response`(:1032-1037)、错误码 `ERR_VALIDATION/ERR_BUSY/ERR_PARSE/ERR_NOT_FOUND/ERR_INTERNAL`(:153-157)。
- 路径：`BASE_DIR`(:92-97)、`FOLLOWUP_FILE`(:148)、`PROJECT_TAGS_FILE`/`ANALYSIS_FILE`(:185-186)。
- I/O：`_load/_save_followup_records`(:168-182)、`_load/_save_project_tags`(:205-226)、`FOLLOWUP_TYPES/STATUSES`(:149-150)、`handle_followup_list`(:754-776 范式)。
- 互斥：`_history_busy`(:970-972)、`history_state`(:159-160)、`import_state`/`sync_state`/`pmis_state`/`reprocess_state`；data-history handler 范式(:974-1030)。
- `data_history.py`：`_copy_item`(copy-then-swap，:42-59)、`KEEP=3`、`MANIFEST="manifest.json"`、`archive_version`/`list_versions`/`rollback`/`undo_rollback`、manifest 字段 `{id,createdAt,trigger,...}`。
- schema：`MilestoneItem{name,planDate,actualDate,payStage,payRatio,pct,priority}`(:219-226)、`PaymentNodePmis{stage,planDate,actualDate,payRatio,expectedPayment,reached,status}`(:157-164)、`projectMilestones`/`paymentNodes` = `Dict[pid, list]`。
- pytest 范式：`tests/test_data_history.py`(tmp_path 快照/回滚/无残渣)、`tests/test_server_tags.py`(monkeypatch 路径)。

前端（`frontend/src` 行号）：
- 导出：`lib/exportXlsx.ts`(exportRows，:4-10)；SheetJS `json_to_sheet/book_new/book_append_sheet/writeFile`。
- 导入解析：`lib/excelImport.ts`(validateExt/toStringMatrix，:1-18)、`composables/useExcelImport.ts`(`XLSX.read(buf,{type:'array'})` → SheetNames + `sheet_to_json(ws,{header:1,defval:''})`，:30-36)。
- 数据源：`stores/data.ts`(data.data.projects/projectPmis/projectMilestones/paymentNodes)、`stores/projectTags.ts`(assignments，:5-12)、`lib/followupApi.ts`(:48-55，加 all)、`lib/projectList.ts`(buildProjectRows/filterProjectRows/ProjectRow，:55-88)、`views/ProjectsView.vue`(filtered computed :44、toolbar :93-127、FollowupModal 范式 :82-87)。
- DataView 卡范式：`views/DataView.vue`(dv-card/dv-row/dv-btn，数据历史卡 :173-223、useExcelImport 卡 :38-41)、`composables/useDataHistory.ts`(load/rollback/undo，:15-60)。
- `types/analysis.ts`：`MilestoneItem`/`PaymentNodePmis`。`api/client.ts`：`api.get/post`、`ApiRequestError`。

---

## File Structure

新增（后端）：
- `manual_import.py` — 纯函数 `validate_and_build(sheets, valid_ids, today, now)`（强校验 + 构建 tags/followup）。
- `manual_history.py` — 轻量快照：`backup_manual`/`list_backups`/`rollback_manual`（镜像 data_history copy-then-swap，只两文件）。
- `tests/test_manual_import.py`、`tests/test_manual_history.py`、`tests/test_server_manual.py`。

新增（前端）：
- `frontend/src/lib/projectExport.ts` — `buildExportSheets(scope, ctx)` 构建多 sheet 行。
- `frontend/src/lib/manualImport.ts` — 解析上传 xlsx 为 `{项目标签?, 跟进记录?}` 矩阵。
- `frontend/src/lib/manualApi.ts` — importManual/listBackups/rollbackManual。
- 各 `.test.ts`。

修改：
- `server.py` — 4 handler + 4 路由（manual/import、manual/backups、manual/rollback、followup/all）。
- `frontend/src/lib/exportXlsx.ts` — 加 `exportSheets`。
- `frontend/src/lib/followupApi.ts` — 加 `all`。
- `frontend/src/views/ProjectsView.vue` — 导出按钮 + 范围弹窗。
- `frontend/src/views/DataView.vue` — 人工数据导入/回滚卡。
- `frontend/src/version.ts` / `PROGRESS.md`。

**不做（YAGNI）**：导入任何 PMIS 内容；预算科目树导出；自动/定时导入；云交互；合并(upsert)导入；标签停用态/孤立词表往返。

---

## Task 1: 后端 `manual_import.py`（强校验 + 构建两 store，纯函数）

**难度：核心算法 → opus。**

**Files:**
- Create: `manual_import.py`
- Test: `tests/test_manual_import.py`

- [ ] **Step 1: 写失败测试 `tests/test_manual_import.py`**

```python
import manual_import as mi

TYPES = ['电话沟通', '邮件推动', '现场拜访', '内部协调', '合同确认', '里程碑跟进', '回款确认', '其他']
STATUSES = ['跟进中', '已解决', '暂停跟进', '需升级处理', '已取消']
VALID = {'P1', 'P2'}

TAG_HDR = ['项目编号', '项目名称', '标签']
FU_HDR = ['记录编号', '项目编号', '项目名称', '跟进人', '跟进类型', '跟进内容', '跟进状态', '下次跟进计划日期', '跟进时间']


def test_valid_tags_replace_build():
    sheets = {'项目标签': [TAG_HDR, ['P1', '甲', 'BH项目、框架合同'], ['P2', '乙', '']]}
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert errors == []
    store = result['tags']
    assert store['assignments']['P1'] == ['BH项目', '框架合同']
    assert 'P2' not in store['assignments'] or store['assignments']['P2'] == []
    assert {t['name'] for t in store['tags']} == {'BH项目', '框架合同'}
    assert result['followup'] is None  # 未含跟进 sheet


def test_valid_followup_autogen_id_and_time():
    sheets = {'跟进记录': [FU_HDR,
        ['', 'P1', '甲', '张三', '邮件推动', '催款', '跟进中', '', ''],
        ['FU-20260616-0005', 'P2', '乙', '李四', '电话沟通', '已联系', '已解决', '2026-07-01', '2026-06-16 09:00:00']]}
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert errors == []
    recs = result['followup']
    assert recs[0]['记录编号'].startswith('FU-20260616-')  # 空→自动生成
    assert recs[0]['跟进时间'] == '2026-06-16 10:00:00'      # 空→填 now
    assert recs[1]['记录编号'] == 'FU-20260616-0005'         # 已有保留
    assert recs[0]['记录编号'] != recs[1]['记录编号']        # 自动生成避开已有


def test_errors_unknown_project_enum_length():
    sheets = {
        '项目标签': [TAG_HDR, ['P9', '?', 'X']],  # 未知项目
        '跟进记录': [FU_HDR,
            ['', 'P1', '甲', '张', '不存在类型', '内容', '跟进中', '', ''],   # 类型越界
            ['', 'P1', '甲', '张', '邮件推动', '', '在建', '', ''],          # 内容空 + 状态越界
        ],
    }
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert result is None  # 有错→不构建
    msgs = ' '.join(e['message'] for e in errors)
    assert '未知项目编号' in msgs and 'P9' in msgs
    assert '跟进类型' in msgs and '跟进状态' in msgs and '跟进内容' in msgs
    # 每条错误带 sheet/row
    assert all('sheet' in e and 'row' in e for e in errors)


def test_bad_header_reports():
    sheets = {'项目标签': [['编号', '名'], ['P1', '甲']]}  # 表头不符
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert result is None
    assert any('表头' in e['message'] for e in errors)
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_manual_import.py -q`
Expected: FAIL（`No module named 'manual_import'`）

- [ ] **Step 3: 实现 `manual_import.py`**

```python
"""2E 人工数据导入：强校验 + 构建标签/跟进两 store（纯函数，无 I/O，便于单测）。"""

TAG_HEADERS = ['项目编号', '项目名称', '标签']
FOLLOWUP_HEADERS = ['记录编号', '项目编号', '项目名称', '跟进人', '跟进类型', '跟进内容',
                    '跟进状态', '下次跟进计划日期', '跟进时间']
TAG_SPLIT = '、'


def _err(sheet, row, message, col=None):
    e = {'sheet': sheet, 'row': row, 'message': message}
    if col is not None:
        e['col'] = col
    return e


def _headers_ok(matrix, expected):
    if not matrix:
        return False
    head = [str(c).strip() for c in matrix[0][:len(expected)]]
    return head == expected


def _build_tags(matrix, valid_ids, errors):
    """项目标签 sheet → {version,tags,assignments}。表头已校验。"""
    assignments = {}
    seen = []  # 保序去重的标签名
    for i, raw in enumerate(matrix[1:], start=2):  # row 从 2 起（表头为 1）
        pid = str(raw[0]).strip() if len(raw) > 0 else ''
        if not pid:
            continue  # 整行空跳过
        if pid not in valid_ids:
            errors.append(_err('项目标签', i, f'未知项目编号 {pid}', '项目编号'))
            continue
        tag_cell = str(raw[2]).strip() if len(raw) > 2 else ''
        tags = [t.strip() for t in tag_cell.split(TAG_SPLIT) if t.strip()] if tag_cell else []
        if tags:
            assignments[pid] = tags
            for t in tags:
                if t not in seen:
                    seen.append(t)
    return {'version': 1, 'tags': [{'name': t} for t in seen], 'assignments': assignments}


def _build_followup(matrix, valid_ids, today_str, now_str, types, statuses, errors):
    """跟进记录 sheet → records list。表头已校验。"""
    provided = set()
    for raw in matrix[1:]:
        rid = str(raw[0]).strip() if len(raw) > 0 else ''
        if rid:
            provided.add(rid)
    seq = [1]

    def next_id():
        while True:
            rid = f'FU-{today_str}-{seq[0]:04d}'
            seq[0] += 1
            if rid not in provided:
                return rid

    records = []
    for i, raw in enumerate(matrix[1:], start=2):
        g = lambda j: (str(raw[j]).strip() if len(raw) > j else '')
        pid, name, person, ftype, content, status = g(1), g(2), g(3), g(4), g(5), g(6)
        if not any([g(0), pid, person, ftype, content, status]):
            continue  # 整行空跳过
        if pid not in valid_ids:
            errors.append(_err('跟进记录', i, f'未知项目编号 {pid}', '项目编号'))
            continue
        if not person:
            errors.append(_err('跟进记录', i, '跟进人必填', '跟进人'))
        elif len(person) > 20:
            errors.append(_err('跟进记录', i, '跟进人超过 20 字', '跟进人'))
        if ftype not in types:
            errors.append(_err('跟进记录', i, f'跟进类型非法: {ftype}', '跟进类型'))
        if not content:
            errors.append(_err('跟进记录', i, '跟进内容必填', '跟进内容'))
        elif len(content) > 500:
            errors.append(_err('跟进记录', i, '跟进内容超过 500 字', '跟进内容'))
        if status not in statuses:
            errors.append(_err('跟进记录', i, f'跟进状态非法: {status}', '跟进状态'))
        records.append({
            '记录编号': g(0) or '', '项目编号': pid, '项目名称': name, '跟进人': person,
            '跟进类型': ftype, '跟进内容': content, '跟进状态': status,
            '下次跟进计划日期': g(7), '跟进时间': g(8),
        })
    # 自动补编号/时间（仅在无错时此结果才被采用；有错也无妨，调用方丢弃）
    for r in records:
        if not r['记录编号']:
            r['记录编号'] = next_id()
        if not r['跟进时间']:
            r['跟进时间'] = now_str
    return records


def validate_and_build(sheets, valid_ids, today_str, now_str, types, statuses):
    """sheets: {'项目标签'?: [[...]], '跟进记录'?: [[...]]}（含表头行）。
    返回 (errors, result)：errors=[{sheet,row,message,col?}]；result={'tags':store|None,'followup':list|None}。
    errors 非空 → result=None（整体不写）。"""
    errors = []
    valid_ids = set(valid_ids)
    tag_m = sheets.get('项目标签')
    fu_m = sheets.get('跟进记录')
    if tag_m is not None and not _headers_ok(tag_m, TAG_HEADERS):
        errors.append(_err('项目标签', 1, f'sheet 表头不符，应为 {TAG_HEADERS}'))
    if fu_m is not None and not _headers_ok(fu_m, FOLLOWUP_HEADERS):
        errors.append(_err('跟进记录', 1, f'sheet 表头不符，应为 {FOLLOWUP_HEADERS}'))
    if errors:
        return errors, None
    tags_store = _build_tags(tag_m, valid_ids, errors) if tag_m is not None else None
    fu_records = _build_followup(fu_m, valid_ids, today_str, now_str, types, statuses, errors) if fu_m is not None else None
    if errors:
        return errors, None
    return [], {'tags': tags_store, 'followup': fu_records}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_manual_import.py -q`
Expected: PASS（4 项）

- [ ] **Step 5: py_compile + ruff**

Run: `python -m py_compile manual_import.py && python -m ruff check manual_import.py`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add manual_import.py tests/test_manual_import.py
git commit -m "feat(2e): manual_import 强校验+构建标签/跟进两 store(纯函数,替换语义)"
```

---

## Task 2: 后端 `manual_history.py`（轻量快照 + 回滚）

**难度：易踩坑（copy-then-swap）→ opus。** 镜像 `data_history.py` 但只备份两小 JSON。

**Files:**
- Create: `manual_history.py`
- Test: `tests/test_manual_history.py`

- [ ] **Step 1: 写失败测试 `tests/test_manual_history.py`**

```python
import json
import os
import manual_history as mh


def _seed(base):
    os.makedirs(os.path.join(base, 'data'), exist_ok=True)
    with open(os.path.join(base, 'data', 'project_tags.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'tags': [], 'assignments': {'P1': ['BH项目']}}, f, ensure_ascii=False)
    with open(os.path.join(base, 'data', 'followup_records.json'), 'w', encoding='utf-8') as f:
        json.dump([{'记录编号': 'FU-1'}], f, ensure_ascii=False)


def test_backup_creates_version_with_manifest(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mf = mh.backup_manual(base, trigger='import', source_name='x.xlsx')
    vdir = os.path.join(base, 'data', 'manual_backups', mf['id'])
    assert os.path.isfile(os.path.join(vdir, 'project_tags.json'))
    assert os.path.isfile(os.path.join(vdir, 'followup_records.json'))
    assert mf['trigger'] == 'import' and mf['sourceName'] == 'x.xlsx'


def test_prune_keeps_three(tmp_path):
    base = str(tmp_path)
    _seed(base)
    ids = []
    for i in range(5):
        ids.append(mh.backup_manual(base, trigger='import', source_name=f'{i}', version_id=f'20260616-00000{i}')['id'])
    listed = [v['id'] for v in mh.list_backups(base)['versions']]
    assert len(listed) == 3
    assert ids[0] not in listed and ids[4] in listed


def test_rollback_restores(tmp_path):
    base = str(tmp_path)
    _seed(base)
    vid = mh.backup_manual(base, trigger='import', source_name='x')['id']
    # 改 live
    with open(os.path.join(base, 'data', 'project_tags.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'tags': [], 'assignments': {'P9': ['改了']}}, f, ensure_ascii=False)
    mh.rollback_manual(base, vid)
    with open(os.path.join(base, 'data', 'project_tags.json'), encoding='utf-8') as f:
        assert json.load(f)['assignments'] == {'P1': ['BH项目']}
    # 无 .tmp 残渣
    vdir = os.path.join(base, 'data', 'manual_backups', vid)
    assert not any(n.endswith('.tmp') for n in os.listdir(os.path.join(base, 'data')))
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_manual_history.py -q`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `manual_history.py`**

```python
"""2E 人工数据轻量快照：只备份 project_tags.json + followup_records.json 两小文件，
copy-then-swap 近原子（镜像 data_history.py 的稳妥写法，去掉目录/整份逻辑）。"""
import json
import os
import shutil
from datetime import datetime

BACKUP_DIRNAME = 'manual_backups'
MANIFEST = 'manifest.json'
KEEP = 3
ITEMS = ['data/project_tags.json', 'data/followup_records.json']


def _root(base_dir):
    return os.path.join(base_dir, 'data', BACKUP_DIRNAME)


def _copy_file(src, dst):
    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    tmp = dst + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    shutil.copy2(src, tmp)
    os.replace(tmp, dst)  # 同盘原子覆盖


def _version_ids(base_dir):
    root = _root(base_dir)
    if not os.path.isdir(root):
        return []
    return sorted([d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))])


def _read_manifest(vdir):
    p = os.path.join(vdir, MANIFEST)
    if os.path.isfile(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None
    return None


def backup_manual(base_dir, trigger='import', source_name='', version_id=None):
    """把当前两文件存为新版本，写 manifest，剪枝保 KEEP。返回 manifest。"""
    vid = version_id or datetime.now().strftime('%Y%m%d-%H%M%S')
    vdir = os.path.join(_root(base_dir), vid)
    os.makedirs(vdir, exist_ok=True)
    counts = {}
    for rel in ITEMS:
        src = os.path.join(base_dir, rel)
        if os.path.exists(src):
            _copy_file(src, os.path.join(vdir, os.path.basename(rel)))
    # 统计条数
    tags_p = os.path.join(vdir, 'project_tags.json')
    fu_p = os.path.join(vdir, 'followup_records.json')
    try:
        counts['tagProjects'] = len(json.load(open(tags_p, encoding='utf-8')).get('assignments', {})) if os.path.exists(tags_p) else 0
    except Exception:
        counts['tagProjects'] = 0
    try:
        counts['followupCount'] = len(json.load(open(fu_p, encoding='utf-8'))) if os.path.exists(fu_p) else 0
    except Exception:
        counts['followupCount'] = 0
    mf = {'id': vid, 'createdAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
          'trigger': trigger, 'sourceName': source_name, **counts}
    with open(os.path.join(vdir, MANIFEST), 'w', encoding='utf-8') as f:
        json.dump(mf, f, ensure_ascii=False, indent=2)
    prune(base_dir)
    return mf


def prune(base_dir, keep=KEEP):
    ids = _version_ids(base_dir)
    removed = []
    for vid in ids[:-keep] if len(ids) > keep else []:
        shutil.rmtree(os.path.join(_root(base_dir), vid), ignore_errors=True)
        removed.append(vid)
    return removed


def list_backups(base_dir):
    return {'versions': [(_read_manifest(os.path.join(_root(base_dir), vid)) or {'id': vid})
                         for vid in reversed(_version_ids(base_dir))]}


def rollback_manual(base_dir, version_id):
    """把某版本两文件覆盖回 live（copy-then-swap）。版本不存在抛 FileNotFoundError。"""
    vdir = os.path.join(_root(base_dir), version_id)
    if not os.path.isdir(vdir):
        raise FileNotFoundError(f'快照版本不存在: {version_id}')
    restored = []
    for rel in ITEMS:
        src = os.path.join(vdir, os.path.basename(rel))
        if os.path.exists(src):
            _copy_file(src, os.path.join(base_dir, rel))
            restored.append(os.path.basename(rel))
    return {'id': version_id, 'restored': restored}
```

- [ ] **Step 4: 测试 + py_compile + ruff**

Run: `python -m pytest tests/test_manual_history.py -q && python -m py_compile manual_history.py && python -m ruff check manual_history.py`
Expected: PASS（3 项）+ 通过

- [ ] **Step 5: Commit**

```bash
git add manual_history.py tests/test_manual_history.py
git commit -m "feat(2e): manual_history 轻量快照(两小 JSON,copy-then-swap,留 3 份)+回滚"
```

---

## Task 3: server.py 4 个 handler + 路由

**难度：易踩坑（互斥/写序）→ opus。**

**Files:**
- Modify: `server.py`
- Test: `tests/test_server_manual.py`

- [ ] **Step 1: 写失败测试 `tests/test_server_manual.py`**

```python
import json
import os
import server


def _seed_analysis(base, monkeypatch):
    af = os.path.join(base, 'analysis_data.json')
    with open(af, 'w', encoding='utf-8') as f:
        json.dump({'projects': [{'projectId': 'P1'}, {'projectId': 'P2'}]}, f, ensure_ascii=False)
    monkeypatch.setattr(server, 'ANALYSIS_FILE', af)


def test_valid_project_ids(tmp_path, monkeypatch):
    _seed_analysis(str(tmp_path), monkeypatch)
    assert server._valid_project_ids() == {'P1', 'P2'}


def test_manual_apply_writes_and_backups(tmp_path, monkeypatch):
    base = str(tmp_path)
    tags_f = os.path.join(base, 'project_tags.json')
    fu_f = os.path.join(base, 'followup_records.json')
    monkeypatch.setattr(server, 'PROJECT_TAGS_FILE', tags_f)
    monkeypatch.setattr(server, 'FOLLOWUP_FILE', fu_f)
    # 预置原文件(供快照)
    json.dump({'version': 1, 'tags': [], 'assignments': {}}, open(tags_f, 'w', encoding='utf-8'))
    json.dump([], open(fu_f, 'w', encoding='utf-8'))
    monkeypatch.setattr(server, 'BASE_DIR', base)
    result = {'tags': {'version': 1, 'tags': [{'name': 'BH项目'}], 'assignments': {'P1': ['BH项目']}},
              'followup': [{'记录编号': 'FU-1', '项目编号': 'P1'}]}
    summary = server._apply_manual_import(result, source_name='x.xlsx')
    assert json.load(open(tags_f, encoding='utf-8'))['assignments'] == {'P1': ['BH项目']}
    assert json.load(open(fu_f, encoding='utf-8'))[0]['记录编号'] == 'FU-1'
    assert summary['backupId']
```

- [ ] **Step 2: 确认失败**

Run: `python -m pytest tests/test_server_manual.py -q`
Expected: FAIL（`_valid_project_ids`/`_apply_manual_import` 未定义）

- [ ] **Step 3: 加 server.py 辅助 + handler**

在 followup/tags 区附近加：
```python
import manual_import
import manual_history


def _valid_project_ids():
    try:
        with open(ANALYSIS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {str(p.get('projectId')) for p in (data.get('projects') or []) if p.get('projectId')}
    except Exception:
        return set()


def _apply_manual_import(result, source_name):
    """写入前先快照，再按 result 替换写（仅含的类才写）。返回摘要。"""
    mf = manual_history.backup_manual(BASE_DIR, trigger='import', source_name=source_name)
    summary = {'backupId': mf['id']}
    if result.get('tags') is not None:
        _save_project_tags(result['tags'])
        summary['tags'] = {'projects': len(result['tags'].get('assignments', {})),
                           'tagsCount': len(result['tags'].get('tags', []))}
    if result.get('followup') is not None:
        _save_followup_records(result['followup'])
        summary['followup'] = {'count': len(result['followup'])}
    return summary
```

handler（加在 followup handler 附近）：
```python
    def handle_followup_all(self):
        """GET /api/followup/all - 全部跟进记录（供导出）。"""
        recs = _load_followup_records()
        for r in recs:
            r.pop('syncStatus', None)
        self._json_response({"success": True, "records": recs, "total": len(recs)})

    def handle_manual_import(self):
        """POST /api/manual/import {sheets} - 校验→快照→替换写。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中，请稍后再导入"))
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求解析失败: {e}"))
            return
        sheets = body.get('sheets') or {}
        if not isinstance(sheets, dict) or not any(k in sheets for k in ('项目标签', '跟进记录')):
            self._json_response(_error_payload(ERR_VALIDATION, "未发现可导入的「项目标签」或「跟进记录」sheet"))
            return
        from datetime import datetime as _dt
        errors, result = manual_import.validate_and_build(
            sheets, _valid_project_ids(),
            _dt.now().strftime('%Y%m%d'), _dt.now().strftime('%Y-%m-%d %H:%M:%S'),
            FOLLOWUP_TYPES, FOLLOWUP_STATUSES)
        if errors:
            self._json_response({"success": False, "code": ERR_VALIDATION,
                                 "message": f"校验未通过，共 {len(errors)} 处错误", "errors": errors})
            return
        try:
            summary = _apply_manual_import(result, body.get('fileName', ''))
        except Exception as e:
            logger.error(f"人工数据导入写入失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"导入写入失败: {e}"))
            return
        self._json_response({"success": True, "message": "导入成功", **summary})

    def handle_manual_backups(self):
        """GET /api/manual/backups"""
        try:
            self._json_response({"success": True, **manual_history.list_backups(BASE_DIR)})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"列快照失败: {e}"))

    def handle_manual_rollback(self):
        """POST /api/manual/rollback {id}"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中，请稍后再回滚"))
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求解析失败: {e}"))
            return
        vid = str(data.get('id') or '').strip()
        if not vid:
            self._json_response(_error_payload(ERR_VALIDATION, "缺少版本 id"))
            return
        try:
            res = manual_history.rollback_manual(BASE_DIR, vid)
        except FileNotFoundError as e:
            self._json_response(_error_payload(ERR_NOT_FOUND, str(e)))
            return
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"回滚失败: {e}"))
            return
        self._json_response({"success": True, "message": f"已回滚到 {vid}", **res})
```

- [ ] **Step 4: 加路由**

`do_GET`（followup 路由附近）：
```python
        elif parsed.path == '/api/followup/all':
            self.handle_followup_all()
        elif parsed.path == '/api/manual/backups':
            self.handle_manual_backups()
```
`do_POST`：
```python
        elif parsed.path == '/api/manual/import':
            self.handle_manual_import()
        elif parsed.path == '/api/manual/rollback':
            self.handle_manual_rollback()
```
> `from datetime import datetime` 顶部若已 import 则去掉 handler 内的局部 import；`import json/os` 已在。

- [ ] **Step 5: 验证**

Run: `python -m pytest tests/test_server_manual.py -q && python -m py_compile server.py && python -m ruff check server.py && python -m pytest -q`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add server.py tests/test_server_manual.py
git commit -m "feat(2e): server /api/manual/import|backups|rollback + /api/followup/all(校验→快照→替换写)"
```

---

## Task 4: 前端导出（exportSheets + projectExport + /projects 导出按钮）

**难度：常规组件 → sonnet。**

**Files:**
- Modify: `frontend/src/lib/exportXlsx.ts`
- Create: `frontend/src/lib/projectExport.ts` + `.test.ts`
- Modify: `frontend/src/lib/followupApi.ts`
- Modify: `frontend/src/views/ProjectsView.vue` + `.test.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/lib/projectExport.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildExportSheets } from './projectExport'

const ctx = {
  projects: [{ projectId: 'P1', projectName: '甲' }, { projectId: 'P2', projectName: '乙' }] as any,
  rows: [{ projectId: 'P1', projectName: '甲', tags: ['BH项目', '框架合同'] }] as any, // filtered ProjectRow（仅 P1）
  assignments: { P1: ['BH项目', '框架合同'] },
  followup: [{ 记录编号: 'FU-1', 项目编号: 'P1', 跟进人: '张' }, { 记录编号: 'FU-2', 项目编号: 'P2' }] as any,
  paymentNodes: { P1: [{ stage: '到货', planDate: '2026-01-01', status: '已达成', expectedPayment: 100 }] } as any,
  milestones: { P1: [{ name: '终验', planDate: '2026-03-01', priority: 'high' }] } as any,
}

describe('buildExportSheets', () => {
  it('按范围产 sheet，跟进/节点/里程碑按筛选项目集过滤', () => {
    const sheets = buildExportSheets(['list', 'tags', 'followup', 'nodes', 'milestones'], ctx as any)
    const names = sheets.map((s) => s.name)
    expect(names).toEqual(['项目清单', '项目标签', '跟进记录', '回款节点', '里程碑'])
    // 标签 sheet 顿号连接
    const tagSheet = sheets.find((s) => s.name === '项目标签')!
    expect(tagSheet.rows[0]['标签']).toBe('BH项目、框架合同')
    // 跟进只含筛选项目 P1（P2 不在 rows）
    const fu = sheets.find((s) => s.name === '跟进记录')!
    expect(fu.rows.every((r: any) => r['项目编号'] === 'P1')).toBe(true)
  })
  it('只选清单→单 sheet', () => {
    const sheets = buildExportSheets(['list'], ctx as any)
    expect(sheets.map((s) => s.name)).toEqual(['项目清单'])
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/lib/projectExport.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 加 `lib/exportXlsx.ts exportSheets`**

```ts
/** 多 sheet 导出。sheets 空或全空不动作。 */
export function exportSheets(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]): void {
  const valid = sheets.filter((s) => s.rows && s.rows.length)
  if (!valid.length) return
  const wb = XLSX.utils.book_new()
  for (const s of valid) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}
```

- [ ] **Step 4: 实现 `lib/projectExport.ts`**

```ts
import type { Project, PaymentNodePmis, MilestoneItem } from '@/types/analysis'

export type ExportScope = 'list' | 'tags' | 'followup' | 'nodes' | 'milestones'

export interface ExportCtx {
  rows: Record<string, any>[]            // /projects 当前筛选后的 ProjectRow[]（决定项目集）
  projects: Project[]
  assignments: Record<string, string[]>
  followup: Record<string, any>[]        // 全量跟进记录
  paymentNodes: Record<string, PaymentNodePmis[]>
  milestones: Record<string, MilestoneItem[]>
}

const LIST_COLS: [string, string][] = [
  ['projectId', '项目编号'], ['projectName', '项目名称'], ['projectManager', '经理'],
  ['orgL4', '服务组'], ['stage', '阶段'], ['contractAmount', '合同金额(万)'],
  ['paymentRatio', '回款完成率'], ['health', '健康度'],
]

export function buildExportSheets(scope: ExportScope[], ctx: ExportCtx): { name: string; rows: Record<string, unknown>[] }[] {
  const pids = new Set(ctx.rows.map((r) => r.projectId as string))
  const out: { name: string; rows: Record<string, unknown>[] }[] = []
  if (scope.includes('list')) {
    out.push({ name: '项目清单', rows: ctx.rows.map((r) => {
      const o: Record<string, unknown> = {}
      for (const [k, label] of LIST_COLS) o[label] = r[k] ?? ''
      o['标签'] = (r.tags ?? []).join('、')
      return o
    }) })
  }
  if (scope.includes('tags')) {
    out.push({ name: '项目标签', rows: ctx.rows.map((r) => ({
      项目编号: r.projectId, 项目名称: r.projectName ?? '', 标签: (ctx.assignments[r.projectId] ?? []).join('、'),
    })) })
  }
  if (scope.includes('followup')) {
    out.push({ name: '跟进记录', rows: ctx.followup.filter((r) => pids.has(r['项目编号'])).map((r) => ({
      记录编号: r['记录编号'] ?? '', 项目编号: r['项目编号'], 项目名称: r['项目名称'] ?? '',
      跟进人: r['跟进人'] ?? '', 跟进类型: r['跟进类型'] ?? '', 跟进内容: r['跟进内容'] ?? '',
      跟进状态: r['跟进状态'] ?? '', 下次跟进计划日期: r['下次跟进计划日期'] ?? '', 跟进时间: r['跟进时间'] ?? '',
    })) })
  }
  if (scope.includes('nodes')) {
    const rows: Record<string, unknown>[] = []
    for (const r of ctx.rows) {
      for (const n of ctx.paymentNodes[r.projectId] ?? []) {
        rows.push({ 项目编号: r.projectId, 项目名称: r.projectName ?? '', 阶段: n.stage,
          计划日: n.planDate ?? '', 实际日: n.actualDate ?? '', 计划比例: n.payRatio ?? '',
          计划金额: n.expectedPayment ?? '', 状态: n.status ?? '' })
      }
    }
    out.push({ name: '回款节点', rows })
  }
  if (scope.includes('milestones')) {
    const rows: Record<string, unknown>[] = []
    for (const r of ctx.rows) {
      for (const m of ctx.milestones[r.projectId] ?? []) {
        rows.push({ 项目编号: r.projectId, 项目名称: r.projectName ?? '', 里程碑: m.name,
          计划: m.planDate ?? '', 实际: m.actualDate ?? '', 关联回款阶段: m.payStage ?? '', 优先级: m.priority ?? '' })
      }
    }
    out.push({ name: '里程碑', rows })
  }
  return out
}
```
> `LIST_COLS` 取 ProjectRow 已有字段；若某字段名与 `lib/projectList.ts ProjectRow` 实际不符，按实际改（实现前读 projectList.ts 确认 ProjectRow 字段）。

- [ ] **Step 5: `lib/followupApi.ts` 加 all**

```ts
  all: () => api.get<{ records: FollowupRecord[]; total: number }>('/api/followup/all'),
```

- [ ] **Step 6: 改 `views/ProjectsView.vue` 加导出按钮 + 范围弹窗**

`<script setup>` 增：
```ts
import { exportSheets } from '@/lib/exportXlsx'
import { buildExportSheets, type ExportScope } from '@/lib/projectExport'
import { followupApi } from '@/lib/followupApi'
const exOpen = ref(false)
const exScope = ref<ExportScope[]>(['list', 'tags', 'followup'])
async function doExport() {
  const fu = exScope.value.includes('followup') ? (await followupApi.all()).records : []
  const sheets = buildExportSheets(exScope.value, {
    rows: filtered.value, projects: (data.data?.projects ?? []) as any,
    assignments: projectTags.assignments, followup: fu as any,
    paymentNodes: (data.data?.paymentNodes ?? {}) as any, milestones: (data.data?.projectMilestones ?? {}) as any,
  })
  exportSheets(`项目数据导出_${filtered.value.length}项.xlsx`, sheets)
  exOpen.value = false
}
const EX_OPTS: { value: ExportScope; label: string }[] = [
  { value: 'list', label: '项目清单' }, { value: 'tags', label: '项目标签' }, { value: 'followup', label: '跟进记录' },
  { value: 'nodes', label: '回款节点' }, { value: 'milestones', label: '里程碑' },
]
```
toolbar 区加按钮：`<button class="pv-fu-btn" @click="exOpen = true">导出</button>`
末尾加 Modal（复用 `Modal.vue`）：
```vue
    <Modal v-model="exOpen" title="导出范围" width="420px">
      <el-checkbox-group v-model="exScope">
        <el-checkbox v-for="o in EX_OPTS" :key="o.value" :value="o.value" :label="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)"><button class="pv-fu-btn" :disabled="!exScope.length" @click="doExport">导出 xlsx（当前筛选 {{ filtered.length }} 项）</button></div>
    </Modal>
```
（import `Modal`；el-checkbox 的 value/label 用法以 EP 版本为准。）

- [ ] **Step 7: 对齐测试 + typecheck**

`ProjectsView.test.ts` 加：导出按钮存在、点击开 Modal（stub followupApi.all）。
Run: `cd frontend && npx vitest run src/lib/projectExport.test.ts src/views/ProjectsView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/exportXlsx.ts frontend/src/lib/projectExport.ts frontend/src/lib/projectExport.test.ts frontend/src/lib/followupApi.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(2e): /projects 多 sheet 导出(范围可选,遵循筛选)+exportSheets+projectExport+followupApi.all"
```

---

## Task 5: 前端导入/回滚（manualImport + manualApi + /data 卡）

**难度：常规偏接线 → sonnet。**

**Files:**
- Create: `frontend/src/lib/manualImport.ts` + `.test.ts`
- Create: `frontend/src/lib/manualApi.ts`
- Modify: `frontend/src/views/DataView.vue` + `.test.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/lib/manualImport.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseManualSheets } from './manualImport'

describe('parseManualSheets', () => {
  it('从 workbook 抽取 项目标签/跟进记录 两 sheet 矩阵，忽略其它', () => {
    const wb = {
      SheetNames: ['项目标签', '跟进记录', '回款节点'],
      sheetRows: (n: string) => ({
        项目标签: [['项目编号', '项目名称', '标签'], ['P1', '甲', 'BH项目']],
        跟进记录: [['记录编号'], ['FU-1']],
        回款节点: [['x'], ['y']],
      }[n]),
    }
    const sheets = parseManualSheets(wb as any)
    expect(Object.keys(sheets).sort()).toEqual(['跟进记录', '项目标签'])
    expect(sheets['项目标签'][1]).toEqual(['P1', '甲', 'BH项目'])
    expect(sheets['回款节点' as any]).toBeUndefined()
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/lib/manualImport.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `lib/manualImport.ts`**

```ts
import * as XLSX from 'xlsx'
import { toStringMatrix } from './excelImport'

export interface ParsedWb { SheetNames: string[]; sheetRows: (name: string) => any[][] }
const MANUAL_SHEETS = ['项目标签', '跟进记录'] as const

/** 读 xlsx ArrayBuffer → workbook（复用 useExcelImport 同款 SheetJS 读法）。 */
export function readWorkbook(buf: ArrayBuffer): ParsedWb {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  return {
    SheetNames: wb.SheetNames,
    sheetRows: (name: string) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][],
  }
}

/** 只抽 项目标签/跟进记录 两 sheet 为字符串矩阵（含表头行），其它忽略。 */
export function parseManualSheets(wb: ParsedWb): Record<string, string[][]> {
  const out: Record<string, string[][]> = {}
  for (const name of MANUAL_SHEETS) {
    if (wb.SheetNames.includes(name)) out[name] = toStringMatrix(wb.sheetRows(name))
  }
  return out
}
```

- [ ] **Step 4: 实现 `lib/manualApi.ts`**

```ts
import { api } from '@/api/client'

export interface ManualError { sheet: string; row: number; col?: string; message: string }
export interface ImportResp { success: boolean; message?: string; errors?: ManualError[]; backupId?: string
  tags?: { projects: number; tagsCount: number }; followup?: { count: number } }
export interface ManualBackup { id: string; createdAt?: string; sourceName?: string; tagProjects?: number; followupCount?: number }

export const manualApi = {
  import: (sheets: Record<string, string[][]>, fileName: string) =>
    api.post<ImportResp>('/api/manual/import', { sheets, fileName }),
  backups: () => api.get<{ versions: ManualBackup[] }>('/api/manual/backups'),
  rollback: (id: string) => api.post<{ success: boolean; message?: string }>('/api/manual/rollback', { id }),
}
```
> `api.post` 在 `success:false` 时抛 `ApiRequestError`（不带 errors 明细）——导入校验失败需拿到 `errors` 数组，故 manualApi.import **不要走会抛错的封装**：改用 `fetch` 直接取 body（或 DataView 内 try/catch 后从 error 取）。**实现取舍**：`manualApi.import` 用裸 `fetch('/api/manual/import', {POST})` 返回 `await res.json()`（不抛），DataView 据 `success`/`errors` 渲染。下方 DataView 据此写。

- [ ] **Step 5: 改 `views/DataView.vue` 加「人工数据导入/回滚」卡**

`<script setup>` 增：
```ts
import { readWorkbook, parseManualSheets } from '@/lib/manualImport'
import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'
const manImportInput = ref<HTMLInputElement | null>(null)
const manErrors = ref<ManualError[]>([])
const manMsg = ref('')
const manBackups = ref<ManualBackup[]>([])
const manBusy = ref(false)
async function loadManBackups() { manBackups.value = (await manualApi.backups()).versions ?? [] }
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
    await loadManBackups(); await data.reload()
  } finally { manBusy.value = false; if (manImportInput.value) manImportInput.value.value = '' }
}
async function onManRollback(id: string) {
  manBusy.value = true
  try { await manualApi.rollback(id); manMsg.value = '已回滚'; await data.reload() } finally { manBusy.value = false }
}
onMounted(loadManBackups)
```
template 在「数据历史」卡附近加：
```vue
    <div class="dv-card">
      <div class="dv-card-head">人工数据导入 / 回滚</div>
      <div class="dv-row">
        <span class="dv-label">导入 xlsx</span>
        <input ref="manImportInput" type="file" accept=".xlsx,.xls" @change="onManImport" :disabled="manBusy" />
        <span class="dv-hint">仅「项目标签」「跟进记录」sheet 整表替换；导入前自动快照</span>
      </div>
      <div v-if="manMsg" class="dv-hint ok">{{ manMsg }}</div>
      <table v-if="manErrors.length" class="dv-err u-num">
        <thead><tr><th>Sheet</th><th>行</th><th>列</th><th>错误</th></tr></thead>
        <tbody><tr v-for="(e, i) in manErrors" :key="i"><td>{{ e.sheet }}</td><td>{{ e.row }}</td><td>{{ e.col || '-' }}</td><td>{{ e.message }}</td></tr></tbody>
      </table>
      <div v-for="b in manBackups" :key="b.id" class="dv-row">
        <span class="dv-label u-num">{{ b.createdAt || b.id }}（标签{{ b.tagProjects ?? 0 }}/跟进{{ b.followupCount ?? 0 }}）</span>
        <button class="dv-btn" :disabled="manBusy" @click="onManRollback(b.id)">回滚到此</button>
      </div>
    </div>
```
`<style>` 加：`.dv-err { width: 100%; border-collapse: collapse; font-size: var(--fs-1); margin: var(--sp-2) 0; } .dv-err th, .dv-err td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--danger-text); }`

> `manualApi.import` 改用裸 fetch 不抛错（见 Task5 Step4 注），以便拿 `errors`。

- [ ] **Step 6: 对齐测试 + typecheck**

`DataView.test.ts` 加：人工数据卡渲染（含"人工数据导入"/"回滚"文案）；mock manualApi.backups。
Run: `cd frontend && npx vitest run src/lib/manualImport.test.ts src/views/DataView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/manualImport.ts frontend/src/lib/manualImport.test.ts frontend/src/lib/manualApi.ts frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(2e): /data 人工数据导入(校验报错明细)+快照回滚卡;manualImport/manualApi"
```

---

## Task 6: 版本 V1.6.0 + 全量验证 + 真实数据冒烟 + PROGRESS

**难度：机械 + 核实 → 主循环。**

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`
- 可能 Modify: `.gitignore`（`data/manual_backups/` 忽略）

- [ ] **Step 1: 版本号** — `version.ts`：`APP_VERSION = 'V1.6.0'`。

- [ ] **Step 2: .gitignore** — 加 `data/manual_backups/`（本地快照，比照 `data/history/`）。先确认 `data/history` 是否已忽略，同级加。

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: 四步全绿。

- [ ] **Step 4: 真实数据冒烟（人工，spec §7）**

`python server.py` → `cd frontend && npm run dev`：
- `/projects`「导出」→ 勾选范围 → 下载 xlsx，确认含「项目清单/项目标签/跟进记录/回款节点/里程碑」对应 sheet、遵循当前筛选行集、标签顿号连接。
- 改 xlsx「项目标签」一行（或「跟进记录」）→ `/data` 导入 → 成功（先快照后替换）；`/projects` 标签/`/project:id` 跟进随之变。
- 故意构造一处错误（未知项目编号/跟进类型越界）→ 导入报错明细表，**不写文件**。
- 混入「回款节点」sheet 改值 → 被忽略不写（PMIS 只读护栏）。
- `/data` 人工数据快照列表 → 回滚 → 恢复。

- [ ] **Step 5: 更新 `PROGRESS.md`**

- 头部「当前版本」→ **V1.6.0**、「最近更新」补 2E 一句。
- 第 43 行 2E 项标完成 + SHA（合并后补）。
- backlog **L-22** 标 `[x]`（清单导出含标签列已实现）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/version.ts .gitignore PROGRESS.md
git commit -m "chore(2e): 版本 V1.6.0 + .gitignore(manual_backups) + PROGRESS(2E) + 关闭 L-22"
```

---

## 合并（finishing-a-development-branch）

全部任务完成且 `bash verify.sh` 全绿后，用 **superpowers:finishing-a-development-branch** 选项 1：`git checkout master && git merge --no-ff feat/phase-2e-manual-data-io`，补 PROGRESS 合并 SHA。

---

## Self-Review（写完计划后自查）

**1. Spec 覆盖**：§2 导出多 sheet 范围可选+遵循筛选(Task4 projectExport/exportSheets/ProjectsView)✓；§3 导入固定 sheet+强校验+报错明细+整表替换(Task1 validate_and_build + Task3 handler + Task5 卡)✓；§4 轻量快照+回滚(Task2 manual_history + Task3/5)✓；§5 4 个 API(Task3)✓；§6 前端模块(Task4/5)✓；§7 测试(各任务 pytest/vitest + Task6 冒烟)✓；§8 V1.6.0+关闭 L-22(Task6)✓；§9 frozen 路径(manual_history 走 BASE_DIR)、写前快照(Task3 _apply_manual_import 先 backup 后写)、顿号契约(projectExport 连/manual_import 拆一致)、导出取 filtered 全集(Task4 用 filtered.value)✓。

**2. 占位扫描**：无 TBD/TODO。`LIST_COLS` 字段名(Task4)、`ProjectRow` 字段、Modal/el-checkbox 用法标"以实际为准"——指向现有可读文件的校准。Task5 Step4 的 manualApi.import 裸 fetch 取舍已写明（不走抛错封装以拿 errors）。

**3. 类型一致**：`validate_and_build` 返回 `(errors, result{tags,followup})`(Task1) 与 `_apply_manual_import`(Task3) 消费一致；`ManualError{sheet,row,col?,message}`(Task5) 与后端 `_err`(Task1) 形状一致；`ExportScope` 五值(Task4) 与 EX_OPTS/buildExportSheets 一致；`manualApi`(Task5) 与 server 路由(Task3) 路径一致；顿号 `、` 在 projectExport(连) 与 manual_import.TAG_SPLIT(拆) 一致。

> 偏离记录：无对 spec 的功能偏离。`manualApi.import` 用裸 fetch（非 api.post 抛错封装）以保留校验 errors 明细——实现细节优化，spec 意图（报错明细）不变。
