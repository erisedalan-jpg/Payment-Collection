#!/usr/bin/env bash
# verify.sh — harness 验证层：声称"完成"前必须全绿。
# 用法：bash verify.sh
# 内容：1) py_compile 语法检查  2) ruff 静态检查(渐进式,仅拦真错误)  3) pytest 单元测试
set -u

# 选 python 解释器（优先 .venv）
if [ -x ".venv/Scripts/python.exe" ]; then PY=".venv/Scripts/python.exe"
elif [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"
elif command -v python >/dev/null 2>&1; then PY=python
elif command -v python3 >/dev/null 2>&1; then PY=python3
else echo "[FAIL] 未找到 python"; exit 1; fi

cd "$(dirname "$0")" || exit 1
fail=0

echo "==> [1/4] 语法编译检查 (py_compile)"
py_files=$(find . -name '*.py' -not -path './build/*' -not -path './dist/*' -not -path './.venv/*')
if "$PY" -m py_compile $py_files; then
  echo "    OK: 所有 .py 编译通过"
else
  echo "    [FAIL] 存在语法错误"; fail=1
fi

echo "==> [2/4] 静态检查 (ruff，配置见 ruff.toml)"
if "$PY" -c "import ruff" >/dev/null 2>&1 || command -v ruff >/dev/null 2>&1; then
  if "$PY" -m ruff check .; then
    echo "    OK: ruff 通过"
  else
    echo "    [FAIL] ruff 发现问题"; fail=1
  fi
else
  echo "    [SKIP] 未安装 ruff，跳过。安装：pip install ruff"
fi

echo "==> [3/4] 单元测试 (pytest)"
if "$PY" -c "import pytest" >/dev/null 2>&1; then
  if "$PY" -m pytest -q; then
    echo "    OK: 测试通过"
  else
    echo "    [FAIL] 测试未通过"; fail=1
  fi
else
  echo "    [SKIP] 未安装 pytest，跳过测试。安装：pip install pytest"
fi

echo "==> [4/4] 前端检查 (typecheck + vitest + build)"
if [ -f frontend/package.json ] && command -v npm >/dev/null 2>&1; then
  if [ ! -d frontend/node_modules ]; then
    echo "    [SKIP] frontend/node_modules 不存在，先运行 cd frontend && npm install"
  elif ( cd frontend && npm run typecheck --silent && npm run test:run --silent && npm run build --silent ); then
    echo "    OK: 前端检查通过"
  else
    echo "    [FAIL] 前端检查未通过"; fail=1
  fi
else
  echo "    [SKIP] 未检测到 frontend 或 npm，跳过前端检查"
fi

echo "---------------------------------------------"
if [ "$fail" -eq 0 ]; then
  echo "[PASS] verify.sh 全部通过 ✓"
  exit 0
else
  echo "[FAIL] verify.sh 存在失败项 ✕"
  exit 1
fi
