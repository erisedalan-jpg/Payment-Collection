# -*- coding: utf-8 -*-
import os
import pmis_download as D


def test_plan_downloads_maps_links_to_files(tmp_path):
    links = {"项目中心.xlsx": "http://x/a", "项目基础信息数据.xlsx": "http://x/b"}
    plan = D.plan_downloads(links)
    names = {p["name"] for p in plan}
    assert names == {"项目中心.xlsx", "项目基础信息数据.xlsx"}


def test_plan_downloads_skips_unknown_and_blank(tmp_path):
    links = {"项目中心.xlsx": "http://x/a", "随便.xlsx": "http://x/c", "项目风险数据.xlsx": ""}
    names = {p["name"] for p in D.plan_downloads(links)}
    assert names == {"项目中心.xlsx"}  # 未知文件名 + 空链接都被过滤


def test_run_downloads_uses_injected_fetch(tmp_path):
    calls = []
    def fake_fetch(url, dest):
        calls.append((url, dest))
        with open(dest, "wb") as f:
            f.write(b"x")
    links = {"项目中心.xlsx": "http://x/a"}
    ok = D.run_downloads(links, str(tmp_path), fetch=fake_fetch)
    assert ok == 1
    assert os.path.exists(os.path.join(str(tmp_path), "项目中心.xlsx"))
    assert calls and calls[0][0] == "http://x/a"


def test_run_downloads_counts_only_success(tmp_path):
    def flaky(url, dest):
        if "bad" in url:
            raise RuntimeError("boom")
        with open(dest, "wb") as f:
            f.write(b"x")
    links = {"项目中心.xlsx": "http://x/ok", "项目基础信息数据.xlsx": "http://x/bad"}
    ok = D.run_downloads(links, str(tmp_path), fetch=flaky)
    assert ok == 1  # 一个成功一个失败,失败不计数也不抛
