"""2E 人工数据导入：强校验 + 构建标签/跟进两 store（纯函数，无 I/O，便于单测）。"""

TAG_HEADERS = ['项目编号', '项目名称', '标签']
FOLLOWUP_HEADERS = ['记录编号', '项目编号', '项目名称', '跟进人', '跟进类型', '跟进内容',
                    '跟进状态', '下次跟进计划日期', '跟进时间']
TAG_SPLIT = '、'


def _err(sheet, row, message, col=None):
    e = {'sheet': sheet, 'row': row, 'message': message}
    if col is not None:
        e['col'] = col
    return e


def _headers_ok(matrix, expected):
    if not matrix:
        return False
    head = [str(c).strip() for c in matrix[0][:len(expected)]]
    return head == expected


def _build_tags(matrix, valid_ids, errors):
    """项目标签 sheet → {version,tags,assignments}。表头已校验。"""
    assignments = {}
    seen = []  # 保序去重的标签名
    for i, raw in enumerate(matrix[1:], start=2):  # row 从 2 起（表头为 1）
        pid = str(raw[0]).strip() if len(raw) > 0 else ''
        if not pid:
            continue  # 整行空跳过
        if pid not in valid_ids:
            errors.append(_err('项目标签', i, f'未知项目编号 {pid}', '项目编号'))
            continue
        tag_cell = str(raw[2]).strip() if len(raw) > 2 else ''
        tags = [t.strip() for t in tag_cell.split(TAG_SPLIT) if t.strip()] if tag_cell else []
        if tags:
            assignments[pid] = tags
            for t in tags:
                if t not in seen:
                    seen.append(t)
    return {'version': 1, 'tags': [{'name': t} for t in seen], 'assignments': assignments}


def _build_followup(matrix, valid_ids, today_str, now_str, types, statuses, errors):
    """跟进记录 sheet → records list。表头已校验。"""
    provided = set()
    for raw in matrix[1:]:
        rid = str(raw[0]).strip() if len(raw) > 0 else ''
        if rid:
            provided.add(rid)
    seq = [1]

    def next_id():
        while True:
            rid = f'FU-{today_str}-{seq[0]:04d}'
            seq[0] += 1
            if rid not in provided:
                return rid

    records = []
    for i, raw in enumerate(matrix[1:], start=2):
        def g(j):
            return str(raw[j]).strip() if len(raw) > j else ''
        pid, name, person, ftype, content, status = g(1), g(2), g(3), g(4), g(5), g(6)
        if not any([g(0), pid, person, ftype, content, status]):
            continue  # 整行空跳过
        if pid not in valid_ids:
            errors.append(_err('跟进记录', i, f'未知项目编号 {pid}', '项目编号'))
            continue
        if not person:
            errors.append(_err('跟进记录', i, '跟进人必填', '跟进人'))
        elif len(person) > 20:
            errors.append(_err('跟进记录', i, '跟进人超过 20 字', '跟进人'))
        if ftype not in types:
            errors.append(_err('跟进记录', i, f'跟进类型非法: {ftype}', '跟进类型'))
        if not content:
            errors.append(_err('跟进记录', i, '跟进内容必填', '跟进内容'))
        elif len(content) > 500:
            errors.append(_err('跟进记录', i, '跟进内容超过 500 字', '跟进内容'))
        if status not in statuses:
            errors.append(_err('跟进记录', i, f'跟进状态非法: {status}', '跟进状态'))
        records.append({
            '记录编号': g(0) or '', '项目编号': pid, '项目名称': name, '跟进人': person,
            '跟进类型': ftype, '跟进内容': content, '跟进状态': status,
            '下次跟进计划日期': g(7), '跟进时间': g(8),
        })
    # 自动补编号/时间（仅在无错时此结果才被采用；有错也无妨，调用方丢弃）
    for r in records:
        if not r['记录编号']:
            r['记录编号'] = next_id()
        if not r['跟进时间']:
            r['跟进时间'] = now_str
    return records


def validate_and_build(sheets, valid_ids, today_str, now_str, types, statuses):
    """sheets: {'项目标签'?: [[...]], '跟进记录'?: [[...]]}（含表头行）。
    返回 (errors, result)：errors=[{sheet,row,message,col?}]；result={'tags':store|None,'followup':list|None}。
    errors 非空 → result=None（整体不写）。"""
    errors = []
    valid_ids = set(valid_ids)
    tag_m = sheets.get('项目标签')
    fu_m = sheets.get('跟进记录')
    if tag_m is not None and not _headers_ok(tag_m, TAG_HEADERS):
        errors.append(_err('项目标签', 1, f'sheet 表头不符，应为 {TAG_HEADERS}'))
    if fu_m is not None and not _headers_ok(fu_m, FOLLOWUP_HEADERS):
        errors.append(_err('跟进记录', 1, f'sheet 表头不符，应为 {FOLLOWUP_HEADERS}'))
    if errors:
        return errors, None
    tags_store = _build_tags(tag_m, valid_ids, errors) if tag_m is not None else None
    fu_records = _build_followup(fu_m, valid_ids, today_str, now_str, types, statuses, errors) if fu_m is not None else None
    if errors:
        return errors, None
    return [], {'tags': tags_store, 'followup': fu_records}
