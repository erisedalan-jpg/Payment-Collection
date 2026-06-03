#!/usr/bin/env bash
# init.sh — 一键搭建开发环境（harness 生命周期层）
# 用法：bash init.sh
# 做的事：创建 .venv → 安装开发依赖 → 安装 Playwright 浏览器 → 浏览器检测
set -euo pipefail
cd "$(dirname "$0")"

# 选 python
if command -v python >/dev/null 2>&1; then PY=python
elif command -v python3 >/dev/null 2>&1; then PY=python3
else echo "[FAIL] 未找到 python，请先安装 Python 3.8+"; exit 1; fi
echo "==> 使用解释器: $($PY --version 2>&1)"

# 1) 创建虚拟环境
if [ ! -d .venv ]; then
  echo "==> 创建虚拟环境 .venv"
  "$PY" -m venv .venv
else
  echo "==> .venv 已存在，跳过创建"
fi

# venv 内 python 路径（兼容 Windows 的 Scripts 与 *nix 的 bin）
if [ -x ".venv/Scripts/python.exe" ]; then VPY=".venv/Scripts/python.exe"
elif [ -x ".venv/bin/python" ]; then VPY=".venv/bin/python"
else echo "[FAIL] .venv 创建异常，未找到 python"; exit 1; fi

# 2) 安装依赖
echo "==> 升级 pip 并安装开发依赖 (requirements-dev.txt)"
"$VPY" -m pip install --upgrade pip -q
"$VPY" -m pip install -r requirements-dev.txt

# 3) 安装 Playwright 浏览器（同步功能需要）
echo "==> 安装 Playwright Chromium"
"$VPY" -m playwright install chromium || echo "[WARN] playwright install 失败，同步功能不可用时请手动重试"

# 4) 浏览器检测（打包模式同步会用到系统 Chrome/Edge）
echo "==> 检测系统浏览器 (Chrome/Edge)"
if [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ] \
   || [ -f "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ]; then
  echo "    OK: 检测到 Google Chrome"
elif [ -f "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" ] \
   || [ -f "/c/Program Files/Microsoft/Edge/Application/msedge.exe" ]; then
  echo "    OK: 检测到 Microsoft Edge"
else
  echo "    [WARN] 未检测到 Chrome/Edge，打包版同步功能需要其一"
fi

echo "---------------------------------------------"
echo "环境就绪。后续："
echo "  验证：bash verify.sh"
echo "  启动：$VPY server.py    （或 python server.py）"
