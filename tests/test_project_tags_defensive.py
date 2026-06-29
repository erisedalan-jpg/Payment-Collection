import json
import server


def test_load_project_tags_returns_existing_file_unchanged(tmp_path, monkeypatch):
    """已存在且合法的 project_tags.json 须原样返回,不被重新播种覆盖(reprocess 后标签不丢)。"""
    f = tmp_path / "project_tags.json"
    data = {"version": 1, "tags": [{"name": "BH项目", "disabled": False}],
            "assignments": {"WSGF-SF-001": ["BH项目"]}}
    f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(f))
    out = server._load_project_tags()
    assert out["assignments"] == {"WSGF-SF-001": ["BH项目"]}
    assert any(t["name"] == "BH项目" for t in out["tags"])
    # 复读仍一致(未被覆盖)
    again = json.loads(f.read_text(encoding="utf-8"))
    assert again["assignments"] == {"WSGF-SF-001": ["BH项目"]}
