# yitian_store.py
"""倚天工时累积库:每周导出一份"当周工时" → 按工时ID upsert 累积成长期数据集。

为什么要它:倚天导出是当周快照,一次只有一周的行。要做长期趋势/累计分析,必须把历次导入攒起来。
去重键 = 工时ID(实测 540/540 唯一、零空值)。重复导入同一批 → 覆盖更新
(员工事后补填/修正了工作成果,重导一遍即可修正历史;重复导同一文件也不会变双份)。

本库是**服务端私有**(含工作成果全文,供规则变更后重新判定),绝不下发前端;
下发给前端的仍是 data/yitian_data.json(隐私裁列 + 仅问题行带摘要)。
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Tuple

STORE_VERSION = 1


def empty_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "rows": []}


def load_store(path: str) -> Dict[str, Any]:
    """读累积库;缺失/损坏/结构不对/版本不识别 → 空库(降级不阻断)。
    版本检查(M-3):STORE_VERSION 曾经写而不读,行结构一改老库就会以 KeyError
    形式在别处炸;这里把它变成一条真校验,不识别的版本当空库处理并打 [WARN]。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return empty_store()
    if not isinstance(data, dict) or not isinstance(data.get("rows"), list):
        return empty_store()
    version = data.get("version", STORE_VERSION)
    if version != STORE_VERSION:
        print("[WARN] 倚天工时累积库版本不识别(文件版本 %r,当前程序版本 %r),当空库处理"
              % (version, STORE_VERSION))
        return empty_store()
    return {"version": version, "rows": data["rows"]}


def save_store(path: str, store: Dict[str, Any]) -> None:
    """原子写(先写 .tmp 再 replace),避免并发/崩溃留半截坏文件。"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def upsert_rows(store: Dict[str, Any], rows: List[dict]) -> Tuple[int, int, int]:
    """按 wid(工时ID)upsert 进 store(就地改)。返回 (新增数, 更新数, 跳过数)。

    无 wid 的行跳过(没有去重键就无法保证不重复累积)——但 skipped 必须被调用方看见
    (I-3):REQUIRED_COLS 只保证列存在,挡不住单元格为空;曾经零计数零告警地静默丢行,
    总工时/饱和度/合规率分母悄悄变小却毫无痕迹。
    已存库里若混入非 dict 脏行(M-2,如手工改坏的 json),建索引时跳过、不崩。"""
    index: Dict[str, int] = {}
    for i, r in enumerate(store["rows"]):
        if not isinstance(r, dict):
            continue
        wid = str(r.get("wid") or "")
        if wid:
            index[wid] = i

    added = 0
    updated = 0
    skipped = 0
    for r in rows:
        wid = str(r.get("wid") or "").strip()
        if not wid:
            skipped += 1
            continue
        if wid in index:
            store["rows"][index[wid]] = r
            updated += 1
        else:
            index[wid] = len(store["rows"])
            store["rows"].append(r)
            added += 1
    return added, updated, skipped


def store_stats(store: Dict[str, Any]) -> Dict[str, Any]:
    """累积状态:行数 + 覆盖的日期区间(供 /data 展示,否则管理员不知道库里有什么)。
    脏行(M-2,非 dict 元素)跳过,不参与日期区间计算但仍计入行数——不能让端点 500。"""
    dates = sorted(str(r.get("date") or "") for r in store["rows"]
                    if isinstance(r, dict) and r.get("date"))
    return {
        "rows": len(store["rows"]),
        "start": dates[0] if dates else None,
        "end": dates[-1] if dates else None,
    }


def delete_range(store: Dict[str, Any], start: str, end: str) -> int:
    """删除 date ∈ [start, end] 闭区间的行(就地改)。返回删除数。
    脏行(M-2,非 dict 元素)没有 date 可比较,原样保留、不崩。"""
    before = len(store["rows"])
    store["rows"] = [r for r in store["rows"]
                     if not (isinstance(r, dict) and start <= str(r.get("date") or "") <= end)]
    return before - len(store["rows"])


def clear_store(path: str) -> None:
    """清空累积库(误导入的回退手段之一)。"""
    save_store(path, empty_store())
