#!/bin/bash
cd "$(dirname "$0")"
echo "============================================"
echo "  项目回款跟踪与管控平台 - 启动服务"
echo "============================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 未检测到 Python3，请先安装 Python 3.8+"
    exit 1
fi

# Check if port 8080 is occupied, kill old process and restart
if lsof -i :8080 &> /dev/null; then
    echo "⚠️ 端口 8080 已被占用，正在终止旧进程..."
    PID=$(lsof -t -i :8080)
    if [ -n "$PID" ]; then
        kill -9 $PID 2>/dev/null
        echo "✅ 旧进程(PID: $PID)已终止，等待端口释放..."
        sleep 2
    fi
fi

echo "正在启动本地服务（后台运行）..."
nohup python3 server.py > /dev/null 2>&1 &
echo "等待服务启动..."
sleep 3

echo "正在打开浏览器..."
open http://localhost:8080
echo ""
echo "✅ 服务已在后台启动！浏览器将自动打开平台页面。"
echo ""
echo "💡 如需停止服务，请双击运行 "停止服务.command""
echo ""
sleep 2
exit 0
