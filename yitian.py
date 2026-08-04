# yitian.py
"""倚天工时域:管线组装。

ingest():读 input/yitian/工时.xlsx(白名单列,每周仅含当周数据) → upsert 进累积库
(data/yitian_store.json,按工时ID去重)。input/yitian/工时.xlsx 缺失 → 返回 None,不动累积库。

build_yitian_data():**从累积库**读全量行 → 工号 join input/组织架构.xlsx 花名册 →
工作日/双周标签 → 合规判定(yitian_check) → 码表压缩 → YitianData dict。
累积库为空 → 返回 None(调用方跳过,绝不阻断主管线)。
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import config
import yitian_calendar as CAL
import yitian_check as CHK
import yitian_derive as DRV
import yitian_rules as R
import yitian_rules_config as RCFG
import yitian_store as STORE
from product_category import read_product_categories
from projects import (manager_ids, read_org_roster, read_sheet_by_header, read_sheet_headers,
                      read_top1000)

# ── 工时.xlsx 取列白名单(全表 77 列,只读这 13 个) ──
# 严禁读取:员工电话/员工所在省/员工所在市/员工入职省份/员工入职城市/岗位(个人隐私,不得落盘)。
# 严禁使用:L2/L3/L3-1/L4组织(工时表自带的组织列)——组织权威是 input/组织架构.xlsx。
COL_EMP_ID = "员工编号"
COL_TYPE = "工时类型"
COL_HOURS = "工时"
COL_DATE = "工作日"
COL_CONTENT = "工作成果"
COL_CUSTOMER = "客户"
COL_PROJECT_TYPE = "项目类型"
COL_WORKTYPE3 = "工作类型三"
COL_PRODUCT_LINE = "产研侧产品线"
COL_PRODUCT_NAME = "产研侧产品名称"
COL_WORK_ORDER = "工单编号"
COL_SALES_L2 = "销售L2组织"
COL_SERVICE_MODE = "服务方式"
COL_WID = "工时ID"          # 累积库去重键(实测 540/540 唯一、零空值)

# 白名单列存在性校验用(14 列全列上)。导出端一旦改名/删列,缺列必须报错并跳过倚天段,
# 不能像 dict.get() 那样静默返回 None → "" → 全量误判(如 05-09 后每条 checked 行都吃
# MISS_SERVICE_MODE,合规率崩到个位数却零报错)。
REQUIRED_COLS = [
    COL_EMP_ID, COL_TYPE, COL_HOURS, COL_DATE, COL_CONTENT, COL_CUSTOMER,
    COL_PROJECT_TYPE, COL_WORKTYPE3, COL_PRODUCT_LINE, COL_PRODUCT_NAME,
    COL_WORK_ORDER, COL_SALES_L2, COL_SERVICE_MODE, COL_WID,
]

HOURS_PER_DAY = 8   # 基础工时 = 工作日数 × 8h

STORE_FILE_NAME = "yitian_store.json"


def store_path(base_dir: str) -> str:
    return os.path.join(base_dir, "data", STORE_FILE_NAME)


class _Dim:
    """码表:字符串 → 下标(空串 → None)。同一字符串只存一份,压 JSON 体积。"""

    def __init__(self) -> None:
        self.values: List[str] = []
        self._index: Dict[str, int] = {}

    def idx(self, v) -> Optional[int]:
        s = str(v or "").strip()
        if not s:
            return None
        if s not in self._index:
            self._index[s] = len(self.values)
            self.values.append(s)
        return self._index[s]


def _hours(v) -> float:
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return 0.0


def _missing_columns(path: str) -> List[str]:
    """白名单列(REQUIRED_COLS)存在性校验,返回缺失列名(全齐则 [])。
    仅 read_timesheet() 调用(ingest() 唯一入口是 read_timesheet(),不再各自重复读一遍
    表头 —— 同一份 xlsx 曾经被 open 两次,见 M-7)。导出端一旦改名/删列,能挡住,
    不能像 dict.get() 那样静默返回 None → "" → 全量误判。"""
    headers = read_sheet_headers(path, COL_TYPE)
    return [c for c in REQUIRED_COLS if c not in headers]


def read_timesheet(path: str) -> Optional[List[Dict[str, Any]]]:
    """工时.xlsx → 归一化行(仅白名单列)。表头在第 1 行,按"含工时类型"自动选 sheet。
    工号统一大写、日期统一 YYYY-MM-DD、工时类型已做售前服务校正。
    白名单列缺失(导出端改名/删列) → 打印 [ERROR] 并返回 None(调用方跳过倚天段)。"""
    missing = _missing_columns(path)
    if missing:
        print("[ERROR] 倚天工时表缺列: %s,跳过倚天工时域" % "、".join(missing))
        return None

    raw = read_sheet_by_header(path, COL_TYPE)
    out: List[Dict[str, Any]] = []
    for r in raw:
        d = CAL.parse_date(r.get(COL_DATE))
        project_type = str(r.get(COL_PROJECT_TYPE) or "").strip()
        work_type = CHK.corrected_work_type(project_type, str(r.get(COL_TYPE) or "").strip())
        out.append({
            "wid": str(r.get(COL_WID) or "").strip(),
            "emp_id": str(r.get(COL_EMP_ID) or "").strip().upper(),
            "date": d.isoformat() if d else "",
            "work_type": work_type,
            "hours": _hours(r.get(COL_HOURS)),
            "content": str(r.get(COL_CONTENT) or ""),
            "customer": str(r.get(COL_CUSTOMER) or "").strip(),
            "project_type": project_type,
            "work_type3": str(r.get(COL_WORKTYPE3) or "").strip(),
            "product_line": str(r.get(COL_PRODUCT_LINE) or "").strip(),
            "product_name": str(r.get(COL_PRODUCT_NAME) or "").strip(),
            "work_order": str(r.get(COL_WORK_ORDER) or "").strip(),
            "sales_l2": str(r.get(COL_SALES_L2) or "").strip(),
            "service_mode": str(r.get(COL_SERVICE_MODE) or "").strip(),
        })
    return out


def ingest(base_dir: str) -> Optional[dict]:
    """把 input/yitian/工时.xlsx 的行 upsert 进累积库。
    文件不存在 → None(不动累积库);缺列 → 打 [ERROR] 并 None(不阻断主管线,
    缺列校验唯一发生在 read_timesheet() 内部,不再重复读一遍表头,见 M-7)。
    返回 {"added": 新增, "updated": 更新, "skipped": 无工时ID被跳过, "total": 库内总行数}。
    skipped(I-3):有列无值的行(工时ID 单元格为空)无去重键无法累积,调用方(preprocess_data.py)
    须在 skipped>0 时打 [WARN],不能像早期那样零计数零告警地静默丢行。"""
    input_dir = os.path.join(base_dir, "input")
    ts_path = os.path.join(input_dir, config.YITIAN_DIRNAME, config.YITIAN_TIMESHEET_FILE)
    if not os.path.isfile(ts_path):
        return None

    rows = read_timesheet(ts_path)
    if rows is None:
        return None      # 缺列,read_timesheet() 已打印 [ERROR]

    path = store_path(base_dir)
    store = STORE.load_store(path)
    added, updated, skipped = STORE.upsert_rows(store, rows)
    STORE.save_store(path, store)
    return {"added": added, "updated": updated, "skipped": skipped, "total": len(store["rows"])}


def build_yitian_data(base_dir: str, store: Optional[dict] = None,
                      rules_cfg: Optional[dict] = None) -> Optional[dict]:
    """完整倚天数据 dict,**从累积库构建**(每周导出先 ingest() 进库,这里读全量库)。
    累积库为空 → None(调用方跳过,不阻断主管线)。

    store(可选,I-2):传了就用它(内存中已变更、尚未落盘的累积库),不传才从磁盘读
    (默认行为不变,既有调用方一律不用改)。这是"先算通再落盘"两阶段提交的基础——
    server.py 的两个写端点先在内存里改 store、用它 build 出新数据、校验通过才落盘,
    build/schema 校验失败就不会出现"累积库已改、下发 JSON 还是旧的"三方不一致。"""
    input_dir = os.path.join(base_dir, "input")
    if rules_cfg is None:
        rules_cfg = RCFG.load_config(os.path.join(base_dir, "data", "yitian_rules.json"))
    if store is None:
        store = STORE.load_store(store_path(base_dir))
    rows = store["rows"]
    if not rows:
        return None
    roster = read_org_roster(os.path.join(input_dir, config.ORG_FILE))
    roster_ids = {p["id"] for p in roster}

    # 工号不在花名册(域外/离职)或日期不可解析 → 丢弃;计数供治理可见
    kept = [r for r in rows if r["emp_id"] in roster_ids and r["date"]]
    dropped = len(rows) - len(kept)

    # 路径单独留变量:就绪度要区分「文件不存在」与「文件在但解析出 0 行」——
    # 二者的处置完全不同(前者是没放文件,后者是表头/格式坏了),用同一句
    # 「未提供」会给出事实错误的告警,正是本期要清偿的那类静默/误导降级。
    top1000_path = os.path.join(input_dir, config.TOP1000_FILE)
    pcat_path = os.path.join(input_dir, config.PRODUCT_CATEGORY_FILE)
    top1000 = read_top1000(top1000_path)
    top_names = {n for n, v in top1000.items() if v.get("level") == config.TOP1000_LEVEL}
    # 指名客户数(B-3 覆盖率的分母):取自 TOP1000 清单【全量】,与工时数据无关。
    # 只统计工时里出现过的客户会让分母缩成实际支持数、覆盖率恒 100%,指标失效。
    named_by_bg: Dict[str, int] = {}
    for _n, _v in top1000.items():
        if _v.get("level") != config.TOP1000_LEVEL:
            continue
        _bg = _v.get("bg", "") or "(未标BG)"
        named_by_bg[_bg] = named_by_bg.get(_bg, 0) + 1
    prod_cats = read_product_categories(pcat_path)
    mgr_ids = manager_ids(roster)
    pm_seg = rules_cfg["checks"].get("pmTag", {})
    ph_seg = rules_cfg["checks"].get("placeholder", {})
    line_kws = rules_cfg["checks"]["product"]["lineKeywords"]
    checked = tuple(rules_cfg["checkedTypes"])
    # 校准命中的是 lineKeywords 的匹配短名,产品线的规范值是全称,须解析(见 DRV.canonical_line)。
    # 词库与产品分类表对不上的短名会导致该产品线的校准恒被留白 —— 一次性检查并告警,
    # 不能让它静默发生(实测当前 21 条 linePatterns 全部可唯一解析,该告警应为空)。
    line_vocab = sorted(prod_cats)
    bad_aliases = DRV.unresolved_aliases(line_kws, line_vocab)
    if bad_aliases:
        print("[WARN] 产品词库有 %d 个产品线短名无法在 %s 中唯一定位,其校准结果将被留白: %s"
              % (len(bad_aliases), config.PRODUCT_CATEGORY_FILE, "、".join(bad_aliases)))

    holidays_path = os.path.join(
        input_dir, config.YITIAN_DIRNAME, config.YITIAN_HOLIDAYS_FILE)
    rest, work = CAL.read_holidays(holidays_path)
    # calendar_source 看的是**解析结果**,不是文件在不在 —— 文件在但一行没读懂时同样是
    # fallback。所以判「要不要降级」用它,判「为什么降级」必须另看 dataReadiness.holidays,
    # 否则告警会把「格式没读懂」说成「未提供」(线上实测发生过,用户遂反复重传已在位的文件)。
    calendar_source = "csv" if (rest or work) else "fallback"

    dates = sorted(r["date"] for r in kept)
    days = (CAL.build_days(CAL.parse_date(dates[0]), CAL.parse_date(dates[-1]), rest, work)
            if dates else [])

    peers = CHK.peer_contents(kept)
    d_type, d_wt, d_cu, d_pl, d_pn, d_pt, d_bg, d_sm = (_Dim() for _ in range(8))
    d_quad, d_cbg, d_cat = (_Dim() for _ in range(3))
    entries: List[dict] = []
    issues: List[dict] = []

    # 就绪度累计器(V4.5.4):把此前的静默降级变成可观测指标
    calib = {"pending": 0, "calibrated": 0, "ambiguous": 0, "unmatched": 0}
    unattr_rows = 0
    unattr_hours = 0.0
    seen_lines = set()

    for r in kept:
        # 对每一行都跑判定 —— 是否计入合规率由超管配置的 excludedTypes 决定,前端现算。
        # 后端绝不预判:那等于把"剔除哪些类型"这条口径二次硬编码进数据文件,改配置也不生效。
        # 管理类/业务类/假期类没有必填字段规则,check_row 对它们天然返回空码。
        codes, msgs = CHK.check_row(r, peers.get(r["work_order"], ""), rules_cfg)
        ok = CHK.ok_of(codes)

        # ── V4.5.4 派生字段 ──
        cust = r["customer"]
        t1 = top1000.get(cust) or {}
        quad = t1.get("quad", "")
        eff_line, line_src = DRV.calibrate_line(
            r["product_line"], r["work_type"], r["content"], line_kws, checked, line_vocab)
        pc = prod_cats.get(eff_line) or {}
        eff_cat = pc.get("category", "")
        channel = bool(pc.get("channel"))
        is_pm = DRV.pm_tag(r["work_type"], r["work_type3"], r["content"], pm_seg)
        unknown = DRV.is_placeholder_customer(cust, ph_seg)
        tr = DRV.transferable(unknown, quad, is_pm, channel)

        if r["product_line"].strip():
            seen_lines.add(r["product_line"].strip())
        if r["work_type"] in checked:
            if line_src == DRV.LINE_SRC_CALIBRATED:
                calib["pending"] += 1
                calib["calibrated"] += 1
            elif line_src == DRV.LINE_SRC_AMBIGUOUS:
                calib["pending"] += 1
                calib["ambiguous"] += 1
            elif line_src == DRV.LINE_SRC_UNMATCHED:
                calib["pending"] += 1
                calib["unmatched"] += 1
            if unknown:
                unattr_rows += 1
                unattr_hours += r["hours"]

        entries.append({
            "d": r["date"],
            "e": r["emp_id"],
            "t": d_type.idx(r["work_type"]),
            "h": round(r["hours"], 2),
            "wt": d_wt.idx(r["work_type3"]),
            "cu": d_cu.idx(r["customer"]),
            "pl": d_pl.idx(r["product_line"]),
            "pn": d_pn.idx(r["product_name"]),
            "pt": d_pt.idx(r["project_type"]),
            "sm": d_sm.idx(r["service_mode"]),
            "bg": d_bg.idx(r["sales_l2"]),
            "wo": r["work_order"],
            "top": bool(r["customer"]) and r["customer"] in top_names,
            "ok": ok,
            "iss": codes,
            # 工作成果全文（V4.1.3 起随明细页下发，供整列展示）。此前按隐私裁列、仅问题行
            # 带 120 字摘要(snippet)，用户 2026-07-21 授权开放全文；snippet 保留不动向后兼容。
            "ct": r["content"],
            # ── V4.5.4 派生字段 ──
            "cq": d_quad.idx(quad),
            "cbg": d_cbg.idx(t1.get("bg", "")),
            "el": d_pl.idx(eff_line),      # 复用产品线码表
            "ls": line_src,
            "ec": d_cat.idx(eff_cat),
            "ch": channel,
            "pm": is_pm,
            "tr": tr,
        })
        if ok != 0:
            issues.append({
                "i": len(entries) - 1,
                "codes": codes,
                "msgs": msgs,
                # 只有真问题行(ok=2)才下发 120 字摘要;合规(提示)行(ok=1)不下发正文,
                # 但仍进 issues[](页面要显示它的 codes/msgs),snippet 留空串。
                "snippet": r["content"][:R.SNIPPET_MAX] if ok == 2 else "",
            })

    st = STORE.store_stats(store)
    return {
        "meta": {
            "periodStart": days[0]["d"] if days else None,
            "periodEnd": days[-1]["d"] if days else None,
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "rows": len(entries),
            "employees": len(roster),
            "droppedRows": dropped,
            "calendarSource": calendar_source,
            "hoursPerDay": HOURS_PER_DAY,
            "thisBgL2": list(R.THIS_BG_L2_ORGS),   # 跨BG判定常量随数据下发,前端不重复维护
            "storeRows": st["rows"],               # 累积库覆盖状态(供 /data 展示)
            "storeStart": st["start"],
            "storeEnd": st["end"],
            "top1000Named": named_by_bg,   # 市场BG → 指名客户数(清单全量,B-3 覆盖率分母)
            "dataReadiness": {
                "top1000": {
                    # provided 看文件是否存在,rows 看解析结果 —— 两者分开才能区分
                    # 「没放文件」与「文件在但表头坏了」,告警文案才不会说反。
                    "provided": os.path.isfile(top1000_path),
                    "rows": len(top1000),
                    "matchedCustomers": len({c for c in d_cu.values if c in top1000}),
                    # 有行但象限/BG 全空 → 判定为列缺失(静默降级的唯一可观测信号)
                    "hasQuad": bool(top1000) and any(v.get("quad") for v in top1000.values()),
                    "hasBg": bool(top1000) and any(v.get("bg") for v in top1000.values()),
                },
                "productCategory": {
                    "provided": os.path.isfile(pcat_path),
                    "rows": len(prod_cats),
                    "coveredLines": len([x for x in seen_lines if x in prod_cats]),
                    "totalLines": len(seen_lines),
                },
                "holidays": {
                    # 同 top1000:provided 看文件在不在,rows 看读懂了几行。两者分开,
                    # 「没上传」与「上传了但格式没读懂」才能给出不同的告警文案。
                    "provided": os.path.isfile(holidays_path),
                    "rows": len(rest) + len(work),
                },
                "calibration": dict(calib),
                "unattributed": {"rows": unattr_rows, "hours": round(unattr_hours, 2)},
                "roster": {
                    "hasSupColumn": any(p.get("supId") for p in roster),
                    "managers": len(mgr_ids),
                },
            },
        },
        # supId/supName 只用于在服务端派生 isMgr,**不下发** —— 前端只需要「是不是管理干部」
        # 这一个布尔,没有任何消费方要上下级关系;整张 85 人的汇报链属于不必要的下发面。
        # schema 的 _Base 是 extra="allow",原样透传不会被校验拦住,只能靠这里显式挑键。
        # (dict 的 | 合并是 3.9+,本仓声明支持 3.8,故用 dict(推导式, kw=...) 写法)
        "roster": [dict({k: v for k, v in p.items() if k not in ("supId", "supName")},
                        isMgr=p["id"] in mgr_ids) for p in roster],
        "days": days,
        "dims": {
            "types": d_type.values,
            "workTypes": d_wt.values,
            "customers": d_cu.values,
            "products": d_pl.values,
            "productNames": d_pn.values,
            "projectTypes": d_pt.values,
            "salesL2": d_bg.values,
            "serviceModes": d_sm.values,
            "custQuads": d_quad.values,
            "custBgs": d_cbg.values,
            "prodCats": d_cat.values,
        },
        "entries": entries,
        "issues": issues,
    }
