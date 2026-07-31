"""打包最小增量更新包(纯代码 + /pm 前端 dist + pmisdata 脚本 + 升级手册)。

与 make_deploy_zip.py(全新安装整包)区别:本脚本刻意**不含** data/、input/、tests/、docs/、
node_modules/、fonts/——升级不覆盖服务器现有数据/账号/输入,只更新代码与前端产物。

前置: frontend/dist 必须是 **--base=/pm/** 构建(否则线上 /pm 部署白屏)。本脚本只打包,不构建;
      运行前先在开发机用 PowerShell 执行:  cd frontend; npx vite build --base=/pm/
      (Git Bash 会把 /pm/ 篡改成 Windows 路径,务必用 PowerShell 或 MSYS_NO_PATHCONV=1)
      校验:  grep -o '/pm/assets[^"]*' frontend/dist/index.html | head -1
用法: python make_update_zip.py
产物: release/pmplatform-update-<版本>.zip(版本取自 frontend/src/version.ts;解压出
      pmplatform-update-<版本>/ 顶层目录)。release/ 已 gitignore。
"""
import glob
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))


def _app_version() -> str:
    """从前端单一来源 frontend/src/version.ts 读 APP_VERSION,避免文件名版本漂移。"""
    vt = os.path.join(ROOT, "frontend", "src", "version.ts")
    try:
        with open(vt, "r", encoding="utf-8") as f:
            m = re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", f.read())
        if m:
            return m.group(1)
    except OSError:
        pass
    return "unknown"


VERSION = _app_version()
TOP = f"pmplatform-update-{VERSION}"  # 解压后顶层目录名
OUT_DIR = os.path.join(ROOT, "release")
OUT = os.path.join(OUT_DIR, f"pmplatform-update-{VERSION}.zip")

# 顶层根 .py:全部后端运行代码(glob 保证不漏新模块,如 pmis_config.py);排除打包脚本自身
_PY_EXCLUDE = {"make_deploy_zip.py", "make_update_zip.py"}
TOP_PY = sorted(
    os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.py"))
    if os.path.basename(p) not in _PY_EXCLUDE
)
# 顶层其它随包文件(依赖参考 + 升级手册)
EXTRA_FILES = ["requirements.txt", os.path.join("deploy", f"升级手册-{VERSION}.md")]
# pmisdata 按白名单纳入。pmisdata/ 不是开发机专属工具 —— server.py 的「下载数据」
# 会在服务器上真的执行 run_pmis_pipeline.sh(PMISDATA_DIR 见 server.py),所以脚本
# 变了确实需要随升级包下发。
#
# 【但 config.json 与 A.xlsx 刻意【不】进升级包】(V4.5.9 起):
#   · config.json 存 PMIS 会话 cookie,服务器上那份是超管在页面里贴进去的
#     (/api/pmis/cookie → pmis_config.py)。把开发机这份覆盖过去 = 拿开发机的
#     cookie 顶掉生产的,「下载数据」随即失效,而报错长得像「PMIS 登录过期」,
#     没人会想到是升级覆盖的。
#   · A.xlsx 是售前↔原项目桥接表,服务器侧可能比开发机新,覆盖即回退业务数据。
#   · 顺带:升级包常经邮件/网盘转手,里面不该带任何凭证。
# 全新安装的整包(make_deploy_zip.py)是另一回事 —— 那时服务器上本来就什么都没有。
PMISDATA_FILES = [
    "run_pmis_pipeline.sh", "fetch_pmis_tables.py", "fetch_all_projects.py",
    "delivery_analysis.py", "update_cookie.py",
]

os.makedirs(OUT_DIR, exist_ok=True)
added = 0
missing = []
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in TOP_PY:
        z.write(os.path.join(ROOT, f), os.path.join(TOP, f))
        added += 1
    for rel in EXTRA_FILES:
        p = os.path.join(ROOT, rel)
        if os.path.isfile(p):
            z.write(p, os.path.join(TOP, rel))
            added += 1
        else:
            missing.append(rel)
    # 前端 dist(须 /pm 构建)
    dist = os.path.join(ROOT, "frontend", "dist")
    if not os.path.isdir(dist):
        missing.append("frontend/dist")
    else:
        for cur, _dirs, files in os.walk(dist):
            for f in files:
                ab = os.path.join(cur, f)
                rel = os.path.relpath(ab, ROOT)
                z.write(ab, os.path.join(TOP, rel))
                added += 1
    for f in PMISDATA_FILES:
        p = os.path.join(ROOT, "pmisdata", f)
        if os.path.isfile(p):
            z.write(p, os.path.join(TOP, "pmisdata", f))
            added += 1
        else:
            missing.append(f"pmisdata/{f}")

# 校验 dist 是否 /pm 构建
index_html = os.path.join(ROOT, "frontend", "dist", "index.html")
pm_ok = False
if os.path.isfile(index_html):
    with open(index_html, "r", encoding="utf-8") as f:
        pm_ok = '="/pm/assets' in f.read()

size_mb = os.path.getsize(OUT) / 1048576
print(f"[OK] {OUT}")
print(f"  files {added}, size {size_mb:.2f} MB")
print(f"  dist /pm 构建: {'是' if pm_ok else '否(警告:疑似非 /pm 构建,线上会白屏!)'}")
if missing:
    print("  [WARN] 缺失(已跳过): " + ", ".join(missing))
