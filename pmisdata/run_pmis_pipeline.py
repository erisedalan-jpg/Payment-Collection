#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PMIS 数据流水线（跨平台版）— 备份、下载、分析、分发。

与同目录的 `run_pmis_pipeline.sh` 是**同一套编排的两个实现**：

  · `.sh`  —— Linux 生产在用，**冻结不动**（用户按最小生产影响原则定的）。
  · `.py`  —— 本文件。Windows 单机 exe 版走它，因为目标机既没有 bash，
              也没有系统 Python（`sys.executable` 是 exe 自己）。

**改口径时两边都要过一遍。** 两者的输出必须保持同样的步骤标记 ——
`server.classify_download_line` 靠这些文本判定进度，改文案会让进度条静默失灵：
    Step 1/3 / Step 2/3 / Step 3/3
    fetch_pmis_tables.py 执行成功 / fetch_all_projects.py 执行成功
    delivery_analysis.py 执行成功
    拷贝到目标路径 / 流水线完成
另有 `✗` 前缀：`server.run_download` 用它收集失败原因。

两种执行方式（frozen 与开发态**共用同一段编排**，不再是两套代码路径）：
    python run_pmis_pipeline.py          # 开发态直接跑
    import run_pmis_pipeline; main()     # 打包态由 server 进程内调用

目录靠两个环境变量决定，都由调用方（server.py）给：
    PMISDATA_DIR    脚本与数据所在目录。打包后 __file__ 指向 PyInstaller 的临时
                    解压目录(_MEIPASS)，配置读不到、产物落进临时目录重启即丢，
                    所以必须显式指向 exe 同级的 pmisdata/。缺省 = 本文件所在目录。
    PMPLATFORM_DIR  平台根目录，产物拷到它的 input/ 与 input/pmis/。缺省 = 上级目录。
"""
from __future__ import annotations

import importlib
import os
import shutil
import sys
import time

# ── 与 .sh 完全一致的三份清单 ──────────────────────────────────────────────
# 备份对象：跑之前先留一份，失败了还能回到上一次的数据
BACKUP_FILES = [
    "项目中心.xlsx", "项目中心-已关闭.xlsx",
    "项目基础信息数据.xlsx", "项目基础信息数据-已关闭.xlsx",
    "项目状态信息数据.xlsx", "项目状态信息数据-已关闭.xlsx",
    "在建项目里程碑计划数据.xlsx", "已结项里程碑计划数据.xlsx",
    "项目风险数据.xlsx",
    "profit_loss_direct.csv", "profit_loss_bridge.csv", "budget_data.csv",
    "payment_records.csv", "payment_records_zero.csv",
    "collection_stages.csv", "collection_stages_zero.csv",
    "profit_loss_all.json",
    "delivery_analysis.csv", "delivery_analysis.json",
    "_fetch_checkpoint.json", "_wbs_id_map.json",
]
# 跨运行缓存：备份但不清理，清了下次要重新建整张映射表
KEEP_ON_CLEAN = {"_wbs_id_map.json"}

# 拷到 <平台>/input/pmis/ 的 9 张 PMIS 报表
PMIS_FILES = [
    "在建项目里程碑计划数据.xlsx", "已结项里程碑计划数据.xlsx",
    "项目中心-已关闭.xlsx", "项目中心.xlsx",
    "项目基础信息数据-已关闭.xlsx", "项目基础信息数据.xlsx",
    "项目状态信息数据-已关闭.xlsx", "项目状态信息数据.xlsx",
    "项目风险数据.xlsx",
]
# 拷到 <平台>/input/ 的 6 个 CSV
INPUT_FILES = [
    "budget_data.csv", "collection_stages.csv", "delivery_analysis.csv",
    "payment_records.csv", "profit_loss_bridge.csv", "profit_loss_direct.csv",
]

STEPS = [
    ("fetch_pmis_tables", "下载 PMIS 报表"),
    ("fetch_all_projects", "全量项目损益"),
    ("delivery_analysis", "交付部门成本分析"),
]


def _log(msg=""):
    """与 .sh 的 log() 同形：[时间] 内容。逐行 flush —— 调用方是按行读进度的，
    缓冲住会让进度条一次性跳完。"""
    if msg:
        print("[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg))
    else:
        print("")
    sys.stdout.flush()


def _size(path):
    try:
        n = os.path.getsize(path)
    except OSError:
        return "?"
    for unit in ("B", "K", "M", "G"):
        if n < 1024 or unit == "G":
            return "%.0f%s" % (n, unit) if unit == "B" else "%.1f%s" % (n, unit)
        n /= 1024.0
    return "?"


def _script_dir():
    return os.environ.get("PMISDATA_DIR") or os.path.dirname(os.path.abspath(__file__))


def _run_step(module_name):
    """进程内执行一个抓数脚本，返回退出码（0 = 成功）。

    为什么用 importlib 而不是 subprocess：打包后目标机上没有 python 可执行文件
    （`sys.executable` 是 exe 自己），subprocess 那条路根本不存在。开发态也走同一条，
    这样 frozen 与 dev 不再是两套代码路径（CLAUDE.md §5 反复强调的坑）。

    **每次都先从 sys.modules 摘掉再 import**：这些脚本在【模块级】读 config.json、
    算 OUTPUT_DIR。同一个 server 进程里点第二次「下载数据」时，若命中 import 缓存，
    模块级代码不会重跑 —— 用户刚更新的 cookie 不生效，却看不出任何异常。
    """
    for name in (module_name,):
        sys.modules.pop(name, None)
    try:
        mod = importlib.import_module(module_name)
    except SystemExit as e:          # 模块级 load_config() 失败会走到这里
        return int(e.code or 1)
    fn = getattr(mod, "main", None)
    if fn is None:
        return 0                      # 没有 main() 的脚本，import 即已执行完
    try:
        fn()
    except SystemExit as e:
        return int(e.code or 0)
    return 0


def main():
    script_dir = _script_dir()
    platform_dir = os.environ.get("PMPLATFORM_DIR") or os.path.dirname(script_dir)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(script_dir, stamp)

    # 子脚本靠这个变量定位 config.json / 输入 / 输出，必须在 import 它们之前设好
    os.environ["PMISDATA_DIR"] = script_dir
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    _log("==============================================")
    _log("  PMIS 数据流水线启动")
    _log("==============================================")
    _log("  脚本目录: %s" % script_dir)
    _log("  备份目录: %s" % backup_dir)
    _log("  平台目录: %s" % platform_dir)
    _log()

    # ── Step 0: 备份 + 清理 ──
    os.makedirs(backup_dir, exist_ok=True)
    n_backup = 0
    for f in BACKUP_FILES:
        src = os.path.join(script_dir, f)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(backup_dir, f))
            _log("  备份: %s  (%s)" % (f, _size(src)))
            n_backup += 1
    _log("  (无历史文件，跳过备份)" if n_backup == 0
         else "  共备份 %d 个文件 → %s/" % (n_backup, stamp))

    _log()
    _log("  清理旧输出文件（保留 %s）..." % "、".join(sorted(KEEP_ON_CLEAN)))
    for f in BACKUP_FILES:
        if f in KEEP_ON_CLEAN:
            continue
        p = os.path.join(script_dir, f)
        if os.path.isfile(p):
            try:
                os.remove(p)
                _log("    移除: %s" % f)
            except OSError as e:
                _log("    ✗ 无法移除 %s: %s" % (f, e))
                return 1

    # ── Step 1..3 ──
    for i, (mod_name, title) in enumerate(STEPS, start=1):
        _log()
        _log("==============================================")
        _log("  Step %d/3: %s.py — %s" % (i, mod_name, title))
        _log("==============================================")
        rc = _run_step(mod_name)
        if rc != 0:
            _log("  ✗ %s.py 执行失败（退出码 %s）— 流水线终止" % (mod_name, rc))
            return 1
        _log("  ✓ %s.py 执行成功" % mod_name)

    # ── Step 4: 校验产物 ──
    _log()
    _log("==============================================")
    _log("  验证输出文件")
    _log("==============================================")
    missing = []
    for f in PMIS_FILES + INPUT_FILES:
        p = os.path.join(script_dir, f)
        if os.path.isfile(p):
            _log("  ✓ %s  (%s)" % (f, _size(p)))
        else:
            _log("  ✗ %s  — 缺失！" % f)
            missing.append(f)
    if missing:
        _log()
        _log("==============================================")
        _log("  ✗ 部分输出文件缺失，跳过拷贝步骤")
        _log("==============================================")
        return 1

    # ── Step 5: 拷到平台 input/ ──
    # 只有全部产物齐全才走到这里 —— 半份数据覆盖上去比不覆盖更难查。
    _log()
    _log("==============================================")
    _log("  拷贝到目标路径")
    _log("==============================================")
    pmis_target = os.path.join(platform_dir, "input", "pmis")
    input_target = os.path.join(platform_dir, "input")
    os.makedirs(pmis_target, exist_ok=True)
    os.makedirs(input_target, exist_ok=True)
    for f in PMIS_FILES:
        shutil.copy2(os.path.join(script_dir, f), os.path.join(pmis_target, f))
        _log("  → %s" % os.path.join(pmis_target, f))
    for f in INPUT_FILES:
        shutil.copy2(os.path.join(script_dir, f), os.path.join(input_target, f))
        _log("  → %s" % os.path.join(input_target, f))

    _log()
    _log("==============================================")
    _log("  流水线完成")
    _log("==============================================")
    _log("  备份目录: %s" % backup_dir)
    _log("  PMIS 报表: %s" % pmis_target)
    _log("  分析数据: %s" % input_target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
