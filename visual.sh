#!/usr/bin/env bash
# visual.sh —— 视觉验证:起服务、逐页截图、收集 console 错误。
#
# ★ 为什么单独一个入口、【不】并进 verify.sh:
#   它要起服务、要登录、要真实数据,跑一轮几十秒;而 verify.sh 那个合并闸门本来就有
#   两种已知 flake(test_server_download 竞态 + budget socket 抖动),再塞一条更不稳。
#   一个会随机变红的闸门会训练人「先假设是 flake」,那正是漏掉真缺陷的姿势。
#   → 发版前手动跑这个;日常提交仍只跑 verify.sh。
#
# ★ 它补的是 jsdom 补不了的那一层:本仓凡是「颜色 / 高度 / 绘制 / 真实挂载时机」类
#   缺陷,单测一次都没逮到过(V4.5.13 的 CSS 注释吞过渡躺了一个多月)。
#
# 用法:
#   VISUAL_ACCOUNT=xxx VISUAL_PASSWORD=yyy bash visual.sh
#   VISUAL_ACCOUNT=xxx VISUAL_PASSWORD=yyy bash visual.sh --only payment-board,yitian
#   bash visual.sh                      # 不给凭证 → 只拍登录页,并明确列出跳过了哪些
#
# 可选环境变量:
#   CHROME_PATH               浏览器路径(默认按平台探测常见位置)
#   VISUAL_PORT               起服务用的端口(默认 8099,避开 8080 免得和你开着的实例打架)
#   VISUAL_BASE_URL           已有服务时直接指过去,本脚本就不再自己起
#   VISUAL_PROJECT_ID         项目详情页要拍就给一个真实项目号(不给则跳过并说明)
#   VISUAL_CLOSED_PROJECT_ID  已关闭项目详情页同理
#
# 凭证只走环境变量。本仓是 public,账号密码绝不落文件。
set -u
cd "$(dirname "$0")" || exit 1

PORT="${VISUAL_PORT:-8099}"
OWN_SERVER=0

if [ -x ".venv/Scripts/python.exe" ]; then PY=".venv/Scripts/python.exe"
elif [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"
elif command -v python >/dev/null 2>&1; then PY=python
elif command -v python3 >/dev/null 2>&1; then PY=python3
else echo "[FAIL] 未找到 python"; exit 1; fi

echo "==> [1/3] 前置检查"
if [ ! -d frontend/node_modules/puppeteer-core ]; then
  echo "    [FAIL] 缺 puppeteer-core。先 cd frontend && npm install"
  echo "           (它在 frontend/package.json 的 devDependencies 里;2026-08-31 之前"
  echo "            它是手工装的孤儿,一次 npm ci 就会消失 —— 现已正式声明。)"
  exit 1
fi
if [ ! -f frontend/dist/index.html ]; then
  echo "    [FAIL] 缺 frontend/dist —— server.py 静态服务没有可发的产物。"
  echo "           先 cd frontend && npm run build"
  exit 1
fi
echo "    OK"

echo "==> [2/3] 服务"
if [ -n "${VISUAL_BASE_URL:-}" ]; then
  echo "    用已有服务:$VISUAL_BASE_URL"
else
  export VISUAL_BASE_URL="http://127.0.0.1:${PORT}"
  # 不走 server.main():那条会在桌面建快捷方式(.lnk)、自动开浏览器、清理端口。
  # 视觉验证不该在用户机器上留下这些痕迹。
  mkdir -p report/visual
  # 服务端日志分流到文件:混进 stdout 会把截图结果淹掉,看不清哪页出了问题
  "$PY" - "$PORT" > report/visual/server.log 2>&1 <<'PYEOF' &
import sys, os
sys.path.insert(0, os.getcwd())
import server
srv = server.create_server(host='127.0.0.1', port=int(sys.argv[1]))
try:
    srv.serve_forever()
finally:
    srv.server_close()
PYEOF
  SRV_PID=$!
  OWN_SERVER=1
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null --noproxy '*' --max-time 2 "$VISUAL_BASE_URL/" 2>/dev/null; then break; fi
    sleep 0.25
  done
  echo "    已起 $VISUAL_BASE_URL (pid $SRV_PID)"
fi

cleanup() {
  if [ "$OWN_SERVER" = "1" ] && [ -n "${SRV_PID:-}" ]; then
    kill "$SRV_PID" 2>/dev/null
    wait "$SRV_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

echo "==> [3/3] 截图"
node tools/visual/capture.js "$@"
rc=$?

echo "---------------------------------------------"
if [ "$rc" -eq 0 ]; then
  echo "[PASS] 视觉验证跑完,无 console 错误 ✓"
  echo "       ★ 但零错误【不等于】长得对 —— 截图仍需人眼看一遍。"
  echo "         这套工具解决的是「能不能看」,不是「替你看」。"
else
  echo "[FAIL] 有页面报错或拍不下来 ✕"
fi
exit "$rc"
