# V4.0.2 实施计划：临时跟进多实例化 + 蓝信路由逐项拆分

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/projects/temp` 改为页内多选项卡、每个跟进事项一个独立实例；蓝信推送的 8 个工时问题码与 8 类项目关注原因各自独立配置收件人规则。

**Architecture:** 两部分**零代码交集、零数据交集**，可全程并行。Part A 的多实例逻辑做成 `temp_followup.py` 的一层包装——因为「实例」的形状 `{scope, current, archives}` 与旧 store 完全一致，四域共用的 `followup_store.py` 一行都不用改。Part B 保留两条域级路由、把收件人规则下沉到 `items[]`，核心改造是 `build_plan` 从「一次 `_rollup` 传单个 levels」改为「按 levels 分组多次调用再三层合并」。

**Tech Stack:** Python 3.8+ 标准库 + pytest / Vue3 + Vite + TS + Pinia + Element Plus + vitest

**Spec:** `docs/superpowers/specs/2026-07-19-v402-temp-multi-instance-and-lanxin-per-item.md`

---

## Global Constraints

以下约束对**每个任务**都生效，实现者与审查者都必须逐条核对：

1. **不使用任何 emoji**。需要符号时用 `→ ↓ ❌ ✕ ▾`。（CLAUDE.md 铁律）
2. **交流语言简体中文**，代码/命令/文件名保持原文。
3. **严禁修改 `followup_store.py`**。它是 temp / risk / opportunity / payment_key **四个域共用的引擎**，改它会牵动另外三个域。多实例是 temp 独有需求，只在 `temp_followup.py` 里包装。
4. **严禁修改 `frontend/src/lib/tempScope.ts` 与 `frontend/src/lib/tempFollowup.ts` 的对外签名**。这两个文件被 `/payment/key` 直接 import（`PaymentKeyFollowupView.vue` 用了 `buildScopeInputs` 与 `projectMatches`）。
5. **实例 id 由后端生成**，格式 `"inst-" + uuid.uuid4().hex[:8]`。前端不生成 id。
6. **实例名**：`strip()` 后长度 1..20；**允许重名**；仅用于展示，不参与任何 key。
7. **两处数据迁移的判据都是「缺新键」而非版本号比较**：temp 判 `instances` 缺失，蓝信判 route 里 `items` 缺失。写 `version != 2` 会让将来的 v3 被当旧版回迁。
8. **迁移必须无损且幂等**：现网 `temp_followup.json` 有 3 条归档（1 / 75 / 21 行）与一份 `orgL4 in [7 个 L4 组]` 的范围条件，迁移后必须逐字保留。
9. **蓝信迁移后的推送行为必须与迁移前逐字节等价**（管理员不动配置就不该有任何行为变化）。这是 Part B 的验收硬标准。
10. **审计埋点不能漏**：新增写端点必须进 `audit.py` 的 `_ACTION_MAP`，否则审计静默失效（V3.3.0 踩过）。
11. **不动 `lts/`**（精简变体已去除临时跟进域，且无蓝信）。
12. **完成的定义** = 代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

---

## 文件所有权与任务依赖

按文件所有权切分，同波次任务文件零重叠。

| 任务 | 独占文件 | 依赖 |
|---|---|---|
| A1 temp 多实例领域层 | `temp_followup.py` `tests/test_temp_followup.py` | 无 |
| A2 temp 后端端点 | `server.py` `audit.py` `tests/test_server_temp_followup.py` | A1 |
| A3 temp 前端数据层 | `frontend/src/lib/tempFollowupApi.ts` `frontend/src/stores/tempFollowup.ts`（+ test） | A2 |
| A4 temp 视图层 | `frontend/src/views/TempFollowupView.{vue,test.ts}` | A3 |
| B1 蓝信配置结构 | `lanxin_config.py` `tests/test_lanxin_config.py` | 无 |
| B2 蓝信 build_plan | `lanxin.py` `tests/test_lanxin.py` | B1 |
| B3 蓝信前端 | `frontend/src/lib/lanxinApi.ts` `frontend/src/components/LanxinConfigCard.{vue,test.ts}` `LanxinPushDrawer.{vue,test.ts}` | B1 |
| T9 收尾 | `frontend/src/version.ts` `PROGRESS.md` `deploy/升级手册-V4.0.2.md` | 全部 |

**并行波次**：

```
Wave 1:  A1 ‖ B1
Wave 2:  A2 ‖ B2
Wave 3:  A3 ‖ B3
Wave 4:  A4
Wave 5:  T9
```

---

### Task A1: temp 多实例领域层

**Files:**
- Modify: `temp_followup.py`（整文件重写，见下）
- Test: `tests/test_temp_followup.py`（新建）

**Interfaces:**
- Consumes: `followup_store` 的 `FollowupConfig` / `new_store` / `normalize_scope` / `apply_update` / `apply_archive` / `apply_archive_delete`（**不修改它们**）
- Produces（A2 依赖）：
  - `new_store() -> Dict`：返回 `{"version": 2, "instances": [一个「默认跟进」实例]}`
  - `migrate(store: Dict) -> Dict`：缺 `instances` 键时把顶层 scope/current/archives 包成第一个实例
  - `find_instance(store, instance_id) -> Optional[Dict]`
  - `create_instance(store, name, copy_from=None) -> Dict`（返回新实例，name 非法抛 `ValueError`）
  - `rename_instance(store, instance_id, name) -> bool`
  - `delete_instance(store, instance_id) -> bool`（只剩一个时抛 `ValueError`）
  - `normalize_scope(scope) -> Dict`、`apply_update(instance, ...)`、`apply_archive(instance, ...)`、`apply_archive_delete(instance, idx)` —— **入参从 store 改为 instance**

**关键设计（实现者必读）：** 「实例」的形状是 `{"id", "name", "scope", "current", "archives"}`，其中后三个键**与旧 store 的顶层键完全一致**。因此 `followup_store` 的 `apply_update` / `apply_archive` / `apply_archive_delete` 传入 instance 即可直接工作，一行都不用改。这是本任务能不碰四域共用引擎的原因。

现有 `temp_followup.py` 全文（供对照）：

```python
"""临时重点跟进(/projects/temp)领域:薄封装 followup_store(分组 scope,归档清 current)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=SCOPE_GROUPS, clear_on_archive=True)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)
# ...(normalize_scope / apply_update / apply_archive / apply_archive_delete 均转调 _fs)
```

- [ ] **Step 1: 写失败测试**

新建 `tests/test_temp_followup.py`：

```python
import pytest
import temp_followup as T


def test_new_store_has_one_default_instance():
    s = T.new_store()
    assert s["version"] == 2
    assert len(s["instances"]) == 1
    inst = s["instances"][0]
    assert inst["name"] == "默认跟进"
    assert inst["id"].startswith("inst-")
    assert inst["scope"] == {"combinator": "AND", "groups": []}
    assert inst["current"] == {} and inst["archives"] == []


def test_migrate_wraps_legacy_store_losslessly():
    """V4.0.1 及以前的单实例结构 → 包成「默认跟进」,三个字段逐字保留。"""
    legacy = {
        "version": 1,
        "scope": {"combinator": "AND", "groups": [
            {"combinator": "AND", "conditions": [
                {"group": "project", "field": "orgL4", "op": "in", "values": ["浙江服务组"]}]}]},
        "current": {"P1": {"weekProgress": "进展A", "weekProgressEditBy": "zhang"}},
        "archives": [{"archiveTime": "2026-06-25 13:29:08", "rows": [{"projectId": "P1"}]}],
    }
    out = T.migrate(legacy)
    assert len(out["instances"]) == 1
    inst = out["instances"][0]
    assert inst["name"] == "默认跟进"
    # 三个字段必须逐字保留 —— 现网有 3 条归档共 97 行,丢一条都是事故
    assert inst["scope"] == legacy["scope"]
    assert inst["current"] == legacy["current"]
    assert inst["archives"] == legacy["archives"]


def test_migrate_is_idempotent():
    """已是新结构的 store 再迁一次必须原样返回(内容与 id 都不变)。"""
    once = T.migrate({"version": 1, "scope": {"combinator": "AND", "groups": []},
                      "current": {}, "archives": []})
    twice = T.migrate(once)
    assert twice == once


def test_migrate_judges_by_missing_instances_not_version():
    """判据是「缺 instances 键」——将来出 version 3 时不能被当旧版回迁。"""
    v3 = {"version": 3, "instances": [{"id": "inst-abc", "name": "x",
                                       "scope": {"combinator": "AND", "groups": []},
                                       "current": {}, "archives": []}]}
    assert T.migrate(v3) == v3


def test_create_instance_blank_scope():
    s = T.new_store()
    inst = T.create_instance(s, "7月回款攻坚")
    assert inst["name"] == "7月回款攻坚"
    assert inst["id"] != s["instances"][0]["id"]
    assert inst["scope"] == {"combinator": "AND", "groups": []}
    assert len(s["instances"]) == 2


def test_create_instance_copy_from_copies_scope_only():
    """copyFrom 只复制 scope —— 复制别人的进展记录没有意义,还会让归档来源混淆。"""
    s = T.new_store()
    src = s["instances"][0]
    src["scope"] = {"combinator": "AND", "groups": [
        {"combinator": "AND", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["A组"]}]}]}
    src["current"] = {"P1": {"weekProgress": "x"}}
    src["archives"] = [{"archiveTime": "t", "rows": []}]
    inst = T.create_instance(s, "新一轮", copy_from=src["id"])
    assert inst["scope"] == src["scope"]
    assert inst["current"] == {}
    assert inst["archives"] == []
    # 深拷贝:改新实例不能影响源实例
    inst["scope"]["groups"].append({"combinator": "AND", "conditions": []})
    assert len(src["scope"]["groups"]) == 1


@pytest.mark.parametrize("bad", ["", "   ", "x" * 21, None, 123])
def test_create_instance_rejects_bad_name(bad):
    s = T.new_store()
    with pytest.raises(ValueError):
        T.create_instance(s, bad)


def test_create_instance_allows_duplicate_name():
    """允许重名 —— 用户可能真要两个「7月攻坚」,靠 id 区分,强制查重只会挡路。"""
    s = T.new_store()
    a = T.create_instance(s, "同名")
    b = T.create_instance(s, "同名")
    assert a["id"] != b["id"]


def test_create_instance_unknown_copy_from_raises():
    s = T.new_store()
    with pytest.raises(ValueError):
        T.create_instance(s, "x", copy_from="inst-nope")


def test_rename_instance():
    s = T.new_store()
    iid = s["instances"][0]["id"]
    assert T.rename_instance(s, iid, "改过的名字") is True
    assert s["instances"][0]["name"] == "改过的名字"
    assert T.rename_instance(s, "inst-nope", "x") is False
    with pytest.raises(ValueError):
        T.rename_instance(s, iid, "")


def test_delete_instance():
    s = T.new_store()
    T.create_instance(s, "第二个")
    iid = s["instances"][0]["id"]
    assert T.delete_instance(s, iid) is True
    assert len(s["instances"]) == 1
    assert T.delete_instance(s, "inst-nope") is False


def test_delete_last_instance_rejected():
    """页面没有「零实例」这个合法状态,与其设计空态不如禁止。"""
    s = T.new_store()
    with pytest.raises(ValueError):
        T.delete_instance(s, s["instances"][0]["id"])


def test_find_instance():
    s = T.new_store()
    iid = s["instances"][0]["id"]
    assert T.find_instance(s, iid) is s["instances"][0]
    assert T.find_instance(s, "inst-nope") is None


def test_apply_update_operates_on_instance():
    """apply_update 等三个函数改为吃 instance —— instance 的 scope/current/archives
    三键与旧 store 顶层同构,followup_store 可直接复用。"""
    s = T.new_store()
    inst = s["instances"][0]
    rec = T.apply_update(inst, "P1", "weekProgress", "本周进展", "zhangsan", "2026-07-19 10:00:00")
    assert rec["weekProgress"] == "本周进展"
    assert rec["weekProgressEditBy"] == "zhangsan"
    assert inst["current"]["P1"]["weekProgress"] == "本周进展"
    with pytest.raises(ValueError):
        T.apply_update(inst, "P1", "notAField", "x", "a", "t")


def test_apply_archive_and_delete_operate_on_instance():
    s = T.new_store()
    inst = s["instances"][0]
    inst["current"] = {"P1": {"weekProgress": "x"}}
    T.apply_archive(inst, [{"projectId": "P1"}], "2026-07-19 10:00:00")
    assert len(inst["archives"]) == 1
    assert inst["current"] == {}          # clear_on_archive=True
    assert T.apply_archive_delete(inst, 0) is True
    assert inst["archives"] == []
    assert T.apply_archive_delete(inst, 5) is False
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_temp_followup.py -v`
Expected: FAIL —— `AttributeError: module 'temp_followup' has no attribute 'migrate'`

- [ ] **Step 3: 重写 `temp_followup.py`**

```python
"""临时重点跟进(/projects/temp)领域:多实例包装 + 薄封装 followup_store。

多实例为什么不下沉进 followup_store:那是 temp/risk/opportunity/payment_key
四个域共用的引擎,只有 temp 需要「并行多轮跟进」。所幸「实例」的形状
{scope, current, archives} 与旧 store 顶层完全同构 —— apply_update/apply_archive/
apply_archive_delete 传 instance 进去即可直接工作,引擎一行都不用改。
"""
from __future__ import annotations

import copy
import uuid
from typing import Any, Dict, Optional

import followup_store as _fs

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=SCOPE_GROUPS, clear_on_archive=True)

DEFAULT_INSTANCE_NAME = "默认跟进"
NAME_MAX = 20
STORE_VERSION = 2


def _new_id() -> str:
    return "inst-" + uuid.uuid4().hex[:8]


def _clean_name(name: Any) -> str:
    """非空、strip 后 1..20 字符。允许重名(靠 id 区分,强制查重只会挡路)。"""
    if not isinstance(name, str):
        raise ValueError("实例名必须是字符串")
    n = name.strip()
    if not n or len(n) > NAME_MAX:
        raise ValueError("实例名须为 1..%d 个字符" % NAME_MAX)
    return n


def _new_instance(name: str, scope: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"id": _new_id(), "name": name,
            "scope": copy.deepcopy(scope) if scope is not None else copy.deepcopy(_CFG.default_scope),
            "current": {}, "archives": []}


def new_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "instances": [_new_instance(DEFAULT_INSTANCE_NAME)]}


def migrate(store: Any) -> Dict[str, Any]:
    """V4.0.1 及以前的单实例结构 → 多实例。判据是【缺 instances 键】,不是版本号比较
    —— 写 version != 2 会让将来的 v3 被当旧版回迁。幂等:已是新结构则原样返回。"""
    if not isinstance(store, dict):
        return new_store()
    if isinstance(store.get("instances"), list) and store["instances"]:
        return store
    inst = {"id": _new_id(), "name": DEFAULT_INSTANCE_NAME,
            "scope": store.get("scope") if isinstance(store.get("scope"), dict)
                     else copy.deepcopy(_CFG.default_scope),
            "current": store.get("current") if isinstance(store.get("current"), dict) else {},
            "archives": store.get("archives") if isinstance(store.get("archives"), list) else []}
    return {"version": STORE_VERSION, "instances": [inst]}


def find_instance(store: Dict[str, Any], instance_id: Any) -> Optional[Dict[str, Any]]:
    for inst in store.get("instances") or []:
        if inst.get("id") == instance_id:
            return inst
    return None


def create_instance(store: Dict[str, Any], name: Any,
                    copy_from: Optional[str] = None) -> Dict[str, Any]:
    """copy_from 只复制 scope,不复制 current/archives。"""
    n = _clean_name(name)
    scope = None
    if copy_from:
        src = find_instance(store, copy_from)
        if src is None:
            raise ValueError("copyFrom 指向的实例不存在")
        scope = src.get("scope")
    inst = _new_instance(n, scope)
    store.setdefault("instances", []).append(inst)
    return inst


def rename_instance(store: Dict[str, Any], instance_id: str, name: Any) -> bool:
    n = _clean_name(name)          # 先校验名字,再找实例:名字非法就该抛,与实例存不存在无关
    inst = find_instance(store, instance_id)
    if inst is None:
        return False
    inst["name"] = n
    return True


def delete_instance(store: Dict[str, Any], instance_id: str) -> bool:
    """连同该实例的 current 与 archives 一并删除。不允许删到零实例。"""
    insts = store.get("instances") or []
    idx = next((i for i, x in enumerate(insts) if x.get("id") == instance_id), -1)
    if idx < 0:
        return False
    if len(insts) <= 1:
        raise ValueError("至少保留一个跟进事项")
    del insts[idx]
    return True


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(instance, project_id, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, instance, project_id, field, content, account, now)


def apply_archive(instance, rows, now) -> None:
    _fs.apply_archive(_CFG, instance, rows, now)


def apply_archive_delete(instance, idx) -> bool:
    return _fs.apply_archive_delete(instance, idx)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_temp_followup.py -v`
Expected: PASS（全部用例）

- [ ] **Step 5: 跑后端全量确认无回归**

Run: `python -m pytest -q && ruff check .`
Expected: PASS / 无 lint 错误。

**注意**：此时 `server.py` 仍在用旧签名调用 `_temp.apply_update(store, ...)`，全量 pytest 里若有 `tests/test_server_temp_followup.py` 会**预期失败**——那是 A2 的工作。若失败仅出现在该文件，属正常，记录到报告里继续；若其他文件也失败，停下报告。

- [ ] **Step 6: 提交**

```bash
git add temp_followup.py tests/test_temp_followup.py
git commit -m "feat(temp): 多实例领域层

实例形状 {scope,current,archives} 与旧 store 顶层同构 ——
followup_store(四域共用引擎)一行未改,apply_* 传 instance 直接工作。
迁移判据是「缺 instances 键」而非版本号比较,幂等且无损。"
```

---

### Task A2: temp 后端端点多实例化

**Files:**
- Modify: `server.py:511-534`（存储层）、`server.py:794-795, 925-932`（路由表）、`server.py:1621-1722`（5 个 handler）、`server.py:202-225`（`_SUPER_ONLY_PATHS`）
- Modify: `audit.py:64-67` 附近（`_ACTION_MAP` 加 3 条）
- Test: `tests/test_server_temp_followup.py`

**Interfaces:**
- Consumes（A1 产出）：`temp_followup` 的 `new_store` / `migrate` / `find_instance` / `create_instance` / `rename_instance` / `delete_instance` / `normalize_scope` / `apply_update(instance,...)` / `apply_archive(instance,...)` / `apply_archive_delete(instance, idx)`
- Produces（A3 依赖）：
  - `GET /api/temp-followup` → `{success, instances: [{id, name, scope, current, archives}]}`
  - `POST /api/temp-followup/instances/create` `{name, copyFrom?}` → `{success, instance, instances}`
  - `POST /api/temp-followup/instances/rename` `{instanceId, name}` → `{success, instances}`
  - `POST /api/temp-followup/instances/delete` `{instanceId}` → `{success, instances}`
  - `POST /api/temp-followup/scope` `{instanceId, combinator, groups}` → `{success, scope}`
  - `POST /api/temp-followup/update` `{instanceId, projectId, field, content}` → `{success, record}`
  - `POST /api/temp-followup/archive` `{instanceId, rows}` → `{success, archives}`
  - `POST /api/temp-followup/archive/delete` `{instanceId, archiveIdx}` → `{success, archives}`

**`server.py` 内部方法真实签名（照抄，别臆造）：**

```python
self._read_json_body()                      # 解析失败返回 None
self._send_json(status, payload)            # 注意参数顺序
self._json_response(payload)                # 单参数,200
_error_payload(ERR_VALIDATION, msg)         # 错误体构造
self._audit_set(target=..., detail=...)
self._followup_txn(lock, load_fn, mutate_fn, save_fn) -> (ok, res)   # 锁内 load→mutate→save
self._session_account_rec() -> (account, rec)
```

- [ ] **Step 1: 写失败测试**

在 `tests/test_server_temp_followup.py` 追加（既有用例的写法与夹具以文件现状为准，先读一遍）：

```python
def test_get_returns_instances_array():
    """GET 返回 instances 数组,不再有顶层 scope/current/archives。"""
    # 具体请求方式沿用本文件既有夹具
    resp = _get('/api/temp-followup')
    assert resp['success'] is True
    assert isinstance(resp['instances'], list) and len(resp['instances']) >= 1
    inst = resp['instances'][0]
    assert set(['id', 'name', 'scope', 'current', 'archives']) <= set(inst.keys())


def test_legacy_file_is_migrated_on_read():
    """现网存量文件(单实例结构)读出来必须已是 instances 数组,归档逐字保留。"""
    _write_store_file({
        "version": 1,
        "scope": {"combinator": "AND", "groups": []},
        "current": {"P1": {"weekProgress": "旧进展"}},
        "archives": [{"archiveTime": "2026-06-25 13:29:08", "rows": [{"projectId": "P1"}]}],
    })
    resp = _get('/api/temp-followup')
    inst = resp['instances'][0]
    assert inst['name'] == '默认跟进'
    assert inst['current'] == {"P1": {"weekProgress": "旧进展"}}
    assert len(inst['archives']) == 1
    assert inst['archives'][0]['archiveTime'] == "2026-06-25 13:29:08"


def test_update_requires_valid_instance_id():
    """instanceId 不存在必须 400 —— 静默落到第一个实例会让 A 实例的进展出现在 B 实例。"""
    r = _post('/api/temp-followup/update',
              {"instanceId": "inst-nope", "projectId": "P1",
               "field": "weekProgress", "content": "x"}, super_user=False)
    assert r.status == 400


def test_update_writes_into_the_named_instance_only():
    iid_a = _get('/api/temp-followup')['instances'][0]['id']
    iid_b = _post('/api/temp-followup/instances/create', {"name": "第二个"})['instance']['id']
    _post('/api/temp-followup/update',
          {"instanceId": iid_b, "projectId": "P1", "field": "weekProgress", "content": "仅B"})
    insts = {i['id']: i for i in _get('/api/temp-followup')['instances']}
    assert insts[iid_b]['current']['P1']['weekProgress'] == '仅B'
    assert 'P1' not in insts[iid_a]['current']


def test_create_rename_delete_are_super_only():
    for path, body in [('/api/temp-followup/instances/create', {"name": "x"}),
                       ('/api/temp-followup/instances/rename', {"instanceId": "i", "name": "y"}),
                       ('/api/temp-followup/instances/delete', {"instanceId": "i"})]:
        assert _post(path, body, super_user=False).status == 403


def test_update_allowed_for_normal_user():
    """填写进展是任意登录用户 —— 这是现状权限,不能因多实例改造收紧。"""
    iid = _get('/api/temp-followup')['instances'][0]['id']
    r = _post('/api/temp-followup/update',
              {"instanceId": iid, "projectId": "P1", "field": "weekProgress", "content": "x"},
              super_user=False)
    assert r.status == 200


def test_delete_last_instance_rejected():
    iid = _get('/api/temp-followup')['instances'][0]['id']
    r = _post('/api/temp-followup/instances/delete', {"instanceId": iid})
    assert r.status == 400


def test_create_with_copy_from_copies_scope_only():
    src = _get('/api/temp-followup')['instances'][0]
    _post('/api/temp-followup/scope', {
        "instanceId": src['id'], "combinator": "AND",
        "groups": [{"combinator": "AND", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["A组"]}]}]})
    _post('/api/temp-followup/update',
          {"instanceId": src['id'], "projectId": "P1", "field": "weekProgress", "content": "x"})
    new = _post('/api/temp-followup/instances/create',
                {"name": "复制的", "copyFrom": src['id']})['instance']
    assert new['scope']['groups'][0]['conditions'][0]['values'] == ["A组"]
    assert new['current'] == {}
```

同时在**审计接线测试**里加一条（比照 `tests/test_lanxin_wiring.py` 的写法，直接断言映射表）：

```python
def test_instance_endpoints_are_audited():
    import audit
    for p in ('/api/temp-followup/instances/create',
              '/api/temp-followup/instances/rename',
              '/api/temp-followup/instances/delete'):
        assert ('POST', p) in audit._ACTION_MAP, "%s 漏登记审计,会静默不记录" % p
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_server_temp_followup.py -v`
Expected: FAIL —— 返回体里没有 `instances`。

- [ ] **Step 3: 改存储层**

`server.py:515-529` 的 `_load_temp_followup` 整块替换为：

```python
def _load_temp_followup():
    """加载临时跟进 store;缺文件/损坏 → 默认。读取时自动迁移单实例结构(V4.0.1 及以前)。不抛。"""
    store = None
    if os.path.exists(TEMP_FOLLOWUP_FILE):
        try:
            with open(TEMP_FOLLOWUP_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                store = loaded
        except Exception:
            store = None
    if store is None:
        return _temp.new_store()
    store = _temp.migrate(store)
    for inst in store.get('instances') or []:
        inst['scope'] = _temp.normalize_scope(inst.get('scope'))
        inst.setdefault('current', {})
        inst.setdefault('archives', [])
    return store
```

- [ ] **Step 4: 改 5 个既有 handler + 加 3 个新 handler**

**共用的实例定位helper**（加在 `handle_temp_followup_get` 之前）：

```python
    def _temp_instance_or_400(self, store, data):
        """按 instanceId 取实例;取不到直接回 400 并返回 None(调用方须立即 return)。
        绝不静默落到第一个实例 —— 那会让 A 实例里写的进展出现在 B 实例。"""
        inst = _temp.find_instance(store, str((data or {}).get('instanceId') or ''))
        if inst is None:
            self._send_json(400, _error_payload(ERR_VALIDATION, "instanceId 不存在"))
        return inst
```

`handle_temp_followup_get` 的返回体改为：

```python
            store = _load_temp_followup()
            self._json_response({"success": True, "instances": store.get("instances", [])})
```

`handle_temp_followup_scope` 的 `_apply` 改为（`data` 里现在多了 `instanceId`，`normalize_scope` 只吃 `combinator`/`groups`，多余键会被忽略，无需剥离）：

```python
        def _apply(s):
            inst = _temp.find_instance(s, str(data.get('instanceId') or ''))
            if inst is None:
                raise ValueError("instanceId 不存在")
            inst['scope'] = _temp.normalize_scope(data)
            return inst['scope']
```

`handle_temp_followup_update` 的 `_followup_txn` 调用改为：

```python
        def _apply(s):
            inst = _temp.find_instance(s, str(data.get('instanceId') or ''))
            if inst is None:
                raise ValueError("instanceId 不存在")
            return _temp.apply_update(inst, pid, field, str(data.get('content') or ''), account, now)

        ok, res = self._followup_txn(_temp_lock, _load_temp_followup, _apply, _save_temp_followup)
```

`handle_temp_followup_archive` 的 `_apply` 改为：

```python
        def _apply(s):
            inst = _temp.find_instance(s, str(data.get('instanceId') or ''))
            if inst is None:
                raise ValueError("instanceId 不存在")
            _temp.apply_archive(inst, rows, now)
            return inst.get("archives", [])
```

`handle_temp_followup_archive_delete` 的 `_apply` 改为：

```python
        def _apply(s):
            inst = _temp.find_instance(s, str(data.get('instanceId') or ''))
            if inst is None:
                raise ValueError("instanceId 不存在")
            deleted = _temp.apply_archive_delete(inst, idx)
            holder['archives'] = inst.get("archives", [])
            return deleted
```

**三个新 handler**（放在 `handle_temp_followup_archive_delete` 之后，自带分节注释）：

```python
    # ── 临时跟进 实例管理(V4.0.2 多实例):新建/重命名/删除。均超管专属 ──

    def handle_temp_followup_instance_create(self):
        """POST /api/temp-followup/instances/create {name, copyFrom?} — 新建跟进事项。超管专属。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        self._audit_set(target=str(data.get('name') or ''), detail='新建跟进事项')
        holder = {}

        def _apply(s):
            inst = _temp.create_instance(s, data.get('name'), data.get('copyFrom') or None)
            holder['instance'] = inst
            return s.get('instances', [])

        ok, res = self._followup_txn(_temp_lock, _load_temp_followup, _apply, _save_temp_followup)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL,
                                           res or "新建失败")); return
        self._json_response({"success": True, "instance": holder.get('instance'), "instances": res})

    def handle_temp_followup_instance_rename(self):
        """POST /api/temp-followup/instances/rename {instanceId, name} — 重命名。超管专属。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        self._audit_set(target=str(data.get('instanceId') or ''),
                        detail='重命名为「%s」' % str(data.get('name') or ''))

        def _apply(s):
            if not _temp.rename_instance(s, str(data.get('instanceId') or ''), data.get('name')):
                raise ValueError("instanceId 不存在")
            return s.get('instances', [])

        ok, res = self._followup_txn(_temp_lock, _load_temp_followup, _apply, _save_temp_followup)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL,
                                           res or "重命名失败")); return
        self._json_response({"success": True, "instances": res})

    def handle_temp_followup_instance_delete(self):
        """POST /api/temp-followup/instances/delete {instanceId} — 删除跟进事项(连同其归档)。超管专属。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        # 先设一个兜底 detail:事务失败早退时也要留下审计痕迹。
        # (_audit_set 只是设实例属性,在写审计记录时才读 —— 见 server.py:3028,
        #  所以事务【之后】再覆盖成富化文案是有效的。)
        self._audit_set(target=str(data.get('instanceId') or ''), detail='删除跟进事项')
        holder = {}

        def _apply(s):
            inst = _temp.find_instance(s, str(data.get('instanceId') or ''))
            if inst is None:
                raise ValueError("instanceId 不存在")
            # 破坏性操作:审计里带上实例名与归档条数,事后能看清删掉了什么
            holder['detail'] = '删除跟进事项「%s」(含 %d 条归档)' % (
                inst.get('name', ''), len(inst.get('archives') or []))
            _temp.delete_instance(s, inst['id'])
            return s.get('instances', [])

        ok, res = self._followup_txn(_temp_lock, _load_temp_followup, _apply, _save_temp_followup)
        if holder.get('detail'):
            self._audit_set(detail=holder['detail'])
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL,
                                           res or "删除失败")); return
        self._json_response({"success": True, "instances": res})
```

- [ ] **Step 5: 注册路由与权限**

在 `server.py` 的 POST 路由表（`:925-932` 附近，与既有 temp 路由相邻）加三行：

```python
        '/api/temp-followup/instances/create': self.handle_temp_followup_instance_create,
        '/api/temp-followup/instances/rename': self.handle_temp_followup_instance_rename,
        '/api/temp-followup/instances/delete': self.handle_temp_followup_instance_delete,
```

在 `_SUPER_ONLY_PATHS`（`:202-225`）里既有三条 temp 路径旁加三条：

```python
    '/api/temp-followup/instances/create', '/api/temp-followup/instances/rename',
    '/api/temp-followup/instances/delete',
```

**注意**：`_authz_gate()` 在 `do_GET` 与 `do_POST` 里都被调用、按 path 匹配**不分 method**，所以进了这个集合就够，handler 内不需要再 `_require_super()`。

- [ ] **Step 6: 加审计埋点**

`audit.py` 的 `_ACTION_MAP` 里，现有 4 条 temp 条目之后加 3 条：

```python
    ('POST', '/api/temp-followup/instances/create'): ('temp_followup.instance_create', '新建临时跟进事项'),
    ('POST', '/api/temp-followup/instances/rename'): ('temp_followup.instance_rename', '重命名临时跟进事项'),
    ('POST', '/api/temp-followup/instances/delete'): ('temp_followup.instance_delete', '删除临时跟进事项'),
```

- [ ] **Step 7: 运行测试确认通过**

Run: `python -m pytest tests/test_server_temp_followup.py tests/test_temp_followup.py -v && python -m pytest -q && ruff check .`
Expected: 全部 PASS。

- [ ] **Step 8: 提交**

```bash
git add server.py audit.py tests/test_server_temp_followup.py
git commit -m "feat(temp): 后端端点多实例化 + 3 个实例管理端点

读取时自动迁移单实例结构,归档逐字保留。instanceId 不存在一律 400,
绝不静默落到第一个实例(那会让 A 实例的进展出现在 B 实例)。
新端点进 _SUPER_ONLY_PATHS 与 audit._ACTION_MAP;
填写进展仍是任意登录用户,权限分界不因改造收紧。"
```

---

### Task A3: temp 前端数据层

**Files:**
- Modify: `frontend/src/lib/tempFollowupApi.ts`（整文件重写）
- Modify: `frontend/src/stores/tempFollowup.ts`（整文件重写）
- Test: `frontend/src/stores/tempFollowup.test.ts`（若不存在则新建）

**Interfaces:**
- Consumes（A2 产出）：8 个端点的请求/响应形状
- Produces（A4 依赖）：store 暴露
  - `instances: Ref<TempInstance[]>`、`activeId: Ref<string>`
  - `scope` / `current` / `archives`：**computed，指向当前实例**（保持既有名字与形状不变）
  - `load()` / `saveScope(next)` / `update(projectId, field, content)` / `archive(rows)` / `deleteArchive(idx)`：签名**不变**，内部自动带 `activeId`
  - `createInstance(name, copyFrom?)` / `renameInstance(id, name)` / `deleteInstance(id)` / `setActive(id)`

**关键约束（实现者必读）：** `scope` / `current` / `archives` / `deleteArchive` 这四个导出**必须保留原名与原形状**。`useFollowupPage(temp, ...)` 只要求 store 满足 `{archives, deleteArchive}`，它被 5 个跟进页复用（temp / risk / payment_key / opportunity / key-projects），**不能为 temp 单独改它**。把这三个 state 换成指向当前实例的 computed，视图与 composable 的既有引用就一行都不用改。

- [ ] **Step 1: 写失败测试**

`frontend/src/stores/tempFollowup.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTempFollowupStore } from './tempFollowup'

vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn(),
    saveScope: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    deleteArchive: vi.fn(),
    createInstance: vi.fn(),
    renameInstance: vi.fn(),
    deleteInstance: vi.fn(),
  },
}))
import { tempFollowupApi } from '@/lib/tempFollowupApi'

const INST_A = { id: 'inst-aaa', name: '甲', scope: { combinator: 'AND', groups: [] },
                 current: { P1: { weekProgress: '甲的进展' } }, archives: [{ archiveTime: 't1', rows: [] }] }
const INST_B = { id: 'inst-bbb', name: '乙', scope: { combinator: 'OR', groups: [] },
                 current: {}, archives: [] }

describe('tempFollowup store 多实例', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(tempFollowupApi.get as any).mockResolvedValue({ success: true, instances: [INST_A, INST_B] })
  })

  it('load 后默认选中第一个实例,scope/current/archives 指向它', async () => {
    const s = useTempFollowupStore()
    await s.load()
    expect(s.instances.length).toBe(2)
    expect(s.activeId).toBe('inst-aaa')
    expect(s.current.P1.weekProgress).toBe('甲的进展')
    expect(s.archives.length).toBe(1)
  })

  it('setActive 后三个导出跟着切换 —— 这是视图零改动的前提', async () => {
    const s = useTempFollowupStore()
    await s.load()
    s.setActive('inst-bbb')
    expect(s.current).toEqual({})
    expect(s.archives).toEqual([])
    expect(s.scope.combinator).toBe('OR')
  })

  it('update 自动带上 activeId', async () => {
    ;(tempFollowupApi.update as any).mockResolvedValue({ success: true, record: { weekProgress: 'x' } })
    const s = useTempFollowupStore()
    await s.load()
    s.setActive('inst-bbb')
    await s.update('P9', 'weekProgress', 'x')
    expect(tempFollowupApi.update).toHaveBeenCalledWith('inst-bbb', 'P9', 'weekProgress', 'x')
  })

  it('update 只改当前实例的 current,不串到别的实例', async () => {
    ;(tempFollowupApi.update as any).mockResolvedValue({ success: true, record: { weekProgress: '乙的' } })
    const s = useTempFollowupStore()
    await s.load()
    s.setActive('inst-bbb')
    await s.update('P9', 'weekProgress', '乙的')
    expect(s.current.P9.weekProgress).toBe('乙的')
    s.setActive('inst-aaa')
    expect(s.current.P9).toBeUndefined()
  })

  it('deleteInstance 后若删的是当前实例,自动回落到第一个', async () => {
    ;(tempFollowupApi.deleteInstance as any).mockResolvedValue({ success: true, instances: [INST_B] })
    const s = useTempFollowupStore()
    await s.load()
    await s.deleteInstance('inst-aaa')
    expect(s.activeId).toBe('inst-bbb')
  })

  it('createInstance 后自动切到新实例', async () => {
    const NEW = { id: 'inst-ccc', name: '丙', scope: { combinator: 'AND', groups: [] }, current: {}, archives: [] }
    ;(tempFollowupApi.createInstance as any).mockResolvedValue(
      { success: true, instance: NEW, instances: [INST_A, INST_B, NEW] })
    const s = useTempFollowupStore()
    await s.load()
    await s.createInstance('丙')
    expect(s.activeId).toBe('inst-ccc')
  })

  it('实例列表为空时三个导出降级为空值,不抛', async () => {
    ;(tempFollowupApi.get as any).mockResolvedValue({ success: true, instances: [] })
    const s = useTempFollowupStore()
    await s.load()
    expect(s.current).toEqual({})
    expect(s.archives).toEqual([])
    expect(s.scope).toEqual({ combinator: 'AND', groups: [] })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/stores/tempFollowup.test.ts`
Expected: FAIL —— store 没有 `instances` / `setActive`。

- [ ] **Step 3: 重写 `tempFollowupApi.ts`**

```ts
import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { ProgressRecord } from './keyProjects'
import type { Archive } from './projectProgressApi'

export interface TempInstance {
  id: string
  name: string
  scope: ScopeFilter
  current: Record<string, ProgressRecord>
  archives: Archive[]
}

export interface TempGetResp { success?: boolean; instances: TempInstance[] }
export interface TempScopeResp { success: boolean; scope: ScopeFilter }
export interface TempUpdateResp { success: boolean; record: ProgressRecord }
export interface TempArchiveResp { success: boolean; archives: Archive[] }
export interface TempInstancesResp { success: boolean; instances: TempInstance[] }
export interface TempInstanceCreateResp extends TempInstancesResp { instance: TempInstance }

export const tempFollowupApi = {
  get: () => api.get<TempGetResp>('/api/temp-followup'),
  saveScope: (instanceId: string, scope: ScopeFilter) =>
    api.post<TempScopeResp>('/api/temp-followup/scope', { instanceId, ...scope }),
  update: (instanceId: string, projectId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<TempUpdateResp>('/api/temp-followup/update', { instanceId, projectId, field, content }),
  archive: (instanceId: string, rows: Record<string, unknown>[]) =>
    api.post<TempArchiveResp>('/api/temp-followup/archive', { instanceId, rows }),
  deleteArchive: (instanceId: string, archiveIdx: number) =>
    api.post<TempArchiveResp>('/api/temp-followup/archive/delete', { instanceId, archiveIdx }),
  createInstance: (name: string, copyFrom?: string) =>
    api.post<TempInstanceCreateResp>('/api/temp-followup/instances/create', { name, copyFrom }),
  renameInstance: (instanceId: string, name: string) =>
    api.post<TempInstancesResp>('/api/temp-followup/instances/rename', { instanceId, name }),
  deleteInstance: (instanceId: string) =>
    api.post<TempInstancesResp>('/api/temp-followup/instances/delete', { instanceId }),
}
```

- [ ] **Step 4: 重写 `stores/tempFollowup.ts`**

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tempFollowupApi, type TempInstance } from '@/lib/tempFollowupApi'
import type { Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useTempFollowupStore = defineStore('tempFollowup', () => {
  const instances = ref<TempInstance[]>([])
  const activeId = ref('')
  const loaded = ref(false)

  const activeInstance = computed<TempInstance | null>(
    () => instances.value.find((i) => i.id === activeId.value) ?? null)

  // scope/current/archives 保持原名原形状 —— useFollowupPage(5 个跟进页复用)只认
  // {archives, deleteArchive},视图里的既有引用因此一行都不用改。
  const scope = computed<ScopeFilter>(() => activeInstance.value?.scope ?? { ...EMPTY_SCOPE })
  const current = computed<Record<string, ProgressRecord>>(() => activeInstance.value?.current ?? {})
  const archives = computed<Archive[]>(() => activeInstance.value?.archives ?? [])

  function _setInstances(list: TempInstance[]) {
    instances.value = list ?? []
    if (!instances.value.some((i) => i.id === activeId.value)) {
      activeId.value = instances.value[0]?.id ?? ''
    }
  }

  async function load() {
    const r = await tempFollowupApi.get()
    _setInstances(r.instances ?? [])
    loaded.value = true
  }
  function setActive(id: string) {
    if (instances.value.some((i) => i.id === id)) activeId.value = id
  }
  async function saveScope(next: ScopeFilter) {
    const r = await tempFollowupApi.saveScope(activeId.value, next)
    if (activeInstance.value) activeInstance.value.scope = r.scope ?? next
  }
  async function update(projectId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await tempFollowupApi.update(activeId.value, projectId, field, content)
    const inst = activeInstance.value
    if (inst) inst.current = { ...inst.current, [projectId]: { ...inst.current[projectId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await tempFollowupApi.archive(activeId.value, rows)
    const inst = activeInstance.value
    if (inst) { inst.archives = r.archives ?? []; inst.current = {} }
  }
  async function deleteArchive(idx: number) {
    const r = await tempFollowupApi.deleteArchive(activeId.value, idx)
    if (activeInstance.value) activeInstance.value.archives = r.archives ?? []
  }
  async function createInstance(name: string, copyFrom?: string) {
    const r = await tempFollowupApi.createInstance(name, copyFrom)
    _setInstances(r.instances ?? [])
    if (r.instance?.id) activeId.value = r.instance.id      // 新建后直接切过去
  }
  async function renameInstance(id: string, name: string) {
    const r = await tempFollowupApi.renameInstance(id, name)
    _setInstances(r.instances ?? [])
  }
  async function deleteInstance(id: string) {
    const r = await tempFollowupApi.deleteInstance(id)
    _setInstances(r.instances ?? [])   // 删的若是当前实例,_setInstances 自动回落到第一个
  }
  function reset() {
    instances.value = []
    activeId.value = ''
    loaded.value = false
  }
  return { instances, activeId, activeInstance, scope, current, archives, loaded,
           load, setActive, saveScope, update, archive, deleteArchive,
           createInstance, renameInstance, deleteInstance, reset }
})
```

- [ ] **Step 5: 运行测试与 typecheck**

Run: `cd frontend && npx vitest run src/stores/tempFollowup.test.ts && npm run typecheck`
Expected: vitest PASS。typecheck **预期会在 `TempFollowupView.vue` 报错**（它还在用旧的 `saveScope(next)` 单参签名等），那是 A4 的工作。若报错只出现在该文件，继续；若别处也报错，停下报告。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/tempFollowupApi.ts frontend/src/stores/tempFollowup.ts frontend/src/stores/tempFollowup.test.ts
git commit -m "feat(temp): 前端数据层多实例化

scope/current/archives 改为指向当前实例的 computed 但【保持原名原形状】——
useFollowupPage 被 5 个跟进页复用,只认 {archives,deleteArchive},
不能为 temp 单独改它;视图里的既有引用因此一行不用动。"
```

---

### Task A4: temp 视图层——实例选项卡 + 持久化 key 迁移

**Files:**
- Modify: `frontend/src/views/TempFollowupView.vue`
- Test: `frontend/src/views/TempFollowupView.test.ts`

**Interfaces:**
- Consumes（A3 产出）：store 的 `instances` / `activeId` / `setActive` / `createInstance` / `renameInstance` / `deleteInstance`，以及签名不变的 `scope` / `current` / `archives` / `saveScope` / `update` / `archive` / `deleteArchive`
- Produces: 无

**⚠ 本任务的核心风险不是 UI，是持久化 key。** 现状：

```ts
const TABLE_ID = 'temp-followup'                              // :33
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ...)    // → colprefs:{account}:temp-followup
const sort  = usePersistentSort(userScopedKey(TABLE_ID))      // → colsort:{account}:temp-followup
cf.tableFilters(TABLE_ID)                                     // 内存态,无需迁移
```

多实例后 `TABLE_ID` 必须带 instanceId，否则各实例的列配置互相覆盖。**但改 key 会让用户已有的选列与排序全部失效**——页面回落默认列，用户以为配置丢了。

**这是本仓第二次遇到同款陷阱**：V4.0.1 把 `tags` 加进 `/projects` 的 `DEFAULT_VISIBLE` 时，因为 `useColumnPrefs.loadKeys` 是**持久化优先**（有持久化就直接返回，`defaultVisible` 只在无持久化时兜底），老用户根本读不到新默认值，标签筛选入口凭空消失（终审 I-1）。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/TempFollowupView.test.ts` 追加（既有挂载辅助以文件现状为准，当前是 `mountAs(isSuper)`）：

```ts
describe('V4.0.2 多实例', () => {
  it('渲染实例选项卡,点击可切换', async () => {
    const w = await mountAs(true)
    const tabs = w.findAll('[data-test="temp-inst-tab"]')
    expect(tabs.length).toBeGreaterThanOrEqual(2)
    await tabs[1].trigger('click')
    const store = useTempFollowupStore()
    expect(store.activeId).toBe(store.instances[1].id)
  })

  it('新建/重命名/删除入口仅超管可见', async () => {
    const wSuper = await mountAs(true)
    expect(wSuper.find('[data-test="temp-inst-new"]').exists()).toBe(true)
    const wNormal = await mountAs(false)
    expect(wNormal.find('[data-test="temp-inst-new"]').exists()).toBe(false)
  })

  it('切换实例时清空该表的列筛选 —— 否则用户看到空表却不知为何', async () => {
    const w = await mountAs(true)
    const cf = useCrossFilterStore()
    const store = useTempFollowupStore()
    cf.setColumnFilter(`temp-followup:${store.instances[0].id}`, 'orgL4', ['A组'])
    await w.findAll('[data-test="temp-inst-tab"]')[1].trigger('click')
    expect(cf.hasFilters(`temp-followup:${store.instances[0].id}`)).toBe(false)
  })

  it('列配置按实例隔离:两个实例的 colprefs key 不同', async () => {
    const w = await mountAs(true)
    const store = useTempFollowupStore()
    const a = store.instances[0].id
    const b = store.instances[1].id
    expect(a).not.toBe(b)
    // 在实例 A 下改列 → 只写 A 的 key
    ;(w.vm as any).prefs.toggle('setupDate')
    expect(localStorage.getItem(`colprefs:anon:temp-followup:${a}`)).toBeTruthy()
    expect(localStorage.getItem(`colprefs:anon:temp-followup:${b}`)).toBeNull()
  })

  it('升级路径:旧 key 的选列/排序迁移到第一个实例', async () => {
    // 预置 V4.0.1 及以前的持久化(不带 instanceId)
    localStorage.setItem('colprefs:anon:temp-followup', JSON.stringify(['projectId', 'customer', 'setupDate']))
    localStorage.setItem('colsort:anon:temp-followup', JSON.stringify({ prop: 'contractWan', order: 'descending' }))
    const w = await mountAs(true)
    const store = useTempFollowupStore()
    const first = store.instances[0].id
    expect(JSON.parse(localStorage.getItem(`colprefs:anon:temp-followup:${first}`)!))
      .toEqual(['projectId', 'customer', 'setupDate'])
    expect((w.vm as any).prefs.visibleKeys.value).toContain('setupDate')
  })

  it('迁移只跑一次:标记位存在后不再覆盖用户新改的配置', async () => {
    localStorage.setItem('colprefs:anon:temp-followup', JSON.stringify(['projectId']))
    const w1 = await mountAs(true)
    const store = useTempFollowupStore()
    const first = store.instances[0].id
    // 用户之后自己改了列
    localStorage.setItem(`colprefs:anon:temp-followup:${first}`, JSON.stringify(['projectName', 'orgL4']))
    await mountAs(true)
    expect(JSON.parse(localStorage.getItem(`colprefs:anon:temp-followup:${first}`)!))
      .toEqual(['projectName', 'orgL4'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts -t 'V4.0.2'`
Expected: FAIL —— 找不到 `[data-test="temp-inst-tab"]`。

- [ ] **Step 3: 把 TABLE_ID 改为按实例派生**

`TempFollowupView.vue:33` 附近，把常量改为 computed，并让 `useColumnPrefs` / `usePersistentSort` 跟着实例走。**注意这两个 composable 接收的是字符串而非 ref**，所以实例切换时需要重新创建——用 `key` 强制重挂表格区是最简单可靠的做法：给表格容器加 `:key="tableId"`，Vue 会在实例切换时重建该子树，composable 随之用新 key 重新初始化。

```ts
const TABLE_BASE = 'temp-followup'
const tableId = computed(() => `${TABLE_BASE}:${temp.activeId}`)
```

所有 `TABLE_ID` 的引用改为 `tableId.value`（脚本内）或 `tableId`（模板内）。

- [ ] **Step 4: 实现一次性 key 迁移**

在 `prefs` 初始化**之前**执行（迁移必须先于读取，否则读到的还是空）：

```ts
// V4.0.2 一次性迁移:多实例后表 key 从 'temp-followup' 变为 'temp-followup:{instanceId}',
// 老用户已存的选列/排序会读不到而回落默认列 —— 用户会以为配置丢了。
// 把旧 key 的值复制到【第一个实例】的新 key 下。标记位必须有,否则用户之后自己改的配置
// 会在下次进页面时被旧值反复覆盖。getItem 也要包 try:浏览器禁用 storage 时访问该属性即抛。
function migrateLegacyTableKeys(firstInstanceId: string) {
  if (!firstInstanceId) return
  const flag = userScopedKey('tablekeys-migrated:temp-followup:v402')
  let done = true
  try { done = !!localStorage.getItem(flag) } catch { return }
  if (done) return
  try { localStorage.setItem(flag, '1') } catch { /* 隐私模式/配额,忽略 */ }
  for (const prefix of ['colprefs:', 'colsort:']) {
    try {
      const oldKey = prefix + userScopedKey(TABLE_BASE)
      const newKey = prefix + userScopedKey(`${TABLE_BASE}:${firstInstanceId}`)
      const val = localStorage.getItem(oldKey)
      if (val !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, val)
    } catch { /* 单个 key 迁移失败不影响另一个 */ }
  }
}
```

调用时机：`temp.load()` 完成、`instances` 就位之后，且在表格区渲染之前。实现上放在 `load()` 的 `.then` 里、或 `watch(() => temp.instances.length, ..., { once: true })` 中，取到 `temp.instances[0].id` 后调用。

**旧 key 不删除**——留着无害，回滚到 V4.0.1 时还能用。

- [ ] **Step 5: 实现实例选项卡 UI**

模板中在页面标题下方、工具栏上方插入：

```html
<div class="tf-insts">
  <button v-for="i in temp.instances" :key="i.id" data-test="temp-inst-tab"
    class="tf-inst" :class="{ active: i.id === temp.activeId }" @click="switchInstance(i.id)">
    {{ i.name }}
  </button>
  <button v-if="auth.isSuper" data-test="temp-inst-new" class="tf-inst tf-inst-new"
    @click="newOpen = true">+ 新建</button>
  <button v-if="auth.isSuper && temp.activeInstance" data-test="temp-inst-menu"
    class="tf-inst tf-inst-menu" @click="menuOpen = true" title="重命名 / 删除">▾</button>
</div>
```

样式（`<style scoped>` 内，只用设计令牌，不写散值）：

```css
.tf-insts { display: flex; gap: var(--sp-2); overflow-x: auto; margin-bottom: var(--sp-3); }
.tf-inst {
  flex: 0 0 auto; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--card); color: var(--sub);
  font-size: var(--fs-2); cursor: pointer; transition: background var(--dur-1) var(--ease);
}
.tf-inst:hover { background: var(--hover-tint); }
.tf-inst.active { background: var(--selected-tint); color: var(--txt); font-weight: 600; }
```

切换函数：

```ts
function switchInstance(id: string) {
  if (id === temp.activeId) return
  cf.clearAll(tableId.value)        // 先按【旧】实例的 key 清筛选,再切
  temp.setActive(id)
  fp.mode.value = 'current'
  fp.currentPage.value = 1
  try { localStorage.setItem(userScopedKey('temp-active'), id) } catch { /* 忽略 */ }
}
```

`load()` 之后恢复上次选中的实例（该 id 已不存在时 store 的 `_setInstances` 会自动回落到第一个）：

```ts
try {
  const last = localStorage.getItem(userScopedKey('temp-active'))
  if (last) temp.setActive(last)
} catch { /* 忽略 */ }
```

**新建弹窗**（名称 + 范围来源），用仓库既有的 `el-dialog` 惯例：

```html
<el-dialog v-model="newOpen" title="新建跟进事项" width="420px">
  <div class="tf-form-row">
    <span class="tf-form-label">名称</span>
    <el-input v-model="newName" maxlength="20" show-word-limit placeholder="如：7月回款攻坚" />
  </div>
  <div class="tf-form-row">
    <span class="tf-form-label">范围</span>
    <el-radio-group v-model="newFrom">
      <el-radio value="">空白</el-radio>
      <el-radio v-for="i in temp.instances" :key="i.id" :value="i.id">复制自 {{ i.name }}</el-radio>
    </el-radio-group>
  </div>
  <template #footer>
    <el-button @click="newOpen = false">取消</el-button>
    <el-button type="primary" :disabled="!newName.trim()" @click="doCreate">新建</el-button>
  </template>
</el-dialog>
```

```ts
async function doCreate() {
  await temp.createInstance(newName.trim(), newFrom.value || undefined)
  newOpen.value = false
  newName.value = ''
  newFrom.value = ''
}
```

**删除确认**必须显示归档条数（破坏性操作）：

```ts
async function doDeleteInstance() {
  const inst = temp.activeInstance
  if (!inst) return
  await ElMessageBox.confirm(
    `将删除跟进事项「${inst.name}」，同时删除其 ${inst.archives.length} 条归档。此操作不可撤销。`,
    '删除跟进事项', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  await temp.deleteInstance(inst.id)
}
```

- [ ] **Step 6: 运行测试与 typecheck**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts && npm run typecheck`
Expected: vitest PASS；typecheck **0 error**（A3 遗留的报错到此应全部消除）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/TempFollowupView.vue frontend/src/views/TempFollowupView.test.ts
git commit -m "feat(temp): 实例选项卡 + 持久化 key 一次性迁移

表 key 从 temp-followup 改为 temp-followup:{instanceId},否则各实例列配置互相覆盖。
改 key 会让老用户已存的选列/排序读不到而回落默认列(V4.0.1 终审 I-1 同款陷阱),
故带一次性迁移把旧 key 值复制到第一个实例,标记位防重复覆盖。
切换实例先按旧 key 清列筛选,再切。"
```

---

### Task B1: 蓝信配置结构逐项化

**Files:**
- Modify: `lanxin_config.py:41-64`（`default_config`）、`:82-93`（`_validate_subset` 旁新增 `_validate_items`）、`:129-159`（`validate_config` 的 routes 段）
- Test: `tests/test_lanxin_config.py`

**Interfaces:**
- Consumes: `yitian_rules.ISSUE_LABELS`（8 项）、本模块的 `REASON_WHITELIST`（8 项）、`DEFAULT_ISSUE_CODES`（7 项，`not startswith("HINT_")` 派生）
- Produces（B2/B3 依赖）：每条 route 的形状
  ```python
  {"key": "timesheet"|"project", "label": str, "enabled": bool,
   "items": [{"code": str, "enabled": bool, "primary": bool, "supervisorLevels": int}, ...]}
  ```
  `items` 恒为**完整白名单长度**（工时 8 条、项目 8 条），顺序与白名单一致。**`recipients` 与 `issueCodes` / `reasons` 三个键不再出现在输出里。**

**现有 `validate_config` 的 routes 段原文**（供对照，`lanxin_config.py:129-159`）：

```python
    routes_in = cfg.get("routes")
    if not isinstance(routes_in, list) or not routes_in:
        raise ValueError("routes 必须是非空数组")
    known = {r["key"]: r for r in default_config()["routes"]}
    ...
        item: Dict[str, Any] = {
            "key": key, "label": known[key]["label"], "enabled": bool(r.get("enabled", True)),
            "recipients": _validate_recipients(r.get("recipients") or {}),
        }
        if key == "timesheet":
            item["issueCodes"] = _validate_subset(r.get("issueCodes", []), list(ISSUE_LABELS.keys()), "issueCodes")
        else:
            item["reasons"] = _validate_subset(r.get("reasons", []), REASON_WHITELIST, "reasons")
```

- [ ] **Step 1: 写失败测试**

在 `tests/test_lanxin_config.py` 追加：

```python
def _codes(route):
    return [i["code"] for i in route["items"]]


def _item(route, code):
    return next(i for i in route["items"] if i["code"] == code)


def test_default_config_routes_use_items():
    import lanxin_config as C
    d = C.default_config()
    ts = next(r for r in d["routes"] if r["key"] == "timesheet")
    pj = next(r for r in d["routes"] if r["key"] == "project")
    assert "recipients" not in ts and "issueCodes" not in ts
    assert "recipients" not in pj and "reasons" not in pj
    assert _codes(ts) == list(C.ISSUE_LABELS.keys())     # 恒为完整白名单
    assert _codes(pj) == C.REASON_WHITELIST
    # 默认:HINT_ 前缀不勾(V4.0.0 实测该单码 96 条 > 全部真问题 63 条)
    assert _item(ts, "HINT_PRESALE_PRODUCT")["enabled"] is False
    assert _item(ts, "MISS_SUMMARY")["enabled"] is True
    # 默认收件人策略沿用 V4.0.0:工时不发汇总、项目发到直接上级
    assert _item(ts, "MISS_SUMMARY")["supervisorLevels"] == 0
    assert _item(pj, "回款延期")["supervisorLevels"] == 1
    assert _item(pj, "回款延期")["primary"] is True


def test_migrate_legacy_routes_preserves_behavior():
    """★ 迁移后行为必须与迁移前逐字节等价 —— 管理员不动配置就不该有任何行为变化。
    旧 issueCodes 里出现的 → enabled;其余 → 不启用;primary/levels 一律继承原 recipients。"""
    import lanxin_config as C
    legacy = C.default_config()
    legacy["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": True,
         "issueCodes": ["MISS_SUMMARY", "TYPE_MISMATCH"],
         "recipients": {"primary": True, "supervisorLevels": 2}},
        {"key": "project", "label": "项目关注原因", "enabled": True,
         "reasons": ["回款延期", "数据异常"],
         "recipients": {"primary": False, "supervisorLevels": 3}},
    ]
    out = C.validate_config(legacy)
    ts = next(r for r in out["routes"] if r["key"] == "timesheet")
    pj = next(r for r in out["routes"] if r["key"] == "project")
    assert _item(ts, "MISS_SUMMARY")["enabled"] is True
    assert _item(ts, "TYPE_MISMATCH")["enabled"] is True
    assert _item(ts, "MISS_PROGRESS")["enabled"] is False        # 旧配置没勾
    # 继承原路由的 recipients —— 这是「行为等价」的关键
    for c in ("MISS_SUMMARY", "TYPE_MISMATCH", "MISS_PROGRESS"):
        assert _item(ts, c)["primary"] is True
        assert _item(ts, c)["supervisorLevels"] == 2
    assert _item(pj, "回款延期")["enabled"] is True
    assert _item(pj, "风险未闭环")["enabled"] is False
    for c in C.REASON_WHITELIST:
        assert _item(pj, c)["primary"] is False
        assert _item(pj, c)["supervisorLevels"] == 3


def test_migrate_is_idempotent():
    import lanxin_config as C
    once = C.validate_config(C.default_config())
    twice = C.validate_config(once)
    assert twice == once


def test_items_missing_codes_are_filled_as_disabled():
    """白名单里没出现在 items 的 code 自动补 enabled=False。
    将来新增问题码不会让旧配置校验失败(V4.0.0 吃过 ISSUE_LABELS 从 7 变 8 的亏)。"""
    import lanxin_config as C
    cfg = C.default_config()
    ts = next(r for r in cfg["routes"] if r["key"] == "timesheet")
    ts["items"] = [{"code": "MISS_SUMMARY", "enabled": True, "primary": True, "supervisorLevels": 1}]
    out = C.validate_config(cfg)
    ots = next(r for r in out["routes"] if r["key"] == "timesheet")
    assert _codes(ots) == list(C.ISSUE_LABELS.keys())
    assert _item(ots, "MISS_SUMMARY")["supervisorLevels"] == 1
    assert _item(ots, "MISS_PROGRESS")["enabled"] is False


def test_unknown_item_code_rejected():
    import lanxin_config as C
    cfg = C.default_config()
    ts = next(r for r in cfg["routes"] if r["key"] == "timesheet")
    ts["items"] = [{"code": "NOT_A_CODE", "enabled": True, "primary": True, "supervisorLevels": 0}]
    with pytest.raises(ValueError):
        C.validate_config(cfg)


def test_duplicate_item_code_rejected():
    import lanxin_config as C
    cfg = C.default_config()
    ts = next(r for r in cfg["routes"] if r["key"] == "timesheet")
    ts["items"] = [{"code": "MISS_SUMMARY", "enabled": True, "primary": True, "supervisorLevels": 0},
                   {"code": "MISS_SUMMARY", "enabled": False, "primary": True, "supervisorLevels": 0}]
    with pytest.raises(ValueError):
        C.validate_config(cfg)


@pytest.mark.parametrize("bad", [-1, 6, 99, "1", None, True])
def test_item_supervisor_levels_validated(bad):
    """True 必须被拒 —— isinstance(True, int) 为真,不显式排除就会漏过去。"""
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"][0]["supervisorLevels"] = bad
    with pytest.raises(ValueError):
        C.validate_config(cfg)


@pytest.mark.parametrize("field", ["enabled", "primary"])
def test_item_bool_fields_validated(field):
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"][0][field] = "yes"
    with pytest.raises(ValueError):
        C.validate_config(cfg)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_lanxin_config.py -k "items or migrate" -v`
Expected: FAIL —— route 里没有 `items` 键。

- [ ] **Step 3: 实现 `_validate_items` 与迁移**

在 `_validate_subset` 之后新增：

```python
def _default_item(code: str, enabled: bool, primary: bool = True, levels: int = 0) -> Dict[str, Any]:
    return {"code": code, "enabled": enabled, "primary": primary, "supervisorLevels": levels}


def _validate_items(raw: Any, whitelist: List[str], field: str) -> List[Dict[str, Any]]:
    """校验 items 并【按白名单顺序补齐】:白名单里没出现的 code 补 enabled=False。
    补齐而不是报错,是为了将来新增问题码时旧配置仍能通过校验(V4.0.0 吃过
    ISSUE_LABELS 从 7 项变 8 项的亏)。"""
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise ValueError("%s 必须是数组" % field)
    got: Dict[str, Dict[str, Any]] = {}
    for it in raw:
        if not isinstance(it, dict):
            raise ValueError("%s 的元素必须是对象" % field)
        code = it.get("code")
        if code not in whitelist:
            raise ValueError("%s 含非法 code:%s" % (field, code))
        if code in got:
            raise ValueError("%s 含重复 code:%s" % (field, code))
        for b in ("enabled", "primary"):
            v = it.get(b, True)
            if not isinstance(v, bool):
                raise ValueError("%s.%s 必须是布尔" % (field, b))
        lv = it.get("supervisorLevels", 0)
        if isinstance(lv, bool) or not isinstance(lv, int):
            raise ValueError("%s.supervisorLevels 必须是整数" % field)
        if not (0 <= lv <= MAX_SUPERVISOR_LEVELS):
            raise ValueError("%s.supervisorLevels 须在 0..%d" % (field, MAX_SUPERVISOR_LEVELS))
        got[code] = _default_item(code, bool(it.get("enabled", True)),
                                  bool(it.get("primary", True)), lv)
    return [got.get(c) or _default_item(c, False) for c in whitelist]


def _migrate_route_items(r: Dict[str, Any], whitelist: List[str], legacy_field: str) -> Any:
    """V4.0.1 及以前:一条路由一组 recipients + 一个 code 数组。
    → 逐项 items,勾选项 enabled=True、其余 False,primary/levels 一律继承原 recipients。
    这样迁移后行为与迁移前【逐字节等价】,管理员不动配置就没有任何变化。
    判据是【缺 items 键】而非版本号比较。"""
    if isinstance(r.get("items"), list):
        return r["items"]
    rec = _validate_recipients(r.get("recipients") or {})
    on = set(_validate_subset(r.get(legacy_field, []), whitelist, legacy_field))
    return [_default_item(c, c in on, rec["primary"], rec["supervisorLevels"]) for c in whitelist]
```

`default_config()` 的 routes 改为：

```python
        "routes": [
            {"key": "timesheet", "label": "倚天工时问题", "enabled": True,
             "items": [_default_item(c, c in DEFAULT_ISSUE_CODES, True, 0)
                       for c in ISSUE_LABELS]},
            {"key": "project", "label": "项目关注原因", "enabled": True,
             "items": [_default_item(c, True, True, 1) for c in REASON_WHITELIST]},
        ],
```

`validate_config` 的 route 组装段改为：

```python
        whitelist = list(ISSUE_LABELS.keys()) if key == "timesheet" else list(REASON_WHITELIST)
        legacy_field = "issueCodes" if key == "timesheet" else "reasons"
        item: Dict[str, Any] = {
            "key": key,
            "label": known[key]["label"],
            "enabled": bool(r.get("enabled", True)),
            "items": _validate_items(_migrate_route_items(r, whitelist, legacy_field),
                                     whitelist, "items"),
        }
        routes.append(item)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_lanxin_config.py -v`
Expected: PASS。**既有用例中断言 `issueCodes` / `reasons` / `recipients` 的那些会失败**——它们测的正是被本任务取代的结构，请**改写为等价的 items 断言**（例如 `len(pj["reasons"]) == 8` → `len(pj["items"]) == 8`），不要删除用例。改写后在报告里逐条列出改了哪些、为什么是等价变更。

- [ ] **Step 5: 跑后端全量**

Run: `python -m pytest -q && ruff check .`
Expected: `tests/test_lanxin.py` 会有失败（`build_plan` 还在读 `r["reasons"]`），那是 B2 的工作。若失败只出现在该文件，记录后继续；否则停下报告。

- [ ] **Step 6: 提交**

```bash
git add lanxin_config.py tests/test_lanxin_config.py
git commit -m "feat(lanxin): 路由配置逐项化(items[])

收件人规则从「一条路由一组 recipients」下沉到每一项。
迁移判据是「缺 items 键」,勾选项 enabled=True、其余 False,
primary/levels 一律继承原 recipients —— 迁移后行为与迁移前逐字节等价。
items 恒补齐为完整白名单长度,将来新增问题码不会让旧配置校验失败。"
```

---

### Task B2: 蓝信 `build_plan` 按项聚合

**Files:**
- Modify: `lanxin.py:145-146`（删 `_LEVEL_LABELS`）、`:196-302`（`build_plan`）、`:303-316`（删 `MAX_LEVELS_PROBE` 与 `_level_of`）、新增两个辅助函数
- Test: `tests/test_lanxin.py`

**Interfaces:**
- Consumes（B1 产出）：route 的 `items: [{code, enabled, primary, supervisorLevels}]`
- Produces: `build_plan` 的返回结构**不变**（`{recipients, unresolved, totals}`），`recipients` 元素形状不变

**⚠ 一个必须处理的映射问题（实现者极易踩）：** `_sum_ts_counts`（`lanxin.py:171-176`）按 **`label`（中文）** 聚合，而配置里的 `code` 是**英文码**（`MISS_SUMMARY` 等）。项目侧没有这个问题（reason 本身就是中文，code 与 label 同一个值）。

**不要 import `ISSUE_LABELS` 来做映射**——更简单可靠的做法是在分桶时顺手从数据建映射：`ts_by_emp` 里每个 issue 都自带 `{"code", "label", "count"}`，遍历时记下 `label → code` 即可。本次数据里没出现的 code 也不需要映射（counts 里根本没有它）。

- [ ] **Step 1: 写失败测试**

在 `tests/test_lanxin.py` 追加。注意该文件已有 `_cfg(...)` 工厂（`:203-213`），它构造的是**旧结构**——需要为新结构加一个工厂，**保留旧工厂不动**（其余既有用例还在用）：

```python
def _cfg_items(ts_items=None, pj_items=None, ts_on=True, pj_on=True):
    """新结构配置工厂。ts_items/pj_items: {code: (enabled, primary, levels)}，未列出的 code 补 (False, True, 0)。"""
    import lanxin_config as C
    c = C.default_config()
    def _mk(whitelist, spec):
        spec = spec or {}
        return [{"code": k, "enabled": spec.get(k, (False, True, 0))[0],
                 "primary": spec.get(k, (False, True, 0))[1],
                 "supervisorLevels": spec.get(k, (False, True, 0))[2]} for k in whitelist]
    c["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": ts_on,
         "items": _mk(list(C.ISSUE_LABELS.keys()), ts_items)},
        {"key": "project", "label": "项目关注原因", "enabled": pj_on,
         "items": _mk(C.REASON_WHITELIST, pj_items)},
    ]
    return c


def test_plan_item_disabled_is_dropped():
    """未启用的项不产出任何卡。"""
    cfg = _cfg_items(pj_items={"回款延期": (False, True, 1)})
    plan = L.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    assert plan["recipients"] == []


def test_plan_item_primary_false_still_rolls_up():
    """primary=False 的项不进本人卡,但仍进汇总 —— 两者是独立开关。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, False, 1)})
    plan = L.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    roles = [r["role"] for r in plan["recipients"]]
    assert "primary" not in roles
    assert "supervisor" in roles


def test_plan_primary_card_only_contains_primary_items():
    """同一人名下,只有 primary=True 的原因进本人卡。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0), "数据异常": (True, False, 0)})
    plan = L.build_plan(
        [{"kind": "project", "projectId": "P1", "reasons": ["回款延期", "数据异常"]}],
        cfg, _TREE, _PMIS)
    card = next(r["card"] for r in plan["recipients"] if r["role"] == "primary")
    keys = [f["key"] for f in card["fields"]]
    assert "回款延期" in keys
    assert "数据异常" not in keys


def test_plan_mixed_levels_route_to_different_supervisors():
    """★ 本任务的核心用例:不同项配不同级别,各自卷到各自的上级。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1), "数据异常": (True, True, 2)})
    plan = L.build_plan(
        [{"kind": "project", "projectId": "P1", "reasons": ["回款延期", "数据异常"]}],
        cfg, _TREE, _PMIS)
    sups = {r["employId"]: r["card"] for r in plan["recipients"] if r["role"] == "supervisor"}
    # +1 级上级只看到「回款延期」;+2 级上级只看到「数据异常」
    lvl1_card = sups[_SUP1]
    lvl2_card = sups[_SUP2]
    assert "回款延期" in lvl1_card["fields"][0]["value"]
    assert "数据异常" not in lvl1_card["fields"][0]["value"]
    assert "数据异常" in lvl2_card["fields"][0]["value"]
    assert "回款延期" not in lvl2_card["fields"][0]["value"]


def test_plan_same_supervisor_hit_by_two_levels_gets_one_merged_card():
    """★ 「按人合并」在这里成立:同一上级因两项(不同级别)命中,只收【一张】卡、卡内两行内容。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1), "数据异常": (True, True, 1)})
    plan = L.build_plan(
        [{"kind": "project", "projectId": "P1", "reasons": ["回款延期", "数据异常"]}],
        cfg, _TREE, _PMIS)
    sup_recs = [r for r in plan["recipients"] if r["role"] == "supervisor" and r["employId"] == _SUP1]
    assert len(sup_recs) == 1
    v = sup_recs[0]["card"]["fields"][0]["value"]
    assert "回款延期" in v and "数据异常" in v


def test_plan_levels_zero_item_no_summary():
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0)})
    plan = L.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    assert all(r["role"] != "supervisor" for r in plan["recipients"])


def test_plan_timesheet_item_levels_use_code_not_label():
    """★ 工时侧 counts 按【中文 label】聚合、配置按【英文 code】—— 映射错会静默不发汇总。"""
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 1)})
    plan = L.build_plan(
        [{"kind": "timesheet", "employId": _EMP, "start": "", "end": "",
          "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]}],
        cfg, _TREE, _PMIS)
    assert any(r["role"] == "supervisor" for r in plan["recipients"])


def test_summary_card_subtitle_is_neutral():
    """副标题固定「团队汇总」:合并卡里的行可能来自不同级别,写「直接上级」会自相矛盾。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1)})
    plan = L.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    card = next(r["card"] for r in plan["recipients"] if r["role"] == "supervisor")
    assert card["bodySubTitle"] == "团队汇总"


def test_level_helpers_removed():
    """_level_of / _LEVEL_LABELS 已随中性文案一并删除(顺带清 V4.0.0 的 M-2 技术债)。"""
    assert not hasattr(L, "_level_of")
    assert not hasattr(L, "_LEVEL_LABELS")
```

（`_TREE` / `_PMIS` / `_EMP` / `_SUP1` / `_SUP2` 用该文件既有夹具；若既有夹具的树深不足 2 级，扩展夹具而不是改断言。）

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_lanxin.py -k "item or mixed or neutral or removed" -v`
Expected: FAIL

- [ ] **Step 3: 新增两个辅助函数**

在 `_rollup` 之后加：

```python
def _merge_agg(dst: Dict[str, Dict[str, Dict[str, int]]],
               src: Dict[str, Dict[str, Dict[str, int]]]) -> None:
    """把一次 _rollup 的产出合并进累计结果(sup → owner → {标签: 计数} 三层就地相加)。"""
    for sup, owners in src.items():
        d = dst.setdefault(sup, {})
        for owner, counts in owners.items():
            c = d.setdefault(owner, {})
            for label, n in counts.items():
                c[label] = c.get(label, 0) + n


def _rollup_by_levels(counts_by_emp: Dict[str, Dict[str, int]],
                      label_levels: Dict[str, int],
                      tree: Dict[str, Any]) -> Dict[str, Dict[str, Dict[str, int]]]:
    """逐项配置版聚合:不同标签可能配不同的 supervisorLevels,按 levels 分组各卷一次再合并。
    V4.0.1 及以前是「一次 _rollup 传单个 levels」,表达不了「回款延期报到 +1、数据异常报到 +3」。
    _rollup 与 _descend_owner 本身不用改 —— 阻碍只在调用方式。"""
    groups: Dict[int, List[str]] = {}
    for label, lv in label_levels.items():
        if lv > 0:
            groups.setdefault(lv, []).append(label)
    agg: Dict[str, Dict[str, Dict[str, int]]] = {}
    for lv, labels in sorted(groups.items()):
        allow = set(labels)
        subset: Dict[str, Dict[str, int]] = {}
        for emp, counts in counts_by_emp.items():
            sub = {k: v for k, v in counts.items() if k in allow}
            if sub:
                subset[emp] = sub
        if subset:
            _merge_agg(agg, _rollup(subset, lv, tree))
    return agg


def _items_of(route: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """route → {code: item}。route 为 None(未配置/未启用)时返回空表。"""
    if not route:
        return {}
    return {i["code"]: i for i in (route.get("items") or [])}
```

- [ ] **Step 4: 改写 `build_plan`**

替换 `lanxin.py:196-302` 的整个 `build_plan`：

```python
def build_plan(items: List[Dict[str, Any]], cfg: Dict[str, Any],
               tree: Dict[str, Any], project_pmis: Dict[str, Any]) -> Dict[str, Any]:
    """事项 → 收件计划。纯计算,不发任何网络请求。
    项目侧:projectId → 项目经理(姓名) → 工号(后端自行推导,不信任前端);工时侧:employId 直连。
    V4.0.2 起每一项(问题码/关注原因)各自配 enabled/primary/supervisorLevels。"""
    unresolved: List[Dict[str, Any]] = []
    proj_by_emp: Dict[str, Dict[str, List[str]]] = {}
    ts_by_emp: Dict[str, List[Dict[str, Any]]] = {}
    ts_range = {"start": "", "end": ""}
    # 工时 counts 按【中文 label】聚合,而配置按【英文 code】——分桶时顺手建映射,
    # 不去 import ISSUE_LABELS:本次数据没出现的 code 也不需要映射(counts 里没有它)。
    ts_label_to_code: Dict[str, str] = {}

    r_proj = _route(cfg, "project")
    r_ts = _route(cfg, "timesheet")
    proj_items = _items_of(r_proj)
    ts_items = _items_of(r_ts)

    for it in items:
        kind = it.get("kind")
        if kind == "project" and r_proj:
            reasons = [x for x in (it.get("reasons") or [])
                       if (proj_items.get(x) or {}).get("enabled")]
            if not reasons:
                continue
            pid = it.get("projectId")
            pm = project_pmis.get(pid)
            if pm is None:
                unresolved.append({"kind": "project", "id": pid, "name": "", "reason": "项目不存在"})
                continue
            team = pm.get("team") or {}
            emp, why = resolve_project_manager(tree, team)
            if not emp:
                unresolved.append({"kind": "project", "id": pid,
                                   "name": str(team.get("项目经理") or ""), "reason": why})
                continue
            bucket = proj_by_emp.setdefault(emp, {})
            for r in reasons:
                bucket.setdefault(r, []).append(str(pm.get("projectName") or pid))
        elif kind == "timesheet" and r_ts:
            issues = [i for i in (it.get("issues") or [])
                      if (ts_items.get(i.get("code")) or {}).get("enabled")]
            if not issues:
                continue
            emp = str(it.get("employId") or "").strip().upper()
            if emp not in tree["byId"]:
                unresolved.append({"kind": "timesheet", "id": emp, "name": "",
                                   "reason": "工号不在花名册"})
                continue
            ts_by_emp.setdefault(emp, []).extend(issues)
            for i in issues:
                ts_label_to_code[i["label"]] = i["code"]
            ts_range["start"] = it.get("start") or ts_range["start"]
            ts_range["end"] = it.get("end") or ts_range["end"]

    recipients: List[Dict[str, Any]] = []
    by_id = tree["byId"]

    # ① primary 卡:只放 primary=True 的项;过滤后为空则不出卡
    if r_ts:
        for emp in sorted(ts_by_emp):
            mine = [i for i in ts_by_emp[emp]
                    if (ts_items.get(i.get("code")) or {}).get("primary")]
            if not mine:
                continue
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "card": build_timesheet_card(by_id[emp]["name"], mine,
                                             ts_range["start"], ts_range["end"]),
            })
    if r_proj:
        for emp in sorted(proj_by_emp):
            mine = {r: names for r, names in proj_by_emp[emp].items()
                    if (proj_items.get(r) or {}).get("primary")}
            if not mine:
                continue
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "card": build_project_card(by_id[emp]["name"], mine),
            })

    # ② 汇总卡:按 levels 分组多次卷、再按 sup/owner/标签三层合并。
    # 同一个 sup 被多项(可能不同级别)命中时只出【一张】卡 —— 「按人合并」在这里成立。
    # 副标题固定中性文案:一张卡里的行可能来自不同级别,写「直接上级」会自相矛盾。
    if r_ts:
        ts_counts = {emp: _sum_ts_counts(issues) for emp, issues in ts_by_emp.items()}
        ts_levels = {label: (ts_items.get(code) or {}).get("supervisorLevels", 0)
                     for label, code in ts_label_to_code.items()}
        agg = _rollup_by_levels(ts_counts, ts_levels, tree)
        for sup in sorted(agg):
            rows = [{"name": by_id[owner]["name"], "total": sum(counts.values()),
                     "reasons": list(counts.items())}
                    for owner, counts in agg[sup].items()]
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "card": build_summary_card(by_id[sup]["name"], rows, SUMMARY_SUBTITLE,
                                           unit="条", head_title="工时填报提醒",
                                           title_fmt="你的团队工时填报存在 %d 条问题",
                                           label_fn=short_issue),
            })
    if r_proj:
        proj_counts = {emp: {reason: len(names) for reason, names in by_reason.items()}
                       for emp, by_reason in proj_by_emp.items()}
        proj_levels = {code: (item or {}).get("supervisorLevels", 0)
                       for code, item in proj_items.items()}
        agg = _rollup_by_levels(proj_counts, proj_levels, tree)
        for sup in sorted(agg):
            rows = [{"name": by_id[owner]["name"], "total": sum(counts.values()),
                     "reasons": list(counts.items())}
                    for owner, counts in agg[sup].items()]
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "card": build_summary_card(by_id[sup]["name"], rows, SUMMARY_SUBTITLE),
            })

    return {"recipients": recipients, "unresolved": unresolved,
            "totals": {"recipients": len(recipients), "unresolved": len(unresolved)}}
```

- [ ] **Step 5: 删除级差文案相关代码**

- 删除 `_LEVEL_LABELS`（`lanxin.py:145-146`）
- 删除 `MAX_LEVELS_PROBE` 与 `_level_of()`（`lanxin.py:303-316`）
- 在 `_route` 之前新增常量：

```python
# 汇总卡副标题:逐项配置后一张卡里的行可能来自不同级别,写「直接上级（+1）」会自相矛盾。
# 顺带清掉 V4.0.0 终审记的 M-2(_level_of 取全局最小值、探测深度写死 5)。
SUMMARY_SUBTITLE = "团队汇总"
```

Run: `grep -rn "_level_of\|_LEVEL_LABELS\|MAX_LEVELS_PROBE" --include=*.py .` → 除 `lts/` 外应零命中。

- [ ] **Step 6: 运行测试确认通过**

Run: `python -m pytest tests/test_lanxin.py -v`
Expected: PASS。既有用例中用旧工厂 `_cfg(...)` 的会失败——把它们的配置构造改用 `_cfg_items(...)`，**断言实质不要改**（它们测的行为在新结构下依然应当成立）。改写后在报告里逐条列出。

- [ ] **Step 7: 变异验证「按 levels 分组」真的生效**

这是本任务最容易假绿的地方：

1. 把 `_rollup_by_levels` 的循环改成只取第一组（`for lv, labels in sorted(groups.items())[:1]:`）
2. Run: `python -m pytest tests/test_lanxin.py -k "mixed_levels" -v` → Expected: **FAIL**
3. 改回，确认 PASS

若第 2 步没红，说明用例没真正覆盖多级别混合，修到会红为止。

- [ ] **Step 8: 提交**

```bash
git add lanxin.py tests/test_lanxin.py
git commit -m "feat(lanxin): build_plan 按项聚合,支持逐项 supervisorLevels

从「一次 _rollup 传单个 levels」改为「按 levels 分组多次卷 + 三层合并」——
_rollup 与 _descend_owner 本身未改,阻碍只在调用方式。
同一上级被多项(可能不同级别)命中仍只收一张卡。
工时侧 counts 按中文 label 聚合而配置按英文 code,分桶时从数据建映射。
汇总卡副标题改中性「团队汇总」,删 _level_of/_LEVEL_LABELS(清 V4.0.0 的 M-2)。"
```

---

### Task B3: 蓝信前端逐项配置 UI

**Files:**
- Modify: `frontend/src/lib/lanxinApi.ts:4-11`（`LanxinRoute` 类型）
- Modify: `frontend/src/components/LanxinConfigCard.vue:98-114`（路由渲染）
- Modify: `frontend/src/components/LanxinPushDrawer.vue:33-48`（`buildItems`）
- Test: `frontend/src/components/LanxinConfigCard.test.ts`、`LanxinPushDrawer.test.ts`

**Interfaces:**
- Consumes（B1 产出）：route 的 `items: [{code, enabled, primary, supervisorLevels}]`，`recipients`/`issueCodes`/`reasons` 已不存在
- Produces: 无

- [ ] **Step 1: 写失败测试**

`LanxinConfigCard.test.ts` 追加（mock 配置改为新结构；既有 mock 与挂载写法以文件现状为准）：

```ts
describe('V4.0.2 逐项配置', () => {
  it('每条路由渲染成逐项表格,行数 = 白名单全集', async () => {
    const w = await mountCard()
    const rows = w.findAll('[data-test="lx-item-row"]')
    expect(rows.length).toBe(16)      // 工时 8 + 项目 8
  })

  it('每行有启用/发本人/汇总级别三个控件', async () => {
    const w = await mountCard()
    const row = w.findAll('[data-test="lx-item-row"]')[0]
    expect(row.find('[data-test="lx-item-enabled"]').exists()).toBe(true)
    expect(row.find('[data-test="lx-item-primary"]').exists()).toBe(true)
    expect(row.find('[data-test="lx-item-levels"]').exists()).toBe(true)
  })

  it('未启用的项仍然渲染 —— 否则取消启用后就再也开不回来', async () => {
    const w = await mountCard({ tsDisabledCode: 'HINT_PRESALE_PRODUCT' })
    expect(w.html()).toContain('售前服务类产品类别不应为「其他」')
  })

  it('保存时把 items 原样回传', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    const payload = (saveLanxinConfig as any).mock.calls[0][0]
    expect(Array.isArray(payload.routes[0].items)).toBe(true)
    expect(payload.routes[0].items[0]).toHaveProperty('supervisorLevels')
  })
})
```

`LanxinPushDrawer.test.ts` 追加：

```ts
it('buildItems 只取 enabled 的项', async () => {
  // 配置里工时仅 MISS_SUMMARY 启用 → 预览请求里的 items 只应含该码
  const w = await mountDrawer({ tsEnabledCodes: ['MISS_SUMMARY'] })
  await flushPromises()
  const sent = (lanxinPreview as any).mock.calls[0][0]
  const ts = sent.filter((x: any) => x.kind === 'timesheet')
  for (const it of ts) {
    for (const i of it.issues) expect(i.code).toBe('MISS_SUMMARY')
  }
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/LanxinConfigCard.test.ts src/components/LanxinPushDrawer.test.ts -t 'V4.0.2'`
Expected: FAIL

- [ ] **Step 3: 改类型**

`frontend/src/lib/lanxinApi.ts` 的 `LanxinRoute` 改为：

```ts
export interface LanxinRouteItem {
  code: string
  enabled: boolean
  primary: boolean
  supervisorLevels: number
}

export interface LanxinRoute {
  key: string
  label: string
  enabled: boolean
  items: LanxinRouteItem[]
}
```

- [ ] **Step 4: 改配置卡 UI**

`LanxinConfigCard.vue` 的路由渲染段（`v-for="r in cfg.routes"` 那块）替换为：

```html
<div v-for="r in cfg.routes" :key="r.key" class="lx-route">
  <div class="lx-route-head">
    <span class="dv-label">{{ r.label }}</span>
    <el-switch v-model="r.enabled" />
  </div>
  <table class="lx-items">
    <thead>
      <tr><th>{{ r.key === 'timesheet' ? '问题类型' : '关注原因' }}</th>
          <th>启用</th><th>发本人</th><th>汇总级别</th></tr>
    </thead>
    <tbody>
      <tr v-for="it in r.items" :key="it.code" data-test="lx-item-row">
        <td class="lx-item-name">{{ codeLabel(r.key, it.code) }}</td>
        <td><el-checkbox v-model="it.enabled" data-test="lx-item-enabled" /></td>
        <td><el-checkbox v-model="it.primary" :disabled="!it.enabled" data-test="lx-item-primary" /></td>
        <td>
          <el-select v-model="it.supervisorLevels" size="small" style="width: 150px"
            :disabled="!it.enabled" data-test="lx-item-levels">
            <el-option v-for="o in LEVEL_OPTS" :key="o.v" :value="o.v" :label="o.t" />
          </el-select>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

`codeLabel` 把 code 翻成展示名（工时查 `ISSUE_LABELS`，项目的 code 本身就是中文）：

```ts
function codeLabel(routeKey: string, code: string): string {
  return routeKey === 'timesheet' ? (ISSUE_LABELS[code] ?? code) : code
}
```

样式只用设计令牌：

```css
.lx-items { width: 100%; border-collapse: collapse; margin-top: var(--sp-2); }
.lx-items th, .lx-items td { padding: var(--sp-1) var(--sp-2); text-align: left; font-size: var(--fs-1); }
.lx-items th { color: var(--mut); font-weight: 600; }
.lx-items tbody tr:hover { background: var(--hover-tint); }
.lx-item-name { color: var(--txt); }
```

**未启用的项仍然渲染**（只是 `primary` 与 `supervisorLevels` 置灰）——V4.0.0 踩过「拿已勾选子集当选项源，取消后再也勾不回来」的坑。

- [ ] **Step 5: 改预览抽屉的 `buildItems`**

`LanxinPushDrawer.vue` 里两处取白名单的写法改为从 `items` 派生：

```ts
const rProj = cfg.routes.find((r) => r.key === 'project')
if (rProj?.enabled && data.data) {
  const allow = (rProj.items ?? []).filter((i) => i.enabled).map((i) => i.code)
  out.push(...projectItems(data.data.projects ?? [], (data.data.projectPmis ?? {}) as never, allow))
}
const rTs = cfg.routes.find((r) => r.key === 'timesheet')
if (rTs?.enabled && yitian.data) {
  const allow = (rTs.items ?? []).filter((i) => i.enabled).map((i) => i.code)
  const rows = issueRows(yitian.data, '', '', [], yitianSettings.settings.excludedTypes ?? [])
  out.push(...timesheetItems(rows, allow,
                             yitian.data.meta.periodStart ?? '', yitian.data.meta.periodEnd ?? ''))
}
```

`lib/lanxin/items.ts` 的两个函数签名**不变**（仍收 `allowedCodes: string[]`），不要动那个文件。

- [ ] **Step 6: 运行测试与 typecheck**

Run: `cd frontend && npx vitest run src/components/LanxinConfigCard.test.ts src/components/LanxinPushDrawer.test.ts && npm run typecheck`
Expected: PASS / 0 error。既有用例中构造旧结构 mock 的，改为新结构，断言实质保留。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/lanxinApi.ts frontend/src/components/LanxinConfigCard.vue frontend/src/components/LanxinConfigCard.test.ts frontend/src/components/LanxinPushDrawer.vue frontend/src/components/LanxinPushDrawer.test.ts
git commit -m "feat(lanxin): 配置卡改逐项表格

每项一行:启用/发本人/汇总级别。未启用的项仍然渲染(只置灰后两个控件)——
拿已勾选子集当选项源会导致取消后再也勾不回来(V4.0.0 踩过)。
buildItems 改从 items.filter(enabled) 派生白名单,items.ts 签名不变。"
```

---

### Task T9: 收尾——版本号、文档、全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`
- Create: `deploy/升级手册-V4.0.2.md`

**Interfaces:**
- Consumes: A1..A4 与 B1..B3 全部产出
- Produces: 可交付版本

- [ ] **Step 1: 改版本号**

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V4.0.2'
export const RELEASE_DATE = '2026-07-19'
```

- [ ] **Step 2: 跑全量验证**

Run: `bash verify.sh`
Expected: 全绿。任何一项不绿就停下修，不要继续。

- [ ] **Step 3: 真实数据迁移演练（不能省）**

两处迁移都作用于**现网存量文件**，只有拿真实文件跑过才算数。

```bash
# 备份现网两份配置
cp data/temp_followup.json /tmp/temp_followup.bak.json
cp data/lanxin_config.json /tmp/lanxin_config.bak.json 2>/dev/null || echo "(蓝信配置尚未创建,跳过)"

# 起服务
python server.py
```

1. 浏览器进 `/projects/temp`，确认：
   - 出现**一个**名为「默认跟进」的选项卡
   - **3 条归档全在**（1 / 75 / 21 行），条数与行数与升级前一致
   - 「范围设置」里原有的 `orgL4 in [7 个 L4 组]` 条件**仍在且生效**，项目数与升级前一致
   - **选列与排序保持升级前的样子**（这是 key 迁移是否成功的直接证据；若回落到默认列，说明迁移没跑）
2. 新建一个实例「验证用」，确认它的范围是空的、归档为空；在它里面填一条进展，切回「默认跟进」确认那条进展**不在**
3. 删除「验证用」实例，确认二次确认弹窗写明了归档条数
4. 进 `/data` →「配置」签，确认蓝信推送卡渲染成**逐项表格**、16 行齐全，且各项的「发本人 / 汇总级别」与升级前的路由级设置一致（工时汇总 0 / 项目汇总 1）
5. 停服务，`git diff` 确认 `data/` 未被提交

- [ ] **Step 4: 写升级手册**

创建 `deploy/升级手册-V4.0.2.md`，比照 `deploy/升级手册-V4.0.1.md` 的结构。**头号注意必须包含**：

> **⚠ 升级前请手动备份 `data/temp_followup.json` 与 `data/lanxin_config.json`。**
> 这两份文件会在首次读取时**自动迁移**成新结构，并随下一次写入落盘。**一旦落盘就无法用 V4.0.1 读取**——旧版会把新结构当损坏文件降级成空 store，**归档会看起来「丢了」**。回滚前必须先还原备份。

其余须覆盖：
- 本版**无需点「更新数据」**（两处都不进数据管线）
- 需要**重启后端**（改了 `temp_followup.py` / `lanxin.py` / `lanxin_config.py` / `server.py` / `audit.py`）
- 无新增页面 / 路由 / pageKey / 授权项
- `/projects/temp` 的变化：多了实例选项卡；原有内容全部落在「默认跟进」里；**选列与排序已自动迁移**，若发现回落到默认列请反馈
- 蓝信配置卡的变化：从「一组复选框 + 一个汇总下拉」变为**逐项表格**；**升级后的推送行为与升级前完全一致**（迁移时每项都继承了原路由的设置），需要细分时再逐项调整
- 回滚步骤：还原 `.py` + `dist` + **两份 data 备份**，再重启

- [ ] **Step 5: 更新 PROGRESS.md**

在版本史顶部新增 V4.0.2 条目（把现有「当前版本：**V4.0.1**」一行改为「上一版本」，正文一字不动），记录：两处数据迁移的判据与无损要求、`followup_store` 未改的理由、持久化 key 迁移（V4.0.1 I-1 同款陷阱第二次）、`build_plan` 从单 levels 改为按 levels 分组合并、汇总卡中性文案顺带清 M-2。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md deploy/升级手册-V4.0.2.md
git commit -m "chore(release): V4.0.2

临时跟进多实例化 + 蓝信路由逐项拆分。
⚠ 升级前须备份 data/temp_followup.json 与 data/lanxin_config.json:
两者首次读取即自动迁移、随下次写入落盘,落盘后无法用 V4.0.1 读取。"
```

---

## 附：审查者重点

除各任务的 spec 符合性外，本版有六处值得单独盯：

1. **`followup_store.py` 是否被改动**（全局约束 3）。它是四域共用引擎，`git diff --stat` 里出现这个文件就要问为什么。
2. **两处迁移的判据**是否写成了版本号比较。应为「缺 `instances` 键」「缺 `items` 键」——写 `version != 2` 会让将来的 v3 被当旧版回迁。
3. **`instanceId` 不存在时是否静默落到第一个实例**。必须 400。静默降级会让 A 实例的进展出现在 B 实例，而且不报错。
4. **持久化 key 迁移是否带标记位**（Task A4）。没有标记位，用户之后自己改的列配置会被旧值反复覆盖，比不迁移更糟。
5. **蓝信迁移的行为等价性**（Task B1 的 `test_migrate_legacy_routes_preserves_behavior`）。这是「管理员不动配置就没有行为变化」的唯一硬保证。
6. **工时侧 label/code 映射**（Task B2）。counts 按中文 label 聚合、配置按英文 code，映射错的表现是**汇总静默不发**——没有报错、没有异常，只是少了几张卡。
