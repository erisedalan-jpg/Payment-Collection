import json
import os

import pytest

import manual_history as mh


def _seed(base):
    os.makedirs(os.path.join(base, 'data'), exist_ok=True)
    with open(os.path.join(base, 'data', 'project_tags.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'tags': [], 'assignments': {'P1': ['BH项目']}}, f, ensure_ascii=False)
    with open(os.path.join(base, 'data', 'followup_records.json'), 'w', encoding='utf-8') as f:
        json.dump([{'记录编号': 'FU-1'}], f, ensure_ascii=False)


def test_backup_creates_version_with_manifest(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mf = mh.backup_manual(base, trigger='import', source_name='x.xlsx')
    vdir = os.path.join(base, 'data', 'manual_backups', mf['id'])
    assert os.path.isfile(os.path.join(vdir, 'project_tags.json'))
    assert os.path.isfile(os.path.join(vdir, 'followup_records.json'))
    assert mf['trigger'] == 'import' and mf['sourceName'] == 'x.xlsx'


def test_prune_keeps_three(tmp_path):
    base = str(tmp_path)
    _seed(base)
    ids = []
    for i in range(5):
        ids.append(mh.backup_manual(base, trigger='import', source_name=f'{i}', version_id=f'20260616-00000{i}')['id'])
    listed = [v['id'] for v in mh.list_backups(base)['versions']]
    assert len(listed) == 3
    assert ids[0] not in listed and ids[4] in listed


def test_rollback_restores(tmp_path):
    base = str(tmp_path)
    _seed(base)
    vid = mh.backup_manual(base, trigger='import', source_name='x')['id']
    # 改 live
    with open(os.path.join(base, 'data', 'project_tags.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'tags': [], 'assignments': {'P9': ['改了']}}, f, ensure_ascii=False)
    mh.rollback_manual(base, vid)
    with open(os.path.join(base, 'data', 'project_tags.json'), encoding='utf-8') as f:
        assert json.load(f)['assignments'] == {'P1': ['BH项目']}
    # 无 .tmp 残渣
    vdir = os.path.join(base, 'data', 'manual_backups', vid)
    assert not any(n.endswith('.tmp') for n in os.listdir(os.path.join(base, 'data')))


def test_rollback_rejects_path_traversal(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mh.backup_manual(base, trigger='import', source_name='x')
    # 在 base 上一级放一个同名诱饵目录，含可被覆盖的同名文件——穿越成功就会写坏它
    bait = os.path.join(base, 'bait')
    os.makedirs(bait, exist_ok=True)
    with open(os.path.join(bait, 'project_tags.json'), 'w', encoding='utf-8') as f:
        json.dump({'sentinel': True}, f)
    for bad in ['../bait', '../../etc', 'a/b', '..', '.', '', 'foo/..', os.path.join('..', 'bait')]:
        with pytest.raises(FileNotFoundError):
            mh.rollback_manual(base, bad)
    # 诱饵文件未被覆盖
    with open(os.path.join(bait, 'project_tags.json'), encoding='utf-8') as f:
        assert json.load(f) == {'sentinel': True}
