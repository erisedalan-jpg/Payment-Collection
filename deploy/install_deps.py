#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""项目管理平台 — 依赖安装工具（Windows / Linux 通用）

为什么需要它：pmisdata/ 的下载脚本用了 requests + openpyxl，client/ 的 cookie 代理
用了 requests。这些不在 Python 标准库里，干净的机器上跑会直接 ImportError。
（注：若使用 V4.5.16+ 的单机 exe 且已内置依赖，目标机不需要跑本脚本。）

内网离线是常态，所以本脚本有两个模式：

  【有外网的机器上】先把 wheel 下下来
      python install_deps.py --download deps_wheels

  【目标机（可能没外网）】把上一步的目录拷过来，离线安装
      python install_deps.py --offline deps_wheels

  【目标机能连外网时】直接装
      python install_deps.py

装完会真的 import 一次做自检 —— "pip 说成功" 不等于 "import 得进来"
（版本不兼容、装到了另一个解释器里，都会让前者成功而后者失败）。
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

# 运行期真正需要的三方包。键=pip 包名，值=import 名（两者不总是一致）
REQUIRED = {
    "requests": "requests",       # pmisdata 下载脚本 + client cookie 代理
    "openpyxl": "openpyxl",       # 读写 xlsx
}

# 明确不装：playwright 要额外拉 chromium（数百 MB），本平台已放弃该取 cookie 路径。
EXCLUDED_NOTE = "playwright（update_cookie.py 用）不在此列：它要额外下载 chromium，请勿在内网机器上尝试。"

MIN_PY = (3, 8)


def _run(args: list[str]) -> int:
    """跑一条 pip 命令，实时把输出打出来。返回退出码。"""
    print("  $ " + " ".join(args))
    try:
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             encoding="utf-8", errors="replace")
    except FileNotFoundError:
        print("  [ERROR] 找不到 pip，请确认 Python 安装完整")
        return 127
    assert p.stdout is not None
    for line in p.stdout:
        print("    " + line.rstrip())
    p.wait()
    return p.returncode


def check_python() -> bool:
    print("[1/3] 检查 Python")
    print("  解释器: %s" % sys.executable)
    print("  版本  : %s" % sys.version.split()[0])
    if sys.version_info < MIN_PY:
        print("  [ERROR] 需要 Python %d.%d 及以上" % MIN_PY)
        return False
    try:
        import pip  # noqa: F401
    except ImportError:
        print("  [ERROR] 当前解释器没有 pip。Windows 可重装 Python 并勾选 pip；")
        print("          Linux 可 apt install python3-pip / yum install python3-pip")
        return False
    print("  OK")
    return True


def do_download(dest: str) -> int:
    """在有外网的机器上执行：把 wheel 全部下到 dest 目录。"""
    print("[2/3] 下载 wheel 到 %s" % os.path.abspath(dest))
    print("  注意：wheel 与【平台/Python 版本】绑定。请在与目标机")
    print("        同为 Windows/Linux、且 Python 大版本相同的机器上执行本步。")
    os.makedirs(dest, exist_ok=True)
    rc = _run([sys.executable, "-m", "pip", "download", "-d", dest, *REQUIRED.keys()])
    if rc != 0:
        print("  [ERROR] 下载失败（退出码 %d）" % rc)
        return rc
    files = sorted(os.listdir(dest))
    print("  已下载 %d 个文件:" % len(files))
    for f in files:
        print("    - %s" % f)
    print()
    print("  下一步：把整个 %s 目录拷到目标机，在那边执行:" % dest)
    print("      python install_deps.py --offline %s" % dest)
    return 0


def do_install(offline_dir: str | None) -> int:
    if offline_dir:
        print("[2/3] 离线安装（源: %s）" % os.path.abspath(offline_dir))
        if not os.path.isdir(offline_dir):
            print("  [ERROR] 目录不存在: %s" % offline_dir)
            return 2
        args = [sys.executable, "-m", "pip", "install", "--no-index",
                "--find-links", offline_dir, *REQUIRED.keys()]
    else:
        print("[2/3] 在线安装（需要能访问 pip 源）")
        print("  内网机器如果卡住/超时，改用离线模式，见本文件顶部说明。")
        args = [sys.executable, "-m", "pip", "install", *REQUIRED.keys()]
    rc = _run(args)
    if rc != 0:
        print("  [ERROR] 安装失败（退出码 %d）" % rc)
        return rc
    print("  OK")
    return 0


def verify() -> int:
    """真的 import 一次。pip 报成功但 import 不进来是常见情形（装错解释器等）。"""
    print("[3/3] 自检：逐个 import")
    bad = []
    for pkg, mod in REQUIRED.items():
        try:
            m = __import__(mod)
            ver = getattr(m, "__version__", "?")
            print("  OK   %-12s %s" % (pkg, ver))
        except Exception as e:  # noqa: BLE001
            print("  FAIL %-12s %s" % (pkg, e))
            bad.append(pkg)
    if bad:
        print()
        print("  [ERROR] 以下包装了但 import 不进来: %s" % "、".join(bad))
        print("  常见原因：机器上有多个 Python，pip 装到了另一个解释器。")
        print("  对策：用本脚本同一个解释器执行 pip —— %s -m pip install %s"
              % (sys.executable, " ".join(bad)))
        return 1
    print()
    print("  全部就绪。")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="项目管理平台依赖安装工具")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--download", metavar="DIR",
                   help="【有外网的机器上跑】把 wheel 下载到 DIR，供目标机离线安装")
    g.add_argument("--offline", metavar="DIR",
                   help="【目标机上跑】从 DIR 离线安装（不访问网络）")
    a = ap.parse_args()

    print("=" * 60)
    print("  项目管理平台 — 依赖安装")
    print("  需要: %s" % "、".join(REQUIRED))
    print("  %s" % EXCLUDED_NOTE)
    print("=" * 60)

    if not check_python():
        return 1
    print()

    if a.download:
        return do_download(a.download)

    rc = do_install(a.offline)
    print()
    if rc != 0:
        return rc
    return verify()


if __name__ == "__main__":
    sys.exit(main())
