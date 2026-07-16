"""pytest 根配置：把项目根目录加入 sys.path，使测试能 `import preprocess_data`。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 排除 LTS 精简副本子树:lts/ 是自包含副本(自带独立 verify.sh + conftest),由 lts/verify.sh 单独验。
# 必须用 collect_ignore=["lts"](忽略整个目录、不下降),不能用 collect_ignore_glob=["lts/*"]:
#   后者只跳过 lts 的子项收集,pytest 仍会「进入 lts/ 并加载 lts/conftest.py」,而该 conftest 会
#   `sys.path.insert(0, lts目录)` 把 lts/ 抢到 sys.path 最前 —— 于是 master tests/ 里的 `import server`
#   会解析到 lts/server.py(已删 budget 等域)导致大批 AttributeError;同时两棵 tests/ 同名文件无 __init__.py
#   还会触发 "import file mismatch"。忽略整个目录可一并规避这两类污染。
collect_ignore = ["lts"]
