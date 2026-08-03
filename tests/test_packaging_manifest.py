"""L-59 防复发:三个分发清单(两个 zip 脚本 + PyInstaller .spec)的根 `.py` 必须靠 glob
收全,不能退回硬编码白名单;.spec 引用的数据源还必须真实存在。

为什么值得单开一个守卫:`make_deploy_zip.py` 的 TOP_FILES 原本是手写清单,实测漏了
**27 个**根 `.py`(全部 lanxin*、全部 yitian*、followup_store/audit/portal/budget_* …)。
后果是全新安装包解压后服务【启动即 ImportError】—— 但它只在真正做全新安装时才暴露,
日常升级走 make_update_zip.py(那边一开始就是 glob),于是这条债躺到 2026-08-02 才被发现。

**本守卫原先只看两个 zip 脚本、不看 .spec,而这正是同一条债能在 .spec 上复发的原因**:
`PaymentReviewApp.spec` 的 datas 同样是手写白名单,漏了 `collection_stages.py`
(它是 spec 末次提交之后才进管线的)—— exe 版点「更新数据」直接 ModuleNotFoundError。
同一份 spec 还引用了 4 个已被删除的文件,PyInstaller 对 datas 源缺失是硬错误,
也就是说这份 spec 早已【静态上就构建不出来】,只是没人跑构建所以没人知道。

这里【不 import / 不执行被测文件】:两个打包脚本在模块级就直接开始写 zip,import 即会
打包(deploy 包还会把整个 data/ input/ 装进去);.spec 则依赖 PyInstaller 注入的
Analysis/PYZ/EXE 等全局名,单独执行必 NameError。三者一律 AST 静态解析。
"""
import ast
import glob
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = ["make_deploy_zip.py", "make_update_zip.py"]
SPEC = "PaymentReviewApp.spec"
# 目标机用不到打包脚本自身;三份清单必须是同一套排除项
PY_EXCLUDE = {"make_deploy_zip.py", "make_update_zip.py"}


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


# ────────────────────────────────────────────────────────────
# PaymentReviewApp.spec(PyInstaller 单 exe 分发)
# ────────────────────────────────────────────────────────────

def _analysis_datas():
    """取 `Analysis(...)` 的 datas 实参节点。取不到返回 None —— 下面每条用例都显式
    断言它不是 None,否则解析口径一失效,基于它的检查就会退化成空集合恒真。"""
    for node in ast.walk(_tree(SPEC)):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Analysis":
            for kw in node.keywords:
                if kw.arg == "datas":
                    return kw.value
    return None


def _static_data_sources(datas):
    """datas 里【字面量写死】的源路径(二元组第一项是字符串常量的那些)。

    `[(f, '.') for f in TOP_PY]` 这类由 glob 派生的项,第一项是 Name 而非 Constant,
    不在此列 —— 它们的存在性由 glob 自身保证(glob 只会列出真实存在的文件)。"""
    out = []
    for t in ast.walk(datas):
        if isinstance(t, ast.Tuple) and len(t.elts) == 2:
            src = t.elts[0]
            if isinstance(src, ast.Constant) and isinstance(src.value, str):
                out.append(src.value)
    return out


def test_spec_collects_backend_scripts_via_glob():
    """.spec 的后端脚本清单必须 glob 收全。硬编码白名单曾漏掉 collection_stages.py:
    它只被 preprocess_data.py 模块级 import,server.py 的 import 头不含它,
    Analysis(['server.py']) 的导入图也就收不到 —— exe 版点「更新数据」必 ModuleNotFoundError,
    而开发模式走 subprocess、模块就在 cwd 里,本地永远测不出来(CLAUDE.md §5 两套代码路径)。"""
    tree = _tree(SPEC)
    node = _assign(tree, "TOP_PY")
    assert node is not None, "%s 应有 TOP_PY(用 glob 收全部根 .py)" % SPEC
    assert "glob" in ast.dump(node), \
        "%s 的 TOP_PY 必须用 glob 收全;硬编码白名单曾漏掉 collection_stages.py" % SPEC

    exc = _assign(tree, "_PY_EXCLUDE")
    assert exc is not None, "%s 应显式声明 _PY_EXCLUDE" % SPEC
    assert set(_str_consts(exc)) == PY_EXCLUDE, \
        "%s 的 _PY_EXCLUDE 应与两个 zip 脚本一致(恰为打包脚本自身);多排除一个 = exe 少一个模块" % SPEC

    datas = _analysis_datas()
    assert datas is not None, "%s 里没解析到 Analysis(datas=...)" % SPEC
    hard = [s for s in _static_data_sources(datas) if s.endswith(".py")]
    assert not hard, \
        "%s 的 datas 里硬编码了 .py 文件名 %s;根 .py 应由 TOP_PY 的 glob 收全" % (SPEC, hard)


def test_spec_data_sources_all_exist():
    """.spec 引用的每个 datas 源都必须真实存在。

    PyInstaller 对 datas 源缺失是【硬错误】(format_binaries_and_datas 找不到即
    SystemExit),所以清单里躺着已删除的文件 = 这份 spec 静态上就构建不出来。
    实测本仓曾同时躺着 4 个已删文件(pmis_download.py / fetch_yundocs_full.py /
    用户手册.md / 管理员手册.md),因为没人跑构建,烂了两个月没人知道。"""
    datas = _analysis_datas()
    assert datas is not None, "%s 里没解析到 Analysis(datas=...)" % SPEC
    srcs = _static_data_sources(datas)
    missing = [s for s in srcs if not os.path.exists(os.path.join(ROOT, s))]
    assert not missing, \
        "%s 的 datas 引用了不存在的源 %s;PyInstaller 遇到会直接构建失败" % (SPEC, missing)


def test_spec_scan_is_sane_and_imports_stdlib_only():
    """自证规模 + 顶层依赖闸。

    前两条都靠解析 datas,若解析口径失效(Analysis 改名、datas 挪进变量等),
    _static_data_sources 会退化成空列表、断言恒真。这里钉住「确实解析出了一批源」。

    顺带守住 .spec 的顶层 import:曾经是模块级 `import playwright as _pw` +
    collect_all('playwright'),而 Playwright 依赖 V1.16.2 就已从项目移除(CLAUDE.md §3)。
    模块级 import 第三方包意味着【构建机没装它连 spec 都读不下去】—— 而打包本来就常常
    换机器做。spec 只该依赖标准库。"""
    datas = _analysis_datas()
    assert datas is not None, "%s 里没解析到 Analysis(datas=...)" % SPEC
    srcs = _static_data_sources(datas)
    assert len(srcs) >= 7, \
        "只从 %s 的 datas 解析出 %d 个字面量源,解析口径疑似失效(上面两条会随之恒真)" % (SPEC, len(srcs))
    for must in ("frontend/dist", "app_icon.ico"):
        assert must in srcs, "%s 的 datas 应含 %s,当前解析结果: %s" % (SPEC, must, srcs)

    imported = set()
    for node in ast.walk(_tree(SPEC)):
        if isinstance(node, ast.Import):
            imported.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    extra = imported - {"os", "glob"}
    assert not extra, \
        "%s 顶层只应 import 标准库 os/glob,实际多出 %s;引入第三方包会让没装该包的构建机连 spec 都读不下去" \
        % (SPEC, sorted(extra))


def test_repo_root_py_count_is_sane():
    """自证规模:上面三条都靠解析源码,若解析口径失效(变量改名等)会退化成空集合恒真。
    这条钉住「仓库根确实有一批 .py」这个前提 —— 数量掉到个位数说明扫描路径已失效。"""
    root_py = [os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.py"))]
    assert len(root_py) >= 40, "仓库根 .py 只剩 %d 个,扫描路径疑似失效" % len(root_py)
    assert "server.py" in root_py and "followup_store.py" in root_py
