@echo off
chcp 65001 >nul
echo ============================================
echo   📊 项目回款Review看板 - 数据同步
echo ============================================
echo.

echo [1/2] 从WPS云文档提取数据...
python "%~dp0fetch_yundocs_full.py"
if %errorlevel% neq 0 (
    echo ❌ 数据提取失败！
    pause
    exit /b 1
)

echo.
echo [2/2] 数据预处理...
python "%~dp0preprocess_data.py"
if %errorlevel% neq 0 (
    echo ❌ 数据预处理失败！
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✅ 同步完成！请刷新浏览器页面查看最新数据
echo ============================================
pause
