@echo off
cd /d "%~dp0"
python gui_client.py
if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Start failed. Possible reasons:
  echo    1) Python not installed or not in PATH
  echo    2) Missing dependency: pip install requests
  echo    3) gui_client.py not in the same folder as this bat
  echo.
  echo  Press any key to keep this window open and review errors.
  echo ============================================================
  pause >nul
)
