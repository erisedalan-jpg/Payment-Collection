# -*- coding: utf-8 -*-
"""yitian_calendar.py 纯函数单测。不依赖 input/ 真文件——holidays.csv 用 tmp_path 造。"""
from datetime import date

import yitian_calendar as C


def _write_csv(tmp_path, rows):
    p = tmp_path / "holidays.csv"
    lines = ["日期,类型"] + [f"{d},{k}" for d, k in rows]
    p.write_text("\n".join(lines), encoding="utf-8")
    return str(p)


class TestParseDate:
    def test_iso(self):
        assert C.parse_date("2026-04-17") == date(2026, 4, 17)

    def test_slash_and_datetime_suffix(self):
        assert C.parse_date("2026/04/17") == date(2026, 4, 17)
        assert C.parse_date("2026-04-17 00:00:00") == date(2026, 4, 17)

    def test_bad_returns_none(self):
        assert C.parse_date("") is None
        assert C.parse_date("不是日期") is None
        assert C.parse_date(None) is None


class TestReadHolidays:
    def test_missing_file_degrades(self, tmp_path):
        rest, work = C.read_holidays(str(tmp_path / "nope.csv"))
        assert rest == set() and work == set()

    def test_reads_rest_and_work(self, tmp_path):
        p = _write_csv(tmp_path, [("2026-02-16", "休"), ("2026-02-14", "班"), ("2026-01-01", "休")])
        rest, work = C.read_holidays(p)
        assert rest == {date(2026, 2, 16), date(2026, 1, 1)}
        assert work == {date(2026, 2, 14)}

    def test_skips_bad_rows(self, tmp_path):
        p = _write_csv(tmp_path, [("坏日期", "休"), ("2026-02-16", "未知类型"), ("2026-02-17", "休")])
        rest, work = C.read_holidays(p)
        assert rest == {date(2026, 2, 17)}
        assert work == set()


class TestIsWorkday:
    def test_plain_weekday(self):
        assert C.is_workday(date(2026, 4, 17), set(), set()) is True   # 周五

    def test_plain_weekend(self):
        assert C.is_workday(date(2026, 4, 18), set(), set()) is False  # 周六

    def test_holiday_on_weekday_is_rest(self):
        d = date(2026, 2, 17)  # 周二
        assert C.is_workday(d, {d}, set()) is False

    def test_makeup_on_weekend_is_work(self):
        d = date(2026, 2, 14)  # 周六调休上班
        assert C.is_workday(d, set(), {d}) is True

    def test_work_wins_over_rest(self):
        d = date(2026, 2, 14)
        assert C.is_workday(d, {d}, {d}) is True


class TestWeeks:
    def test_iso_week(self):
        assert C.iso_week(date(2026, 4, 17)) == "2026-W16"

    def test_calc_week_friday_starts_new_week(self):
        # 计算周 = 上周五~本周四:周四(4/16) 与 周五(4/17) 必须分属不同计算周
        assert C.calc_week(date(2026, 4, 16)) != C.calc_week(date(2026, 4, 17))

    def test_calc_week_friday_to_thursday_same_bucket(self):
        # 4/17(周五) ~ 4/23(周四) 同一个计算周
        keys = {C.calc_week(date(2026, 4, d)) for d in range(17, 24)}
        assert len(keys) == 1

    def test_calc_week_label_shape(self):
        assert C.calc_week(date(2026, 4, 17)) == "2026-CW17"

    def test_calc_week_crosses_year(self):
        # 2026-12-31 是周四 → 归本周;2027-01-01 是周五 → 归下一个计算周(不得抛错)
        assert C.calc_week(date(2026, 12, 31)) != C.calc_week(date(2027, 1, 1))


class TestBuildDays:
    def test_builds_inclusive_range_with_labels(self):
        out = C.build_days(date(2026, 4, 17), date(2026, 4, 20), set(), set())
        assert [x["d"] for x in out] == ["2026-04-17", "2026-04-18", "2026-04-19", "2026-04-20"]
        assert [x["workday"] for x in out] == [True, False, False, True]
        assert out[0]["isoWeek"] == "2026-W16"
        assert out[0]["calcWeek"] == "2026-CW17"
