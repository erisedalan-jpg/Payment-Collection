# 部署运行手册（离线环境）—— Ubuntu 24.04 + 端口 80 + 路径前缀 /pm

> 目标:在**纯离线**的 Ubuntu 24.04.1 LTS 服务器上部署,对外端口 80,首页 **http://<服务器IP>/pm**。
> 架构:**nginx(80) → 反代 → app(127.0.0.1:8080, systemd 托管)**;本系统只接管 `/pm/`,不占用根路径(可与同机其它系统共存)。
> 部署包:`pmplatform-deploy-V1.16.4.zip`(已含全部代码、**已用 /pm 构建的 frontend/dist**、全部数据 data/ 与 input/、deploy/ 物料、预制超管账号)。

> ★ 离线原则:本环境**不能联网**,凡需 apt/pip/npm 联网的步骤都改成「**先用检查命令判断是否已满足**」——
>   满足则跳过;**不满足**才按本手册末尾「§10 离线升级方案」在可联网机器下载离线包、拷贝过来安装。
> ★ 账号:**无需重置超管口令**,部署包内 `data/accounts.json` 已是预制账号,直接用预制口令登录即可。
> ★ 前端无需在服务器构建:dist 已随包构建好(/pm),**服务器免装 Node**。

---

## 0. /pm 路径前缀原理(便于排障)
- 前端已用 `--base=/pm/` 构建:资源 `/pm/assets/...`、路由 base `/pm/`、所有接口/数据请求都带 `/pm` 前缀(`/pm/api`、`/pm/data`)。
- nginx 只一个 `/pm/` location,把 `/pm/xxx` 去前缀转给 app(`proxy_pass http://127.0.0.1:8080/` 末尾 `/`)。本系统不碰根 `/`、`/api`、`/data`。
- app(server.py)无需改动,绑 127.0.0.1:8080、以根提供 SPA + /api + /data。

## 1. 环境检查(逐项;不通过才离线升级,见 §10)
在服务器上依次执行,记录每项 OK / 需升级:
```bash
# 1) 操作系统
cat /etc/os-release | grep VERSION_ID            # 期望 24.04

# 2) Python ≥ 3.8(Ubuntu 24.04 自带 3.12,通常 OK)
python3 --version                                # 期望 Python 3.8+ ;不达标→§10-A

# 3) venv 模块(创建虚拟环境必需)
python3 -m venv --help >/dev/null 2>&1 && echo "venv OK" || echo "需装 python3-venv → §10-B"

# 4) nginx(反代必需)
command -v nginx >/dev/null && nginx -v || echo "需装 nginx → §10-B"

# 5) unzip(解包用;无则用 python 解压,见 §2)
command -v unzip >/dev/null && echo "unzip OK" || echo "无 unzip(可用 python 解压)"
```
Python 三方包(pydantic/openpyxl)的检查放在 §3 建好 venv 之后做。

## 2. 放部署包 + 解压(无需联网)
把 `pmplatform-deploy-V1.16.4.zip` 拷到服务器(U 盘/scp),解压到 `/opt`:
```bash
sudo mkdir -p /opt && cd /opt
# 有 unzip:
sudo unzip /path/to/pmplatform-deploy-V1.16.4.zip -d /opt
# 无 unzip(用自带 Python 解压,无需联网):
sudo python3 -c "import zipfile; zipfile.ZipFile('/path/to/pmplatform-deploy-V1.16.4.zip').extractall('/opt')"
# 解压后得到 /opt/pmplatform/(含 server.py、frontend/dist、data/、input/、deploy/ 等)

sudo useradd -r -s /usr/sbin/nologin pmapp 2>/dev/null || true   # 专用低权用户(已存在则忽略)
sudo timedatectl set-timezone Asia/Shanghai                       # 固定东八区(回款延期判定依赖)
sudo chown -R pmapp:pmapp /opt/pmplatform                         # data/ 须 pmapp 可写
```
校验前端是 /pm 构建:`grep -o '/pm/assets[^"]*' /opt/pmplatform/frontend/dist/index.html | head -1`(应有输出)。

## 3. Python 虚拟环境 + 依赖检查
```bash
sudo -u pmapp python3 -m venv /opt/pmplatform/.venv          # 需 §1 的 venv OK
# 检查三方包是否已可用(很多最小系统不带):
sudo -u pmapp /opt/pmplatform/.venv/bin/python -c "import pydantic, openpyxl; print('deps OK')" \
  || echo "缺 pydantic/openpyxl → 按 §10-C 离线装 wheel"
```
- **V1.16.2 起已移除 WPS,不再需要 playwright/chromium**;常驻 web 只用标准库,`pydantic`+`openpyxl` 仅「更新数据/重算」用到。
- 若你**不在服务器上点「更新数据」**(只展示包内已生成的 analysis_data.json),即使缺这两个包也能起服务;但建议装齐以便后续重算。

## 4. 数据与账号(已随包,无需准备/无需改密)
- 数据已在 `/opt/pmplatform/data/`(analysis_data.json 等)与 `/opt/pmplatform/input/`(PMIS 9 表 + CSV + 组织架构/A.xlsx),**无需再生成**。
- 超管账号已在 `data/accounts.json`(**预制口令**),**无需重置**,直接用预制口令登录。
- 后续要更新数据:把新文件投到 `input/`(PMIS 9 表放 `input/pmis/`),页面「数据管理 → 更新数据」或 `sudo -u pmapp /opt/pmplatform/.venv/bin/python /opt/pmplatform/preprocess_data.py`。

## 5. systemd 托管(app 绑 127.0.0.1:8080)
```bash
sudo cp /opt/pmplatform/deploy/pmplatform.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pmplatform
sudo systemctl status pmplatform          # 期望 active (running)
```
- 停止/重启:`sudo systemctl stop|restart pmplatform`(勿用 `python server.py --stop`,Linux 失效)。
- 日志:`journalctl -u pmplatform -f` 或 `/opt/pmplatform/log/server.log`。

## 6. nginx(只接管 /pm,粘进现有 :80 server 块)
服务器共享、本系统不占根路径,**推荐**把 `deploy/nginx-pmplatform-port80-pm.conf` 中「用法 A」的 `location /pm/` 片段**粘进现有监听 80 的 server 块**(别的系统那个),而非新增 catch-all:
```bash
sudo nginx -T | grep -n "listen 80" -A2          # 定位现有 :80 server 块所在文件
sudo nano /etc/nginx/sites-available/<现有站点>   # 把 location = /pm 与 location /pm/ 两段粘进其 server { }
sudo nginx -t && sudo systemctl reload nginx
```
若本系统独占某域名/IP,改用 conf 中「用法 B」的独立 server 块(填专用 server_name,**不要 _ catch-all**)。

## 7. 防火墙
```bash
command -v ufw >/dev/null && sudo ufw allow 80/tcp || echo "无 ufw,按实际防火墙放行 80"
# 或限网段: sudo ufw allow from 10.0.0.0/8 to any port 80
```

## 8. 上线验证清单
- [ ] `systemctl status pmplatform` = running;`curl -I http://<IP>/pm/` 返回 200;同机其它系统根路径 `curl -I http://<IP>/` 不受影响
- [ ] 浏览器开 **http://<IP>/pm** → 登录页;用**预制超管口令**登录成功
- [ ] 登录后各页路由形如 http://<IP>/pm/payment、刷新不 404(SPA fallback OK)
- [ ] Network:`/pm/assets/*.js` 200;`/pm/data/analysis_data.json` 200 且响应头含 `Content-Encoding: gzip`;`/pm/api/auth/me` 200(都带 /pm)
- [ ] 新建受限管理员(限某 L4 + 页面):只看到其 L4 数据;`curl http://<IP>/pm/data/accounts.json -H Cookie:...` 返回 **403**;`/pm/api/clear-data` 等运维端点 **403**

## 9. 数据备份
```bash
0 2 * * * tar czf /backup/pmplatform-$(date +\%F).tgz -C /opt/pmplatform data/    # 每日 02:00(异机存放)
```
重点:`data/accounts.json`(口令哈希)、`data/followup_records.json`、`data/project_tags.json`、`data/analysis_data.json`、`data/history/`。

## 10. 离线升级方案(仅当 §1/§3 检查不通过时)
统一思路:在**一台可联网、且与服务器同 Ubuntu 24.04 / 同 CPU 架构(通常 x86_64)**的机器上下载离线包,拷到服务器(U 盘/scp)后离线安装。

### §10-A Python 版本过低(< 3.8,极少见)
Ubuntu 24.04 自带 3.12,正常无需处理。若确属老镜像被裁剪,优先换用自带 3.12 的标准镜像,而非在离线机硬装 Python(依赖链复杂)。

### §10-B 缺 nginx / python3-venv 等 apt 包(离线 .deb)
联网机(同 24.04):
```bash
mkdir debs && cd debs
sudo apt-get update
sudo apt-get install --download-only -o Dir::Cache::archives="$PWD" nginx python3-venv
# 上句把 .deb(含依赖)下到当前 debs/ 目录
```
拷 `debs/` 到服务器后:
```bash
sudo dpkg -i /path/to/debs/*.deb            # 一次装上(含依赖)
# 若提示依赖缺失,说明 debs 不全:回联网机确保下全,再拷过来重试
```

### §10-C 缺 pydantic / openpyxl(离线 wheel)
联网机(同 Ubuntu 24.04 + 同 Python 次版本,如 3.12 + x86_64):
```bash
mkdir wheels
python3 -m pip download pydantic openpyxl -d wheels
# 注意 pydantic v2 含原生 pydantic-core,wheel 必须匹配平台(manylinux x86_64);
# 在与服务器同平台的机器上 download 即可拿到正确 wheel
```
拷 `wheels/` 到服务器后,在 venv 内离线安装:
```bash
sudo -u pmapp /opt/pmplatform/.venv/bin/python -m pip install --no-index --find-links=/path/to/wheels pydantic openpyxl
sudo -u pmapp /opt/pmplatform/.venv/bin/python -c "import pydantic, openpyxl; print('deps OK')"
```
(若服务器 venv 的 pip 本身缺失/过老,也可在 wheels 里一并 `pip download pip setuptools wheel` 后同法离线装。)

### §10-D 重新构建前端(一般不需要)
dist 已随包构建好;仅当要改前端源码再重建时,需在**联网机**装 Node 18+ 后 `cd frontend && npm ci && npm run build -- --base=/pm/`,把新的 `frontend/dist` 拷到服务器替换。服务器本身不必装 Node。

## 11. 安全与后续
- **端口 80 = 明文 HTTP**:会话 cookie 与数据不加密,可被同网段嗅探 → 仅可信内网用。不可信网络强烈建议改 **443 + TLS**(`deploy/nginx-pmplatform.conf` 含 ssl 段,/pm 结构不变;上 TLS 后给会话 cookie 补 `Secure`,见 `auth.py:build_set_cookie`)。
- P0-5 残留(无害):server.py 自动开浏览器/停止按钮等死代码(无头机静默失败,见 PROGRESS backlog)。
- 性能:nginx gzip 已解决主数据传输;前端单 JS ~2.3MB 未代码分割(P1,后续可优化)。
