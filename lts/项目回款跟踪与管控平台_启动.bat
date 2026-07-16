@echo off
chcp 65001 >nul
echo ============================================
echo   项目回款跟踪与管控平台 - 启动服务
echo ============================================
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo 未检测到 Python，请先安装 Python 3.8+
    echo    下载地址: https://www.python.org/downloads/
    echo.
    echo 10秒后自动关闭...
    timeout /t 10 >nul
    exit /b 1
)

:: Check if port 8080 is occupied, kill old process and restart
netstat -ano | findstr ":8080 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo 端口 8080 已被占用，正在终止旧进程...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
        taskkill /f /pid %%a >nul 2>&1
    )
    echo 旧进程已终止，等待端口释放...
    timeout /t 2 >nul
)

echo 正在启动本地服务（后台运行）...
start "" pythonw "%~dp0server.py"
echo 等待服务启动...
timeout /t 3 >nul

echo 服务已在后台启动！浏览器将自动打开平台页面。
echo.
echo 如需停止服务，请双击运行 "停止服务.bat"
echo 如遇问题，请查看 log\server.log 日志文件
echo.
timeout /t 2 >nul
exit /b 0
