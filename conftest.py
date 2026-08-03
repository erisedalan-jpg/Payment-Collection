"""pytest 根配置：把项目根目录加入 sys.path，使测试能 `import preprocess_data`。"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import audit  # noqa: E402  —— 须在 sys.path 插入之后导入

# 排除 LTS 精简副本子树:lts/ 是自包含副本(自带独立 verify.sh + conftest),由 lts/verify.sh 单独验。
# 必须用 collect_ignore=["lts"](忽略整个目录、不下降),不能用 collect_ignore_glob=["lts/*"]:
#   后者只跳过 lts 的子项收集,pytest 仍会「进入 lts/ 并加载 lts/conftest.py」,而该 conftest 会
#   `sys.path.insert(0, lts目录)` 把 lts/ 抢到 sys.path 最前 —— 于是 master tests/ 里的 `import server`
#   会解析到 lts/server.py(已删 budget 等域)导致大批 AttributeError;同时两棵 tests/ 同名文件无 __init__.py
#   还会触发 "import file mismatch"。忽略整个目录可一并规避这两类污染。
#
# lanxin/ 同理:它是放在工作树里的【未跟踪】自包含副本(自带 server.py/projects.py/frontend/tests,
# 但没有自己的 conftest.py)。根 conftest 把仓库根抢到 sys.path 最前,于是 lanxin/tests 里的
# `import supervision_feedback` / `lanxin_resend` 等全部解析不到(那些模块在 lanxin/ 下,不在根),
# 12 个测试模块 ImportError,verify.sh 恒红。它不是本平台的组成部分,整目录忽略。
collect_ignore = ["lts", "lanxin"]


@pytest.fixture(autouse=True)
def _isolate_audit_log(tmp_path, monkeypatch):
    """L-29:把审计日志隔离到 tmp_path,阻断测试写真实 data/audit_log.jsonl。

    为什么要全局 autouse:大量测试是「起真服务 + 发写请求」的 HTTP 层测试,写审计是
    server 内部行为、测试本身并不知情,靠逐个文件记得 monkeypatch 不现实 —— 实测全仓
    只有 4 个文件隔离了,其余一路往真实文件里追加(2026-08-02 审查时该文件已 1.78MB,
    最后修改时间正是跑 verify.sh 的时刻)。

    归档目录一并隔离:audit 触发轮转时会 makedirs(AUDIT_ARCHIVE_DIR) 并写年份文件。

    已自行 monkeypatch 的那 4 个文件不受影响 —— 它们的 fixture 在本 fixture 之后生效,
    覆盖同一属性,语义不变。
    """
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
