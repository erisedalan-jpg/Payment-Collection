@echo off
chcp 65001 >nul
REM 先尝试优雅停止服务（模糊匹配PaymentReviewApp开头的exe）
for /f "tokens=2" %%i in ('tasklist /NH 2^>nul ^| findstr /I "PaymentReviewApp"') do (
    taskkill /PID %%i >nul 2>&1
)
REM 等待2秒让进程优雅退出
ping -n 3 127.0.0.1 >nul 2>&1
REM 强制杀掉仍未退出的PaymentReviewApp相关进程
for /f "tokens=2" %%i in ('tasklist /NH 2^>nul ^| findstr /I "PaymentReviewApp"') do (
    taskkill /F /PID %%i >nul 2>&1
)
