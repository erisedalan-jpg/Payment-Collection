# yitian_calendar.py
"""倚天工时域:工作日与双周口径(年度无关,不写死任何年份)。纯函数,可单测。

工作日 = (周一~周五 且 不在「休」) 或 (在「班」)。「休」「班」来自 input/yitian/holidays.csv。
双周口径:isoWeek = ISO 自然周(周一~周日);calcWeek = 倚天计算周(上周五~本周四)。
"""
from __future__ import annotations

import csv
import io
import os
from datetime import date, datetime, timedelta
from typing import List, Optional, Set, Tuple

REST = "休"   # 法定假日/调休放假(即使是周一~周五)
WORK = "班"   # 调休上班日(即使是周六/周日)


def parse_date(s) -> Optional[date]:
    """'2026-04-17' / '2026/04/17' / '2026-04-17 00:00:00' / datetime / date → date;不可解析 → None。"""
    if isinstance(s, datetime):
        return s.date()
    if isinstance(s, date):
        return s
    t = str(s or "").strip()
    if not t:
        return None
    t = t.split(" ")[0].replace("/", "-")
    try:
        return datetime.strptime(t, "%Y-%m-%d").date()
    except ValueError:
        return None


def read_holidays(path: str) -> Tuple[Set[date], Set[date]]:
    """holidays.csv(表头 日期,类型) → (休集合, 班集合)。
    文件缺失/不可读/编码不认 → (set(), set())(降级为纯周一~周五);坏行静默跳过。

    编码容错(线上事故根因):中文 Excel「另存为 CSV」在中文 Windows 默认存 GBK/ANSI。
    原实现只按 utf-8-sig 读,遇 GBK 文件抛 UnicodeDecodeError —— 而该异常会穿透
    build_yitian_data、被 preprocess 的 try/except 静默吞掉,整个倚天域不重建
    (表现:/yitian/detail「工作成果」列全空,且「更新数据」看似成功)。这里先按
    utf-8-sig 严格解,失败回退 gb18030(GBK/GB2312 超集);两者都不认才降级为空集。"""
    rest: Set[date] = set()
    work: Set[date] = set()
    if not os.path.isfile(path):
        return rest, work
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError:
        return set(), set()
    text: Optional[str] = None
    for enc in ("utf-8-sig", "gb18030"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        return set(), set()
    for row in csv.DictReader(io.StringIO(text)):
        d = parse_date(row.get("日期"))
        if d is None:
            continue
        kind = str(row.get("类型") or "").strip()
        if kind == REST:
            rest.add(d)
        elif kind == WORK:
            work.add(d)
    return rest, work


def is_workday(d: date, rest: Set[date], work: Set[date]) -> bool:
    """「班」优先于「休」(同日两标以上班为准),其次「休」,再次周一~周五。"""
    if d in work:
        return True
    if d in rest:
        return False
    return d.weekday() < 5


def iso_week(d: date) -> str:
    """ISO 自然周标签,如 2026-W16。"""
    y, w, _ = d.isocalendar()
    return "%d-W%02d" % (y, w)


def calc_week(d: date) -> str:
    """倚天计算周(上周五~本周四)标签,如 2026-CW17。
    做法:把日期向后推到最近的周四,取该周四的 ISO 周序 —— 周五/六/日 推到下周四,周一~周四推到本周四。
    不依赖任何写死的 W1..W52 表,跨年自动正确。"""
    wd = d.weekday()                       # Mon=0 ... Sun=6
    delta = (3 - wd) if wd <= 3 else (10 - wd)
    thu = d + timedelta(days=delta)
    y, w, _ = thu.isocalendar()
    return "%d-CW%02d" % (y, w)


def build_days(start: date, end: date, rest: Set[date], work: Set[date]) -> List[dict]:
    """[start, end] 闭区间逐日 → [{"d","workday","isoWeek","calcWeek"}]。"""
    out: List[dict] = []
    d = start
    while d <= end:
        out.append({
            "d": d.isoformat(),
            "workday": is_workday(d, rest, work),
            "isoWeek": iso_week(d),
            "calcWeek": calc_week(d),
        })
        d += timedelta(days=1)
    return out
