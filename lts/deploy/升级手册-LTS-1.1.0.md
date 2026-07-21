# 升级手册 —— LTS-1.1.0（蓝信对齐；从 LTS-1.0.0 升级）

> 适用：把已按 `lts/deploy/服务器部署手册.md` 部署在 Ubuntu 服务器（nginx `/pm/` 前缀 → app 127.0.0.1:8080，systemd 服务名 `pmplatform`，目录 `/opt/pmplatform`）的 **LTS-1.0.0** 升级到 **LTS-1.1.0**。
> 本次是**非纯前端**增量——需**换 dist + 覆盖后端 `.py` + 重启**。
> 若现网早于 LTS-1.0.0，请先完成初次部署，再用本手册升级。

---

## 0. 本次升级包含什么（LTS-1.0.0 → LTS-1.1.0）

把 master 全功能版的「蓝信」域按 LTS 精简边界移植进来：

**出站推送（超管手动触发，发前必预览，绝不自动发）**
- 仅「**项目关注原因**」一条路由（**LTS 无倚天工时域，不含工时推送**）
- 推给项目经理本人 + 可配 0..N 级累积汇总给上级
- 蓝信 `appCard` 卡片，发送前预览、确认后才真发，全程记发送台账

**入站回调收件箱（仅收，无归入）**
- `/api/lanxin/callback` 是全站唯一免登录写入口，安全边界是 SHA1 验签而非会话
- 验签通过的报文落存证并解析为收件箱条目；解析不了的落 `status:"unparsed"`，**不静默丢弃**
- **LTS 无跟进域，员工回复不归入任何跟进记录**——收件箱「操作」列只有「标记已处理 / 删除」，没有 master 版的「归入 xx 跟进」

**超管可配**（登录后 `/data`「数据管理」页新增蓝信配置区）
- 总开关、凭证（AppId / AppSecret / 组织ID / 网关地址）+ 回调双密钥（AES Key / 签名 Token）
- 项目关注原因路由的启停 + 逐项勾选、汇总级别
- 连通性自检（取 AppToken → 换人员ID → 发测试消息给自检工号本人）

**安全设计（与 master 一致，一条不破）**
- 验签先于存证；解析失败仍返回 `errCode 0`；三密钥（AppSecret/回调 AES Key/回调签名 Token）绝不回显、绝不进日志与审计；`/api/lanxin/callback` 免登录但靠验签把关，其余 7 个蓝信端点均限超管。

> **【头号注意 1】⚠ 本包需要重启后端。** 新增 6 个后端模块（`lanxin.py` / `lanxin_config.py` / `lanxin_recipients.py` / `lanxin_crypto.py` / `lanxin_callback.py` / `lanxin_inbox.py`）并改动了 `server.py`，不重启则新端点不存在、页面上的蓝信区会报错。
>
> **【头号注意 2】✅ 无需点「更新数据」。** 蓝信不进数据管线（脉络③），配置改完即时生效。
>
> **【头号注意 3】⚠ 蓝信凭证尚未申请/联调，升级后功能处于「未启用」状态。** 这是**预期的**：总开关默认关闭、凭证为空，此时点推送会被拒绝并提示未启用；入站回调地址也尚未在蓝信开发者中心登记，全链路从未联调。**升级本身不受影响，其余所有功能照常。**
>
> **【头号注意 4】✅ 新增数据文件均已 gitignore。** `data/lanxin_config.json`（含 AppSecret+回调双密钥）、`data/lanxin_inbox.json`（存员工回复正文）、`data/lanxin_callback_raw.jsonl`（回调存证）不入库，升级/回滚均不影响它们的读写权限（仍需 `pmapp` 用户可写 `data/` 目录，参照初次部署已有的 `chown`）。

---

## 1. 升级步骤（Ubuntu 服务器，约 2 分钟）

```bash
# 0) 把新版代码（或最小更新包）放到服务器临时目录，以下假定已放到 /tmp/lts-update-LTS-1.1.0
#    内容：全部后端根 *.py（含本次新增的 6 个 lanxin*.py，以及改动的 server.py）+ frontend/dist（已用 --base=/pm/ 构建）

# 1) 备份（本次动后端，回滚要用）
sudo cp -r /opt/pmplatform/frontend/dist /opt/pmplatform/frontend/dist.bak-$(date +%Y%m%d-%H%M)
sudo mkdir -p /opt/pmplatform/bak-$(date +%Y%m%d-%H%M) && sudo cp /opt/pmplatform/*.py /opt/pmplatform/bak-$(date +%Y%m%d-%H%M)/

# 2) 覆盖后端 .py（核心：含 6 个新 lanxin*.py）
cd /tmp/lts-update-LTS-1.1.0
sudo cp -f *.py /opt/pmplatform/
sudo chown pmapp:pmapp /opt/pmplatform/*.py

# 3) 覆盖前端 dist
sudo rm -rf /opt/pmplatform/frontend/dist
sudo cp -r frontend/dist /opt/pmplatform/frontend/dist
sudo chown -R pmapp:pmapp /opt/pmplatform/frontend/dist

# 4) 重启后端（必须 —— 新端点靠这一步生效）
sudo systemctl restart pmplatform
sudo systemctl status pmplatform --no-pager | head -5

# 5) 无需点「更新数据」。浏览器强刷（Ctrl+F5），确认版本号显示 LTS-1.1.0。
```

> 若 nginx 缓存了静态资源，强刷仍是旧版时 `sudo systemctl reload nginx` 后再刷。

---

## 2. 升级后验证清单（凭证到位前能验到这里）

用**超管账号**进 `/data`（数据管理页）：

- [ ] 版本号显示 **LTS-1.1.0**
- [ ] 原有功能全部正常（更新数据、上传、跟进记录、标签、门户、历史回滚等）——本次未改动它们
- [ ] 新增蓝信配置区：总开关（默认关）、凭证四项 + 回调双密钥输入框、「项目关注原因」路由（勾选项、汇总级别）
- [ ] AppSecret / 回调双密钥框显示「未配置」（`has*` 脱敏展示，不回显明文）
- [ ] 点「预览并推送」→ 抽屉打开 → 列出收件人与卡片文案
- [ ] 点「确认推送」→ 应被拒绝并提示「蓝信推送未启用」（因总开关关闭）——**这是正确行为**
- [ ] 收件箱区可打开（无凭证时为空列表，非报错）
- [ ] 深/浅两个主题正常；console 无报错

---

## 3. 凭证到位后如何启用（等蓝信申请下来再做）

全程在页面上操作、无需改代码、无需再升级：

1. `/data` → 蓝信配置区，填入 AppId / AppSecret / 组织ID / 网关地址 + 回调双密钥（AES Key / 签名 Token），保存。
2. 配置 `input/组织架构.xlsx`（收件人解析的前提——项目经理需能在花名册内查到）。
3. 填自检工号，点「连通性自检」，三步全绿即出站接入完成。
4. **入站回调**：在蓝信开发者中心「回调事件」页填 `<对外地址>/pm/api/lanxin/callback`（按现网 `/pm` 前缀拼接）。**入站全链路从未联调**，配置后建议先用一条测试消息验证收件箱能收到，再正式启用。
5. 三步全绿后打开总开关，先小范围试发（汇总级别设 0，只发本人），确认卡片文案与到达情况正常再逐步放开。

---

## 4. 回滚

本次动了后端，回滚需同时还原 `.py` 与 `dist` 并重启：

```bash
sudo cp -f /opt/pmplatform/bak-<时间戳>/*.py /opt/pmplatform/
sudo rm -f /opt/pmplatform/lanxin.py /opt/pmplatform/lanxin_config.py /opt/pmplatform/lanxin_recipients.py \
           /opt/pmplatform/lanxin_crypto.py /opt/pmplatform/lanxin_callback.py /opt/pmplatform/lanxin_inbox.py
sudo rm -rf /opt/pmplatform/frontend/dist
sudo mv /opt/pmplatform/frontend/dist.bak-<时间戳> /opt/pmplatform/frontend/dist
sudo systemctl restart pmplatform
```

> 说明：本次**未改数据管线、未改数据格式**，`data/analysis_data.json` 与 `input/` 一律不受影响，回滚无数据风险。
> `data/lanxin_config.json` / `data/lanxin_inbox.json` / `data/lanxin_callback_raw.jsonl` 是本版新增文件，回滚后会被旧版忽略、不影响运行；重新升级回 LTS-1.1.0 时数据仍在。

---

## 附：下一版增量基线

本手册从在线基线 **LTS-1.0.0** 增量。下一版更新从 **LTS-1.1.0** 增量即可。
