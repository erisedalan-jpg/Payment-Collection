# V4.0.0 蓝信推送集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员在平台内一键把「项目关注原因」与「倚天工时填报问题」，经蓝信应用号消息推送给相关人员；发前可预览、所见即所发。

**Architecture:** 前端只算口径（复用现有 `lib/`，零新口径），后端只解析收件人 + 组卡 + 发送。`preview` 与 `send` 吃同一份 payload、走同一条 `build_plan()` 代码路径，`send` 仅多一步 `dispatch()` —— 「所见即所发」是结构保证。后端不接受前端传来的 staffId，只认 `projectId` / `employId`。

**Tech Stack:** Python 3.8+ 标准库（`urllib.request`，**不引第三方 HTTP 库**）+ pytest；Vue 3 `<script setup lang="ts">` + Element Plus 2.14.1 + Pinia + Vitest。

**Spec:** `docs/superpowers/specs/2026-07-17-lanxin-push-integration-design.md`
**申请清单（凭证前置）：** `docs/2026-07-17-蓝信开放平台接入申请清单.md`

## Global Constraints

- **不使用任何 emoji**（CLAUDE.md 铁律）。需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **绝不记密钥**：`appSecret` / `appToken` / `userToken` 不得进日志、审计、异常消息、前端下发。审计只记「谁在何时推给了多少人、结果如何」。
- **口径单一来源**：项目关注原因与工时问题的判定**只在前端 `lib/`**。后端**不得**复刻判定逻辑（后端只存白名单常量用于**校验取值合法性**，这不是口径）。
- **后端不接受前端传来的 staffId**：只接受 `projectId` / `employId`。
- **不静默丢弃**：未解析收件人、被截断内容、发送失败条目一律显式列出。
- **无新增第三方依赖**；HTTP 用标准库 `urllib.request`。
- **不改数据管线**：不动 `preprocess_data.py` / `schema.py` / `projects.read_org_roster` / `projects.read_org_names`。
- **不新增页面 / 路由 / pageKey / 授权**：配置卡与推送抽屉都挂 `/data`「配置」签。
- **只引设计令牌，不手写散值**；**不引入第 16 个色号**；状态标识走「淡底+深字」三态（`--ok-bg`+`--ok-text` / `--warn-bg`+`--warn-text` / `--danger-bg`+`--danger-text`）。
- **共享样式**：`/data` 内组件的 `.dv-*` 样式统一 `@import '@/styles/dataview.css';`，只写本组件特有规则（V3.5.0 建立，禁止逐字抄）。
- **字节非字符**：所有蓝信字段长度校验按 **UTF-8 字节数**（中文 3 字节/字）。
- **审计埋点**：`audit._ACTION_MAP` 按 `(method, path)` 查表 —— **新端点必须加表条目，否则埋点是死的**（V3.3.0 实际踩过）。
- **验证**：`bash verify.sh` 全绿且**退出码 0**（不能只看用例绿 —— V3.3.0 因子组件 onMounted 拒绝逸出导致「全绿但退出码非零」）。跑测试时**不要并发跑 `npm run build`**（会让分页测试超时假失败）。
- **断可见性用 `isVisible()`**，不能用 `text()`/`find()`（V3.5.0 教训：三签内容全在 DOM，`text()` 恒命中 = 永真假绿）。

---

## 并行执行说明（最多 6 agent）

任务按「各改各文件」切开，**同一波次内的任务零文件重叠**，可并行派发；波次之间有依赖，必须串行。

```
波次 A（3 并行）  T1 lanxin_config.py   T2 lanxin_recipients.py(树)   T3 lanxin.py(客户端)
                   ↓ 三者互不引用,各自带测试
波次 B（1）        T4 build_plan + dispatch（组卡与编排,消费 T1/T2/T3）
                   ↓
波次 C（2 并行）  T5 server.py 端点+审计        T6 前端 lib/lanxin/items.ts
                   ↓ T5 只改 server.py/audit.py；T6 只加前端 lib
波次 D（2 并行）  T7 LanxinConfigCard.vue      T8 LanxinPushDrawer.vue
                   ↓ 两个新组件各自独立
波次 E（1）        T9 挂进 DataView「配置」签 + 版本号 + PROGRESS + 全量 verify
```

**控制者注意**：波次内并行的 agent **不要各自 commit**（避免交叉）；由控制者合并验证后串行提交。这是本仓既有做法（V3.3.0 / V3.4.0 均如此）。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `lanxin_config.py` | **新建** | 凭证与路由配置：`default_config` / `validate_config` / `load_config` / `save_config`（原子写） |
| `tests/test_lanxin_config.py` | **新建** | |
| `lanxin_recipients.py` | **新建** | 读 `input/组织架构.xlsx` 建树；解析三条收件链；组卡（含字节截断） |
| `tests/test_lanxin_recipients.py` | **新建** | |
| `lanxin.py` | **新建** | 蓝信 API 客户端：`get_app_token`（缓存）/ `id_mapping` / `send_message`；`build_plan` / `dispatch` |
| `tests/test_lanxin.py` | **新建** | |
| `server.py` | 修改 | 4 个端点 + `_SUPER_ONLY_PATHS` 4 条 |
| `audit.py` | 修改 | `_ACTION_MAP` 加 4 条 |
| `.gitignore` | 修改 | `data/lanxin_config.json` + `.tmp` |
| `frontend/src/lib/lanxin/items.ts` | **新建** | 纯计算：派生待推事项 |
| `frontend/src/lib/lanxin/items.test.ts` | **新建** | |
| `frontend/src/lib/lanxinApi.ts` | **新建** | 4 个端点的前端封装 |
| `frontend/src/components/LanxinConfigCard.vue` | **新建** | 凭证 + 路由配置 + 自检 |
| `frontend/src/components/LanxinConfigCard.test.ts` | **新建** | |
| `frontend/src/components/LanxinPushDrawer.vue` | **新建** | 预览 → 确认 → 推送 |
| `frontend/src/components/LanxinPushDrawer.test.ts` | **新建** | |
| `frontend/src/views/DataView.vue` | 修改 | 「配置」签挂两个新组件 |
| `frontend/src/version.ts` | 修改 | `V3.5.0` → `V4.0.0` |
| `PROGRESS.md` | 修改 | |

### 跨任务契约（各任务据此对接，名字与类型不得擅改）

```python
# lanxin_config.py
def default_config() -> dict
def validate_config(cfg: Any) -> dict          # 非法 → ValueError
def load_config(path: str) -> dict             # 文件不存在 → default_config()
def save_config(path: str, cfg: Any) -> dict   # 校验后原子写,返回落盘配置
def public_config(cfg: dict) -> dict           # 脱敏:appSecret → '' + hasSecret: bool

# lanxin_recipients.py
def read_org_tree(path: str) -> dict
    # → {'byId': {工号: {'name','supId','l4','l31'}}, 'byName': {姓名: [工号,...]}}
def supervisor_chain(tree: dict, emp_id: str, levels: int) -> list[str]
    # 向上最多 levels 级;带环检测;走到根/册外即停;返回工号列表(不含自己)
def resolve_project_manager(tree: dict, pmis_team: dict) -> tuple[str | None, str | None]
    # → (工号, None) | (None, 原因)   原因 ∈ {'经理不在花名册','姓名映射到多个工号','项目无经理'}
def fit_bytes(s: str, limit: int) -> str       # 按 UTF-8 字节截断,超出末尾加 '…'
def build_timesheet_card(name: str, issues: list, start: str, end: str) -> dict
def build_project_card(name: str, by_reason: dict) -> dict
def build_summary_card(name: str, rows: list, level_label: str) -> dict
    # rows: [{'name': str, 'total': int, 'reasons': [(原因, 数), ...]}]

# lanxin.py
class LanxinError(Exception):      # 带 .err_code / .err_msg,str() 绝不含 token
def get_app_token(cfg: dict) -> str                                  # 内存缓存,提前 300s 视为过期
def id_mapping(cfg: dict, token: str, emp_id: str) -> str            # → staffId
def send_message(cfg: dict, token: str, staff_ids: list, msg_data: dict) -> dict
def build_plan(items: list, cfg: dict, tree: dict, project_pmis: dict) -> dict
    # → {'recipients': [{'employId','name','role','card'}], 'unresolved': [...], 'totals': {...}}
    # role ∈ {'primary','supervisor'}
def dispatch(plan: dict, cfg: dict) -> dict
    # → {'sent': int, 'failed': [{'employId','name','errCode','errMsg'}], 'msgIds': [...]}
```

```ts
// frontend/src/lib/lanxin/items.ts
export type PushItem =
  | { kind: 'project';   projectId: string; reasons: string[] }
  | { kind: 'timesheet'; employId: string;  issues: { code: string; label: string; count: number }[] }
export function projectItems(projects: Project[], projectPmis: Record<string, ProjectPmis>,
                             allowedReasons: string[]): PushItem[]
export function timesheetItems(rows: IssueRow[], allowedCodes: string[]): PushItem[]

// frontend/src/lib/lanxinApi.ts
export interface LanxinRoute { key: string; label: string; enabled: boolean
                               issueCodes?: string[]; reasons?: string[]
                               recipients: { primary: boolean; supervisorLevels: number } }
export interface LanxinConfig { enabled: boolean; sendIntervalMs: number
                                credentials: { appId: string; appSecret: string; orgId: string
                                               apiGateway: string; idType: string; hasSecret?: boolean }
                                routes: LanxinRoute[] }
export function getLanxinConfig(): Promise<LanxinConfig>
export function saveLanxinConfig(cfg: LanxinConfig): Promise<LanxinConfig>
export function lanxinSelftest(employId: string): Promise<{ steps: {name:string;ok:boolean;msg:string}[] }>
export function lanxinPreview(items: PushItem[]): Promise<LanxinPlan>
export function lanxinSend(items: PushItem[]): Promise<LanxinSendResult>
```

---

# 波次 A —— 三个后端基座（T1 / T2 / T3 可并行）

### Task 1: `lanxin_config.py` 配置模块

**Files:**
- Create: `lanxin_config.py`
- Test: `tests/test_lanxin_config.py`

**Interfaces:**
- Consumes: `yitian_rules.ISSUE_LABELS`（键集合，用于校验 `issueCodes`）
- Produces: `default_config()` / `validate_config(cfg)` / `load_config(path)` / `save_config(path, cfg)` / `public_config(cfg)`

**范式**：照抄 `yitian_settings.py` 的结构（纯函数 + 原子写 `.tmp` → `os.replace`）。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin_config.py`：

```python
import json
import os
import pytest
import lanxin_config as LC


def test_default_config_shape():
    d = LC.default_config()
    assert d["enabled"] is False
    assert d["sendIntervalMs"] == 200
    assert d["credentials"]["idType"] == "employ_id"
    assert {r["key"] for r in d["routes"]} == {"timesheet", "project"}
    ts = next(r for r in d["routes"] if r["key"] == "timesheet")
    pj = next(r for r in d["routes"] if r["key"] == "project")
    # 默认值:工时不发汇总;项目发到直接上级
    assert ts["recipients"]["supervisorLevels"] == 0
    assert pj["recipients"]["supervisorLevels"] == 1
    assert len(ts["issueCodes"]) == 7
    assert len(pj["reasons"]) == 8


def test_validate_accepts_default():
    assert LC.validate_config(LC.default_config())


@pytest.mark.parametrize("lv", [0, 1, 2, 3, 4, 5])
def test_supervisor_levels_0_to_5_ok(lv):
    c = LC.default_config()
    c["routes"][1]["recipients"]["supervisorLevels"] = lv
    assert LC.validate_config(c)["routes"][1]["recipients"]["supervisorLevels"] == lv


@pytest.mark.parametrize("lv", [-1, 6, 99, "1", None])
def test_supervisor_levels_out_of_range_rejected(lv):
    c = LC.default_config()
    c["routes"][1]["recipients"]["supervisorLevels"] = lv
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_issue_code_rejected():
    c = LC.default_config()
    c["routes"][0]["issueCodes"] = ["MISS_SUMMARY", "NOT_A_CODE"]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_reason_rejected():
    c = LC.default_config()
    c["routes"][1]["reasons"] = ["回款延期", "不存在的原因"]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_empty_subset_is_legal():
    """空子集 = 该路由不推任何原因,是合法配置(等同停用),不应报错。"""
    c = LC.default_config()
    c["routes"][1]["reasons"] = []
    assert LC.validate_config(c)["routes"][1]["reasons"] == []


def test_non_https_gateway_rejected():
    c = LC.default_config()
    c["credentials"]["apiGateway"] = "http://apigw.example.com"
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_gateway_trailing_slash_normalized():
    c = LC.default_config()
    c["credentials"]["apiGateway"] = "https://apigw.example.com/"
    assert LC.validate_config(c)["credentials"]["apiGateway"] == "https://apigw.example.com"


def test_empty_gateway_is_legal_when_not_enabled():
    """凭证未申请下来时,允许留空保存(否则超管连路由都配不了)。"""
    c = LC.default_config()
    c["credentials"]["apiGateway"] = ""
    assert LC.validate_config(c)["credentials"]["apiGateway"] == ""


def test_public_config_masks_secret():
    c = LC.default_config()
    c["credentials"]["appSecret"] = "s3cr3t"
    p = LC.public_config(c)
    assert p["credentials"]["appSecret"] == ""
    assert p["credentials"]["hasSecret"] is True
    # 绝不能有任何地方泄漏明文
    assert "s3cr3t" not in json.dumps(p, ensure_ascii=False)


def test_public_config_no_secret_flag_false():
    p = LC.public_config(LC.default_config())
    assert p["credentials"]["hasSecret"] is False


def test_save_empty_secret_keeps_old(tmp_path):
    """脱敏读回后再保存,appSecret 是空串 → 必须保留旧值,不能清空。"""
    p = str(tmp_path / "lanxin_config.json")
    c = LC.default_config()
    c["credentials"]["appSecret"] = "old-secret"
    LC.save_config(p, c)
    c2 = LC.load_config(p)
    c2["credentials"]["appSecret"] = ""      # 前端脱敏回传
    LC.save_config(p, c2)
    assert LC.load_config(p)["credentials"]["appSecret"] == "old-secret"


def test_save_new_secret_overwrites(tmp_path):
    p = str(tmp_path / "lanxin_config.json")
    c = LC.default_config()
    c["credentials"]["appSecret"] = "old"
    LC.save_config(p, c)
    c["credentials"]["appSecret"] = "new"
    LC.save_config(p, c)
    assert LC.load_config(p)["credentials"]["appSecret"] == "new"


def test_load_missing_file_returns_default(tmp_path):
    assert LC.load_config(str(tmp_path / "nope.json")) == LC.default_config()


def test_save_is_atomic_no_tmp_left(tmp_path):
    p = str(tmp_path / "lanxin_config.json")
    LC.save_config(p, LC.default_config())
    assert os.path.exists(p)
    assert not os.path.exists(p + ".tmp")
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_lanxin_config.py -q`
Expected: FAIL —— `ModuleNotFoundError: No module named 'lanxin_config'`

- [ ] **Step 3: 写实现**

创建 `lanxin_config.py`：

```python
# lanxin_config.py
"""蓝信推送域:凭证与路由配置(超管可配)。纯函数 + 原子读写,可单测。

为什么要有这个文件:推送给谁、推哪些原因,是随组织习惯变的策略,不是代码常量。
本模块把它提升为服务端配置,超管在 /data 可见可改,改完立即生效(本域不进数据管线)。
appSecret 存于此,故 data/lanxin_config.json 必须 gitignore。
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from yitian_rules import ISSUE_LABELS

# 前端 lib/riskReasons.ts 的 RiskCategory 八类。
# 注意:这里只用于「校验超管勾选的取值是否合法」,不做任何判定 —— 判定口径的单一来源仍是前端。
REASON_WHITELIST = [
    "回款延期", "里程碑滞后", "总成本超支大于5000", "总成本超支小于5000",
    "交付成本超支", "风险未闭环", "数据异常", "未获取原项目预算",
]

MAX_SUPERVISOR_LEVELS = 5      # 用户钦定:预留 5 级(推广到整个团队后,张英哲之上仍有两级)
MIN_SEND_INTERVAL_MS = 0
MAX_SEND_INTERVAL_MS = 10000
_ID_TYPES = ("employ_id", "mobile", "mail", "login", "external_id")


def default_config() -> Dict[str, Any]:
    return {
        "enabled": False,
        "sendIntervalMs": 200,
        "credentials": {
            "appId": "", "appSecret": "", "orgId": "",
            "apiGateway": "", "idType": "employ_id",
        },
        "routes": [
            {
                "key": "timesheet", "label": "倚天工时问题", "enabled": True,
                "issueCodes": list(ISSUE_LABELS.keys()),
                # 默认不发汇总:工时问题是本人可自纠的,先不惊动上级
                "recipients": {"primary": True, "supervisorLevels": 0},
            },
            {
                "key": "project", "label": "项目关注原因", "enabled": True,
                "reasons": list(REASON_WHITELIST),
                # 默认到直接上级即止:+3 意味着一人收覆盖全部员工的卡,应由人显式开启
                "recipients": {"primary": True, "supervisorLevels": 1},
            },
        ],
    }


def _validate_recipients(r: Any) -> Dict[str, Any]:
    if not isinstance(r, dict):
        raise ValueError("recipients 必须是对象")
    primary = r.get("primary", True)
    if not isinstance(primary, bool):
        raise ValueError("recipients.primary 必须是布尔")
    lv = r.get("supervisorLevels", 0)
    # 布尔是 int 的子类,必须显式排除,否则 True 会被当成 1
    if isinstance(lv, bool) or not isinstance(lv, int):
        raise ValueError("recipients.supervisorLevels 必须是整数")
    if not (0 <= lv <= MAX_SUPERVISOR_LEVELS):
        raise ValueError("recipients.supervisorLevels 须在 0..%d" % MAX_SUPERVISOR_LEVELS)
    return {"primary": primary, "supervisorLevels": lv}


def _validate_subset(raw: Any, whitelist: List[str], field: str) -> List[str]:
    if not isinstance(raw, list):
        raise ValueError("%s 必须是数组" % field)
    out: List[str] = []
    for x in raw:
        if not isinstance(x, str):
            raise ValueError("%s 只能含字符串" % field)
        if x not in whitelist:
            raise ValueError("%s 含未知取值:%s" % (field, x))
        if x not in out:
            out.append(x)
    return out


def validate_config(cfg: Any) -> Dict[str, Any]:
    """校验并归一化。非法 → ValueError。返回全新 dict,不就地改入参。"""
    if not isinstance(cfg, dict):
        raise ValueError("配置必须是对象")

    enabled = cfg.get("enabled", False)
    if not isinstance(enabled, bool):
        raise ValueError("enabled 必须是布尔")

    interval = cfg.get("sendIntervalMs", 200)
    if isinstance(interval, bool) or not isinstance(interval, int):
        raise ValueError("sendIntervalMs 必须是整数")
    if not (MIN_SEND_INTERVAL_MS <= interval <= MAX_SEND_INTERVAL_MS):
        raise ValueError("sendIntervalMs 须在 %d..%d" % (MIN_SEND_INTERVAL_MS, MAX_SEND_INTERVAL_MS))

    cred_in = cfg.get("credentials") or {}
    if not isinstance(cred_in, dict):
        raise ValueError("credentials 必须是对象")
    cred: Dict[str, Any] = {}
    for k in ("appId", "appSecret", "orgId", "apiGateway"):
        v = cred_in.get(k, "")
        if not isinstance(v, str):
            raise ValueError("credentials.%s 必须是字符串" % k)
        cred[k] = v.strip()
    # 凭证尚未申请下来时允许留空,否则超管连路由都没法先配好
    if cred["apiGateway"]:
        if not cred["apiGateway"].startswith("https://"):
            raise ValueError("credentials.apiGateway 必须以 https:// 开头")
        cred["apiGateway"] = cred["apiGateway"].rstrip("/")
    id_type = cred_in.get("idType", "employ_id")
    if id_type not in _ID_TYPES:
        raise ValueError("credentials.idType 只能是 %s" % (_ID_TYPES,))
    cred["idType"] = id_type

    routes_in = cfg.get("routes")
    if not isinstance(routes_in, list) or not routes_in:
        raise ValueError("routes 必须是非空数组")
    known = {r["key"]: r for r in default_config()["routes"]}
    routes: List[Dict[str, Any]] = []
    seen = set()
    for r in routes_in:
        if not isinstance(r, dict):
            raise ValueError("route 必须是对象")
        key = r.get("key")
        if key not in known:
            raise ValueError("未知 route.key:%s" % key)
        if key in seen:
            raise ValueError("route.key 重复:%s" % key)
        seen.add(key)
        item: Dict[str, Any] = {
            "key": key,
            "label": known[key]["label"],
            "enabled": bool(r.get("enabled", True)),
            "recipients": _validate_recipients(r.get("recipients") or {}),
        }
        if key == "timesheet":
            item["issueCodes"] = _validate_subset(
                r.get("issueCodes", []), list(ISSUE_LABELS.keys()), "issueCodes")
        else:
            item["reasons"] = _validate_subset(
                r.get("reasons", []), REASON_WHITELIST, "reasons")
        routes.append(item)
    if seen != set(known):
        raise ValueError("routes 必须包含且仅包含:%s" % sorted(known))

    return {"enabled": enabled, "sendIntervalMs": interval,
            "credentials": cred, "routes": routes}


def load_config(path: str) -> Dict[str, Any]:
    """读配置。文件不存在/坏 JSON → 默认配置(不抛,避免整页打不开)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return validate_config(json.load(f))
    except (OSError, ValueError):
        return default_config()


def save_config(path: str, cfg: Any) -> Dict[str, Any]:
    """校验后原子写。appSecret 为空串 = 沿用旧值(前端读到的是脱敏值,回传空串不应清空)。"""
    clean = validate_config(cfg)
    if not clean["credentials"]["appSecret"]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                old = json.load(f)
            clean["credentials"]["appSecret"] = (old.get("credentials") or {}).get("appSecret", "")
        except (OSError, ValueError):
            pass
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return clean


def public_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """下发给前端的脱敏配置:appSecret 抹成空串,只透出 hasSecret 布尔。"""
    out = json.loads(json.dumps(cfg, ensure_ascii=False))
    secret = (out.get("credentials") or {}).get("appSecret", "")
    out["credentials"]["appSecret"] = ""
    out["credentials"]["hasSecret"] = bool(secret)
    return out
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_lanxin_config.py -q`
Expected: PASS（19 个用例，含 parametrize 展开）

- [ ] **Step 5: 加 .gitignore（含 AppSecret，必须先于任何真实配置落盘）**

在 `.gitignore` 末尾追加：

```
# 蓝信推送配置(含 AppSecret,绝不入库)
data/lanxin_config.json
data/lanxin_config.json.tmp
```

- [ ] **Step 6: 提交**

```bash
git add lanxin_config.py tests/test_lanxin_config.py .gitignore
git commit -m "feat(lanxin): 凭证与路由配置模块(0..5 级可配/子集校验/secret 脱敏与保留)"
```

---

### Task 2: `lanxin_recipients.py` 组织树与收件人解析 + 组卡

**Files:**
- Create: `lanxin_recipients.py`
- Test: `tests/test_lanxin_recipients.py`

**Interfaces:**
- Consumes: `projects.read_sheet_by_header(path, "工号")`（现成的公开包装，按表头选 sheet 读表）
- Produces: `read_org_tree` / `supervisor_chain` / `resolve_project_manager` / `fit_bytes` / `build_timesheet_card` / `build_project_card` / `build_summary_card`

**背景事实（实现前必读，均为真实数据实测）：**
- `组织架构.xlsx` 列：`工号` `姓名` `员工类别` `新L2组织` `新L3组织` `新L3-1组织` `新L4组织` `直接上级工号` `直接上级姓名`
- 实测 85 行、`新L3组织` 全为「交付实施三部」；根是 `张英哲 A000701`（`直接上级工号` 为空）
- 树：张英哲 → {于岩(服务二部), 隋文宇(服务一部)} → 11 位 L4 组长 → 71 员工；链长分布 `{0:1, 1:2, 2:11, 3:71}`；**无环**；上级工号 100% 在册
- **姓名 → 工号当前 1:1（0 重名）**，但这是数据现状不是不变量 → 必须防 1:N
- **本模块不套用 `新L3组织 == DEPT_L3` 过滤**（`projects.read_org_roster` 套了）。今天全表都是三部、行为零差异；等花名册扩到整团队，+4/+5 不改代码即生效。**不要"顺手"加上这个过滤。**
- **不修改 `projects.read_org_roster` / `read_org_names`** —— `schema._Base` 是 `extra="allow"`，给花名册加字段会静默流进 `yitian_data.json`

**`appCard` 字段上限（来自蓝信官方参数表，按 UTF-8 字节）：** `bodyTitle` 600 / `bodySubTitle` 1200 / `bodyContent` 3000 / `fields` ≤10 对（`key` ≤18、`value` ≤192）/ `signature` 96。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin_recipients.py`：

```python
import pytest
import lanxin_recipients as LR


def _tree(rows):
    """rows: [(工号, 姓名, 上级工号)] → read_org_tree 的产物结构"""
    by_id = {i: {"name": n, "supId": s, "l4": "", "l31": ""} for i, n, s in rows}
    by_name = {}
    for i, n, _ in rows:
        by_name.setdefault(n, []).append(i)
    return {"byId": by_id, "byName": by_name}


ORG = _tree([
    ("A001", "张英哲", None),      # 根
    ("A002", "于岩", "A001"),
    ("A003", "隋文宇", "A001"),
    ("A004", "陶俊", "A002"),
    ("A005", "耿磊磊", "A003"),
    ("A006", "张三", "A005"),      # 员工级
])


def test_chain_walks_up_cumulatively():
    assert LR.supervisor_chain(ORG, "A006", 1) == ["A005"]
    assert LR.supervisor_chain(ORG, "A006", 2) == ["A005", "A003"]
    assert LR.supervisor_chain(ORG, "A006", 3) == ["A005", "A003", "A001"]


def test_chain_stops_at_root_no_error():
    """链长不足即停,不报错 —— L4 组长的 +3 本就没有对象(实测常态)。"""
    assert LR.supervisor_chain(ORG, "A006", 5) == ["A005", "A003", "A001"]
    assert LR.supervisor_chain(ORG, "A004", 5) == ["A002", "A001"]
    assert LR.supervisor_chain(ORG, "A001", 5) == []


def test_chain_levels_zero_returns_empty():
    assert LR.supervisor_chain(ORG, "A006", 0) == []


def test_chain_detects_cycle():
    """花名册是人工维护的 xlsx,填成环就会死循环。必须带环检测。"""
    bad = _tree([("X1", "甲", "X2"), ("X2", "乙", "X1")])
    assert LR.supervisor_chain(bad, "X1", 5) == ["X2"]     # 走到 X1 发现回到起点,停


def test_chain_self_loop():
    bad = _tree([("Y1", "丙", "Y1")])
    assert LR.supervisor_chain(bad, "Y1", 5) == []


def test_chain_stops_when_supervisor_outside_roster():
    outside = _tree([("Z1", "丁", "NOT_IN_ROSTER")])
    assert LR.supervisor_chain(outside, "Z1", 5) == []


def test_resolve_manager_ok():
    assert LR.resolve_project_manager(ORG, {"项目经理": "张三"}) == ("A006", None)


def test_resolve_manager_not_in_roster():
    emp, reason = LR.resolve_project_manager(ORG, {"项目经理": "查无此人"})
    assert emp is None and reason == "经理不在花名册"


def test_resolve_manager_homonym_skips_never_guesses():
    """姓名 1:N 时必须跳过并报告,绝不猜 —— 推给错的人比不推更糟。"""
    dup = _tree([("D1", "重名", None), ("D2", "重名", None)])
    emp, reason = LR.resolve_project_manager(dup, {"项目经理": "重名"})
    assert emp is None and reason == "姓名映射到多个工号"


def test_resolve_manager_empty():
    emp, reason = LR.resolve_project_manager(ORG, {"项目经理": "  "})
    assert emp is None and reason == "项目无经理"


def test_fit_bytes_counts_utf8_not_chars():
    """中文 3 字节/字 —— 按字符数算会把 192 字节的框撑到 576 字节。"""
    assert LR.fit_bytes("中文", 10) == "中文"          # 6 字节,不截
    out = LR.fit_bytes("中文中文中文", 10)             # 18 字节 → 截
    assert len(out.encode("utf-8")) <= 10
    assert out.endswith("…")


def test_fit_bytes_never_splits_a_char():
    out = LR.fit_bytes("中中中", 4)                    # 4 字节放不下 2 个中文
    assert out.encode("utf-8")                         # 不抛 UnicodeDecodeError
    assert len(out.encode("utf-8")) <= 4


def test_fit_bytes_noop_when_short():
    assert LR.fit_bytes("abc", 100) == "abc"


def test_timesheet_card_fields_within_limit():
    issues = [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3},
              {"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 2}]
    card = LR.build_timesheet_card("张三", issues, "2026-07-01", "2026-07-15")
    assert card["headTitle"] == "工时填报提醒"
    assert "5 条" in card["bodyTitle"]
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "缺少工作概述"
    assert card["fields"][0]["value"] == "3 条"
    assert "2026-07-01" in card["bodySubTitle"]


def test_project_card_uses_reason_distribution_not_project_names_in_fields():
    """单人最多背 49 个项目(实测) —— fields 必须按原因(≤8类)排,不能按项目名排。"""
    by_reason = {"回款延期": ["P1", "P2", "P3"], "交付成本超支": ["P4"]}
    card = LR.build_project_card("李四", by_reason)
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "回款延期"
    assert card["fields"][0]["value"] == "3 个项目"
    assert "4 个项目" in card["bodyTitle"]      # 去重后的项目总数
    assert "P1" in card["bodyContent"]


def test_project_card_bodycontent_truncates_with_notice():
    by_reason = {"回款延期": ["项目名称非常长的一个项目%d" % i for i in range(400)]}
    card = LR.build_project_card("李四", by_reason)
    assert len(card["bodyContent"].encode("utf-8")) <= 3000
    assert "未列出" in card["bodyContent"]


def test_summary_card_nested_shape():
    rows = [{"name": "隋文宇", "total": 14, "reasons": [("回款延期", 6), ("成本超支", 5)]},
            {"name": "于岩", "total": 9, "reasons": [("回款延期", 3)]}]
    card = LR.build_summary_card("张英哲", rows, "部门级汇总（+3）")
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "隋文宇"
    assert card["fields"][0]["value"].startswith("14 项：")
    assert "回款延期 6" in card["fields"][0]["value"]
    assert "23 个项目" in card["bodyTitle"]
    assert card["bodySubTitle"] == "部门级汇总（+3）"


def test_summary_card_caps_fields_at_10_and_says_so():
    """主动不越 10 对 —— 蓝信超限行为未知(拒绝?静默截断?),不去赌。"""
    rows = [{"name": "下属%02d" % i, "total": 20 - i, "reasons": [("回款延期", 1)]}
            for i in range(13)]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    assert len(card["fields"]) == 10
    assert card["fields"][0]["key"] == "下属00"       # 按 total 降序
    assert "另有 3 人" in card["bodyContent"]


def test_summary_card_value_within_192_bytes():
    rows = [{"name": "甲", "total": 99,
             "reasons": [("总成本超支大于5000", 20), ("未获取原项目预算", 19),
                         ("里程碑滞后", 18), ("交付成本超支", 17),
                         ("风险未闭环", 16), ("回款延期", 9)]}]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    assert len(card["fields"][0]["value"].encode("utf-8")) <= 192


def test_all_cards_respect_key_18_bytes():
    rows = [{"name": "姓名特别长的一个人", "total": 1, "reasons": [("回款延期", 1)]}]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    assert len(card["fields"][0]["key"].encode("utf-8")) <= 18
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_lanxin_recipients.py -q`
Expected: FAIL —— `ModuleNotFoundError: No module named 'lanxin_recipients'`

- [ ] **Step 3: 写实现**

创建 `lanxin_recipients.py`：

```python
# lanxin_recipients.py
"""蓝信推送域:组织树 / 收件人解析 / 卡片组装。纯函数,可单测。

为什么不复用 projects.read_org_roster:
  1) 它硬过滤「新L3组织 == 交付实施三部」。今天全表都是三部、行为一样,但等花名册扩到
     整个团队,张英哲的上级必然不属三部,套过滤会把 +4/+5 级挡掉。本模块读全表。
  2) 它的产物落进 yitian_data.json。schema._Base 是 extra="allow",给它加「直接上级」
     字段不会报错,但会静默流进倚天下发数据 —— 本仓吃过 extra=allow 假绿的亏。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from projects import read_sheet_by_header

MAX_LEVELS = 5

# appCard 字段上限(蓝信官方参数表,单位:UTF-8 字节)
LIMIT_BODY_TITLE = 600
LIMIT_BODY_SUBTITLE = 1200
LIMIT_BODY_CONTENT = 3000
LIMIT_FIELD_KEY = 18
LIMIT_FIELD_VALUE = 192
LIMIT_SIGNATURE = 96
MAX_FIELDS = 10

SIGNATURE = "项目管理平台"


def fit_bytes(s: str, limit: int) -> str:
    """按 UTF-8 字节截断(中文 3 字节/字)。超出时末尾加 '…'(自身 3 字节)。
    绝不切半个字符 —— 逐字符累加,放不下就停。"""
    b = s.encode("utf-8")
    if len(b) <= limit:
        return s
    ell = "…"
    budget = limit - len(ell.encode("utf-8"))
    if budget <= 0:
        return ""
    out = []
    used = 0
    for ch in s:
        n = len(ch.encode("utf-8"))
        if used + n > budget:
            break
        out.append(ch)
        used += n
    return "".join(out) + ell


def read_org_tree(path: str) -> Dict[str, Any]:
    """组织架构表 → {'byId': {工号: {name,supId,l4,l31}}, 'byName': {姓名: [工号,...]}}。
    读全表,不按 新L3组织 过滤(见模块 docstring)。工号大写归一,与花名册跨域连接键一致。
    byName 的值是 list —— 为重名(1:N)留位,消费方必须自行处理 len>1。"""
    rows = read_sheet_by_header(path, "工号")
    by_id: Dict[str, Dict[str, Any]] = {}
    by_name: Dict[str, List[str]] = {}
    for r in rows:
        emp = str(r.get("工号") or "").strip().upper()
        if not emp:
            continue
        name = str(r.get("姓名") or "").strip()
        sup = str(r.get("直接上级工号") or "").strip().upper() or None
        by_id[emp] = {
            "name": name,
            "supId": sup,
            "l4": str(r.get("新L4组织") or "").strip(),
            "l31": str(r.get("新L3-1组织") or "").strip(),
        }
        if name:
            by_name.setdefault(name, []).append(emp)
    return {"byId": by_id, "byName": by_name}


def supervisor_chain(tree: Dict[str, Any], emp_id: str, levels: int) -> List[str]:
    """从 emp_id 向上最多 levels 级,返回上级工号列表(不含自己,近的在前)。
    带环检测(seen)、深度上限;上级为空/不在册 → 停止(不报错:L4 组长的 +3 本就没有对象)。"""
    if levels <= 0:
        return []
    levels = min(levels, MAX_LEVELS)
    by_id = tree["byId"]
    out: List[str] = []
    seen = {emp_id}
    cur = (by_id.get(emp_id) or {}).get("supId")
    while cur and cur not in seen and cur in by_id and len(out) < levels:
        out.append(cur)
        seen.add(cur)
        cur = by_id[cur].get("supId")
    return out


def resolve_project_manager(tree: Dict[str, Any],
                            pmis_team: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """PMIS team.项目经理(姓名) → 工号。→ (工号, None) 或 (None, 原因)。
    1:N 时跳过并报告 —— 推给错的人比不推更糟。"""
    name = str((pmis_team or {}).get("项目经理") or "").strip()
    if not name:
        return None, "项目无经理"
    ids = tree["byName"].get(name) or []
    if not ids:
        return None, "经理不在花名册"
    if len(ids) > 1:
        return None, "姓名映射到多个工号"
    return ids[0], None


def _field(key: str, value: str) -> Dict[str, str]:
    return {"key": fit_bytes(key, LIMIT_FIELD_KEY), "value": fit_bytes(value, LIMIT_FIELD_VALUE)}


def _card(head: str, title: str, subtitle: str, fields: List[Dict[str, str]],
          content: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "headTitle": head,
        "bodyTitle": fit_bytes(title, LIMIT_BODY_TITLE),
        "bodySubTitle": fit_bytes(subtitle, LIMIT_BODY_SUBTITLE),
        "fields": fields[:MAX_FIELDS],
        "signature": fit_bytes(SIGNATURE, LIMIT_SIGNATURE),
    }
    if content:
        out["bodyContent"] = fit_bytes(content, LIMIT_BODY_CONTENT)
    return out


def build_timesheet_card(name: str, issues: List[Dict[str, Any]],
                         start: str, end: str) -> Dict[str, Any]:
    """工时卡 → 填报人本人。问题类型共 7 类,fields 恒 ≤10 对,永不撞线。"""
    total = sum(int(i["count"]) for i in issues)
    rows = sorted(issues, key=lambda i: -int(i["count"]))
    fields = [_field(i["label"], "%d 条" % int(i["count"])) for i in rows]
    return _card("工时填报提醒",
                 "你有 %d 条工时填报存在问题" % total,
                 "统计区间 %s ~ %s" % (start, end),
                 fields)


def build_project_card(name: str, by_reason: Dict[str, List[str]]) -> Dict[str, Any]:
    """项目卡 → 项目经理本人。
    fields 按【原因】排(共 8 类,恒 ≤10 对) —— 不能按项目名排:实测单人最多背 49 个项目。
    具体项目名进 bodyContent(3000 字节/八行),超出显式写「另有 N 个未列出」。"""
    rows = sorted(by_reason.items(), key=lambda kv: -len(kv[1]))
    fields = [_field(r, "%d 个项目" % len(ps)) for r, ps in rows]
    distinct = len({p for ps in by_reason.values() for p in ps})

    lines: List[str] = []
    used = 0
    omitted = 0
    for reason, names in rows:
        line = "%s：%s" % (reason, "、".join(names))
        n = len(line.encode("utf-8")) + 1
        if used + n > LIMIT_BODY_CONTENT - 60:      # 预留「另有…」的位置
            omitted += len(names)
            continue
        lines.append(line)
        used += n
    if omitted:
        lines.append("另有 %d 个项目未列出" % omitted)
    return _card("项目关注提醒",
                 "你名下 %d 个项目存在关注原因" % distinct,
                 "",
                 fields,
                 "\n".join(lines))


def build_summary_card(name: str, rows: List[Dict[str, Any]],
                       level_label: str) -> Dict[str, Any]:
    """汇总卡 → 上级。按【直接下属 × 原因】嵌套聚合:key=姓名, value='N 项：原因 n · 原因 n'。
    数字是该下属整棵子树的合计(逐层卷上去)。只列有异常的直属。
    主动不越 10 对 —— 蓝信超限行为未知,不去赌。"""
    ordered = sorted(rows, key=lambda r: -int(r["total"]))
    shown = ordered[:MAX_FIELDS]
    rest = ordered[MAX_FIELDS:]
    total = sum(int(r["total"]) for r in ordered)

    fields: List[Dict[str, str]] = []
    for r in shown:
        parts = ["%s %d" % (c, n) for c, n in sorted(r["reasons"], key=lambda x: -x[1])]
        value = "%d 项：%s" % (int(r["total"]), " · ".join(parts))
        # value 超 192 字节时逐个丢掉最小的原因,末尾以「等」示意
        while len(value.encode("utf-8")) > LIMIT_FIELD_VALUE and len(parts) > 1:
            parts.pop()
            value = "%d 项：%s 等" % (int(r["total"]), " · ".join(parts))
        fields.append(_field(r["name"], value))

    content = ""
    if rest:
        content = "另有 %d 人共 %d 项未列出" % (len(rest), sum(int(r["total"]) for r in rest))
    return _card("项目关注提醒",
                 "你的团队有 %d 个项目存在关注原因" % total,
                 level_label,
                 fields,
                 content)
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_lanxin_recipients.py -q`
Expected: PASS（20 个用例）

- [ ] **Step 5: 用真实花名册冒烟（不进测试套件，只跑一次看数字对不对）**

```bash
python -c "
import lanxin_recipients as LR, config, os
t = LR.read_org_tree(os.path.join('input', config.ORG_FILE))
print('人数:', len(t['byId']))
root = [i for i, v in t['byId'].items() if not v['supId']]
print('根:', [t['byId'][r]['name'] for r in root])
staff = [i for i in t['byId'] if not any(v['supId'] == i for v in t['byId'].values())]
print('员工级(无下属):', len(staff))
import collections
for lv in (1, 2, 3):
    c = collections.Counter()
    for i in staff:
        ch = LR.supervisor_chain(t, i, lv)
        if len(ch) >= lv: c[ch[lv-1]] += 1
    print('+%d 级收件人 %d 位' % (lv, len(c)))
"
```
Expected（与 spec §1.2 实测一致，对不上就是读表出了问题）：
```
人数: 85
根: ['张英哲']
员工级(无下属): 71
+1 级收件人 11 位
+2 级收件人 2 位
+3 级收件人 1 位
```

- [ ] **Step 6: 提交**

```bash
git add lanxin_recipients.py tests/test_lanxin_recipients.py
git commit -m "feat(lanxin): 组织树/收件人解析/卡片组装(环检测+1:N防猜+UTF8字节截断+fields主动不越限)"
```

---

### Task 3: `lanxin.py` 蓝信 API 客户端

**Files:**
- Create: `lanxin.py`
- Test: `tests/test_lanxin.py`

**Interfaces:**
- Consumes: 无（只依赖标准库；`cfg` 由调用方传入）
- Produces: `LanxinError` / `get_app_token(cfg)` / `id_mapping(cfg, token, emp_id)` / `send_message(cfg, token, staff_ids, msg_data)` / `_reset_token_cache()`（测试用）

**蓝信接口事实（官方文档实证，不要自行改动路径与参数名）：**
- `GET {gateway}/v1/apptoken/create?grant_type=client_credential&appid=&secret=` → `{errCode, errMsg, data:{appToken, expiresIn}}`，`expiresIn` = **7200**
- `GET {gateway}/v2/staffs/id_mapping/fetch?app_token=&org_id=&id_type=&id_value=` → `{errCode, errMsg, data:{staffId}}`
- `POST {gateway}/v1/messages/create?app_token=`，`Content-Type: application/json`，body `{userIdList, msgType, msgData}` → `{errCode, errMsg, data:{invalidStaff, invalidDepartment, msgId}}`
- **`errCode == 0` 才是成功**；`msgType` 此端点只支持 `text`/`oacard`/`linkCard`/`appCard`；`userIdList` ≤1000
- 错误码：`10005` 无权限（**不重试**，权限问题重试无用）/ `56008` 触发限流（**退避重试**）/ `40060` `40062` `45000` `50084` `52051`

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin.py`：

```python
import json
import pytest
import lanxin as LX


CFG = {
    "credentials": {"appId": "app-1", "appSecret": "sec-1", "orgId": "524288",
                    "apiGateway": "https://apigw.example.com", "idType": "employ_id"},
    "sendIntervalMs": 0,
}


class FakeHTTP:
    """替身:记录请求 URL/body,按队列返回响应。"""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, url, data=None, headers=None, timeout=None):
        self.calls.append({"url": url, "data": data, "headers": headers})
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture(autouse=True)
def _reset():
    LX._reset_token_cache()
    yield
    LX._reset_token_cache()


def test_get_app_token_ok(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok",
                      "data": {"appToken": "T1", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    assert LX.get_app_token(CFG) == "T1"
    assert "/v1/apptoken/create" in fake.calls[0]["url"]
    assert "grant_type=client_credential" in fake.calls[0]["url"]


def test_get_app_token_cached_second_call_no_http(monkeypatch):
    """官方建议缓存(7200s)。第二次调用不应再打网络。"""
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok",
                      "data": {"appToken": "T1", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    LX.get_app_token(CFG)
    LX.get_app_token(CFG)
    assert len(fake.calls) == 1


def test_get_app_token_refetch_after_expiry(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"appToken": "T1", "expiresIn": 7200}},
                     {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T2", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    t = [1000.0]
    monkeypatch.setattr(LX.time, "time", lambda: t[0])
    assert LX.get_app_token(CFG) == "T1"
    t[0] += 7200            # 已过期(且含 300s 提前量)
    assert LX.get_app_token(CFG) == "T2"


def test_errcode_nonzero_raises_lanxin_error(monkeypatch):
    monkeypatch.setattr(LX, "_http", FakeHTTP([{"errCode": 40017, "errMsg": "secret 错误"}]))
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(CFG)
    assert e.value.err_code == 40017


def test_error_never_leaks_secret_or_token(monkeypatch):
    """铁律:密钥绝不进异常消息。"""
    monkeypatch.setattr(LX, "_http", FakeHTTP([{"errCode": 40017, "errMsg": "boom"}]))
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(CFG)
    s = str(e.value) + repr(e.value)
    assert "sec-1" not in s


def test_id_mapping_ok(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"staffId": "524288-abc"}}])
    monkeypatch.setattr(LX, "_http", fake)
    assert LX.id_mapping(CFG, "T1", "A000701") == "524288-abc"
    u = fake.calls[0]["url"]
    assert "/v2/staffs/id_mapping/fetch" in u
    assert "id_type=employ_id" in u
    assert "org_id=524288" in u
    assert "A000701" in u


def test_send_message_posts_json(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok",
                      "data": {"msgId": "M1", "invalidStaff": [], "invalidDepartment": []}}])
    monkeypatch.setattr(LX, "_http", fake)
    r = LX.send_message(CFG, "T1", ["524288-abc"], {"appCard": {"bodyTitle": "x"}})
    assert r["msgId"] == "M1"
    call = fake.calls[0]
    assert "/v1/messages/create" in call["url"]
    assert call["headers"]["Content-Type"] == "application/json"
    body = json.loads(call["data"].decode("utf-8"))
    assert body["userIdList"] == ["524288-abc"]
    assert body["msgType"] == "appCard"


def test_send_message_rejects_over_1000_recipients():
    """蓝信文档:userIdList 最多 1000。超了本地就拦,不浪费一次网络往返。"""
    with pytest.raises(ValueError):
        LX.send_message(CFG, "T1", ["x"] * 1001, {"appCard": {}})


def test_send_message_infers_msgtype_from_msgdata_key(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}}])
    monkeypatch.setattr(LX, "_http", fake)
    LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})
    assert json.loads(fake.calls[0]["data"].decode("utf-8"))["msgType"] == "text"


def test_rate_limit_56008_retries_with_backoff(monkeypatch):
    """56008 触发限流 → 退避重试。阈值文档未写,只能靠重试兜。"""
    fake = FakeHTTP([{"errCode": 56008, "errMsg": "限流"},
                     {"errCode": 56008, "errMsg": "限流"},
                     {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M3"}}])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    assert LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})["msgId"] == "M3"
    assert len(fake.calls) == 3


def test_rate_limit_gives_up_after_max_retries(monkeypatch):
    fake = FakeHTTP([{"errCode": 56008, "errMsg": "限流"}] * 4)
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    with pytest.raises(LX.LanxinError) as e:
        LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})
    assert e.value.err_code == 56008
    assert len(fake.calls) == 4          # 1 次 + 3 次重试


def test_no_permission_10005_not_retried(monkeypatch):
    """权限问题重试无用,立即失败(否则白等 7 秒)。"""
    fake = FakeHTTP([{"errCode": 10005, "errMsg": "无权限"}])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    with pytest.raises(LX.LanxinError) as e:
        LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})
    assert e.value.err_code == 10005
    assert len(fake.calls) == 1


def test_missing_gateway_raises_clear_error():
    cfg = {"credentials": {"apiGateway": "", "appId": "a", "appSecret": "b", "orgId": "1",
                           "idType": "employ_id"}}
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(cfg)
    assert "网关" in e.value.err_msg
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_lanxin.py -q`
Expected: FAIL —— `ModuleNotFoundError: No module named 'lanxin'`

- [ ] **Step 3: 写实现**

创建 `lanxin.py`（本任务只做客户端三函数；`build_plan` / `dispatch` 在 Task 4 追加到同文件）：

```python
# lanxin.py
"""蓝信开放平台客户端。纯标准库(urllib),无第三方依赖。

铁律:appSecret / appToken 绝不进异常消息、日志、审计。本模块所有错误只带 errCode/errMsg。
接口事实(官方文档):所有返回含 errCode/errMsg,errCode==0 才是成功;appToken 有效期 7200s。
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

HTTP_TIMEOUT = 15
TOKEN_EARLY_EXPIRE = 300          # 提前 5 分钟视为过期,避免边界失败
MAX_RECIPIENTS = 1000             # 蓝信文档:userIdList 最多 1000
RATE_LIMIT_CODE = 56008
NO_PERMISSION_CODE = 10005
RETRY_BACKOFF = (1, 2, 4)         # 仅用于 56008

_token_cache: Dict[str, Any] = {}
_token_lock = threading.Lock()


class LanxinError(Exception):
    def __init__(self, err_code: int, err_msg: str):
        self.err_code = err_code
        self.err_msg = err_msg
        super().__init__("蓝信接口错误 %s: %s" % (err_code, err_msg))


def _reset_token_cache() -> None:
    """测试用:清空 appToken 缓存。"""
    with _token_lock:
        _token_cache.clear()


def _http(url: str, data: Optional[bytes] = None,
          headers: Optional[Dict[str, str]] = None, timeout: int = HTTP_TIMEOUT) -> Dict[str, Any]:
    """单次 HTTP 调用 → 解析后的 JSON。测试通过 monkeypatch 替换本函数。"""
    req = urllib.request.Request(url, data=data, headers=headers or {},
                                 method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise LanxinError(-1, "HTTP %s" % e.code)
    except urllib.error.URLError as e:
        raise LanxinError(-1, "网络不可达:%s" % type(e.reason).__name__)
    except json.JSONDecodeError:
        raise LanxinError(-1, "响应不是合法 JSON")


def _gateway(cfg: Dict[str, Any]) -> str:
    gw = ((cfg.get("credentials") or {}).get("apiGateway") or "").rstrip("/")
    if not gw:
        raise LanxinError(-1, "未配置开放平台网关地址")
    return gw


def _unwrap(resp: Dict[str, Any]) -> Dict[str, Any]:
    """errCode==0 → data;否则抛 LanxinError。errMsg 原样透传(蓝信自己的文案,不含我方密钥)。"""
    code = resp.get("errCode")
    if code != 0:
        raise LanxinError(int(code) if isinstance(code, int) else -1,
                          str(resp.get("errMsg") or "未知错误"))
    return resp.get("data") or {}


def get_app_token(cfg: Dict[str, Any]) -> str:
    """GET /v1/apptoken/create。按 appId 缓存(expiresIn 7200s,提前 300s 视为过期)。"""
    cred = cfg.get("credentials") or {}
    app_id = cred.get("appId") or ""
    with _token_lock:
        hit = _token_cache.get(app_id)
        if hit and hit["exp"] > time.time():
            return hit["token"]
    gw = _gateway(cfg)
    q = urllib.parse.urlencode({"grant_type": "client_credential",
                                "appid": app_id, "secret": cred.get("appSecret") or ""})
    data = _unwrap(_http("%s/v1/apptoken/create?%s" % (gw, q)))
    token = data.get("appToken") or ""
    expires = int(data.get("expiresIn") or 7200)
    with _token_lock:
        _token_cache[app_id] = {"token": token, "exp": time.time() + expires - TOKEN_EARLY_EXPIRE}
    return token


def id_mapping(cfg: Dict[str, Any], token: str, emp_id: str) -> str:
    """GET /v2/staffs/id_mapping/fetch → staffId。id_type 取自配置(默认 employ_id)。"""
    cred = cfg.get("credentials") or {}
    q = urllib.parse.urlencode({
        "app_token": token, "org_id": cred.get("orgId") or "",
        "id_type": cred.get("idType") or "employ_id", "id_value": emp_id,
    })
    data = _unwrap(_http("%s/v2/staffs/id_mapping/fetch?%s" % (_gateway(cfg), q)))
    return data.get("staffId") or ""


def send_message(cfg: Dict[str, Any], token: str, staff_ids: List[str],
                 msg_data: Dict[str, Any]) -> Dict[str, Any]:
    """POST /v1/messages/create。msgType 由 msg_data 的唯一键推断(text/appCard/...)。
    56008 限流 → 退避重试;10005 无权限 → 立即失败(重试无用)。"""
    if len(staff_ids) > MAX_RECIPIENTS:
        raise ValueError("userIdList 最多 %d 个,当前 %d" % (MAX_RECIPIENTS, len(staff_ids)))
    keys = list(msg_data.keys())
    if len(keys) != 1:
        raise ValueError("msgData 必须且只能含一个消息体键")
    body = json.dumps({"userIdList": list(staff_ids), "msgType": keys[0], "msgData": msg_data},
                      ensure_ascii=False).encode("utf-8")
    url = "%s/v1/messages/create?%s" % (_gateway(cfg),
                                        urllib.parse.urlencode({"app_token": token}))
    headers = {"Content-Type": "application/json"}

    last: Optional[LanxinError] = None
    for attempt in range(len(RETRY_BACKOFF) + 1):
        try:
            return _unwrap(_http(url, data=body, headers=headers))
        except LanxinError as e:
            if e.err_code != RATE_LIMIT_CODE:
                raise
            last = e
            if attempt < len(RETRY_BACKOFF):
                time.sleep(RETRY_BACKOFF[attempt])
    raise last            # type: ignore[misc]
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_lanxin.py -q`
Expected: PASS（14 个用例）

- [ ] **Step 5: 提交**

```bash
git add lanxin.py tests/test_lanxin.py
git commit -m "feat(lanxin): 开放平台客户端(标准库/token缓存/56008退避/10005不重试/密钥不入异常)"
```

---

# 波次 B —— 编排（T4 单独，消费 T1/T2/T3）

### Task 4: `build_plan` / `dispatch`

**Files:**
- Modify: `lanxin.py`（在文件末尾追加，不改动 Task 3 的三个函数）
- Modify: `tests/test_lanxin.py`（追加 describe 段）

**Interfaces:**
- Consumes:
  - `lanxin_recipients.supervisor_chain(tree, emp_id, levels)` / `resolve_project_manager(tree, pmis_team)` / `build_timesheet_card(name, issues, start, end)` / `build_project_card(name, by_reason)` / `build_summary_card(name, rows, level_label)`
  - `lanxin.get_app_token(cfg)` / `id_mapping(cfg, token, emp_id)` / `send_message(cfg, token, staff_ids, msg_data)`
- Produces:
  - `build_plan(items, cfg, tree, project_pmis) -> {'recipients': [...], 'unresolved': [...], 'totals': {...}}`
  - `dispatch(plan, cfg) -> {'sent': int, 'failed': [...], 'msgIds': [...]}`

**本任务的核心约束**：`preview` 与 `send` 必须走**同一个** `build_plan()`。禁止为预览另写简化逻辑。

- [ ] **Step 1: 写失败测试**

在 `tests/test_lanxin.py` 末尾追加：

```python
# ── build_plan / dispatch ──────────────────────────────────────────────

TREE = {
    "byId": {
        "A001": {"name": "张英哲", "supId": None, "l4": "", "l31": ""},
        "A002": {"name": "于岩", "supId": "A001", "l4": "", "l31": "服务二部"},
        "A005": {"name": "耿磊磊", "supId": "A002", "l4": "小金融服务组", "l31": "服务二部"},
        "A006": {"name": "张三", "supId": "A005", "l4": "小金融服务组", "l31": "服务二部"},
        "A007": {"name": "李四", "supId": "A005", "l4": "小金融服务组", "l31": "服务二部"},
    },
    "byName": {"张英哲": ["A001"], "于岩": ["A002"], "耿磊磊": ["A005"],
               "张三": ["A006"], "李四": ["A007"]},
}
PMIS = {
    "P1": {"team": {"项目经理": "张三"}},
    "P2": {"team": {"项目经理": "张三"}},
    "P3": {"team": {"项目经理": "李四"}},
    "P9": {"team": {"项目经理": "查无此人"}},
}


def _cfg(project_levels=1, ts_levels=0, project_on=True, ts_on=True):
    c = json.loads(json.dumps(CFG))
    c["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": ts_on,
         "issueCodes": ["MISS_SUMMARY"],
         "recipients": {"primary": True, "supervisorLevels": ts_levels}},
        {"key": "project", "label": "项目关注原因", "enabled": project_on,
         "reasons": ["回款延期", "里程碑滞后"],
         "recipients": {"primary": True, "supervisorLevels": project_levels}},
    ]
    return c


def test_plan_primary_manager_gets_own_card():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P2", "reasons": ["里程碑滞后"]}]
    plan = LX.build_plan(items, _cfg(project_levels=0), TREE, PMIS)
    prim = [r for r in plan["recipients"] if r["role"] == "primary"]
    assert len(prim) == 1
    assert prim[0]["employId"] == "A006"
    assert "2 个项目" in prim[0]["card"]["bodyTitle"]


def test_plan_supervisor_summary_rolls_up_by_direct_report():
    """+2:耿磊磊(直接上级)与于岩(隔级)各一张;于岩那张按【直接下属】列 = 只有耿磊磊一行。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P3", "reasons": ["回款延期"]}]
    plan = LX.build_plan(items, _cfg(project_levels=2), TREE, PMIS)
    sup = {r["employId"]: r for r in plan["recipients"] if r["role"] == "supervisor"}
    assert set(sup) == {"A005", "A002"}
    # 耿磊磊直接带 张三/李四 → 2 行
    assert {f["key"] for f in sup["A005"]["card"]["fields"]} == {"张三", "李四"}
    # 于岩直接只带 耿磊磊 → 1 行,数字是整棵子树合计 2
    assert [f["key"] for f in sup["A002"]["card"]["fields"]] == ["耿磊磊"]
    assert sup["A002"]["card"]["fields"][0]["value"].startswith("2 项：")


def test_plan_levels_zero_no_supervisor():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}]
    plan = LX.build_plan(items, _cfg(project_levels=0), TREE, PMIS)
    assert [r for r in plan["recipients"] if r["role"] == "supervisor"] == []


def test_plan_primary_false_only_supervisor():
    c = _cfg(project_levels=1)
    c["routes"][1]["recipients"]["primary"] = False
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         c, TREE, PMIS)
    assert [r["role"] for r in plan["recipients"]] == ["supervisor"]


def test_plan_route_disabled_drops_items():
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         _cfg(project_on=False), TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_filters_reasons_not_in_config():
    """配置里取消勾选的原因不参与推送。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["数据异常"]}]
    plan = LX.build_plan(items, _cfg(project_levels=0), TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_unresolved_manager_not_in_roster():
    """实测 managerNotInOrg 有 6 个项目会走到这里 —— 必须显式列出,不静默丢。"""
    plan = LX.build_plan([{"kind": "project", "projectId": "P9", "reasons": ["回款延期"]}],
                         _cfg(), TREE, PMIS)
    assert plan["recipients"] == []
    assert plan["unresolved"] == [{"kind": "project", "id": "P9",
                                   "name": "查无此人", "reason": "经理不在花名册"}]


def test_plan_unresolved_unknown_project_id():
    plan = LX.build_plan([{"kind": "project", "projectId": "NOPE", "reasons": ["回款延期"]}],
                         _cfg(), TREE, PMIS)
    assert plan["unresolved"][0]["reason"] == "项目不存在"


def test_plan_timesheet_primary():
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]}]
    plan = LX.build_plan(items, _cfg(), TREE, PMIS)
    assert len(plan["recipients"]) == 1
    assert plan["recipients"][0]["card"]["headTitle"] == "工时填报提醒"


def test_plan_timesheet_filters_issue_codes():
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 1}]}]
    plan = LX.build_plan(items, _cfg(), TREE, PMIS)      # 配置只勾了 MISS_SUMMARY
    assert plan["recipients"] == []


def test_plan_timesheet_employ_not_in_roster_unresolved():
    items = [{"kind": "timesheet", "employId": "ZZZ",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
    plan = LX.build_plan(items, _cfg(), TREE, PMIS)
    assert plan["unresolved"][0]["reason"] == "工号不在花名册"


def test_plan_is_deterministic_same_input_same_output():
    """preview 与 send 走同一 build_plan;两次调用必须逐字段相等 —— 这是「所见即所发」的锚点。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P3", "reasons": ["里程碑滞后"]}]
    a = LX.build_plan(items, _cfg(project_levels=2), TREE, PMIS)
    b = LX.build_plan(items, _cfg(project_levels=2), TREE, PMIS)
    assert json.dumps(a, ensure_ascii=False, sort_keys=True) == \
           json.dumps(b, ensure_ascii=False, sort_keys=True)


def test_plan_totals():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P9", "reasons": ["回款延期"]}]
    plan = LX.build_plan(items, _cfg(project_levels=1), TREE, PMIS)
    assert plan["totals"]["recipients"] == len(plan["recipients"])
    assert plan["totals"]["unresolved"] == 1


def test_dispatch_sends_each_recipient(monkeypatch):
    plan = {"recipients": [{"employId": "A006", "name": "张三", "role": "primary",
                            "card": {"bodyTitle": "x"}},
                           {"employId": "A005", "name": "耿磊磊", "role": "supervisor",
                            "card": {"bodyTitle": "y"}}],
            "unresolved": [], "totals": {}}
    fake = FakeHTTP([
        {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T", "expiresIn": 7200}},
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A006"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M1"}},
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A005"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}},
    ])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    r = LX.dispatch(plan, _cfg())
    assert r["sent"] == 2
    assert r["failed"] == []
    assert r["msgIds"] == ["M1", "M2"]


def test_dispatch_one_failure_does_not_stop_the_batch(monkeypatch):
    """一个人发失败,不能连累后面的人 —— 必须继续,并如实报告。"""
    plan = {"recipients": [{"employId": "A006", "name": "张三", "role": "primary",
                            "card": {"bodyTitle": "x"}},
                           {"employId": "A007", "name": "李四", "role": "primary",
                            "card": {"bodyTitle": "y"}}],
            "unresolved": [], "totals": {}}
    fake = FakeHTTP([
        {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T", "expiresIn": 7200}},
        {"errCode": 40062, "errMsg": "消息接收者为空或格式错"},          # A006 换 staffId 失败
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A007"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}},
    ])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    r = LX.dispatch(plan, _cfg())
    assert r["sent"] == 1
    assert len(r["failed"]) == 1
    assert r["failed"][0]["employId"] == "A006"
    assert r["failed"][0]["errCode"] == 40062


def test_dispatch_reuses_staffid_cache_within_one_run(monkeypatch):
    """同一人在两条路由里都命中时,id_mapping 只该调一次。"""
    plan = {"recipients": [{"employId": "A006", "name": "张三", "role": "primary",
                            "card": {"bodyTitle": "x"}},
                           {"employId": "A006", "name": "张三", "role": "supervisor",
                            "card": {"bodyTitle": "y"}}],
            "unresolved": [], "totals": {}}
    fake = FakeHTTP([
        {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T", "expiresIn": 7200}},
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A006"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M1"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}},
    ])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    r = LX.dispatch(plan, _cfg())
    assert r["sent"] == 2
    id_calls = [c for c in fake.calls if "id_mapping" in c["url"]]
    assert len(id_calls) == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_lanxin.py -q`
Expected: FAIL —— `AttributeError: module 'lanxin' has no attribute 'build_plan'`

- [ ] **Step 3: 写实现**

在 `lanxin.py` 末尾追加：

```python
# ── 编排:build_plan(纯计算) / dispatch(真发) ─────────────────────────────
#
# preview 与 send 必须走同一个 build_plan —— 「所见即所发」是结构保证,不是约定。
# 禁止为预览另写简化逻辑。

from lanxin_recipients import (           # noqa: E402  (置于此处以免与客户端段落交叉引用)
    build_project_card, build_summary_card, build_timesheet_card,
    resolve_project_manager, supervisor_chain,
)

_LEVEL_LABELS = {1: "直接上级（+1）", 2: "隔级上级（+2）", 3: "部门级（+3）",
                 4: "上级（+4）", 5: "上级（+5）"}


def _route(cfg: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    for r in cfg.get("routes") or []:
        if r.get("key") == key and r.get("enabled"):
            return r
    return None


def _descend_owner(tree: Dict[str, Any], sup_id: str, emp_id: str) -> Optional[str]:
    """emp_id 向上走,找到 sup_id 的那个【直接下属】 —— 汇总卡按直接下属聚合、逐层卷上去。
    emp_id 本身就是 sup_id 的直接下属时返回自己。"""
    by_id = tree["byId"]
    cur = emp_id
    seen = set()
    while cur and cur not in seen and cur in by_id:
        seen.add(cur)
        nxt = by_id[cur].get("supId")
        if nxt == sup_id:
            return cur
        cur = nxt
    return None


def build_plan(items: List[Dict[str, Any]], cfg: Dict[str, Any],
               tree: Dict[str, Any], project_pmis: Dict[str, Any]) -> Dict[str, Any]:
    """事项 → 收件计划。纯计算,不发任何网络请求。
    项目侧:projectId → 项目经理(姓名) → 工号(后端自行推导,不信任前端);工时侧:employId 直连。"""
    unresolved: List[Dict[str, Any]] = []
    # primary 工号 → {原因: [项目名/条数]}
    proj_by_emp: Dict[str, Dict[str, List[str]]] = {}
    ts_by_emp: Dict[str, List[Dict[str, Any]]] = {}
    ts_range = {"start": "", "end": ""}

    r_proj = _route(cfg, "project")
    r_ts = _route(cfg, "timesheet")

    for it in items:
        kind = it.get("kind")
        if kind == "project" and r_proj:
            allowed = set(r_proj.get("reasons") or [])
            reasons = [x for x in (it.get("reasons") or []) if x in allowed]
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
            allowed = set(r_ts.get("issueCodes") or [])
            issues = [i for i in (it.get("issues") or []) if i.get("code") in allowed]
            if not issues:
                continue
            emp = str(it.get("employId") or "").strip().upper()
            if emp not in tree["byId"]:
                unresolved.append({"kind": "timesheet", "id": emp, "name": "",
                                   "reason": "工号不在花名册"})
                continue
            ts_by_emp.setdefault(emp, []).extend(issues)
            ts_range["start"] = it.get("start") or ts_range["start"]
            ts_range["end"] = it.get("end") or ts_range["end"]

    recipients: List[Dict[str, Any]] = []
    by_id = tree["byId"]

    # ① primary 卡
    if r_ts and r_ts["recipients"]["primary"]:
        for emp in sorted(ts_by_emp):
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "card": build_timesheet_card(by_id[emp]["name"], ts_by_emp[emp],
                                             ts_range["start"], ts_range["end"]),
            })
    if r_proj and r_proj["recipients"]["primary"]:
        for emp in sorted(proj_by_emp):
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "card": build_project_card(by_id[emp]["name"], proj_by_emp[emp]),
            })

    # ② 汇总卡:按【直接下属】聚合,数字是该下属整棵子树的合计
    if r_proj:
        levels = r_proj["recipients"]["supervisorLevels"]
        # sup 工号 → 直接下属工号 → {原因: 计数}
        agg: Dict[str, Dict[str, Dict[str, int]]] = {}
        for emp, by_reason in proj_by_emp.items():
            for sup in supervisor_chain(tree, emp, levels):
                owner = _descend_owner(tree, sup, emp)
                if not owner:
                    continue
                slot = agg.setdefault(sup, {}).setdefault(owner, {})
                for reason, names in by_reason.items():
                    slot[reason] = slot.get(reason, 0) + len(names)
        for sup in sorted(agg):
            rows = []
            for owner, reasons in agg[sup].items():
                rows.append({"name": by_id[owner]["name"],
                             "total": sum(reasons.values()),
                             "reasons": list(reasons.items())})
            label = _LEVEL_LABELS.get(_level_of(tree, sup, proj_by_emp), "上级汇总")
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "card": build_summary_card(by_id[sup]["name"], rows, label),
            })

    return {"recipients": recipients, "unresolved": unresolved,
            "totals": {"recipients": len(recipients), "unresolved": len(unresolved)}}


MAX_LEVELS_PROBE = 5


def _level_of(tree: Dict[str, Any], sup_id: str, proj_by_emp: Dict[str, Any]) -> int:
    """sup 相对于命中他的 primary 的最小级差(用于卡片副标题文案)。"""
    best = 99
    for emp in proj_by_emp:
        ch = supervisor_chain(tree, emp, MAX_LEVELS_PROBE)
        if sup_id in ch:
            best = min(best, ch.index(sup_id) + 1)
    return best if best != 99 else 1


def dispatch(plan: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """按 plan 真发。串行 + 间隔(单线程 HTTPServer,且限流阈值未知);
    单人失败不中断整批,如实计入 failed。"""
    token = get_app_token(cfg)
    interval = int(cfg.get("sendIntervalMs") or 0) / 1000.0
    staff_cache: Dict[str, str] = {}
    sent = 0
    failed: List[Dict[str, Any]] = []
    msg_ids: List[str] = []

    for r in plan["recipients"]:
        emp = r["employId"]
        try:
            sid = staff_cache.get(emp)
            if not sid:
                sid = id_mapping(cfg, token, emp)
                if not sid:
                    raise LanxinError(-1, "未换到 staffId")
                staff_cache[emp] = sid
            data = send_message(cfg, token, [sid], {"appCard": r["card"]})
            if data.get("invalidStaff"):
                raise LanxinError(-1, "蓝信侧认为该人员ID无效")
            sent += 1
            if data.get("msgId"):
                msg_ids.append(data["msgId"])
        except LanxinError as e:
            failed.append({"employId": emp, "name": r["name"],
                           "errCode": e.err_code, "errMsg": e.err_msg})
        except Exception as e:                      # 兜底:绝不让单人异常炸掉整批
            failed.append({"employId": emp, "name": r["name"],
                           "errCode": -1, "errMsg": type(e).__name__})
        if interval:
            time.sleep(interval)

    return {"sent": sent, "failed": failed, "msgIds": msg_ids}
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_lanxin.py -q`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add lanxin.py tests/test_lanxin.py
git commit -m "feat(lanxin): build_plan/dispatch(preview与send同一路径/汇总按直接下属卷/单人失败不中断)"
```

---

# 波次 C —— 端点与前端口径（T5 / T6 可并行）

### Task 5: server.py 端点 + 审计

**Files:**
- Modify: `server.py`（`_SUPER_ONLY_PATHS` 加 4 条；GET/POST 分发各加分支；新增 4 个 handler）
- Modify: `audit.py`（`_ACTION_MAP` 加 4 条）
- Test: `tests/test_lanxin_server.py`（新建）

**Interfaces:**
- Consumes: `lanxin_config.{load_config,save_config,public_config,default_config}` / `lanxin_recipients.read_org_tree` / `lanxin.{build_plan,dispatch,get_app_token,id_mapping,send_message,LanxinError}`
- Produces: 4 个端点

**照现有范式做**：参考 `server.py` 中 `/api/yitian/rules` 的 handler 写法（超管闸 + 读 body + try/except → 400）。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin_server.py`：

```python
import audit


def test_action_map_has_all_lanxin_endpoints():
    """审计埋点靠 _ACTION_MAP 按 (method,path) 查表。
    新端点不加条目 → map_action 返 None → 一条审计都不写(V3.3.0 实际踩过的死埋点)。"""
    for m, p in [("POST", "/api/lanxin/config"),
                 ("POST", "/api/lanxin/selftest"),
                 ("POST", "/api/lanxin/send")]:
        assert audit.map_action(m, p) is not None, "%s %s 缺审计条目" % (m, p)


def test_preview_is_not_audited_or_is_audited_consistently():
    """preview 不改任何状态,可不审计;但若审计则必须有条目。此测试锁定当前选择:不审计。"""
    assert audit.map_action("POST", "/api/lanxin/preview") is None


def test_super_only_paths_cover_lanxin():
    import server
    for p in ["/api/lanxin/config", "/api/lanxin/selftest",
              "/api/lanxin/preview", "/api/lanxin/send"]:
        assert p in server._SUPER_ONLY_PATHS, "%s 未进超管闸" % p
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_lanxin_server.py -q`
Expected: FAIL —— `AssertionError: POST /api/lanxin/config 缺审计条目`

- [ ] **Step 3: 改 `audit.py`**

在 `_ACTION_MAP` 中（数据运维分组之后）追加：

```python
    # 蓝信推送
    ('POST', '/api/lanxin/config'): ('lanxin.config', '蓝信推送配置'),
    ('POST', '/api/lanxin/selftest'): ('lanxin.selftest', '蓝信连通性自检'),
    ('POST', '/api/lanxin/send'): ('lanxin.send', '蓝信推送发送'),
```

（`preview` 不改状态，不审计。）

- [ ] **Step 4: 改 `server.py` —— 超管闸**

在 `_SUPER_ONLY_PATHS` 集合中追加：

```python
    '/api/lanxin/config', '/api/lanxin/selftest',
    '/api/lanxin/preview', '/api/lanxin/send',
```

- [ ] **Step 5: 改 `server.py` —— 常量与 handler**

在文件顶部 import 区加：

```python
import lanxin
import lanxin_config
import lanxin_recipients
```

在 `BUDGET_CONFIG_FILE` 附近加常量：

```python
LANXIN_CONFIG_FILE = os.path.join(BASE_DIR, 'data', 'lanxin_config.json')
```

在 GET 分发里加：

```python
        elif parsed.path == '/api/lanxin/config':
            self.handle_lanxin_config_get()
```

在 POST 分发里加：

```python
        elif parsed.path == '/api/lanxin/config':
            self.handle_lanxin_config_save()
        elif parsed.path == '/api/lanxin/selftest':
            self.handle_lanxin_selftest()
        elif parsed.path == '/api/lanxin/preview':
            self.handle_lanxin_preview()
        elif parsed.path == '/api/lanxin/send':
            self.handle_lanxin_send()
```

新增 handler（放在倚天 rules handler 附近，保持同域聚合）：

```python
    def _lanxin_tree(self):
        """现读 input/组织架构.xlsx 建树。不缓存:花名册是人工维护的 xlsx,
        推送是低频操作,现读保证拿到最新;也免去缓存失效的心智负担。"""
        return lanxin_recipients.read_org_tree(
            os.path.join(BASE_DIR, 'input', config.ORG_FILE))

    def _lanxin_pmis(self):
        """projectPmis 用于 projectId → 项目经理。读整份 analysis_data 即可(已有缓存路径)。"""
        data = _load_analysis_cached()
        return (data or {}).get('projectPmis') or {}

    def handle_lanxin_config_get(self):
        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        self.send_json({'success': True, 'config': lanxin_config.public_config(cfg)})

    def handle_lanxin_config_save(self):
        body = self.read_json_body() or {}
        try:
            saved = lanxin_config.save_config(LANXIN_CONFIG_FILE, body.get('config'))
        except ValueError as e:
            self.send_json({'success': False, 'message': str(e)}, status=400)
            return
        self._audit_set(target='蓝信推送配置', detail='已保存')
        self.send_json({'success': True, 'config': lanxin_config.public_config(saved)})

    def handle_lanxin_selftest(self):
        """三步自检:取 appToken → 用测试工号换 staffId → 给该工号本人发一条 text。
        全程不触碰他人。测试工号由超管手填(accounts.json 无工号字段)。"""
        body = self.read_json_body() or {}
        emp = str(body.get('employId') or '').strip().upper()
        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        steps = []
        token = None
        try:
            token = lanxin.get_app_token(cfg)
            steps.append({'name': '取应用访问TOKEN', 'ok': True, 'msg': '成功'})
        except lanxin.LanxinError as e:
            steps.append({'name': '取应用访问TOKEN', 'ok': False,
                          'msg': '%s (%s)' % (e.err_msg, e.err_code)})
        sid = None
        if token:
            if not emp:
                steps.append({'name': '工号换人员ID', 'ok': False, 'msg': '请填写测试工号'})
            else:
                try:
                    sid = lanxin.id_mapping(cfg, token, emp)
                    steps.append({'name': '工号换人员ID', 'ok': bool(sid),
                                  'msg': sid or '未换到 staffId'})
                except lanxin.LanxinError as e:
                    steps.append({'name': '工号换人员ID', 'ok': False,
                                  'msg': '%s (%s)' % (e.err_msg, e.err_code)})
        if sid:
            try:
                lanxin.send_message(cfg, token, [sid],
                                    {'text': {'content': '项目管理平台 · 蓝信接入自检成功'}})
                steps.append({'name': '发测试消息给本人', 'ok': True, 'msg': '已发送,请查收'})
            except lanxin.LanxinError as e:
                steps.append({'name': '发测试消息给本人', 'ok': False,
                              'msg': '%s (%s)' % (e.err_msg, e.err_code)})
        self._audit_set(target='蓝信连通性自检',
                        detail='工号 %s · %d/%d 步通过' % (emp or '-',
                                                          sum(1 for s in steps if s['ok']),
                                                          len(steps)))
        self.send_json({'success': True, 'steps': steps})

    def handle_lanxin_preview(self):
        body = self.read_json_body() or {}
        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        plan = lanxin.build_plan(body.get('items') or [], cfg,
                                 self._lanxin_tree(), self._lanxin_pmis())
        self.send_json({'success': True, 'plan': plan})

    def handle_lanxin_send(self):
        body = self.read_json_body() or {}
        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        if not cfg.get('enabled'):
            self.send_json({'success': False, 'message': '蓝信推送未启用'}, status=400)
            return
        if not (cfg.get('credentials') or {}).get('apiGateway'):
            self.send_json({'success': False, 'message': '未配置开放平台网关地址'}, status=400)
            return
        # 与 preview 走同一个 build_plan —— 所见即所发
        plan = lanxin.build_plan(body.get('items') or [], cfg,
                                 self._lanxin_tree(), self._lanxin_pmis())
        result = lanxin.dispatch(plan, cfg)
        self._audit_set(target='蓝信推送发送',
                        detail='成功 %d · 失败 %d · 未解析 %d'
                               % (result['sent'], len(result['failed']),
                                  len(plan['unresolved'])))
        self.send_json({'success': True, 'plan': plan, 'result': result})
```

> **实现者须核实**：`_load_analysis_cached()` / `self.read_json_body()` / `self.send_json(..., status=)` / `self._audit_set(...)` 的**确切函数名与签名**以本仓 `server.py` 现有代码为准（上面按现有范式书写）。若名字对不上，**改调用去适配现有代码，不要新增同义函数**。

- [ ] **Step 6: 运行确认通过**

Run: `python -m pytest tests/test_lanxin_server.py -q`
Expected: PASS（3 个用例）

- [ ] **Step 7: 后端全量 + 提交**

```bash
python -m pytest -q
git add server.py audit.py tests/test_lanxin_server.py
git commit -m "feat(lanxin): 4 个超管端点(config/selftest/preview/send)+审计埋点"
```

---

### Task 6: 前端口径层 `lib/lanxin/items.ts` + `lib/lanxinApi.ts`

**Files:**
- Create: `frontend/src/lib/lanxin/items.ts`
- Create: `frontend/src/lib/lanxin/items.test.ts`
- Create: `frontend/src/lib/lanxinApi.ts`

**Interfaces:**
- Consumes（**现有导出，签名不得改**）：
  - `riskReasons(project: Project, pmis?: ProjectPmis, noOrigBudget = false): RiskReason[]`，`RiskReason = { category: RiskCategory; detail: string; tone: 'warn'|'danger'|'mut' }`（from `@/lib/riskReasons`）
  - `issueRows(data: YitianData, start: string, end: string, l4s?: string[], excludedTypes?: string[]): IssueRow[]`，`IssueRow` 含 `empId` / `empName` / `codes: string[]`（from `@/lib/yitian/compliance`）
  - `ISSUE_LABELS: Record<string, string>`（from `@/lib/yitian/compliance`）
  - `api` from `@/api/client`
- Produces: `PushItem` / `projectItems` / `timesheetItems`；`lanxinApi` 五个函数（见「跨任务契约」）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/lanxin/items.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { projectItems, timesheetItems } from './items'
import type { Project, ProjectPmis } from '@/types/analysis'
import type { IssueRow } from '@/lib/yitian/compliance'

const p = (id: string, over: Partial<Project> = {}): Project => ({
  projectId: id, projectName: 'N' + id, projectManager: 'M', orgL4: 'L4',
  ...(over as object),
} as Project)

describe('projectItems', () => {
  it('无关注原因的项目不产出事项', () => {
    expect(projectItems([p('A')], {}, ['回款延期'])).toEqual([])
  })

  it('orgL4 缺失 → 数据异常;勾选了才产出', () => {
    const anomalous = [p('A', { orgL4: '' })]
    expect(projectItems(anomalous, {}, ['数据异常'])).toEqual([
      { kind: 'project', projectId: 'A', reasons: ['数据异常'] },
    ])
    // 未勾选「数据异常」→ 不产出
    expect(projectItems(anomalous, {}, ['回款延期'])).toEqual([])
  })

  it('allowedReasons 为空 → 全部过滤掉', () => {
    expect(projectItems([p('A', { orgL4: '' })], {}, [])).toEqual([])
  })

  it('同一项目多原因合并为一条事项', () => {
    const items = projectItems([p('A', { orgL4: '' })], {}, ['数据异常', '回款延期'])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('project')
  })
})

describe('timesheetItems', () => {
  const row = (empId: string, codes: string[]): IssueRow => ({
    date: '2026-07-01', empId, empName: 'X', l4: '', l31: '', type: '',
    customer: '', workOrder: '', hours: 8, ok: 2, codes, msgs: [], snippet: '',
  })

  it('按工号聚合,按问题码计数', () => {
    const items = timesheetItems(
      [row('A1', ['MISS_SUMMARY']), row('A1', ['MISS_SUMMARY']), row('A1', ['TYPE_MISMATCH'])],
      ['MISS_SUMMARY', 'TYPE_MISMATCH'])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'timesheet', employId: 'A1' })
    const issues = (items[0] as { issues: { code: string; count: number }[] }).issues
    expect(issues.find((i) => i.code === 'MISS_SUMMARY')!.count).toBe(2)
    expect(issues.find((i) => i.code === 'TYPE_MISMATCH')!.count).toBe(1)
  })

  it('一行多个问题码 → 每个码各计一次', () => {
    const items = timesheetItems([row('A1', ['MISS_SUMMARY', 'MISS_NEXT'])],
                                 ['MISS_SUMMARY', 'MISS_NEXT'])
    const issues = (items[0] as { issues: { code: string; count: number }[] }).issues
    expect(issues).toHaveLength(2)
  })

  it('allowedCodes 过滤生效;过滤后无码的人不产出', () => {
    expect(timesheetItems([row('A1', ['TYPE_MISMATCH'])], ['MISS_SUMMARY'])).toEqual([])
  })

  it('issues 带中文 label(卡片直接用,不必再查表)', () => {
    const items = timesheetItems([row('A1', ['MISS_SUMMARY'])], ['MISS_SUMMARY'])
    const issues = (items[0] as { issues: { label: string }[] }).issues
    expect(issues[0].label).toBe('缺少工作概述')
  })

  it('多人各自成条,按工号排序', () => {
    const items = timesheetItems([row('B2', ['MISS_SUMMARY']), row('A1', ['MISS_SUMMARY'])],
                                 ['MISS_SUMMARY'])
    expect(items.map((i) => (i as { employId: string }).employId)).toEqual(['A1', 'B2'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/lanxin/items.test.ts`
Expected: FAIL —— `Failed to resolve import "./items"`

- [ ] **Step 3: 写 `items.ts`**

创建 `frontend/src/lib/lanxin/items.ts`：

```ts
import { riskReasons } from '@/lib/riskReasons'
import { ISSUE_LABELS, type IssueRow } from '@/lib/yitian/compliance'
import type { Project, ProjectPmis } from '@/types/analysis'

/** 待推事项。前端只回答「哪些项目/工时行有什么异常」;「发给谁」由后端解析花名册决定
 *  —— 后端不接受前端传来的 staffId,前端出错最多是算错异常,不会推给错的人。 */
export type PushItem =
  | { kind: 'project'; projectId: string; reasons: string[] }
  | { kind: 'timesheet'; employId: string; issues: { code: string; label: string; count: number }[] }

/** 项目关注原因 → 事项。口径复用 riskReasons(单一来源),此处只做「配置勾选」过滤。 */
export function projectItems(
  projects: Project[],
  projectPmis: Record<string, ProjectPmis>,
  allowedReasons: string[],
): PushItem[] {
  const allow = new Set(allowedReasons)
  const out: PushItem[] = []
  for (const p of projects) {
    const reasons = riskReasons(p, projectPmis[p.projectId])
      .map((r) => r.category as string)
      .filter((c) => allow.has(c))
    if (reasons.length) out.push({ kind: 'project', projectId: p.projectId, reasons })
  }
  return out
}

/** 工时问题 → 事项。按工号聚合、按问题码计数;label 一并带上,后端组卡不必再查表。 */
export function timesheetItems(rows: IssueRow[], allowedCodes: string[]): PushItem[] {
  const allow = new Set(allowedCodes)
  const byEmp = new Map<string, Map<string, number>>()
  for (const r of rows) {
    for (const code of r.codes) {
      if (!allow.has(code)) continue
      const m = byEmp.get(r.empId) ?? new Map<string, number>()
      m.set(code, (m.get(code) ?? 0) + 1)
      byEmp.set(r.empId, m)
    }
  }
  return [...byEmp.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([employId, m]) => ({
      kind: 'timesheet' as const,
      employId,
      issues: [...m.entries()].map(([code, count]) => ({
        code, label: ISSUE_LABELS[code] ?? code, count,
      })),
    }))
}
```

- [ ] **Step 4: 写 `lanxinApi.ts`**

创建 `frontend/src/lib/lanxinApi.ts`：

```ts
import { api } from '@/api/client'
import type { PushItem } from '@/lib/lanxin/items'

export interface LanxinRoute {
  key: string
  label: string
  enabled: boolean
  issueCodes?: string[]
  reasons?: string[]
  recipients: { primary: boolean; supervisorLevels: number }
}

export interface LanxinConfig {
  enabled: boolean
  sendIntervalMs: number
  credentials: {
    appId: string; appSecret: string; orgId: string
    apiGateway: string; idType: string; hasSecret?: boolean
  }
  routes: LanxinRoute[]
}

export interface LanxinPlanRecipient {
  employId: string; name: string; role: 'primary' | 'supervisor'
  card: Record<string, unknown>
}
export interface LanxinPlan {
  recipients: LanxinPlanRecipient[]
  unresolved: { kind: string; id: string; name: string; reason: string }[]
  totals: { recipients: number; unresolved: number }
}
export interface LanxinSendResult {
  sent: number
  failed: { employId: string; name: string; errCode: number; errMsg: string }[]
  msgIds: string[]
}

export async function getLanxinConfig(): Promise<LanxinConfig> {
  return (await api.get<{ config: LanxinConfig }>('/api/lanxin/config')).config
}
export async function saveLanxinConfig(cfg: LanxinConfig): Promise<LanxinConfig> {
  return (await api.post<{ config: LanxinConfig }>('/api/lanxin/config', { config: cfg })).config
}
export async function lanxinSelftest(employId: string) {
  return await api.post<{ steps: { name: string; ok: boolean; msg: string }[] }>(
    '/api/lanxin/selftest', { employId })
}
export async function lanxinPreview(items: PushItem[]): Promise<LanxinPlan> {
  return (await api.post<{ plan: LanxinPlan }>('/api/lanxin/preview', { items })).plan
}
export async function lanxinSend(items: PushItem[]) {
  return await api.post<{ plan: LanxinPlan; result: LanxinSendResult }>(
    '/api/lanxin/send', { items })
}
```

> **实现者须核实**：`@/api/client` 的 `api.get` / `api.post` **确切签名与返回形状**（是否已解包 `data`）以本仓现有代码为准；若与上面不符，**改这里去适配，不要动 `api/client`**。

- [ ] **Step 5: 运行确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/lib/lanxin/items.test.ts && npm run typecheck`
Expected: PASS（9 个用例）+ typecheck 无错

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/lanxin frontend/src/lib/lanxinApi.ts
git commit -m "feat(lanxin): 前端口径层 items.ts(复用 riskReasons/compliance) + lanxinApi"
```

---

# 波次 D —— 两个前端组件（T7 / T8 可并行）

### Task 7: `LanxinConfigCard.vue`

**Files:**
- Create: `frontend/src/components/LanxinConfigCard.vue`
- Create: `frontend/src/components/LanxinConfigCard.test.ts`

**Interfaces:**
- Consumes: `lanxinApi.{getLanxinConfig,saveLanxinConfig,lanxinSelftest}` / `LanxinConfig` / `LanxinRoute` / `ISSUE_LABELS`（from `@/lib/yitian/compliance`）
- Produces: 无 props；`defineEmits<{ (e: 'open-push'): void }>()`（「预览并推送」按钮冒泡给 DataView 开抽屉）

**样式**：`<style scoped>` 内 `@import '@/styles/dataview.css';`，只写本卡特有规则。**不要抄共享规则**。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/LanxinConfigCard.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinConfigCard from './LanxinConfigCard.vue'

const CFG = {
  enabled: false, sendIntervalMs: 200,
  credentials: { appId: 'app-1', appSecret: '', orgId: '524288',
                 apiGateway: 'https://apigw.example.com', idType: 'employ_id', hasSecret: true },
  routes: [
    { key: 'timesheet', label: '倚天工时问题', enabled: true,
      issueCodes: ['MISS_SUMMARY'], recipients: { primary: true, supervisorLevels: 0 } },
    { key: 'project', label: '项目关注原因', enabled: true,
      reasons: ['回款延期'], recipients: { primary: true, supervisorLevels: 1 } },
  ],
}

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinConfig: vi.fn(async () => JSON.parse(JSON.stringify(CFG))),
  saveLanxinConfig: vi.fn(async (c: unknown) => c),
  lanxinSelftest: vi.fn(async () => ({ steps: [
    { name: '取应用访问TOKEN', ok: true, msg: '成功' },
    { name: '工号换人员ID', ok: false, msg: '组织id格式异常 (52051)' },
  ] })),
}))

beforeEach(() => { setActivePinia(createPinia()) })

const mountCard = async () => {
  const w = mount(LanxinConfigCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
  await flushPromises()
  return w
}

describe('LanxinConfigCard', () => {
  it('渲染两条路由与其汇总级别', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('倚天工时问题')
    expect(w.text()).toContain('项目关注原因')
    expect(w.find('[data-test="lx-card"]').exists()).toBe(true)
  })

  it('已存密钥时不回显明文,只提示已配置', async () => {
    const w = await mountCard()
    expect(w.html()).not.toContain('appSecret“明文”')
    expect(w.text()).toContain('已配置')
  })

  it('自检结果逐步展示,失败步骤必须可见(不静默吞)', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-selftest-emp"]').setValue('A000701')
    await w.find('[data-test="lx-selftest"]').trigger('click')
    await flushPromises()
    const box = w.find('[data-test="lx-selftest-result"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('取应用访问TOKEN')
    expect(box.text()).toContain('52051')
  })

  it('保存调用 saveLanxinConfig', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    expect(saveLanxinConfig).toHaveBeenCalled()
  })

  it('保存时把新密钥放进 payload;未填则传空串(后端据此沿用旧值)', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(saveLanxinConfig).mock.calls[0][0].credentials.appSecret).toBe('')
  })

  it('「预览并推送」冒泡 open-push 事件(抽屉由 DataView 持有)', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-open-push"]').trigger('click')
    expect(w.emitted('open-push')).toHaveLength(1)
  })

  it('选项源是全集,不是已勾选的子集(否则取消勾选后再也勾不回来)', async () => {
    const w = await mountCard()
    // 配置里 timesheet 只勾了 1 个 code、project 只勾了 1 个 reason,
    // 但下拉必须给出全部 7 个 / 8 个选项
    const html = w.html()
    expect(html).toContain('缺少工作概述')
    expect(html).toContain('工时类型填报有误')   // 未勾选,但必须在选项里
    expect(html).toContain('里程碑滞后')         // 未勾选,但必须在选项里
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/LanxinConfigCard.test.ts`
Expected: FAIL —— `Failed to resolve import "./LanxinConfigCard.vue"`

- [ ] **Step 3: 写组件**

创建 `frontend/src/components/LanxinConfigCard.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ISSUE_LABELS } from '@/lib/yitian/compliance'
import { getLanxinConfig, saveLanxinConfig, lanxinSelftest,
         type LanxinConfig } from '@/lib/lanxinApi'

const emit = defineEmits<{ (e: 'open-push'): void }>()

const cfg = ref<LanxinConfig | null>(null)
const busy = ref(false)
const newSecret = ref('')
const selftestEmp = ref('')
const selftestSteps = ref<{ name: string; ok: boolean; msg: string }[]>([])

// 全量选项源:必须是全集,不能拿 v-model 绑的子集当选项 —— 否则取消勾选后选项消失、再也勾不回来。
const ALL_ISSUE_CODES = Object.keys(ISSUE_LABELS)
const issueLabel = (c: string) => ISSUE_LABELS[c] ?? c
// 与后端 lanxin_config.REASON_WHITELIST 必须逐字一致(后端据此校验取值合法性)。
// 口径本身仍以前端 lib/riskReasons.ts 的 RiskCategory 为单一来源,这里只是选项清单。
const ALL_REASONS = [
  '回款延期', '里程碑滞后', '总成本超支大于5000', '总成本超支小于5000',
  '交付成本超支', '风险未闭环', '数据异常', '未获取原项目预算',
]

// 汇总级别:0=不发;1..5 向上累积。上限 5 —— 预留 5 级架构(推广到整团队后仍够用)。
const LEVEL_OPTS = [
  { v: 0, t: '不发汇总' },
  { v: 1, t: '直接上级（+1）' },
  { v: 2, t: '直接上级 + 隔级（+1、+2）' },
  { v: 3, t: '部门级（+1、+2、+3）' },
  { v: 4, t: '再上一级（+4，预留）' },
  { v: 5, t: '再上两级（+5，预留）' },
]

async function load() {
  try { cfg.value = await getLanxinConfig() } catch { /* 未登录/缺接口静默 */ }
}

async function onSave() {
  if (!cfg.value) return
  busy.value = true
  try {
    const payload: LanxinConfig = JSON.parse(JSON.stringify(cfg.value))
    // 空串 = 不修改密钥(后端沿用旧值);填了才覆盖
    payload.credentials.appSecret = newSecret.value
    cfg.value = await saveLanxinConfig(payload)
    newSecret.value = ''
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e instanceof Error ? e.message : String(e)))
  } finally { busy.value = false }
}

async function onSelftest() {
  busy.value = true
  selftestSteps.value = []
  try {
    selftestSteps.value = (await lanxinSelftest(selftestEmp.value.trim())).steps
  } catch (e) {
    selftestSteps.value = [{ name: '自检', ok: false,
                             msg: e instanceof Error ? e.message : String(e) }]
  } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <div class="dv-card" data-test="lx-card">
    <div class="dv-card-head">蓝信推送</div>

    <template v-if="cfg">
      <div class="dv-row">
        <span class="dv-label">总开关</span>
        <el-switch v-model="cfg.enabled" />
        <span class="dv-hint">关闭时预览仍可用（可离线看要发给谁），发送被拒绝</span>
      </div>

      <div class="dv-sub-head">凭证（向蓝信组织管理员申请，见 docs/2026-07-17-蓝信开放平台接入申请清单.md）</div>
      <div class="dv-row">
        <span class="dv-label">AppId</span>
        <el-input v-model="cfg.credentials.appId" size="small" style="width: 220px" />
        <span class="dv-label">组织ID</span>
        <el-input v-model="cfg.credentials.orgId" size="small" style="width: 140px" />
      </div>
      <div class="dv-row">
        <span class="dv-label">网关地址</span>
        <el-input v-model="cfg.credentials.apiGateway" size="small" style="width: 320px"
          placeholder="https://apigw-xxx.example.com" />
      </div>
      <div class="dv-row">
        <span class="dv-label">AppSecret</span>
        <el-input v-model="newSecret" size="small" type="password" show-password
          style="width: 220px" :placeholder="cfg.credentials.hasSecret ? '已配置，留空则不修改' : '未配置'" />
        <span class="dv-hint" :class="cfg.credentials.hasSecret ? 'ok' : 'warn'">
          {{ cfg.credentials.hasSecret ? '已配置' : '未配置' }} · 密钥不回显、不入日志与审计
        </span>
      </div>

      <div class="dv-sub-head">推送路由</div>
      <div v-for="r in cfg.routes" :key="r.key" class="dv-row lx-route">
        <span class="dv-label">{{ r.label }}</span>
        <el-switch v-model="r.enabled" />
        <el-checkbox v-model="r.recipients.primary">
          {{ r.key === 'timesheet' ? '发给填报人本人' : '发给项目经理' }}
        </el-checkbox>
        <el-select v-model="r.recipients.supervisorLevels" size="small" style="width: 220px">
          <el-option v-for="o in LEVEL_OPTS" :key="o.v" :value="o.v" :label="o.t" />
        </el-select>
        <el-select v-if="r.key === 'timesheet'" v-model="r.issueCodes" size="small"
          multiple collapse-tags style="width: 200px" placeholder="参与推送的问题类型">
          <el-option v-for="c in ALL_ISSUE_CODES" :key="c" :value="c" :label="issueLabel(c)" />
        </el-select>
        <el-select v-else v-model="r.reasons" size="small"
          multiple collapse-tags style="width: 200px" placeholder="参与推送的关注原因">
          <el-option v-for="c in ALL_REASONS" :key="c" :value="c" :label="c" />
        </el-select>
      </div>

      <div class="dv-row dv-actions">
        <button class="dv-btn primary" data-test="lx-save" :disabled="busy" @click="onSave">保存配置</button>
        <span class="dv-label">自检工号</span>
        <el-input v-model="selftestEmp" data-test="lx-selftest-emp" size="small"
          style="width: 130px" placeholder="如 A000701" />
        <button class="dv-btn" data-test="lx-selftest" :disabled="busy" @click="onSelftest">连通性自检</button>
        <button class="dv-btn primary" data-test="lx-open-push" @click="emit('open-push')">预览并推送</button>
        <span class="dv-hint">自检只给该工号本人发一条测试消息，不触碰他人</span>
      </div>

      <div v-if="selftestSteps.length" class="dv-row lx-steps" data-test="lx-selftest-result">
        <div v-for="(s, i) in selftestSteps" :key="i" class="lx-step">
          <span class="dv-badge" :class="s.ok ? 'ok' : 'warn'">{{ s.ok ? '通过' : '失败' }}</span>
          <span class="lx-step-name">{{ s.name }}</span>
          <span class="dv-hint">{{ s.msg }}</span>
        </div>
      </div>
    </template>
    <div v-else class="dv-row dv-hint">配置加载中…</div>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:路由行与自检步骤 */
.lx-route { gap: var(--sp-2); }
.lx-steps { flex-direction: column; align-items: stretch; gap: var(--sp-2); }
.lx-step { display: flex; align-items: center; gap: var(--sp-2); }
.lx-step-name { font-size: var(--fs-1); color: var(--txt); font-weight: 600; }
</style>
```

- [ ] **Step 4: 运行确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/components/LanxinConfigCard.test.ts && npm run typecheck`
Expected: PASS（7 个用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/LanxinConfigCard.vue frontend/src/components/LanxinConfigCard.test.ts
git commit -m "feat(lanxin): 配置卡(凭证/路由/0..5级汇总/自检,密钥不回显)"
```

---

### Task 8: `LanxinPushDrawer.vue`

**Files:**
- Create: `frontend/src/components/LanxinPushDrawer.vue`
- Create: `frontend/src/components/LanxinPushDrawer.test.ts`

**Interfaces:**
- Consumes: `lanxinApi.{getLanxinConfig,lanxinPreview,lanxinSend}` / `items.{projectItems,timesheetItems}` / `useDataStore` / `useYitianStore` / `useYitianSettingsStore`
- Produces:
  ```ts
  defineProps<{ modelValue: boolean }>()
  defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
  ```

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/LanxinPushDrawer.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinPushDrawer from './LanxinPushDrawer.vue'

const PLAN = {
  recipients: [
    { employId: 'A006', name: '张三', role: 'primary',
      card: { headTitle: '项目关注提醒', bodyTitle: '你名下 2 个项目存在关注原因',
              fields: [{ key: '回款延期', value: '2 个项目' }] } },
    { employId: 'A005', name: '耿磊磊', role: 'supervisor',
      card: { headTitle: '项目关注提醒', bodyTitle: '你的团队有 2 个项目存在关注原因',
              fields: [{ key: '张三', value: '2 项：回款延期 2' }] } },
  ],
  unresolved: [{ kind: 'project', id: 'P9', name: '查无此人', reason: '经理不在花名册' }],
  totals: { recipients: 2, unresolved: 1 },
}

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinConfig: vi.fn(async () => ({
    enabled: true, sendIntervalMs: 200,
    credentials: { appId: 'a', appSecret: '', orgId: '1',
                   apiGateway: 'https://x.example.com', idType: 'employ_id', hasSecret: true },
    routes: [
      { key: 'timesheet', label: '倚天工时问题', enabled: true, issueCodes: ['MISS_SUMMARY'],
        recipients: { primary: true, supervisorLevels: 0 } },
      { key: 'project', label: '项目关注原因', enabled: true, reasons: ['回款延期'],
        recipients: { primary: true, supervisorLevels: 1 } },
    ],
  })),
  lanxinPreview: vi.fn(async () => PLAN),
  lanxinSend: vi.fn(async () => ({
    plan: PLAN,
    result: { sent: 1, failed: [{ employId: 'A005', name: '耿磊磊',
                                  errCode: 56008, errMsg: '触发限流' }], msgIds: ['M1'] },
  })),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
})

const mountDrawer = async () => {
  const w = mount(LanxinPushDrawer, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

describe('LanxinPushDrawer', () => {
  it('打开即预览,列出收件人与卡片文案', async () => {
    const w = await mountDrawer()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('耿磊磊')
    expect(w.text()).toContain('你名下 2 个项目存在关注原因')
  })

  it('未解析清单必须可见(不静默丢)', async () => {
    const w = await mountDrawer()
    const box = w.find('[data-test="lx-unresolved"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('经理不在花名册')
    expect(box.text()).toContain('P9')
  })

  it('推送后失败清单必须可见(不吞)', async () => {
    const w = await mountDrawer()
    await w.find('[data-test="lx-send"]').trigger('click')
    await flushPromises()
    const box = w.find('[data-test="lx-failed"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('耿磊磊')
    expect(box.text()).toContain('56008')
  })

  it('推送按钮在预览出结果前禁用', async () => {
    const w = mount(LanxinPushDrawer, { props: { modelValue: true },
                                        global: { plugins: [ElementPlus] } })
    expect(w.find('[data-test="lx-send"]').attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/LanxinPushDrawer.test.ts`
Expected: FAIL —— `Failed to resolve import "./LanxinPushDrawer.vue"`

- [ ] **Step 3: 写组件**

创建 `frontend/src/components/LanxinPushDrawer.vue`：

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useYitianStore } from '@/stores/yitian'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { issueRows } from '@/lib/yitian/compliance'
import { projectItems, timesheetItems, type PushItem } from '@/lib/lanxin/items'
import { getLanxinConfig, lanxinPreview, lanxinSend,
         type LanxinPlan, type LanxinSendResult } from '@/lib/lanxinApi'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const data = useDataStore()
const yitian = useYitianStore()
const yitianSettings = useYitianSettingsStore()

const plan = ref<LanxinPlan | null>(null)
const result = ref<LanxinSendResult | null>(null)
const busy = ref(false)
const items = ref<PushItem[]>([])

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 前端只算「哪些项目/工时行有什么异常」;「发给谁」由后端解析花名册决定。 */
async function buildItems(): Promise<PushItem[]> {
  const cfg = await getLanxinConfig()
  const out: PushItem[] = []
  const rProj = cfg.routes.find((r) => r.key === 'project')
  if (rProj?.enabled && data.data) {
    out.push(...projectItems(data.data.projects ?? [],
                             (data.data.projectPmis ?? {}) as never,
                             rProj.reasons ?? []))
  }
  const rTs = cfg.routes.find((r) => r.key === 'timesheet')
  if (rTs?.enabled && yitian.data) {
    const rows = issueRows(yitian.data, '', '', [], yitianSettings.excludedTypes ?? [])
    out.push(...timesheetItems(rows, rTs.issueCodes ?? []))
  }
  return out
}

async function doPreview() {
  busy.value = true
  result.value = null
  try {
    items.value = await buildItems()
    plan.value = await lanxinPreview(items.value)
  } catch (e) {
    ElMessage.error('预览失败：' + (e instanceof Error ? e.message : String(e)))
    plan.value = null
  } finally { busy.value = false }
}

async function doSend() {
  if (!plan.value) return
  try {
    await ElMessageBox.confirm(
      `确定向 ${plan.value.totals.recipients} 人推送蓝信消息？该操作会真实触达员工，不可撤销。`,
      '确认推送', { type: 'warning' })
  } catch { return }
  busy.value = true
  try {
    // 与预览同一份 items → 后端同一个 build_plan → 所见即所发
    const r = await lanxinSend(items.value)
    plan.value = r.plan
    result.value = r.result
    ElMessage.success(`已推送 ${r.result.sent} 条`)
  } catch (e) {
    ElMessage.error('推送失败：' + (e instanceof Error ? e.message : String(e)))
  } finally { busy.value = false }
}

watch(() => props.modelValue, (v) => { if (v) doPreview() }, { immediate: true })
</script>

<template>
  <el-drawer v-model="open" title="蓝信推送 · 预览" size="60%">
    <div class="lx-wrap">
      <div class="dv-row">
        <button class="dv-btn" :disabled="busy" @click="doPreview">重新预览</button>
        <button class="dv-btn primary" data-test="lx-send" :disabled="busy || !plan?.recipients.length"
          @click="doSend">确认推送</button>
        <span v-if="plan" class="dv-hint">
          收件 {{ plan.totals.recipients }} 人 · 未解析 {{ plan.totals.unresolved }} 项
        </span>
      </div>

      <div v-if="result" class="dv-row dv-hint" :class="result.failed.length ? 'warn' : 'ok'">
        推送结果：成功 {{ result.sent }} 条<template v-if="result.failed.length">，失败 {{ result.failed.length }} 条</template>
      </div>
      <div v-if="result?.failed.length" class="lx-list" data-test="lx-failed">
        <div class="dv-sub-head">发送失败（未送达，可重试）</div>
        <div v-for="f in result.failed" :key="f.employId" class="lx-item">
          <span class="dv-badge warn">失败</span>
          <span class="lx-name">{{ f.name }}（{{ f.employId }}）</span>
          <span class="dv-hint">{{ f.errMsg }}（{{ f.errCode }}）</span>
        </div>
      </div>

      <div v-if="plan?.unresolved.length" class="lx-list" data-test="lx-unresolved">
        <div class="dv-sub-head">未解析（不会收到消息）</div>
        <div v-for="u in plan.unresolved" :key="u.kind + u.id" class="lx-item">
          <span class="dv-badge warn">未解析</span>
          <span class="lx-name">{{ u.id }} {{ u.name }}</span>
          <span class="dv-hint">{{ u.reason }}</span>
        </div>
      </div>

      <div v-if="plan" class="lx-list">
        <div class="dv-sub-head">收件人与卡片全文（所见即所发）</div>
        <div v-for="r in plan.recipients" :key="r.role + r.employId" class="lx-card-prev">
          <div class="lx-item">
            <span class="dv-badge" :class="r.role === 'primary' ? 'ok' : 'warn'">
              {{ r.role === 'primary' ? '本人' : '汇总' }}
            </span>
            <span class="lx-name">{{ r.name }}（{{ r.employId }}）</span>
          </div>
          <div class="lx-card-body">
            <div class="lx-card-title">{{ (r.card as Record<string, string>).bodyTitle }}</div>
            <div v-if="(r.card as Record<string, string>).bodySubTitle" class="dv-hint">
              {{ (r.card as Record<string, string>).bodySubTitle }}
            </div>
            <div v-for="(f, i) in ((r.card as Record<string, unknown>).fields as
                                   { key: string; value: string }[] ?? [])" :key="i" class="lx-field">
              <span class="lx-field-k">{{ f.key }}</span>
              <span class="lx-field-v u-num">{{ f.value }}</span>
            </div>
            <div v-if="(r.card as Record<string, string>).bodyContent" class="lx-content">
              {{ (r.card as Record<string, string>).bodyContent }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本组件特有:预览列表与卡片仿真 */
.lx-wrap { display: flex; flex-direction: column; gap: var(--gap-stack); }
.lx-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.lx-item { display: flex; align-items: center; gap: var(--sp-2); padding: 0 var(--sp-4); }
.lx-name { font-size: var(--fs-2); color: var(--txt); font-weight: 600; }
.lx-card-prev { border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3);
  display: flex; flex-direction: column; gap: var(--sp-2); }
.lx-card-body { background: var(--card2, var(--card)); border-radius: var(--r-sm); padding: var(--sp-3); }
.lx-card-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-2); }
.lx-field { display: flex; justify-content: space-between; gap: var(--sp-3);
  padding: 2px 0; border-bottom: 1px dashed var(--line); }
.lx-field-k { color: var(--sub); font-size: var(--fs-1); }
.lx-field-v { color: var(--txt); font-size: var(--fs-1); }
.lx-content { margin-top: var(--sp-2); font-size: var(--fs-1); color: var(--sub);
  white-space: pre-wrap; line-height: var(--lh-base); }
</style>
```

> **实现者须核实**：`useYitianStore` / `useYitianSettingsStore` 的**确切导出名与状态字段**（`data` / `excludedTypes`）以本仓现有代码为准；`issueRows` 的空区间参数（`'' , ''`）是否等价「全时口径」也须核实 —— 若不是，改为传 `yitian.data.meta.periodStart` / `periodEnd`。

- [ ] **Step 4: 运行确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/components/LanxinPushDrawer.test.ts && npm run typecheck`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/LanxinPushDrawer.vue frontend/src/components/LanxinPushDrawer.test.ts
git commit -m "feat(lanxin): 推送抽屉(预览即实发/未解析与失败清单必现)"
```

---

# 波次 E —— 挂载与发版

### Task 9: 挂进 `/data` + 版本号 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/views/DataView.vue`
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 挂进「配置」签**

在 `DataView.vue` 的 `<script setup>` 加：

```ts
import LanxinConfigCard from '@/components/LanxinConfigCard.vue'
import LanxinPushDrawer from '@/components/LanxinPushDrawer.vue'

const lanxinOpen = ref(false)
```

在「配置」签的 `.dv-pane-grid` 内、`首页门户` 卡之前插入。
**`LanxinConfigCard` 自带 `.dv-card` 根节点与卡头，外面不要再包 `.dv-card`**（否则双层边框）；
它需要独占整行（内容较宽），故用 `dv-span-all` 包一层无样式的定位容器：

```html
          <div v-if="auth.isSuper" class="dv-span-all">
            <LanxinConfigCard @open-push="lanxinOpen = true" />
          </div>
```

在模板末尾（`</el-tabs>` 之后、`.data-view` 的 `</div>` 之前）加：

```html
    <LanxinPushDrawer v-model="lanxinOpen" />
```

- [ ] **Step 2: 改版本号**

`frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V4.0.0'
export const RELEASE_DATE = '2026-07-17'
```
（`RELEASE_DATE` 用实际发版日）

- [ ] **Step 3: 全量 verify（不要并发跑 build）**

```bash
bash verify.sh; echo "EXIT=$?"
```
Expected: 全绿且 `EXIT=0`。**若 vitest 用例全绿但退出码非 0**，是子组件 `onMounted` 的未处理拒绝逸出（V3.3.0 踩过）—— 给 `DataView.test.ts` 里未 stub 的新子组件补 stub，直到 `EXIT=0`。

- [ ] **Step 4: 无凭证下的目视验证（凭证到位前只能验到这里）**

```bash
python server.py          # 另开终端
cd frontend && npm run dev
```
超管进 `/data`「配置」签，确认：
- [ ] 「蓝信推送」卡渲染，总开关/凭证/两条路由/汇总级别下拉（0..5 六个选项）齐全
- [ ] AppSecret 框显示「未配置」，输入并保存后再刷新显示「已配置」且**不回显明文**
- [ ] 点「预览并推送」→ 抽屉打开 → 列出收件人与卡片全文、未解析清单（实测应有约 6 个「经理不在花名册」）
- [ ] 点「确认推送」→ 二次确认弹窗 → 确认后因 `enabled=false` 或网关为空而被拒，**错误提示可见**
- [ ] light / dark 双主题正常；console 无报错

- [ ] **Step 5: 更新 PROGRESS.md**

先读现有条目体例，照其格式把 V4.0.0 加为「当前版本」、V3.5.0 整段降级为「上一版本」（原文一字不改，只改行首前缀）。记：X 级、蓝信推送集成、前端算口径+后端解析收件人、preview/send 同路径、0..5 级可配、三类卡片、自检、**非纯前端（须重启后端，无需点「更新数据」，无新 pageKey）**、基线 V3.5.0、**凭证未申请故未联调，待凭证到位后跑自检**。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.0.0 蓝信推送集成"
```

---

## Self-Review

**1. Spec 覆盖**

| Spec 章节 | 覆盖任务 |
|---|---|
| §0 全局约束 | Global Constraints（逐条抄入） |
| §1.1 蓝信接口事实与 appCard 上限 | Task 2（上限常量）、Task 3（三接口 + 错误码） |
| §1.2 平台数据事实 | Task 2（树/1:N/环）+ Step 5 真实花名册冒烟对数 |
| §1.3 凭证未申请 → 无凭证可测 | Task 3 全 mock；Task 9 Step 4 无凭证目验 |
| §2 架构与职责边界 | Task 6（前端口径）+ Task 2/4（后端收件人）+ Task 5（端点） |
| §2.2 preview/send 等价性 | Task 4（同一 `build_plan`）+ 确定性测试 + Task 5（两端点同调） |
| §2.3 花名册读取不套 DEPT_L3、不动 read_org_roster | Task 2（docstring + 实现） |
| §3 可配置收件链（0..5 累积、子集勾选、默认值） | Task 1（校验 + 默认）+ Task 7（UI） |
| §4 三条链与护栏（1:N/环/断链/unresolved） | Task 2 + Task 4 |
| §5 三类卡片与字节护栏 | Task 2 |
| §6 四端点 + 脱敏 + 空串保留 + 审计 map | Task 1（脱敏/保留）+ Task 5（端点/审计） |
| §7 发送与错误处理（串行/退避/不中断/如实报告） | Task 3（退避）+ Task 4（dispatch）+ Task 8（失败清单可见） |
| §8 测试 | Task 1/2/3/4/5/6/7/8 各自 + Task 9 全量 |
| §9 不做清单 | 计划中无对应任务（正确） |
| §10 待实测清单 | Task 1（`idType` 可切）+ Task 3（退避）+ Task 2（主动不越限） |
| §11 发版（版本号/PROGRESS/.gitignore/升级路径） | Task 1 Step 5（.gitignore）+ Task 9 |

无遗漏。

**2. Placeholder 扫描**

无 TBD / TODO / "similar to Task N"。每个改代码的步骤都带完整代码。

余下三处「实现者须核实」是**对现有代码签名的核实要求**（`@/api/client` 的 `api.get/post` 返回形状、`server.py` 的 `_load_analysis_cached`/`read_json_body`/`send_json`/`_audit_set`、倚天 store 的导出名与 `issueRows` 空区间语义），**不是待填空白** —— 计划已给出按现有范式书写的可用版本，并明确「若对不上则改调用去适配现有代码，不要新增同义函数/不要动 api/client」。这类核实无法在写计划时替代完成：它们依赖运行期签名，写死反而会误导。

自查中发现并**已就地改正**三处计划自身的缺陷（不留给实现者）：`build_plan` 的多余 `lvl` 变量（会 `NameError`）、`el-select` 拿已勾选子集当选项源（取消勾选后选项消失、勾不回来）、`LanxinConfigCard` 外再包 `.dv-card` 导致双层边框（改为 `open-push` emit + `dv-span-all` 无样式容器）。对应的测试也已补齐（选项全集断言、emit 断言、密钥空串断言）。

**3. 类型一致性**

- `PushItem` / `projectItems` / `timesheetItems` —— Task 6 定义，Task 8 消费，名字一致。
- `build_plan(items, cfg, tree, project_pmis)` / `dispatch(plan, cfg)` —— Task 4 定义，Task 5 调用，签名一致。
- `read_org_tree` 产物 `{'byId','byName'}` —— Task 2 定义，Task 4 的 `TREE` fixture 与 Task 5 的 `_lanxin_tree()` 同构。
- `supervisor_chain(tree, emp_id, levels)` / `resolve_project_manager(tree, pmis_team)` / 三个 `build_*_card` —— Task 2 定义，Task 4 import，名字一致。
- `LanxinConfig` / `LanxinRoute` / `LanxinPlan` / `LanxinSendResult` —— Task 6 定义，Task 7/8 消费，字段一致。
- `unresolved` 项形状 `{kind,id,name,reason}` —— Task 4 产出，Task 8 渲染，一致。
- `failed` 项形状 `{employId,name,errCode,errMsg}` —— Task 4 产出，Task 8 渲染，一致。
