# V4.5.9 蓝信 H5 反馈闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给蓝信推送卡片加一条**不依赖回调**的结构化回流通道：整卡点击 → 蓝信内置 webview 打开免登录 H5 页 → 员工逐条填反馈 → 落现有收件箱。

**Architecture:** token 是唯一凭据（HMAC-SHA256，绑工号 + 类型，TTL 48h）。H5 的待办清单**取自推送快照**（`dispatch` 把待办明细写进发送台账）而非实时重算 —— 「关注原因」口径在前端 TS，后端没有它，实时查只能靠跨语言复制口径或把 17MB 全员数据下发给免登录页，两条都不可接受（spec §4.5.1a）。快照同时天然给出**越权写的判据**：token 绑工号 → 查该工号台账 → 允许提交的 `projectId` 白名单。反馈落**现有** `lanxin_inbox`，零新数据文件。

**Tech Stack:** 后端纯 Python 标准库（`hmac`/`hashlib`/`base64`/`secrets`）；H5 是 `frontend/public/review.html` **单文件、零构建、零外链**；测试 pytest + vitest。

**Spec:** `docs/superpowers/specs/2026-07-28-lanxin-feedback-loop-and-card-enrichment-design.md` §4.5（含 §4.5.1a/§4.5.1b 更正）

## Global Constraints

- **版本号**：`frontend/src/version.ts` 的 `APP_VERSION` 改 `'V4.5.9'`。单一来源，只改此处。
- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。注释解释**为什么**。
- **绝不记密钥**：`appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` / **新增的 `reviewTokenSecret`** 绝不进日志、审计、异常消息、前端下发。`public_config` 一律脱敏，只透 `has*` 布尔。
- **零新数据文件**：反馈落现有 `lanxin_inbox`。本期**不新增任何 `data/*.json`**（本仓 gitignore 是显式列举、非通配，新增必须逐个加）。
- **三个免登录端点与 `/api/lanxin/callback` 同级对待**（spec §4.5.4）：token 验签、越权写校验、报文长度上限、频率上限。
- **越权写是本期最容易漏的一条**：`projectId` 必须落在该 token 绑定工号的推送快照里，不在即拒。
- **token 校验失败一律降级成「链接失效」，绝不 500、绝不抛错**；用 `hmac.compare_digest` 防时序攻击。
- **不得改动**：`build_summary_card`（上级汇总卡，跨期承重约束：零改动）、回调七道闸门顺序、`lanxin_unresponded.py`（清单代码本期应零改动，这是一期预留的红利）。
- **验证**：`bash verify.sh` 全绿。基线：pytest **1295 passed**、前端 250 files / **2225 tests**。
- **提交**：只 `git add` 本次明确改动的文件，**绝不 `git add -A`**（工作树有未跟踪的 `avatar-drafts/`、`wangxutong.png`、`wxt.png`）。
- **反向验证**：每条新增的承重/契约测试必须临时改坏实现、确认它**真的变红**、再改回。备份用 scratchpad **绝对路径**并立刻验证存在；**绝不用 `git checkout` 还原**。

---

## File Structure

| 文件 | 本期职责 | 动作 |
|---|---|---|
| `lanxin_review.py` | token 签发/校验（纯函数，无 IO）+ 提交内容归一化 | **新建** |
| `lanxin_config.py` | `credentials.reviewTokenSecret`（**必须加进 `validate_config` 的 `cred` 固定键元组**，否则静默丢弃）+ 顶层 `reviewBaseUrl` + `ensure_review_token_secret` | 改 |
| `lanxin_recipients.py` | `_card` 支持 `card_link`；两个 builder 透传 | 改 |
| `lanxin.py` | `build_plan` 产 `h5_url` 与 `reviewItems`；`dispatch` 把 `reviewItems` 写进 sentLog | 改 |
| `lanxin_inbox.py` | `record_sent` 白名单加 `reviewItems`；新增 `staff_id_of_employ` 反查 | 改 |
| `server.py` | 三个免登录端点 + `_AUTH_EXEMPT` + `/review/<token>` 路由（**必须在 SPA 回退之前**） | 改 |
| `frontend/public/review.html` | H5 填报页（单文件、零构建、零外链、移动端优先） | **新建** |
| `frontend/src/components/LanxinConfigCard.vue` | `reviewBaseUrl` 输入 + 按部署前缀自动推导预填 | 改 |
| `frontend/src/lib/lanxinInbox.ts` | `LanxinInboxItem` 加 `source?` / `projectId?` | 改 |
| `frontend/src/components/LanxinInboxCard.vue` | H5 条目可辨识 + 归入时预选 `projectId` | 改 |
| `frontend/src/version.ts` | `V4.5.9` | 改 |

**依赖顺序**：T1 → T4/T5；T2 → T4/T5/T7；T3 → T4；T4 → T5；T5 → T6；T8 独立。

---

## ⚠ 动手前必读：四个已核准的既有事实

**① `validate_config` 的 `cred` 是固定键元组**（`lanxin_config.py:177-178`）：

```python
    for k in ("appId", "appSecret", "orgId", "apiGateway",
              "callbackAesKey", "callbackSignToken"):
```

`reviewTokenSecret` 不加进这个元组 → **每次保存都被静默丢弃**，表现是「密钥生成了、下次读配置又没了、已签发的 token 全失效」。这与上一期 `reviewDeadlineHours` 栽在 `validate_config` 返回白名单 dict 上是**同一类坑**。

**② `/review/<token>` 本就免登录，但会被 SPA 回退吃掉。**
`_path_needs_auth`（`server.py:199`）只拦 `/api/`、`/data/`、`/input/`、`/yundocs_data/`、`/report/`、`/log/` 前缀 —— `/review/...` 不在其中，**页面本身无需改鉴权闸**。
但 `should_spa_fallback('/review/abc')` 返回 **True**（无 `/api/` 前缀、末段无点），会去吐 `dist/index.html`。**必须在 SPA 回退分支之前插显式分支**（`server.py:1173-1181` 那个 `else` 块）。
两个 `/api/lanxin/review/*` 端点走 `/api/` 前缀 → **必须进 `_AUTH_EXEMPT`**（该判定是**精确匹配** `path in _AUTH_EXEMPT`，query 已被 `urlparse` 剥掉）。

**③ 提交内容【存原文】，不在入库时转义。**
spec §4.5.4 写「内容 `html.escape`」容易被误读成入库时转义。**不要那样做**：现有归入流程（`server.py` 的 `/api/lanxin/inbox/handle`）已经在写进跟进域时做 `html.escape` + 换行只用 `<br>`。入库再转一次 → `&` 变 `&amp;amp;`，**双重转义、页面上是可见的乱码**。
既有回调条目也是存原文的（`lanxin_callback.event_to_item` 的 `text` 未转义）。H5 条目保持一致：**存原文、截断到 20000 字符**（沿用 `lanxin_callback._MAX_TEXT` 同值），转义留给归入那一步。收件箱页面用 Vue 渲染，默认转义，展示安全。

**④ `dispatch` 的 sentLog 与 `record_sent` 白名单上一期刚加过 `role`**，加 `reviewItems` 照同一个位置、同一个范式（缺失 → 空列表，老台账行为不变）。

---

## Task 1: `lanxin_review.py` —— token 签发与校验

**Files:**
- Create: `lanxin_review.py`
- Test: `tests/test_lanxin_review.py`（新建）

**Interfaces:**
- Produces:
  - `TOKEN_TTL_HOURS = 48`
  - `issue_token(emp: str, kind: str, secret: str, now_epoch: int, ttl_hours: int = TOKEN_TTL_HOURS) -> str`
  - `verify_token(token: str, secret: str, now_epoch: int) -> Optional[Dict[str, str]]` → `{"emp":…, "kind":…}` 或 `None`
  - `KINDS = ("project", "timesheet")`

- [ ] **Step 1: 写失败测试**

新建 `tests/test_lanxin_review.py`：

```python
import lanxin_review as LR

SEC = "s" * 43
NOW = 1785296160


def test_roundtrip():
    t = LR.issue_token("A030910", "project", SEC, NOW)
    assert LR.verify_token(t, SEC, NOW) == {"emp": "A030910", "kind": "project"}


def test_token_is_pure_ascii_and_url_safe():
    """【承重】token 要拼进 URL path。中文工号/中文 kind 若明文进 URL,
    http.client 会在 ASCII 编码处崩掉(副本实测教训)。base64url 保证全 ASCII。"""
    t = LR.issue_token("张三", "project", SEC, NOW)
    assert t.isascii()
    assert all(c not in t for c in " /?#&+%")


def test_expired_token_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW, ttl_hours=1)
    assert LR.verify_token(t, SEC, NOW + 3599) is not None
    assert LR.verify_token(t, SEC, NOW + 3601) is None


def test_forged_signature_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW)
    payload, exp, sig = t.split(".")
    forged = "%s.%s.%s" % (payload, exp, "0" * len(sig))
    assert LR.verify_token(forged, SEC, NOW) is None


def test_wrong_secret_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW)
    assert LR.verify_token(t, "d" * 43, NOW) is None


def test_tampered_payload_rejected():
    """【承重】改工号必须失效 —— 否则任何人把自己的 token 里的工号换成别人的
    就能读到别人的待办、往别人的项目写反馈。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    other = LR.issue_token("A999999", "project", SEC, NOW)
    mixed = "%s.%s.%s" % (other.split(".")[0], *t.split(".")[1:])
    assert LR.verify_token(mixed, SEC, NOW) is None


def test_tampered_exp_rejected():
    """exp 也在签名覆盖范围内 —— 否则改 exp 就能无限续期。"""
    t = LR.issue_token("A030910", "project", SEC, NOW, ttl_hours=1)
    payload, exp, sig = t.split(".")
    assert LR.verify_token("%s.%s.%s" % (payload, str(int(exp) + 99999), sig), SEC, NOW) is None


@pytest.mark.parametrize("bad", ["", "a", "a.b", "a.b.c.d", "...", "a.notint.c", None, 123])
def test_malformed_never_raises(bad):
    """【承重】格式怪异一律返回 None,绝不抛错 —— 这是免登录端点,
    任何异常都会变成 500,而 500 会让人以为系统坏了(应当显示「链接失效」)。"""
    assert LR.verify_token(bad, SEC, NOW) is None


def test_empty_secret_always_rejects():
    """密钥没配时不许放行任何 token —— 空密钥下 HMAC 仍能算出值,
    不显式拒绝等于把签名校验变成摆设。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    assert LR.verify_token(t, "", NOW) is None
    with pytest.raises(ValueError):
        LR.issue_token("A030910", "project", "", NOW)


def test_unknown_kind_rejected_at_issue():
    with pytest.raises(ValueError):
        LR.issue_token("A030910", "nosuchkind", SEC, NOW)
```

文件顶部需 `import pytest`。

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_review.py -q
```
Expected: FAIL —— `ModuleNotFoundError: No module named 'lanxin_review'`

- [ ] **Step 3: 实现**

新建 `lanxin_review.py`：

```python
# lanxin_review.py
"""蓝信 H5 反馈闭环:免登录 token 的签发与校验。纯函数,无 IO,可单测。

为什么需要 token 而不是会话:H5 页在蓝信内置 webview 里打开,那里没有本系统的
登录态、也不该要求员工先登录一遍(他要填的就是我们主动推给他的那几条)。token
是这个入口【唯一】的凭据,所以它的校验必须严:签名覆盖 payload 与 exp 两段,
任一被改动即失效。

为什么 payload 走 base64url 而不是明文:token 要拼进 URL path。明文中文
(工号可能是中文姓名场景、kind 未来可能扩展)进 URL 会让 http.client 在 ASCII
编码处崩掉 —— 这是「蓝信对接代码」副本记录的实测教训。

格式:<base64url(payload)>.<exp>.<sig>   三段,全 ASCII,URL 安全
  payload = JSON{"emp":…, "kind":…}
  exp     = 签发时刻 + ttl_hours*3600(epoch 秒)
  sig     = HMAC-SHA256(secret, "<payload_b64>|<exp>").hexdigest()
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, Dict, Optional

TOKEN_TTL_HOURS = 48
KINDS = ("project", "timesheet")


def _b64url_encode(raw: bytes) -> str:
    """去掉 '=' 填充:'=' 在 URL 里需要转义,而我们要保证 token 原样可进 path。"""
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(secret: str, payload_b64: str, exp: int) -> str:
    return hmac.new(secret.encode("utf-8"),
                    ("%s|%d" % (payload_b64, exp)).encode("utf-8"),
                    hashlib.sha256).hexdigest()


def issue_token(emp: str, kind: str, secret: str, now_epoch: int,
                ttl_hours: int = TOKEN_TTL_HOURS) -> str:
    """签发。secret 为空或 kind 未知 → ValueError(调用方 bug,不该静默产出坏 token)。"""
    if not str(secret or "").strip():
        raise ValueError("reviewTokenSecret 未配置,不能签发 token")
    if kind not in KINDS:
        raise ValueError("kind 须为 %s 之一" % "/".join(KINDS))
    payload_b64 = _b64url_encode(json.dumps(
        {"emp": str(emp or ""), "kind": kind},
        ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    exp = int(now_epoch) + int(ttl_hours) * 3600
    return "%s.%d.%s" % (payload_b64, exp, _sign(secret, payload_b64, exp))


def verify_token(token: Any, secret: str, now_epoch: int) -> Optional[Dict[str, str]]:
    """校验。通过 → {"emp":…, "kind":…};任何问题 → None。

    【绝不抛错】—— 这是免登录入口,异常会变成 500,而 500 让人以为系统坏了;
    正确的用户体验是页面里显示「链接失效」。所以格式怪异、签名不符、过期、
    密钥未配,一律走同一个 None 出口。

    用 hmac.compare_digest 而非 == 比较签名:防时序攻击。
    """
    if not str(secret or "").strip():
        return None                       # 密钥没配 → 不放行任何 token
    if not isinstance(token, str):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_b64, exp_s, sig = parts
    if not exp_s.isdigit():
        return None
    exp = int(exp_s)
    if not hmac.compare_digest(sig, _sign(secret, payload_b64, exp)):
        return None
    if int(now_epoch) > exp:
        return None
    try:
        obj = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, TypeError):
        return None
    if not isinstance(obj, dict):
        return None
    emp, kind = str(obj.get("emp") or ""), str(obj.get("kind") or "")
    if not emp or kind not in KINDS:
        return None
    return {"emp": emp, "kind": kind}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_review.py -q
```
Expected: 全部 PASS

- [ ] **Step 5: 反向验证三条承重**

① 把 `_sign` 的 `"%s|%d" % (payload_b64, exp)` 改成只签 `payload_b64`（exp 不进签名）→ `test_tampered_exp_rejected` 必须 FAIL。
② 把 `hmac.compare_digest(...)` 改成 `sig == _sign(...)` → 功能不变、测试仍绿，这条**不做变异**，改为人工确认代码里用的是 `compare_digest`（时序攻击测不出来，靠代码审查把关）。
③ 把 `if not str(secret or "").strip(): return None` 从 `verify_token` 里删掉 → `test_empty_secret_always_rejects` 必须 FAIL。
①③ 各自确认变红后改回，重跑全绿。

- [ ] **Step 6: 提交**

```bash
git add lanxin_review.py tests/test_lanxin_review.py
git commit -m "feat(lanxin): 新增 H5 免登录 token 签发与校验(HMAC-SHA256,签名覆盖 payload+exp)"
```

---

## Task 2: `reviewTokenSecret` 与 `reviewBaseUrl` 配置项

**Files:**
- Modify: `lanxin_config.py`
- Test: `tests/test_lanxin_config.py`

**Interfaces:**
- Produces：`credentials.reviewTokenSecret`（密钥，脱敏）、顶层 `reviewBaseUrl`（可空 URL）、
  `ensure_review_token_secret(path: str, cfg: Dict) -> str`

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_lanxin_config.py`：

```python
def test_validate_keeps_review_token_secret():
    """【承重·同 reviewDeadlineHours 那个坑】validate_config 的 cred 是【固定键元组】,
    新键不加进去就被静默丢弃 —— 表现是「密钥生成了、下次读配置又没了、
    已签发的 token 全部失效」,而全程零报错。"""
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = "abc123"
    assert LC.validate_config(cfg)["credentials"]["reviewTokenSecret"] == "abc123"


def test_public_config_masks_review_token_secret():
    """密钥绝不回显。与其余三个密钥同款:抹成空串,只透 has* 布尔。"""
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = "SECRET_VALUE"
    pub = LC.public_config(cfg)
    assert pub["credentials"]["reviewTokenSecret"] == ""
    assert pub["credentials"]["hasReviewTokenSecret"] is True
    assert "SECRET_VALUE" not in json.dumps(pub, ensure_ascii=False)


def test_default_config_has_empty_review_base_url():
    assert LC.default_config()["reviewBaseUrl"] == ""


def test_validate_keeps_review_base_url():
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = "http://10.248.105.95/pm"
    assert LC.validate_config(cfg)["reviewBaseUrl"] == "http://10.248.105.95/pm"


def test_validate_strips_trailing_slash_from_review_base_url():
    """末尾斜杠必须剥掉 —— 拼 cardLink 时是 base + '/review/' + token,
    不剥就拼出 '//review/',蓝信 webview 未必容错。"""
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = "http://10.248.105.95/pm/"
    assert LC.validate_config(cfg)["reviewBaseUrl"] == "http://10.248.105.95/pm"


@pytest.mark.parametrize("bad", ["10.248.105.95/pm", "ftp://x/pm", "javascript:alert(1)"])
def test_validate_rejects_non_http_review_base_url(bad):
    """必须 http:// 或 https:// 开头。这个值会被拼进【推给员工的卡片】的
    cardLink 里,放行任意 scheme 等于把它变成一个钓鱼跳板。"""
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = bad
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


def test_empty_review_base_url_is_allowed():
    """留空是合法状态:此时不发 H5 链接,卡片文案自动退回「请直接回复本消息反馈」。"""
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = ""
    assert LC.validate_config(cfg)["reviewBaseUrl"] == ""


def test_ensure_review_token_secret_generates_once_and_persists(tmp_path):
    """【承重】密钥必须持久。若在 default_config/validate_config 里生成,
    每次 load 都会换一个新的 —— 服务重启后此前签发的 token 全部失效
    (TTL 48 小时,重启很可能落在窗口内)。故只在首次真正要用时生成【并立刻落盘】。"""
    p = tmp_path / "lanxin_config.json"
    cfg = LC.default_config()
    first = LC.ensure_review_token_secret(str(p), cfg)
    assert first and len(first) >= 32
    assert p.exists(), "生成后必须落盘"
    reloaded = LC.load_config(str(p))
    assert reloaded["credentials"]["reviewTokenSecret"] == first
    assert LC.ensure_review_token_secret(str(p), reloaded) == first, "已有则不许重新生成"


def test_ensure_review_token_secret_does_not_log_it(tmp_path, caplog):
    """密钥绝不进日志。"""
    p = tmp_path / "lanxin_config.json"
    cfg = LC.default_config()
    with caplog.at_level(0):
        sec = LC.ensure_review_token_secret(str(p), cfg)
    assert sec not in caplog.text
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_config.py -q -k "review_token or review_base"
```
Expected: FAIL

- [ ] **Step 3: 实现**

① `lanxin_config.py` 顶部 import 段加 `import secrets`。

② `default_config()` 的返回 dict：`"reviewDeadlineHours": DEFAULT_REVIEW_DEADLINE_HOURS,` 同级加

```python
        # H5 反馈页的对外基地址(如 http://10.248.105.95/pm)。留空 = 不发 H5 链接,
        # 卡片文案自动退回「请直接回复本消息反馈」态(build_action_hint 三态已就绪)。
        # 为什么必须配而不能由服务端自推:nginx 把 /pm 前缀剥掉后 app 只看到 /api/...,
        # 服务端【不知道】自己的公网前缀。配置界面按部署前缀自动推导预填(见 T7)。
        "reviewBaseUrl": "",
```

`credentials` 那个 dict 里加 `"reviewTokenSecret": "",`。

③ `validate_config` 的 `cred` 固定键元组**加一项**（这一步最容易漏）：

```python
    for k in ("appId", "appSecret", "orgId", "apiGateway",
              "callbackAesKey", "callbackSignToken", "reviewTokenSecret"):
```

④ `validate_config` 里 `send_as` 校验之后加：

```python
    base = cfg.get("reviewBaseUrl", "")
    if not isinstance(base, str):
        raise ValueError("reviewBaseUrl 必须是字符串")
    base = base.strip().rstrip("/")
    # 这个值会被拼进【推给员工的卡片】的 cardLink,放行任意 scheme 等于把它变成钓鱼跳板
    if base and not base.startswith(("http://", "https://")):
        raise ValueError("reviewBaseUrl 必须以 http:// 或 https:// 开头")
```

并把它加进 `return` dict（**与 `reviewDeadlineHours` 同一个白名单，漏了就静默丢弃**）：

```python
    return {"enabled": enabled, "sendIntervalMs": interval, "sendAs": send_as,
            "reviewDeadlineHours": deadline, "reviewBaseUrl": base,
            "credentials": cred, "routes": routes}
```

⑤ `public_config` 的脱敏元组加一项：

```python
    for field, flag in (("appSecret", "hasSecret"),
                        ("callbackAesKey", "hasCallbackAesKey"),
                        ("callbackSignToken", "hasCallbackSignToken"),
                        ("reviewTokenSecret", "hasReviewTokenSecret")):
```

⑥ 文件末尾新增：

```python
def ensure_review_token_secret(path: str, cfg: Dict[str, Any]) -> str:
    """取 H5 token 的签名密钥;缺失则生成并【立刻落盘】后返回。

    为什么不在 default_config()/validate_config() 里生成:那两个函数每次 load
    都会跑,在那里生成等于「每次读配置都换一个密钥」—— 服务一重启,此前签发的
    token 全部失效。TTL 是 48 小时,重启很可能落在窗口内。密钥必须持久。

    绝不记密钥:本函数不打日志、不进审计,返回值只在进程内用于 HMAC 计算;
    public_config 只透 hasReviewTokenSecret 布尔。
    """
    cred = cfg.setdefault("credentials", {})
    sec = str(cred.get("reviewTokenSecret") or "").strip()
    if sec:
        return sec
    sec = secrets.token_urlsafe(32)
    cred["reviewTokenSecret"] = sec
    save_config(path, cfg)
    return sec
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_config.py -q
```
Expected: 全部 PASS（既有用例一条不许变红）

- [ ] **Step 5: 反向验证两条**

① 从 `validate_config` 的 `cred` 元组里删掉 `"reviewTokenSecret"` → `test_validate_keeps_review_token_secret` 必须 FAIL（`KeyError`）。
② 从 `return` dict 里删掉 `"reviewBaseUrl": base,` → `test_validate_keeps_review_base_url` 必须 FAIL。
各自确认后改回。

- [ ] **Step 6: 提交**

```bash
git add lanxin_config.py tests/test_lanxin_config.py
git commit -m "feat(lanxin): 新增 reviewTokenSecret(脱敏/持久化)与 reviewBaseUrl(校验 scheme)"
```

---

## Task 3: `_card` 支持 `card_link`，两个 builder 透传

**Files:**
- Modify: `lanxin_recipients.py`
- Test: `tests/test_lanxin_recipients.py`

**Interfaces:**
- Produces：`_card(head, title, subtitle, fields, content="", card_link="")`；
  `build_project_card(name, projects, action_hint="", sent_at="", card_link="")`；
  `build_timesheet_card(name, issues, start, end, action_hint="", sent_at="", card_link="")`

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_lanxin_recipients.py`：

```python
def test_card_link_absent_when_empty():
    """【承重】空 card_link 时【不许】出现 cardLink 键。
    蓝信实测:cardLink 非空即让整卡可点;给个空串等于让整卡点了没反应,
    比不可点更糟(用户以为坏了)。"""
    card = LR.build_project_card("张三", [
        {"name": "A", "reasons": [{"category": "回款延期", "detail": "1 个延期节点"}]}])
    assert "cardLink" not in card


def test_card_link_present_when_given():
    card = LR.build_project_card("张三", [
        {"name": "A", "reasons": [{"category": "回款延期", "detail": "1 个延期节点"}]}],
        card_link="http://x/pm/review/tok")
    assert card["cardLink"] == "http://x/pm/review/tok"


def test_timesheet_card_link_passthrough():
    card = LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "", "", card_link="http://x/pm/review/tok")
    assert card["cardLink"] == "http://x/pm/review/tok"
    assert "cardLink" not in LR.build_timesheet_card(
        "张三", [{"code": "X", "label": "L", "count": 1}], "", "")


def test_card_link_not_truncated():
    """cardLink 是 URL,截断即失效。它不受任何 fit_* 上限约束 —— 逐字原样输出。
    token 约 100+ 字符,base 再长些,总长可轻易超过其它字段的上限。"""
    url = "http://10.248.105.95/pm/review/" + "t" * 200
    card = LR.build_project_card("张三", [
        {"name": "A", "reasons": [{"category": "回款延期", "detail": "1"}]}], card_link=url)
    assert card["cardLink"] == url


def test_summary_card_has_no_card_link_param():
    """【跨期承重约束】汇总卡零改动 —— 它不接 card_link,签名不许动。
    上级收到的是知会,不承担限时反馈,不该跳 H5 填报页。"""
    import inspect
    assert "card_link" not in inspect.signature(LR.build_summary_card).parameters
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_recipients.py -q -k card_link
```
Expected: FAIL（`build_project_card() got an unexpected keyword argument 'card_link'`）

- [ ] **Step 3: 实现**

① `_card` 加末位形参与输出：

```python
def _card(head: str, title: str, subtitle: str, fields: List[Dict[str, str]],
          content: str = "", card_link: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "headTitle": head,
        "bodyTitle": fit_bytes(title, LIMIT_BODY_TITLE),
        "bodySubTitle": fit_bytes(subtitle, LIMIT_BODY_SUBTITLE),
        "fields": fields[:MAX_FIELDS],
        "signature": fit_bytes(SIGNATURE, LIMIT_SIGNATURE),
    }
    if content:
        out["bodyContent"] = fit_bytes(content, LIMIT_BODY_CONTENT)
    # cardLink 非空即让整卡可点(蓝信实测)。空串【不写这个键】—— 写了等于整卡
    # 点了没反应,比不可点更糟(用户以为坏了)。
    # 【不做任何截断】:它是 URL,截断即失效;token 约 100+ 字符,总长可轻易超过
    # 其它字段的字节上限,套用 fit_* 会把链接切坏。
    if card_link:
        out["cardLink"] = card_link
    return out
```

② `build_project_card` 与 `build_timesheet_card` 各加末位形参 `card_link: str = ""`，并在 `return _card(...)` 的最后一个实参位置传下去。docstring 各补一句说明 `card_link` 的作用与「空则不出该键」。

③ **`build_summary_card` 一个字都不改。**

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_recipients.py -q
```
Expected: 全部 PASS（既有用例一条不许变红）

- [ ] **Step 5: 反向验证两条**

① 把 `if card_link:` 改成无条件 `out["cardLink"] = card_link` → `test_card_link_absent_when_empty` 必须 FAIL。
② 给 `_card` 的 `card_link` 套上 `fit_bytes(card_link, LIMIT_FIELD_VALUE)` → `test_card_link_not_truncated` 必须 FAIL。
各自确认后改回。

- [ ] **Step 6: 提交**

```bash
git add lanxin_recipients.py tests/test_lanxin_recipients.py
git commit -m "feat(lanxin): _card 支持 cardLink(整卡跳 H5),项目卡/工时卡透传,汇总卡不接"
```

---

## Task 4: `build_plan` 产 `h5_url` 与 `reviewItems`；台账存快照

**Files:**
- Modify: `lanxin.py`
- Modify: `lanxin_inbox.py`
- Test: `tests/test_lanxin.py`
- Test: `tests/test_lanxin_inbox.py`

**Interfaces:**
- Consumes: `lanxin_review.issue_token`（T1）、`_card(..., card_link=)`（T3）、`cfg["reviewBaseUrl"]`（T2）
- Produces:
  - `build_plan(items, cfg, tree, project_pmis, now="", review_secret="")` —— **新增末位可选形参 `review_secret`**
  - recipient dict 新增键 `reviewItems`（primary 卡才有内容；supervisor 恒为 `[]`）
  - `dispatch` 的 sentLog 新增 `reviewItems`
  - `lanxin_inbox.record_sent` 白名单新增 `reviewItems`
  - `lanxin_inbox.staff_id_of_employ(store, employ_id) -> str`

**reviewItems 的形状**（两种，按 `routeKey` 区分）：
```python
# routeKey == "project"
[{"projectId": "P1", "name": "XX智慧园区", "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]}, ...]
# routeKey == "timesheet"
[{"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5, "lastDate": "2026-07-25"}, ...]
```

- [ ] **Step 1: 写失败测试（`tests/test_lanxin_inbox.py`）**

```python
def test_record_sent_keeps_review_items():
    """H5 页的待办清单从台账读(spec §4.5.1a:口径在前端,后端无法实时重算)。
    白名单漏了这个键 → H5 页永远显示「没有待办」,而卡片明明列了项目。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "sid", "employId": "A001", "name": "张三",
                       "routeKey": "project", "role": "primary",
                       "projectIds": ["P1"], "msgId": "m",
                       "reviewItems": [{"projectId": "P1", "name": "XX",
                                        "reasons": [{"category": "回款延期", "detail": "3 个"}]}]}],
                  "2026-07-29 09:00:00")
    assert s["sent"][0]["reviewItems"][0]["projectId"] == "P1"


def test_record_sent_review_items_defaults_to_empty_list():
    """老台账(V4.5.8 及以前)没有这个键 → 空列表,不是 None。
    下游直接 for 循环它,None 会炸。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "sid", "employId": "A001", "name": "张三"}],
                  "2026-07-29 09:00:00")
    assert s["sent"][0]["reviewItems"] == []


def test_staff_id_of_employ_returns_latest():
    """H5 落库时要给条目补 staffId(收件箱的身份反查与归因候选都按它索引)。
    取【最近一条】—— 同一工号的 staffId 理论上不变,但若蓝信侧变更过,
    最近的那条才是当前有效的。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "old", "employId": "A001", "name": "张三"}],
                  "2026-07-01 09:00:00")
    I.record_sent(s, [{"staffId": "new", "employId": "A001", "name": "张三"}],
                  "2026-07-29 09:00:00")
    assert I.staff_id_of_employ(s, "A001") == "new"


def test_staff_id_of_employ_unknown_returns_empty():
    """查不到返回空串,【绝不编造】—— 与 resolve_identity 同一条纪律。"""
    assert I.staff_id_of_employ(I.new_store(), "A999") == ""
```

- [ ] **Step 2: 写失败测试（`tests/test_lanxin.py`）**

沿用该文件既有的 `TREE` / `PMIS` / `_cfg_items` / `_cfg_with_callback` 辅助：

```python
SECRET = "s" * 43


def _pj_cfg_with_h5(levels=1, base="http://x/pm"):
    cfg = _cfg_items(pj_items={"回款延期": (True, True, levels)})
    cfg["reviewBaseUrl"] = base
    return cfg


NEW_ITEM_H5 = [{"kind": "project", "projectId": "P1",
                "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]}]


def test_build_plan_primary_card_gets_card_link_when_base_configured():
    plan = LX.build_plan(NEW_ITEM_H5, _pj_cfg_with_h5(), TREE, PMIS, review_secret=SECRET)
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert card["cardLink"].startswith("http://x/pm/review/")


def test_build_plan_supervisor_card_never_gets_card_link():
    """【跨期承重】汇总卡零改动:上级不承担限时反馈,不该被引到填报页。"""
    plan = LX.build_plan(NEW_ITEM_H5, _pj_cfg_with_h5(levels=1), TREE, PMIS,
                         review_secret=SECRET)
    sup = [r for r in plan["recipients"] if r["role"] == "supervisor"]
    assert sup, "夹具应产出汇总卡"
    assert all("cardLink" not in r["card"] for r in sup)


def test_build_plan_no_card_link_without_base_url():
    """reviewBaseUrl 留空 → 不发链接,且文案退回「请直接回复本消息反馈」态。"""
    cfg = _cfg_with_callback(_pj_cfg_with_h5(base=""))
    plan = LX.build_plan(NEW_ITEM_H5, cfg, TREE, PMIS, review_secret=SECRET)
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert "cardLink" not in card
    assert card["fields"][-1]["value"].startswith("请直接回复本消息反馈")


def test_build_plan_no_card_link_without_secret():
    """密钥没配 → 签不出 token → 不发链接。绝不因此让整批推送失败。"""
    plan = LX.build_plan(NEW_ITEM_H5, _pj_cfg_with_h5(), TREE, PMIS, review_secret="")
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert "cardLink" not in card


def test_build_plan_action_hint_switches_to_h5_when_link_present():
    """【承重】有 H5 链接时文案必须切成「请点击卡片逐条反馈」——
    build_action_hint 的三态是一期就设计好的,二期只是把 h5_url 真的传进去。
    不传 = 一期那个「二期接入无需改此函数」的承诺没兑现。"""
    plan = LX.build_plan(NEW_ITEM_H5, _pj_cfg_with_h5(), TREE, PMIS, review_secret=SECRET)
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert card["fields"][-1]["value"].startswith("请点击卡片逐条反馈")


def test_build_plan_token_binds_the_recipient_employ_id():
    """【承重·越权】每个人的 token 必须绑他自己的工号。
    若用同一个 token 发给所有人,任何人都能读到别人的待办。"""
    import lanxin_review as LRV
    items = [{"kind": "project", "projectId": "P1",
              "reasons": [{"category": "回款延期", "detail": "3 个"}]},
             {"kind": "project", "projectId": "P3",
              "reasons": [{"category": "回款延期", "detail": "2 个"}]}]
    plan = LX.build_plan(items, _pj_cfg_with_h5(levels=0), TREE, PMIS, review_secret=SECRET)
    prim = [r for r in plan["recipients"] if r["role"] == "primary"]
    assert len(prim) == 2
    for r in prim:
        tok = r["card"]["cardLink"].rsplit("/", 1)[-1]
        assert LRV.verify_token(tok, SECRET, 1785296160)["emp"] == r["employId"]


def test_build_plan_recipients_carry_review_items():
    plan = LX.build_plan(NEW_ITEM_H5, _pj_cfg_with_h5(levels=0), TREE, PMIS,
                         review_secret=SECRET)
    r = [x for x in plan["recipients"] if x["role"] == "primary"][0]
    assert r["reviewItems"] == [{"projectId": "P1", "name": "P1",
                                 "reasons": [{"category": "回款延期",
                                              "detail": "3 个延期节点"}]}]


def test_build_plan_supervisor_review_items_empty():
    plan = LX.build_plan(NEW_ITEM_H5, _pj_cfg_with_h5(levels=1), TREE, PMIS,
                         review_secret=SECRET)
    for r in plan["recipients"]:
        if r["role"] == "supervisor":
            assert r["reviewItems"] == []


def test_build_plan_timesheet_review_items_carry_issue_detail():
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    cfg["reviewBaseUrl"] = "http://x/pm"
    plan = LX.build_plan([{"kind": "timesheet", "employId": "A006", "start": "", "end": "",
                           "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述",
                                       "count": 3, "lastDate": "2026-07-25"}]}],
                         cfg, TREE, PMIS, review_secret=SECRET)
    r = [x for x in plan["recipients"] if x["role"] == "primary"][0]
    assert r["reviewItems"] == [{"code": "MISS_SUMMARY", "label": "缺少工作概述",
                                 "count": 3, "lastDate": "2026-07-25"}]


def test_dispatch_sent_log_carries_review_items():
    """接线回归:build_plan 算出来了不等于 dispatch 记下来了。
    本仓反复出现「lib 契约 ≠ 接线」(V4.0.5/V4.5.6/V4.5.7/V4.5.8 均有)。"""
    # 沿用本文件既有的 dispatch 测试范式(monkeypatch get_app_token/id_mapping/send_message)
    ...
```

> 最后那条 `test_dispatch_sent_log_carries_review_items` 请**照本文件既有的 dispatch 测试**（`test_dispatch_returns_sent_log_for_identity_lookup` 等）的 monkeypatch 范式补全，断言 `result["sentLog"][0]["reviewItems"]` 非空且第一项含 `projectId`。**不要新造一套 mock 体系。**

- [ ] **Step 3: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin.py tests/test_lanxin_inbox.py -q -k "review_items or card_link or h5 or staff_id_of_employ or token_binds"
```
Expected: FAIL

- [ ] **Step 4: 实现（`lanxin_inbox.py`）**

① `record_sent` 白名单加一项（`"role"` 那行之后）：

```python
            # H5 反馈页的待办清单从这里读(口径在前端、后端无法实时重算,见 spec §4.5.1a)。
            # 老台账(V4.5.8 及以前)没有这个键 → 空列表(不是 None:下游直接 for 它)。
            "reviewItems": copy.deepcopy(e.get("reviewItems") or []),
```

② 文件末尾新增：

```python
def staff_id_of_employ(store: Dict[str, Any], employ_id: str) -> str:
    """按工号反查 staffId。查不到返回空串,【绝不编造】(同 resolve_identity 的纪律)。

    取【最近一条】:同一工号的 staffId 理论上不变,但蓝信侧若变更过,
    最近那条才是当前有效的。H5 落库时用它给条目补 staffId,让收件箱既有的
    身份反查与归因候选(都按 staffId 索引)对 H5 条目照样生效。
    """
    for e in reversed(store.get("sent") or []):
        if str(e.get("employId") or "") == str(employ_id or ""):
            return str(e.get("staffId") or "")
    return ""
```

- [ ] **Step 5: 实现（`lanxin.py`）**

① 顶部 import 段加 `import lanxin_review`。

② `build_plan` 签名加末位形参：

```python
def build_plan(items: List[Dict[str, Any]], cfg: Dict[str, Any],
               tree: Dict[str, Any], project_pmis: Dict[str, Any],
               now: str = "", review_secret: str = "") -> Dict[str, Any]:
```

③ 在算 `action_hint` 之前加一个**逐人签发 H5 链接**的小工具（`build_plan` 内部闭包）：

```python
    review_base = str(cfg.get("reviewBaseUrl") or "").strip().rstrip("/")

    def _h5_url(emp: str, kind: str) -> str:
        """给某人某类推送签一个 H5 链接。base 或密钥缺一个就返回空串 ——
        此时 build_action_hint 自动退回「请直接回复本消息反馈」态或不输出动作要求,
        绝不因为签不出 token 让整批推送失败。
        """
        if not review_base or not review_secret:
            return ""
        try:
            tok = lanxin_review.issue_token(emp, kind, review_secret, int(time.time()))
        except ValueError:
            return ""          # kind 未知/密钥空:不发链接,不炸整批
        return "%s/review/%s" % (review_base, tok)
```

④ **`action_hint` 不再是全局一个**：它现在依赖 `h5_url`（逐人不同）。把原来那句全局 `action_hint = build_action_hint(...)` 改成一个工厂：

```python
    deadline_hours = int(cfg.get("reviewDeadlineHours")
                         or lanxin_config.DEFAULT_REVIEW_DEADLINE_HOURS)

    def _hint(h5: str) -> str:
        # N 单一来源:cfg["reviewDeadlineHours"],与未响应清单同源(见 V4.5.8)
        return build_action_hint(deadline_hours, h5_url=h5, reply_hint=reply_hint)
```

⑤ 工时 primary 卡那段改为：

```python
            h5 = _h5_url(emp, "timesheet")
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "routeKey": "timesheet", "projectIds": [],
                # 待办快照:H5 页从台账读它渲染表单(见 spec §4.5.1a)
                "reviewItems": [{"code": i.get("code") or "", "label": i["label"],
                                 "count": int(i["count"]),
                                 "lastDate": str(i.get("lastDate") or "")} for i in mine],
                "card": build_timesheet_card(by_id[emp]["name"], mine,
                                             ts_range["start"], ts_range["end"],
                                             action_hint=_hint(h5), sent_at=now,
                                             card_link=h5),
            })
```

⑥ 项目 primary 卡那段改为（`mine` 是既有的 `[{"name":…, "reasons":[…]}]` 列表）：

```python
            h5 = _h5_url(emp, "project")
            # reviewItems 要带 projectId(H5 提交时的越权写判据靠它),而 mine 只有项目名。
            # 从并行桶按名字取回项目号:proj_detail_by_emp 是按项目名分组的,
            # 这里另建一份「名字 → 项目号」映射,不改并行桶本身的形状。
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "routeKey": "project", "projectIds": list(proj_ids_by_emp.get(emp) or []),
                "reviewItems": [{"projectId": name_to_pid.get(p["name"], ""),
                                 "name": p["name"], "reasons": list(p["reasons"])}
                                for p in mine],
                "card": build_project_card(by_id[emp]["name"], mine,
                                           action_hint=_hint(h5), sent_at=now,
                                           card_link=h5),
            })
```

⑦ 上面用到的 `name_to_pid`：在事项循环里与并行桶同处维护（`proj_detail_by_emp` 那句附近）：

```python
    # 项目名 → 项目号。reviewItems 需要项目号(H5 越权写判据),而 proj_detail_by_emp
    # 是按项目名分组的(卡片文案用名字)。另开一份映射,不改并行桶形状 ——
    # 与 proj_ids_by_emp 同样是「并行桶」范式(见其上方注释)。
    name_to_pid: Dict[str, str] = {}
```
循环里 `pname` 算出后加：`name_to_pid.setdefault(pname, pid or "")`

⑧ **两处 supervisor 汇总卡**：`recipients.append` 里加 `"reviewItems": []`，`build_summary_card(...)` 调用**一个字不改**（不传 `card_link`、仍传 `reply_hint=reply_hint`）。

⑨ `dispatch` 的 `sent_log.append` 在 `"role"` 之后加：

```python
                # 待办快照 → H5 页从台账读它渲染表单(spec §4.5.1a)。
                # 也是 H5 提交的【越权写判据】:提交的 projectId 必须落在这里面。
                "reviewItems": list(r.get("reviewItems") or []),
```

- [ ] **Step 6: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin.py tests/test_lanxin_inbox.py tests/test_lanxin_recipients.py -q
```
Expected: 全部 PASS。**既有用例一条不许变红** —— 尤其 `test_build_plan_behavior_equivalence_after_migration_golden`（逐字段钉死 8 个收件人）与三条 `omits_reply_hint`。它们变红说明接线接错了，**不要改测试**，停下报告。

- [ ] **Step 7: 反向验证三条**

① 把 `_hint(h5)` 改回 `_hint("")`（不把 h5 传进文案）→ `test_build_plan_action_hint_switches_to_h5_when_link_present` 必须 FAIL。
② 让所有人共用一个 token（`_h5_url` 里把 `emp` 写死成常量）→ `test_build_plan_token_binds_the_recipient_employ_id` 必须 FAIL。
③ 从 `dispatch` 的 `sent_log.append` 里删掉 `"reviewItems"` → 接线回归那条必须 FAIL。
逐项确认后改回，重跑全绿。

- [ ] **Step 8: 提交**

```bash
git add lanxin.py lanxin_inbox.py tests/test_lanxin.py tests/test_lanxin_inbox.py
git commit -m "feat(lanxin): 逐人签发 H5 链接进 cardLink + 待办快照写入发送台账"
```

---

## Task 5: 三个免登录端点

**Files:**
- Modify: `server.py`
- Test: `tests/test_server_lanxin_review.py`（新建）

**Interfaces:**
- Consumes: `lanxin_review.verify_token`（T1）、`lanxin_config.ensure_review_token_secret`（T2）、
  `lanxin_inbox.staff_id_of_employ`（T4）、sentLog 的 `reviewItems`（T4）
- Produces:
  - `GET  /review/<token>` → 服务 `review.html`（**不校验 token**，理由见 spec §4.5.4）
  - `GET  /api/lanxin/review/items?token=…` → `{success, kind, name, items, deadlineHours}` 或 `{success: false, reason: "invalid"}`
  - `POST /api/lanxin/review/submit` `{token, projectId?, code?, content}` → `{success}` / 400
  - 三者进 `_AUTH_EXEMPT`（后两个）；`/review/` 靠不在受保护前缀内天然免登录

- [ ] **Step 1: 写失败测试**

新建 `tests/test_server_lanxin_review.py`。沿用 `tests/test_server_lanxin.py` 的 `_srv` / `_login` 范式（起真实 HTTP 服务），但 H5 端点**不需要登录**：

```python
import http.client
import json
import threading

import auth
import lanxin_config as LC
import lanxin_inbox as LI
import lanxin_review as LRV
import server

SECRET = "s" * 43
NOW_EPOCH = 1785296160


def _srv(tmp_path, monkeypatch, sent=()):
    """起服务 + 预置一份含 reviewItems 的发送台账。"""
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    cfgp = tmp_path / "lanxin_config.json"
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = SECRET
    cfg["reviewDeadlineHours"] = 24
    cfgp.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "LANXIN_CONFIG_FILE", str(cfgp))
    inboxp = tmp_path / "lanxin_inbox.json"
    store = LI.new_store()
    LI.record_sent(store, list(sent), "2026-07-29 09:00:00")
    inboxp.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(inboxp))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


SENT_A001 = {"staffId": "sid-1", "employId": "A001", "name": "张三",
             "routeKey": "project", "role": "primary", "projectIds": ["P1", "P2"],
             "reviewItems": [
                 {"projectId": "P1", "name": "XX智慧园区",
                  "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]},
                 {"projectId": "P2", "name": "YY数据中心",
                  "reasons": [{"category": "风险未闭环", "detail": "2 个未关闭风险"}]}]}


def _get(port, path):
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.request("GET", path)
    r = c.getresponse()
    body = r.read()
    return r.status, body


def _post_json(port, path, obj):
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.request("POST", path, json.dumps(obj, ensure_ascii=False),
              {"Content-Type": "application/json"})
    r = c.getresponse()
    body = r.read()
    return r.status, (json.loads(body) if body else {})


def test_review_page_served_without_login(tmp_path, monkeypatch):
    """【承重】H5 页必须免登录。它在蓝信内置 webview 里打开,那里没有本系统会话。"""
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        st, body = _get(port, "/review/anything")
        assert st == 200
        assert b"<!DOCTYPE html" in body or b"<!doctype html" in body
        assert b"review-root" in body, "应当是 review.html 而不是 Vue SPA 的 index.html"
    finally:
        srv.shutdown(); srv.server_close()


def test_review_page_not_swallowed_by_spa_fallback(tmp_path, monkeypatch):
    """【承重】should_spa_fallback('/review/xxx') 返回 True(无 /api 前缀、末段无点),
    不加显式分支就会吐 Vue SPA 的 index.html —— 页面能打开、但完全不是那个页面。"""
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        _, body = _get(port, "/review/tok")
        assert b'id="app"' not in body, "吐的是 Vue SPA,说明被 SPA 回退吃掉了"
    finally:
        srv.shutdown(); srv.server_close()


def test_items_returns_snapshot_for_valid_token(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, body = _get(port, "/api/lanxin/review/items?token=" + tok)
        assert st == 200
        d = json.loads(body)
        assert d["success"] is True
        assert d["kind"] == "project"
        assert d["name"] == "张三"
        assert d["deadlineHours"] == 24
        assert [i["projectId"] for i in d["items"]] == ["P1", "P2"]
        assert d["items"][0]["reasons"][0]["category"] == "回款延期"
    finally:
        srv.shutdown(); srv.server_close()


def test_items_no_login_required(tmp_path, monkeypatch):
    """两个 /api/lanxin/review/* 端点必须进 _AUTH_EXEMPT ——
    它们走 /api/ 前缀,不豁免就会被鉴权闸拦成 401,H5 页永远白屏。"""
    assert "/api/lanxin/review/items" in server._AUTH_EXEMPT
    assert "/api/lanxin/review/submit" in server._AUTH_EXEMPT


def test_items_invalid_token_returns_200_with_reason(tmp_path, monkeypatch):
    """token 失效不是 500、也不是 401 —— 返回 200 + success:false,
    让页面显示「链接失效」。500/401 会让员工以为系统坏了。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        for bad in ("", "garbage", "a.b.c"):
            st, body = _get(port, "/api/lanxin/review/items?token=" + bad)
            assert st == 200
            assert json.loads(body)["success"] is False
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_accepts_project_in_snapshot(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "content": "已协调客户，本周付"})
        assert st == 200 and d["success"] is True
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        it = store["items"][0]
        assert it["source"] == "h5"
        assert it["projectId"] == "P1"
        assert it["employId"] == "A001"
        assert it["staffId"] == "sid-1", "应从台账按工号反查补上"
        assert it["text"] == "已协调客户，本周付"
        assert it["handled"] is False
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_project_not_in_snapshot(tmp_path, monkeypatch):
    """★★★【本期最容易漏的一条:越权写】提交的 projectId 必须落在该工号的推送快照里。
    不校验 → 任何人拿自己的 token 就能往【任意】项目写反馈。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P999", "content": "越权尝试"})
        assert st == 400
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"] == [], "越权提交绝不许落库"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_other_persons_project(tmp_path, monkeypatch):
    """B 的项目在台账里存在,但不属于 A —— A 的 token 提交它也必须拒。
    上一条只证明了「不存在的项目号被拒」,这条才证明「别人的项目号被拒」。"""
    other = dict(SENT_A001, staffId="sid-2", employId="A002", name="李四",
                 projectIds=["P9"],
                 reviewItems=[{"projectId": "P9", "name": "ZZ", "reasons": []}])
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001, other])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, _ = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P9", "content": "越权"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_invalid_token(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        st, _ = _post_json(port, "/api/lanxin/review/submit",
                           {"token": "a.b.c", "projectId": "P1", "content": "x"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_empty_content(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, _ = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "content": "   "})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_truncates_overlong_content(tmp_path, monkeypatch):
    """免登录写入口,长度必须封顶。沿用回调条目同一个上限。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "content": "x" * 50000})
        assert st == 200 and d["success"] is True
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert len(store["items"][0]["text"]) == server.LANXIN_H5_MAX_TEXT
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_stores_raw_text_not_escaped(tmp_path, monkeypatch):
    """【承重】入库存【原文】,不在这里 html.escape。
    归入跟进域那一步(/api/lanxin/inbox/handle)已经会转义 + 换行只用 <br>;
    这里再转一次 → '&' 变 '&amp;amp;',页面上是可见的乱码。
    既有回调条目也是存原文的(event_to_item 的 text 未转义),保持一致。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _post_json(port, "/api/lanxin/review/submit",
                   {"token": tok, "projectId": "P1", "content": "A & B <b>粗</b>"})
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"][0]["text"] == "A & B <b>粗</b>"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rate_limited_per_employ_per_day(tmp_path, monkeypatch):
    """免登录写入口的频率闸:单工号单日上限,防止被当成写盘放大器。
    计数【从收件箱现有条目得出】,不新增状态(与「零新数据文件」一致)。"""
    monkeypatch.setattr(server, "LANXIN_H5_MAX_PER_DAY", 2)
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        for _ in range(2):
            st, _d = _post_json(port, "/api/lanxin/review/submit",
                                {"token": tok, "projectId": "P1", "content": "ok"})
            assert st == 200
        st, _d = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "projectId": "P1", "content": "third"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_timesheet_kind_needs_code_not_project(tmp_path, monkeypatch):
    """工时侧提交用 code(问题码),没有 projectId。快照里 code 不存在同样要拒。"""
    ts = {"staffId": "sid-3", "employId": "A003", "name": "王五",
          "routeKey": "timesheet", "role": "primary", "projectIds": [],
          "reviewItems": [{"code": "MISS_SUMMARY", "label": "未填工作成果",
                           "count": 5, "lastDate": "2026-07-25"}]}
    srv, port = _srv(tmp_path, monkeypatch, sent=[ts])
    try:
        tok = LRV.issue_token("A003", "timesheet", SECRET, int(__import__("time").time()))
        st, _d = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "code": "MISS_SUMMARY", "content": "已补填"})
        assert st == 200
        st, _d = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "code": "NOT_IN_SNAPSHOT", "content": "x"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_no_secret_leaks_in_any_response(tmp_path, monkeypatch):
    """reviewTokenSecret 绝不下发。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _st, b1 = _get(port, "/api/lanxin/review/items?token=" + tok)
        _st2, d2 = _post_json(port, "/api/lanxin/review/submit",
                              {"token": tok, "projectId": "P1", "content": "ok"})
        assert SECRET not in b1.decode("utf-8")
        assert SECRET not in json.dumps(d2, ensure_ascii=False)
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_server_lanxin_review.py -q
```
Expected: FAIL（端点不存在 → 404/405；常量不存在 → `AttributeError`）

- [ ] **Step 3: 实现**

① `server.py` 顶部加 `import lanxin_review`。

② 常量区（`LANXIN_CALLBACK_MAX_BYTES` 附近）加：

```python
# H5 反馈的内容上限。与回调条目同一个量级(lanxin_callback._MAX_TEXT)——
# 收件箱是给人读的,超长正文只会把界面撑爆;免登录写入口更必须封顶。
LANXIN_H5_MAX_TEXT = 20000
# 单工号单日提交上限。免登录写入口若不限频,等于给了任何持链接者一个写盘放大器。
# 计数从收件箱现有条目得出,不新增状态。
LANXIN_H5_MAX_PER_DAY = 100
```

③ `_AUTH_EXEMPT` 加两项：

```python
# /api/lanxin/review/{items,submit} 免登录:H5 页在蓝信内置 webview 里打开,
# 那里没有本系统会话。安全边界是【token 验签 + 越权写校验】而非会话,
# 与 /api/lanxin/callback 同级对待(见 spec §4.5.4)。
_AUTH_EXEMPT = ('/api/login', '/api/logout', '/api/auth/me', '/api/lanxin/callback',
                '/api/lanxin/review/items', '/api/lanxin/review/submit')
```

④ 新增三个 handler（放在 `handle_lanxin_unresponded_get` 附近）：

```python
    def _review_secret(self):
        """取 H5 token 密钥(缺失则生成并落盘一次)。绝不打日志。"""
        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        return lanxin_config.ensure_review_token_secret(LANXIN_CONFIG_FILE, cfg), cfg

    def _serve_review_html(self):
        """GET /review/<token> —— H5 填报页。【免登录】,且【不在这一步校验 token】。

        为什么不校验:页面本身零敏感内容(待办数据靠 items 接口另取),而且这样
        token 失效时用户看到的是页面里的「链接失效」提示,而不是白屏或 403 ——
        后者会让人以为系统坏了。校验在 items/submit 两个接口。
        """
        path = os.path.join(WEB_ROOT, 'review.html')
        if not os.path.isfile(path):
            self._send_json(404, {"success": False, "reason": "review.html 未部署"})
            return
        with open(path, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        # H5 页内容随 token 变(页面本身是静态的,但避免中间层缓存住旧版)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def handle_lanxin_review_items(self):
        """GET /api/lanxin/review/items?token=… —— 该员工的待办快照。【免登录】。

        清单取自【推送快照】(发送台账的 reviewItems)而非实时重算:「关注原因」
        口径在前端 TS,后端没有它;实时查只能靠跨语言复制口径,或把 17MB 全员数据
        下发给这个【免登录】页面 —— 两条都不可接受(见 spec §4.5.1a)。
        快照还有个好处:员工看到的正是卡片告诉他的那几项。
        """
        token = (parse_qs(urlparse(self.path).query).get('token') or [''])[0]
        secret, cfg = self._review_secret()
        payload = lanxin_review.verify_token(token, secret, int(time.time()))
        if not payload:
            # 200 + success:false(不是 401/500)—— 让页面显示「链接失效」
            self._send_json(200, {"success": False, "reason": "invalid"})
            return
        with _lanxin_inbox_lock:
            store = _load_lanxin_inbox()
        items, name = [], ''
        for e in reversed(store.get('sent') or []):
            if str(e.get('employId') or '') != payload['emp']:
                continue
            if str(e.get('routeKey') or '') != payload['kind']:
                continue
            items = list(e.get('reviewItems') or [])
            name = str(e.get('name') or '')
            break                      # 最近一次推送即当前待办
        self._send_json(200, {
            "success": True, "kind": payload['kind'], "name": name, "items": items,
            "deadlineHours": int(cfg.get('reviewDeadlineHours')
                                 or lanxin_config.DEFAULT_REVIEW_DEADLINE_HOURS)})

    def handle_lanxin_review_submit(self):
        """POST /api/lanxin/review/submit —— 落收件箱。【免登录】。

        闸门:① token 验签 → ② 越权写(目标必须落在该工号的推送快照里) →
        ③ 内容非空 + 长度封顶 → ④ 频率(单工号单日) → ⑤ 落库。

        ② 是本期最容易漏的一条:不校验的话,任何人拿自己的 token 就能往【任意】
        项目写反馈。判据是纯数据的 —— token 绑工号 → 查该工号台账 → 白名单。

        入库存【原文】,不在这里 html.escape:归入跟进域那一步已经会转义 +
        换行只用 <br>,这里再转一次会双重转义成可见乱码。既有回调条目同样存原文。
        """
        body = self._read_json_body()
        if not isinstance(body, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        secret, _cfg = self._review_secret()
        payload = lanxin_review.verify_token(body.get('token'), secret, int(time.time()))
        if not payload:
            self._send_json(400, _error_payload(ERR_VALIDATION, "链接已失效"))
            return
        emp, kind = payload['emp'], payload['kind']
        content = str(body.get('content') or '').strip()
        if not content:
            self._send_json(400, _error_payload(ERR_VALIDATION, "反馈内容不能为空"))
            return

        with _lanxin_inbox_lock:
            store = _load_lanxin_inbox()
        # ② 越权写:目标必须落在【该工号】最近一次同类推送的快照里
        snapshot = []
        for e in reversed(store.get('sent') or []):
            if (str(e.get('employId') or '') == emp
                    and str(e.get('routeKey') or '') == kind):
                snapshot = list(e.get('reviewItems') or [])
                break
        target_pid = str(body.get('projectId') or '')
        target_code = str(body.get('code') or '')
        if kind == 'project':
            allowed = {str(i.get('projectId') or '') for i in snapshot}
            ok_target = bool(target_pid) and target_pid in allowed
        else:
            allowed = {str(i.get('code') or '') for i in snapshot}
            ok_target = bool(target_code) and target_code in allowed
        if not ok_target:
            self._send_json(400, _error_payload(ERR_VALIDATION, "该条目不在你的待办清单内"))
            return

        now = datetime.now().strftime(lanxin_inbox.TS_FMT)
        today = now[:10]
        # ④ 频率:从收件箱现有条目计数,不新增状态
        same_day = sum(1 for it in (store.get('items') or [])
                       if it.get('source') == 'h5'
                       and str(it.get('employId') or '') == emp
                       and str(it.get('receivedAt') or '')[:10] == today)
        if same_day >= LANXIN_H5_MAX_PER_DAY:
            self._send_json(400, _error_payload(ERR_VALIDATION, "今日提交次数已达上限"))
            return

        def _mutate(st):
            lanxin_inbox.add_item(st, {
                "id": "h5-%s-%s" % (emp, now.replace(' ', 'T')),
                "receivedAt": now,
                "status": "parsed",
                "unparsedReason": None,
                "eventType": "h5_review",
                # staffId 从台账按工号反查补上 —— 收件箱既有的身份反查与归因候选
                # 都按 staffId 索引,补上它们对 H5 条目照样生效
                "staffId": lanxin_inbox.staff_id_of_employ(st, emp),
                "employId": emp,
                "name": next((str(e.get('name') or '') for e in reversed(st.get('sent') or [])
                              if str(e.get('employId') or '') == emp), None) or None,
                "msgType": "text",
                "text": content[:LANXIN_H5_MAX_TEXT],
                "rawMsgData": {},
                "groupId": None,
                "groupName": None,
                "handled": False,
                "handledInfo": None,
                # 本期新增两键。既有回调条目没有它们 → 前端按「缺失即回调」处理
                "source": "h5",
                "projectId": target_pid or None,
                "issueCode": target_code or None,
            })
            lanxin_inbox.prune(st, now)
            return True

        ok, _res = self._followup_txn(_lanxin_inbox_lock, _load_lanxin_inbox,
                                     _mutate, _save_lanxin_inbox)
        if not ok:
            self._send_json(400, _error_payload(ERR_VALIDATION, "保存失败，请重试"))
            return
        self._send_json(200, {"success": True})
```

> 上面 `_followup_txn` / `_error_payload` / `ERR_PARSE` / `ERR_VALIDATION` / `_send_json` / `_read_json_body` / `WEB_ROOT` 都是 `server.py` **既有的**，用法照该文件其它 handler 抄。
> `_review_secret` 返回 `(secret, cfg)` 二元组，两个 handler 都用得到 cfg。

⑤ GET 路由表：`'/api/lanxin/unresponded'` 那条之后加

```python
        elif parsed.path == '/api/lanxin/review/items':
            self.handle_lanxin_review_items()
```

⑥ **在 GET 的末尾 `else` 块里、`should_spa_fallback` 之前**插显式分支（这一步最容易漏）：

```python
        else:
            # H5 填报页(免登录)。必须在 SPA 回退【之前】—— should_spa_fallback('/review/xxx')
            # 返回 True(无 /api 前缀、末段无点),不拦就会吐 Vue 的 index.html:
            # 页面能打开、但完全不是那个页面,且不会有任何报错。
            if parsed.path.startswith('/review/'):
                self._serve_review_html()
                return
            translated = self.translate_path(parsed.path)
            ...
```

⑦ POST 路由表：`'/api/lanxin/callback'` 那条附近加

```python
        elif parsed.path == '/api/lanxin/review/submit':
            self.handle_lanxin_review_submit()
```

⑧ `handle_lanxin_preview` 与 `handle_lanxin_send` 两处 `lanxin.build_plan(...)` 调用加 `review_secret`：

```python
            secret = lanxin_config.ensure_review_token_secret(LANXIN_CONFIG_FILE, cfg)
            plan = lanxin.build_plan(body.get('items') or [], cfg,
                                     self._lanxin_tree(), self._lanxin_pmis(),
                                     now=datetime.now().strftime('%Y-%m-%d %H:%M'),
                                     review_secret=secret)
```

⑨ **`lanxin_inbox.TS_FMT` 已是公开名，无需任何改动** —— 已核实：`lanxin_inbox.py:30` 定义、`lanxin_unresponded.py:25` 从它 import、`server.py:3488/3557/3632` 三处引用它（上一期终审修复波已完成这次收敛）。直接用 `lanxin_inbox.TS_FMT`，**不要写字面量** —— `server.py:3483` 那条注释专门警告过这一点。

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_server_lanxin_review.py -q
python -m pytest tests/test_server_lanxin.py tests/test_server_lanxin_callback.py -q
```
Expected: 新文件全 PASS；既有两个文件**一条不许变红**。

- [ ] **Step 5: 反向验证四条**

① 删掉越权写校验（把 `if not ok_target:` 整段去掉）→ `test_submit_rejects_project_not_in_snapshot` 与 `test_submit_rejects_other_persons_project` 必须**双双** FAIL。
② 删掉 `/review/` 那个显式分支 → `test_review_page_not_swallowed_by_spa_fallback` 必须 FAIL（会吐 Vue SPA）。
③ 从 `_AUTH_EXEMPT` 删掉两项 → `test_items_no_login_required` 必须 FAIL。
④ 给 `text` 加上 `html.escape(...)` → `test_submit_stores_raw_text_not_escaped` 必须 FAIL。
逐项确认后改回，重跑全绿。

- [ ] **Step 6: 提交**

```bash
git add server.py tests/test_server_lanxin_review.py
git commit -m "feat(lanxin): H5 三个免登录端点(token 验签 + 越权写按快照白名单 + 限频)"
```

---

## Task 6: `review.html` 单文件 H5 页

**Files:**
- Create: `frontend/public/review.html`

**Interfaces:**
- Consumes: `GET /api/lanxin/review/items?token=`、`POST /api/lanxin/review/submit`（T5）

**为什么是单文件零构建**：H5 在手机上打开，Vue SPA 的 bundle 单 chunk >500KB（本仓既有技术债），首屏太慢；而这个页面只有一张表单，不值得走构建。放 `frontend/public/` 下由 vite 原样拷进 `dist/`（**这是 vite 对 `public/` 的既定行为，不需要配置**）。

- [ ] **Step 1: 新建目录与文件**

```bash
mkdir -p frontend/public
```

新建 `frontend/public/review.html`。要求（**逐条都要满足**）：

1. `<!DOCTYPE html>` + `<html lang="zh-CN">`，`<meta name="viewport" content="width=device-width, initial-scale=1.0">`
2. **根元素 `<div id="review-root">`** —— 后端测试靠 `review-root` 这个串区分「吐的是 review.html」还是「被 SPA 回退吃掉吐了 index.html」。**不要改这个 id。**
3. **零外链**：CSS 全部 `<style>` 内联、JS 全部 `<script>` 内联，**不引任何 CDN/字体/图标**。蓝信 webview 可能没有外网。
4. 从 `location.pathname` 末段取 token：`const token = location.pathname.split('/').filter(Boolean).pop() || ''`
5. 启动即 `fetch` items 接口（**注意路径前缀**：页面自身是 `<base>` 之外的静态页，接口要用与页面同源的相对路径 —— 用 `location.pathname` 里 `/review/` 之前的那段做前缀，例如：
   ```js
   const apiBase = location.pathname.slice(0, location.pathname.indexOf('/review/'))
   fetch(apiBase + '/api/lanxin/review/items?token=' + encodeURIComponent(token))
   ```
   这样 `/pm/review/xxx` → `apiBase='/pm'` → 打 `/pm/api/...`；开发环境 `/review/xxx` → `apiBase=''` → 打 `/api/...`。**不要写死 `/pm`** —— 本期问题①的根因就是写死前缀。)
6. `success:false` → 整页显示「链接已失效，请联系管理员重新推送」，**不显示表单**
7. `items` 为空 → 显示「当前没有待反馈的事项」
8. 每个 item 一张卡：project 侧显示项目名 + 各原因（`category` + `detail`）；timesheet 侧显示 `label` + `count 条` + `最近 lastDate`；下面一个 `<textarea>` 与一个「提交」按钮
9. 提交按钮点击 → POST（project 侧带 `projectId`、timesheet 侧带 `code`）→ 成功则该卡片就地变成「已提交」并禁用 textarea 与按钮；失败则**把后端返回的 `error.message` 原样显示在该卡片下**（不要吞掉）
10. **提交中禁用按钮**，防连点重复提交
11. 顶部显示「你好，{name}」与「请在 {deadlineHours} 小时内反馈」
12. 移动端优先：单列、按钮大（≥44px 高）、字号 ≥16px（避免 iOS 自动缩放）
13. **不使用任何 emoji**
14. 全文简体中文

- [ ] **Step 2: 手工验证页面能被服务**

```bash
python -m pytest tests/test_server_lanxin_review.py -q -k "review_page"
```
Expected: 两条 PASS（此前它们因文件不存在而 FAIL）

> 这两条测试读的是 `WEB_ROOT` 下的 `review.html`。开发环境 `WEB_ROOT` 指向 `frontend/dist`，所以**需要先构建一次**让 vite 把 `public/review.html` 拷过去：`npm --prefix frontend run build`。若不想每次都构建，测试里也可 monkeypatch `WEB_ROOT` 指向 `frontend/public` —— 二者取其一，在报告里说明选了哪个。

- [ ] **Step 3: 构建并确认 vite 拷了过去**

```bash
npm --prefix frontend run build
ls frontend/dist/review.html
grep -c "review-root" frontend/dist/review.html
```
Expected: 文件存在，`review-root` 命中 1 次

- [ ] **Step 4: 提交**

```bash
git add frontend/public/review.html
git commit -m "feat(lanxin): H5 反馈填报页(单文件零构建零外链,接口前缀按 pathname 自推)"
```

---

## Task 7: 配置卡加 `reviewBaseUrl`（按部署前缀自动推导预填）

**Files:**
- Modify: `frontend/src/components/LanxinConfigCard.vue`
- Modify: `frontend/src/lib/lanxinApi.ts`
- Test: `frontend/src/components/LanxinConfigCard.test.ts`

**Interfaces:**
- Consumes: `cfg.reviewBaseUrl`（T2 已让它经 `public_config` 下发）、既有的 `apiUrl` from `@/lib/baseUrl`

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/components/LanxinConfigCard.test.ts`。

**已核实的既有写法（照用，别另造）**：该文件有 `buildCfg(override)` 配置工厂（第 47 行）与 **`const mountCard = async (...)`**（第 62 行，**是 async，调用必须 `await`**，第二个参数承载 `rejected`）；保存按钮 selector 是 `[data-test="lx-save"]`。**先把 `buildCfg` 的默认对象里加上 `reviewBaseUrl: ''`**，否则新用例读到 `undefined`。

```ts
it('H5 基地址输入框绑定 reviewBaseUrl', async () => {
  const w = await mountCard()
  expect(w.find('[data-test="lx-review-base-url"]').exists()).toBe(true)
  await w.find('[data-test="lx-review-base-url"] input').setValue('http://h/pm')
  expect((w.vm as any).cfg.reviewBaseUrl).toBe('http://h/pm')
})

it('【承重】保存时把 reviewBaseUrl 提交给后端', async () => {
  // 与后端 validate_config 白名单同一故障模式:漏了这个字段 →
  // 超管填了地址、点保存、无任何报错、刷新又变回空 → H5 链接永远发不出去
  const w = await mountCard()
  ;(w.vm as any).cfg.reviewBaseUrl = 'http://h/pm'
  await w.find('[data-test="lx-save"]').trigger('click')
  await flushPromises()
  expect(vi.mocked(saveLanxinConfig)).toHaveBeenCalledWith(
    expect.objectContaining({ reviewBaseUrl: 'http://h/pm' }))
})

it('【承重】建议地址按部署前缀推导,不是写死值', async () => {
  // 本期问题①的根因正是「页面显示了一个漏 /pm 前缀的地址、超管一字不差照抄」。
  // 同一个坑不能踩第二次:建议值必须用与实现同源的 apiUrl() 推导。
  // 【stubEnv 不可省】vitest 下 BASE_URL 恒为 '/',此时 joinBase 是空操作,
  // 写死值与推导值【逐字节相同】,不 stub 的断言测不出「漏前缀」(第六种假绿)。
  vi.stubEnv('BASE_URL', '/pm/')
  try {
    const w = await mountCard()
    expect(w.find('[data-test="lx-review-base-suggest"]').text())
      .toContain(`${window.location.origin}/pm`)
  } finally {
    vi.unstubAllEnvs()
  }
})

it('一键填入建议地址', async () => {
  vi.stubEnv('BASE_URL', '/pm/')
  try {
    const w = await mountCard()
    await w.find('[data-test="lx-review-base-fill"]').trigger('click')
    expect((w.vm as any).cfg.reviewBaseUrl).toBe(`${window.location.origin}/pm`)
  } finally {
    vi.unstubAllEnvs()
  }
})
```

> **第三条那个 `vi.stubEnv('BASE_URL', '/pm/')` 不可省。** 上一期实测：vitest 下 `import.meta.env.BASE_URL` 恒为 `'/'`，此时 `joinBase` 是空操作，**写死值与推导值字符串逐字节相同** —— 不 stub 的断言测不出「漏前缀」，那正是本仓已记录的第六种假绿（测试环境把待测的区分本身抹平了）。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/components/LanxinConfigCard.test.ts
```
Expected: 4 条新用例 FAIL

- [ ] **Step 3: 实现**

① `lanxinApi.ts` 的 `LanxinConfig` 接口加 `reviewBaseUrl: string`，`credentials` 内加 `hasReviewTokenSecret?: boolean`。

② `LanxinConfigCard.vue` 的 `<script setup>` 加：

```ts
// H5 基地址的【建议值】。绝不写死 —— 前缀由构建时的 vite base 决定(开发 '/' /
// 生产 '/pm/')。本期问题①的根因正是「页面显示了一个漏 /pm 的地址、超管照抄」,
// 同一个坑不能踩第二次。apiUrl('/') 去掉末尾斜杠即得部署根。
const suggestedReviewBase = computed(
  () => window.location.origin + apiUrl('/').replace(/\/$/, ''))
```

③ 在「回调」小节**之后**新增一个「H5 反馈页」小节：

```vue
      <div class="dv-sub-head">H5 反馈页（员工点卡片跳转填报，不依赖回调）</div>
      <div class="dv-row">
        <span class="dv-label">对外基地址</span>
        <el-input v-model="cfg.reviewBaseUrl" size="small" style="width: 320px"
          data-test="lx-review-base-url" placeholder="留空 = 不发 H5 链接" />
        <el-button size="small" data-test="lx-review-base-fill"
          @click="cfg.reviewBaseUrl = suggestedReviewBase">填入建议值</el-button>
        <span class="dv-hint" data-test="lx-review-base-suggest">
          建议 {{ suggestedReviewBase }} · 按本系统实际部署前缀自动生成，不要手抄
        </span>
      </div>
```

④ 保存载荷确认含 `reviewBaseUrl`（若 `onSave` 是整体深拷贝 `cfg`，天然带上；若是显式挑字段的白名单式，**必须显式加**）。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/components/LanxinConfigCard.test.ts
npm --prefix frontend run typecheck
```
Expected: 全 PASS，既有 26 条一条不许变红

- [ ] **Step 5: 反向验证两条**

① 把 `suggestedReviewBase` 改成写死 `'http://10.248.105.95/pm'` → 第三条必须 FAIL（且失败原因应是 **origin 与前缀都不符**，不只是 origin）。
② 从保存载荷里去掉 `reviewBaseUrl` → 第二条必须 FAIL。
各自确认后改回。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/LanxinConfigCard.vue frontend/src/lib/lanxinApi.ts frontend/src/components/LanxinConfigCard.test.ts
git commit -m "feat(lanxin): 配置卡加 H5 基地址(建议值按部署前缀自推,不写死)"
```

---

## Task 8: 收件箱辨识 H5 条目 + 归入预选项目

**Files:**
- Modify: `frontend/src/lib/lanxinInbox.ts`
- Modify: `frontend/src/components/LanxinInboxCard.vue`
- Test: `frontend/src/components/LanxinInboxCard.test.ts`

**Interfaces:**
- Consumes: 收件箱条目新增的 `source` / `projectId` / `issueCode`（T5）

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/components/LanxinInboxCard.test.ts`。

**已核实的既有写法（照用，别另造）**：
- 夹具是**函数** `baseItem(overrides: Partial<LanxinInboxItem>)`（第 21 行），**不是**常量 `ITEM`
- `mountInbox(items)` 是 **async**（第 31 行），调用必须 `await`
- 打开归入抽屉用既有辅助 **`openHandleDrawer(wrapper)`**（第 45 行）
- `handleForm` 是**单个 ref**（组件第 52 行，一次只开一个抽屉），**不是**按条目索引的 map；已 `defineExpose`（第 143 行），既有用例就是这样读的：`vm.handleForm.projectId`

```ts
it('H5 反馈条目带来源标识,与员工文本回复可区分', async () => {
  // 两条通道汇流一处是设计(spec §4.5.2),但超管必须能看出哪条是结构化的 H5 反馈
  // (自带项目号、可直接归入)、哪条是自由文本回复(要人工判断归到哪)
  const w = await mountInbox([
    baseItem({ id: 'h5-1', source: 'h5', projectId: 'P1', text: 'H5 来的' }),
    baseItem({ id: 'cb-1', text: '回复来的' }),       // 既有条目没有 source 键
  ])
  expect(w.find('[data-test="lx-item-source-h5-1"]').text()).toContain('H5')
  expect(w.find('[data-test="lx-item-source-cb-1"]').text()).toContain('回复')
})

it('【承重】H5 条目归入时预选它自带的项目号', async () => {
  // H5 反馈天生知道是哪个项目(卡片就是按项目推的),不预选等于把结构化信息
  // 丢回给人工判断 —— 那正是 H5 通道相对文本回复的全部优势
  const w = await mountInbox([baseItem({ id: 'h5-1', source: 'h5', projectId: 'P7' })])
  await openHandleDrawer(w)
  const vm = w.vm as unknown as { handleForm: { projectId: string } }
  expect(vm.handleForm.projectId).toBe('P7')
})

it('既有回调条目缺 source 键时不报错、按「回复」处理且不预选项目', async () => {
  // 老数据向后兼容:V4.5.8 及以前的条目没有 source/projectId/issueCode 三个键
  const w = await mountInbox([baseItem({ id: 'cb-1' })])
  expect(w.find('[data-test="lx-item-source-cb-1"]').text()).toContain('回复')
  await openHandleDrawer(w)
  const vm = w.vm as unknown as { handleForm: { projectId: string } }
  expect(vm.handleForm.projectId).toBe('')
})
```

> `openHandleDrawer(w)` 打开的是**当前列表里的那一条**；上面两条预选用例各自只放一个条目，所以不会歧义。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/components/LanxinInboxCard.test.ts
```
Expected: 3 条新用例 FAIL

- [ ] **Step 3: 实现**

① `lanxinInbox.ts` 的 `LanxinInboxItem` 加两个**可选**字段（老条目没有它们）：

```ts
  /** 来源。缺失 = V4.5.8 及以前的条目,一律按蓝信文本回复处理。 */
  source?: 'h5' | 'callback'
  /** H5 反馈自带的项目号(project 侧)。文本回复没有这个信息。 */
  projectId?: string | null
  /** H5 反馈自带的问题码(timesheet 侧)。 */
  issueCode?: string | null
```

并加一个纯函数：

```ts
/** 来源显示名。缺 source 键 = 老条目 = 蓝信文本回复。 */
export function sourceLabel(item: Pick<LanxinInboxItem, 'source'>): string {
  return item.source === 'h5' ? 'H5 反馈' : '蓝信回复'
}
```

② `LanxinInboxCard.vue`：
- 每行加来源标识（用 `sourceLabel`，`data-test="lx-item-source-<id>"`，`<id>` 用条目自己的 `id`）
- **`openHandle(item)`（第 78 行）里**：初始化 `handleForm` 时，若 `item.projectId` 非空则用它预填 `projectId`，否则维持既有的空串。**只改这一处赋值**，`handleForm` 仍是单个 ref、结构不变（`defineExpose` 那行也不用动）。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/components/LanxinInboxCard.test.ts
npm --prefix frontend run typecheck
```
Expected: 全 PASS，既有 14 条一条不许变红

- [ ] **Step 5: 反向验证两条**

① 把 `sourceLabel` 改成恒返回 `'蓝信回复'` → 第一条必须 FAIL。
② 去掉 `projectId` 预填 → 第二条必须 FAIL。
各自确认后改回。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/lanxinInbox.ts frontend/src/components/LanxinInboxCard.vue frontend/src/components/LanxinInboxCard.test.ts
git commit -m "feat(lanxin): 收件箱辨识 H5 条目并预选其自带项目号"
```

---

## Task 9: 版本号、PROGRESS、全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`APP_VERSION` 改 `'V4.5.9'`；`RELEASE_DATE` 改为 `date +%Y-%m-%d` 的输出。

- [ ] **Step 2: 跑全量验证**

```bash
bash verify.sh
```
Expected: 全绿。基线 pytest **1295 passed**、前端 250 files / **2225 tests**。

若 vitest 全部用例通过但退出码非 0 → 未处理的 Promise rejection，查新挂载/改动组件里有没有没 mock 的 fetch。

**若 `verify.sh` 任何一项不绿，停下报告，不要改与本期无关的代码去凑绿。**

- [ ] **Step 3: 更新 PROGRESS.md**

写入要点：

- 「当前版本」改 V4.5.9，V4.5.8 降为「上一版本」。
- **二期交付内容**：H5 免登录反馈闭环——token（HMAC-SHA256，签名覆盖 payload+exp，TTL 48h）、待办快照（`dispatch` 写台账）、三个免登录端点、`review.html` 单文件页、`reviewBaseUrl` 配置项（建议值按部署前缀自推）、收件箱辨识 H5 条目。
- **一期预留的两处红利已兑现**：① 未响应清单**代码零改动**即获得项目级信息来源（H5 条目自带 `projectId`）；② `build_action_hint` 三态**函数零改动**，二期只是把 `h5_url` 真的传进去。
- **spec §4.5.1 的更正**：初稿「实时查，不冻结快照」不可实现（口径在前端 TS、后端没有；实时查只能跨语言复制口径或把 17MB 全员数据下发给免登录页），改为按推送快照查；快照同时给出越权写的纯数据判据。
- **勾销 L-53**（二期已开工并交付）。
- **升级须知**：本期改了 `.py` **且新增了 `frontend/public/review.html`**——必须 `systemctl restart pmplatform`，且 dist 必须重新构建（`review.html` 靠 vite 从 `public/` 拷贝）。
- **上线后必须做的事**（写进 backlog）：
  1. 超管在 `/data` 配置卡点「填入建议值」保存 `reviewBaseUrl`，**不要手抄**；
  2. 走一次真实推送 → 手机点卡片 → 确认 H5 页能打开、能提交、条目落进收件箱；
  3. 解密（AES-256-CBC）与解析（两套键名）两道闸门仍**从未跑过**（V4.5.8 遗留），H5 通道不依赖它们，但文本回复通道依赖。
- **新增 backlog**：`review.html` 未做浏览器目验（AI 无浏览器），须人工在手机或移动模拟器上过一遍。

- [ ] **Step 4: 提交**

```bash
git status                      # 确认无敏感项;绝不 git add -A
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.5.9 蓝信 H5 反馈闭环"
```

**不要 push、不要合并** —— 由主控在终审后处理。

---

## 明确不做（照抄 spec §5，防止执行时扩大改动面）

- 不做 approveCard 按钮交互（依赖回调回传，收益与 H5 重叠）
- 不移植 `supervision_*` 七个业务模块
- 不做自动触发调度（T-15/T/T+15）
- 不移植 `create_ws_endpoint`（副本里是零调用方的死代码）
- 不做失败重发台账
- **不改 `lanxin_unresponded.py`**（一期预留的红利就是它零改动）
- **不改 `build_summary_card`**（跨期承重约束）

---

## 自审记录

**Spec 覆盖核对：**

| spec 条目 | 落到哪个 Task |
|---|---|
| §4.5.1 流程（四个 HTTP 交互） | T5（端点）+ T6（页面） |
| §4.5.1a 待办取自推送快照 | T4（写快照）+ T5（读快照） |
| §4.5.1b `reviewBaseUrl` + 自动推导预填 | T2（后端）+ T7（界面） |
| §4.5.2 反馈落收件箱、零新数据文件 | T5（落库）+ T8（辨识/预选） |
| §4.5.3 token 设计（格式/TTL/密钥/compare_digest/绝不抛错） | T1（纯函数）+ T2（密钥持久化） |
| §4.5.4 五道闸门（身份/越权写/长度/转义/频率）+ 静态页不校验 token | T5 全部 |
| 卡片 `cardLink` 与三态文案切换 | T3（`_card` 支持）+ T4（接线） |

**类型一致性核对**：`issue_token(emp, kind, secret, now_epoch, ttl_hours)` / `verify_token(token, secret, now_epoch) -> {"emp","kind"}|None` 在 T1 定义、T4/T5 调用一致；`build_plan(..., now="", review_secret="")` 在 T4 定义、T5 调用一致；`staff_id_of_employ(store, employ_id) -> str` 在 T4 定义、T5 调用一致；`reviewItems` 的两种形状在 T4 产出、T5 消费、T6 渲染三处字段名一致（project: `projectId`/`name`/`reasons`；timesheet: `code`/`label`/`count`/`lastDate`）；收件箱新增 `source`/`projectId`/`issueCode` 在 T5 产出、T8 消费一致。

**已核准的既有符号**（写完计划后逐个查过源码，避免上一期「引用不存在的名字」重演）：
`validate_config` 的 `cred` 固定键元组在 `lanxin_config.py:177-178`；`public_config` 的脱敏元组在 `:278`；`save_config(path, cfg)` 在 `:250`；`_path_needs_auth` 只拦六个前缀（`server.py:199-205`）；`should_spa_fallback` 在 `server.py:1032`、GET 末尾 `else` 块在 `:1173-1181`；`record_sent` 白名单在 `lanxin_inbox.py:51`；`_srv`/`_login`/`_enabled_cfg` 在 `tests/test_server_lanxin.py:16/27/37`；`TREE`/`PMIS`/`_cfg_items`/`_cfg_with_callback` 在 `tests/test_lanxin.py:186/200/230/836`。

**自审时查出并改正的四处**（初稿写错了，若不改会像上一期那样白烧修复轮）：

| 初稿写的 | 实际 |
|---|---|
| 「`TS_FMT` 需确认是否公开名，若是下划线名则一并改」 | **已是公开名**（`lanxin_inbox.py:30`），`lanxin_unresponded.py:25` 已 import 它、`server.py` 三处已引用。**无需任何改动**，我那句「确认即可」是把假设当事实 |
| `const w = mountCard()`（同步调用） | `mountCard` 是 **async**（`LanxinConfigCard.test.ts:62`），必须 `await`；且需先给 `buildCfg`（:47）补 `reviewBaseUrl: ''` |
| `{ ...ITEM, id: … }` | 夹具是**函数** `baseItem(overrides)`（`LanxinInboxCard.test.ts:21`），没有 `ITEM` 常量；`mountInbox` 也是 async（:31） |
| `handleForm['h5-1'].projectId`（按条目索引的 map） | `handleForm` 是**单个 ref**（`LanxinInboxCard.vue:52`，一次只开一个抽屉），已 `defineExpose`（:143）；须先用既有辅助 `openHandleDrawer(w)`（test:45）打开，再读 `vm.handleForm.projectId` |

**需执行者就地适配的一处**（非占位符，是必须遵循既有写法的地方）：T4 最后那条 dispatch 接线测试的 monkeypatch 范式 —— 照 `tests/test_lanxin.py` 里既有的 dispatch 测试（如 `test_dispatch_returns_sent_log_for_identity_lookup`）抄，**不要新造 mock 体系**。
