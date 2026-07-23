import json
import pytest
import followup_columns as fc


def _empty():
    return {"version": fc.STORE_VERSION, "tables": {t: [] for t in fc.TABLE_IDS}}


def test_add_generates_prefixed_key_and_appends():
    cfg = _empty()
    col = fc.add_column(cfg, 'risk', ' 责任人 ', 'text', False)
    assert col['key'].startswith(fc.KEY_PREFIX) and len(col['key']) == len(fc.KEY_PREFIX) + 8
    assert col['label'] == '责任人' and col['type'] == 'text' and col['clearOnArchive'] is False
    assert fc.columns_for(cfg, 'risk') == [col]
    assert fc.custom_keys(cfg, 'risk') == {col['key']}


def test_add_rejects_bad_table_type_label():
    cfg = _empty()
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'nope', 'x', 'text', False)          # 未知表
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', 'x', 'select', False)        # 未知类型
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', '   ', 'text', False)        # 空名
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', 'x' * 21, 'text', False)     # 超 20


def test_add_rejects_duplicate_label_within_table_only():
    cfg = _empty()
    fc.add_column(cfg, 'risk', '进度', 'text', False)
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', '进度', 'date', True)        # 表内重名
    fc.add_column(cfg, 'temp', '进度', 'text', False)           # 跨表可重名，不抛


def test_add_rejects_over_cap():
    cfg = _empty()
    for i in range(fc.MAX_COLS_PER_TABLE):
        fc.add_column(cfg, 'risk', f'列{i}', 'text', False)
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', '再一列', 'text', False)


def test_update_changes_label_type_clear_keeps_key():
    cfg = _empty()
    col = fc.add_column(cfg, 'risk', 'A', 'text', False)
    out = fc.update_column(cfg, 'risk', col['key'], label='B', type_='date', clear_on_archive=True)
    assert out['key'] == col['key'] and out['label'] == 'B' and out['type'] == 'date' and out['clearOnArchive'] is True


def test_update_rejects_duplicate_label_and_unknown_key():
    cfg = _empty()
    a = fc.add_column(cfg, 'risk', 'A', 'text', False)
    fc.add_column(cfg, 'risk', 'B', 'text', False)
    with pytest.raises(ValueError):
        fc.update_column(cfg, 'risk', a['key'], label='B')      # 撞另一列
    with pytest.raises(ValueError):
        fc.update_column(cfg, 'risk', 'cf-deadbeef', label='X') # 未知 key


def test_reorder_by_keys():
    cfg = _empty()
    a = fc.add_column(cfg, 'risk', 'A', 'text', False)
    b = fc.add_column(cfg, 'risk', 'B', 'text', False)
    out = fc.reorder_columns(cfg, 'risk', [b['key'], a['key']])
    assert [c['key'] for c in out] == [b['key'], a['key']]
    with pytest.raises(ValueError):
        fc.reorder_columns(cfg, 'risk', [a['key']])             # 键集不全


def test_delete_returns_col_and_removes():
    cfg = _empty()
    col = fc.add_column(cfg, 'risk', 'A', 'text', False)
    got = fc.delete_column(cfg, 'risk', col['key'])
    assert got['key'] == col['key'] and fc.columns_for(cfg, 'risk') == []
    with pytest.raises(ValueError):
        fc.delete_column(cfg, 'risk', col['key'])               # 已不存在


def test_clear_field_keys_four_quadrants():
    cfg = _empty()
    keep = fc.add_column(cfg, 'risk', '留', 'text', False)      # clearOnArchive False
    wipe = fc.add_column(cfg, 'risk', '清', 'date', True)       # clearOnArchive True
    builtin = ('followAction', 'revConclusion', 'nextRevDate')
    # 表级留存(risk/paykey): 只清 clearOnArchive=True 的自定义列
    assert fc.clear_field_keys(cfg, 'risk', builtin, False) == {wipe['key']}
    # 表级清空(temp/opp): 清全部内置 + clearOnArchive=True 的自定义列(留 keep)
    assert fc.clear_field_keys(cfg, 'risk', builtin, True) == set(builtin) | {wipe['key']}
    assert keep['key'] not in fc.clear_field_keys(cfg, 'risk', builtin, True)


def test_load_missing_or_corrupt_returns_empty(tmp_path):
    p = tmp_path / "none.json"
    cfg = fc.load(str(p))
    assert cfg == {"version": fc.STORE_VERSION, "tables": {t: [] for t in fc.TABLE_IDS}}
    p.write_text("{ broken", encoding="utf-8")
    assert fc.load(str(p))["tables"]["risk"] == []


def test_save_load_roundtrip(tmp_path):
    p = str(tmp_path / "fc.json")
    cfg = _empty()
    fc.add_column(cfg, 'temp', '责任人', 'text', False)
    fc.save(p, cfg)
    back = fc.load(p)
    assert back['tables']['temp'][0]['label'] == '责任人'
    assert json.loads(open(p, encoding="utf-8").read())['version'] == fc.STORE_VERSION
