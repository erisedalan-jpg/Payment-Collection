import json
import os
import server


def test_load_tags_seeds_vocab_not_assignments(tmp_path, monkeypatch):
    """首次播种只生成标签库 vocab；规则派生的 tagSeed 不写入 assignments
    (per-project 挂载由前端运行期合并,保证签约单位纠正后自动回收、不固化)。"""
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
    assert store["assignments"] == {}          # 规则标签不落 assignments
    assert os.path.exists(str(tags_file))
    # 落盘文件本身也不含规则 per-project 挂载
    on_disk = json.loads(tags_file.read_text(encoding="utf-8"))
    assert on_disk["assignments"] == {}


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


def test_load_tags_empty_seed_not_persisted(tmp_path, monkeypatch):
    """种子为空(analysis 尚未处理/无 tagSeed)时不落盘空文件，
    避免空 project_tags.json 永久 local-wins、之后再处理也不播种。"""
    tags_file = tmp_path / "project_tags.json"
    analysis_file = tmp_path / "analysis_data.json"
    analysis_file.write_text(json.dumps({"tagSeed": {}}), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_file))

    store = server._load_project_tags()
    assert store["tags"] == [] and store["assignments"] == {}
    assert not os.path.exists(str(tags_file))  # 空种子不落盘

    # 之后 analysis 有了 tagSeed → 再次 load 应播种"标签库 vocab"并落盘(但 assignments 仍空)
    analysis_file.write_text(json.dumps({"tagSeed": {"A": ["BH项目"]}}, ensure_ascii=False), encoding="utf-8")
    store2 = server._load_project_tags()
    assert {t["name"] for t in store2["tags"]} == {"BH项目"}
    assert store2["assignments"] == {}
    assert os.path.exists(str(tags_file))


def test_load_tags_reconciles_new_whitelist_tag_on_existing_store(tmp_path, monkeypatch):
    """升级路径:既有 project_tags.json 的 vocab 缺某个新出现的白名单规则标签(如产品超支)时,
    load 应自愈补进 vocab(供「按标签排除/筛选」下拉可选),且不动 assignments、已落盘。"""
    tags_file = tmp_path / "project_tags.json"
    tags_file.write_text(json.dumps({
        "version": 1, "tags": [{"name": "佳杰"}], "assignments": {"Z": ["自定义"]}
    }, ensure_ascii=False), encoding="utf-8")
    analysis_file = tmp_path / "analysis_data.json"
    analysis_file.write_text(json.dumps({
        "tagSeed": {"A": ["佳杰"], "B": ["产品超支"]}      # 更新数据后新出现「产品超支」
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_file))

    store = server._load_project_tags()
    assert {t["name"] for t in store["tags"]} == {"佳杰", "产品超支"}   # 自愈补进
    assert store["assignments"] == {"Z": ["自定义"]}                    # 不动手动挂载
    on_disk = json.loads(tags_file.read_text(encoding="utf-8"))
    assert "产品超支" in {t["name"] for t in on_disk["tags"]}          # 已落盘


def test_save_tags_roundtrip(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    store = {"version": 1, "tags": [{"name": "X"}], "assignments": {"P": ["X"]}}
    server._save_project_tags(store)
    assert server._load_project_tags()["assignments"]["P"] == ["X"]
