import openpyxl
import opportunities as opp


def _store():
    return {"version": 1, "seq": 0, "rows": []}


def test_new_row_blank_has_all_fields():
    r = opp.new_row("opp-1")
    assert r["id"] == "opp-1"
    for f in opp.FIELDS:
        assert f in r and r[f] == "" or f == "amountWan"
    assert r["amountWan"] == "" and r["firstReg"] == "" and r["lastUpdate"] == ""


def test_apply_create_increments_seq():
    s = _store()
    a = opp.apply_create(s, "2026-06-24")
    b = opp.apply_create(s, "2026-06-24")
    assert s["seq"] == 2 and a["id"] == "opp-1" and b["id"] == "opp-2"
    assert len(s["rows"]) == 2


def test_apply_update_stamps_firstreg_only_when_content_then_lastupdate_each_time():
    s = _store()
    opp.apply_create(s, "2026-06-24")  # opp-1, 空
    # 首次写入有内容 → firstReg 盖
    r = opp.apply_update(s, "opp-1", {"customer": "甲公司"}, "admin", "2026-06-24", "2026-06-24 10:00")
    assert r["customer"] == "甲公司"
    assert r["firstReg"] == "2026-06-24"
    assert r["lastUpdate"] == "2026-06-24 10:00" and r["lastUpdateBy"] == "admin"
    # 二次更新 → firstReg 不变, lastUpdate 刷新
    r2 = opp.apply_update(s, "opp-1", {"status": "招投标"}, "admin", "2026-06-25", "2026-06-25 09:00")
    assert r2["firstReg"] == "2026-06-24" and r2["lastUpdate"] == "2026-06-25 09:00"


def test_apply_update_firstreg_not_set_when_all_blank():
    s = _store(); opp.apply_create(s, "2026-06-24")
    r = opp.apply_update(s, "opp-1", {"customer": ""}, "admin", "2026-06-24", "2026-06-24 10:00")
    assert r["firstReg"] == ""  # 无内容不盖首登
    assert r["lastUpdate"] == "2026-06-24 10:00"


def test_apply_update_rejects_unknown_field_and_missing_row():
    s = _store(); opp.apply_create(s, "2026-06-24")
    r = opp.apply_update(s, "opp-1", {"evil": "x", "id": "hack"}, "admin", "d", "t")
    assert "evil" not in r and r["id"] == "opp-1"  # 非 FIELDS 被拒
    assert opp.apply_update(s, "nope", {"customer": "x"}, "admin", "d", "t") is None


def test_apply_update_parses_amount_and_dates():
    s = _store(); opp.apply_create(s, "2026-06-24")
    r = opp.apply_update(s, "opp-1", {"amountWan": "1,200.5", "bidDate": "2026-07-01 00:00:00"}, "a", "d", "t")
    assert r["amountWan"] == 1200.5 and r["bidDate"] == "2026-07-01"


def test_apply_delete():
    s = _store(); opp.apply_create(s, "d"); opp.apply_create(s, "d")
    assert opp.apply_delete(s, ["opp-1"]) == 1
    assert [r["id"] for r in s["rows"]] == ["opp-2"]


def test_filter_for_account():
    rows = [{"id": "1", "l4": "小金融服务组"}, {"id": "2", "l4": "银行服务组"}]
    assert len(opp.filter_for_account(rows, [], True)) == 2          # 超管全看
    assert len(opp.filter_for_account(rows, ["*"], False)) == 2       # '*' 全看
    assert [r["id"] for r in opp.filter_for_account(rows, ["小金融服务组"], False)] == ["1"]
    assert opp.filter_for_account(rows, [], False) == []             # 空 allowedL4 → 无


def test_read_xlsx_maps_headers(tmp_path):
    p = tmp_path / "opportunities.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["客户名称", "L4组织", "商机状态", "预估金额（万元）"])
    ws.append(["甲公司", "小金融服务组", "招投标", 320])
    wb.save(p)
    rows = opp.read_opportunities_xlsx(str(p))
    assert len(rows) == 1
    assert rows[0]["customer"] == "甲公司" and rows[0]["l4"] == "小金融服务组"
    assert rows[0]["status"] == "招投标" and rows[0]["amountWan"] == 320.0
    assert rows[0]["id"] == "opp-1"


def test_read_xlsx_missing_file():
    assert opp.read_opportunities_xlsx("nonexistent.xlsx") == []
