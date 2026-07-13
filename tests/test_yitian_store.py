# -*- coding: utf-8 -*-
"""yitian_store.py:倚天工时累积库(按工时ID upsert)。"""
import json

import yitian_store as S


def _row(wid, date="2026-04-17", content="甲"):
    return {"wid": wid, "date": date, "emp_id": "A1", "content": content, "hours": 8.0}


class TestEmptyAndLoad:
    def test_empty_shape(self):
        assert S.empty_store() == {"version": 1, "rows": []}

    def test_missing_file(self, tmp_path):
        assert S.load_store(str(tmp_path / "nope.json")) == S.empty_store()

    def test_corrupt_file(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{坏", encoding="utf-8")
        assert S.load_store(str(p)) == S.empty_store()

    def test_unknown_version_treated_as_empty(self, tmp_path, capsys):
        # M-3:STORE_VERSION 曾经是只写不读的死字段;未来行结构一改,老库会以 KeyError
        # 形式在 build_yitian_data 里炸。现在版本不识别 → 当空库处理,并打 [WARN] 可诊断。
        p = tmp_path / "v.json"
        p.write_text('{"version": 999, "rows": [{"wid": "1", "date": "2026-04-17"}]}',
                     encoding="utf-8")
        assert S.load_store(str(p)) == S.empty_store()
        assert "[WARN]" in capsys.readouterr().out

    def test_known_version_loads_normally(self, tmp_path):
        p = tmp_path / "v.json"
        p.write_text('{"version": 1, "rows": [{"wid": "1", "date": "2026-04-17"}]}',
                     encoding="utf-8")
        assert S.load_store(str(p))["rows"] == [{"wid": "1", "date": "2026-04-17"}]


class TestUpsert:
    def test_insert_new(self):
        st = S.empty_store()
        added, updated, skipped = S.upsert_rows(st, [_row("1"), _row("2")])
        assert (added, updated, skipped) == (2, 0, 0)
        assert len(st["rows"]) == 2

    def test_reimport_same_file_does_not_duplicate(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1"), _row("2")])
        added, updated, skipped = S.upsert_rows(st, [_row("1"), _row("2")])
        assert (added, updated, skipped) == (0, 2, 0)
        assert len(st["rows"]) == 2          # 不变成双份

    def test_update_overwrites_content(self):
        # 员工事后补填了工作成果 → 重导一遍必须能修正历史
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", content="旧")])
        S.upsert_rows(st, [_row("1", content="新")])
        assert st["rows"][0]["content"] == "新"

    def test_accumulates_across_weeks(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-17")])
        added, _, _ = S.upsert_rows(st, [_row("2", date="2026-04-24")])
        assert added == 1
        assert {r["date"] for r in st["rows"]} == {"2026-04-17", "2026-04-24"}

    def test_skips_rows_without_wid(self):
        # I-3:无工时ID 的行不能零计数静默丢弃——总工时/饱和度/合规率分母会悄悄变小却零痕迹。
        st = S.empty_store()
        added, updated, skipped = S.upsert_rows(st, [{"date": "2026-04-17"}, _row("1")])
        assert (added, updated, skipped) == (1, 0, 1)

    def test_skips_rows_with_blank_wid(self):
        st = S.empty_store()
        added, updated, skipped = S.upsert_rows(st, [_row(""), _row("  ")])
        assert (added, updated, skipped) == (0, 0, 2)

    def test_dirty_existing_rows_do_not_crash_index_build(self):
        # M-2:已存库里若混入非 dict 脏行(如手工改坏的 json),建索引不能崩。
        st = {"version": 1, "rows": [1, "坏行", _row("1")]}
        added, updated, skipped = S.upsert_rows(st, [_row("2")])
        assert (added, updated, skipped) == (1, 0, 0)


class TestStats:
    def test_empty(self):
        assert S.store_stats(S.empty_store()) == {"rows": 0, "start": None, "end": None}

    def test_range(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-24"), _row("2", date="2026-01-05")])
        assert S.store_stats(st) == {"rows": 2, "start": "2026-01-05", "end": "2026-04-24"}

    def test_dirty_non_dict_rows_do_not_crash(self):
        # M-2:脏库(元素不是 dict)不能让 store_stats 抛 AttributeError → 端点 500。
        st = {"version": 1, "rows": [1, "坏行", None, _row("1", date="2026-04-17")]}
        assert S.store_stats(st) == {"rows": 4, "start": "2026-04-17", "end": "2026-04-17"}


class TestDeleteRange:
    def test_deletes_inclusive(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-17"), _row("2", date="2026-04-24"),
                           _row("3", date="2026-05-01")])
        n = S.delete_range(st, "2026-04-17", "2026-04-24")
        assert n == 2
        assert [r["wid"] for r in st["rows"]] == ["3"]

    def test_no_match(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-17")])
        assert S.delete_range(st, "2026-06-01", "2026-06-30") == 0

    def test_dirty_non_dict_rows_are_kept_not_crashed(self):
        # M-2:脏行没有 date 可比较,不该崩、也不该被误判命中区间——原样保留。
        st = {"version": 1, "rows": [1, "坏行", _row("1", date="2026-04-17")]}
        n = S.delete_range(st, "2026-01-01", "2026-12-31")
        assert n == 1
        assert st["rows"] == [1, "坏行"]


class TestSaveClear:
    def test_roundtrip(self, tmp_path):
        p = str(tmp_path / "s.json")
        st = S.empty_store()
        S.upsert_rows(st, [_row("1")])
        S.save_store(p, st)
        assert S.load_store(p)["rows"][0]["wid"] == "1"
        with open(p, encoding="utf-8") as f:
            assert json.load(f)["version"] == 1

    def test_clear(self, tmp_path):
        p = str(tmp_path / "s.json")
        S.save_store(p, S.empty_store())
        S.clear_store(p)
        assert S.load_store(p) == S.empty_store()
