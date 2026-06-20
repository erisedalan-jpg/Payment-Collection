"""按 allowedL4 过滤 analysis_data.json(L4 数据隔离,SP-4)。纯函数,可单测,不改入参。"""
from __future__ import annotations

# projectId 键控的业务 dict(按 keep 集裁键)
_PID_KEYED = (
    'projectPmis', 'paymentNodes', 'projectMilestones', 'paymentRecords',
    'projectProfit', 'naguanMap', 'naguanExclude', 'followupRecords',
    'tagSeed',
)


def allowed_project_ids(projects: list, allowed_l4: list) -> set:
    """orgL4 ∈ allowed_l4 的项目 id ∪ 其 relatedClosedId。allowed_l4 含 '*' → 全部 id(含 relatedClosedId)。"""
    allow = set(allowed_l4 or [])
    star = '*' in allow
    keep: set = set()
    for p in projects or []:
        if not isinstance(p, dict):
            continue
        pid = p.get('projectId')
        if pid is None:
            continue
        org = str(p.get('orgL4') or '').strip()
        if star or org in allow:
            keep.add(pid)
            rel = p.get('relatedClosedId')
            if rel:
                keep.add(rel)
    return keep


def filter_analysis_data(data: dict, allowed_l4: list) -> dict:
    """返回按 allowed_l4 过滤的新 dict;'*' → 原样返回;不改入参 data。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data

    projects = data.get('projects') or []
    keep = allowed_project_ids(projects, allowed_l4)

    out = dict(data)  # 浅拷顶层(透传块随之保留引用)
    out['projects'] = [p for p in projects
                       if isinstance(p, dict) and str(p.get('orgL4') or '').strip() in allow]
    closed = data.get('closedProjects') or []
    out['closedProjects'] = [c for c in closed
                             if isinstance(c, dict) and str(c.get('orgL4') or '').strip() in allow]

    for key in _PID_KEYED:
        d = data.get(key)
        if isinstance(d, dict):
            out[key] = {k: v for k, v in d.items() if k in keep}

    ov = data.get('projectOverview')
    if isinstance(ov, dict):
        new_ov = dict(ov)
        new_ov['projects'] = [p for p in (ov.get('projects') or [])
                              if isinstance(p, dict) and p.get('projectId') in keep]
        out['projectOverview'] = new_ov

    events = data.get('events')
    if isinstance(events, list):
        out['events'] = [e for e in events if isinstance(e, dict) and e.get('projectId') in keep]

    meta = data.get('meta')
    if isinstance(meta, dict):
        nm = dict(meta)
        nm['totalProjects'] = len(out['projects'])
        nm['totalClosed'] = len(out['closedProjects'])
        pn = out.get('paymentNodes')
        nm['totalPaymentNodes'] = (
            sum(len(v) for v in pn.values() if isinstance(v, list)) if isinstance(pn, dict) else 0
        )
        out['meta'] = nm

    return out
