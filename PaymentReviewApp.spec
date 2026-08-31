# -*- mode: python ; coding: utf-8 -*-
# ============================================================
#  项目管理平台 - PyInstaller 打包配置
#  版本单一来源: frontend/src/version.ts —— 本文件【不再写死版本号】
#  (原头部写着「版本: V7.6.0 | 日期: 2026-06-12」,而实际版本早已到 V4.5.12,
#   注释版本号只会烂掉,不会有人记得同步)
#  用法: python -m PyInstaller PaymentReviewApp.spec --noconfirm  (在仓库根执行)
# ============================================================
import glob
import os

block_cipher = None
# 相对路径的 datas 项与下面的 glob 都以 cwd 为基准,故必须在仓库根执行构建。
BASE = os.path.abspath('.')

# ── 后端脚本:用 glob 收全,【不再硬编码白名单】 ──
#
# 原来是手写九个模块名(preprocess_data / pmis / projects / snapshots / data_history /
# milestones / profit / config / schema),漏了 collection_stages.py:
#   · collection_stages 只被 preprocess_data.py 模块级 import(preprocess_data.py:16),
#     server.py 的 import 头不含它 → Analysis(['server.py']) 的导入图收不到 → PYZ 里也没有;
#   · 于是 frozen 版点「更新数据」时 _run_script_direct 的 exec_module 抛
#     ModuleNotFoundError,页面只显示「更新失败: No module named 'collection_stages'」
#     —— exe 版更新数据完全不可用。
#   · 开发模式走 subprocess、模块就躺在 cwd 里,这个坑本地永远测不出来(CLAUDE.md §5)。
# 同款硬编码白名单在 make_deploy_zip.py 上已实测漏过 27 个模块(L-59),两个 zip 脚本
# 都已改成 glob;这里是最后一处,现在对齐。
#
# 新增模块不必再改这里;真要排除某个文件,加进 _PY_EXCLUDE 并写明理由。
_PY_EXCLUDE = {'make_deploy_zip.py', 'make_update_zip.py'}   # 打包脚本自身,目标机用不到
TOP_PY = sorted(
    os.path.basename(p) for p in glob.glob(os.path.join(BASE, '*.py'))
    if os.path.basename(p) not in _PY_EXCLUDE
)

# ============================================================
# Analysis - 收集所有依赖
# ============================================================
a = Analysis(
    ['server.py'],
    # client/ 也进 pathex:让 PyInstaller 把 cookie_core 当普通模块收进 PYZ,
    # 打包态 `import cookie_core` 直接可用(开发态由 server.py 把 client/ 加进 sys.path)。
    pathex=[BASE, os.path.join(BASE, 'client')],
    binaries=[],
    datas=[
        # ── 前端构建产物（Vue3+Vite，U1 迁移后替代旧 index.html/style.css/app.js/lib） ──
        ('frontend/dist', 'dist'),
        # ── 图标/Logo ──
        ('app_icon.ico', '.'),
        ('app_logo.png', '.'),
        # ── 字体（Web 字体文件） ──
        ('fonts', 'fonts'),
        # ── 启停脚本（停止服务.py 由上面的 TOP_PY 收，此处只列非 .py 的） ──
        ('sync_data.bat', '.'),
        ('停止服务.bat', '.'),
        ('停止服务.command', '.'),
        ('项目回款跟踪与管控平台_启动.bat', '.'),
        ('项目回款跟踪与管控平台_启动.command', '.'),
    # ── 后端脚本（全部根 .py，见上方 TOP_PY）──
    ] + [(f, '.') for f in TOP_PY],
    hiddenimports=[
        'openpyxl', 'xlrd', 'chardet', 'bs4', 'lxml',
        # requests:pmisdata 下载脚本与 cookie_core 都要它。主程序自身不 import,
        # 靠导入图收不到,必须显式列出,否则打出来的 exe 一取 cookie/一下载就 ImportError。
        'requests', 'urllib3', 'certifi', 'idna', 'charset_normalizer',
        # cookie_core:单机版服务端直接取 PMIS cookie(见 server.handle_pmis_cookie_fetch_local)
        'cookie_core',
        'csv', 'json', 'threading', 'webbrowser',
        'http.server', 'urllib.parse', 'io', 'shutil',
        'data_history',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    # exe 文件名刻意保持不变:桌面快捷方式/.vbs/.bat 构成的文件名兼容链依赖它
    # (2026-06-12 R4 更名计划明确记「PaymentReviewApp.spec exe 名不动，随下次打包专项再议」)。
    # 因此这里的 v7.6.0 是【历史文件名】而非当前版本号,当前版本见 frontend/src/version.ts。
    name='PaymentReviewApp_v7.6.0',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='app_icon.ico',
)
