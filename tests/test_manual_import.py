import manual_import as mi

TYPES = ['电话沟通', '邮件推动', '现场拜访', '内部协调', '合同确认', '里程碑跟进', '回款确认', '其他']
STATUSES = ['跟进中', '已解决', '暂停跟进', '需升级处理', '已取消']
VALID = {'P1', 'P2'}

TAG_HDR = ['项目编号', '项目名称', '标签']
FU_HDR = ['记录编号', '项目编号', '项目名称', '跟进人', '跟进类型', '跟进内容', '跟进状态', '下次跟进计划日期', '跟进时间']


def test_valid_tags_replace_build():
    sheets = {'项目标签': [TAG_HDR, ['P1', '甲', 'BH项目、框架合同'], ['P2', '乙', '']]}
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert errors == []
    store = result['tags']
    assert store['assignments']['P1'] == ['BH项目', '框架合同']
    assert 'P2' not in store['assignments'] or store['assignments']['P2'] == []
    assert {t['name'] for t in store['tags']} == {'BH项目', '框架合同'}
    assert result['followup'] is None  # 未含跟进 sheet


def test_valid_followup_autogen_id_and_time():
    sheets = {'跟进记录': [FU_HDR,
        ['', 'P1', '甲', '张三', '邮件推动', '催款', '跟进中', '', ''],
        ['FU-20260616-0005', 'P2', '乙', '李四', '电话沟通', '已联系', '已解决', '2026-07-01', '2026-06-16 09:00:00']]}
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert errors == []
    recs = result['followup']
    assert recs[0]['记录编号'].startswith('FU-20260616-')  # 空→自动生成
    assert recs[0]['跟进时间'] == '2026-06-16 10:00:00'      # 空→填 now
    assert recs[1]['记录编号'] == 'FU-20260616-0005'         # 已有保留
    assert recs[0]['记录编号'] != recs[1]['记录编号']        # 自动生成避开已有


def test_errors_unknown_project_enum_length():
    sheets = {
        '项目标签': [TAG_HDR, ['P9', '?', 'X']],  # 未知项目
        '跟进记录': [FU_HDR,
            ['', 'P1', '甲', '张', '不存在类型', '内容', '跟进中', '', ''],   # 类型越界
            ['', 'P1', '甲', '张', '邮件推动', '', '在建', '', ''],          # 内容空 + 状态越界
        ],
    }
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert result is None  # 有错→不构建
    msgs = ' '.join(e['message'] for e in errors)
    assert '未知项目编号' in msgs and 'P9' in msgs
    assert '跟进类型' in msgs and '跟进状态' in msgs and '跟进内容' in msgs
    # 每条错误带 sheet/row
    assert all('sheet' in e and 'row' in e for e in errors)


def test_bad_header_reports():
    sheets = {'项目标签': [['编号', '名'], ['P1', '甲']]}  # 表头不符
    errors, result = mi.validate_and_build(sheets, VALID, '20260616', '2026-06-16 10:00:00', TYPES, STATUSES)
    assert result is None
    assert any('表头' in e['message'] for e in errors)
