"""2E 人工数据轻量快照：只备份 project_tags.json + followup_records.json 两小文件，
copy-then-swap 近原子（镜像 data_history.py 的稳妥写法，去掉目录/整份逻辑）。"""
import json
import os
import shutil
from datetime import datetime

BACKUP_DIRNAME = 'manual_backups'
MANIFEST = 'manifest.json'
KEEP = 3
ITEMS = ['data/project_tags.json', 'data/followup_records.json']


def _root(base_dir):
    return os.path.join(base_dir, 'data', BACKUP_DIRNAME)


def _copy_file(src, dst):
    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    tmp = dst + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    shutil.copy2(src, tmp)
    os.replace(tmp, dst)  # 同盘原子覆盖


def _version_ids(base_dir):
    root = _root(base_dir)
    if not os.path.isdir(root):
        return []
    return sorted([d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))])


def _read_manifest(vdir):
    p = os.path.join(vdir, MANIFEST)
    if os.path.isfile(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None
    return None


def backup_manual(base_dir, trigger='import', source_name='', version_id=None):
    """把当前两文件存为新版本，写 manifest，剪枝保 KEEP。返回 manifest。"""
    vid = version_id or datetime.now().strftime('%Y%m%d-%H%M%S')
    vdir = os.path.join(_root(base_dir), vid)
    os.makedirs(vdir, exist_ok=True)
    counts = {}
    for rel in ITEMS:
        src = os.path.join(base_dir, rel)
        if os.path.exists(src):
            _copy_file(src, os.path.join(vdir, os.path.basename(rel)))
    # 统计条数
    tags_p = os.path.join(vdir, 'project_tags.json')
    fu_p = os.path.join(vdir, 'followup_records.json')
    try:
        if os.path.exists(tags_p):
            with open(tags_p, encoding='utf-8') as _f:
                counts['tagProjects'] = len(json.load(_f).get('assignments', {}))
        else:
            counts['tagProjects'] = 0
    except Exception:
        counts['tagProjects'] = 0
    try:
        if os.path.exists(fu_p):
            with open(fu_p, encoding='utf-8') as _f:
                counts['followupCount'] = len(json.load(_f))
        else:
            counts['followupCount'] = 0
    except Exception:
        counts['followupCount'] = 0
    mf = {'id': vid, 'createdAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
          'trigger': trigger, 'sourceName': source_name, **counts}
    with open(os.path.join(vdir, MANIFEST), 'w', encoding='utf-8') as f:
        json.dump(mf, f, ensure_ascii=False, indent=2)
    prune(base_dir)
    return mf


def prune(base_dir, keep=KEEP):
    ids = _version_ids(base_dir)
    removed = []
    for vid in ids[:-keep] if len(ids) > keep else []:
        shutil.rmtree(os.path.join(_root(base_dir), vid), ignore_errors=True)
        removed.append(vid)
    return removed


def list_backups(base_dir):
    return {'versions': [(_read_manifest(os.path.join(_root(base_dir), vid)) or {'id': vid})
                         for vid in reversed(_version_ids(base_dir))]}


def rollback_manual(base_dir, version_id):
    """把某版本两文件覆盖回 live（copy-then-swap）。版本不存在抛 FileNotFoundError。"""
    vdir = os.path.join(_root(base_dir), version_id)
    if not os.path.isdir(vdir):
        raise FileNotFoundError(f'快照版本不存在: {version_id}')
    restored = []
    for rel in ITEMS:
        src = os.path.join(vdir, os.path.basename(rel))
        if os.path.exists(src):
            _copy_file(src, os.path.join(base_dir, rel))
            restored.append(os.path.basename(rel))
    return {'id': version_id, 'restored': restored}
