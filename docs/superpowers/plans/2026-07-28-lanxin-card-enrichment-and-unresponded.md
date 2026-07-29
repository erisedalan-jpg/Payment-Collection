# V4.5.8 蓝信推送内容增强 + 未响应清单 + 回调诊断 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把蓝信推送卡片从「一人一张统计卡」升级为「一人一张明细卡」，配上超管可配的反馈时限与未响应清单，并让回调故障可见。

**Architecture:** 卡片仍是一人一张（实测单项目单卡会让单人收 32 张，见 spec §3.1），但 fields 从「原因→计数」换成「序号→项目名·原因(明细)」；明细来自 `riskReasons` 已有的 `detail` 字段，**不新增任何计算口径**。未响应清单是 `lanxin_inbox` 现有 `sent[]` × `items[]` 的**纯派生视图**，不新增数据文件。

**Tech Stack:** 后端纯 Python 标准库（`lanxin*.py` + `server.py`）；前端 Vue3 + TS + Element Plus；测试 pytest + vitest。

**Spec:** `docs/superpowers/specs/2026-07-28-lanxin-feedback-loop-and-card-enrichment-design.md`

## Global Constraints

- **版本号**：`frontend/src/version.ts` 的 `APP_VERSION` 改为 `'V4.5.8'`。**单一来源，只改此处。**
- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **绝不记密钥**：`appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` 绝不进日志、审计、异常消息、前端下发。本期新增的 `lastTimestampSample` 是 timestamp 原值，**不是密钥**，可下发。
- **后端不接受前端传来的标识**：只认 `projectId` / `employId` / `riskCode`。本期前端新增传的 `detail` / `lastDate` 是**展示串**，不参与「推给谁 / 写到哪」的解析（论证见 spec §4.1.2）。
- **N 的单一来源**：卡片文案里的小时数与未响应清单判定用的小时数，**必须都读 `cfg['reviewDeadlineHours']`**，不各自默认。
- **蓝信 appCard 硬约束**：`bodyTitle` 必填非空；`headTitle` 单行不可含 `\n`；`fields` ≤10 对；`fields.key` ≤18 字节/6 汉字；`fields.value` ≤192 字节/64 字；`bodyContent` 渲染在 fields **之前**。
- **不改 `build_summary_card`（上级汇总卡）**：上级要的本就是统计。它是本期回归安全网的一部分。
- **不改 `lanxin_timestamp_fresh` 的解析逻辑**：在拿到 `lastTimestampSample` 实证前改它是猜测。
- **反向验证**：每条新增的契约/护栏测试，必须临时把实现改错、确认它**真的变红**，再改回。备份用 scratchpad **绝对路径**并立刻验证存在（`$TMPDIR` 在 Git Bash 下为空）；**绝不用 `git checkout` 还原**（会抹掉未提交改动）。
- **验证**：`bash verify.sh` 全绿才算完成。
- **提交**：只 `git add` 本次明确改动的文件，**绝不 `git add -A`**。

---

## File Structure

| 文件 | 本期职责 | 动作 |
|---|---|---|
| `lanxin_config.py` | 新增 `reviewDeadlineHours`（默认 24，校验 1~720），**并加进 `validate_config` 的返回 dict**（该 dict 是白名单，不加会被静默丢弃） | 改 |
| `lanxin_recipients.py` | 新增 `build_action_hint`（三态文案）；`build_project_card` 换成按项目分行；`build_timesheet_card` 加 `lastDate` 与动作要求 | 改 |
| `lanxin.py` | `build_plan` 增 `proj_detail_by_emp` **并行桶**（不动 `proj_by_emp`，汇总卡零影响）；接 `now` 参数 | 改 |
| `lanxin_unresponded.py` | 未响应清单纯函数，无 IO | **新建** |
| `server.py` | `_lanxin_rejected` 加 `lastTimestampSample`；新增 `GET /api/lanxin/unresponded`；build_plan 传 `now` | 改 |
| `frontend/src/lib/lanxin/items.ts` | `PushItem` 携带 `detail` / `lastDate` | 改 |
| `frontend/src/components/LanxinConfigCard.vue` | N 输入框 + 回调地址自显示 | 改 |
| `frontend/src/components/LanxinUnrespondedCard.vue` | 未响应清单表格 | **新建** |
| `frontend/src/views/DataView.vue` | 新增超管 tab | 改 |
| `frontend/src/version.ts` | `V4.5.8` | 改 |

**依赖顺序**：T1 → T7/T8；T2 → T3/T4 → T5；T6 → T7 → T9。

---

## Task 1: `reviewDeadlineHours` 配置项

**Files:**
- Modify: `lanxin_config.py`
- Test: `tests/test_lanxin_config.py`

**Interfaces:**
- Produces: 常量 `DEFAULT_REVIEW_DEADLINE_HOURS = 24`、`MIN_REVIEW_DEADLINE_HOURS = 1`、`MAX_REVIEW_DEADLINE_HOURS = 720`；`default_config()` 顶层含 `"reviewDeadlineHours": 24`；`validate_config()` 返回的 dict 含该键。

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_lanxin_config.py`：

```python
def test_default_config_has_review_deadline_hours():
    assert LC.default_config()["reviewDeadlineHours"] == 24


def test_validate_keeps_review_deadline_hours():
    """validate_config 的返回是【白名单 dict】,新键不显式加进去就会被静默丢弃 ——
    配了 48 保存后变回 24,页面上看不出任何异常。本条钉死它。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = 48
    assert LC.validate_config(cfg)["reviewDeadlineHours"] == 48


@pytest.mark.parametrize("bad", [0, -1, 721, 1000])
def test_validate_rejects_out_of_range_deadline(bad):
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = bad
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


@pytest.mark.parametrize("good", [1, 24, 720])
def test_validate_accepts_boundary_deadline(good):
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = good
    assert LC.validate_config(cfg)["reviewDeadlineHours"] == good


def test_validate_rejects_non_integer_deadline():
    """'24' 这种字符串必须拒,不许静默 int() —— 前端传错类型时要报出来。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = "24"
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


def test_public_config_carries_review_deadline_hours():
    """public_config 是深拷贝全量 + 抹密钥,顶层新键应自动透出;本条防将来有人改成白名单式。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = 36
    assert LC.public_config(cfg)["reviewDeadlineHours"] == 36
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_config.py -q -k "deadline or review"
```
Expected: FAIL —— `KeyError: 'reviewDeadlineHours'`

- [ ] **Step 3: 实现**

在 `lanxin_config.py` 的 `SEND_AS_VALUES` 常量附近加：

```python
# 反馈时限(小时)。卡片文案「N 小时内未反馈将列入《未响应清单》」与未响应清单的判定
# 【共用这一个值】—— 卡上写 24 小时、清单按 48 小时算,是必然会出的事故。
DEFAULT_REVIEW_DEADLINE_HOURS = 24
MIN_REVIEW_DEADLINE_HOURS = 1
MAX_REVIEW_DEADLINE_HOURS = 720        # 30 天
```

`default_config()` 的返回 dict 里，`"sendIntervalMs": 200` 同级加一行：

```python
        "reviewDeadlineHours": DEFAULT_REVIEW_DEADLINE_HOURS,
```

`validate_config()` 里，在 `send_as` 校验之后、`return` 之前插入：

```python
    deadline = cfg.get("reviewDeadlineHours", DEFAULT_REVIEW_DEADLINE_HOURS)
    # bool 是 int 的子类,True 会被当成 1 混过去 —— 显式排掉
    if isinstance(deadline, bool) or not isinstance(deadline, int):
        raise ValueError("reviewDeadlineHours 必须是整数")
    if not (MIN_REVIEW_DEADLINE_HOURS <= deadline <= MAX_REVIEW_DEADLINE_HOURS):
        raise ValueError("reviewDeadlineHours 须在 %d~%d 之间"
                         % (MIN_REVIEW_DEADLINE_HOURS, MAX_REVIEW_DEADLINE_HOURS))
```

并把 `return` 那一行改成（**这一步是本任务最容易漏的**）：

```python
    return {"enabled": enabled, "sendIntervalMs": interval, "sendAs": send_as,
            "reviewDeadlineHours": deadline,
            "credentials": cred, "routes": routes}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_config.py -q
```
Expected: 全部 PASS

- [ ] **Step 5: 反向验证「白名单」那条**

把 `return` 里的 `"reviewDeadlineHours": deadline,` 临时删掉，跑：

```bash
python -m pytest tests/test_lanxin_config.py -q -k "keeps_review_deadline"
```
Expected: FAIL（`24 != 48`）。确认后把那行加回去，重跑确认 PASS。

- [ ] **Step 6: 提交**

```bash
git add lanxin_config.py tests/test_lanxin_config.py
git commit -m "feat(lanxin): 新增 reviewDeadlineHours 配置项(默认24,校验1~720)"
```

---

## Task 2: `build_action_hint` 三态文案

**Files:**
- Modify: `lanxin_recipients.py`
- Test: `tests/test_lanxin_recipients.py`

**Interfaces:**
- Produces: `build_action_hint(deadline_hours: int, h5_url: str = "", reply_hint: bool = False) -> str`。**无任何可用通道时返回空串**。

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_lanxin_recipients.py`：

```python
def test_action_hint_h5_wins():
    """有 H5 时优先引导点卡片(二期上线后自动切到这一态,无需再改文案)。"""
    assert LR.build_action_hint(24, h5_url="http://x/review/t", reply_hint=True) == \
        "请点击卡片逐条反馈，24小时内未反馈将列入《未响应清单》"


def test_action_hint_falls_back_to_reply():
    assert LR.build_action_hint(48, h5_url="", reply_hint=True) == \
        "请直接回复本消息反馈，48小时内未反馈将列入《未响应清单》"


def test_action_hint_empty_when_no_channel():
    """【承重】没有任何回流通道时必须返回空串,调用方据此【不输出】动作要求 field。
    有通道才承诺反馈;否则卡上写「N 小时内未反馈将列入未响应清单」而人无处可反馈,
    就是空头支票。现有 REPLY_HINT 已有同款严谨性(见其上方注释)。"""
    assert LR.build_action_hint(24, h5_url="", reply_hint=False) == ""


def test_action_hint_uses_given_hours_verbatim():
    """N 由调用方传入,本函数不带自己的默认值 —— 默认值散落多处正是「卡上24、清单按48」的成因。"""
    assert "72小时内" in LR.build_action_hint(72, reply_hint=True)
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_recipients.py -q -k action_hint
```
Expected: FAIL —— `AttributeError: module 'lanxin_recipients' has no attribute 'build_action_hint'`

- [ ] **Step 3: 实现**

在 `lanxin_recipients.py` 的 `short_issue` 函数之后加：

```python
def build_action_hint(deadline_hours: int, h5_url: str = "",
                      reply_hint: bool = False) -> str:
    """卡片末尾「动作要求」文案。按【实际可用的回流通道】三态生成。

    返回空串 = 没有任何通道,调用方据此【不输出】动作要求 field。
    为什么不退化成「请及时处理」之类:卡上承诺「N 小时内未反馈将列入《未响应清单》」
    却没有任何能反馈的地方,就是空头支票。REPLY_HINT 上方注释已有同款判断
    (「回调没配就写『请直接回复』,是让人对着收不到的地方说话」)。

    deadline_hours 由调用方传入,本函数【不设默认值】—— 默认值散落多处,
    正是「卡上写 24 小时、清单按 48 小时算」这类事故的成因。
    """
    if h5_url:
        action = "请点击卡片逐条反馈"
    elif reply_hint:
        action = "请直接回复本消息反馈"
    else:
        return ""
    return "%s，%d小时内未反馈将列入《未响应清单》" % (action, deadline_hours)
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_recipients.py -q
```
Expected: 全部 PASS

- [ ] **Step 5: 反向验证「无通道返回空串」**

把 `return ""` 临时改成 `action = "请及时处理"`（即去掉三态里的空串分支），跑：

```bash
python -m pytest tests/test_lanxin_recipients.py -q -k no_channel
```
Expected: FAIL。确认后改回。

- [ ] **Step 6: 提交**

```bash
git add lanxin_recipients.py tests/test_lanxin_recipients.py
git commit -m "feat(lanxin): 新增 build_action_hint 三态动作要求文案(无通道返回空串)"
```

---

## Task 3: `build_project_card` 改为按项目分行

**Files:**
- Modify: `lanxin_recipients.py`
- Test: `tests/test_lanxin_recipients.py`

**Interfaces:**
- Consumes: `build_action_hint`（Task 2）
- Produces: `build_project_card(name: str, projects: List[Dict[str, Any]], action_hint: str = "", sent_at: str = "") -> Dict[str, Any]`
  其中 `projects` 形如 `[{"name": "XX项目", "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]}, ...]`
- **破坏性变更**：旧签名 `build_project_card(name, by_reason: Dict[str, List[str]], reply_hint: bool)` 作废，调用方在 Task 5 改。

- [ ] **Step 1: 写失败测试**

先**删掉** `tests/test_lanxin_recipients.py` 里所有针对旧 `build_project_card` 的用例（用 `grep -n build_project_card tests/test_lanxin_recipients.py` 找全），再追加：

```python
def _proj(name, *reasons):
    """reasons: (category, detail) 元组序列"""
    return {"name": name, "reasons": [{"category": c, "detail": d} for c, d in reasons]}


def test_project_card_lists_each_project_with_detail():
    card = LR.build_project_card("张三", [
        _proj("XX智慧园区", ("回款延期", "3 个延期节点")),
        _proj("YY数据中心", ("回款延期", "2 个延期节点"), ("风险未闭环", "2 个未关闭风险")),
    ])
    assert card["bodyTitle"] == "你名下 2 个项目需要跟进"
    # 多原因的排前面
    assert card["fields"][0] == {"key": "1", "value": "YY数据中心 · 回款延期(2 个延期节点)、风险未闭环(2 个未关闭风险)"}
    assert card["fields"][1] == {"key": "2", "value": "XX智慧园区 · 回款延期(3 个延期节点)"}


def test_project_card_key_is_index_not_project_name():
    """【承重】key 必须是序号。蓝信 fields.key 上限 6 汉字/18 字节,项目名普遍超限,
    截断后可能撞名(REASON_SHORT_LABELS 上方注释记着「总成本超支大于/小于5000」
    截断后完全相同的实测)。项目名放 value(64 字)才放得下。"""
    card = LR.build_project_card("张三", [
        _proj("华南区域智慧城市综合管理平台建设项目", ("回款延期", "1 个延期节点")),
    ])
    assert card["fields"][0]["key"] == "1"
    assert "华南区域智慧城市" in card["fields"][0]["value"]


def test_project_card_caps_detail_rows_at_8_and_counts_rest_accurately():
    """明细固定 8 行;「其余」的 N 是【全量计数】,与名字是否被截断无关。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 13)]
    card = LR.build_project_card("张三", projs)
    detail = [f for f in card["fields"] if f["key"].isdigit()]
    assert len(detail) == 8
    rest = [f for f in card["fields"] if f["key"] == "其余"][0]
    assert rest["value"].startswith("另有 4 个：")


def test_project_card_row_cap_is_unconditional():
    """明细上限恒为 8,【不因动作要求缺席而放宽到 9】——
    条件式上限会让「同一个人、配置一变、卡片行数就变」,排查时多一个变量。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 13)]
    no_hint = LR.build_project_card("张三", projs, action_hint="")
    with_hint = LR.build_project_card("张三", projs, action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert len([f for f in no_hint["fields"] if f["key"].isdigit()]) == 8
    assert len([f for f in with_hint["fields"] if f["key"].isdigit()]) == 8


def test_project_card_omits_action_field_when_hint_empty():
    """空 action_hint → 不出这个 field(不是出一个空 value 的 field)。"""
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))], action_hint="")
    assert all(f["key"] != "动作要求" for f in card["fields"])


def test_project_card_action_field_is_last():
    """动作要求必须在所有字段最下 —— bodyContent 渲染在 fields 之前(蓝信实测),
    所以只能放 fields 末尾。"""
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))],
                                 action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert card["fields"][-1]["key"] == "动作要求"


def test_project_card_never_exceeds_10_fields():
    """8 明细 + 其余 + 动作要求 = 恰好 10,是蓝信硬上限,永不越线。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 30)]
    card = LR.build_project_card("张三", projs, action_hint="x")
    assert len(card["fields"]) == 10


def test_project_card_head_and_title_never_empty():
    """蓝信硬约束:bodyTitle 必填非空;headTitle 单行不可含换行。"""
    for sent_at in ("", "2026-07-28 09:00"):
        card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))], sent_at=sent_at)
        assert card["bodyTitle"]
        assert card["headTitle"]
        assert "\n" not in card["headTitle"]


def test_project_card_sent_at_goes_to_head_title():
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))],
                                 sent_at="2026-07-28 09:00")
    assert card["headTitle"] == "推送时间：2026-07-28 09:00"


def test_project_card_reason_without_detail_shows_category_only():
    """detail 为空时不拼出「回款延期()」这种残文案。"""
    card = LR.build_project_card("张三", [_proj("A", ("数据异常", ""))])
    assert card["fields"][0]["value"] == "A · 数据异常"
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_recipients.py -q -k project_card
```
Expected: FAIL（旧实现签名不符，`AttributeError` 或 `TypeError`）

- [ ] **Step 3: 实现**

把 `lanxin_recipients.py` 里整个 `build_project_card` 替换成：

```python
PROJECT_DETAIL_ROWS = 8        # 明细行上限。8 + 「其余」+ 「动作要求」= 10,正好是蓝信 fields 硬上限


def build_project_card(name: str, projects: List[Dict[str, Any]],
                       action_hint: str = "", sent_at: str = "") -> Dict[str, Any]:
    """项目卡 → 项目经理本人。一人一张。

    projects: [{"name": 项目名, "reasons": [{"category":…, "detail":…}, …]}, …]

    为什么仍是聚合卡而不是单项目单卡:实测 638 个在建项目里 324 个命中关注原因、
    涉及 69 人,单人最多背 32 个 —— 单项目单卡会让 3 个人一次收到 20+ 张,一次就砸掉
    功能信任。督办系统能用单卡是因为它按「计划回款日 T-15/T/T+15」触发、天然稀疏,
    我们是存量全量扫描、天然稠密。

    fields.key 用【序号】而非项目名:蓝信 key 上限 6 汉字/18 字节,项目名普遍超限,
    截断后可能撞名(见 REASON_SHORT_LABELS 上方那条实测)。项目名放 value(64 字)。

    明细行上限恒为 PROJECT_DETAIL_ROWS,【不因 action_hint 缺席而放宽】——
    条件式上限会让「同一个人、配置一变、卡片行数就变」,排查时多一个变量。

    按项目分行使每个项目恰好出现一次。旧实现按【原因】分行,同一项目命中多个原因时
    会在多行出现,不得不用 omitted = dropped - shown 去重,否则出现「标题说 49 个、
    正文说另有 60 个未列出」的自相矛盾(实测过)。新结构下该矛盾不可能发生,去重逻辑
    已随之删除,不是保留。
    """
    rows = sorted(projects, key=lambda p: (-len(p["reasons"]), p["name"]))
    shown, rest = rows[:PROJECT_DETAIL_ROWS], rows[PROJECT_DETAIL_ROWS:]

    fields: List[Dict[str, str]] = []
    for idx, p in enumerate(shown, 1):
        parts = [("%s(%s)" % (r["category"], r["detail"])) if r.get("detail") else r["category"]
                 for r in p["reasons"]]
        fields.append(_field(str(idx), "%s · %s" % (p["name"], "、".join(parts))))
    if rest:
        # N 是【全量计数】,与名字列表是否被 fit_field 截断无关
        fields.append(_field("其余", "另有 %d 个：%s"
                             % (len(rest), "、".join(p["name"] for p in rest))))
    if action_hint:
        fields.append(_field("动作要求", action_hint))

    return _card(("推送时间：%s" % sent_at) if sent_at else "项目关注提醒",
                 "你名下 %d 个项目需要跟进" % len(rows),
                 "",
                 fields,
                 "")      # bodyContent 留空:它渲染在 fields 之前,动作要求放这儿会跑到最上面
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_recipients.py -q
```
Expected: 全部 PASS。若 `build_summary_card` / `fit_bytes` 相关用例变红 → **说明改坏了不该动的东西，回头看**。

- [ ] **Step 5: 反向验证两条承重**

① 把 `_field(str(idx), ...)` 改成 `_field(p["name"], ...)`，跑 `-k key_is_index` → 必须 FAIL。
② 把 `rows[:PROJECT_DETAIL_ROWS]` 改成 `rows[:PROJECT_DETAIL_ROWS if action_hint else PROJECT_DETAIL_ROWS + 1]`，跑 `-k row_cap_is_unconditional` → 必须 FAIL。
两条都确认后改回，重跑全绿。

- [ ] **Step 6: 提交**

```bash
git add lanxin_recipients.py tests/test_lanxin_recipients.py
git commit -m "feat(lanxin): 项目卡改为按项目分行(序号做key/项目名进value/明细含原因detail)"
```

---

## Task 4: `build_timesheet_card` 增强

**Files:**
- Modify: `lanxin_recipients.py`
- Test: `tests/test_lanxin_recipients.py`

**Interfaces:**
- Consumes: `build_action_hint`（Task 2）
- Produces: `build_timesheet_card(name: str, issues: List[Dict[str, Any]], start: str, end: str, action_hint: str = "", sent_at: str = "") -> Dict[str, Any]`
  `issues` 元素新增**可选** `lastDate`：`{"code":…, "label":…, "count":…, "lastDate": "2026-07-25"}`
- **破坏性变更**：末位参数由 `reply_hint: bool` 换成 `action_hint: str`，调用方在 Task 5 改。

- [ ] **Step 1: 写失败测试**

删掉 `tests/test_lanxin_recipients.py` 里针对旧 `build_timesheet_card` 的用例，追加：

```python
def test_timesheet_card_shows_last_date():
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5, "lastDate": "2026-07-25"},
    ], "2026-07-20", "2026-07-26")
    assert card["fields"][0] == {"key": "未填工作成果", "value": "5 条 · 最近 07-25"}


def test_timesheet_card_omits_last_date_when_absent():
    """lastDate 缺失 → 不拼出「· 最近 」这种残文案。与 start/end 同策略:
    宁可不显示,不显示空值。"""
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5},
    ], "2026-07-20", "2026-07-26")
    assert card["fields"][0]["value"] == "5 条"


def test_timesheet_card_action_field_is_last():
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5, "lastDate": "2026-07-25"},
    ], "2026-07-20", "2026-07-26",
        action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert card["fields"][-1]["key"] == "动作要求"


def test_timesheet_card_omits_action_field_when_hint_empty():
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5},
    ], "", "", action_hint="")
    assert all(f["key"] != "动作要求" for f in card["fields"])


def test_timesheet_card_keeps_short_label_mapping():
    """回归安全网:超 18 字节的标签仍走 short_issue 短标签,本次改动不得影响它。"""
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_NEXT", "label": "缺少下一步工作计划", "count": 2},
    ], "", "")
    assert card["fields"][0]["key"] == "缺下一步计划"


def test_timesheet_card_keeps_subtitle_rule():
    """回归安全网:start/end 任一为空则不出副标题,绝不拼半截文案。"""
    assert LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "2026-07-20", "")["bodySubTitle"] == ""
    assert LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "2026-07-20", "2026-07-26")["bodySubTitle"] \
        == "统计区间 2026-07-20 ~ 2026-07-26"


def test_timesheet_card_sent_at_goes_to_head_title():
    card = LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "", "", sent_at="2026-07-28 09:00")
    assert card["headTitle"] == "推送时间：2026-07-28 09:00"
    assert "\n" not in card["headTitle"]
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_recipients.py -q -k timesheet_card
```
Expected: FAIL

- [ ] **Step 3: 实现**

替换 `build_timesheet_card`：

```python
def build_timesheet_card(name: str, issues: List[Dict[str, Any]],
                         start: str, end: str, action_hint: str = "",
                         sent_at: str = "") -> Dict[str, Any]:
    """工时卡 → 填报人本人。

    issues 元素:{"code":…, "label":…, "count":…, "lastDate": "YYYY-MM-DD"(可选)}
    lastDate 缺失 → 不拼「· 最近 …」,绝不拼出半截文案(与 start/end 同策略:
    宁可不显示,不显示空值)。

    问题码共 8 类 → 明细最多 8 行,加动作要求 = 9,永不触及蓝信 10 对上限
    (_card 仍有 fields[:MAX_FIELDS] 兜底)。
    """
    total = sum(int(i["count"]) for i in issues)
    rows = sorted(issues, key=lambda i: -int(i["count"]))
    fields: List[Dict[str, str]] = []
    for i in rows:
        value = "%d 条" % int(i["count"])
        last = str(i.get("lastDate") or "")
        if last:
            value += " · 最近 %s" % last[5:]      # 'YYYY-MM-DD' → 'MM-DD',卡片上年份是噪音
        fields.append(_field(short_issue(i["label"]), value))
    if action_hint:
        fields.append(_field("动作要求", action_hint))

    return _card(("推送时间：%s" % sent_at) if sent_at else "工时填报提醒",
                 "你有 %d 条工时填报存在问题" % total,
                 "统计区间 %s ~ %s" % (start, end) if start and end else "",
                 fields,
                 "")
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_recipients.py -q
```
Expected: 全部 PASS

- [ ] **Step 5: 反向验证 lastDate 缺失分支**

把 `if last:` 改成 `if True:`，跑 `-k omits_last_date` → 必须 FAIL（会拼出 `5 条 · 最近 `）。确认后改回。

- [ ] **Step 6: 提交**

```bash
git add lanxin_recipients.py tests/test_lanxin_recipients.py
git commit -m "feat(lanxin): 工时卡加最近日期与动作要求,推送时间进 headTitle"
```

---

## Task 5: `build_plan` 接线 + 前端事项契约

**Files:**
- Modify: `lanxin.py`
- Modify: `frontend/src/lib/lanxin/items.ts`
- Test: `tests/test_lanxin.py`
- Test: `frontend/src/lib/lanxin/items.test.ts`

**Interfaces:**
- Consumes: `build_project_card` / `build_timesheet_card` / `build_action_hint`（Task 2/3/4）、`cfg["reviewDeadlineHours"]`（Task 1）
- Produces: `build_plan(items, cfg, tree, project_pmis, now: str = "") -> Dict[str, Any]`（新增末位可选参数 `now`，格式 `YYYY-MM-DD HH:MM`）
- 前端 `PushItem` 新形：
  ```ts
  | { kind: 'project'; projectId: string; reasons: { category: string; detail: string }[] }
  | { kind: 'timesheet'; employId: string; start: string; end: string;
      issues: { code: string; label: string; count: number; lastDate: string }[] }
  ```

### ⚠ 动手前必读：`reasons` 必须**兼容两种形态**，不是只认新形

全仓 `grep -n '"kind": "project"' tests/test_lanxin.py` 有 **约 25 处**在用旧形 `"reasons": ["回款延期"]`。**不要**去改这 25 处 —— 让 `build_plan` 归一化两种形态，理由有二：

1. **浏览器缓存窗口是真实风险。** 升级同时替换 `dist` 与 `.py`，但用户浏览器里可能还留着旧 `index.html`，它 POST 上来的就是旧形。只认新形的话 `r.get("category")` 对字符串会抛 `AttributeError`，那几分钟内的推送直接 400。
2. **那 25 处保持原样跑通，本身就是最好的回归安全网** —— 它们覆盖了收件人解析、上级卷积、projectIds 归集等全部既有语义。它们变红即说明改坏了路由逻辑。

**另外三处 `reasons` 长得像但完全不是一回事，绝对不要动：**

| 位置 | 它是什么 |
|---|---|
| `tests/test_lanxin.py:224`、`tests/test_lanxin_config.py:198` | **路由配置**的 `reasons` 字段（`_migrate_route_items` 的 `legacy_field`），与事项无关 |
| `tests/test_lanxin_recipients.py:158-159` | `build_summary_card` 的 `rows[].reasons`，是 `[(label, count)]` **元组**列表 |

- [ ] **Step 1: 写失败测试（后端）**

追加到 `tests/test_lanxin.py`。**已核实**该文件的既有 fixture 为：`TREE`（组织树，不叫 `ORG`）、`PMIS`、`_cfg_items(ts_items=…, pj_items=…)`、`_cfg_with_callback(cfg, aes=…, token=…)`。**直接用它们，不要新造。**

```python
def _pj_cfg(levels=1):
    """项目路由 primary+汇总都开的配置。沿用既有 _cfg_items 工厂。"""
    return _cfg_items(pj_items={"回款延期": (True, True, levels)})


NEW_ITEM = [{"kind": "project", "projectId": "P1",
             "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]}]


def test_build_plan_project_card_carries_detail():
    """前端传来的 detail 必须原样出现在卡片 value 里 —— 本期「内容增强」的实际载体。"""
    plan = LX.build_plan(NEW_ITEM, _pj_cfg(), TREE, PMIS)
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert "回款延期(3 个延期节点)" in card["fields"][0]["value"]


def test_build_plan_accepts_legacy_string_reasons():
    """【兼容】旧形 ["回款延期"] 必须照常工作,detail 补空串。
    不是为了「以后还能用」,而是【浏览器缓存窗口】:dist 与 .py 同时替换,
    但用户浏览器里可能还留着旧 index.html,它 POST 上来就是旧形。
    只认新形的话 r.get("category") 对字符串抛 AttributeError,那几分钟推送直接 400。"""
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         _pj_cfg(), TREE, PMIS)
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert card["fields"][0]["value"].endswith(" · 回款延期")     # 无 detail 时不拼括号


def test_build_plan_summary_card_untouched_by_detail_change():
    """【回归安全网】汇总卡(给上级)仍按【原因计数】聚合,本期一个字不改。
    它依赖 proj_by_emp 的 {原因: [项目名]} 形状 —— 明细走的是【并行桶】。
    改错成「重塑 proj_by_emp」会让这条变红。"""
    plan = LX.build_plan(NEW_ITEM, _pj_cfg(levels=1), TREE, PMIS)
    sup = [r for r in plan["recipients"] if r["role"] == "supervisor"]
    assert sup, "上级汇总卡必须仍然产出"
    assert "1 个项目" in sup[0]["card"]["fields"][0]["value"]


def test_build_plan_passes_deadline_hours_into_card_text():
    """【N 单一来源】卡片文案里的小时数必须来自 cfg['reviewDeadlineHours'],不是硬编码 24。"""
    cfg = _cfg_with_callback(_pj_cfg())
    cfg["reviewDeadlineHours"] = 72
    plan = LX.build_plan(NEW_ITEM, cfg, TREE, PMIS)
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert card["fields"][-1]["value"] == "请直接回复本消息反馈，72小时内未反馈将列入《未响应清单》"


def test_build_plan_no_action_field_without_callback_creds():
    """回调凭证不全 → 无可用通道 → 卡上不出动作要求(不是出个空 value 的 field)。"""
    plan = LX.build_plan(NEW_ITEM, _pj_cfg(), TREE, PMIS)   # _pj_cfg 不带回调凭证
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert all(f["key"] != "动作要求" for f in card["fields"])


def test_build_plan_now_goes_to_head_title():
    plan = LX.build_plan(NEW_ITEM, _pj_cfg(), TREE, PMIS, now="2026-07-28 09:00")
    card = [r for r in plan["recipients"] if r["role"] == "primary"][0]["card"]
    assert card["headTitle"] == "推送时间：2026-07-28 09:00"
```

> `_cfg_with_callback` 的默认 `aes`/`token` 已是合法非空值，直接调用即可让 `reply_hint` 为真。
> `_pj_cfg()` 不带回调凭证，故 `reply_hint` 为假 —— 这正是 `no_action_field` 那条要的状态。

- [ ] **Step 2: 写失败测试（前端）**

追加到 `frontend/src/lib/lanxin/items.test.ts`：

```ts
it('projectItems 带上 riskReasons 的 detail', () => {
  // riskReasons 已返回 {category, detail};本期只是把 detail 一起送出去,不新增口径
  const items = projectItems(PROJECTS, PMIS, ['回款延期'])
  expect(items[0]).toMatchObject({
    kind: 'project',
    reasons: [{ category: '回款延期', detail: expect.stringContaining('延期节点') }],
  })
})

it('timesheetItems 按问题码给出最近日期', () => {
  const rows = [
    { date: '2026-07-20', empId: 'A001', codes: ['MISS_SUMMARY'] },
    { date: '2026-07-25', empId: 'A001', codes: ['MISS_SUMMARY'] },
    { date: '2026-07-22', empId: 'A001', codes: ['MISS_SUMMARY'] },
  ] as any
  const [it0] = timesheetItems(rows, ['MISS_SUMMARY'], '2026-07-20', '2026-07-26')
  expect(it0.issues[0]).toMatchObject({ code: 'MISS_SUMMARY', count: 3, lastDate: '2026-07-25' })
})

it('timesheetItems 的 lastDate 取最大值而非最后一行', () => {
  // 'YYYY-MM-DD' 定长 ISO 串,字典序 == 时序;若实现写成「取最后遍历到的」,这条会红
  const rows = [
    { date: '2026-07-25', empId: 'A001', codes: ['MISS_SUMMARY'] },
    { date: '2026-07-20', empId: 'A001', codes: ['MISS_SUMMARY'] },
  ] as any
  const [it0] = timesheetItems(rows, ['MISS_SUMMARY'], '', '')
  expect(it0.issues[0].lastDate).toBe('2026-07-25')
})
```

- [ ] **Step 3: 跑两侧测试确认失败**

```bash
python -m pytest tests/test_lanxin.py -q -k "detail or deadline or now_goes or summary_card_untouched"
npm --prefix frontend run test:run -- src/lib/lanxin/items.test.ts
```
Expected: 两侧都 FAIL

- [ ] **Step 4: 实现（前端 `items.ts`）**

```ts
export type PushItem =
  | { kind: 'project'; projectId: string; reasons: { category: string; detail: string }[] }
  | { kind: 'timesheet'; employId: string; start: string; end: string;
      issues: { code: string; label: string; count: number; lastDate: string }[] }

export function projectItems(
  projects: Project[],
  projectPmis: Record<string, ProjectPmis>,
  allowedReasons: string[],
): PushItem[] {
  const allow = new Set(allowedReasons)
  const out: PushItem[] = []
  for (const p of projects) {
    // detail 是【展示串】不是标识 —— 「后端不接受前端传来的标识」约束的是
    // 「推给谁/写到哪」的解析链(projectId → 项目经理 → 工号),那条链仍全在后端。
    const reasons = riskReasons(p, projectPmis[p.projectId])
      .filter((r) => allow.has(r.category))
      .map((r) => ({ category: r.category as string, detail: r.detail }))
    if (reasons.length) out.push({ kind: 'project', projectId: p.projectId, reasons })
  }
  return out
}

export function timesheetItems(
  rows: IssueRow[], allowedCodes: string[], start = '', end = '',
): PushItem[] {
  const allow = new Set(allowedCodes)
  const byEmp = new Map<string, Map<string, { count: number; lastDate: string }>>()
  for (const r of rows) {
    for (const code of r.codes) {
      if (!allow.has(code)) continue
      const m = byEmp.get(r.empId) ?? new Map<string, { count: number; lastDate: string }>()
      const cur = m.get(code) ?? { count: 0, lastDate: '' }
      cur.count += 1
      // date 是定长 'YYYY-MM-DD' ISO 串,字典序 == 时序,可直接比大小。
      // 必须取【最大值】而非「最后遍历到的」—— rows 的顺序不保证按日期升序。
      if (r.date > cur.lastDate) cur.lastDate = r.date
      m.set(code, cur)
      byEmp.set(r.empId, m)
    }
  }
  return [...byEmp.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([employId, m]) => ({
      kind: 'timesheet' as const,
      employId,
      start,
      end,
      issues: [...m.entries()].map(([code, v]) => ({
        code, label: ISSUE_LABELS[code] ?? code, count: v.count, lastDate: v.lastDate,
      })),
    }))
}
```

- [ ] **Step 5: 实现（后端 `lanxin.py`）**

① `build_plan` 签名加 `now`：

```python
def build_plan(items: List[Dict[str, Any]], cfg: Dict[str, Any],
               tree: Dict[str, Any], project_pmis: Dict[str, Any],
               now: str = "") -> Dict[str, Any]:
```

② 在 `proj_ids_by_emp` 声明之后，加**第三个并行桶**：

```python
    # 第三个与 proj_by_emp 并行的桶:存【按项目聚合的原因明细】,供新版 primary 卡组行。
    # 【绝不重塑 proj_by_emp】—— 上级汇总卡的 proj_counts 依赖它的 {原因: [项目名]} 形状,
    # 改形会连带砸掉汇总卡。并行桶是本文件既有范式(proj_ids_by_emp 就是这么加的)。
    proj_detail_by_emp: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
```

③ 在 `build_plan` **之前**加归一化辅助（模块级私有函数）：

```python
def _norm_reasons(raw: Any) -> List[Dict[str, str]]:
    """事项里的 reasons 归一化成 [{"category":…, "detail":…}]。

    两种形态都认:
      新(V4.5.8+): [{"category": "回款延期", "detail": "3 个延期节点"}]
      旧(≤V4.5.7): ["回款延期"]                     → detail 补空串

    保留旧形【不是】为了「以后还能用」,而是为了【浏览器缓存窗口】:
    升级同时替换 dist 与 .py,但用户浏览器里可能还留着旧 index.html,
    它 POST 上来的就是旧形。只认新形的话 r.get("category") 对字符串会抛
    AttributeError,那几分钟内的推送直接 400。

    形态不认的元素【丢弃】而非报错:事项是前端算出来的展示数据,
    一条畸形不该让整批推送失败(收件人解析仍全在后端,丢一条最多少推一个原因)。
    """
    out: List[Dict[str, str]] = []
    for r in raw or []:
        if isinstance(r, str) and r:
            out.append({"category": r, "detail": ""})
        elif isinstance(r, dict) and r.get("category"):
            out.append({"category": str(r["category"]),
                        "detail": str(r.get("detail") or "")})
    return out
```

事项循环里 `reasons` 的取法改为：

```python
        if kind == "project" and r_proj:
            reasons = [r for r in _norm_reasons(it.get("reasons"))
                       if (proj_items.get(r["category"]) or {}).get("enabled")]
            if not reasons:
                continue
```

紧接原有的 `pm` / `emp` 解析（不变），然后 bucket 部分改为：

```python
            bucket = proj_by_emp.setdefault(emp, {})
            pname = str(pm.get("projectName") or pid)
            for r in reasons:
                bucket.setdefault(r["category"], []).append(pname)
            proj_detail_by_emp.setdefault(emp, {}).setdefault(pname, []).extend(
                {"category": r["category"], "detail": str(r.get("detail") or "")}
                for r in reasons)
            ids = proj_ids_by_emp.setdefault(emp, [])
            if pid and pid not in ids:
                ids.append(pid)
```

④ `reply_hint` 之后，加一行算动作要求（**N 从 cfg 读，不硬编码**）：

```python
    action_hint = lanxin_recipients.build_action_hint(
        int(cfg.get("reviewDeadlineHours") or lanxin_config.DEFAULT_REVIEW_DEADLINE_HOURS),
        h5_url="",              # 一期无 H5;二期在此传 token URL,文案自动切态
        reply_hint=reply_hint)
```

> **已核实**：`lanxin.py` 目前**没有**导入 `lanxin_config`，需在顶部 import 段加 `import lanxin_config`。
> 无循环依赖风险（`lanxin_config.py` 只 `from yitian_rules import ISSUE_LABELS`，不反向依赖 `lanxin`）。
> `build_action_hint` 加进文件里既有的那个 `from lanxin_recipients import (…)` 列表（第 157 行附近）。

⑤ 工时 primary 卡调用改为：

```python
                "card": build_timesheet_card(by_id[emp]["name"], mine,
                                             ts_range["start"], ts_range["end"],
                                             action_hint=action_hint, sent_at=now),
```

⑥ 项目 primary 卡那段改为：

```python
    if r_proj:
        for emp in sorted(proj_by_emp):
            # primary 过滤语义不变:项目只要命中【任一】primary 原因就出现在卡上,
            # 且卡上只列它的 primary 原因。
            mine = []
            for pname, rs in (proj_detail_by_emp.get(emp) or {}).items():
                keep = [r for r in rs if (proj_items.get(r["category"]) or {}).get("primary")]
                if keep:
                    mine.append({"name": pname, "reasons": keep})
            if not mine:
                continue
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "routeKey": "project", "projectIds": list(proj_ids_by_emp.get(emp) or []),
                "card": build_project_card(by_id[emp]["name"], mine,
                                           action_hint=action_hint, sent_at=now),
            })
```

⑦ 两处汇总卡调用把 `reply_hint=reply_hint` 保留原样 —— **汇总卡不改**。

- [ ] **Step 6: 跑两侧测试确认通过**

```bash
python -m pytest tests/test_lanxin.py tests/test_lanxin_recipients.py -q
npm --prefix frontend run test:run -- src/lib/lanxin/items.test.ts
```
Expected: 全部 PASS。

**特别注意 `tests/test_lanxin.py` 里那约 25 条用旧形 `"reasons": ["回款延期"]` 的既有用例 ——
它们必须【原样跑绿，一条都不改】。**它们覆盖了收件人解析、上级卷积、`projectIds` 归集等
全部既有语义，是本任务最强的回归安全网。任何一条变红，都不要去改测试，先回头看
`_norm_reasons` 与并行桶是不是动到了不该动的东西。

- [ ] **Step 7: 反向验证「汇总卡未受影响」**

把 ⑥ 里的 `proj_detail_by_emp.get(emp)` 临时改成从 `proj_by_emp` 重塑（即删掉并行桶、把 `proj_by_emp` 改成按项目分组），跑：

```bash
python -m pytest tests/test_lanxin.py -q -k summary_card_untouched
```
Expected: FAIL。确认后改回，重跑全绿。

- [ ] **Step 8: 提交**

```bash
git add lanxin.py frontend/src/lib/lanxin/items.ts tests/test_lanxin.py frontend/src/lib/lanxin/items.test.ts
git commit -m "feat(lanxin): build_plan 接新卡片(并行明细桶,汇总卡零改动)+ 前端事项带 detail/lastDate"
```

---

## Task 6: `lanxin_unresponded.py` 未响应清单纯函数

**Files:**
- Create: `lanxin_unresponded.py`
- Test: `tests/test_lanxin_unresponded.py`（新建）

**Interfaces:**
- Produces: `compute(store: Dict, deadline_hours: int, now: str) -> List[Dict]`
  返回行：`{sentAt, employId, name, routeKey, projectCount, dueAt, overdue, responded, firstResponseAt}`，按 `sentAt` 倒序。

- [ ] **Step 1: 写失败测试**

新建 `tests/test_lanxin_unresponded.py`：

```python
import lanxin_unresponded as U


def _store(sent=(), items=()):
    return {"version": 1, "sent": list(sent), "items": list(items), "seenEventIds": []}


def _sent(staff="s1", emp="A001", name="张三", route="project", pids=("P1",),
          at="2026-07-28 09:00:00"):
    return {"staffId": staff, "employId": emp, "name": name, "routeKey": route,
            "projectIds": list(pids), "msgId": "m1", "sentAt": at}


def _item(staff="s1", at="2026-07-28 10:00:00"):
    return {"id": "evt-1", "receivedAt": at, "status": "parsed", "staffId": staff,
            "employId": "A001", "name": "张三", "text": "收到"}


def test_overdue_and_unresponded():
    rows = U.compute(_store([_sent()]), 24, "2026-07-29 10:00:00")
    assert len(rows) == 1
    assert rows[0]["overdue"] is True
    assert rows[0]["responded"] is False
    assert rows[0]["dueAt"] == "2026-07-29 09:00:00"
    assert rows[0]["projectCount"] == 1


def test_not_overdue_before_deadline():
    rows = U.compute(_store([_sent()]), 24, "2026-07-28 23:59:59")
    assert rows[0]["overdue"] is False


def test_overdue_exactly_at_deadline():
    """恰好到点算超时(>=),不是「过了才算」—— 边界必须钉死,否则 off-by-one 无人察觉。"""
    rows = U.compute(_store([_sent()]), 24, "2026-07-29 09:00:00")
    assert rows[0]["overdue"] is True


def test_reply_after_send_counts_as_responded():
    rows = U.compute(_store([_sent()], [_item()]), 24, "2026-07-29 10:00:00")
    assert rows[0]["responded"] is True
    assert rows[0]["firstResponseAt"] == "2026-07-28 10:00:00"


def test_reply_before_send_does_not_count():
    """【承重】推送【之前】的旧回复不能冒充本次响应。
    不判方向的话,一个三个月前回过一次的人会永远显示「已响应」。"""
    old = _item(at="2026-07-01 08:00:00")
    rows = U.compute(_store([_sent()], [old]), 24, "2026-07-29 10:00:00")
    assert rows[0]["responded"] is False
    assert rows[0]["firstResponseAt"] == ""


def test_reply_at_same_second_counts():
    """同秒相等算响应(>=)。时间戳精度只到秒,卡在秒级相等判「未响应」会冤枉人。"""
    rows = U.compute(_store([_sent()], [_item(at="2026-07-28 09:00:00")]), 24,
                     "2026-07-29 10:00:00")
    assert rows[0]["responded"] is True


def test_other_person_reply_does_not_count():
    rows = U.compute(_store([_sent()], [_item(staff="s999")]), 24, "2026-07-29 10:00:00")
    assert rows[0]["responded"] is False


def test_first_response_is_earliest_not_latest():
    items = [_item(at="2026-07-28 15:00:00"), _item(at="2026-07-28 10:00:00")]
    rows = U.compute(_store([_sent()], items), 24, "2026-07-29 10:00:00")
    assert rows[0]["firstResponseAt"] == "2026-07-28 10:00:00"


def test_rows_sorted_newest_first():
    s = [_sent(at="2026-07-26 09:00:00"), _sent(at="2026-07-28 09:00:00"),
         _sent(at="2026-07-27 09:00:00")]
    rows = U.compute(_store(s), 24, "2026-07-29 10:00:00")
    assert [r["sentAt"] for r in rows] == ["2026-07-28 09:00:00", "2026-07-27 09:00:00",
                                           "2026-07-26 09:00:00"]


def test_unparsable_sent_at_is_kept_not_dropped():
    """【承重】坏时间戳的记录必须保留(overdue=False/dueAt='') —— 收件箱既有约定是
    不静默丢弃。丢掉的话「推了但时间戳坏了」的人会从清单上凭空消失。"""
    rows = U.compute(_store([_sent(at="not-a-date")]), 24, "2026-07-29 10:00:00")
    assert len(rows) == 1
    assert rows[0]["dueAt"] == ""
    assert rows[0]["overdue"] is False


def test_empty_store_returns_empty_list():
    assert U.compute(_store(), 24, "2026-07-29 10:00:00") == []
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_lanxin_unresponded.py -q
```
Expected: FAIL —— `ModuleNotFoundError: No module named 'lanxin_unresponded'`

- [ ] **Step 3: 实现**

新建 `lanxin_unresponded.py`：

```python
# lanxin_unresponded.py
"""未响应清单 —— 纯派生视图,不新增任何数据文件。

数据全部来自 lanxin_inbox 的 store:
  sent[]  = 推了谁 / 何时 / 涉及哪些项目(record_sent 写入,留存 90 天,【只记成功项】)
  items[] = 谁回了(一期 = 文本回复;二期 H5 反馈也进这里 → 清单自动变准,代码零改动)

【精度边界 —— 调用方 UI 必须标明】
一期判定是「人级」不是「项目级」:一期唯一的回流是文本回复,而回复正文里【没有
项目信息】—— 某人在推送后回了任意一条,该批次即算已响应。二期 H5 反馈携带
projectId 后方可下钻到项目级。行模型(一行 = 一条 sent 记录)一期二期通用,
二期只增下钻,不推倒重来。

本模块无 IO、无全局状态,完全可单测。
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

_TS_FMT = "%Y-%m-%d %H:%M:%S"


def _parse(ts: Any) -> Optional[datetime]:
    try:
        return datetime.strptime(str(ts), _TS_FMT)
    except (TypeError, ValueError):
        return None


def compute(store: Dict[str, Any], deadline_hours: int, now: str) -> List[Dict[str, Any]]:
    """→ 每条推送一行,按 sentAt 倒序(最新在前)。

    overdue   = now >= sentAt + deadline_hours(【>=】:恰好到点即算超时)
    responded = 存在 item 满足 staffId 相同 且 receivedAt >= sentAt
                (【>=】:同秒相等算响应 —— 时间戳精度只到秒,卡在相等判未响应会冤枉人)
                (【方向】:推送【之前】的旧回复不算 —— 否则三个月前回过一次的人永远显示已响应)

    sentAt 解析失败的记录【保留】,dueAt='' / overdue=False;绝不丢弃 ——
    丢掉的话「推了但时间戳坏了」的人会从清单上凭空消失,比显示不全更糟。
    """
    now_dt = _parse(now)
    # 按 staffId 归拢回复时间,避免逐条 sent 都全表扫 items
    replies: Dict[str, List[datetime]] = {}
    for it in store.get("items") or []:
        ts = _parse(it.get("receivedAt"))
        if ts is not None:
            replies.setdefault(str(it.get("staffId") or ""), []).append(ts)

    out: List[Dict[str, Any]] = []
    for s in store.get("sent") or []:
        sent_dt = _parse(s.get("sentAt"))
        staff = str(s.get("staffId") or "")
        after = sorted(t for t in replies.get(staff, [])
                       if sent_dt is not None and t >= sent_dt)
        due_dt = (sent_dt + timedelta(hours=deadline_hours)) if sent_dt else None
        out.append({
            "sentAt": str(s.get("sentAt") or ""),
            "employId": str(s.get("employId") or ""),
            "name": str(s.get("name") or ""),
            "routeKey": str(s.get("routeKey") or ""),
            "projectCount": len(s.get("projectIds") or []),
            "dueAt": due_dt.strftime(_TS_FMT) if due_dt else "",
            "overdue": bool(due_dt and now_dt and now_dt >= due_dt),
            "responded": bool(after),
            "firstResponseAt": after[0].strftime(_TS_FMT) if after else "",
        })
    out.sort(key=lambda r: r["sentAt"], reverse=True)
    return out
```

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_lanxin_unresponded.py -q
```
Expected: 全部 PASS

- [ ] **Step 5: 反向验证两条承重**

① 把 `if sent_dt is not None and t >= sent_dt` 改成 `if True`，跑 `-k reply_before_send` → 必须 FAIL。
② 把 `out.append(...)` 包进 `if sent_dt:`（即丢弃坏时间戳的记录），跑 `-k unparsable_sent_at` → 必须 FAIL。
两条都确认后改回，重跑全绿。

- [ ] **Step 6: 提交**

```bash
git add lanxin_unresponded.py tests/test_lanxin_unresponded.py
git commit -m "feat(lanxin): 新增未响应清单纯函数(sent×items 派生,零新数据文件)"
```

---

## Task 7: server 端点 + `lastTimestampSample`

**Files:**
- Modify: `server.py`
- Test: `tests/test_server_lanxin.py`, `tests/test_server_lanxin_callback.py`

**Interfaces:**
- Consumes: `lanxin_unresponded.compute`（Task 6）、`cfg["reviewDeadlineHours"]`（Task 1）、`build_plan(..., now=)`（Task 5）
- Produces: `GET /api/lanxin/unresponded` → `{success, rows, deadlineHours}`；`_lanxin_rejected` 新增 `lastTimestampSample`

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_server_lanxin_callback.py`：

```python
def test_rejected_records_timestamp_sample_on_stale(tmp_path, monkeypatch):
    """新鲜度拒绝时把 timestamp 【原值】记下来并经 config 接口下发 ——
    这是判断「蓝信到底发的什么格式」的唯一可见线索(PROGRESS 挂着的债:
    epoch 秒是未证实假设)。timestamp 不是密钥,可安全下发。"""
    server._lanxin_rejected['lastTimestampSample'] = ''
    # 走一次新鲜度失败分支(沿用本文件既有的伪造报文 + 真验签的辅助方式)
    ...
    assert server._lanxin_rejected['lastReason'] == 'stale'
    assert server._lanxin_rejected['lastTimestampSample'] == '2026-07-28T09:00:00Z'


def test_timestamp_sample_is_length_capped():
    """超长 timestamp 不得无界存进内存 —— 免登录入口,长度必须封顶。"""
    server._record_lanxin_reject('stale', 'x' * 500, '1.2.3.4')
    assert len(server._lanxin_rejected['lastTimestampSample']) <= 64


def test_config_payload_exposes_timestamp_sample_and_no_secrets(tmp_path, monkeypatch):
    """下发含 lastTimestampSample,且【绝不含任何密钥】。
    注意真名是 _lanxin_config_payload(带前导下划线),且它【自己读配置文件】、不收参数 ——
    须 monkeypatch server.LANXIN_CONFIG_FILE 指到 tmp_path 下写好的配置。"""
    p = tmp_path / 'lanxin_config.json'
    cfg = lanxin_config.default_config()
    cfg['credentials'].update(appSecret='SECRET_VALUE', callbackAesKey='AES_VALUE',
                              callbackSignToken='TOKEN_VALUE')
    p.write_text(json.dumps(cfg, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(server, 'LANXIN_CONFIG_FILE', str(p))
    body = json.dumps(server._lanxin_config_payload(), ensure_ascii=False)
    assert 'lastTimestampSample' in body
    for leaked in ('SECRET_VALUE', 'AES_VALUE', 'TOKEN_VALUE'):
        assert leaked not in body
```

追加到 `tests/test_server_lanxin.py`：

```python
def test_unresponded_path_is_super_only():
    """未响应清单含全员推送台账,必须超管专属。_SUPER_ONLY_PATHS 按【精确 path】匹配。"""
    assert '/api/lanxin/unresponded' in server._SUPER_ONLY_PATHS


def test_unresponded_deadline_comes_from_config_not_hardcoded():
    """【N 单一来源】端点用的小时数必须来自 cfg['reviewDeadlineHours'],
    与卡片文案同源。两处各自默认 = 「卡上24、清单按48」。"""
    src = inspect.getsource(server.LocalHTTPRequestHandler.handle_lanxin_unresponded_get)
    assert 'reviewDeadlineHours' in src
    assert '24' not in src, "不得硬编码 24,须从配置读"
```

- [ ] **Step 2: 跑测试确认失败**

```bash
python -m pytest tests/test_server_lanxin.py tests/test_server_lanxin_callback.py -q -k "unresponded or timestamp_sample"
```
Expected: FAIL

- [ ] **Step 3: 实现**

① `server.py` 顶部加 `import lanxin_unresponded`。

② `_lanxin_rejected` 初始化加字段：

```python
_lanxin_rejected = {'count': 0, 'lastAt': '', 'lastFrom': '', 'lastReason': '',
                    # 被拒报文的 timestamp【原值】。不是密钥(不是签名、不是报文体、不是密钥),
                    # 可安全下发给超管 —— 这是判断「蓝信实际发的什么格式」的唯一可见线索。
                    'lastTimestampSample': ''}
```

③ 抽出一个小辅助（两个拒绝分支共用，避免复制粘贴漂移）：

```python
def _record_lanxin_reject(reason, timestamp, from_ip):
    """记一次回调拒绝。timestamp 原值截断存 —— 免登录入口,长度必须封顶。"""
    _lanxin_rejected['count'] += 1
    _lanxin_rejected['lastAt'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    _lanxin_rejected['lastFrom'] = from_ip
    _lanxin_rejected['lastReason'] = reason
    _lanxin_rejected['lastTimestampSample'] = str(timestamp or '')[:64]
```

把 `handle_lanxin_callback` 里两处（`signature` 与 `stale`）的四行赋值替换成：

```python
            _record_lanxin_reject('signature', timestamp,
                                  audit.client_ip(self.headers, self.client_address))
```
```python
            _record_lanxin_reject('stale', timestamp,
                                  audit.client_ip(self.headers, self.client_address))
```

**`stale` 分支原有的 `logger.warning` 保留不动** —— 它是排查时的第二条线索。

④ 新增 handler：

```python
    def handle_lanxin_unresponded_get(self):
        """GET /api/lanxin/unresponded —— 未响应清单。超管专属(路径已在 _SUPER_ONLY_PATHS)。

        小时数从 cfg['reviewDeadlineHours'] 读,与卡片文案【同源】——
        两处各自默认就会出现「卡上写 24 小时、清单按别的算」。
        """
        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        hours = int(cfg.get('reviewDeadlineHours')
                    or lanxin_config.DEFAULT_REVIEW_DEADLINE_HOURS)
        with _lanxin_inbox_lock:
            store = _load_lanxin_inbox()
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self._send_json(200, {"success": True,
                              "rows": lanxin_unresponded.compute(store, hours, now),
                              "deadlineHours": hours})
```

⑤ GET 路由表里，`'/api/lanxin/inbox'` 那条之后加：

```python
        elif parsed.path == '/api/lanxin/unresponded':
            self.handle_lanxin_unresponded_get()
```

⑥ `_SUPER_ONLY_PATHS` 里，`'/api/lanxin/inbox'` 同组加 `'/api/lanxin/unresponded'`。

⑦ `handle_lanxin_preview` 与 `handle_lanxin_send` 两处 `lanxin.build_plan(...)` 调用都加 `now`：

```python
            plan = lanxin.build_plan(body.get('items') or [], cfg,
                                     self._lanxin_tree(), self._lanxin_pmis(),
                                     now=datetime.now().strftime('%Y-%m-%d %H:%M'))
```

> 预览与发送的推送时间会差几分钟，这是**有意如此**：唯一的替代是让前端把预览时刻回传给发送接口，那等于让后端信任前端提供的时间戳，更糟。「所见即所发」指的是**收件人与卡片内容**，不含这个时间戳。

- [ ] **Step 4: 跑测试确认通过**

```bash
python -m pytest tests/test_server_lanxin.py tests/test_server_lanxin_callback.py -q
```
Expected: 全部 PASS

- [ ] **Step 5: 反向验证「超管闸」**

把 `'/api/lanxin/unresponded'` 从 `_SUPER_ONLY_PATHS` 里临时删掉，跑 `-k super_only` → 必须 FAIL。确认后加回。

- [ ] **Step 6: 提交**

```bash
git add server.py tests/test_server_lanxin.py tests/test_server_lanxin_callback.py
git commit -m "feat(lanxin): 未响应清单端点(超管专属)+ 回调被拒 timestamp 原值可见"
```

---

## Task 8: 配置卡 —— N 输入框 + 回调地址自显示

**Files:**
- Modify: `frontend/src/components/LanxinConfigCard.vue`
- Test: `frontend/src/components/LanxinConfigCard.test.ts`

**Interfaces:**
- Consumes: `cfg.reviewDeadlineHours`（Task 1 已让它经 `public_config` 下发）、既有的 `apiUrl` from `@/lib/baseUrl`

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/components/LanxinConfigCard.test.ts`：

```ts
it('回调地址按部署前缀自推导,不是写死值', async () => {
  // 根因复盘:生产曾把回调地址填成 http://host/api/lanxin/callback(漏了 /pm),
  // nginx 只接管 /pm/,请求落到别的系统 → 收件箱恒空、零报错。
  // 这一行把「人工抄地址」变成「复制粘贴」。
  const w = mount(LanxinConfigCard, { /* 沿用本文件既有的挂载选项 */ })
  await flushPromises()
  const shown = w.find('[data-test="lx-callback-url"]').text()
  expect(shown).toBe(`${window.location.origin}${apiUrl('/api/lanxin/callback')}`)
  expect(shown).not.toContain('/pm/pm/')          // 前缀不得重复拼
})

it('反馈时限输入框绑定 reviewDeadlineHours', async () => {
  const w = mount(LanxinConfigCard, { /* 同上 */ })
  await flushPromises()
  expect(w.find('[data-test="lx-deadline-hours"]').exists()).toBe(true)
  expect((w.vm as any).cfg.reviewDeadlineHours).toBe(24)
})
```

> 挂载选项、`getLanxinConfigFull` 的 mock 方式，**沿用该测试文件里既有的写法**，不要另造一套。mock 返回的 config 需含 `reviewDeadlineHours: 24`。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/components/LanxinConfigCard.test.ts
```
Expected: FAIL

- [ ] **Step 3: 实现**

① `<script setup>` 顶部加导入与计算属性：

```ts
import { apiUrl } from '@/lib/baseUrl'

// 回调地址【绝不写死】:前缀由构建时的 vite base 决定(开发 '/' / 生产 '/pm/'),
// 写死必然与部署漂移 —— 生产就因为人工抄地址漏了 /pm,回调静默丢了一整期。
const callbackUrl = computed(() => window.location.origin + apiUrl('/api/lanxin/callback'))
```

② 在 `<div class="dv-sub-head">回调（员工回复回流本系统…）</div>` **紧下面**插入：

```vue
      <div class="dv-row">
        <span class="dv-label">回调地址</span>
        <el-input :model-value="callbackUrl" size="small" readonly
          style="width: 420px" data-test="lx-callback-url" />
        <span class="dv-hint">请原样填入蓝信开发者中心。地址按本系统实际部署前缀自动生成，不要手抄</span>
      </div>
```

③ 在「发送身份」那个 `dv-row` 之后插入反馈时限：

```vue
      <div class="dv-row">
        <span class="dv-label">反馈时限</span>
        <el-input-number v-model="cfg.reviewDeadlineHours" :min="1" :max="720" :step="1"
          size="small" controls-position="right" data-test="lx-deadline-hours" />
        <span class="dv-hint">小时。卡片文案与《未响应清单》判定共用此值</span>
      </div>
```

④ 保存时把 `reviewDeadlineHours` 一并提交（检查 `saveLanxinConfig` 的入参构造处，确保该字段在内；若该处是显式挑字段的白名单式，**必须显式加上**，否则改了保存不生效）。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/components/LanxinConfigCard.test.ts
npm --prefix frontend run typecheck
```
Expected: PASS

- [ ] **Step 5: 反向验证「自推导」**

把 `callbackUrl` 临时改成写死的 `'http://10.248.105.95/pm/api/lanxin/callback'`，跑 `-k 自推导` → 必须 FAIL（测试环境 origin 是 `localhost`）。确认后改回。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/LanxinConfigCard.vue frontend/src/components/LanxinConfigCard.test.ts
git commit -m "feat(lanxin): 配置卡加反馈时限输入与回调地址自显示(按部署前缀推导)"
```

---

## Task 9: 未响应清单 tab

**Files:**
- Create: `frontend/src/components/LanxinUnrespondedCard.vue`
- Create: `frontend/src/components/LanxinUnrespondedCard.test.ts`
- Modify: `frontend/src/views/DataView.vue`
- Modify: `frontend/src/lib/lanxinApi.ts`（加 `getLanxinUnresponded`）
- Test: `frontend/src/views/DataView.test.ts`（若存在；否则只在组件测试里覆盖）

**Interfaces:**
- Consumes: `GET /api/lanxin/unresponded` → `{success, rows, deadlineHours}`（Task 7）

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/components/LanxinUnrespondedCard.test.ts`：

```ts
it('默认只列「已超时且未响应」的行', async () => {
  // 清单的用途是「谁该催」,默认就该是待办视图;全部行可切换查看
  const w = mountWithRows([
    { sentAt: '2026-07-28 09:00:00', employId: 'A001', name: '张三', routeKey: 'project',
      projectCount: 3, dueAt: '2026-07-29 09:00:00', overdue: true, responded: false, firstResponseAt: '' },
    { sentAt: '2026-07-28 09:00:00', employId: 'A002', name: '李四', routeKey: 'project',
      projectCount: 1, dueAt: '2026-07-29 09:00:00', overdue: true, responded: true,
      firstResponseAt: '2026-07-28 10:00:00' },
    { sentAt: '2026-07-29 08:00:00', employId: 'A003', name: '王五', routeKey: 'timesheet',
      projectCount: 0, dueAt: '2026-07-30 08:00:00', overdue: false, responded: false, firstResponseAt: '' },
  ])
  await flushPromises()
  expect(w.text()).toContain('张三')
  expect(w.text()).not.toContain('李四')      // 已响应
  expect(w.text()).not.toContain('王五')      // 未到期
})

it('标明人级判定,不让超管误以为是项目级精度', async () => {
  // 一期回流只有文本回复,回复正文里没有项目信息 —— 精度边界必须写在界面上
  const w = mountWithRows([])
  await flushPromises()
  expect(w.text()).toContain('人级')
})

it('展示后端下发的时限,不自带默认值', async () => {
  const w = mountWithRows([], 72)
  await flushPromises()
  expect(w.text()).toContain('72')
})
```

> `mountWithRows(rows, deadlineHours = 24)` 是本测试文件内的辅助，mock `getLanxinUnresponded` 返回 `{ success: true, rows, deadlineHours }`。mock 方式沿用 `LanxinInboxCard.test.ts` 的既有写法。

- [ ] **Step 2: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/components/LanxinUnrespondedCard.test.ts
```
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 API 客户端**

`frontend/src/lib/lanxinApi.ts` 加（**签名与文件内既有函数保持同构**）：

```ts
export interface UnrespondedRow {
  sentAt: string; employId: string; name: string; routeKey: string
  projectCount: number; dueAt: string; overdue: boolean
  responded: boolean; firstResponseAt: string
}

export async function getLanxinUnresponded():
  Promise<{ success: boolean; rows: UnrespondedRow[]; deadlineHours: number }> {
  // 用本文件既有的 fetch 封装/错误处理,不要另起一套
}
```

- [ ] **Step 4: 实现组件**

新建 `frontend/src/components/LanxinUnrespondedCard.vue`。要点：

- 顶部一行说明：`已推送但超过 {{ deadlineHours }} 小时未收到任何回复的记录。判定为【人级】：该员工在推送后回复过任意消息即计为已响应（一期回流仅文本回复，回复正文不含项目信息）。`
- 一个 `el-switch` 或 `el-radio-group` 切换「仅未响应 / 全部」，默认「仅未响应」。
- `el-table` 列：推送时间 / 工号 / 姓名 / 推送类型（`project`→`项目关注`，`timesheet`→`工时填报`）/ 涉及项目数 / 应反馈截止 / 状态（未响应 / 已响应 / 未到期）/ 首次响应时间。
- 数字列挂 `.u-num`（`tabular-nums`，全站数字排版约定）。
- 状态用「淡底+深字」三态样式（`--danger-bg`+`--danger-text` 等设计令牌），**不手写散值**。
- 样式沿用 `@import '@/styles/dataview.css';`（与其它 dataview 组件一致）。

- [ ] **Step 5: 挂进 DataView**

`frontend/src/views/DataView.vue`：
- `import LanxinUnrespondedCard from '@/components/LanxinUnrespondedCard.vue'`
- 在 `<el-tab-pane v-if="auth.isSuper" label="蓝信回复" name="lanxinInbox">` **之后**插入：

```vue
      <el-tab-pane v-if="auth.isSuper" label="未响应清单" name="lanxinUnresponded">
        <LanxinUnrespondedCard />
      </el-tab-pane>
```

> **绝不给 `el-tab-pane` 设 `lazy`** —— EP 2.14.1 默认 `false`（全渲染 + `v-show` 隐藏），该文件顶部注释已有此约束。

- [ ] **Step 6: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/components/LanxinUnrespondedCard.test.ts
npm --prefix frontend run typecheck
```
Expected: PASS

- [ ] **Step 7: 反向验证「默认只列未响应」**

把默认筛选临时改成「全部」，跑 `-k 默认只列` → 必须 FAIL（会看到「李四」）。确认后改回。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/components/LanxinUnrespondedCard.vue frontend/src/components/LanxinUnrespondedCard.test.ts frontend/src/lib/lanxinApi.ts frontend/src/views/DataView.vue
git commit -m "feat(lanxin): /data 新增未响应清单 tab(超管专属,默认只列已超时未响应)"
```

---

## Task 10: 版本号、PROGRESS、全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V4.5.8'
```

`RELEASE_DATE` 改为实际完成日期。

- [ ] **Step 2: 跑全量验证**

```bash
bash verify.sh
```
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

若 vitest **全部用例通过但退出码非 0**，是未处理的 Promise rejection —— 找新挂载的组件里没 mock 的 fetch（`LanxinUnrespondedCard` 的 `getLanxinUnresponded`），在相关测试文件的 `beforeEach` 里补 mock。这是本仓踩过多次的既有坑。

- [ ] **Step 3: 更新 PROGRESS.md**

- 「当前版本」改 V4.5.8，V4.5.7 降为「上一版本」。
- 记录本期四项交付与**已定位但未闭环**的问题①：回调地址已修（加 `/pm`），但**事件类型订阅**（`bot_private_message`）与**公网可达性**两道关卡尚未证实，处置见 spec §8 三步表。
- 新增 backlog 条目：`lanxin_timestamp_fresh` 的 epoch 秒假设仍未证实，待 `lastTimestampSample` 拿到实证后处置。
- 新增 backlog 条目：二期 V4.5.9（H5 反馈闭环）待做。

- [ ] **Step 4: 提交并推送**

```bash
git status                      # 确认无敏感项;绝不 git add -A
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.5.8 蓝信卡片内容增强 + 未响应清单 + 回调诊断"
git push origin master
```

---

## 一期不做的事（照抄自 spec §5，防止执行时扩大改动面）

- 不做 approveCard 按钮交互
- 不移植 `supervision_*` 七个业务模块
- 不做自动触发调度（T-15/T/T+15）
- 不移植 `create_ws_endpoint`（副本里就是零调用方的死代码）
- 不做失败重发台账
- **不改 `lanxin_timestamp_fresh` 的解析逻辑**（拿到实证前改它是猜测）
- **不改 `build_summary_card`**（上级汇总卡，本期回归安全网）

---

## 自审记录

**Spec 覆盖核对：**

| spec 条目 | 落到哪个 Task |
|---|---|
| §4.1.1 项目卡新结构 | T3 |
| §4.1.2 入参契约变更 | T5 |
| §4.1.3 动作要求三态 | T2（函数）+ T5（接线） |
| §4.1.4 工时卡同构改造 | T4 |
| §4.2 `reviewDeadlineHours` | T1（后端）+ T8（界面） |
| §4.3 未响应清单 | T6（纯函数）+ T7（端点）+ T9（界面） |
| §4.4.0 回调地址自显示 | T8 |
| §4.4.1 `lastTimestampSample` | T7 |
| §6.1 回归安全网 | T3 Step 4、T4 的两条 keeps_* 用例、T5 的 summary_card_untouched |
| §6.2 必须新增的测试 | 三态 T2、N 单一来源 T5+T7、判定边界 T6、响应方向 T6、key 非项目名 T3 |
| §6.3 反向验证 | T1/T2/T3/T4/T5/T6/T7/T8/T9 各自 Step 均含 |
| §7 安全红线 | T7（timestamp 非密钥论证 + 长度封顶）、T7 超管闸、T10 提交纪律 |

**类型一致性核对：** `build_action_hint(deadline_hours, h5_url, reply_hint) -> str` 在 T2 定义、T5 调用一致；`build_project_card(name, projects, action_hint, sent_at)` 在 T3 定义、T5 调用一致；`build_timesheet_card(name, issues, start, end, action_hint, sent_at)` 在 T4 定义、T5 调用一致；`compute(store, deadline_hours, now)` 在 T6 定义、T7 调用一致；`UnrespondedRow` 字段在 T6 产出、T9 消费一致（九个字段逐一对齐）。

**写完后逐一核实过的既有符号**（初稿有四处写错，已改正 —— 计划里引用错的名字会让执行者卡在第一步）：

| 计划初稿写的 | 实际 | 出处 |
|---|---|---|
| `_cfg_with_project_route()` | 不存在。真实工厂是 `_cfg_items(ts_items=, pj_items=)`、`_cfg_with_callback(cfg, aes=, token=)` | `tests/test_lanxin.py:230, 836` |
| `ORG` | 真名是 `TREE` | `tests/test_lanxin.py:186` |
| `server.lanxin_config_payload(cfg)` | 真名 `_lanxin_config_payload()`，**带下划线且不收参数**（自己读配置文件） | `server.py:524` |
| 「`lanxin.py` 若尚未导入 `lanxin_config`」 | 确认**没有**导入，必须新增 | `lanxin.py:9-15` |

**已知需执行者就地适配的两处**（非占位符，是必须遵循既有写法的地方）：T8/T9 的组件挂载与 mock 方式，须沿用 `LanxinConfigCard.test.ts` / `LanxinInboxCard.test.ts` 里**既有的**写法，不另造体系。

**一处设计在自审中被改掉**：初稿让 `build_plan` 只认新形 `reasons`，需要改 `tests/test_lanxin.py` 里约 25 处调用。改为**两形归一化**后，那 25 处原样跑绿、成为最强回归安全网，同时消掉了「浏览器缓存旧 index.html → 推送 400」这个真实的升级窗口风险。
