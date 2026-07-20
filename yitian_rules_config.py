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
            "serviceMode": {"enabled": True, "keywords": _re_to_keywords(R.SERVICE_MODE_RE),
                            "effectiveDate": R.SERVICE_MODE_EFFECTIVE_DATE},
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
        d["checks"]["serviceMode"] = {
            "enabled": _bool(sm.get("enabled", True), "serviceMode.enabled"),
            "keywords": _norm_str_list(sm.get("keywords", d["checks"]["serviceMode"]["keywords"]),
                                       "serviceMode.keywords"),
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
