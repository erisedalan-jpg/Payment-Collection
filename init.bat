@echo off
chcp 65001 >nul
REM init.bat - 一键搭建开发环境（Windows 双击版，等价于 init.sh）
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [FAIL] 未找到 python，请先安装 Python 3.8+
  pause
  exit /b 1
)

if not exist ".venv" (
  echo ==^> 创建虚拟环境 .venv
  python -m venv .venv
) else (
  echo ==^> .venv 已存在，跳过创建
)

echo ==^> 升级 pip 并安装开发依赖
".venv\Scripts\python.exe" -m pip install --upgrade pip -q
".venv\Scripts\python.exe" -m pip install -r requirements-dev.txt

echo ==^> 安装 Playwright Chromium
".venv\Scripts\python.exe" -m playwright install chromium

echo ---------------------------------------------
echo 环境就绪。验证: bash verify.sh   启动: python server.py
pause
