# 审计「目标/详情」全量富化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给审计日志的「目标(target)/详情(detail)」两列补全 A（业务跟进）+B（商机）+C（数据运维）约 40 个高价值写操作的内容，当前仅账号管理有值。

**Architecture:** 分布式 per-handler 富化——`audit.py` 新增 5 个纯函数（field_label / diff_changes / summarize_scope / count_delta / join_detail）承载格式化与 diff；`server.py` 新增极薄助手 `_audit_set(target, detail)`；各写 handler 在解析 body / 事务闭包内（能拿到旧值处）调用它。`_audit_request` 的读取与降级逻辑一字不改，漏改的 handler 优雅退化为空、零回归。

**Tech Stack:** Python 3.8+ 标准库（`server.py` 本地 HTTP、`audit.py` JSONL 审计）、pytest；前端仅 `version.ts` 版本号 bump（Vue3/Vite）。

## Global Constraints

- 交流语言简体中文；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾ ⚠`）。
- **审计隐私红线**：绝不记密码/哈希/salt/token/**cookie 值或预览**/完整请求体。cookie 两动作只记「更新了 X Cookie」。
- **详情深度**：长文本业务正文（跟进内容 ≤500 字、进展/回顾文字、商机长字段）只标 `（已填写/已改）`不落正文；枚举/短字段记具体值；更新类记 `旧→新` 对比。
- **`audit.py` 不依赖 server**（server 单向依赖 audit）；新增纯函数无副作用、无 server import。
- **防御式富化 = 零回归**：取值一律 `.get`/短路，任何异常都让 target/detail 退化为空，**绝不因审计富化让主流程 500**。
- **异步动作（reprocess/download）只在成功抢到运行槽后 `_audit_set("触发…")`**；被拒分支（其他操作进行中）不 set。
- 版本 **V2.8.1**（Z 级），单一来源 `frontend/src/version.ts`；**升级须重启后端、不需点更新数据、前端零功能改动**。
- 每次 commit 结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 声称完成前 `bash verify.sh` 全绿（语法+ruff+pytest+前端 typecheck/vitest/build）。

## 参考事实（实现期已核实，无需再查）

- 审计读取端 `server.py:_audit_request`（约 2147-2169）已有：`'target': target if target is not None else getattr(self, '_audit_target', None)`，`detail` 同理；`_reset_audit_state`（约 2140）每请求复位三属性。**两者不改**。
- `send_response` override（约 607-608）落 `self._audit_status = code`，`_json_response`（HTTP 200）/`_send_json`/裸 `send_response` 均经它。业务校验错误走 `_json_response` 也是 HTTP 200 → 审计 `success` 反映 HTTP 状态（既有行为，不在本次范围内修）。
- `_acquire_run_slot(state, lock, payload)`（约 138）：忙→False 不动 state；空→置位并 True。
- 各业务数据文件全局（测试须 monkeypatch 到 tmp）：`server.FOLLOWUP_FILE`、`PROJECT_TAGS_FILE`、`PROGRESS_FILE`、`TEMP_FOLLOWUP_FILE`、`OPP_FOLLOWUP_FILE`、`RISK_FOLLOWUP_FILE`、`PAYKEY_FOLLOWUP_FILE`、`OPPORTUNITIES_FILE`、`PMISDATA_CONFIG`、`YITIAN_CONFIG`。
- 各 update handler 的 target 键与字段集不同：progress/temp = `projectId` + `{weekProgress,nextPlan}`；opp-followup = `oppId` + `{weekProgress,nextPlan}`；risk = `riskKey` + `{followAction,revConclusion,nextRevDate}`；paykey = `projectId` + `{followAction,revConclusion,nextRevDate}`。
- 商机字段中文名：`opportunities.HEADER_TO_FIELD`（中文→key），可反转得 key→中文；商机名称字段 key = `name`。
- 人工导入 summary：`{'backupId':..}`，含标签则 `summary['tags']={'projects':N,'tagsCount':M}`，含跟进则 `summary['followup']={'count':K}`。
- E2E 测试骨架在 `tests/test_server_audit.py`：`_wait_for`（有界轮询）、`_start`（patch accounts+audit、起 server）、`_login`（admin/wxtnb 取 cookie）。审计落盘在 do_GET/do_POST 的 finally，须用 `_wait_for` 等。

---

## File Structure

- `audit.py` — **新增** 5 个纯函数（target/detail 富化辅助）。不动既有 `_ACTION_MAP`/`record`/`read`。
- `server.py` — **新增** `_audit_set` 助手 + 模块级 `_OPP_FIELD_LABELS`；在约 40 个写 handler 内插入 `self._audit_set(...)`（多为 1-3 行）。
- `frontend/src/version.ts` — 版本号 → `V2.8.1`。
- `tests/test_audit.py` — **新增** 纯函数单测。
- `tests/test_server_audit.py` — **新增** 富化 + 隐私 e2e 测试（复用现有骨架）。

---

### Task 1: audit.py 富化纯函数 + server `_audit_set` 助手

**Files:**
- Modify: `audit.py`（文件末尾追加 5 个纯函数）
- Modify: `server.py`（`_audit_request` 之后新增 `_audit_set`；模块级新增 `_OPP_FIELD_LABELS`）
- Test: `tests/test_audit.py`（追加纯函数单测）

**Interfaces:**
- Produces（供 Task 2-5 消费）：
  - `audit.field_label(key: str) -> str`
  - `audit.diff_changes(old: dict, changed: dict, labels: dict=None, long_threshold: int=20) -> str`
  - `audit.summarize_scope(scope) -> str`
  - `audit.count_delta(old: int, new: int) -> str`
  - `audit.join_detail(parts: list) -> str`
  - `handler._audit_set(target=None, detail=None) -> None`
  - `server._OPP_FIELD_LABELS: dict`（商机字段 key→中文）

- [ ] **Step 1: 写失败测试（audit.py 纯函数）**

在 `tests/test_audit.py` 末尾追加（文件顶部已 `import audit`）：

```python
def test_field_label_known_and_unknown():
    assert audit.field_label('weekProgress') == '本周进展'
    assert audit.field_label('nextPlan') == '下步计划'
    assert audit.field_label('followAction') == '跟进动作'
    assert audit.field_label('revConclusion') == '回顾结论'
    assert audit.field_label('nextRevDate') == '下次回顾日期'
    assert audit.field_label('跟进类型') == '跟进类型'  # 未知键原样返回


def test_diff_changes_short_old_to_new():
    assert audit.diff_changes({'跟进状态': '跟进中'}, {'跟进状态': '已解决'}) == '跟进状态 跟进中→已解决'


def test_diff_changes_unchanged_omitted():
    assert audit.diff_changes({'a': '1'}, {'a': '1'}) == ''


def test_diff_changes_missing_old_shows_empty_marker():
    assert audit.diff_changes({}, {'跟进人': '张三'}) == '跟进人 (空)→张三'


def test_diff_changes_multiple_joined_by_semicolon():
    out = audit.diff_changes({'跟进类型': '电话沟通', '跟进状态': '跟进中'},
                             {'跟进类型': '邮件推动', '跟进状态': '已解决'})
    assert out == '跟进类型 电话沟通→邮件推动；跟进状态 跟进中→已解决'


def test_diff_changes_long_value_masked():
    out = audit.diff_changes({'remark': ''}, {'remark': 'x' * 30}, labels={'remark': '备注'})
    assert out == '备注（已改）'


def test_diff_changes_uses_labels():
    out = audit.diff_changes({'amountWan': '100'}, {'amountWan': '200'},
                             labels={'amountWan': '预估金额(万元)'})
    assert out == '预估金额(万元) 100→200'


def test_summarize_scope_groups_and_combinator_upper():
    assert audit.summarize_scope({'combinator': 'and', 'groups': [1, 2, 3]}) == 'AND · 3 组条件'


def test_summarize_scope_empty_or_bad():
    assert audit.summarize_scope({'groups': []}) == '清空范围'
    assert audit.summarize_scope(None) == '清空范围'
    assert audit.summarize_scope({'combinator': 'OR', 'groups': [{'x': 1}]}) == 'OR · 1 组条件'


def test_count_delta():
    assert audit.count_delta(5, 5) == '5'
    assert audit.count_delta(12, 13) == '12→13'


def test_join_detail_filters_empty():
    assert audit.join_detail(['a', '', 'b', None]) == 'a · b'
    assert audit.join_detail([]) == ''
    assert audit.join_detail(['只此一段']) == '只此一段'
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_audit.py -q -k "field_label or diff_changes or summarize_scope or count_delta or join_detail"`
Expected: FAIL（`AttributeError: module 'audit' has no attribute 'field_label'` 等）。

- [ ] **Step 3: 实现 audit.py 纯函数**

在 `audit.py` 末尾（`read` 函数之后）追加：

```python
# ── target/detail 富化辅助(纯函数,供 server 各 handler 拼审计详情;不依赖 server) ──

_FIELD_LABELS = {
    'weekProgress': '本周进展', 'nextPlan': '下步计划',
    'followAction': '跟进动作', 'revConclusion': '回顾结论', 'nextRevDate': '下次回顾日期',
}


def field_label(key):
    """字段键 → 中文标签;未知键(通常本就是中文键)原样返回。"""
    return _FIELD_LABELS.get(key, str(key))


def _show(v):
    return str(v) if v not in (None, '') else '(空)'


def diff_changes(old, changed, labels=None, long_threshold=20):
    """对 changed 中值发生变化的键拼审计详情:短值记『标签 旧→新』,
    长值(任一侧字符串长度 > long_threshold)只标『标签（已改）』,无变化返回 ''。
    old/changed 为 dict;labels 提供键→中文覆盖,缺省用 field_label。"""
    labels = labels or {}
    parts = []
    for k, nv in (changed or {}).items():
        ov = (old or {}).get(k)
        if nv == ov:
            continue
        label = labels.get(k) or field_label(k)
        s_ov, s_nv = _show(ov), _show(nv)
        if len(s_ov) > long_threshold or len(s_nv) > long_threshold:
            parts.append('%s（已改）' % label)
        else:
            parts.append('%s %s→%s' % (label, s_ov, s_nv))
    return '；'.join(parts)


def summarize_scope(scope):
    """范围 {combinator, groups} → 'AND · 3 组条件';空/无组/畸形返回 '清空范围'。"""
    if not isinstance(scope, dict):
        return '清空范围'
    groups = scope.get('groups') or []
    if not groups:
        return '清空范围'
    comb = str(scope.get('combinator') or 'AND').upper()
    return '%s · %d 组条件' % (comb, len(groups))


def count_delta(old, new):
    """计数变化:相等返回 'N',不等返回 '旧→新'。"""
    return str(new) if old == new else '%d→%d' % (old, new)


def join_detail(parts):
    """过滤空片段,用 ' · ' 拼接。"""
    return ' · '.join(p for p in parts if p)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_audit.py -q`
Expected: PASS（含既有用例全绿）。

- [ ] **Step 5: 加 server `_audit_set` 助手 + `_OPP_FIELD_LABELS`**

在 `server.py` 的 `_audit_request` 方法**之后**（约 2172，`_audit_login` 之前）插入：

```python
    def _audit_set(self, target=None, detail=None):
        """handler 内富化本请求审计的目标/详情;仅覆盖传入的非 None 值。
        取值须防御式,绝不因审计让主流程 500(调用方保证不抛)。"""
        if target is not None:
            self._audit_target = target
        if detail is not None:
            self._audit_detail = detail
```

在 `server.py` 模块级（`OPPORTUNITIES_FILE = ...` 之后，约 491）插入（复用 opportunities 既有映射，DRY）：

```python
# 商机字段 key → 中文标签(供审计更新详情;反转 opportunities 既有列名映射)
_OPP_FIELD_LABELS = {v: k for k, v in _opp.HEADER_TO_FIELD.items()}
```

> 若 `server.py` 顶部把 opportunities 导入为其它别名，则用该别名；本仓库 handler 均以 `_opp.` 调用，故别名为 `_opp`（实现时 grep `import opportunities` 确认）。

- [ ] **Step 6: 编译校验**

Run: `python -c "import server, audit"`
Expected: 无异常（导入成功）。

- [ ] **Step 7: Commit**

```bash
git add audit.py server.py tests/test_audit.py
git commit -m "feat(audit): 富化纯函数(diff_changes/summarize_scope 等)+_audit_set 助手

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A 组 · 跟进记录 + 标签保存 富化

**Files:**
- Modify: `server.py` — `handle_followup_add`（约 908）、`handle_followup_delete`（约 967）、`handle_followup_update`（约 996）、`handle_tags_save`（约 1172）
- Test: `tests/test_server_audit.py`（追加）

**Interfaces:**
- Consumes: `audit.diff_changes`、`audit.join_detail`、`audit.count_delta`、`handler._audit_set`（Task 1）。

- [ ] **Step 1: 写失败 e2e 测试**

在 `tests/test_server_audit.py` 顶部 import 区补 `import server`（已在），末尾追加：

```python
def _patch_business_files(monkeypatch, tmp_path):
    """把业务数据文件全局指到 tmp,避免测试污染真实 data/。"""
    for name in ('FOLLOWUP_FILE', 'PROJECT_TAGS_FILE', 'PROGRESS_FILE',
                 'TEMP_FOLLOWUP_FILE', 'OPP_FOLLOWUP_FILE', 'RISK_FOLLOWUP_FILE',
                 'PAYKEY_FOLLOWUP_FILE', 'OPPORTUNITIES_FILE'):
        monkeypatch.setattr(server, name, str(tmp_path / (name.lower() + '.json')))


def _post(conn, cookie, path, body):
    conn.request('POST', path, json.dumps(body),
                 {'Content-Type': 'application/json', 'Cookie': cookie})
    return conn.getresponse()


def test_followup_add_enriched_and_content_private(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        secret = '这是一段较长的跟进内容属于业务正文不应落审计日志'
        _post(conn, cookie, '/api/followup/add', {
            '项目编号': 'PRJ-9', '项目名称': '测试项目', '跟进人': '李四',
            '跟进类型': '邮件推动', '跟进内容': secret, '跟进状态': '跟进中'}).read()
        _wait_for(lambda: audit.read({'event': ['followup.add']}, 1, 50)['rows'])
        row = audit.read({'event': ['followup.add']}, 1, 50)['rows'][0]
        assert row['target'] == 'PRJ-9 · 测试项目'
        assert '邮件推动' in row['detail'] and '跟进中' in row['detail']
        with open(str(tmp_path / 'audit_log.jsonl'), encoding='utf-8') as f:
            assert secret not in f.read()   # 长正文不落审计
    finally:
        srv.shutdown(); srv.server_close()


def test_followup_update_records_old_to_new(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        r = _post(conn, cookie, '/api/followup/add', {
            '项目编号': 'PRJ-1', '项目名称': 'P1', '跟进人': '王五',
            '跟进类型': '电话沟通', '跟进内容': '短', '跟进状态': '跟进中'})
        rec_id = json.loads(r.read())['记录编号']
        _post(conn, cookie, '/api/followup/update',
              {'记录编号': rec_id, '跟进状态': '已解决'}).read()
        _wait_for(lambda: audit.read({'event': ['followup.update']}, 1, 50)['rows'])
        row = audit.read({'event': ['followup.update']}, 1, 50)['rows'][0]
        assert row['target'] == rec_id
        assert row['detail'] == '跟进状态 跟进中→已解决'
    finally:
        srv.shutdown(); srv.server_close()


def test_followup_delete_and_tags_save_enriched(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        r = _post(conn, cookie, '/api/followup/add', {
            '项目编号': 'PRJ-2', '项目名称': 'P2', '跟进人': '赵六',
            '跟进类型': '现场拜访', '跟进内容': '短', '跟进状态': '跟进中'})
        rec_id = json.loads(r.read())['记录编号']
        _post(conn, cookie, '/api/followup/delete', {'记录编号': rec_id}).read()
        _wait_for(lambda: audit.read({'event': ['followup.delete']}, 1, 50)['rows'])
        drow = audit.read({'event': ['followup.delete']}, 1, 50)['rows'][0]
        assert drow['target'] == rec_id and drow['detail'] == '删除跟进记录'
        # 标签保存
        _post(conn, cookie, '/api/tags',
              {'tags': [{'name': 'A'}, {'name': 'B'}], 'assignments': {'PRJ-2': ['A']}}).read()
        _wait_for(lambda: audit.read({'event': ['tags.save']}, 1, 50)['rows'])
        trow = audit.read({'event': ['tags.save']}, 1, 50)['rows'][0]
        assert '标签库' in trow['detail'] and '挂载' in trow['detail']
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_audit.py -q -k "followup or tags"`
Expected: FAIL（target/detail 为 None，断言不符）。

- [ ] **Step 3: 富化 handle_followup_add**

在 `handle_followup_add` 中，`跟进状态` 校验通过之后、生成 `记录编号` 之前（约 943 后）插入：

```python
        self._audit_set(
            target=audit.join_detail([data.get('项目编号', ''), data.get('项目名称', '')]),
            detail=audit.join_detail(['跟进类型「%s」' % data.get('跟进类型', ''),
                                      '状态「%s」' % data.get('跟进状态', ''), '（内容已填写）']))
```

- [ ] **Step 4: 富化 handle_followup_delete**

在 `handle_followup_delete` 中，`record_id` 非空校验通过之后（约 980 后）插入：

```python
        self._audit_set(target=record_id, detail='删除跟进记录')
```

- [ ] **Step 5: 富化 handle_followup_update**

把 `handle_followup_update` 的更新循环（约 1028-1036）替换为（新增旧值捕获 + 审计）：

```python
        records = _load_followup_records()
        found = False
        for r in records:
            if r.get('记录编号') == record_id:
                old = dict(r)  # 捕获旧值供审计 diff
                editable_fields = ['跟进人', '跟进类型', '跟进内容', '跟进状态', '下次跟进计划日期']
                for field in editable_fields:
                    if field in data and data[field]:
                        r[field] = data[field]
                enum_detail = audit.diff_changes(old, {k: r[k] for k in ('跟进类型', '跟进状态', '跟进人') if k in r})
                text_note = '（内容/日期已修改）' if any(
                    f in data and data.get(f) and data.get(f) != old.get(f)
                    for f in ('跟进内容', '下次跟进计划日期')) else ''
                self._audit_set(target=record_id,
                                detail=audit.join_detail([enum_detail, text_note]) or '修改跟进记录')
                found = True
                break
```

- [ ] **Step 6: 富化 handle_tags_save**

把 `handle_tags_save` 的 `_apply`（约 1186-1190）替换为（读旧 store 计数 + 审计）：

```python
        def _apply(s):
            old_tag_n, old_asg_n = len(s.get('tags', [])), len(s.get('assignments', {}))
            s['version'] = 1
            s['tags'] = tags
            s['assignments'] = assignments
            self._audit_set(detail='标签库 %s 个 · 挂载 %s 项目' % (
                audit.count_delta(old_tag_n, len(tags)),
                audit.count_delta(old_asg_n, len(assignments))))
            return True
```

- [ ] **Step 7: 运行确认通过**

Run: `python -m pytest tests/test_server_audit.py -q -k "followup or tags"`
Expected: PASS（4 条断言全绿）。

- [ ] **Step 8: Commit**

```bash
git add server.py tests/test_server_audit.py
git commit -m "feat(audit): 跟进记录增删改+标签保存 目标/详情富化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A 组 · 项目进展 + 四类跟进（temp/risk/opp/paykey）富化

**Files:**
- Modify: `server.py` — `handle_progress_update`（约 1209）、`handle_progress_archive`（约 1234）、`handle_progress_archive_delete`（约 1256）；四族各 4 个 handler：temp（约 1292-1377）、opp-followup（约 1392-1470）、risk（约 1492-1577）、paykey（约 1592-1677）的 `scope/update/archive/archive_delete`。
- Test: `tests/test_server_audit.py`（追加）

**Interfaces:**
- Consumes: `audit.field_label`、`audit.summarize_scope`、`handler._audit_set`（Task 1）；`_patch_business_files`（Task 2）。

- [ ] **Step 1: 写失败 e2e 测试**

在 `tests/test_server_audit.py` 末尾追加：

```python
def test_progress_update_target_and_field(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        _post(conn, cookie, '/api/progress/update',
              {'projectId': 'PRJ-7', 'field': 'weekProgress', 'content': '本周做了很多事情属于正文'}).read()
        _wait_for(lambda: audit.read({'event': ['progress.update']}, 1, 50)['rows'])
        row = audit.read({'event': ['progress.update']}, 1, 50)['rows'][0]
        assert row['target'] == 'PRJ-7' and row['detail'] == '本周进展（已修改）'
    finally:
        srv.shutdown(); srv.server_close()


def test_risk_followup_update_riskkey_target(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        _post(conn, cookie, '/api/risk-followup/update',
              {'riskKey': 'RK-3', 'field': 'followAction', 'content': '推动情况正文'}).read()
        _wait_for(lambda: audit.read({'event': ['risk_followup.update']}, 1, 50)['rows'])
        row = audit.read({'event': ['risk_followup.update']}, 1, 50)['rows'][0]
        assert row['target'] == 'RK-3' and row['detail'] == '跟进动作（已修改）'
    finally:
        srv.shutdown(); srv.server_close()


def test_temp_followup_scope_summarized(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        _post(conn, cookie, '/api/temp-followup/scope',
              {'combinator': 'and', 'groups': [{'x': 1}, {'y': 2}]}).read()
        _wait_for(lambda: audit.read({'event': ['temp_followup.scope']}, 1, 50)['rows'])
        row = audit.read({'event': ['temp_followup.scope']}, 1, 50)['rows'][0]
        assert row['detail'] == 'AND · 2 组条件'
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_audit.py -q -k "progress_update or risk_followup_update or temp_followup_scope"`
Expected: FAIL。

- [ ] **Step 3: 富化 handle_progress_update**

在 `handle_progress_update` 的 `pid`/`field` 校验通过之后（约 1219 后）插入：

```python
        self._audit_set(target=pid, detail='%s（已修改）' % audit.field_label(field))
```

- [ ] **Step 4: 富化 progress 归档/删归档**

`handle_progress_archive`：在 `rows` 校验通过之后（约 1243 后）插入：

```python
        self._audit_set(detail='归档 %d 行' % len(rows))
```

`handle_progress_archive_delete`：在 `idx` 校验通过之后（约 1263 后）插入：

```python
        self._audit_set(target='快照#%d' % idx, detail='删除历史快照')
```

- [ ] **Step 5: 富化四族 update（各自 target 键）**

在每个 `*_followup_update` 的 `field` 校验通过之后（`now = ...` 之前）插入对应一行：

- `handle_temp_followup_update`（约 1319 后，pid=projectId）：
```python
        self._audit_set(target=pid, detail='%s（已修改）' % audit.field_label(field))
```
- `handle_opportunity_followup_update`（约 1419 后，oid=oppId）：
```python
        self._audit_set(target=oid, detail='%s（已修改）' % audit.field_label(field))
```
- `handle_risk_followup_update`（约 1523 后，rk=riskKey）：
```python
        self._audit_set(target=rk, detail='%s（已修改）' % audit.field_label(field))
```
- `handle_paykey_followup_update`（约 1623 后，pid=projectId）：
```python
        self._audit_set(target=pid, detail='%s（已修改）' % audit.field_label(field))
```

- [ ] **Step 6: 富化四族 scope（`data` 解析成功后）**

在每个 `*_followup_scope` 的 `data is None` 判空之后、`def _apply` 之前插入对应一行（四处代码相同）：

- `handle_temp_followup_scope`（约 1297 后）
- `handle_opportunity_followup_scope`（约 1397 后）
- `handle_risk_followup_scope`（约 1497 后）
- `handle_paykey_followup_scope`（约 1597 后）

每处插入：
```python
        self._audit_set(detail=audit.summarize_scope(data))
```

- [ ] **Step 7: 富化四族 archive / archive_delete**

在每个 `*_followup_archive` 的 `rows` 校验通过之后插入：
```python
        self._audit_set(detail='归档 %d 行' % len(rows))
```
落点：temp（约 1343 后）、opp（约 1443 后）、risk（约 1543 后）、paykey（约 1643 后）。

在每个 `*_followup_archive_delete` 的 `idx` 校验通过之后插入：
```python
        self._audit_set(target='快照#%d' % idx, detail='删除历史快照')
```
落点：temp（约 1363 后）、opp（约 1463 后）、risk（约 1563 后）、paykey（约 1663 后）。

- [ ] **Step 8: 运行确认通过 + 回归**

Run: `python -m pytest tests/test_server_audit.py -q`
Expected: PASS（本任务 3 条 + Task 2 的 + 既有账号/登录用例全绿）。

- [ ] **Step 9: Commit**

```bash
git add server.py tests/test_server_audit.py
git commit -m "feat(audit): 项目进展+四类跟进(范围/更新/归档) 目标/详情富化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: B 组 · 商机 富化

**Files:**
- Modify: `server.py` — `handle_opportunities_create`（约 1703）、`handle_opportunities_update`（约 1737）、`handle_opportunities_delete`（约 1774）、`handle_opportunities_import`（约 1790）
- Test: `tests/test_server_audit.py`（追加）

**Interfaces:**
- Consumes: `audit.diff_changes`、`audit.join_detail`、`server._OPP_FIELD_LABELS`、`handler._audit_set`（Task 1）；`_patch_business_files`、`_post`（Task 2）。

- [ ] **Step 1: 写失败 e2e 测试**

在 `tests/test_server_audit.py` 末尾追加：

```python
def test_opportunity_create_and_update_enriched(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        r = _post(conn, cookie, '/api/opportunities/create',
                  {'fields': {'name': '某商机', 'l4': '交付一部', 'amountWan': '100'}})
        rid = json.loads(r.read())['row']['id']
        _wait_for(lambda: audit.read({'event': ['opportunities.create']}, 1, 50)['rows'])
        crow = audit.read({'event': ['opportunities.create']}, 1, 50)['rows'][0]
        assert crow['target'] == '某商机' and '新建商机' in crow['detail']
        # 更新:短值 旧→新
        _post(conn, cookie, '/api/opportunities/update',
              {'id': rid, 'fields': {'amountWan': '200'}}).read()
        _wait_for(lambda: audit.read({'event': ['opportunities.update']}, 1, 50)['rows'])
        urow = audit.read({'event': ['opportunities.update']}, 1, 50)['rows'][0]
        assert urow['target'] == '某商机'
        assert '100→200' in urow['detail']
    finally:
        srv.shutdown(); srv.server_close()


def test_opportunity_delete_enriched(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        r = _post(conn, cookie, '/api/opportunities/create', {'fields': {'name': '待删商机', 'l4': '交付一部'}})
        rid = json.loads(r.read())['row']['id']
        _post(conn, cookie, '/api/opportunities/delete', {'ids': [rid]}).read()
        _wait_for(lambda: audit.read({'event': ['opportunities.delete']}, 1, 50)['rows'])
        drow = audit.read({'event': ['opportunities.delete']}, 1, 50)['rows'][0]
        assert drow['detail'] == '删除商机' and rid in drow['target']
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_audit.py -q -k "opportunity"`
Expected: FAIL。

- [ ] **Step 3: 富化 handle_opportunities_create**

在 `handle_opportunities_create` 中 `_save_opportunities(store)` 之后、`self._json_response({"row": row})` 之前（约 1732 后）插入：

```python
            _l4 = (fields or {}).get('l4') or ''
            self._audit_set(
                target=str((fields or {}).get('name') or row.get('id', '')),
                detail=audit.join_detail(['新建商机', ('L4:%s' % _l4) if _l4 else '']))
```

- [ ] **Step 4: 富化 handle_opportunities_update**

在 `handle_opportunities_update` 中，找到旧 row 之后（约 1755 `target = next(...)`）、`apply_update` 之前捕获旧快照，并在 `_save_opportunities(store)` 之后（约 1769 后）插入审计。

在约 1755（`if target is None:` 校验通过后）插入：
```python
            old_snapshot = dict(target)  # 捕获旧值供审计 diff(apply_update 会就地改)
```
在约 1769（`_save_opportunities(store)` 之后、`self._json_response({"row": row})` 之前）插入：
```python
            self._audit_set(
                target=str(old_snapshot.get('name') or rid),
                detail=audit.diff_changes(old_snapshot, fields, labels=_OPP_FIELD_LABELS) or '更新商机')
```

- [ ] **Step 5: 富化 handle_opportunities_delete**

在 `handle_opportunities_delete` 中，`ids` 校验通过之后（约 1778 后）插入：

```python
        _ids = data['ids']
        self._audit_set(
            target=('%d 个商机' % len(_ids)) if len(_ids) > 5 else ('、'.join(str(i) for i in _ids) or '0 个'),
            detail='删除商机')
```

- [ ] **Step 6: 富化 handle_opportunities_import**

在 `handle_opportunities_import` 中 `rows = _opp.read_opportunities_xlsx(tmp)` 之后（约 1810 后）插入：

```python
        self._audit_set(detail='整表替换 · 导入 %d 条（旧表已备份）' % len(rows))
```

- [ ] **Step 7: 运行确认通过**

Run: `python -m pytest tests/test_server_audit.py -q -k "opportunity"`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add server.py tests/test_server_audit.py
git commit -m "feat(audit): 商机新建/更新/删除/导入 目标/详情富化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: C 组 · 数据运维 富化（含异步/隐私边界）

**Files:**
- Modify: `server.py` — `handle_clear_data`（约 836）、`handle_stop_server`（约 886）、`handle_reprocess`（约 1978）、`handle_pmis_download`（约 1955）、`handle_pmis_upload`（约 1832）、`handle_inputs_upload`（约 1865）、`handle_pmis_cookie_save`（约 1903）、`handle_yitian_cookie_save`（约 1927）、`handle_data_history_rollback`（约 2012）、`handle_data_history_undo`（约 2042）、`handle_manual_import`（约 1090）、`handle_manual_rollback`（约 1133）
- Test: `tests/test_server_audit.py`（追加）

**Interfaces:**
- Consumes: `handler._audit_set`（Task 1）。

- [ ] **Step 1: 写失败 e2e 测试（异步被拒 / 异步触发 / cookie 隐私）**

在 `tests/test_server_audit.py` 末尾追加：

```python
def test_reprocess_busy_not_marked_triggered(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    server.reprocess_state.clear(); server.reprocess_state.update({'running': True, 'progress': 50})
    try:
        conn, cookie = _login(port)
        conn.request('GET', '/api/reprocess', headers={'Cookie': cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({'event': ['data.reprocess']}, 1, 50)['rows'])
        row = audit.read({'event': ['data.reprocess']}, 1, 50)['rows'][0]
        assert not row.get('detail')   # 被拒:不标记"触发"
    finally:
        server.reprocess_state.clear()
        server.reprocess_state.update({'running': False, 'progress': 0, 'message': ''})
        srv.shutdown(); srv.server_close()


def test_reprocess_trigger_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)

    def _fake():
        server.reprocess_state.clear()
        server.reprocess_state.update({'running': False, 'progress': 100, 'message': 'done'})
    monkeypatch.setattr(server, 'run_reprocess', _fake)
    try:
        conn, cookie = _login(port)
        conn.request('GET', '/api/reprocess', headers={'Cookie': cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({'event': ['data.reprocess']}, 1, 50)['rows'])
        row = audit.read({'event': ['data.reprocess']}, 1, 50)['rows'][0]
        assert row['detail'] == '触发数据重新处理'
    finally:
        server.reprocess_state.clear()
        server.reprocess_state.update({'running': False, 'progress': 0, 'message': ''})
        srv.shutdown(); srv.server_close()


def test_pmis_cookie_save_enriched_no_value(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    monkeypatch.setattr(server, 'PMISDATA_CONFIG', str(tmp_path / 'pmis_config.json'))
    try:
        conn, cookie = _login(port)
        _post(conn, cookie, '/api/pmis/cookie', {'cookie': 'SESSION=SECRET_TOKEN_XYZ; a=1'}).read()
        _wait_for(lambda: audit.read({'event': ['pmis.cookie_save']}, 1, 50)['rows'])
        row = audit.read({'event': ['pmis.cookie_save']}, 1, 50)['rows'][0]
        assert row['detail'] == '更新 PMIS Cookie'
        with open(str(tmp_path / 'audit_log.jsonl'), encoding='utf-8') as f:
            raw = f.read()
        assert 'SECRET_TOKEN_XYZ' not in raw   # cookie 值绝不落审计
    finally:
        srv.shutdown(); srv.server_close()
```

> 说明：不测 `clear-data`（会删真实 `data/analysis_data.json`、`yundocs_data/`，用 `BASE_DIR` 无法 per-test patch）；其富化仅一行静态文案，靠代码走查 + Task 6 verify 覆盖。上传/回滚/人工导入的富化同为简单静态/取值，代码走查覆盖，避免触碰真实 input/ 与历史目录。

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_audit.py -q -k "reprocess or cookie"`
Expected: FAIL（reprocess trigger 用例 detail 为 None；busy 用例可能已"意外通过"，以 trigger + cookie 用例失败为准）。

- [ ] **Step 3: 富化 reprocess / download（成功抢槽后才记触发）**

`handle_reprocess`：在 `_acquire_run_slot(...)` 返回 True 之后、`threading.Thread(...).start()` 之前（约 1988 前）插入：

```python
        self._audit_set(detail='触发数据重新处理')
```

`handle_pmis_download`：在 `_acquire_run_slot(...)` 返回 True 之后、`threading.Thread(target=run_download...).start()` 之前（约 1965 前）插入：

```python
        self._audit_set(detail='触发 PMIS 数据拉取')
```

- [ ] **Step 4: 富化 clear-data / stop（方法入口静态文案）**

`handle_clear_data`：在方法体第一行（约 837，docstring 之后）插入：
```python
        self._audit_set(detail='清空全部数据')
```

`handle_stop_server`：在方法体第一行（约 887，docstring 之后）插入：
```python
        self._audit_set(detail='请求停止服务')
```

- [ ] **Step 5: 富化 上传（pmis / inputs）**

`handle_pmis_upload`：在成功响应前（约 1858 后、写文件之后）插入：
```python
        self._audit_set(target=name, detail='上传 PMIS 文件 · %d 字节' % len(body))
```

`handle_inputs_upload`：在成功响应前（约 1891 后、写文件之后）插入：
```python
        self._audit_set(target=name, detail='上传项目域文件 · %d 字节' % len(body))
```

- [ ] **Step 6: 富化 cookie 保存（不含任何值/预览）**

`handle_pmis_cookie_save`：在 body 解析成功之后（约 1911 后、`write_session_cookie` 之前）插入：
```python
        self._audit_set(detail='更新 PMIS Cookie')
```

`handle_yitian_cookie_save`：在 body 解析成功之后（约 1935 后、`write_session_cookie` 之前）插入：
```python
        self._audit_set(detail='更新倚天 Cookie')
```

- [ ] **Step 7: 富化 数据回滚 / 撤销 / 人工导入 / 人工回滚**

`handle_data_history_rollback`：在 `vid` 非空校验通过之后（约 2026 后）插入：
```python
        self._audit_set(target=vid, detail='回滚到版本 %s' % vid)
```

`handle_data_history_undo`：在方法体第一行（约 2043，docstring 之后）插入：
```python
        self._audit_set(detail='撤销上次数据回滚')
```

`handle_manual_import`：在 `summary = _apply_manual_import(...)` 之后（约 1123 的 `self._json_response` 之前）插入：
```python
        _mp = []
        if summary.get('tags'):
            _mp.append('项目标签 %d 条' % summary['tags'].get('tagsCount', 0))
        if summary.get('followup'):
            _mp.append('跟进记录 %d 条' % summary['followup'].get('count', 0))
        self._audit_set(target=str(body.get('fileName') or ''), detail='导入 ' + (' · '.join(_mp) or '无'))
```

`handle_manual_rollback`：在 `vid` 非空校验通过之后（约 1147 后）插入：
```python
        self._audit_set(target=vid, detail='回滚人工导入 %s' % vid)
```

- [ ] **Step 8: 运行确认通过 + 全量回归**

Run: `python -m pytest tests/test_server_audit.py -q`
Expected: PASS（reprocess busy/trigger + cookie 隐私 + 前序全部用例全绿）。

- [ ] **Step 9: Commit**

```bash
git add server.py tests/test_server_audit.py
git commit -m "feat(audit): 数据运维(触发/上传/cookie/回滚/人工导入) 目标/详情富化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 版本 bump V2.8.1 + 全量 verify + PROGRESS（控制者直接做）

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: bump 版本**

编辑 `frontend/src/version.ts`：`APP_VERSION` → `'V2.8.1'`，`RELEASE_DATE` → `'2026-07-09'`（保持文件既有字段结构，仅改值）。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest 全部通过含新用例 + 前端 typecheck/vitest/build）。若 ruff 报未使用变量等，就地修净。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本史加 V2.8.1 条目：一句话概括「审计目标/详情全量富化（A 业务跟进+B 商机+C 数据运维约 40 动作）；后端埋点，升级须重启后端、不需点更新数据、前端零功能改动」，并把上一版本 V2.8.0 记为其后一版。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.8.1 审计目标/详情全量富化 收官

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（对照 spec 各节）：**
- §3.1 `_audit_set` 助手 → Task 1 Step 5。§3.2 四/五个纯函数 → Task 1（`diff_changes` 合并了 spec 的 `diff_enum`，因枚举与任意字段可统一处理，额外补 `count_delta` 供标签 Δ）。§3.3 防御式/降级 → Global Constraints + 每处 `.get`/`or` 兜底。
- §4 A 组 → Task 2（跟进+标签）+ Task 3（进展+四族）；B 组 → Task 4；C 组 → Task 5。逐行核对：spec 表 A/B/C 每一动作都有对应 Step。
- §5 隐私/边界：长正文只标已改（followup add/update、progress/四族 update）✓；cookie 不含值（Task 5 Step 6 + 隐私测试）✓；异步只在抢槽后记触发（Task 5 Step 3 + busy 测试）✓；旧值捕获（followup update `old`、opp update `old_snapshot`、tags `_apply` 入参 `s`）✓。
- §6 测试：纯函数单测（Task 1）+ 端到端代表 handler（Task 2-5）+ 隐私回归（followup 长正文、cookie 值）✓。
- §7 版本 V2.8.1 + 重启后端 → Task 6 + Global Constraints ✓。§8 YAGNI：无新端点/无回填/前端零改 ✓。

**2. Placeholder scan：** 无 TBD/TODO；每个改动步骤都给出完整可粘贴代码块与落点锚。`_OPP_FIELD_LABELS` 由 `_opp.HEADER_TO_FIELD` 反转（具体规则非占位）；导入别名 `_opp` 已注明实现时 grep 确认。

**3. Type consistency：** 纯函数签名在 Task 1 定义、Task 2-5 调用一致：`diff_changes(old, changed, labels=, long_threshold=)`、`summarize_scope(scope)`、`count_delta(old,new)`、`join_detail(list)`、`field_label(key)`。`_audit_set(target=, detail=)` 全程一致。target 键随 handler 变化（projectId/oppId/riskKey）已在 §参考事实与各 Step 显式对应，无串用。

（自审发现 spec 的 `diff_enum` 与商机任意字段 diff 可由单一 `diff_changes` 覆盖，遂合并为一个函数并在 Task 1 注明——减面、不减覆盖；已就地采用。）
