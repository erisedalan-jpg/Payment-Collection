# 部署运行手册 —— Ubuntu 24.04 + 端口 80 + 路径前缀 /pm

> 目标:部署到 Ubuntu 24.04.1 LTS,对外端口 80,首页地址 **http://<服务器IP>/pm**。
> 架构:**nginx(80) → 反代 → app(127.0.0.1:8080,systemd 托管)**;前端以 `base=/pm/` 构建挂在 /pm 下,
>       接口/数据(/api、/data)走根路径由 nginx 转发给 app。
> 配套:`deploy/pmplatform.service`(systemd)、`deploy/nginx-pmplatform-port80-pm.conf`(nginx)、
>       仓库根 `reset_super_password.py`(改超管口令)。

> 端口 80 = 明文 HTTP:会话 cookie 与全部数据在网络上不加密,任何能嗅探网段者可截获会话。
> 仅限**可信内网**使用。不可信网络请改 443 + TLS(见 `deploy/nginx-pmplatform.conf` 的 ssl 段,/pm 结构不变)。

---

## /pm 路径前缀做了什么(原理,便于排障)
- 前端用 `--base=/pm/` 构建 → index.html 资源引用 `/pm/assets/...`;Vue Router 经 `import.meta.env.BASE_URL` 自动以 `/pm/` 为 base;**所有接口/数据请求也都加了 `/pm` 前缀**(经 `lib/baseUrl.apiUrl`,如 `/pm/api/login`、`/pm/data/analysis_data.json`)。默认 `/` 构建时这些前缀为空,行为不变。
- nginx:**唯一一个 `/pm/` location**,把 `/pm/xxx` 去掉前缀转给 app(`proxy_pass http://127.0.0.1:8080/` 末尾的 / 负责重写)。本系统**完全不占用根路径 `/api`、`/data`**,可与同机其它系统共存。
- 故 app(server.py)无需改动,继续绑 127.0.0.1:8080、以根提供 SPA + /api + /data;前缀的加/去全在前端构建与 nginx 两端完成。

## 1. 系统准备
```bash
sudo apt update && sudo apt install -y python3-venv nginx git
sudo useradd -r -s /usr/sbin/nologin pmapp        # 专用低权用户(不可登录 shell)
sudo timedatectl set-timezone Asia/Shanghai        # 固定东八区(回款延期判定依赖)
sudo mkdir -p /opt/pmplatform
```
(Ubuntu 24.04 自带 Python 3.12;本应用 Python 3.8+ 即可,schema 用 pydantic v2 的 model_validate,3.12 兼容。)

## 2. 放代码 + 构建前端(base=/pm/)
后端运行需要 `frontend/dist`。两种方式取一:
- A. 服务器上构建(需 Node 18+):
  ```bash
  sudo git clone <仓库地址> /opt/pmplatform        # 或 scp 上传
  cd /opt/pmplatform/frontend && npm ci
  npm run build -- --base=/pm/                      # 关键:/pm 前缀;产出 frontend/dist
  ```
- B. 开发机构建后传产物:本地 `cd frontend && npm run build -- --base=/pm/`,把整个仓库(含 frontend/dist)scp/rsync 到 /opt/pmplatform(服务器免装 Node)。
  - Windows Git Bash 下 `--base=/pm/` 会被 MSYS 误转成 `/Program Files/Git/pm/`;改用 `MSYS_NO_PATHCONV=1 npm run build -- --base=/pm/`,或在 PowerShell/cmd 下构建。Linux 无此问题。
  - 校验产物:`grep assets frontend/dist/index.html` 应看到 `/pm/assets/...`。

```bash
sudo chown -R pmapp:pmapp /opt/pmplatform          # data/ 须 pmapp 可写
```

## 3. Python 环境(依赖瘦身)
常驻 web 服务只需 Python 标准库;数据处理需 pydantic + openpyxl。**V1.16.2 起已移除 WPS,不再需要 playwright/chromium**。
```bash
sudo -u pmapp python3 -m venv /opt/pmplatform/.venv
sudo -u pmapp /opt/pmplatform/.venv/bin/pip install pydantic openpyxl
```

## 4. 准备数据
把 PMIS 9 表放 `input/pmis/`,各 CSV(collection_stages.csv/payment_records.csv/budget_data.csv/
profit_loss_*.csv/delivery_analysis.csv)、组织架构.xlsx、A.xlsx 放 `input/`。首次生成主数据:
```bash
sudo -u pmapp /opt/pmplatform/.venv/bin/python preprocess_data.py    # 产出 data/analysis_data.json
```
(上线后管理员也可在页面「数据管理 → 更新数据」重新处理;或由 cron 定时投放文件到 input/ 后触发。)

## 5. 改掉默认超管口令(P0-4,必做)
源码 auth.py 内置 3 个弱口令超管(admin 等),首次启动自动建号。上线前逐个改密(超管口令无法经 /admin 界面改):
```bash
sudo -u pmapp /opt/pmplatform/.venv/bin/python reset_super_password.py admin
sudo -u pmapp /opt/pmplatform/.venv/bin/python reset_super_password.py wangxutong
sudo -u pmapp /opt/pmplatform/.venv/bin/python reset_super_password.py zhangyingzhe
```
不需要的种子超管,建议在 auth.py 删除后再首启。

## 6. systemd 托管(app 绑 127.0.0.1:8080)
```bash
sudo cp /opt/pmplatform/deploy/pmplatform.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pmplatform
sudo systemctl status pmplatform          # 应为 active (running)
```
- 停止/重启:`sudo systemctl stop|restart pmplatform`(勿用 `python server.py --stop`,Linux 失效)。
- 日志:`journalctl -u pmplatform -f` 或 `/opt/pmplatform/log/server.log`。

## 7. nginx(端口 80 + /pm)
因服务器共享、本系统只接管 `/pm/`(不占根路径),**推荐把 `deploy/nginx-pmplatform-port80-pm.conf` 里的 `location /pm/` 片段粘进现有监听 80 的 server 块**(别的系统已有的那个),而非新增 catch-all server(`server_name _` 会抢占别的系统):
```bash
# 看现有站点(找到监听 80 的 server 块所在文件)
ls /etc/nginx/sites-enabled/  ;  sudo nginx -T | grep -n "listen 80" -A2
# 编辑那个文件,把 conf 中「用法 A」的 location = /pm 与 location /pm/ 两段粘进其 server { } 内
sudo nginx -t && sudo systemctl reload nginx
```
若本系统独占某域名/IP,则改用 conf 中「用法 B」的独立 server 块(填专用 server_name)。

## 8. 防火墙
```bash
sudo ufw allow 80/tcp                              # 或限网段: sudo ufw allow from 10.0.0.0/8 to any port 80
```

## 9. 上线验证清单
- [ ] systemctl status pmplatform = running;`curl -I http://<IP>/pm/` 返回 200;同机其它系统的根路径 `curl -I http://<IP>/` 不受影响
- [ ] 浏览器开 http://<IP>/pm → 登录页;用改后的超管口令登录,旧弱口令已失效
- [ ] 登录后各页路由形如 http://<IP>/pm/payment、刷新不 404(SPA fallback OK)
- [ ] Network 面板:/pm/assets/*.js 200;**/pm/data/analysis_data.json** 200 且响应头含 Content-Encoding: gzip;**/pm/api/auth/me** 200(都带 /pm 前缀)
- [ ] 新建受限管理员(限某 L4 + 页面):只看到其 L4 数据;`curl http://<IP>/pm/data/accounts.json -H Cookie:...` 返回 403;`/pm/api/clear-data` 等运维端点 403
- [ ] 「数据管理 → 更新数据」进度条实时刷新(SSE 透传 OK)

## 10. 数据备份(关键本地数据都在 data/)
```bash
0 2 * * * tar czf /backup/pmplatform-$(date +\%F).tgz -C /opt/pmplatform data/    # 每日 02:00
```
重点:data/accounts.json(口令哈希)、data/followup_records.json、data/project_tags.json、data/analysis_data.json、data/history/。

## 11. 安全与后续
- 强烈建议上 TLS:端口 80 明文,会话可被嗅探。内网可自签证书走 443(deploy/nginx-pmplatform.conf 已含 ssl 段,把 server_name 与 /pm location 套用);上 TLS 后给会话 cookie 补 Secure(auth.py:build_set_cookie)。
- P0-5 残留(无害,后续清理):server.py 自动开浏览器/停止按钮等死代码(无头机静默失败,见 PROGRESS backlog)。
- 性能:nginx gzip 已解决主数据传输;前端单 JS ~2.3MB 未代码分割(P1,后续可优化)。
