"""打包服务器部署 zip:含运行所需全部代码 + frontend/dist(/pm 构建) + 全部数据文件(data/、input/)。
排除 node_modules/.git/.venv/__pycache__/build/docs/log/tests 等无关项。
用法: python make_deploy_zip.py
产物: pmplatform-deploy-<版本>.zip(版本取自 frontend/src/version.ts;解压出 pmplatform/ 顶层目录)。"""
import glob
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))


def _app_version() -> str:
    """从前端单一来源 frontend/src/version.ts 读 APP_VERSION,避免文件名版本漂移。读不到则回退 unknown。"""
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
OUT = os.path.join(ROOT, f"pmplatform-deploy-{VERSION}.zip")
TOP = "pmplatform"  # 解压后顶层目录名

# 顶层 .py:用 glob 收全,【不再硬编码白名单】(L-59)。
#
# 原来是手写清单,实测漏了 27 个根 `.py` —— 全部 lanxin*(12 个)、全部 yitian*(9 个)、
# followup_store / audit / portal / budget_config / budget_store / payment_key_followup /
# risk_followup / followup_columns / product_category / 停止服务.py。后果是全新安装包解压
# 后服务【启动即 ImportError】,而且只在真正做全新安装时才暴露 —— 日常升级走
# make_update_zip.py(那边一开始就是 glob),所以这条债躺了很久没被触发。
#
# 新增模块时不需要再来改这里;真要排除某个文件,加进 _PY_EXCLUDE 并写明理由。
_PY_EXCLUDE = {"make_deploy_zip.py", "make_update_zip.py"}   # 打包脚本自身,目标机用不到
TOP_PY = sorted(
    os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.py"))
    if os.path.basename(p) not in _PY_EXCLUDE
)
# 顶层要打包的非 .py 文件(运行/部署所需 + 参考)
TOP_OTHER = [
    "requirements.txt", "requirements-dev.txt", "ruff.toml",
    "verify.sh", "schema.json", "feature_list.json", "CLAUDE.md", "PROGRESS.md",
    "app_icon.ico", "app_logo.png",
]
TOP_FILES = TOP_PY + TOP_OTHER
# 顶层要打包的目录(递归;内部 SKIP_DIRS 名跳过)
TOP_DIRS = ["frontend", "deploy", "data", "input", "fonts"]
SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".pytest_cache", ".cache"}

# pmisdata 按白名单纳入(避免打进时间戳备份目录与日志)
PMISDATA_FILES = [
    "run_pmis_pipeline.sh", "fetch_pmis_tables.py", "fetch_all_projects.py",
    "delivery_analysis.py", "update_cookie.py", "config.json", "A.xlsx",
]

added = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in TOP_FILES:
        p = os.path.join(ROOT, f)
        if os.path.isfile(p):
            z.write(p, os.path.join(TOP, f))
            added += 1
    for d in TOP_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for cur, dirs, files in os.walk(base):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
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

size_mb = os.path.getsize(OUT) / 1048576
print(f"[OK] {OUT}")
print(f"  files {added}, size {size_mb:.1f} MB")
