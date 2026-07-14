import json
import pytest
import budget_config as bc


def test_默认配置的费率与原工具一致():
    cfg = bc.default_config()
    assert cfg["rates"]["city1"] == {"pm": 2000, "tech": 1300, "out": 1000}
    assert cfg["rates"]["city2"] == {"pm": 1500, "tech": 1000, "out": 800}
    assert cfg["salesPrices"] == {"pm": 2400, "pm2ndc": 1800, "eng1stc": 1500, "eng2ndc": 1200}
    assert cfg["hotel"] == {"type1": 450, "capital": 350, "other": 300,
                            "hk": 125, "outType1": 300, "outType2": 230}
    assert cfg["allowance"] == {"dom": 150, "intl": 75}
    assert cfg["fx"] == 6.8
    assert cfg["ratio"] == {"min": 3, "max": 15}
    assert [m["value"] for m in cfg["margins"]] == [0.13, 0.06]


def test_默认目录条目数与关键取值():
    cfg = bc.default_config()
    assert len(cfg["products"]) == 19
    assert len(cfg["pmPhases"]) == 5
    assert len(cfg["services"]) == 8
    assert len(cfg["materials"]) == 4
    # 物料 key 必须与 salesPrices 的键一一对应(销售下单逆运算靠这个对上)
    assert [m["key"] for m in cfg["materials"]] == ["pm", "pm2ndc", "eng1stc", "eng2ndc"]
    assert set(cfg["salesPrices"]) == {m["key"] for m in cfg["materials"]}
    # 抽查:CSMP 的标准人天是 6.375(非整数,最容易被抄错)
    csmp = next(p for p in cfg["products"] if p["id"] == "1.15")
    assert csmp["name"] == "云安全管理平台CSMP"
    assert csmp["coefficient"] == 0.6 and csmp["stdDays"] == 6.375
    # 产品说明是长中文段落,不能是空串
    assert all(p["stdDesc"] and p["nonstdDesc"] for p in cfg["products"])
    # 服务不再有死字段 defaultVal
    assert all("defaultVal" not in s for s in cfg["services"])
    assert cfg["services"][-1]["isOther"] is True


def test_default_config_返回深拷贝_改了不污染下一次():
    a = bc.default_config()
    a["rates"]["city1"]["pm"] = 999
    a["products"].clear()
    b = bc.default_config()
    assert b["rates"]["city1"]["pm"] == 2000
    assert len(b["products"]) == 19


def test_校验_合法配置原样通过():
    cfg = bc.default_config()
    cfg["fx"] = 7.2
    out = bc.validate_config(cfg)
    assert out["fx"] == 7.2


@pytest.mark.parametrize("mutate", [
    lambda c: c.update(fx=0),
    lambda c: c.update(fx=-1),
    lambda c: c.update(fx="六点八"),
    lambda c: c["rates"]["city1"].update(pm=0),
    lambda c: c["rates"]["city2"].update(tech=-5),
    lambda c: c["salesPrices"].update(pm=0),
    lambda c: c["hotel"].update(type1=-1),
    lambda c: c["allowance"].update(dom=-1),
    lambda c: c.update(ratio={"min": 15, "max": 3}),      # 下限 >= 上限
    lambda c: c.update(ratio={"min": -1, "max": 15}),
    lambda c: c.update(margins=[]),
    lambda c: c.update(margins=[{"value": 1.5, "label": "150%"}]),   # 毛利率必须在 [0,1)
    lambda c: c.update(products=[]),
    lambda c: c.update(pmPhases=[]),
    lambda c: c.update(services=[]),
    lambda c: c.update(materials=[]),
])
def test_校验_非法值抛ValueError(mutate):
    cfg = bc.default_config()
    mutate(cfg)
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_salesPrices的键必须与materials的key对齐():
    cfg = bc.default_config()
    cfg["salesPrices"]["多出来的键"] = 100
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_产品id不能重复也不能叫other():
    cfg = bc.default_config()
    cfg["products"][1]["id"] = cfg["products"][0]["id"]
    with pytest.raises(ValueError):
        bc.validate_config(cfg)
    cfg = bc.default_config()
    cfg["products"][0]["id"] = "other"   # other 保留给自定义产品
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_产品必填字段缺失即非法():
    cfg = bc.default_config()
    cfg["products"][0].pop("coefficient")
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_产品系数或标准人天为负即非法():
    cfg = bc.default_config()
    cfg["products"][0]["coefficient"] = -0.1
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_非对象直接非法():
    with pytest.raises(ValueError):
        bc.validate_config([1, 2, 3])


def test_读写往返(tmp_path):
    p = str(tmp_path / "budget_config.json")
    cfg = bc.default_config()
    cfg["fx"] = 7.0
    saved = bc.save_config(p, cfg)
    assert saved["fx"] == 7.0
    assert bc.load_config(p)["fx"] == 7.0
    # 原子写:不留 .tmp 残file
    assert not (tmp_path / "budget_config.json.tmp").exists()


def test_读_文件不存在时回落默认(tmp_path):
    assert bc.load_config(str(tmp_path / "nope.json")) == bc.default_config()


def test_读_文件损坏时回落默认不抛(tmp_path):
    p = tmp_path / "broken.json"
    p.write_text("{ 这不是 json", encoding="utf-8")
    assert bc.load_config(str(p)) == bc.default_config()


def test_读_内容合法json但配置非法时回落默认(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"fx": -1}), encoding="utf-8")
    assert bc.load_config(str(p)) == bc.default_config()


def test_保存非法配置抛ValueError且不落盘(tmp_path):
    p = str(tmp_path / "c.json")
    with pytest.raises(ValueError):
        bc.save_config(p, {"fx": -1})
    import os
    assert not os.path.exists(p)
