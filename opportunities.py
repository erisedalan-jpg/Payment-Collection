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
    '商机名称/项目名称': 'name', '预估金额（万元）': 'amountWan', '预估金额(万元)': 'amountWan', '预估落单时间': 'expectedDate',
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
