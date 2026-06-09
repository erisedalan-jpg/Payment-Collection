# pmis_download.py
"""PMIS 在线下载:按持久化链接把七个文件下载到 input/pmis/。
进度用 [INFO]/[OK]/[ERROR] 标记输出,供 server 解析为 SSE。
fetch 可注入便于测试;默认用 urllib(标准库,无新依赖)。"""
from __future__ import annotations
import os
import sys
from typing import Callable, Dict, List

import config

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

_ALL_PMIS_NAMES = set(config.PMIS_FILES_ACTIVE.values()) | set(config.PMIS_FILES_CLOSED.values())


def plan_downloads(links: Dict[str, str]) -> List[Dict[str, str]]:
    """links: 文件名→URL。只保留属于 PMIS 七表且 URL 非空的项。"""
    return [{"name": name, "url": url} for name, url in links.items()
            if name in _ALL_PMIS_NAMES and url and str(url).strip()]


def _default_fetch(url: str, dest: str) -> None:
    import urllib.request
    with urllib.request.urlopen(url, timeout=60) as resp, open(dest, "wb") as f:
        f.write(resp.read())


def run_downloads(links: Dict[str, str], pmis_dir: str,
                  fetch: Callable[[str, str], None] = _default_fetch) -> int:
    os.makedirs(pmis_dir, exist_ok=True)
    plan = plan_downloads(links)
    ok = 0
    print(f"[INFO] 计划下载 {len(plan)} 个 PMIS 文件...")
    for item in plan:
        dest = os.path.join(pmis_dir, item["name"])
        try:
            fetch(item["url"], dest)
            ok += 1
            print(f"[OK] 已下载 {item['name']}")
        except Exception as e:
            print(f"[ERROR] 下载失败 {item['name']}: {e}")
    print(f"[OK] PMIS 下载完成 {ok}/{len(plan)}")
    return ok


def load_links(links_path: str) -> Dict[str, str]:
    import json
    if os.path.exists(links_path):
        with open(links_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("links", {}) if isinstance(data, dict) else {}
    return {}


def main():
    """frozen/dev 进程内或子进程入口:读 data/pmis_links.json → 下载到 input/pmis/。"""
    links_path = os.path.join(BASE_DIR, "data", "pmis_links.json")
    pmis_dir = os.path.join(BASE_DIR, "input", config.PMIS_DIRNAME)
    run_downloads(load_links(links_path), pmis_dir)


if __name__ == "__main__":
    main()
