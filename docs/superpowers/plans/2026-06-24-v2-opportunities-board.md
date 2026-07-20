# V2.0.0 子项目二实现计划：/opportunities 重点商机进展（线上可编辑表格）

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。
> spec: docs/superpowers/specs/2026-06-24-v2-opportunities-board-design.md

**Goal:** 「重点跟进」分区下新增 `/opportunities` 线上可编辑商机台账：后端 JSON 持久化 + 超管专属写 + 普通管理员 L4 只读隔离 + input xlsx 初始数据。

**Architecture:** 领域纯函数 `opportunities.py` + 薄 server.py 处理器(GET 只读 L4 过滤; create/update/delete/import 超管专属) + 本地 `data/opportunities.json` + 前端 store/api/columns/EditDrawer/View，复用 ColumnPicker/ColumnFilter/crossFilter/exportRows/useColumnPrefs。

**Tech Stack:** Python 标准库 + openpyxl；Vue3 `<script setup>` + TS + Pinia + Element Plus + vitest + pytest。

## Global Constraints
- 无 emoji；设计令牌 `var(--*)`，控件宽度内联 px 属既有惯例。
- 写操作必须有 toast 结果反馈（尤其导入）。
- 版本号本子项目**不** bump（V2.0.0 集成阶段统一改）。
- TDD：先测试看红再实现。后端纯函数 pytest；前端 vitest。server.py 薄处理器按项目惯例由 py_compile+ruff+域测试守，不单测 HTTP。
- 双模式：新端点只走 HTTP 路由(单路径)，文件读写一律用 `BASE_DIR`(已 frozen-aware)；input xlsx 走 `BASE_DIR/input`。
- L4 隔离：普通管理员的 GET 已被后端按 `allowedL4` 裁剪；前端不得持有越权数据，仅按 `auth.isSuper` 显隐写 UI。
- 11 个 L4 下拉值必须与真实 orgL4 取值**逐字一致**：小金融服务组/银行服务组/运营商服务组/京津服务组/河北服务组/广东二服务组/辽宁服务组/浙江服务组/上海一服务组/黑龙江服务组/吉林服务组。
- 商机表所有下拉选项（见 spec 列表）逐字照用。

---

### Task 1: 后端领域模块 opportunities.py（纯函数 + pytest）

**Files:**
- Create: `opportunities.py`
- Test: `tests/test_opportunities.py`

**Interfaces — Produces:**
- `FIELDS: tuple[str,...]`（22 可编辑字段白名单）
- `HEADER_TO_FIELD: dict[str,str]`
- `new_row(rid:str)->dict`、`apply_create(store,now_date)->dict`
- `apply_update(store, rid, fields, account, now_date, now_dt)->dict|None`
- `apply_delete(store, ids)->int`
- `filter_for_account(rows, allowed_l4, is_super)->list`
- `read_opportunities_xlsx(path:str)->list[dict]`（内部用 `projects._read_header_sheet`）

- [ ] **Step 1: 写失败测试**

`tests/test_opportunities.py`：
```python
import openpyxl
import opportunities as opp


def _store():
    return {"version": 1, "seq": 0, "rows": []}


def test_new_row_blank_has_all_fields():
    r = opp.new_row("opp-1")
    assert r["id"] == "opp-1"
    for f in opp.FIELDS:
        assert f in r and r[f] == "" or f == "amountWan"
    assert r["amountWan"] == "" and r["firstReg"] == "" and r["lastUpdate"] == ""


def test_apply_create_increments_seq():
    s = _store()
    a = opp.apply_create(s, "2026-06-24")
    b = opp.apply_create(s, "2026-06-24")
    assert s["seq"] == 2 and a["id"] == "opp-1" and b["id"] == "opp-2"
    assert len(s["rows"]) == 2


def test_apply_update_stamps_firstreg_only_when_content_then_lastupdate_each_time():
    s = _store()
    opp.apply_create(s, "2026-06-24")  # opp-1, 空
    # 首次写入有内容 → firstReg 盖
    r = opp.apply_update(s, "opp-1", {"customer": "甲公司"}, "admin", "2026-06-24", "2026-06-24 10:00")
    assert r["customer"] == "甲公司"
    assert r["firstReg"] == "2026-06-24"
    assert r["lastUpdate"] == "2026-06-24 10:00" and r["lastUpdateBy"] == "admin"
    # 二次更新 → firstReg 不变, lastUpdate 刷新
    r2 = opp.apply_update(s, "opp-1", {"status": "招投标"}, "admin", "2026-06-25", "2026-06-25 09:00")
    assert r2["firstReg"] == "2026-06-24" and r2["lastUpdate"] == "2026-06-25 09:00"


def test_apply_update_firstreg_not_set_when_all_blank():
    s = _store(); opp.apply_create(s, "2026-06-24")
    r = opp.apply_update(s, "opp-1", {"customer": ""}, "admin", "2026-06-24", "2026-06-24 10:00")
    assert r["firstReg"] == ""  # 无内容不盖首登
    assert r["lastUpdate"] == "2026-06-24 10:00"


def test_apply_update_rejects_unknown_field_and_missing_row():
    s = _store(); opp.apply_create(s, "2026-06-24")
    r = opp.apply_update(s, "opp-1", {"evil": "x", "id": "hack"}, "admin", "d", "t")
    assert "evil" not in r and r["id"] == "opp-1"  # 非 FIELDS 被拒
    assert opp.apply_update(s, "nope", {"customer": "x"}, "admin", "d", "t") is None


def test_apply_update_parses_amount_and_dates():
    s = _store(); opp.apply_create(s, "2026-06-24")
    r = opp.apply_update(s, "opp-1", {"amountWan": "1,200.5", "bidDate": "2026-07-01 00:00:00"}, "a", "d", "t")
    assert r["amountWan"] == 1200.5 and r["bidDate"] == "2026-07-01"


def test_apply_delete():
    s = _store(); opp.apply_create(s, "d"); opp.apply_create(s, "d")
    assert opp.apply_delete(s, ["opp-1"]) == 1
    assert [r["id"] for r in s["rows"]] == ["opp-2"]


def test_filter_for_account():
    rows = [{"id": "1", "l4": "小金融服务组"}, {"id": "2", "l4": "银行服务组"}]
    assert len(opp.filter_for_account(rows, [], True)) == 2          # 超管全看
    assert len(opp.filter_for_account(rows, ["*"], False)) == 2       # '*' 全看
    assert [r["id"] for r in opp.filter_for_account(rows, ["小金融服务组"], False)] == ["1"]
    assert opp.filter_for_account(rows, [], False) == []             # 空 allowedL4 → 无


def test_read_xlsx_maps_headers(tmp_path):
    p = tmp_path / "opportunities.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["客户名称", "L4组织", "商机状态", "预估金额（万元）"])
    ws.append(["甲公司", "小金融服务组", "招投标", 320])
    wb.save(p)
    rows = opp.read_opportunities_xlsx(str(p))
    assert len(rows) == 1
    assert rows[0]["customer"] == "甲公司" and rows[0]["l4"] == "小金融服务组"
    assert rows[0]["status"] == "招投标" and rows[0]["amountWan"] == 320.0
    assert rows[0]["id"] == "opp-1"


def test_read_xlsx_missing_file():
    assert opp.read_opportunities_xlsx("nonexistent.xlsx") == []
```

- [ ] **Step 2: 跑测试确认红**
Run: `python -m pytest tests/test_opportunities.py -q`
Expected: FAIL（opportunities 模块不存在）

- [ ] **Step 3: 实现 opportunities.py**

```python
"""重点商机进展(线上可编辑表格)领域纯函数:xlsx 解析/建行/改行/删行/L4 过滤。
可单测,不依赖 server。复用 projects._read_header_sheet 读 xlsx。"""
from __future__ import annotations
from typing import Any, Dict, List, Optional

# 22 个可编辑业务字段(白名单;update 只接受其中字段)
FIELDS = (
    'l4', 'salesOwner', 'customer', 'industry', 'top1000', 'status', 'forecast',
    'name', 'amountWan', 'expectedDate', 'productCategory', 'mainProducts',
    'outsource', 'frOwner', 'frMatch', 'deliveryMatch', 'crossRegion',
    'keyOpp', 'earlyIntervene', 'remark', 'bidStatus', 'bidDate',
)
_DATE_FIELDS = ('expectedDate', 'bidDate')

# 中文列名 → field key(xlsx 解析/导出回读)
HEADER_TO_FIELD = {
    'L4组织': 'l4', '销售负责人': 'salesOwner', '客户名称': 'customer', '行业归属': 'industry',
    '是否TOP1000客户': 'top1000', '商机状态': 'status', '主观预测': 'forecast',
    '商机名称/项目名称': 'name', '预估金额（万元）': 'amountWan', '预估落单时间': 'expectedDate',
    '产品大类': 'productCategory', '主要涉及产品': 'mainProducts', '是否含外包外采': 'outsource',
    'FR负责人': 'frOwner', 'FR能力是否匹配': 'frMatch', '交付资源是否匹配': 'deliveryMatch',
    '是否需要外区域支持': 'crossRegion', '是否重点商机': 'keyOpp', '是否提前介入': 'earlyIntervene',
    '当前进展/风险说明/情况备注': 'remark', '实际中标状态': 'bidStatus', '中标日期': 'bidDate',
    '首次登记日期': 'firstReg', '最后一次更新日期': 'lastUpdate',
}


def _s(v: Any) -> str:
    return '' if v is None else str(v).strip()


def _date10(v: Any) -> str:
    if v is None:
        return ''
    iso = getattr(v, 'isoformat', None)
    if callable(iso):
        return iso()[:10]
    s = str(v).strip()
    return s[:10] if s else ''


def _num(v: Any):
    if v is None or v == '':
        return ''
    try:
        return float(str(v).replace(',', '').strip())
    except (ValueError, TypeError):
        return ''


def new_row(rid: str) -> Dict[str, Any]:
    row: Dict[str, Any] = {'id': rid}
    for f in FIELDS:
        row[f] = ''
    row['firstReg'] = ''
    row['lastUpdate'] = ''
    row['lastUpdateBy'] = ''
    return row


def _has_content(row: Dict[str, Any]) -> bool:
    return any(_s(row.get(f)) for f in FIELDS)


def apply_create(store: Dict[str, Any], now_date: str) -> Dict[str, Any]:
    store['seq'] = int(store.get('seq', 0)) + 1
    row = new_row('opp-%d' % store['seq'])
    store.setdefault('rows', []).append(row)
    return row


def apply_update(store, rid, fields, account, now_date, now_dt) -> Optional[Dict[str, Any]]:
    target = next((r for r in store.get('rows', []) if r.get('id') == rid), None)
    if target is None:
        return None
    for k, v in (fields or {}).items():
        if k not in FIELDS:
            continue
        if k == 'amountWan':
            target[k] = _num(v)
        elif k in _DATE_FIELDS:
            target[k] = _date10(v)
        else:
            target[k] = _s(v)
    if not _s(target.get('firstReg')) and _has_content(target):
        target['firstReg'] = now_date
    target['lastUpdate'] = now_dt
    target['lastUpdateBy'] = account
    return target


def apply_delete(store, ids) -> int:
    idset = set(ids or [])
    rows = store.get('rows', [])
    before = len(rows)
    store['rows'] = [r for r in rows if r.get('id') not in idset]
    return before - len(store['rows'])


def filter_for_account(rows, allowed_l4, is_super) -> List[dict]:
    if is_super:
        return list(rows or [])
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return list(rows or [])
    return [r for r in (rows or []) if _s(r.get('l4')) in allow]


def read_opportunities_xlsx(path: str) -> List[dict]:
    from projects import _read_header_sheet
    raw = _read_header_sheet(path, '客户名称')
    out: List[dict] = []
    for i, r in enumerate(raw, start=1):
        row = new_row('opp-%d' % i)
        for header, field in HEADER_TO_FIELD.items():
            if header not in r:
                continue
            v = r[header]
            if field == 'amountWan':
                row[field] = _num(v)
            elif field in _DATE_FIELDS or field == 'firstReg':
                row[field] = _date10(v)
            else:
                row[field] = _s(v)
        out.append(row)
    return out
```

- [ ] **Step 4: 跑测试确认绿** — `python -m pytest tests/test_opportunities.py -q` → PASS
- [ ] **Step 5: ruff + commit**
Run: `python -m ruff check opportunities.py tests/test_opportunities.py`
```bash
git add opportunities.py tests/test_opportunities.py
git commit -m "$(printf 'feat(opp): 商机进展领域纯函数(解析/建/改/删/L4过滤)+pytest\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: server.py 端点接线 + 超管门禁 + gitignore

**Files:**
- Modify: `server.py`（持久化 helper、5 处理器、`do_GET`/`do_POST` 路由、`_SUPER_ONLY_PATHS`）
- Modify: `.gitignore`

**Interfaces — Consumes:** Task 1 的 opportunities 模块；既有 `_save_progress`/`handle_progress_*`/`handle_inputs_upload`/`_authz_gate`/`auth.validate_session`/`auth.load_accounts` 范式。

**实现指引（实现者先读 server.py 这些范式段：262-305 progress helper、890-939 progress 处理器、982- handle_inputs_upload、149-158 _SUPER_ONLY_PATHS、1128-1172 handle_data_json+_authz_gate+_require_super，逐一镜像）：**

- [ ] **Step 1: 持久化 helper（镜像 progress）**

在 progress helper 段后加：
```python
import opportunities as _opp  # 顶部 import 区

OPPORTUNITIES_FILE = os.path.join(BASE_DIR, 'data', 'opportunities.json')
OPP_INPUT_NAMES = ('opportunities.xlsx', 'opportunitites.xlsx')  # 后者兼容用户原文笔误
_opp_lock = threading.Lock()


def _load_opportunities():
    """有 json → load;否则从 input xlsx seed(两种文件名都试),建 store 并落盘。"""
    if os.path.exists(OPPORTUNITIES_FILE):
        try:
            with open(OPPORTUNITIES_FILE, 'r', encoding='utf-8') as f:
                store = json.load(f)
            if isinstance(store, dict):
                store.setdefault('version', 1)
                store.setdefault('seq', len(store.get('rows', [])))
                store.setdefault('rows', [])
                return store
        except Exception:
            pass
    # seed from input xlsx
    rows = []
    for name in OPP_INPUT_NAMES:
        p = os.path.join(BASE_DIR, 'input', name)
        if os.path.exists(p):
            rows = _opp.read_opportunities_xlsx(p)
            break
    store = {"version": 1, "seq": len(rows), "rows": rows}
    _save_opportunities(store)
    return store


def _save_opportunities(store):
    with _opp_lock:
        os.makedirs(os.path.dirname(OPPORTUNITIES_FILE), exist_ok=True)
        tmp = OPPORTUNITIES_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
        os.replace(tmp, OPPORTUNITIES_FILE)
```
> `_load_opportunities` 内引用了 `_save_opportunities`，但在 Python 中函数体到调用时才解析名字，模块级两者先后定义皆可（与 progress 同模块即可）。时间串由处理器的 `self._opp_now()` 方法产出（见 Step 2）。

- [ ] **Step 2: 5 个处理器（镜像 handle_progress_*）**

> **已核对 server.py 真实工具名（逐字照用）**：成功响应用 `self._json_response(payload)`（自动 200）；错误用 `self._send_json(status, _error_payload(CODE, msg))`；读 JSON body 用 `self._read_json_body()`（返回 dict 或 None）；读上传**原始字节**用 `length=int(self.headers.get('Content-Length',0)); body=self.rfile.read(length)`（既有 `handle_inputs_upload` 就是裸字节，**非** multipart）。错误码常量：`ERR_AUTH`(未登录)、`ERR_NOT_FOUND`、`ERR_PARSE`、`ERR_VALIDATION`、`ERR_INTERNAL`。`datetime` 已在 server.py 顶部导入（progress 用 `datetime.now().strftime(...)`），勿重复 import。

```python
def _session_account_rec(self):
    token = auth.parse_cookie_token(self.headers.get('Cookie'))
    account = auth.validate_session(token)
    rec = auth.load_accounts().get('users', {}).get(account) if account else None
    return account, rec


def _opp_now(self):
    n = datetime.now()
    return n.strftime('%Y-%m-%d'), n.strftime('%Y-%m-%d %H:%M')


def handle_opportunities_get(self):
    account, rec = self._session_account_rec()
    if not rec:
        self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
        return
    try:
        store = _load_opportunities()
        rows = _opp.filter_for_account(store.get('rows', []), rec.get('allowedL4', []), bool(rec.get('isSuper')))
        self._json_response({"rows": rows})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"读取商机失败: {e}"))


def handle_opportunities_create(self):  # 超管(由 _authz_gate 拦)
    try:
        store = _load_opportunities()
        now_date, _ = self._opp_now()
        row = _opp.apply_create(store, now_date)
        _save_opportunities(store)
        self._json_response({"row": row})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"新增商机失败: {e}"))


def handle_opportunities_update(self):  # 超管
    data = self._read_json_body()
    if data is None:
        self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
        return
    rid = str(data.get('id') or '').strip()
    fields = data.get('fields') or {}
    if not rid or not isinstance(fields, dict):
        self._send_json(400, _error_payload(ERR_VALIDATION, "id 必填、fields 须为对象"))
        return
    account, _ = self._session_account_rec()
    try:
        store = _load_opportunities()
        now_date, now_dt = self._opp_now()
        row = _opp.apply_update(store, rid, fields, account, now_date, now_dt)
        if row is None:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, f"商机不存在: {rid}"))
            return
        _save_opportunities(store)
        self._json_response({"row": row})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"保存商机失败: {e}"))


def handle_opportunities_delete(self):  # 超管
    data = self._read_json_body()
    if data is None or not isinstance(data.get('ids'), list):
        self._send_json(400, _error_payload(ERR_VALIDATION, "ids 须为数组"))
        return
    account, rec = self._session_account_rec()
    try:
        store = _load_opportunities()
        _opp.apply_delete(store, data['ids'])
        _save_opportunities(store)
        rows = _opp.filter_for_account(store.get('rows', []), rec.get('allowedL4', []), bool(rec.get('isSuper')))
        self._json_response({"rows": rows})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"删除商机失败: {e}"))


def handle_opportunities_import(self):  # 超管:裸 xlsx 字节 → 整表替换(先备份)
    length = int(self.headers.get('Content-Length', 0))
    if length <= 0:
        self._send_json(400, _error_payload(ERR_VALIDATION, "缺少文件内容"))
        return
    body = self.rfile.read(length)
    # 替换前备份旧表
    if os.path.exists(OPPORTUNITIES_FILE):
        try:
            bak = OPPORTUNITIES_FILE.replace('.json', '.backup-%s.json' % datetime.now().strftime('%Y%m%d%H%M%S'))
            with open(OPPORTUNITIES_FILE, 'rb') as src, open(bak, 'wb') as dst:
                dst.write(src.read())
        except Exception:
            pass
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix='.xlsx')
    os.close(fd)
    try:
        with open(tmp, 'wb') as f:
            f.write(body)
        rows = _opp.read_opportunities_xlsx(tmp)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    try:
        store = {"version": 1, "seq": len(rows), "rows": rows}
        _save_opportunities(store)
        self._json_response({"rows": rows, "count": len(rows)})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"导入失败: {e}"))
```

- [ ] **Step 3: 路由分发**

`do_GET`（约 418 `elif parsed.path == '/api/progress'` 邻近）加：
```python
        elif parsed.path == '/api/opportunities':
            self.handle_opportunities_get()
```
`do_POST`（约 503-509 邻近）加：
```python
        elif parsed.path == '/api/opportunities/create':
            self.handle_opportunities_create()
        elif parsed.path == '/api/opportunities/update':
            self.handle_opportunities_update()
        elif parsed.path == '/api/opportunities/delete':
            self.handle_opportunities_delete()
        elif parsed.path == '/api/opportunities/import':
            self.handle_opportunities_import()
```

- [ ] **Step 4: 超管门禁**

`_SUPER_ONLY_PATHS`（149-158）frozenset 内加 4 个写端点（**不含** GET `/api/opportunities`）：
```python
    '/api/opportunities/create', '/api/opportunities/update',
    '/api/opportunities/delete', '/api/opportunities/import',
```

- [ ] **Step 5: .gitignore**
追加：
```
data/opportunities.json
data/opportunities.backup-*.json
```

- [ ] **Step 6: 验证 + commit**
Run: `python -m py_compile server.py opportunities.py && python -m ruff check server.py && python -m pytest -q`
Expected: 编译/ruff/全量 pytest 绿（pytest 不覆盖 HTTP，但确保无 import 破坏）。
```bash
git add server.py .gitignore
git commit -m "$(printf 'feat(opp): server 商机端点(GET只读L4过滤 + create/update/delete/import 超管) + seed/gitignore\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```
> 工具名已核对（见 Step 2 顶部说明）。处理器是 `BaseHTTPRequestHandler` 子类的方法，须缩进到类体内、与 `handle_progress_*` 同级；`_session_account_rec`/`_opp_now` 也作为该类方法（`self.`）。`_load/_save_opportunities`/`OPPORTUNITIES_FILE`/`OPP_INPUT_NAMES`/`_opp_lock` 是模块级（与 `_load_progress` 同级）。`import opportunities as _opp` 放模块顶部 import 区。

---

### Task 3: 前端列定义 + 选项单一来源 + recentUpdateOf（lib + vitest）

**Files:**
- Create: `frontend/src/lib/opportunityColumns.ts`
- Test: `frontend/src/lib/opportunityColumns.test.ts`

**Interfaces — Produces:**
- `OPP_COLUMNS: OppColumn[]`、`OPP_FIELDS: string[]`、`L4_OPTIONS`、各 select `options`
- `DEFAULT_VISIBLE: string[]`、`FILTERABLE: Set<string>`
- `recentUpdateOf(lastUpdate: string, now: Date): '是'|'否'`

- [ ] **Step 1: 写失败测试**
```ts
import { describe, it, expect } from 'vitest'
import { recentUpdateOf, OPP_COLUMNS, OPP_FIELDS, L4_OPTIONS } from './opportunityColumns'

describe('opportunityColumns', () => {
  it('L4 11 项与真实 orgL4 一致', () => {
    expect(L4_OPTIONS).toEqual(['小金融服务组','银行服务组','运营商服务组','京津服务组','河北服务组','广东二服务组','辽宁服务组','浙江服务组','上海一服务组','黑龙江服务组','吉林服务组'])
  })
  it('OPP_FIELDS 22 个可编辑字段', () => {
    expect(OPP_FIELDS).toHaveLength(22)
    expect(OPP_FIELDS).toContain('l4'); expect(OPP_FIELDS).not.toContain('firstReg')
  })
  it('OPP_COLUMNS 含 25 列', () => { expect(OPP_COLUMNS).toHaveLength(25) })
  it('recentUpdateOf: ≤7天=是, >7天/空=否', () => {
    const now = new Date('2026-06-24T12:00:00')
    expect(recentUpdateOf('2026-06-24 09:00', now)).toBe('是')
    expect(recentUpdateOf('2026-06-18', now)).toBe('是')   // 6 天前
    expect(recentUpdateOf('2026-06-17', now)).toBe('是')   // 7 天前(边界含)
    expect(recentUpdateOf('2026-06-16', now)).toBe('否')   // 8 天前
    expect(recentUpdateOf('', now)).toBe('否')
  })
})
```

- [ ] **Step 2: 跑测试确认红** — `cd frontend && npx vitest run src/lib/opportunityColumns.test.ts` → FAIL

- [ ] **Step 3: 实现 opportunityColumns.ts**
```ts
export type OppColType = 'text' | 'number' | 'date' | 'select' | 'auto' | 'derived'
export interface OppColumn {
  key: string; label: string; type: OppColType
  options?: string[]; width?: number; wrap?: boolean; sortable?: boolean; filterable?: boolean
}

export const L4_OPTIONS = ['小金融服务组','银行服务组','运营商服务组','京津服务组','河北服务组','广东二服务组','辽宁服务组','浙江服务组','上海一服务组','黑龙江服务组','吉林服务组']
const TOP1000_OPTIONS = ['TOP1000','非TOP1000','其他非指名']
const STATUS_OPTIONS = ['方案设计沟通','售前测试','意向沟通','招投标','商务谈判','需求确认','合同签约','赢单','丢单','进行中']
const FORECAST_OPTIONS = ['可参与','可承诺','可争取','赢单']
const YN = ['是','否']
const BID_OPTIONS = ['已中标','未中标','待定']

export const OPP_COLUMNS: OppColumn[] = [
  { key: 'l4', label: 'L4组织', type: 'select', options: L4_OPTIONS, width: 130, filterable: true },
  { key: 'salesOwner', label: '销售负责人', type: 'text', width: 110, filterable: true },
  { key: 'customer', label: '客户名称', type: 'text', width: 180, wrap: true },
  { key: 'industry', label: '行业归属', type: 'text', width: 120, filterable: true },
  { key: 'top1000', label: '是否TOP1000客户', type: 'select', options: TOP1000_OPTIONS, width: 140, filterable: true },
  { key: 'status', label: '商机状态', type: 'select', options: STATUS_OPTIONS, width: 120, filterable: true },
  { key: 'forecast', label: '主观预测', type: 'select', options: FORECAST_OPTIONS, width: 110, filterable: true },
  { key: 'name', label: '商机名称/项目名称', type: 'text', width: 200, wrap: true },
  { key: 'amountWan', label: '预估金额(万元)', type: 'number', width: 120, sortable: true },
  { key: 'expectedDate', label: '预估落单时间', type: 'date', width: 130, sortable: true },
  { key: 'productCategory', label: '产品大类', type: 'text', width: 120, filterable: true },
  { key: 'mainProducts', label: '主要涉及产品', type: 'text', width: 160, wrap: true },
  { key: 'outsource', label: '是否含外包外采', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'frOwner', label: 'FR负责人', type: 'text', width: 110, filterable: true },
  { key: 'frMatch', label: 'FR能力是否匹配', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'deliveryMatch', label: '交付资源是否匹配', type: 'select', options: YN, width: 130, filterable: true },
  { key: 'crossRegion', label: '是否需要外区域支持', type: 'select', options: YN, width: 140, filterable: true },
  { key: 'keyOpp', label: '是否重点商机', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'earlyIntervene', label: '是否提前介入', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'remark', label: '当前进展/风险说明/情况备注', type: 'text', width: 240, wrap: true },
  { key: 'bidStatus', label: '实际中标状态', type: 'select', options: BID_OPTIONS, width: 120, filterable: true },
  { key: 'bidDate', label: '中标日期', type: 'date', width: 120, sortable: true },
  { key: 'firstReg', label: '首次登记日期', type: 'auto', width: 120, sortable: true },
  { key: 'lastUpdate', label: '最后一次更新日期', type: 'auto', width: 150, sortable: true },
  { key: 'recentUpdate', label: '是否近7天更新', type: 'derived', width: 120, filterable: true },
]

export const OPP_FIELDS = OPP_COLUMNS.filter((c) => !['auto', 'derived'].includes(c.type)).map((c) => c.key)

export const DEFAULT_VISIBLE = ['l4','salesOwner','customer','top1000','status','forecast','name','amountWan','expectedDate','bidStatus','lastUpdate','recentUpdate']
export const FILTERABLE = new Set(OPP_COLUMNS.filter((c) => c.filterable).map((c) => c.key))

/** lastUpdate 距今 ≤7 天→是;空/更早→否。比较按日期(取前 10 位)。 */
export function recentUpdateOf(lastUpdate: string, now: Date): '是' | '否' {
  const s = (lastUpdate || '').slice(0, 10)
  if (!s) return '否'
  const [y, m, d] = s.split('-').map(Number)
  if (!y) return '否'
  const lu = new Date(y, (m || 1) - 1, d || 1).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((today - lu) / 86400000)
  return days >= 0 && days <= 7 ? '是' : '否'
}
```
> 校验：OPP_FIELDS 应得 22（25 列 − firstReg/lastUpdate/recentUpdate 三个非编辑列）。

- [ ] **Step 4: 跑测试确认绿** — `npx vitest run src/lib/opportunityColumns.test.ts` → PASS
- [ ] **Step 5: typecheck + commit**
```bash
git add frontend/src/lib/opportunityColumns.ts frontend/src/lib/opportunityColumns.test.ts
git commit -m "$(printf 'feat(opp): 前端商机列定义/下拉选项单一来源 + recentUpdateOf 派生\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: 前端 api + store + 登入登出 reset 接线（lib/store + vitest）

**Files:**
- Create: `frontend/src/lib/opportunitiesApi.ts`、`frontend/src/stores/opportunities.ts`
- Test: `frontend/src/stores/opportunities.test.ts`
- Modify: 把 `useOpportunitiesStore().reset()` 接到既有 projectProgress.reset() 同处（登入/登出重置；实现者 grep `projectProgress).reset()` 或 `progress.reset()` 找调用点，**同处**加 opportunities reset）

**Interfaces — Produces:**
- `opportunitiesApi { list, create, update, remove, importFile }`
- `useOpportunitiesStore` → `{ rows, loaded, load, create, update, remove, importFile, reset }`

- [ ] **Step 1: 写失败测试**
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOpportunitiesStore } from './opportunities'
import * as apiMod from '@/lib/opportunitiesApi'

beforeEach(() => setActivePinia(createPinia()))

describe('opportunities store', () => {
  it('load 拉取 rows', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1', l4: '小金融服务组' }] } as any)
    const s = useOpportunitiesStore(); await s.load()
    expect(s.rows).toHaveLength(1); expect(s.loaded).toBe(true)
  })
  it('create 追加返回行', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [] } as any)
    vi.spyOn(apiMod.opportunitiesApi, 'create').mockResolvedValue({ row: { id: 'opp-9' } } as any)
    const s = useOpportunitiesStore(); await s.load(); await s.create()
    expect(s.rows.map((r) => r.id)).toContain('opp-9')
  })
  it('update 用返回行替换本地', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1', customer: '' }] } as any)
    vi.spyOn(apiMod.opportunitiesApi, 'update').mockResolvedValue({ row: { id: 'opp-1', customer: '甲', lastUpdate: 't' } } as any)
    const s = useOpportunitiesStore(); await s.load(); await s.update('opp-1', { customer: '甲' })
    expect(s.rows[0].customer).toBe('甲')
  })
  it('remove 用返回全量替换', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1' }, { id: 'opp-2' }] } as any)
    vi.spyOn(apiMod.opportunitiesApi, 'remove').mockResolvedValue({ rows: [{ id: 'opp-2' }] } as any)
    const s = useOpportunitiesStore(); await s.load(); await s.remove(['opp-1'])
    expect(s.rows.map((r) => r.id)).toEqual(['opp-2'])
  })
  it('reset 清空', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1' }] } as any)
    const s = useOpportunitiesStore(); await s.load(); s.reset()
    expect(s.rows).toEqual([]); expect(s.loaded).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认红** — `npx vitest run src/stores/opportunities.test.ts` → FAIL

- [ ] **Step 3: 实现 api**（`opportunitiesApi.ts`，镜像 projectProgressApi + 既有上传调用）
```ts
import { api } from '@/api/client'

export interface OppRow { id: string; [k: string]: any }
export interface OppListResp { rows: OppRow[] }
export interface OppRowResp { row: OppRow }
export interface OppImportResp { rows: OppRow[]; count: number }

export const opportunitiesApi = {
  list: () => api.get<OppListResp>('/api/opportunities'),
  create: () => api.post<OppRowResp>('/api/opportunities/create', {}),
  update: (id: string, fields: Record<string, any>) => api.post<OppRowResp>('/api/opportunities/update', { id, fields }),
  remove: (ids: string[]) => api.post<OppListResp>('/api/opportunities/delete', { ids }),
  importFile: async (file: File): Promise<OppImportResp> => {
    // 后端按裸字节读(Content-Length + rfile.read),故直接把 File 作 body(非 FormData),与 /api/inputs/upload 同构。
    // URL 须带与 api 同一 baseUrl 前缀(防 /pm 部署下丢前缀)——用 @/lib/baseUrl 的前缀拼接,与现有 inputs/upload 调用一致。
    const res = await fetch(withBase('/api/opportunities/import'), { method: 'POST', body: file, credentials: 'include' })
    if (!res.ok) throw new Error('import failed: ' + res.status)
    return res.json()
  },
}
```
> `withBase` 占位：实现者读 `@/api/client` / `@/lib/baseUrl` 与现有 `/api/inputs/upload` 的前端调用，用其**同一**的 baseUrl 前缀拼接函数（项目里上传是怎么拼 URL 的就怎么拼；若 `api.post` 支持传裸 body/Blob 则优先用 `api`）。关键是与既有上传走同一前缀逻辑，避免 `/pm` 子路径部署下前缀丢失。

- [ ] **Step 4: 实现 store**（镜像 projectProgress）
```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { opportunitiesApi, type OppRow } from '@/lib/opportunitiesApi'

export const useOpportunitiesStore = defineStore('opportunities', () => {
  const rows = ref<OppRow[]>([])
  const loaded = ref(false)
  async function load() { const r = await opportunitiesApi.list(); rows.value = r.rows ?? []; loaded.value = true }
  async function create(): Promise<OppRow> { const r = await opportunitiesApi.create(); rows.value = [...rows.value, r.row]; return r.row }
  async function update(id: string, fields: Record<string, any>) {
    const r = await opportunitiesApi.update(id, fields)
    rows.value = rows.value.map((x) => (x.id === id ? r.row : x))
  }
  async function remove(ids: string[]) { const r = await opportunitiesApi.remove(ids); rows.value = r.rows ?? [] }
  async function importFile(file: File) { const r = await opportunitiesApi.importFile(file); rows.value = r.rows ?? []; return r.count }
  function reset() { rows.value = []; loaded.value = false }
  return { rows, loaded, load, create, update, remove, importFile, reset }
})
```

- [ ] **Step 5: 接 reset 到登入/登出**
grep `progress.reset()` / `projectProgress` reset 调用点（auth store 的 login/logout 或路由处），**同处**加 `useOpportunitiesStore().reset()`（防跨账号 L4 数据残留，V1.17.1 教训）。若该处用 `import` 顶层 store，照其写法加。

- [ ] **Step 6: 绿 + typecheck + commit**
Run: `npx vitest run src/stores/opportunities.test.ts && npm run typecheck`
```bash
git add frontend/src/lib/opportunitiesApi.ts frontend/src/stores/opportunities.ts frontend/src/stores/opportunities.test.ts <reset 接线文件>
git commit -m "$(printf 'feat(opp): 商机 api/store + 登入登出 reset 防跨账号残留\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: OpportunityEditDrawer 行编辑表单（component + vitest）

**Files:**
- Create: `frontend/src/components/OpportunityEditDrawer.vue`
- Test: `frontend/src/components/OpportunityEditDrawer.test.ts`

**Interfaces — Consumes:** `OPP_COLUMNS`/`OPP_FIELDS`（Task3）、`useOpportunitiesStore`（Task4）。
**Props:** `modelValue: boolean`（开关）、`row: OppRow | null`（当前编辑行）。**Emits:** `update:modelValue`。

**设计：** `el-drawer`，遍历 OPP_COLUMNS 中 `type≠auto/derived` 的 22 字段，按 type 渲染：`text`→`el-input`(remark/name/customer/mainProducts 用 textarea)、`number`→`el-input-number`、`date`→`el-date-picker`(value-format YYYY-MM-DD)、`select`→`el-select`+options。firstReg/lastUpdate/recentUpdate 只读展示（底部）。保存→`store.update(row.id, 收集的 fields)`→`ElMessage.success`→关闭。编辑本地副本(`reactive`)，不直接改 store 行。

- [ ] **Step 1: 写失败测试**
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunityEditDrawer from './OpportunityEditDrawer.vue'
import { useOpportunitiesStore } from '@/stores/opportunities'

beforeEach(() => setActivePinia(createPinia()))
const row = { id: 'opp-1', l4: '小金融服务组', customer: '甲', status: '招投标', amountWan: 100, firstReg: '2026-06-01', lastUpdate: '2026-06-20 10:00' }

function mountD() {
  return mount(OpportunityEditDrawer, { props: { modelValue: true, row }, global: { plugins: [ElementPlus] } })
}

describe('OpportunityEditDrawer', () => {
  it('渲染 22 个可编辑字段控件 + 只读首登/最后更新', () => {
    const w = mountD()
    expect(w.text()).toContain('L4组织'); expect(w.text()).toContain('商机状态')
    expect(w.text()).toContain('首次登记日期'); expect(w.text()).toContain('2026-06-01')
  })
  it('保存提交 fields 给 store.update', async () => {
    const w = mountD(); const s = useOpportunitiesStore()
    const spy = vi.spyOn(s, 'update').mockResolvedValue(undefined as any)
    ;(w.vm as any).form.customer = '乙'
    await (w.vm as any).onSave(); await flushPromises()
    expect(spy).toHaveBeenCalledWith('opp-1', expect.objectContaining({ customer: '乙', l4: '小金融服务组' }))
  })
})
```

- [ ] **Step 2: 跑红** — `npx vitest run src/components/OpportunityEditDrawer.test.ts` → FAIL

- [ ] **Step 3: 实现组件**（`defineExpose({ form, onSave })` 供测试；表单本地副本随 `row` 变化重建；保存收集 OPP_FIELDS 子集；toast 用 `ElMessage`）。模板用设计令牌；控件宽度内联 px 可。长文本(remark/name/customer/mainProducts) `type="textarea"`。日期 `value-format="YYYY-MM-DD"`。select `:options` 来自 OPP_COLUMNS 对应列 options。

- [ ] **Step 4: 跑绿 + typecheck** → PASS
- [ ] **Step 5: commit**
```bash
git add frontend/src/components/OpportunityEditDrawer.vue frontend/src/components/OpportunityEditDrawer.test.ts
git commit -m "$(printf 'feat(opp): 商机行编辑抽屉(22字段按类型渲染+保存提交)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: OpportunitiesView 只读表格核心（view + vitest）

**Files:**
- Create: `frontend/src/views/OpportunitiesView.vue`
- Test: `frontend/src/views/OpportunitiesView.test.ts`

**Interfaces — Consumes:** Task3/4/5 全部、`useAuthStore`、`useCrossFilterStore`、`useColumnPrefs`、`applyColumnFilters`、`ColumnPicker`、`ColumnFilter`、`exportRows`。

**本任务范围（只读 + 表格能力，不含写按钮/抽屉联动——留 Task7）：**
- onMounted `store.load()`。
- `TABLE_ID='opportunities'`；`cf.clearAll(TABLE_ID)` 于 setup。
- 列：`prefs = useColumnPrefs(TABLE_ID, OPP_COLUMNS.map(c=>c.key), DEFAULT_VISIBLE)`；`visibleColumns` 派生。
- 数据流：`store.rows` → `applyColumnFilters(rows, cf.tableFilters(TABLE_ID))` → 关键词(`fKw`，匹配 customer/name/salesOwner) → `filtered` → 全局排序(`@sort-change` 记 sortState，sortable 列用 `sortable="custom"`) → `sorted` → 本地分页(pageSize 50) → `paged`。
- el-table 渲染：超管时首列 `<el-table-column type="selection" width="48">`（`@selection-change` 记 `selectedRows`）；`v-for visibleColumns` → `el-table-column :prop :label :width :sortable="col.sortable?'custom':false"`，`#header` 插 label + `ColumnFilter`(filterable 列，`:source-rows="store.rows"`)，`#default` 按 col.type 格式化：date 取前10、number 千分位、recentUpdate 用 `recentUpdateOf(row.lastUpdate, now)` 出状态徽标(是=ok/否=mut)、select 原值（可加徽标）。
- recentUpdate 列在表内是 derived 展示；ColumnFilter 对 recentUpdate 需要源值——给每行注入派生 `recentUpdate` 字段（computed 映射 `displayRows = filtered.map(r => ({...r, recentUpdate: recentUpdateOf(r.lastUpdate, now)}))`，让 applyColumnFilter/ColumnFilter/导出都能用）。**注意**派生注入应在过滤前（这样 recentUpdate 也可筛/排）：改为 `withDerived = store.rows.map(注入)` → 再 applyColumnFilters → 关键词 → 排序 → 分页。
- `now = new Date()`（setup 取一次）。
- 分页：`watch([filtered], ()=>currentPage=1)`。
- 行点击不跳详情（商机无详情页）；本任务行无操作列。
- defineExpose 供测试：`{ store, filtered, paged, selectedRows, visibleColumns, fKw }`。

- [ ] **Step 1: 写失败测试**（mock store.list 注入若干行；auth super/普通）
```ts
// 关键用例:
// a) 超管挂载后渲染 selection 列(.el-table__column--selection 存在)；普通管理员不渲染
// b) DEFAULT_VISIBLE 列出现、隐藏列不出现
// c) 关键词过滤收窄 filtered
// d) recentUpdate 派生列:近7天行显「是」
// 用 vi.spyOn(opportunitiesApi,'list') 注入 rows;auth.user.isSuper 切换
```
（实现者参照 KeyProjectsView.test.ts 的 mount+pinia+ElementPlus+router 范式构造，auth.user 直接赋值。）

- [ ] **Step 2-4: 红 → 实现 view 核心 → 绿 + typecheck**
- [ ] **Step 5: commit**
```bash
git add frontend/src/views/OpportunitiesView.vue frontend/src/views/OpportunitiesView.test.ts
git commit -m "$(printf 'feat(opp): 商机进展只读表格核心(选列/筛选/排序/关键词/分页/派生近7天/选择列超管)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: OpportunitiesView 写操作（新增/编辑/删除/导入/导出，超管门）

**Files:**
- Modify: `frontend/src/views/OpportunitiesView.vue`、`frontend/src/views/OpportunitiesView.test.ts`

**范围：** 工具栏超管按钮 `v-if="auth.isSuper"`：「新增商机」「删除选中」「导入」「导出」；操作列（超管）每行「编辑」。
- 新增：`await store.create()` → 取返回行 → 打开 EditDrawer（`editRow=新行; editOpen=true`）。
- 编辑：点行「编辑」→ `editRow=row; editOpen=true`。
- 删除：`selectedRows` 非空→`ElMessageBox.confirm`→`store.remove(selectedRows.map(r=>r.id))`→toast。
- 导入：`<input type="file" accept=".xlsx">`（或 el-upload）→ `store.importFile(file)`→`ElMessage.success('导入 N 条')`→（store 已刷新）。导入有明确进度/结果反馈。
- 导出：`exportRows('重点商机进展_${filtered.length}条.xlsx', filtered.map(r=>25中文列))`，列含 firstReg/lastUpdate/recentUpdate 中文名。
- `<OpportunityEditDrawer v-model="editOpen" :row="editRow" />`。

- [ ] **Step 1: 写失败测试**
```ts
// a) 超管见「新增商机/删除选中/导入/导出」按钮;普通管理员都不见、无操作列、无 file input
// b) 点新增 → store.create 调用 + editOpen=true
// c) 选中行点删除确认 → store.remove(选中ids)
// d) 导出调用 exportRows(可 spy @/lib/exportXlsx)
```

- [ ] **Step 2-4: 红 → 实现 → 绿 + typecheck**
- [ ] **Step 5: commit**
```bash
git add frontend/src/views/OpportunitiesView.vue frontend/src/views/OpportunitiesView.test.ts
git commit -m "$(printf 'feat(opp): 商机进展写操作(新增/编辑抽屉/删除/导入/导出 超管门)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 8: 路由 / 导航 / 页面门禁注册（mechanical）

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts`（PageKey 加 `'opportunities-progress'`）
- Modify: `frontend/src/nav.ts`（`KEY_FOLLOWUP_LINKS` 追加链接）
- Modify: `frontend/src/router/index.ts`（import + route）
- Test: 既有 `frontend/src/lib/pageAccess.test.ts`（如断言 PAGE_OPTIONS 数量则 +1）；新增/扩 router 守卫用例可选

- [ ] **Step 1（若有计数断言先改测试看红）**：`pageAccess.test.ts` 若断言 PAGE_OPTIONS 长度，则 +1（新增一项）。
- [ ] **Step 2: pageAccess.ts** PageKey 联合追加 `| 'opportunities-progress'`（放在 `'projects-key'` 行附近）。
- [ ] **Step 3: nav.ts** `KEY_FOLLOWUP_LINKS` 追加：
```ts
  { label: '重点商机进展', to: '/opportunities', key: 'opportunities-progress' },
```
- [ ] **Step 4: router/index.ts** import `OpportunitiesView` + route：
```ts
{ path: '/opportunities', name: 'opportunities', component: OpportunitiesView,
  meta: { title: '重点商机进展', hideFilter: true, pageKey: 'opportunities-progress' } },
```
- [ ] **Step 5: 全前端绿** — `cd frontend && npm run typecheck && npx vitest run` 全过。
- [ ] **Step 6: commit**
```bash
git add frontend/src/lib/pageAccess.ts frontend/src/nav.ts frontend/src/router/index.ts frontend/src/lib/pageAccess.test.ts
git commit -m "$(printf 'feat(opp): 注册 /opportunities 路由+重点跟进导航+页面门禁 pageKey\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-Review
- **Spec 覆盖**：领域纯函数(T1)、server 端点+门禁+seed+gitignore(T2)、列/选项/派生(T3)、api/store/reset(T4)、编辑抽屉(T5)、只读表格(T6)、写操作(T7)、注册(T8) —— spec 全部要点有任务。
- **Placeholder 扫描**：server.py 内辅助名(`_read_json_body`/`_read_upload_bytes`/`_error_payload`/`ERR_*`)以现有命名为准——已在 T2 显式标注实现者须对齐现有、不新造；其余均给实际代码。
- **类型一致**：`OppRow` T4 定义、T5/6/7 引用；`OPP_FIELDS`/`OPP_COLUMNS`/`recentUpdateOf` T3 定义、T5/6/7 引用；后端 `FIELDS` 22 与前端 `OPP_FIELDS` 22 对齐；`apply_update(...,now_date,now_dt)` T1 定义、T2 调用一致；`/api/opportunities*` 路径 T2 定义、T4 引用一致。
- **YAGNI**：导入=整表替换(不做增量 merge)；商机无详情页(行不跳转)；后端对下拉值不强校验(前端约束)——均为有意精简，spec 已记。
- **风险**：T6 是最重任务(el-table 动态列+派生注入+全局排序+分页)，派 sonnet/opus；其余 sonnet；T1 sonnet(域逻辑)；T8 haiku(机械)。
