"""L-59 防复发:两个打包脚本的根 `.py` 清单必须靠 glob 收全,不能退回硬编码白名单。

为什么值得单开一个守卫:`make_deploy_zip.py` 的 TOP_FILES 原本是手写清单,实测漏了
**27 个**根 `.py`(全部 lanxin*、全部 yitian*、followup_store/audit/portal/budget_* …)。
后果是全新安装包解压后服务【启动即 ImportError】—— 但它只在真正做全新安装时才暴露,
日常升级走 make_update_zip.py(那边一开始就是 glob),于是这条债躺到 2026-08-02 才被发现。

这里【不 import 被测模块】:两个打包脚本在模块级就直接开始写 zip,import 即会打包
(deploy 包还会把整个 data/ input/ 装进去)。改用 AST 静态解析。
"""
import ast
import glob
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = ["make_deploy_zip.py", "make_update_zip.py"]


def _tree(name):
    with io.open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return ast.parse(f.read())


def _assign(tree, var):
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
                getattr(t, "id", None) == var for t in node.targets):
            return node
    return None


def _str_consts(node):
    return [c.value for c in ast.walk(node)
            if isinstance(c, ast.Constant) and isinstance(c.value, str)]


def test_both_packagers_collect_root_py_via_glob():
    for name in SCRIPTS:
        tree = _tree(name)
        node = _assign(tree, "TOP_PY")
        assert node is not None, "%s 应有 TOP_PY(用 glob 收全部根 .py)" % name
        assert "glob" in ast.dump(node), \
            "%s 的 TOP_PY 必须用 glob 收全;硬编码白名单曾漏掉 27 个模块(L-59)" % name


def test_no_hardcoded_py_filenames_in_manifests():
    """清单里出现任何 `.py` 字面量 = 有人又开始手写白名单了 —— 这正是 L-59 的形态。"""
    for name in SCRIPTS:
        tree = _tree(name)
        for var in ("TOP_FILES", "TOP_OTHER", "EXTRA_FILES"):
            node = _assign(tree, var)
            if node is None:
                continue
            hard = [s for s in _str_consts(node) if s.endswith(".py")]
            assert not hard, \
                "%s 的 %s 里硬编码了 .py 文件名 %s;根 .py 应由 TOP_PY 的 glob 收全" % (name, var, hard)


def test_exclude_lists_agree_and_are_minimal():
    """两个脚本排除的都只该是打包脚本自身。多排除一个 = 目标机少一个模块。"""
    expect = {"make_deploy_zip.py", "make_update_zip.py"}
    for name in SCRIPTS:
        node = _assign(_tree(name), "_PY_EXCLUDE")
        assert node is not None, "%s 应显式声明 _PY_EXCLUDE" % name
        assert set(_str_consts(node)) == expect, \
            "%s 的 _PY_EXCLUDE 应恰为两个打包脚本自身" % name


def test_repo_root_py_count_is_sane():
    """自证规模:上面三条都靠解析源码,若解析口径失效(变量改名等)会退化成空集合恒真。
    这条钉住「仓库根确实有一批 .py」这个前提 —— 数量掉到个位数说明扫描路径已失效。"""
    root_py = [os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.py"))]
    assert len(root_py) >= 40, "仓库根 .py 只剩 %d 个,扫描路径疑似失效" % len(root_py)
    assert "server.py" in root_py and "followup_store.py" in root_py
