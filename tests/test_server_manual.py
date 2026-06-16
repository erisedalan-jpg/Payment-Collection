import json
import os
import server


def _seed_analysis(base, monkeypatch):
    af = os.path.join(base, 'analysis_data.json')
    with open(af, 'w', encoding='utf-8') as f:
        json.dump({'projects': [{'projectId': 'P1'}, {'projectId': 'P2'}]}, f, ensure_ascii=False)
    monkeypatch.setattr(server, 'ANALYSIS_FILE', af)


def test_valid_project_ids(tmp_path, monkeypatch):
    _seed_analysis(str(tmp_path), monkeypatch)
    assert server._valid_project_ids() == {'P1', 'P2'}


def test_manual_apply_writes_and_backups(tmp_path, monkeypatch):
    base = str(tmp_path)
    tags_f = os.path.join(base, 'project_tags.json')
    fu_f = os.path.join(base, 'followup_records.json')
    monkeypatch.setattr(server, 'PROJECT_TAGS_FILE', tags_f)
    monkeypatch.setattr(server, 'FOLLOWUP_FILE', fu_f)
    # 预置原文件(供快照)
    json.dump({'version': 1, 'tags': [], 'assignments': {}}, open(tags_f, 'w', encoding='utf-8'))
    json.dump([], open(fu_f, 'w', encoding='utf-8'))
    monkeypatch.setattr(server, 'BASE_DIR', base)
    result = {'tags': {'version': 1, 'tags': [{'name': 'BH项目'}], 'assignments': {'P1': ['BH项目']}},
              'followup': [{'记录编号': 'FU-1', '项目编号': 'P1'}]}
    summary = server._apply_manual_import(result, source_name='x.xlsx')
    assert json.load(open(tags_f, encoding='utf-8'))['assignments'] == {'P1': ['BH项目']}
    assert json.load(open(fu_f, encoding='utf-8'))[0]['记录编号'] == 'FU-1'
    assert summary['backupId']
