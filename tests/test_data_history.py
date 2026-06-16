import json
import os

import data_history as DH


def _seed(base):
    """造 base_dir：data/analysis_data.json(带 meta)/events.json/snapshots + input(源) + yundocs_data(live,应不进快照)。"""
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


def test_archive_version_only_json_no_source(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mf = DH.archive_version(base, version_id="20260616-100000")
    vdir = os.path.join(base, "data", "history", "20260616-100000")
    assert os.path.isfile(os.path.join(vdir, "analysis_data.json"))
    assert os.path.isfile(os.path.join(vdir, "events.json"))
    assert os.path.isdir(os.path.join(vdir, "snapshots"))
    assert not os.path.exists(os.path.join(vdir, "input"))
    assert not os.path.exists(os.path.join(vdir, "yundocs_data"))
    assert set(mf["contents"]) == {"analysis_data.json", "events.json", "snapshots"}
    assert mf["projectCount"] == 5 and mf["paymentNodeCount"] == 12 and mf["sizeBytes"] > 0


def test_source_kept_single_and_refreshed(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    sdir = os.path.join(base, "data", "history", "_source")
    assert os.path.isfile(os.path.join(sdir, "input", "y.csv"))
    with open(os.path.join(sdir, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "input-v1"
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("input-v2")
    DH.archive_version(base, version_id="20260616-100001")
    with open(os.path.join(sdir, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "input-v2"
    src_mf = DH.list_versions(base)["source"]
    assert src_mf and src_mf["refreshedFrom"] == "20260616-100001"


def test_prune_keeps_latest_five(tmp_path):
    base = str(tmp_path)
    _seed(base)
    for i in range(7):
        DH.archive_version(base, version_id=f"20260616-10000{i}")
    ids = [v["id"] for v in DH.list_versions(base)["versions"]]
    assert len(ids) == 5
    assert ids[0] == "20260616-100006"
    assert "20260616-100000" not in ids and "20260616-100001" not in ids
    assert os.path.isdir(os.path.join(base, "data", "history", "_source"))


def test_rollback_restores_json_only_keeps_live_source(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    _set_marker(base, "v2")
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("input-v2")
    res = DH.rollback(base, "20260616-100000")
    assert res["id"] == "20260616-100000"
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "v1"
    with open(os.path.join(base, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "input-v2"
    assert DH.list_versions(base)["preRollback"] is not None


def test_undo_rollback_restores_pre_json(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260616-100000")
    DH.undo_rollback(base)
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
        json.dump({"meta": {}}, f)
    mf = DH.archive_version(base, version_id="20260616-100000")
    assert mf["contents"] == ["analysis_data.json"]
    assert mf["projectCount"] == 0
    sdir = os.path.join(base, "data", "history", "_source")
    assert not os.path.exists(os.path.join(sdir, "input"))


def test_backward_compat_rollback_old_full_layout(tmp_path):
    """旧全量布局版本目录(含 input)回滚时只还原 JSON 产出、不动 live input。"""
    base = str(tmp_path)
    _seed(base)
    vdir = os.path.join(base, "data", "history", "20260601-090000")
    os.makedirs(os.path.join(vdir, "snapshots"), exist_ok=True)
    os.makedirs(os.path.join(vdir, "input"), exist_ok=True)
    with open(os.path.join(vdir, "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {}, "marker": "old"}, f)
    with open(os.path.join(vdir, "events.json"), "w", encoding="utf-8") as f:
        f.write("[]")
    with open(os.path.join(vdir, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("old-input")
    with open(os.path.join(vdir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"id": "20260601-090000", "contents": ["analysis_data.json", "events.json", "snapshots", "input"]}, f)
    _set_marker(base, "live")
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("live-input")
    DH.rollback(base, "20260601-090000")
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "old"
    with open(os.path.join(base, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "live-input"


def test_no_tmp_residue(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260616-100000")
    leftovers = [os.path.join(root, n)
                 for root, dirs, files in os.walk(base)
                 for n in list(dirs) + list(files) if n.endswith(".tmp")]
    assert leftovers == []
