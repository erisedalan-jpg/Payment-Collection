"""数据历史版本化与回滚。
每次"更新数据"成功后存一份完整数据快照(产出+源),按处理次数留最近 KEEP 份,支持回滚与撤销。
与 data/snapshots/(Phase P3 项目域日 diff)无关;本模块所有路径相对 base_dir。
"""
import json
import os
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional

HISTORY_DIRNAME = "history"
PRE_ROLLBACK = "_pre_rollback"
KEEP = 3
MANIFEST = "manifest.json"

# 一份"数据"= 这些 live 项(相对 base_dir);缺失项跳过,不报错。
# 不含 followup_records.json(用户数据)与 analysis_data.js(旧前端遗留)。
LIVE_ITEMS = [
    ("data/analysis_data.json", "file"),
    ("data/events.json", "file"),
    ("data/snapshots", "dir"),
    ("yundocs_data", "dir"),
    ("input", "dir"),
]


def _history_root(base_dir: str) -> str:
    return os.path.join(base_dir, "data", HISTORY_DIRNAME)


def _dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _copy_item(src: str, dst: str, kind: str) -> None:
    """把项复制到 dst(已知 src 存在)。file 直接 copy2;dir 整目录 copytree(dst 先清)。"""
    if kind == "file":
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    else:
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)


def _snapshot_live_into(base_dir: str, dest_dir: str) -> List[str]:
    """把当前 LIVE_ITEMS 存在项复制进 dest_dir,返回顶层名列表。"""
    os.makedirs(dest_dir, exist_ok=True)
    saved = []
    for rel, kind in LIVE_ITEMS:
        src = os.path.join(base_dir, rel)
        if not os.path.exists(src):
            continue
        _copy_item(src, os.path.join(dest_dir, os.path.basename(rel)), kind)
        saved.append(os.path.basename(rel))
    return saved


def _restore_into_live(base_dir: str, src_dir: str) -> List[str]:
    """把 src_dir 内各项(按 LIVE_ITEMS 映射)覆盖回 base_dir 的 live 位置。返回已还原名列表。"""
    restored = []
    for rel, kind in LIVE_ITEMS:
        src = os.path.join(src_dir, os.path.basename(rel))
        if not os.path.exists(src):
            continue
        _copy_item(src, os.path.join(base_dir, rel), kind)
        restored.append(os.path.basename(rel))
    return restored


def _read_meta(base_dir: str) -> Dict[str, Any]:
    try:
        with open(os.path.join(base_dir, "data", "analysis_data.json"), encoding="utf-8") as f:
            return json.load(f).get("meta") or {}
    except (OSError, ValueError):
        return {}


def _read_manifest(version_dir: str) -> Optional[Dict[str, Any]]:
    try:
        with open(os.path.join(version_dir, MANIFEST), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _version_ids(base_dir: str) -> List[str]:
    root = _history_root(base_dir)
    if not os.path.isdir(root):
        return []
    ids = [d for d in os.listdir(root)
           if d != PRE_ROLLBACK and os.path.isdir(os.path.join(root, d))]
    return sorted(ids, reverse=True)   # id=时间戳,字典序=时间序


def archive_version(base_dir: str, version_id: Optional[str] = None) -> Dict[str, Any]:
    """把当前 LIVE 状态存为新历史版本,写 manifest,剪枝保 KEEP 份。返回 manifest。"""
    version_id = version_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(_history_root(base_dir), version_id)
    if os.path.exists(dest):
        shutil.rmtree(dest)
    contents = _snapshot_live_into(base_dir, dest)
    meta = _read_meta(base_dir)
    manifest = {
        "id": version_id,
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "trigger": "reprocess",
        "projectCount": int(meta.get("totalProjects") or 0),
        "paymentNodeCount": int(meta.get("totalPaymentNodes") or 0),
        "dataLastUpdate": meta.get("lastUpdate") or "-",
        "sizeBytes": _dir_size(dest),
        "contents": contents,
    }
    with open(os.path.join(dest, MANIFEST), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    prune(base_dir, KEEP)
    return manifest


def list_versions(base_dir: str) -> Dict[str, Any]:
    root = _history_root(base_dir)
    versions = [(_read_manifest(os.path.join(root, vid)) or {"id": vid})
                for vid in _version_ids(base_dir)]
    return {"versions": versions, "preRollback": _read_manifest(os.path.join(root, PRE_ROLLBACK))}


def prune(base_dir: str, keep: int = KEEP) -> List[str]:
    """删超出 keep 的最旧版本目录(不含 _pre_rollback)。返回被删 id。"""
    removed = []
    for vid in _version_ids(base_dir)[keep:]:
        shutil.rmtree(os.path.join(_history_root(base_dir), vid), ignore_errors=True)
        removed.append(vid)
    return removed


def rollback(base_dir: str, version_id: str) -> Dict[str, Any]:
    """回滚:①备份当前到 _pre_rollback ②覆盖回 live ③中途失败从备份回退并抛错。"""
    root = _history_root(base_dir)
    src = os.path.join(root, version_id)
    if not os.path.isdir(src):
        raise FileNotFoundError(f"历史版本不存在: {version_id}")
    pre = os.path.join(root, PRE_ROLLBACK)
    if os.path.exists(pre):
        shutil.rmtree(pre)
    saved = _snapshot_live_into(base_dir, pre)
    with open(os.path.join(pre, MANIFEST), "w", encoding="utf-8") as f:
        json.dump({"id": PRE_ROLLBACK, "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                   "trigger": "pre_rollback", "rolledBackFrom": version_id, "contents": saved},
                  f, ensure_ascii=False, indent=2)
    try:
        restored = _restore_into_live(base_dir, src)
    except Exception:
        _restore_into_live(base_dir, pre)   # 回退到回滚前
        raise
    return {"id": version_id, "restored": restored}


def undo_rollback(base_dir: str) -> Dict[str, Any]:
    """撤销上次回滚:从 _pre_rollback 把各项覆盖回 live。"""
    pre = os.path.join(_history_root(base_dir), PRE_ROLLBACK)
    if not os.path.isdir(pre):
        raise FileNotFoundError("无可撤销的回滚(无 _pre_rollback)")
    return {"restored": _restore_into_live(base_dir, pre)}
