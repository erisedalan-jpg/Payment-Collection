import json
import os
import server


def test_load_tags_seeds_from_analysis(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    analysis_file = tmp_path / "analysis_data.json"
    analysis_file.write_text(json.dumps({
        "tagSeed": {"A": ["BH项目"], "B": ["框架合同", "佳杰"]}
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_file))

    store = server._load_project_tags()
    assert store["version"] == 1
    assert {t["name"] for t in store["tags"]} == {"BH项目", "框架合同", "佳杰"}
    assert store["assignments"]["A"] == ["BH项目"]
    assert os.path.exists(str(tags_file))


def test_load_tags_local_wins(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    tags_file.write_text(json.dumps({
        "version": 1, "tags": [{"name": "自定义"}], "assignments": {"Z": ["自定义"]}
    }, ensure_ascii=False), encoding="utf-8")
    analysis_file = tmp_path / "analysis_data.json"
    analysis_file.write_text(json.dumps({"tagSeed": {"A": ["BH项目"]}}), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_file))

    store = server._load_project_tags()
    assert store["assignments"] == {"Z": ["自定义"]}


def test_save_tags_roundtrip(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    store = {"version": 1, "tags": [{"name": "X"}], "assignments": {"P": ["X"]}}
    server._save_project_tags(store)
    assert server._load_project_tags()["assignments"]["P"] == ["X"]
