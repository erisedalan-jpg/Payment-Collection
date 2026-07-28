"""产品分类表读取(V4.5.4)。"""
import openpyxl
import product_category as PC


def _xlsx(tmp_path, rows, headers=("产品线", "产品大类", "是否渠道商可交付")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(headers))
    for r in rows:
        ws.append(list(r))
    p = tmp_path / "产品分类.xlsx"
    wb.save(str(p))
    return str(p)


def test_正常读取(tmp_path):
    p = _xlsx(tmp_path, [("NGSOC", "态势感知", None),
                         ("WAF", "传统等保", "渠道商可交付产品")])
    m = PC.read_product_categories(p)
    assert m["NGSOC"] == {"category": "态势感知", "channel": False}
    assert m["WAF"] == {"category": "传统等保", "channel": True}


def test_渠道列只认精确值(tmp_path):
    """空白、任意其它字样一律判 False——避免把'待评估'之类误判为可交付。"""
    p = _xlsx(tmp_path, [("A", "其他", "待评估"), ("B", "其他", "")])
    m = PC.read_product_categories(p)
    assert m["A"]["channel"] is False
    assert m["B"]["channel"] is False


def test_产品线为空的行跳过(tmp_path):
    p = _xlsx(tmp_path, [(None, "态势感知", None), ("NGSOC", "态势感知", None)])
    assert list(PC.read_product_categories(p)) == ["NGSOC"]


def test_重复产品线后者覆盖前者(tmp_path):
    p = _xlsx(tmp_path, [("NGSOC", "旧大类", None), ("NGSOC", "态势感知", None)])
    assert PC.read_product_categories(p)["NGSOC"]["category"] == "态势感知"


def test_缺文件返回空字典(tmp_path):
    assert PC.read_product_categories(str(tmp_path / "不存在.xlsx")) == {}


def test_无表头返回空字典(tmp_path):
    p = _xlsx(tmp_path, [("NGSOC", "态势感知", None)], headers=("甲", "乙", "丙"))
    assert PC.read_product_categories(p) == {}


def test_大类顺序常量其他恒末位():
    assert PC.CATEGORY_ORDER[-1] == "其他"
    assert "态势感知" in PC.CATEGORY_ORDER
