# yitian.py
"""倚天工时域:管线组装。

读 input/yitian/工时.xlsx(白名单列) → 工号 join input/组织架构.xlsx 花名册 → 工作日/双周标签
→ 合规判定(yitian_check) → 码表压缩 → YitianData dict。
input/yitian/工时.xlsx 缺失 → 返回 None(调用方跳过,绝不阻断主管线)。
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import config
import yitian_calendar as CAL
import yitian_check as CHK
import yitian_rules as R
from projects import read_org_roster, read_sheet_by_header, read_sheet_headers, read_top1000

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

# 白名单列存在性校验用(13 列全列上)。导出端一旦改名/删列,缺列必须报错并跳过倚天段,
# 不能像 dict.get() 那样静默返回 None → "" → 全量误判(如 05-09 后每条 checked 行都吃
# MISS_SERVICE_MODE,合规率崩到个位数却零报错)。
REQUIRED_COLS = [
    COL_EMP_ID, COL_TYPE, COL_HOURS, COL_DATE, COL_CONTENT, COL_CUSTOMER,
    COL_PROJECT_TYPE, COL_WORKTYPE3, COL_PRODUCT_LINE, COL_PRODUCT_NAME,
    COL_WORK_ORDER, COL_SALES_L2, COL_SERVICE_MODE,
]

HOURS_PER_DAY = 8   # 基础工时 = 工作日数 × 8h


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


def read_timesheet(path: str) -> Optional[List[Dict[str, Any]]]:
    """工时.xlsx → 归一化行(仅白名单列)。表头在第 1 行,按"含工时类型"自动选 sheet。
    工号统一大写、日期统一 YYYY-MM-DD、工时类型已做售前服务校正。
    白名单列缺失(导出端改名/删列) → 打印 [ERROR] 并返回 None(调用方跳过倚天段)。"""
    headers = read_sheet_headers(path, COL_TYPE)
    missing = [c for c in REQUIRED_COLS if c not in headers]
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


def build_yitian_data(base_dir: str) -> Optional[dict]:
    """完整倚天数据 dict;input/yitian/工时.xlsx 缺失 → None。"""
    input_dir = os.path.join(base_dir, "input")
    ts_path = os.path.join(input_dir, config.YITIAN_DIRNAME, config.YITIAN_TIMESHEET_FILE)
    if not os.path.isfile(ts_path):
        return None

    rows = read_timesheet(ts_path)
    if rows is None:
        return None
    roster = read_org_roster(os.path.join(input_dir, config.ORG_FILE))
    roster_ids = {p["id"] for p in roster}

    # 工号不在花名册(域外/离职)或日期不可解析 → 丢弃;计数供治理可见
    kept = [r for r in rows if r["emp_id"] in roster_ids and r["date"]]
    dropped = len(rows) - len(kept)

    top1000 = read_top1000(os.path.join(input_dir, config.TOP1000_FILE))
    top_names = {n for n, v in top1000.items() if v.get("level") == config.TOP1000_LEVEL}

    rest, work = CAL.read_holidays(
        os.path.join(input_dir, config.YITIAN_DIRNAME, config.YITIAN_HOLIDAYS_FILE))
    calendar_source = "csv" if (rest or work) else "fallback"

    dates = sorted(r["date"] for r in kept)
    days = (CAL.build_days(CAL.parse_date(dates[0]), CAL.parse_date(dates[-1]), rest, work)
            if dates else [])

    peers = CHK.peer_contents(kept)
    d_type, d_wt, d_cu, d_pl, d_pn, d_pt, d_bg, d_sm = (_Dim() for _ in range(8))
    entries: List[dict] = []
    issues: List[dict] = []

    for r in kept:
        # 对每一行都跑判定 —— 是否计入合规率由超管配置的 excludedTypes 决定,前端现算。
        # 后端绝不预判:那等于把"剔除哪些类型"这条口径二次硬编码进数据文件,改配置也不生效。
        # 管理类/业务类/假期类没有必填字段规则,check_row 对它们天然返回空码。
        codes, msgs = CHK.check_row(r, peers.get(r["work_order"], ""))
        ok = CHK.ok_of(codes)
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
        },
        "roster": roster,
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
        },
        "entries": entries,
        "issues": issues,
    }
