"""按 allowedL4 过滤 analysis_data.json(L4 数据隔离,SP-4)。纯函数,可单测,不改入参。"""
from __future__ import annotations

# projectId 键控的业务 dict(按 keep 集裁键)
_PID_KEYED = (
    'projectPmis', 'paymentNodes', 'projectMilestones', 'paymentRecords',
    'projectProfit', 'followupRecords', 'tagSeed',
)


def allowed_project_ids(projects: list, allowed_l4: list, pm_names=None) -> set:
    """orgL4 ∈ allowed_l4 或 项目经理姓名 ∈ pm_names 的项目 id ∪ 其 relatedClosedId。
    allowed_l4 含 '*' → 全部 id(含 relatedClosedId)。pm_names=None/空 → 仅 L4 口径(向后兼容)。"""
    allow = set(allowed_l4 or [])
    star = '*' in allow
    pmset = set(pm_names or ())
    keep: set = set()
    for p in projects or []:
        if not isinstance(p, dict):
            continue
        pid = p.get('projectId')
        if pid is None:
            continue
        org = str(p.get('orgL4') or '').strip()
        pm = str(p.get('projectManager') or '').strip()
        if star or org in allow or (pm and pm in pmset):
            keep.add(pid)
            rel = p.get('relatedClosedId')
            if rel:
                keep.add(rel)
    return keep


def filter_analysis_data(data: dict, allowed_l4: list, pm_names=None) -> dict:
    """返回按 allowed_l4(L4) 与 pm_names(项目经理姓名)并集过滤的新 dict;
    '*' → 原样返回;不改入参 data。pm_names=None/空 → 仅 L4 口径(向后兼容)。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data

    projects = data.get('projects') or []
    keep = allowed_project_ids(projects, allowed_l4, pm_names)   # 含 PM 命中 + relatedClosedId

    out = dict(data)  # 浅拷顶层(透传块随之保留引用)
    out['projects'] = [p for p in projects
                       if isinstance(p, dict) and p.get('projectId') in keep]
    closed = data.get('closedProjects') or []
    out['closedProjects'] = [c for c in closed
                             if isinstance(c, dict) and str(c.get('orgL4') or '').strip() in allow]

    for key in _PID_KEYED:
        d = data.get(key)
        if isinstance(d, dict):
            out[key] = {k: v for k, v in d.items() if k in keep}

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


def scope_yitian_data(data: dict, allowed_l4: list, allowed_staff=None) -> dict:
    """按 allowed_l4(L4) 与 allowed_staff(工号)并集裁倚天数据(roster/entries/issues);
    '*' → 原样返回;不改入参。allowed_staff=None/空 → 仅 L4 口径(向后兼容)。

    工时是员工级敏感数据:非命中员工、其工时行、其问题正文摘要,一律不下发。
    issues[].i 指向 entries 下标——裁行后必须重映射,否则指到别人头上。
    离册工号(不在 roster)自动不命中——即「工号 ∩ 花名册」的防脏值。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data
    staff = set(allowed_staff or ())

    roster = data.get('roster') or []
    keep_roster = [p for p in roster
                   if isinstance(p, dict) and (
                       str(p.get('l4') or '').strip() in allow or p.get('id') in staff)]
    keep_ids = {p.get('id') for p in keep_roster}

    entries = data.get('entries') or []
    old_to_new = {}
    keep_entries = []
    for i, e in enumerate(entries):
        if isinstance(e, dict) and e.get('e') in keep_ids:
            old_to_new[i] = len(keep_entries)
            keep_entries.append(e)

    issues = data.get('issues') or []
    keep_issues = []
    for it in issues:
        if not isinstance(it, dict):
            continue
        ni = old_to_new.get(it.get('i'))
        if ni is None:
            continue
        nit = dict(it)
        nit['i'] = ni
        keep_issues.append(nit)

    out = dict(data)               # 浅拷顶层(days/dims 无个人信息,原样透传)
    out['roster'] = keep_roster
    out['entries'] = keep_entries
    out['issues'] = keep_issues

    meta = data.get('meta')
    if isinstance(meta, dict):
        nm = dict(meta)
        nm['rows'] = len(keep_entries)
        nm['employees'] = len(keep_roster)
        out['meta'] = nm

    return out
