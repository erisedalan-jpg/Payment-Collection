import yitian as Y
import yitian_rules_config as RC


def _seed(tmp_path, monkeypatch):
    """构造最小可跑的 base_dir:一条问题工时 + 花名册命中。"""
    import os
    import json
    base = tmp_path
    (base / "data").mkdir()
    (base / "input").mkdir()
    (base / "input" / "yitian").mkdir()
    store = {"rows": [{
        "emp_id": "E1", "date": "2026-06-01", "hours": 8.0,
        "work_type": "项目类", "work_type3": "开发", "content": "只写了工作进展,缺概述与下一步",
        "customer": "某客户", "product_line": "", "product_name": "", "project_type": "",
        "service_mode": "现场", "sales_l2": "交付中心", "work_order": "WO1",
    }], "version": 1}
    (base / "data" / "yitian_store.json").write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
    # 花名册:让 read_org_roster 命中 E1。monkeypatch 直接替换 roster 读取,免造 xlsx。
    monkeypatch.setattr(Y, "read_org_roster", lambda p: [{"id": "E1", "name": "张三", "orgL4": "一部"}])
    monkeypatch.setattr(Y, "read_top1000", lambda p: {})
    return str(base)


def test_build_uses_default_rules(tmp_path, monkeypatch):
    base = _seed(tmp_path, monkeypatch)
    data = Y.build_yitian_data(base)
    assert data is not None
    e0 = data["entries"][0]
    assert e0["ok"] == 2                       # 缺概述/下一步 → 问题
    assert "MISS_SUMMARY" in e0["iss"]


def test_build_respects_disabled_check(tmp_path, monkeypatch):
    base = _seed(tmp_path, monkeypatch)
    cfg = RC.default_config()
    cfg["checks"]["summary"]["enabled"] = False
    cfg["checks"]["next"]["enabled"] = False
    data = Y.build_yitian_data(base, rules_cfg=cfg)
    assert "MISS_SUMMARY" not in data["entries"][0]["iss"]
    assert "MISS_NEXT" not in data["entries"][0]["iss"]
