# -*- mode: python ; coding: utf-8 -*-
# ============================================================
#  项目回款跟踪与管控平台 - PyInstaller 打包配置
#  版本: V7.6.0 | 日期: 2026-06-12
# ============================================================
import os, sys
block_cipher = None
BASE = os.path.abspath('.')

# ── Playwright 包路径（动态获取） ──
import playwright as _pw
_pw_pkg_dir = os.path.dirname(_pw.__file__)
_pw_driver_dir = os.path.join(_pw_pkg_dir, 'driver')
_pw_hook_dir = os.path.join(_pw_pkg_dir, '_impl', '__pyinstaller')

# collect_all 收集 playwright 所有子模块、数据文件和二进制文件
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_all
pw_datas, pw_binaries, pw_hiddenimports = collect_all('playwright')

# 确保 node.exe 作为二进制文件包含（playwright 运行时需要执行此文件）
_node_exe = os.path.join(_pw_driver_dir, 'node.exe')
if os.path.exists(_node_exe):
    pw_binaries.append((_node_exe, 'playwright/driver'))

# 补充 playwright 隐藏导入（含 async_api 和内部模块，确保冻结环境下正常加载）
pw_hiddenimports += [
    'greenlet',
    'pyee',
    'pyee._base',
    'playwright.sync_api',
    'playwright.async_api',
    'playwright._impl._path_utils',
    'playwright._impl._api_types',
    'playwright._impl._driver',
    'playwright._impl._api_structures',
    'playwright._impl._connection',
    'playwright._impl._transport',
    'playwright._impl._playwright',
    'playwright._impl._browser',
    'playwright._impl._page',
    'playwright._impl._frame',
    'playwright._impl._js_handle',
    'playwright._impl._network',
    'playwright._impl._helper',
    'playwright._impl._object_factory',
    'playwright._impl._event_context_manager',
]

# ============================================================
# Analysis - 收集所有依赖
# ============================================================
a = Analysis(
    ['server.py'],
    pathex=[BASE],
    binaries=pw_binaries,
    datas=[
        # ── 前端构建产物（Vue3+Vite，U1 迁移后替代旧 index.html/style.css/app.js/lib） ──
        ('frontend/dist', 'dist'),
        # ── 图标/Logo ──
        ('app_icon.ico', '.'),
        ('app_logo.png', '.'),
        # ── 字体（Web 字体文件） ──
        ('fonts', 'fonts'),
        # ── 后端脚本 ──
        ('preprocess_data.py', '.'),
        ('pmis.py', '.'),
        ('projects.py', '.'),
        ('snapshots.py', '.'),
        ('data_history.py', '.'),
        ('write_followup.py', '.'),
        ('milestones.py', '.'),
        ('profit.py', '.'),
        ('pmis_download.py', '.'),
        ('config.py', '.'),
        ('schema.py', '.'),
        ('fetch_yundocs_full.py', '.'),
        ('sync_data.bat', '.'),
        # ── 启停脚本 ──
        ('停止服务.bat', '.'),
        ('停止服务.command', '.'),
        ('停止服务.py', '.'),
        ('项目回款跟踪与管控平台_启动.bat', '.'),
        ('项目回款跟踪与管控平台_启动.command', '.'),
        # ── 用户文档 ──
        ('用户手册.md', '.'),
        ('管理员手册.md', '.'),
    ] + pw_datas,
    hiddenimports=[
        'openpyxl', 'xlrd', 'chardet', 'bs4', 'lxml',
        'csv', 'json', 'threading', 'webbrowser',
        'http.server', 'urllib.parse', 'io', 'shutil',
        'data_history',
    ] + pw_hiddenimports,
    hookspath=[_pw_hook_dir],
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