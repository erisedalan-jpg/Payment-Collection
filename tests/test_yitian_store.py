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


class TestUpsert:
    def test_insert_new(self):
        st = S.empty_store()
        added, updated = S.upsert_rows(st, [_row("1"), _row("2")])
        assert (added, updated) == (2, 0)
        assert len(st["rows"]) == 2

    def test_reimport_same_file_does_not_duplicate(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1"), _row("2")])
        added, updated = S.upsert_rows(st, [_row("1"), _row("2")])
        assert (added, updated) == (0, 2)
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
        added, _ = S.upsert_rows(st, [_row("2", date="2026-04-24")])
        assert added == 1
        assert {r["date"] for r in st["rows"]} == {"2026-04-17", "2026-04-24"}

    def test_skips_rows_without_wid(self):
        st = S.empty_store()
        added, updated = S.upsert_rows(st, [{"date": "2026-04-17"}, _row("1")])
        assert (added, updated) == (1, 0)


class TestStats:
    def test_empty(self):
        assert S.store_stats(S.empty_store()) == {"rows": 0, "start": None, "end": None}

    def test_range(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-24"), _row("2", date="2026-01-05")])
        assert S.store_stats(st) == {"rows": 2, "start": "2026-01-05", "end": "2026-04-24"}


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
