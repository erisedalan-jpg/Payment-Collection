import json
import os
import data_history as DH


def _seed(base):
    """造一个假的 base_dir:含 data/analysis_data.json(带 meta)/events.json/snapshots + yundocs_data + input。"""
    os.makedirs(os.path.join(base, "data", "snapshots"), exist_ok=True)
    os.makedirs(os.path.join(base, "yundocs_data"), exist_ok=True)
    os.makedirs(os.path.join(base, "input"), exist_ok=True)
    with open(os.path.join(base, "data", "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {"totalProjects": 5, "totalPaymentNodes": 12, "lastUpdate": "2026-06-15 10:00"},
                   "marker": "v1"}, f)
    with open(os.path.join(base, "data", "events.json"), "w", encoding="utf-8") as f:
        json.dump([{"e": 1}], f)
    with open(os.path.join(base, "data", "snapshots", "2026-06-15.json"), "w", encoding="utf-8") as f:
        f.write("{}")
    with open(os.path.join(base, "yundocs_data", "src.json"), "w", encoding="utf-8") as f:
        f.write("src-v1")
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("input-v1")


def _set_marker(base, marker):
    with open(os.path.join(base, "data", "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {"totalProjects": 5, "totalPaymentNodes": 12, "lastUpdate": "x"}, "marker": marker}, f)


def test_archive_creates_version_with_manifest(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mf = DH.archive_version(base, version_id="20260615-100000")
    vdir = os.path.join(base, "data", "history", "20260615-100000")
    assert os.path.isdir(vdir)
    assert os.path.isfile(os.path.join(vdir, "analysis_data.json"))
    assert os.path.isfile(os.path.join(vdir, "events.json"))
    assert os.path.isdir(os.path.join(vdir, "snapshots"))
    assert os.path.isdir(os.path.join(vdir, "yundocs_data"))
    assert os.path.isdir(os.path.join(vdir, "input"))
    assert mf["projectCount"] == 5 and mf["paymentNodeCount"] == 12
    assert mf["sizeBytes"] > 0
    assert set(mf["contents"]) == {"analysis_data.json", "events.json", "snapshots", "yundocs_data", "input"}


def test_prune_keeps_latest_three(tmp_path):
    base = str(tmp_path)
    _seed(base)
    for vid in ["20260615-100001", "20260615-100002", "20260615-100003", "20260615-100004"]:
        DH.archive_version(base, version_id=vid)
    ids = [v["id"] for v in DH.list_versions(base)["versions"]]
    assert ids == ["20260615-100004", "20260615-100003", "20260615-100002"]


def test_rollback_restores_and_makes_pre_rollback(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260615-100000")   # 存档 marker=v1
    _set_marker(base, "v2")                                   # live 变为 v2
    with open(os.path.join(base, "yundocs_data", "src.json"), "w", encoding="utf-8") as f:
        f.write("src-v2")
    res = DH.rollback(base, "20260615-100000")
    assert res["id"] == "20260615-100000"
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "v1"                # live 已还原为 v1
    with open(os.path.join(base, "yundocs_data", "src.json"), encoding="utf-8") as f:
        assert f.read() == "src-v1"                          # 源也还原
    assert os.path.isdir(os.path.join(base, "data", "history", "_pre_rollback"))
    assert DH.list_versions(base)["preRollback"] is not None


def test_undo_rollback_restores_pre_state(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260615-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260615-100000")                     # live: v2 -> v1, _pre_rollback=v2
    DH.undo_rollback(base)                                    # 撤销 -> 回到 v2
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "v2"


def test_rollback_missing_version_raises(tmp_path):
    base = str(tmp_path)
    _seed(base)
    import pytest
    with pytest.raises(FileNotFoundError):
        DH.rollback(base, "nope")


def test_archive_skips_absent_items(tmp_path):
    base = str(tmp_path)
    os.makedirs(os.path.join(base, "data"), exist_ok=True)
    with open(os.path.join(base, "data", "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {}}, f)                            # 仅有 analysis_data.json,无 events/snapshots/源
    mf = DH.archive_version(base, version_id="20260615-100000")
    assert mf["contents"] == ["analysis_data.json"]
    assert mf["projectCount"] == 0


def test_no_tmp_residue_after_archive_and_rollback(tmp_path):
    """copy-then-swap 应 os.replace 换入,成功后不留任何 .tmp 残渣。"""
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260615-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260615-100000")
    leftovers = [os.path.join(root, n)
                 for root, dirs, files in os.walk(base)
                 for n in list(dirs) + list(files) if n.endswith(".tmp")]
    assert leftovers == []
