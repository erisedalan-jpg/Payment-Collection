# 倚天合规规则前端可配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把倚天「问题工时」判定规则从代码内置常量提升为超管在 `/data` 可视化配置（页内结构化编辑 + JSON/Excel 导入导出 + 每检查项启用开关），保存即后端重算刷新 `yitian_data.json`。

**Architecture:** 后端新增 `yitian_rules_config.py`（默认由 `yitian_rules.py` 常量装配 + 校验 + 原子读写）；`yitian_check.check_row` 由读模块常量改为读传入的 `cfg`；`yitian.build_yitian_data` 载入 cfg 并透传；`server.py` 加超管专属 `/api/yitian/rules` GET/POST，保存复用 `_rebuild_yitian_data`（「先算通再落盘」）。前端在 `/data` 倚天域加超管卡 `YitianRulesCard.vue`，纯计算层 `lib/yitian/rulesConfig.ts` 做 JSON↔Excel 转换。

**Tech Stack:** Python 标准库 + pydantic（后端）；Vue3 + TS + Pinia + Element Plus + `xlsx`（前端）。

## Global Constraints

- 交流/文案：**简体中文**；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 默认值**单一来源** = `yitian_rules.py` 现有常量；`default_config()` 由其装配，**不重复维护第二份默认**；`yitian_rules.py` 规则常量**不改动**。
- `ISSUE_LABELS` / `HINT_PREFIX` / `SNIPPET_MAX` / `corrected_work_type` / `THIS_BG_L2_ORGS` **保持内置、不进配置**。
- 后端**只认 JSON 一套校验**（唯一权威）；Excel↔JSON 转换在**前端**。
- 「先算通再落盘」不变式：新规则先在内存 `build_yitian_data` + schema 校验跑通，成功才落 `yitian_rules.json` 与 `yitian_data.json`；失败两文件都不动。
- `/api/yitian/rules` GET+POST **均超管专属**（进 `_SUPER_ONLY_PATHS`）；保存写审计（`_audit_set`）。
- `data/yitian_rules.json` 进 `.gitignore`。
- 生效**无需点「更新数据」**；**非纯前端**（改后端须重启）；无新页面/路由/pageKey。
- 配置 canonical 结构（全任务统一，键名严格一致）：
  ```
  { version:1, checkedTypes:string[],
    checks:{
      summary:{enabled,keywords:string[]}, progress:{enabled,keywords}, next:{enabled,keywords},
      serviceMode:{enabled,effectiveDate:string},
      typeMismatch:{enabled,rules:{[workType]: [string,string][] }},
      product:{enabled, lineKeywords:{linePatterns:string[],keywords:string[]}[], nameKeywords:{namePatterns:string[],keywords:string[]}[], exclusiveKws:string[]},
      customer:{enabled,hintKeywords:string[]},
      presaleProductHint:{enabled,skipWorkTypes:string[]} } }
  ```
- check 键顺序固定：`summary, progress, next, serviceMode, typeMismatch, product, customer, presaleProductHint`。
- 问题码：`MISS_SUMMARY / MISS_PROGRESS / MISS_NEXT / MISS_SERVICE_MODE / TYPE_MISMATCH / PRODUCT_MISMATCH / MISS_CUSTOMER / HINT_PRESALE_PRODUCT`。

## 执行波次（供 SDD/Workflow 并行）

- **后端链（串行）**：Task 1 → 2 → 3 → 4（各改各文件，后者依赖前者签名/schema）。
- **前端链（串行）**：Task 5 → 6 → 7 → 8。
- **两链文件不相交，可并行推进**；`.gitignore`（Task 4 内）与前端互不干扰。
- **收口**：Task 9（版本 + PROGRESS + 全量 verify），须两链全部完成后。
- Workflow 用法：后端链一个 pipeline、前端链一个 pipeline，两 pipeline 并行；控制者跑合并 verify 后串行提交。

---

### Task 1: 后端配置模块 `yitian_rules_config.py`

**Files:**
- Create: `yitian_rules_config.py`
- Test: `tests/test_yitian_rules_config.py`

**Interfaces:**
- Produces:
  - `default_config() -> dict`（§Global canonical 结构，由 `yitian_rules` 常量装配）
  - `validate_config(cfg: Any) -> dict`（严格校验并归一化，非法抛 `ValueError`，缺键回落默认段）
  - `load_config(path: str) -> dict`（读→校验；缺失/损坏/非法→静默回落 `default_config()`）
  - `save_config(path: str, cfg: Any) -> dict`（校验后原子写 `.tmp`→`os.replace`，返回落盘配置）

- [ ] **Step 1: 写失败测试**

创建 `tests/test_yitian_rules_config.py`：

```python
import json
import yitian_rules_config as RC
import yitian_rules as R


def test_default_config_shape_from_constants():
    cfg = RC.default_config()
    assert cfg["version"] == 1
    assert cfg["checkedTypes"] == list(R.CHECKED_TYPES)
    ck = cfg["checks"]
    # 必填三段由正则拆回关键词,首词与正则首分支一致
    assert ck["summary"]["keywords"][0] == "工作概述"
    assert ck["progress"]["enabled"] is True
    assert ck["next"]["keywords"][-1] == "下期计划"
    assert ck["serviceMode"]["effectiveDate"] == R.SERVICE_MODE_EFFECTIVE_DATE
    # 类型一致性:元组→二元列表
    assert ck["typeMismatch"]["rules"]["售前类"][0] == ["正式上线", "项目类"]
    # 产品线:装配为 {linePatterns,keywords}
    assert ck["product"]["lineKeywords"][0]["linePatterns"] == ["NGSOC"]
    assert "SOC" in ck["product"]["lineKeywords"][0]["keywords"]
    assert ck["product"]["nameKeywords"][0]["namePatterns"] == ["奇安信网神SSL编排控制网关系统V6.0"]
    assert set(ck["product"]["exclusiveKws"]) == {"组件", "租户"}
    assert ck["customer"]["hintKeywords"] == ["客户", "用户", "甲方", "业主"]
    assert set(ck["presaleProductHint"]["skipWorkTypes"]) == set(R.PRESALE_SKIP_WORKTYPES)
    # 每检查段都有 enabled
    for k in ("summary", "progress", "next", "serviceMode", "typeMismatch", "product", "customer", "presaleProductHint"):
        assert ck[k]["enabled"] is True


def test_validate_roundtrip_default():
    assert RC.validate_config(RC.default_config()) == RC.default_config()


def test_validate_missing_keys_fallback():
    cfg = RC.validate_config({"version": 1, "checks": {}})
    assert cfg["checkedTypes"] == list(R.CHECKED_TYPES)          # 缺 → 默认
    assert cfg["checks"]["summary"]["keywords"]                   # 缺段 → 默认段


def test_validate_rejects_bad_types():
    import pytest
    with pytest.raises(ValueError):
        RC.validate_config("nope")
    with pytest.raises(ValueError):
        RC.validate_config({"checkedTypes": "x"})               # 非数组
    with pytest.raises(ValueError):
        RC.validate_config({"checks": {"serviceMode": {"enabled": True, "effectiveDate": "2026/05/09"}}})  # 日期格式错


def test_validate_normalizes_lists():
    cfg = RC.validate_config({"checks": {"customer": {"enabled": True, "hintKeywords": [" 客户 ", "客户", ""]}}})
    assert cfg["checks"]["customer"]["hintKeywords"] == ["客户"]   # strip/去空/去重


def test_validate_typemismatch_shape():
    import pytest
    with pytest.raises(ValueError):
        RC.validate_config({"checks": {"typeMismatch": {"enabled": True, "rules": {"售前类": [["只有一个"]]}}}})


def test_save_load_roundtrip(tmp_path):
    p = str(tmp_path / "yitian_rules.json")
    cfg = RC.default_config()
    cfg["checks"]["product"]["enabled"] = False
    saved = RC.save_config(p, cfg)
    assert saved["checks"]["product"]["enabled"] is False
    assert RC.load_config(p)["checks"]["product"]["enabled"] is False


def test_load_missing_or_corrupt_falls_back(tmp_path):
    assert RC.load_config(str(tmp_path / "nope.json")) == RC.default_config()
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert RC.load_config(str(bad)) == RC.default_config()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_rules_config.py -q`
Expected: FAIL（`ModuleNotFoundError: yitian_rules_config`）

- [ ] **Step 3: 实现 `yitian_rules_config.py`**

```python
# yitian_rules_config.py
"""倚天工时域:合规规则配置(超管可配)。纯函数 + 原子读写,可单测。

默认值单一来源 = yitian_rules.py 常量;default_config() 由其装配,不重复维护第二份默认。
后端只认本 JSON schema 一套校验(唯一权威);Excel<->JSON 转换在前端。
规则调整由超管在 /data 页改,保存即后端重算 yitian_data.json,无需点「更新数据」。
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

import yitian_rules as R

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# 防呆上限
_MAX_LIST = 200
_MAX_ITEM_LEN = 100
_CHECK_KEYS = ("summary", "progress", "next", "serviceMode",
               "typeMismatch", "product", "customer", "presaleProductHint")


def _re_to_keywords(pattern: str) -> List[str]:
    """把 yitian_rules 里 '(a|b|c)' 形式的必填/客户正则拆回关键词列表(仅用于本仓自带的简单单组交替正则)。"""
    return pattern.strip().lstrip("(").rstrip(")").split("|")


def default_config() -> Dict[str, Any]:
    return {
        "version": 1,
        "checkedTypes": list(R.CHECKED_TYPES),
        "checks": {
            "summary": {"enabled": True, "keywords": _re_to_keywords(R.SUMMARY_RE)},
            "progress": {"enabled": True, "keywords": _re_to_keywords(R.PROGRESS_RE)},
            "next": {"enabled": True, "keywords": _re_to_keywords(R.NEXT_RE)},
            "serviceMode": {"enabled": True, "effectiveDate": R.SERVICE_MODE_EFFECTIVE_DATE},
            "typeMismatch": {"enabled": True, "rules": {
                wt: [list(pair) for pair in pairs] for wt, pairs in R.TYPE_MISMATCH_RULES.items()}},
            "product": {"enabled": True,
                        "lineKeywords": [{"linePatterns": list(p), "keywords": list(k)}
                                         for p, k in R.PRODUCT_LINE_KEYWORDS],
                        "nameKeywords": [{"namePatterns": list(p), "keywords": list(k)}
                                         for p, k in R.PRODUCT_NAME_KEYWORDS],
                        "exclusiveKws": sorted(R.EXCLUSIVE_KWS)},
            "customer": {"enabled": True, "hintKeywords": _re_to_keywords(R.CUSTOMER_HINT_RE)},
            "presaleProductHint": {"enabled": True, "skipWorkTypes": sorted(R.PRESALE_SKIP_WORKTYPES)},
        },
    }


def _norm_str_list(raw: Any, field: str) -> List[str]:
    if not isinstance(raw, list):
        raise ValueError("%s 必须是数组" % field)
    if len(raw) > _MAX_LIST:
        raise ValueError("%s 项数过多" % field)
    out: List[str] = []
    for item in raw:
        if not isinstance(item, str):
            raise ValueError("%s 只能含字符串" % field)
        s = item.strip()
        if not s:
            continue
        if len(s) > _MAX_ITEM_LEN:
            raise ValueError("%s 单项过长" % field)
        if s not in out:
            out.append(s)
    return out


def _bool(v: Any, field: str) -> bool:
    if not isinstance(v, bool):
        raise ValueError("%s 必须是布尔" % field)
    return v


def _seg(checks: Any, key: str) -> Dict[str, Any]:
    """取 checks[key],缺失/非 dict → {}(交由各校验函数回落默认段)。"""
    if isinstance(checks, dict) and isinstance(checks.get(key), dict):
        return checks[key]
    return {}


def validate_config(cfg: Any) -> Dict[str, Any]:
    """严格校验并归一化。非法→ValueError;缺键→回落对应默认段。"""
    if not isinstance(cfg, dict):
        raise ValueError("配置必须是对象")
    d = default_config()
    checks_in = cfg.get("checks", {})

    if "checkedTypes" in cfg:
        d["checkedTypes"] = _norm_str_list(cfg["checkedTypes"], "checkedTypes")

    def kw_seg(key: str) -> None:
        seg = _seg(checks_in, key)
        if seg:
            d["checks"][key] = {"enabled": _bool(seg.get("enabled", True), key + ".enabled"),
                                "keywords": _norm_str_list(seg.get("keywords", d["checks"][key]["keywords"]),
                                                           key + ".keywords")}

    for k in ("summary", "progress", "next"):
        kw_seg(k)

    sm = _seg(checks_in, "serviceMode")
    if sm:
        date = sm.get("effectiveDate", d["checks"]["serviceMode"]["effectiveDate"])
        if not (isinstance(date, str) and _DATE_RE.match(date)):
            raise ValueError("serviceMode.effectiveDate 须为 YYYY-MM-DD")
        d["checks"]["serviceMode"] = {"enabled": _bool(sm.get("enabled", True), "serviceMode.enabled"),
                                      "effectiveDate": date}

    tm = _seg(checks_in, "typeMismatch")
    if tm:
        rules_in = tm.get("rules", {})
        if not isinstance(rules_in, dict):
            raise ValueError("typeMismatch.rules 必须是对象")
        rules: Dict[str, List[List[str]]] = {}
        for wt, pairs in rules_in.items():
            if not isinstance(pairs, list):
                raise ValueError("typeMismatch.rules[%s] 必须是数组" % wt)
            norm_pairs: List[List[str]] = []
            for pair in pairs:
                if not (isinstance(pair, list) and len(pair) == 2
                        and all(isinstance(x, str) and x.strip() for x in pair)):
                    raise ValueError("typeMismatch 每对须为 [禁止词, 应归属类型] 两个非空字符串")
                norm_pairs.append([pair[0].strip(), pair[1].strip()])
            rules[str(wt).strip()] = norm_pairs
        d["checks"]["typeMismatch"] = {"enabled": _bool(tm.get("enabled", True), "typeMismatch.enabled"),
                                       "rules": rules}

    pr = _seg(checks_in, "product")
    if pr:
        def entries(raw: Any, pat_key: str) -> List[Dict[str, List[str]]]:
            if not isinstance(raw, list):
                raise ValueError("product.%s 必须是数组" % pat_key)
            out = []
            for e in raw:
                if not isinstance(e, dict):
                    raise ValueError("product.%s 每项须为对象" % pat_key)
                pats = _norm_str_list(e.get(pat_key, []), "product." + pat_key)
                kws = _norm_str_list(e.get("keywords", []), "product.keywords")
                if not pats or not kws:
                    raise ValueError("product.%s 每项 %s 与 keywords 均不可为空" % (pat_key, pat_key))
                out.append({pat_key: pats, "keywords": kws})
            return out
        d["checks"]["product"] = {
            "enabled": _bool(pr.get("enabled", True), "product.enabled"),
            "lineKeywords": entries(pr.get("lineKeywords", []), "linePatterns")
            if "lineKeywords" in pr else d["checks"]["product"]["lineKeywords"],
            "nameKeywords": entries(pr.get("nameKeywords", []), "namePatterns")
            if "nameKeywords" in pr else d["checks"]["product"]["nameKeywords"],
            "exclusiveKws": _norm_str_list(pr.get("exclusiveKws", d["checks"]["product"]["exclusiveKws"]),
                                           "product.exclusiveKws"),
        }

    cu = _seg(checks_in, "customer")
    if cu:
        d["checks"]["customer"] = {"enabled": _bool(cu.get("enabled", True), "customer.enabled"),
                                   "hintKeywords": _norm_str_list(
                                       cu.get("hintKeywords", d["checks"]["customer"]["hintKeywords"]),
                                       "customer.hintKeywords")}

    ph = _seg(checks_in, "presaleProductHint")
    if ph:
        d["checks"]["presaleProductHint"] = {
            "enabled": _bool(ph.get("enabled", True), "presaleProductHint.enabled"),
            "skipWorkTypes": _norm_str_list(
                ph.get("skipWorkTypes", d["checks"]["presaleProductHint"]["skipWorkTypes"]),
                "presaleProductHint.skipWorkTypes")}

    return d


def load_config(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return validate_config(json.load(f))
    except (OSError, ValueError):
        return default_config()


def save_config(path: str, cfg: Any) -> Dict[str, Any]:
    clean = validate_config(cfg)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return clean
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_rules_config.py -q`
Expected: PASS（8 passed）

- [ ] **Step 5: 提交**

```bash
git add yitian_rules_config.py tests/test_yitian_rules_config.py
git commit -m "feat(yitian): 合规规则配置模块 yitian_rules_config(默认由 yitian_rules 装配)"
```

---

### Task 2: `yitian_check.check_row` 由读常量改为读 cfg

**Files:**
- Modify: `yitian_check.py`（重写 `check_row` / `_check_product`，新增 `_all_line_kws` / `_keywords_re`；`corrected_work_type`/`peer_contents`/`ok_of` 不变）
- Test: `tests/test_yitian_check.py`（若已存在则追加；否则新建）

**Interfaces:**
- Consumes: `yitian_rules_config.default_config()`（Task 1）
- Produces: `check_row(row: dict, peer: str = "", cfg: dict | None = None) -> Tuple[List[str], List[str]]`（cfg=None 时用 `default_config()`）

- [ ] **Step 1: 写回归 + 行为测试**

创建/追加 `tests/test_yitian_check.py`：

```python
import yitian_check as CHK
import yitian_rules_config as RC


def _row(**kw):
    base = {"work_type": "项目类", "content": "", "date": "2026-06-01",
            "service_mode": "现场", "customer": "某客户", "product_line": "",
            "product_name": "", "project_type": "", "work_type3": "", "work_order": ""}
    base.update(kw)
    return base


# —— 回归安全网:默认 cfg 必须与旧硬编码行为一致 ——
def test_all_three_sections_present_ok():
    r = _row(content="工作概述:巡检。工作进展:完成。下一步计划:复盘。")
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert codes == []


def test_missing_summary_and_next():
    r = _row(content="工作进展:完成了部署。")   # 缺概述、缺下一步
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert "MISS_SUMMARY" in codes and "MISS_NEXT" in codes and "MISS_PROGRESS" not in codes


def test_service_mode_missing_after_effective_date():
    r = _row(content="工作概述x工作进展x下一步x", service_mode="", date="2026-05-10")
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert "MISS_SERVICE_MODE" in codes


def test_service_mode_exempt_before_effective_date():
    r = _row(content="工作概述x工作进展x下一步x", service_mode="", date="2026-05-08")
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert "MISS_SERVICE_MODE" not in codes


def test_type_mismatch_presale_has_acceptance():
    r = _row(work_type="售前类", content="工作概述x工作进展x下一步x 项目验收完成")
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert "TYPE_MISMATCH" in codes


def test_customer_missing_but_mentioned():
    r = _row(content="工作概述x工作进展x下一步x 与客户沟通", customer="")
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert "MISS_CUSTOMER" in codes


def test_mgmt_type_not_checked():
    codes, _ = CHK.check_row(_row(work_type="管理类", content=""), "", RC.default_config())
    assert codes == []


def test_product_mismatch_other_line_kw():
    r = _row(content="工作概述x工作进展x下一步x 配置了防火墙策略", product_line="NGSOC")
    codes, _ = CHK.check_row(r, "", RC.default_config())
    assert "PRODUCT_MISMATCH" in codes


# —— 开关与词表可配 ——
def test_disable_summary_check():
    cfg = RC.default_config()
    cfg["checks"]["summary"]["enabled"] = False
    r = _row(content="工作进展x下一步x")     # 缺概述
    codes, _ = CHK.check_row(r, "", cfg)
    assert "MISS_SUMMARY" not in codes


def test_disable_product_check():
    cfg = RC.default_config()
    cfg["checks"]["product"]["enabled"] = False
    r = _row(content="工作概述x工作进展x下一步x 配置了防火墙策略", product_line="NGSOC")
    codes, _ = CHK.check_row(r, "", cfg)
    assert "PRODUCT_MISMATCH" not in codes


def test_custom_summary_keyword():
    cfg = RC.default_config()
    cfg["checks"]["summary"]["keywords"] = ["今日小结"]
    ok = _row(content="今日小结:做了A。工作进展x下一步x")
    bad = _row(content="工作概述:做了A。工作进展x下一步x")   # 旧词不再算命中
    assert "MISS_SUMMARY" not in CHK.check_row(ok, "", cfg)[0]
    assert "MISS_SUMMARY" in CHK.check_row(bad, "", cfg)[0]


def test_cfg_none_uses_default():
    r = _row(content="工作进展x下一步x")
    assert "MISS_SUMMARY" in CHK.check_row(r)[0]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_check.py -q`
Expected: FAIL（`check_row()` 目前签名不接受 cfg，或行为不符 → 报错/断言失败）

- [ ] **Step 3: 重写 `yitian_check.py`**

替换 `_check_product` 与 `check_row`，新增 `_all_line_kws`/`_keywords_re`；删除模块级 `_ALL_LINE_KWS`（改按 cfg 现算）。完整文件：

```python
# yitian_check.py
"""倚天工时域:合规判定(纯函数)。判定所用规则全部来自传入的 cfg(yitian_rules_config 结构);
本模块只写判定逻辑。cfg=None 时回落 default_config()。

入参 row 是归一化后的 dict,键:work_type/content/date/service_mode/customer/
product_line/product_name/project_type/work_type3/work_order。
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

import yitian_rules as R   # 仅用非规则常量:ISSUE_LABELS / HINT_PREFIX / PRESALE_PROJECT_TYPE_KEY


def corrected_work_type(project_type: str, work_type: str) -> str:
    """数据校正:项目类型含「售前服务」→ 工时类型强制为「项目类」。"""
    if R.PRESALE_PROJECT_TYPE_KEY in str(project_type or ""):
        return "项目类"
    return work_type


def peer_contents(rows: List[dict]) -> Dict[str, str]:
    """按工单编号合并同工单全部工作成果(同工单关联检查用)。无工单号的行不参与。"""
    out: Dict[str, str] = {}
    for r in rows:
        wo = str(r.get("work_order") or "").strip()
        if not wo or wo.lower() in ("nan", "none", "-"):
            continue
        out[wo] = out.get(wo, "") + " " + str(r.get("content") or "")
    return out


def _keywords_re(keywords: List[str]) -> str:
    """关键词列表拼成 (a|b|c),各词 re.escape(默认词无特殊字符,行为与旧正则一致)。"""
    return "(" + "|".join(re.escape(k) for k in keywords) + ")"


def _all_line_kws(cfg: dict) -> set:
    """他家产品词全集(去专属词),按 cfg 现算(不再 import 期固化为模块常量)。"""
    exclusive = set(cfg["checks"]["product"].get("exclusiveKws", []))
    return {kw.lower()
            for entry in cfg["checks"]["product"]["lineKeywords"]
            for kw in entry["keywords"]
            if kw not in exclusive}


def _check_product(row: dict, peer: str, cfg: dict) -> Tuple[List[str], List[str]]:
    """产品类别:两级复核 + 同工单关联。返回 ([code], [msg]) 或 ([], [])。"""
    pc = cfg["checks"]["product"]
    line = str(row.get("product_line") or "").strip()
    name = str(row.get("product_name") or "").strip()
    content = str(row.get("content") or "")
    if not line or line.lower() in ("nan", "none", "-"):
        return [], []
    if "项目管理" in content:
        return [], []

    own = None
    for entry in pc["lineKeywords"]:
        if any(p in line for p in entry["linePatterns"]):
            own = entry["keywords"]
            break
    if own is None:
        return [], []

    low = content.lower()
    if any(kw.lower() in low for kw in own):
        return [], []
    if peer and any(kw.lower() in peer.lower() for kw in own):
        return [], []

    own_low = {kw.lower() for kw in own}
    hits = sorted(kw for kw in (_all_line_kws(cfg) - own_low) if kw in low)
    if not hits:
        return [], []

    if name and name.lower() not in ("nan", "none", "-", "其他"):
        for entry in pc["nameKeywords"]:
            if any(p in name for p in entry["namePatterns"]):
                if any(kw.lower() in low for kw in entry["keywords"]):
                    return [], []
                break

    own_str = "/".join('"%s"' % k for k in own[:3])
    hit_str = "、".join("[%s]" % k for k in hits[:3])
    msg = ('产品类别填写错误:产品线为"%s",工作成果不含%s等本产品关键词,却包含%s等其他产品内容'
           % (line, own_str, hit_str))
    return ["PRODUCT_MISMATCH"], [msg]


def check_row(row: dict, peer: str = "", cfg: dict = None) -> Tuple[List[str], List[str]]:
    """单行合规判定 → (问题码列表, 中文消息列表)。cfg=None 用默认配置。
    仅 cfg['checkedTypes'] 内的工时类型进检查;每检查项先看 enabled。"""
    if cfg is None:
        import yitian_rules_config as RC
        cfg = RC.default_config()

    work_type = str(row.get("work_type") or "")
    if work_type not in cfg["checkedTypes"]:
        return [], []

    content = str(row.get("content") or "")
    checks = cfg["checks"]
    codes: List[str] = []
    msgs: List[str] = []

    # 1) 必填三段(全文模糊匹配,大小写不敏感)
    for key, code in (("summary", "MISS_SUMMARY"), ("progress", "MISS_PROGRESS"), ("next", "MISS_NEXT")):
        c = checks[key]
        if c["enabled"] and c["keywords"]:
            if not re.search(_keywords_re(c["keywords"]), content, re.IGNORECASE):
                codes.append(code)
                msgs.append(R.ISSUE_LABELS[code])

    # 2) 服务方式:读列非空;早于生效日豁免(ISO 日期串字典序可直接比较)
    sm = checks["serviceMode"]
    if sm["enabled"]:
        if str(row.get("date") or "") >= sm["effectiveDate"]:
            if not str(row.get("service_mode") or "").strip():
                codes.append("MISS_SERVICE_MODE")
                msgs.append(R.ISSUE_LABELS["MISS_SERVICE_MODE"])

    # 3) 工时类型一致性(禁止词 → 疑似填错类型)
    tm = checks["typeMismatch"]
    if tm["enabled"]:
        forbidden = tm["rules"].get(work_type)
        if forbidden:
            by_target: Dict[str, List[str]] = {}
            for kw, target in forbidden:
                if kw in content:
                    by_target.setdefault(target, []).append(kw)
            if by_target:
                parts = []
                for target, kws in by_target.items():
                    parts.append("%s工时疑似含%s内容:%s"
                                 % (work_type, target, "、".join("[%s]" % k for k in kws)))
                codes.append("TYPE_MISMATCH")
                msgs.append(";".join(parts))

    # 4) 产品类别
    if checks["product"]["enabled"]:
        pcodes, pmsgs = _check_product(row, peer, cfg)
        codes.extend(pcodes)
        msgs.extend(pmsgs)

    # 5) 客户名称一致性(客户列空但正文提到客户;大小写敏感,与旧口径一致)
    cu = checks["customer"]
    if cu["enabled"] and cu["hintKeywords"]:
        if not str(row.get("customer") or "").strip():
            if re.search(_keywords_re(cu["hintKeywords"]), content):
                codes.append("MISS_CUSTOMER")
                msgs.append("客户名称未填写,但工作内容中提到客户")

    # 6) 售前服务产品类别提示(只提示,不计不合规)
    ph = checks["presaleProductHint"]
    if ph["enabled"]:
        if R.PRESALE_PROJECT_TYPE_KEY in str(row.get("project_type") or ""):
            if str(row.get("work_type3") or "") not in ph["skipWorkTypes"]:
                if str(row.get("product_line") or "").strip() == "其他":
                    codes.append("HINT_PRESALE_PRODUCT")
                    msgs.append(R.ISSUE_LABELS["HINT_PRESALE_PRODUCT"])

    return codes, msgs


def ok_of(codes: List[str]) -> int:
    """0=合规 / 1=合规(提示) / 2=问题。含任一非 HINT_ 码即为问题。"""
    if not codes:
        return 0
    if any(not c.startswith(R.HINT_PREFIX) for c in codes):
        return 2
    return 1
```

- [ ] **Step 4: 跑测试确认通过 + 全量后端回归**

Run: `python -m pytest tests/test_yitian_check.py tests/test_yitian_rules_config.py -q`
Expected: PASS
Run: `python -m pytest tests/ -q`
Expected: 全绿（确认 `build_yitian_data` 的现有调用未被破坏——此时 `yitian.py` 仍用旧签名 `check_row(r, peer)`，Task 3 才改；`check_row` 新签名 `cfg` 默认 None → 用默认配置，**旧两参调用完全兼容**，故此处已应全绿）

- [ ] **Step 5: 提交**

```bash
git add yitian_check.py tests/test_yitian_check.py
git commit -m "refactor(yitian): check_row 由读常量改为读 cfg(默认行为不变;支持启用开关与词表可配)"
```

---

### Task 3: `yitian.build_yitian_data` 载入并透传 cfg

**Files:**
- Modify: `yitian.py:150-218`（`build_yitian_data` 签名加 `rules_cfg`，载入 cfg，第 191 行 `check_row` 调用传 cfg）
- Test: `tests/test_yitian_build_rules.py`

**Interfaces:**
- Consumes: `yitian_rules_config.load_config`（Task 1）、`check_row(row, peer, cfg)`（Task 2）
- Produces: `build_yitian_data(base_dir: str, store: dict | None = None, rules_cfg: dict | None = None) -> dict | None`

- [ ] **Step 1: 写测试**

创建 `tests/test_yitian_build_rules.py`：

```python
import yitian as Y
import yitian_rules_config as RC


def _seed(tmp_path, monkeypatch):
    """构造最小可跑的 base_dir:一条问题工时 + 花名册命中。"""
    import os
    import json
    base = tmp_path
    (base / "data").mkdir()
    (base / "input").mkdir()
    (base / "input" / "yitian").mkdir()
    store = {"rows": [{
        "emp_id": "E1", "date": "2026-06-01", "hours": 8.0,
        "work_type": "项目类", "work_type3": "开发", "content": "只写了工作进展,缺概述与下一步",
        "customer": "某客户", "product_line": "", "product_name": "", "project_type": "",
        "service_mode": "现场", "sales_l2": "交付中心", "work_order": "WO1",
    }], "version": 1}
    (base / "data" / "yitian_store.json").write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
    # 花名册:让 read_org_roster 命中 E1。monkeypatch 直接替换 roster 读取,免造 xlsx。
    monkeypatch.setattr(Y, "read_org_roster", lambda p: [{"id": "E1", "name": "张三", "orgL4": "一部"}])
    monkeypatch.setattr(Y, "read_top1000", lambda p: {})
    return str(base)


def test_build_uses_default_rules(tmp_path, monkeypatch):
    base = _seed(tmp_path, monkeypatch)
    data = Y.build_yitian_data(base)
    assert data is not None
    e0 = data["entries"][0]
    assert e0["ok"] == 2                       # 缺概述/下一步 → 问题
    assert "MISS_SUMMARY" in e0["iss"]


def test_build_respects_disabled_check(tmp_path, monkeypatch):
    base = _seed(tmp_path, monkeypatch)
    cfg = RC.default_config()
    cfg["checks"]["summary"]["enabled"] = False
    cfg["checks"]["next"]["enabled"] = False
    data = Y.build_yitian_data(base, rules_cfg=cfg)
    assert "MISS_SUMMARY" not in data["entries"][0]["iss"]
    assert "MISS_NEXT" not in data["entries"][0]["iss"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_build_rules.py -q`
Expected: FAIL（`build_yitian_data` 不接受 `rules_cfg`）

- [ ] **Step 3: 改 `yitian.py`**

在 `yitian.py` 顶部 import 段加：`import yitian_rules_config as RCFG`（放在既有 `import yitian_rules as R` 附近）。

改 `build_yitian_data` 签名与 cfg 载入、check_row 调用：

```python
def build_yitian_data(base_dir: str, store: Optional[dict] = None,
                      rules_cfg: Optional[dict] = None) -> Optional[dict]:
```

在 `input_dir = ...` 之后、`if store is None:` 之前插入：

```python
    if rules_cfg is None:
        rules_cfg = RCFG.load_config(os.path.join(base_dir, "data", "yitian_rules.json"))
```

把第 191 行：

```python
        codes, msgs = CHK.check_row(r, peers.get(r["work_order"], ""))
```

改为：

```python
        codes, msgs = CHK.check_row(r, peers.get(r["work_order"], ""), rules_cfg)
```

- [ ] **Step 4: 跑测试确认通过 + 全量后端回归**

Run: `python -m pytest tests/test_yitian_build_rules.py -q`
Expected: PASS
Run: `python -m pytest tests/ -q`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add yitian.py tests/test_yitian_build_rules.py
git commit -m "feat(yitian): build_yitian_data 载入并透传 rules_cfg(缺省读 data/yitian_rules.json 或默认)"
```

---

### Task 4: `server.py` `/api/yitian/rules` 端点 + 门禁 + 审计 + gitignore

**Files:**
- Modify: `server.py`（import；`YITIAN_RULES_FILE` + `_yitian_rules_lock` 常量；`_SUPER_ONLY_PATHS` 加路径；GET/POST 路由；`_rebuild_yitian_data` 加 `rules_cfg` 形参并 `return data`；两个 handler）
- Modify: `.gitignore`（加 `data/yitian_rules.json`）
- Test: `tests/test_server_yitian_rules.py`

**Interfaces:**
- Consumes: `yitian_rules_config`（Task 1）、`yitian.build_yitian_data(..., rules_cfg=)`（Task 3）、既有 `_require_super`/`_read_json_body`/`_audit_set`/`_send_json`/`_error_payload`/`yitian_store.load_store`/`schema.validate_and_write_yitian_json`
- Produces: `GET /api/yitian/rules` → `{success, rules}`；`POST /api/yitian/rules` → `{success, rules, problemCount}`

- [ ] **Step 1: 写测试**

创建 `tests/test_server_yitian_rules.py`（仿 `tests/test_server_audit.py` 起服务风格）：

```python
import json
import http.client
import threading
import auth
import server
import yitian_rules_config as RC


def _srv(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    # 三个文件全指向临时目录,避免读写真实 data/ 且保证 hermetic
    # (store 指向不存在 → load_store 回空 → build 早返 None,不触碰 input/;data 指向 tmp → 删/写不误伤真实文件)
    monkeypatch.setattr(server, "YITIAN_RULES_FILE", str(tmp_path / "yitian_rules.json"))
    monkeypatch.setattr(server, "YITIAN_STORE_FILE", str(tmp_path / "yitian_store.json"))
    monkeypatch.setattr(server, "YITIAN_DATA_FILE", str(tmp_path / "yitian_data.json"))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def _login(port, account="admin", password="wxtnb"):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": password}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    return conn, cookie


def test_get_returns_default_when_absent(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("GET", "/api/yitian/rules", headers={"Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body["success"] and body["rules"]["checks"]["summary"]["enabled"] is True
    finally:
        srv.shutdown(); srv.server_close()


def test_get_requires_super(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("GET", "/api/yitian/rules")     # 未登录
        assert conn.getresponse().status == 401
    finally:
        srv.shutdown(); srv.server_close()


def test_post_invalid_400_and_file_unchanged(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/yitian/rules",
                     json.dumps({"checks": {"serviceMode": {"enabled": True, "effectiveDate": "bad"}}}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        r.read()
        import os
        assert not os.path.exists(str(tmp_path / "yitian_rules.json"))   # 未落库
    finally:
        srv.shutdown(); srv.server_close()


def test_post_saves_and_returns_problem_count(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        cfg = RC.default_config()
        conn.request("POST", "/api/yitian/rules", json.dumps(cfg),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body["success"] and "problemCount" in body
        import os
        assert os.path.exists(str(tmp_path / "yitian_rules.json"))       # 已落库
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_yitian_rules.py -q`
Expected: FAIL（端点不存在 → 404/500）

- [ ] **Step 3a: import + 常量 + 门禁**

`server.py` import 段（`import yitian_settings` 附近）加：`import yitian_rules_config`。

常量段（`YITIAN_SETTINGS_FILE = ...` 附近，约 309 行）加：

```python
YITIAN_RULES_FILE = os.path.join(BASE_DIR, 'data', 'yitian_rules.json')
```

锁段（`_yitian_settings_lock = threading.RLock()` 附近）加：

```python
_yitian_rules_lock = threading.RLock()
```

`_SUPER_ONLY_PATHS`（约 216 行 `'/api/yitian/store/clear', '/api/yitian/store/delete-range',` 之后）加：

```python
    '/api/yitian/rules',
```

- [ ] **Step 3b: 路由**

GET 路由（`elif parsed.path == '/api/yitian/settings':` 约 773 行附近）加：

```python
        elif parsed.path == '/api/yitian/rules':
            self.handle_yitian_rules_get()
```

POST 路由（`elif parsed.path == '/api/yitian/settings':` 约 927 行附近）加：

```python
        elif parsed.path == '/api/yitian/rules':
            self.handle_yitian_rules_save()
```

- [ ] **Step 3c: `_rebuild_yitian_data` 加 `rules_cfg` 并 `return data`**

把 `_rebuild_yitian_data`（约 2628 行）改为：

```python
    def _rebuild_yitian_data(self, store, rules_cfg=None):
        """用给定累积库(可能内存已改未落盘)重建 data/yitian_data.json。rules_cfg 传入则用之(保存规则的
        「先算通再落盘」),否则 build 内部读 data/yitian_rules.json 或默认。返回 build 出的 data(或 None)。"""
        data = None
        try:
            data = yitian.build_yitian_data(BASE_DIR, store=store, rules_cfg=rules_cfg)
            if data is None:
                try:
                    os.remove(YITIAN_DATA_FILE)
                except OSError:
                    pass
            else:
                schema.validate_and_write_yitian_json(data, os.path.dirname(YITIAN_DATA_FILE))
        finally:
            with _yitian_cache_lock:
                _yitian_cache['mtime'] = None
                _yitian_cache['data'] = None
        return data
```

- [ ] **Step 3d: 两个 handler**

在 `handle_yitian_settings_save` 之后加：

```python
    def handle_yitian_rules_get(self):
        """GET /api/yitian/rules - 合规规则配置。超管专属(路径已在 _SUPER_ONLY_PATHS)。"""
        if self._require_super() is None:
            return
        self._send_json(200, {"success": True,
                              "rules": yitian_rules_config.load_config(YITIAN_RULES_FILE)})

    def handle_yitian_rules_save(self):
        """POST /api/yitian/rules - 超管专属。先算通再落盘:新规则先在内存 build+schema 跑通,
        成功才落 yitian_rules.json + yitian_data.json;任一步失败两文件都不动。改完立即生效,无需更新数据。"""
        if self._require_super() is None:
            return
        body = self._read_json_body()
        if body is None:
            self._send_json(400, _error_payload(ERR_VALIDATION, "请求体不是合法 JSON"))
            return
        try:
            cfg = yitian_rules_config.validate_config(body)
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        with _yitian_rules_lock:
            store = yitian_store.load_store(YITIAN_STORE_FILE)
            try:
                data = self._rebuild_yitian_data(store, rules_cfg=cfg)   # 先算通(并写 yitian_data)
            except Exception as e:
                self._send_json(500, _error_payload(
                    ERR_INTERNAL, "规则未生效,配置与下发数据均未变更: %s" % e))
                return
            clean = yitian_rules_config.save_config(YITIAN_RULES_FILE, cfg)   # 跑通才落配置
        problem = sum(1 for e in data["entries"] if e["ok"] == 2) if data else 0
        disabled = [k for k, v in clean["checks"].items() if not v["enabled"]]
        self._audit_set(target='倚天合规规则',
                        detail='保存合规规则；停用: ' + ('、'.join(disabled) or '(无)'))
        self._send_json(200, {"success": True, "rules": clean, "problemCount": problem})
```

- [ ] **Step 3e: `.gitignore`**

在 `.gitignore` 里 `data/yitian_settings.json` 附近（或 data 配置类段）加一行：

```
data/yitian_rules.json
```

- [ ] **Step 4: 跑测试确认通过 + 全量后端回归**

Run: `python -m pytest tests/test_server_yitian_rules.py -q`
Expected: PASS
Run: `python -m pytest tests/ -q`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add server.py .gitignore tests/test_server_yitian_rules.py
git commit -m "feat(yitian): /api/yitian/rules 超管端点(GET/POST 先算通再落盘+审计)+gitignore"
```

---

### Task 5: 前端纯计算层 `lib/yitian/rulesConfig.ts`（类型 + JSON/Excel 转换）

**Files:**
- Create: `frontend/src/lib/yitian/rulesConfig.ts`
- Test: `frontend/src/lib/yitian/rulesConfig.test.ts`

**Interfaces:**
- Produces:
  - `interface YitianRulesConfig`（与 Global canonical 结构一致）
  - `configToWorkbook(cfg): XLSX.WorkBook`、`workbookToConfig(wb): YitianRulesConfig`
  - `parseImportFile(file: File): Promise<YitianRulesConfig>`（按扩展名分流 .json/.xlsx）
  - `downloadJson(cfg, filename)`、`downloadXlsx(cfg, filename)`
  - `MULTI_SEP = '、'`（多值单元格分隔符）

- [ ] **Step 1: 写测试**

创建 `frontend/src/lib/yitian/rulesConfig.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { configToWorkbook, workbookToConfig, type YitianRulesConfig } from './rulesConfig'

const CFG: YitianRulesConfig = {
  version: 1,
  checkedTypes: ['项目类', '售前类', '售后类'],
  checks: {
    summary: { enabled: true, keywords: ['工作概述', '工作总结'] },
    progress: { enabled: false, keywords: ['工作进展'] },
    next: { enabled: true, keywords: ['下一步'] },
    serviceMode: { enabled: true, effectiveDate: '2026-05-09' },
    typeMismatch: { enabled: true, rules: { 售前类: [['正式上线', '项目类'], ['投标书', '业务类']] } },
    product: {
      enabled: true,
      lineKeywords: [{ linePatterns: ['NGSOC'], keywords: ['SOC', 'SOAR'] }],
      nameKeywords: [{ namePatterns: ['网神V6.0'], keywords: ['SSLO'] }],
      exclusiveKws: ['组件', '租户'],
    },
    customer: { enabled: true, hintKeywords: ['客户', '甲方'] },
    presaleProductHint: { enabled: false, skipWorkTypes: ['项目管理'] },
  },
}

describe('rulesConfig JSON<->Excel', () => {
  it('configToWorkbook 再 workbookToConfig 无损往返', () => {
    const wb = configToWorkbook(CFG)
    const back = workbookToConfig(wb)
    expect(back).toEqual(CFG)
  })

  it('停用开关经 Excel 往返保持', () => {
    const back = workbookToConfig(configToWorkbook(CFG))
    expect(back.checks.progress.enabled).toBe(false)
    expect(back.checks.presaleProductHint.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- src/lib/yitian/rulesConfig.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `rulesConfig.ts`**

Excel 布局（sheet → 列）：
- `开关与基础`：列 `[项, 值]`（固定项名词表：`受检工时类型 / 服务方式生效日 / 客户提示词 / 售前跳过工时类型` + 各检查启用 `启用-缺概述 / 启用-缺进展 / 启用-缺下一步 / 启用-服务方式 / 启用-类型一致性 / 启用-产品类别 / 启用-客户名称 / 启用-售前提示`，启用值 `是/否`，多值用 `、`）
- `必填三段`：列 `[检查项, 关键词]`（行 概述/进展/下一步）
- `类型一致性`：列 `[工时类型, 禁止词, 应归属类型]`
- `产品线关键词`：列 `[产品线匹配词, 合法关键词]`
- `产品名称复核`：列 `[产品名称匹配词, 合法关键词]`
- `专属词`：列 `[专属词]`

```typescript
import * as XLSX from 'xlsx'

export const MULTI_SEP = '、'

export interface CheckKw { enabled: boolean; keywords: string[] }
export interface YitianRulesConfig {
  version: number
  checkedTypes: string[]
  checks: {
    summary: CheckKw
    progress: CheckKw
    next: CheckKw
    serviceMode: { enabled: boolean; effectiveDate: string }
    typeMismatch: { enabled: boolean; rules: Record<string, [string, string][]> }
    product: {
      enabled: boolean
      lineKeywords: { linePatterns: string[]; keywords: string[] }[]
      nameKeywords: { namePatterns: string[]; keywords: string[] }[]
      exclusiveKws: string[]
    }
    customer: { enabled: boolean; hintKeywords: string[] }
    presaleProductHint: { enabled: boolean; skipWorkTypes: string[] }
  }
}

const splitMulti = (s: unknown): string[] =>
  String(s ?? '').split(MULTI_SEP).map((x) => x.trim()).filter(Boolean)
const joinMulti = (a: string[]): string => a.join(MULTI_SEP)
const yn = (b: boolean): string => (b ? '是' : '否')
const isYes = (s: unknown): boolean => String(s ?? '').trim() === '是'

const ENABLE_ROWS: [string, keyof YitianRulesConfig['checks']][] = [
  ['启用-缺概述', 'summary'], ['启用-缺进展', 'progress'], ['启用-缺下一步', 'next'],
  ['启用-服务方式', 'serviceMode'], ['启用-类型一致性', 'typeMismatch'],
  ['启用-产品类别', 'product'], ['启用-客户名称', 'customer'], ['启用-售前提示', 'presaleProductHint'],
]

export function configToWorkbook(cfg: YitianRulesConfig): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const base: Record<string, string>[] = [
    { 项: '受检工时类型', 值: joinMulti(cfg.checkedTypes) },
    { 项: '服务方式生效日', 值: cfg.checks.serviceMode.effectiveDate },
    { 项: '客户提示词', 值: joinMulti(cfg.checks.customer.hintKeywords) },
    { 项: '售前跳过工时类型', 值: joinMulti(cfg.checks.presaleProductHint.skipWorkTypes) },
    ...ENABLE_ROWS.map(([label, key]) => ({ 项: label, 值: yn(cfg.checks[key].enabled) })),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(base), '开关与基础')

  const req = [
    { 检查项: '概述', 关键词: joinMulti(cfg.checks.summary.keywords) },
    { 检查项: '进展', 关键词: joinMulti(cfg.checks.progress.keywords) },
    { 检查项: '下一步', 关键词: joinMulti(cfg.checks.next.keywords) },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(req), '必填三段')

  const tm: Record<string, string>[] = []
  for (const [wt, pairs] of Object.entries(cfg.checks.typeMismatch.rules))
    for (const [kw, target] of pairs) tm.push({ 工时类型: wt, 禁止词: kw, 应归属类型: target })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tm.length ? tm : [{ 工时类型: '', 禁止词: '', 应归属类型: '' }]), '类型一致性')

  const line = cfg.checks.product.lineKeywords.map((e) => ({ 产品线匹配词: joinMulti(e.linePatterns), 合法关键词: joinMulti(e.keywords) }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(line.length ? line : [{ 产品线匹配词: '', 合法关键词: '' }]), '产品线关键词')

  const name = cfg.checks.product.nameKeywords.map((e) => ({ 产品名称匹配词: joinMulti(e.namePatterns), 合法关键词: joinMulti(e.keywords) }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(name.length ? name : [{ 产品名称匹配词: '', 合法关键词: '' }]), '产品名称复核')

  const excl = cfg.checks.product.exclusiveKws.map((k) => ({ 专属词: k }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excl.length ? excl : [{ 专属词: '' }]), '专属词')

  return wb
}

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name]
  return ws ? (XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]) : []
}

export function workbookToConfig(wb: XLSX.WorkBook): YitianRulesConfig {
  const baseRows = sheetRows(wb, '开关与基础')
  const baseMap = new Map<string, string>()
  for (const r of baseRows) baseMap.set(String(r['项'] ?? '').trim(), String(r['值'] ?? ''))
  const enabledOf = (label: string): boolean => isYes(baseMap.get(label))

  const reqRows = sheetRows(wb, '必填三段')
  const reqKw = (label: string): string[] => {
    const hit = reqRows.find((r) => String(r['检查项'] ?? '').trim() === label)
    return splitMulti(hit?.['关键词'])
  }

  const rules: Record<string, [string, string][]> = {}
  for (const r of sheetRows(wb, '类型一致性')) {
    const wt = String(r['工时类型'] ?? '').trim()
    const kw = String(r['禁止词'] ?? '').trim()
    const tgt = String(r['应归属类型'] ?? '').trim()
    if (!wt || !kw || !tgt) continue
    ;(rules[wt] ||= []).push([kw, tgt])
  }

  const lineKeywords = sheetRows(wb, '产品线关键词')
    .map((r) => ({ linePatterns: splitMulti(r['产品线匹配词']), keywords: splitMulti(r['合法关键词']) }))
    .filter((e) => e.linePatterns.length && e.keywords.length)
  const nameKeywords = sheetRows(wb, '产品名称复核')
    .map((r) => ({ namePatterns: splitMulti(r['产品名称匹配词']), keywords: splitMulti(r['合法关键词']) }))
    .filter((e) => e.namePatterns.length && e.keywords.length)
  const exclusiveKws = sheetRows(wb, '专属词').map((r) => String(r['专属词'] ?? '').trim()).filter(Boolean)

  return {
    version: 1,
    checkedTypes: splitMulti(baseMap.get('受检工时类型')),
    checks: {
      summary: { enabled: enabledOf('启用-缺概述'), keywords: reqKw('概述') },
      progress: { enabled: enabledOf('启用-缺进展'), keywords: reqKw('进展') },
      next: { enabled: enabledOf('启用-缺下一步'), keywords: reqKw('下一步') },
      serviceMode: { enabled: enabledOf('启用-服务方式'), effectiveDate: String(baseMap.get('服务方式生效日') ?? '').trim() },
      typeMismatch: { enabled: enabledOf('启用-类型一致性'), rules },
      product: { enabled: enabledOf('启用-产品类别'), lineKeywords, nameKeywords, exclusiveKws },
      customer: { enabled: enabledOf('启用-客户名称'), hintKeywords: splitMulti(baseMap.get('客户提示词')) },
      presaleProductHint: { enabled: enabledOf('启用-售前提示'), skipWorkTypes: splitMulti(baseMap.get('售前跳过工时类型')) },
    },
  }
}

export function downloadJson(cfg: YitianRulesConfig, filename = '倚天合规规则.json'): void {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function downloadXlsx(cfg: YitianRulesConfig, filename = '倚天合规规则.xlsx'): void {
  XLSX.writeFile(configToWorkbook(cfg), filename)
}

export async function parseImportFile(file: File): Promise<YitianRulesConfig> {
  if (file.name.toLowerCase().endsWith('.json')) {
    return JSON.parse(await file.text()) as YitianRulesConfig
  }
  const buf = await file.arrayBuffer()
  return workbookToConfig(XLSX.read(buf, { type: 'array' }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- src/lib/yitian/rulesConfig.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/rulesConfig.ts frontend/src/lib/yitian/rulesConfig.test.ts
git commit -m "feat(yitian): 前端 rulesConfig 类型 + JSON/Excel 无损转换"
```

---

### Task 6: 前端 api + store（`yitianApi.ts` 加 rules；`stores/yitianRules.ts`）

**Files:**
- Modify: `frontend/src/lib/yitianApi.ts`（加 `getYitianRules` / `saveYitianRules`；从 `@/lib/yitian/rulesConfig` 引 `YitianRulesConfig` 类型）
- Create: `frontend/src/stores/yitianRules.ts`
- Test: `frontend/src/stores/yitianRules.test.ts`

**Interfaces:**
- Consumes: `YitianRulesConfig`（Task 5）、既有 `api.get/post`
- Produces:
  - `getYitianRules(): Promise<YitianRulesConfig>`、`saveYitianRules(cfg): Promise<{rules:YitianRulesConfig; problemCount:number}>`
  - `useYitianRulesStore`：`{ config, loaded, saving, load(), save(cfg), reset() }`

- [ ] **Step 1: 写 store 测试**

创建 `frontend/src/stores/yitianRules.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const getMock = vi.fn()
const postMock = vi.fn()
vi.mock('@/lib/yitianApi', () => ({
  getYitianRules: (...a: unknown[]) => getMock(...a),
  saveYitianRules: (...a: unknown[]) => postMock(...a),
}))

import { useYitianRulesStore } from './yitianRules'

describe('yitianRules store', () => {
  beforeEach(() => { setActivePinia(createPinia()); getMock.mockReset(); postMock.mockReset() })

  it('load 拉取并缓存', async () => {
    getMock.mockResolvedValue({ version: 1, checkedTypes: ['项目类'], checks: {} })
    const s = useYitianRulesStore()
    await s.load()
    expect(s.config?.checkedTypes).toEqual(['项目类'])
    await s.load()                         // 已 loaded 不再拉
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('save 回写 config 并返回 problemCount', async () => {
    postMock.mockResolvedValue({ rules: { version: 1, checkedTypes: ['售前类'], checks: {} }, problemCount: 3 })
    const s = useYitianRulesStore()
    const r = await s.save({ version: 1, checkedTypes: ['售前类'], checks: {} } as never)
    expect(r.problemCount).toBe(3)
    expect(s.config?.checkedTypes).toEqual(['售前类'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- src/stores/yitianRules.test.ts`
Expected: FAIL（store/api 不存在）

- [ ] **Step 3a: `yitianApi.ts` 加函数**

在 `frontend/src/lib/yitianApi.ts` 末尾加（文件已 `import { api }` 与类型；引 `YitianRulesConfig`）：

```typescript
import type { YitianRulesConfig } from '@/lib/yitian/rulesConfig'

export async function getYitianRules(): Promise<YitianRulesConfig> {
  const r = await api.get<{ success: boolean; rules: YitianRulesConfig }>('/api/yitian/rules')
  return r.rules
}

export async function saveYitianRules(cfg: YitianRulesConfig): Promise<{ rules: YitianRulesConfig; problemCount: number }> {
  const r = await api.post<{ success: boolean; rules: YitianRulesConfig; problemCount: number }>('/api/yitian/rules', cfg)
  return { rules: r.rules, problemCount: r.problemCount }
}
```

（若 `yitianApi.ts` 顶部 import 风格不同，按其现有 `api` 引入方式对齐。）

- [ ] **Step 3b: `stores/yitianRules.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getYitianRules, saveYitianRules } from '@/lib/yitianApi'
import type { YitianRulesConfig } from '@/lib/yitian/rulesConfig'

export const useYitianRulesStore = defineStore('yitianRules', () => {
  const config = ref<YitianRulesConfig | null>(null)
  const loaded = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    config.value = await getYitianRules()
    loaded.value = true
  }

  async function save(next: YitianRulesConfig): Promise<{ rules: YitianRulesConfig; problemCount: number }> {
    saving.value = true
    try {
      const r = await saveYitianRules(next)
      config.value = r.rules
      return r
    } finally {
      saving.value = false
    }
  }

  function reset(): void {
    config.value = null
    loaded.value = false
  }

  return { config, loaded, saving, load, save, reset }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- src/stores/yitianRules.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitianApi.ts frontend/src/stores/yitianRules.ts frontend/src/stores/yitianRules.test.ts
git commit -m "feat(yitian): 前端 rules api + yitianRules store"
```

---

### Task 7: `components/YitianRulesCard.vue`（超管卡：三组编辑 + 开关 + 导入导出）

**Files:**
- Create: `frontend/src/components/YitianRulesCard.vue`
- Test: `frontend/src/components/YitianRulesCard.test.ts`

**Interfaces:**
- Consumes: `useYitianRulesStore`（Task 6）、`rulesConfig` 的 `downloadJson/downloadXlsx/parseImportFile`（Task 5）、`useYitianStore`（保存后 `load(true)` 刷新合规数据）
- Produces: 组件；`defineExpose({ draft, onSave, onReset, onImport })` 供测试

- [ ] **Step 1: 写组件测试**

创建 `frontend/src/components/YitianRulesCard.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import YitianRulesCard from './YitianRulesCard.vue'
import { useYitianRulesStore } from '@/stores/yitianRules'

function seedStore() {
  const s = useYitianRulesStore()
  s.config = {
    version: 1, checkedTypes: ['项目类'],
    checks: {
      summary: { enabled: true, keywords: ['工作概述'] },
      progress: { enabled: true, keywords: ['工作进展'] },
      next: { enabled: true, keywords: ['下一步'] },
      serviceMode: { enabled: true, effectiveDate: '2026-05-09' },
      typeMismatch: { enabled: true, rules: { 售前类: [['正式上线', '项目类']] } },
      product: { enabled: true, lineKeywords: [{ linePatterns: ['NGSOC'], keywords: ['SOC'] }], nameKeywords: [], exclusiveKws: ['组件'] },
      customer: { enabled: true, hintKeywords: ['客户'] },
      presaleProductHint: { enabled: true, skipWorkTypes: ['项目管理'] },
    },
  } as never
  s.loaded = true
  return s
}

describe('YitianRulesCard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('载入 store 配置到草稿并渲染分组标题', async () => {
    seedStore()
    const w = mount(YitianRulesCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('基础项')
    expect(w.text()).toContain('类型一致性')
    expect(w.text()).toContain('产品类别')
    expect((w.vm as any).draft.checkedTypes).toEqual(['项目类'])
  })

  it('保存调用 store.save 并提示问题数', async () => {
    const s = seedStore()
    const saveSpy = vi.spyOn(s, 'save').mockResolvedValue({ rules: s.config as never, problemCount: 5 })
    const w = mount(YitianRulesCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await (w.vm as any).onSave()
    expect(saveSpy).toHaveBeenCalled()
    expect(w.text()).toContain('5')
  })

  it('导入替换草稿', async () => {
    seedStore()
    const w = mount(YitianRulesCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const imported = { version: 1, checkedTypes: ['售后类'], checks: (w.vm as any).draft.checks }
    await (w.vm as any).applyImport(imported)
    expect((w.vm as any).draft.checkedTypes).toEqual(['售后类'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- src/components/YitianRulesCard.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 `YitianRulesCard.vue`**

> 结构化编辑用 Element Plus：`el-tag`（可关闭）+ 输入加词做列表编辑；`el-switch` 做启用开关；`el-table` + 行增删做 typeMismatch / product 表；`el-date-picker` 做生效日。导入用隐藏 `<input type=file>` → `parseImportFile` → `applyImport(cfg)`（先弹确认再替换草稿）。保存成功后 `useYitianStore().load(true)` 刷新合规页数据。样式引用 `theme.css` 令牌、不手写散值、无 emoji。

```vue
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useYitianRulesStore } from '@/stores/yitianRules'
import { useYitianStore } from '@/stores/yitian'
import { downloadJson, downloadXlsx, parseImportFile, type YitianRulesConfig } from '@/lib/yitian/rulesConfig'

const store = useYitianRulesStore()
const yitian = useYitianStore()
const draft = ref<YitianRulesConfig | null>(null)
const msg = ref(''); const err = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function clone(c: YitianRulesConfig): YitianRulesConfig { return JSON.parse(JSON.stringify(c)) }

onMounted(async () => {
  try { await store.load() } catch (e) { err.value = true; msg.value = e instanceof Error ? e.message : '加载失败' }
  if (store.config) draft.value = clone(store.config)
})
watch(() => store.config, (c) => { if (c && !draft.value) draft.value = clone(c) })

// —— 列表增删(el-tag) ——
function addTo(list: string[], v: string) { const s = v.trim(); if (s && !list.includes(s)) list.push(s) }
function removeAt(list: string[], i: number) { list.splice(i, 1) }

// —— 类型一致性表行增删 ——
function addTmRow(wt: string) { if (!draft.value) return; (draft.value.checks.typeMismatch.rules[wt] ||= []).push(['', '']) }
function delTmRow(wt: string, i: number) { draft.value?.checks.typeMismatch.rules[wt]?.splice(i, 1) }

// —— 产品线/名称表行增删 ——
function addLineRow() { draft.value?.checks.product.lineKeywords.push({ linePatterns: [], keywords: [] }) }
function delLineRow(i: number) { draft.value?.checks.product.lineKeywords.splice(i, 1) }
function addNameRow() { draft.value?.checks.product.nameKeywords.push({ namePatterns: [], keywords: [] }) }
function delNameRow(i: number) { draft.value?.checks.product.nameKeywords.splice(i, 1) }

async function onSave() {
  if (!draft.value) return
  msg.value = ''; err.value = false
  try {
    const r = await store.save(draft.value)
    draft.value = clone(r.rules)
    await yitian.load(true)                 // 刷新合规页数据
    msg.value = `已保存并重算，问题工时 ${r.problemCount} 条（立即生效，无需点「更新数据」）`
  } catch (e) { err.value = true; msg.value = e instanceof Error ? e.message : '保存失败' }
}

async function onReset() {
  await ElMessageBox.confirm('恢复为系统内置默认规则？未保存的改动将丢失。', '恢复默认', { type: 'warning' }).catch(() => 'cancel')
    .then(async (v) => {
      if (v === 'cancel') return
      // 恢复默认 = 重新拉后端(缺文件时后端回落默认);若已存过配置,先删再拉不在本次范围——以后端默认为准需清空文件,
      // 简化:请管理员导入「默认模板」或后端返回默认。这里重新 load 强制拉当前后端值。
      store.reset(); await store.load(); if (store.config) draft.value = clone(store.config)
      msg.value = '已载入后端当前默认'; err.value = false
    })
}

function triggerImport() { fileInput.value?.click() }
async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const cfg = await parseImportFile(f)
    await ElMessageBox.confirm('导入将整份替换当前编辑内容（保存后才生效）。继续？', '导入确认', { type: 'warning' })
    applyImport(cfg)
    msg.value = '已导入到编辑区，请核对后点保存'; err.value = false
  } catch (e) { err.value = true; msg.value = '导入失败：' + (e instanceof Error ? e.message : String(e)) }
  finally { if (fileInput.value) fileInput.value.value = '' }
}
function applyImport(cfg: YitianRulesConfig) { draft.value = clone(cfg) }

defineExpose({ draft, onSave, onReset, applyImport, addTo, removeAt })
</script>

<template>
  <div v-if="draft" class="yr-card">
    <p class="yr-hint">合规规则超管可配；保存后<strong>立即后端重算</strong>问题工时，无需点「更新数据」。停用某检查 → 该项不再产码。</p>

    <div class="yr-tools">
      <el-button size="small" @click="triggerImport">导入(JSON/Excel)</el-button>
      <el-button size="small" @click="downloadJson(draft)">导出JSON</el-button>
      <el-button size="small" @click="downloadXlsx(draft)">导出Excel</el-button>
      <el-button size="small" @click="onReset">恢复默认</el-button>
      <input ref="fileInput" type="file" accept=".json,.xlsx" style="display:none" @change="onFile" />
    </div>

    <!-- 基础项 -->
    <section class="yr-sec"><h4>基础项</h4>
      <div class="yr-row"><span class="yr-lbl">受检工时类型</span>
        <el-tag v-for="(t,i) in draft.checkedTypes" :key="t" closable @close="removeAt(draft.checkedTypes,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加类型回车" @keyup.enter="(e:any)=>{addTo(draft!.checkedTypes,e.target.value);e.target.value=''}" />
      </div>
      <div class="yr-row"><el-switch v-model="draft.checks.serviceMode.enabled" /><span class="yr-lbl">服务方式检查</span>
        <span class="yr-lbl">生效日</span><el-date-picker v-model="draft.checks.serviceMode.effectiveDate" type="date" value-format="YYYY-MM-DD" size="small" />
      </div>
      <div class="yr-row"><el-switch v-model="draft.checks.customer.enabled" /><span class="yr-lbl">客户名称检查 · 提示词</span>
        <el-tag v-for="(t,i) in draft.checks.customer.hintKeywords" :key="t" closable @close="removeAt(draft.checks.customer.hintKeywords,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.customer.hintKeywords,e.target.value);e.target.value=''}" />
      </div>
      <div class="yr-row"><el-switch v-model="draft.checks.presaleProductHint.enabled" /><span class="yr-lbl">售前产品提示 · 跳过工时类型</span>
        <el-tag v-for="(t,i) in draft.checks.presaleProductHint.skipWorkTypes" :key="t" closable @close="removeAt(draft.checks.presaleProductHint.skipWorkTypes,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.presaleProductHint.skipWorkTypes,e.target.value);e.target.value=''}" />
      </div>
    </section>

    <!-- 必填三段 -->
    <section class="yr-sec"><h4>必填三段</h4>
      <div v-for="seg in (['summary','progress','next'] as const)" :key="seg" class="yr-row">
        <el-switch v-model="draft.checks[seg].enabled" />
        <span class="yr-lbl">{{ { summary:'缺概述', progress:'缺进展', next:'缺下一步' }[seg] }}</span>
        <el-tag v-for="(t,i) in draft.checks[seg].keywords" :key="t" closable @close="removeAt(draft.checks[seg].keywords,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加关键词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks[seg].keywords,e.target.value);e.target.value=''}" />
      </div>
    </section>

    <!-- 类型一致性 -->
    <section class="yr-sec"><h4>类型一致性 <el-switch v-model="draft.checks.typeMismatch.enabled" /></h4>
      <div v-for="wt in Object.keys(draft.checks.typeMismatch.rules)" :key="wt" class="yr-sub">
        <div class="yr-lbl">{{ wt }} <el-button size="small" text @click="addTmRow(wt)">+ 加一行</el-button></div>
        <div v-for="(pair,i) in draft.checks.typeMismatch.rules[wt]" :key="i" class="yr-row">
          <el-input v-model="pair[0]" size="small" placeholder="禁止词" class="yr-cell" />
          <span>→</span>
          <el-input v-model="pair[1]" size="small" placeholder="应归属类型" class="yr-cell" />
          <el-button size="small" text @click="delTmRow(wt,i)">删</el-button>
        </div>
      </div>
    </section>

    <!-- 产品类别 -->
    <section class="yr-sec"><h4>产品类别 <el-switch v-model="draft.checks.product.enabled" /></h4>
      <div class="yr-lbl">产品线关键词 <el-button size="small" text @click="addLineRow">+ 加产品线</el-button></div>
      <div v-for="(e,i) in draft.checks.product.lineKeywords" :key="i" class="yr-row">
        <el-input v-model="e.linePatterns[0]" size="small" placeholder="产品线匹配词(首)" class="yr-cell" />
        <el-input :model-value="e.keywords.join('、')" size="small" placeholder="合法关键词(、分隔)" class="yr-cell-wide"
          @change="(v:string)=>{e.keywords=v.split('、').map(s=>s.trim()).filter(Boolean)}" />
        <el-button size="small" text @click="delLineRow(i)">删</el-button>
      </div>
      <div class="yr-lbl">产品名称复核 <el-button size="small" text @click="addNameRow">+ 加产品名</el-button></div>
      <div v-for="(e,i) in draft.checks.product.nameKeywords" :key="i" class="yr-row">
        <el-input v-model="e.namePatterns[0]" size="small" placeholder="产品名称匹配词(首)" class="yr-cell" />
        <el-input :model-value="e.keywords.join('、')" size="small" placeholder="合法关键词(、分隔)" class="yr-cell-wide"
          @change="(v:string)=>{e.keywords=v.split('、').map(s=>s.trim()).filter(Boolean)}" />
        <el-button size="small" text @click="delNameRow(i)">删</el-button>
      </div>
      <div class="yr-row"><span class="yr-lbl">专属词</span>
        <el-tag v-for="(t,i) in draft.checks.product.exclusiveKws" :key="t" closable @close="removeAt(draft.checks.product.exclusiveKws,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.product.exclusiveKws,e.target.value);e.target.value=''}" />
      </div>
    </section>

    <div class="yr-actions">
      <el-button type="primary" :loading="store.saving" @click="onSave">保存</el-button>
      <span v-if="msg" class="yr-msg" :class="{ 'yr-msg-err': err }">{{ msg }}</span>
    </div>
  </div>
  <div v-else class="yr-card"><el-skeleton :rows="6" animated /></div>
</template>

<style scoped>
.yr-card { display: flex; flex-direction: column; gap: var(--gap-stack); padding: var(--sp-3) var(--sp-4); }
.yr-hint { font-size: var(--fs-2); color: var(--sub); line-height: var(--lh-base); }
.yr-tools { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.yr-sec { border-top: 1px solid var(--line); padding-top: var(--sp-3); }
.yr-sec h4 { font-size: var(--fs-2); color: var(--txt); margin: 0 0 var(--sp-2); display: flex; align-items: center; gap: var(--sp-2); }
.yr-sub { margin-bottom: var(--sp-2); }
.yr-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.yr-lbl { font-size: var(--fs-1); color: var(--sub); }
.yr-add { width: 140px; }
.yr-cell { width: 160px; }
.yr-cell-wide { width: 320px; }
.yr-actions { display: flex; align-items: center; gap: var(--gap-stack); }
.yr-msg { font-size: var(--fs-1); color: var(--ok-text); }
.yr-msg-err { color: var(--danger-text); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- src/components/YitianRulesCard.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/YitianRulesCard.vue frontend/src/components/YitianRulesCard.test.ts
git commit -m "feat(yitian): /data 合规规则配置卡 YitianRulesCard(三组编辑+开关+导入导出)"
```

---

### Task 8: `DataView.vue` 接线（倚天域加规则卡，超管 gate）

**Files:**
- Modify: `frontend/src/views/DataView.vue`（import + auth gate + `el-collapse-item`）
- Test: `frontend/src/views/DataView.test.ts`（若已存在则追加一条；否则最小新建）

**Interfaces:**
- Consumes: `YitianRulesCard`（Task 7）、`useAuthStore`（若 DataView 未引则加）

- [ ] **Step 1: 写/追加测试**

在 `frontend/src/views/DataView.test.ts`（存在则追加，不存在则新建最小版）加：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DataView from './DataView.vue'
import { useAuthStore } from '@/stores/auth'

describe('DataView 倚天合规规则卡', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('超管可见「合规规则配置」折叠项', () => {
    const auth = useAuthStore(); (auth as any).user = { account: 'admin', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }
    const w = mount(DataView, { global: { plugins: [ElementPlus], stubs: { YitianRulesCard: true, YitianScopeCard: true, YitianStoreCard: true } } })
    expect(w.text()).toContain('合规规则配置')
  })
})
```

（若 DataView 依赖较多 store 导致 mount 报错，参照既有 `DataView.test.ts` 的 mock/stub 方式对齐；本步目标仅验证折叠项标题存在。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- src/views/DataView.test.ts`
Expected: FAIL（无「合规规则配置」文案）

- [ ] **Step 3: 改 `DataView.vue`**

import 段加：

```typescript
import YitianRulesCard from '@/components/YitianRulesCard.vue'
```

若未引 auth：`import { useAuthStore } from '@/stores/auth'` 并在 setup 内 `const auth = useAuthStore()`。

在倚天 `el-collapse` 内（`<el-collapse-item name="yitian-scope" ...>` 之前或之后）加：

```vue
          <el-collapse-item v-if="auth.isSuper" name="yitian-rules" title="合规规则配置（超管）">
            <YitianRulesCard />
          </el-collapse-item>
```

（`yitian-scope`/`yitian-store` 若也应仅超管可见，本次不改其现状，仅新卡加 `v-if="auth.isSuper"`——规则 GET 为超管专属，非超管展开会 401。）

- [ ] **Step 4: 跑测试确认通过 + 前端全量**

Run: `cd frontend && npm run test:run -- src/views/DataView.test.ts`
Expected: PASS
Run: `cd frontend && npm run typecheck`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(yitian): /data 倚天域接入合规规则配置卡(超管 gate)"
```

---

### Task 9: 版本 + PROGRESS + 全量验证（收口）

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 版本号**

`frontend/src/version.ts`：`APP_VERSION` 由 `V3.2.3` → `V3.3.0`（Y 级新可配置子系统）；`RELEASE_DATE` → `2026-07-16`。

- [ ] **Step 2: PROGRESS 条目**

在 `PROGRESS.md` 顶部「当前版本」行上方插入 `- 当前版本：**V3.3.0**（Y 级·倚天合规规则前端可配置…）`，并把原 `- 当前版本：**V3.2.3**` 改为 `- 上一版本：**V3.2.3**`。条目写：范围（全三组+开关）、生效（保存即后端重算复用 `_rebuild_yitian_data`）、JSON+Excel 双通道、默认单一来源 `yitian_rules.py`、`check_row(row,peer,cfg)` 重构（默认行为不变，含回归对拍）、新 `yitian_rules_config.py` + `/api/yitian/rules`（超管+审计+先算通再落盘）、`data/yitian_rules.json` gitignore、交付非纯前端（换 dist + 覆盖 `yitian_check.py`/`yitian.py`/`server.py`/新模块 + 重启，无需更新数据）。

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + 后端 pytest + 前端 typecheck/vitest/build）。

若 bash 环境跑 verify.sh 不便，分步：
Run: `python -m pytest -q`（Expected: 全绿）
Run: `cd frontend && npm run typecheck && npm run test:run && npm run build`（Expected: 全绿）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V3.3.0 倚天合规规则前端可配置 + PROGRESS"
```

---

## Self-Review（写计划后自检）

- **Spec 覆盖**：范围全三组（Task 1 default_config 含 A/B/C + Task 2/7 编辑全覆盖）；生效即重算（Task 4 `_rebuild_yitian_data`）；JSON+Excel（Task 5）；页内三组结构化编辑（Task 7）；每检查开关（Task 1 schema `enabled` + Task 2 门控 + Task 7 `el-switch`）；先算通再落盘（Task 4）；超管+审计（Task 4）；gitignore（Task 4）；默认单一来源（Task 1）；`ISSUE_LABELS` 内置（Task 2 仍读 R）；非纯前端交付（Task 9）。无遗漏。
- **占位扫描**：无 TBD/TODO；默认大表由常量装配（真实实现，非占位）。
- **类型一致**：`YitianRulesConfig` 键名（`checkedTypes`/`checks.*`/`linePatterns`/`namePatterns`/`hintKeywords`/`skipWorkTypes`/`exclusiveKws`）在 Task 1(py)/5(ts)/7(vue) 严格一致；`check_row(row,peer,cfg)`、`build_yitian_data(base,store,rules_cfg)`、`_rebuild_yitian_data(store,rules_cfg)`、`getYitianRules/saveYitianRules`、`useYitianRulesStore.{config,load,save,reset}` 跨任务签名一致。
- 版本策略：Y 级（X 才须钦定），已在 Task 9 标注。
```
