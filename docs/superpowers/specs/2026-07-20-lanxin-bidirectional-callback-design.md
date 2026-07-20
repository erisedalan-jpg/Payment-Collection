# 蓝信双向闭环（回调接入 + 收件箱 + 归入）设计 —— V4.0.5

> 目标：让员工在蓝信里对推送卡片的回复，回流到本系统并可被超管归入业务跟进。
> 前置：V4.0.0~V4.0.4 已建成出站推送（从未联调，凭证未到位）。

---

## 1. 范围

**做**：

- 发送侧支持两种身份（应用号 / 智能机器人），超管可切
- 新增入站回调端点 `/api/lanxin/callback`（验签 + 解密 + 解析 + 去重 + 落库）
- 纯 Python 零依赖 AES-256-CBC 解密与 SHA1 验签
- `/data` 新增「蓝信回复」签：收件箱（仅超管）+ 归入抽屉
- 归入目标域由超管自选：risk / temp（含实例）/ payment_key / progress

**不做**：

- 倚天工时问题的回复不归入任何域（倚天域无跟进表，本期不新建），只留收件箱
- 不做 WebSocket 接入（见 §11.3）
- 不改 `followup_store.py`（四域共用引擎，既有红线）
- 不动 `lts/`

---

## 2. 调研结论（2026-07-20，developer.lanxin.cn）

### 2.1 文档抓法（自研 SPA，记录以省将来时间）

`developer.lanxin.cn` 与 `openapi.lanxin.cn` **不是同一个站**，抓法也不同：

```
模块树：POST /api/v1/h5/document/en/fetch      {"mName":"back-end-api"}      (220 篇)
                                                {"mName":"development-help"}  (40 篇)
正文：  POST /api/v1/h5/document/fetch/detail   {"enName":"back-end-callback-api"}
```

URL 里的 `article_id` 不能直接查正文，须先从模块树反查出对应的 `enName`。
本次三篇：`dev-help-robot` / `back-end-outline` / `back-end-create-bot-message`。

### 2.2 应用号与智能机器人的真实差异

| | 应用号 | 智能机器人 |
|---|---|---|
| 发送接口 | `POST /v1/messages/create` | `POST /v1/bot/messages/create` |
| 回调事件 | `account_message` | `bot_private_message`、`bot_group_message` |
| 消息体类型 | text / oacard / linkCard / appCard | **完全相同** |
| 收件人上限 | 1000 | 1000 |
| 额外审批 | 无 | 组织管理后台开机器人能力 + 应用能力页开启 |

**关键结论：应用号本身就支持双向**（`account_message` 文档原话「可以支持应用和人员的一对一交互」）。
V4.0.5 之前的认知「应用号只能单向」是错的。

因此本设计**两种身份都支持**：凭证一到位即可用应用号验证双向链路，不必等第二道审批；
机器人能力批下来后在 `/data` 切一个单选即可，代码已就绪。

消息体与上限完全一致，意味着现有 `build_project_card` / `build_summary_card` /
`build_timesheet_card` 与 V4.0.3 的双重字节/字符截断**一行都不用改**。

### 2.3 回调协议

```
POST  <回调地址>?timestamp=TIMESTAMP&nonce=NONCE&signature=SIGNATURE
Body  {"dataEncrypt": "<base64>"}
Resp  HTTP 200 + {"errCode":0,"errMsg":"ok"}      必须 3 秒内返回
```

- 验签：`sha1(''.join(sorted([signToken, dataEncrypt, timestamp, nonce])))`，小写十六进制
- 解密：`key = base64_decode(aesKey + "=")`（32 字节）；**AES-256-CBC，IV = key 的前 16 字节**；PKCS7 去填充
- 重推：失败后在 5 分钟 / 1 小时 / 6 小时各重推一次，最多 3 次；**必须按事件 id 去重**
- 错误码：`0` 正常 / `-1` 解密失败 / `-2` 验签失败 / `-3` 反序列化失败 / `-4` 其他
- 凭证来源：开发者中心「回调事件」页的**回调密钥（aesKey）**与**回调签名令牌（signToken）**，
  是与 AppId/AppSecret **不同的另外两个**凭证

### 2.4 已实证：零依赖解密可行

文档附有完整测试向量。用纯 Python（无 pycryptodome、无任何三方库）实测通过：

```
aesKey = "RDNBMkZCNkFDMThERjFDNkNFMjVFRDBEMjc4NkRERjM"
key len 32   key ascii: D3A2FB6AC18DF1C6CE25ED0D2786DDF3
JSON parsed OK, keys: ['random', 'len', 'app_id', 'org_id', 'events']
```

推翻了 V4.0.3 调研中「纯标准库没有 AES 故回调不做」的理由。
只需解密、不需加密，约 120 行，不引入依赖、不动 PyInstaller 打包。

### 2.5 文档字段名与真实报文不一致（重要）

解出来的真实明文与文档字段表**对不上**，且文档自身前后也不一致：

| 文档字段表 | 文档 JSON 示例 | **真实密文解出** |
|---|---|---|
| `appId` | `appId` | **`app_id`** |
| `orgId` | `orgId` | **`org_id`** |
| `length` | `len` | **`len`** |
| 事件 `eventType` | 事件 `type` | **`type`** |

事件内 `data` 的子字段同样存在 `staff_id` / `msg_text` 这类蛇形写法，
与事件列表文档描述的 `from` / `msgType` / `msgData` 不同。

**结论：照任何单一写法写解析器都会失败。** 解析必须两套键名都认，
且真实形态在收到第一条线上回调前无法最终确认 —— 这正是 §5 存证设计的动因。

---

## 3. 决策记录（用户拍板）

| 决策 | 取值 |
|---|---|
| 入站可达性 | 蓝信私有化部署在公司内网，**可达** |
| 本次范围 | 全做：发送身份 + 回调 + 收件箱 + 归入 |
| 收件箱可见性 | **仅超管** |
| 项目类回复归入 | 超管归入时**自选域** |
| 工时类回复 | 只留收件箱，不归入 |
| temp 归入 | 加**实例下拉** |
| 发送身份 | 应用号与机器人**都支持** |
| 版本号 | **V4.0.5**（Z 级） |

---

## 4. 模块划分

| 模块 | 状态 | 职责 | 依赖 |
|---|---|---|---|
| `lanxin_crypto.py` | 新增 | AES-256-CBC 解密 + SHA1 验签。纯函数，零依赖 | 无 |
| `lanxin_callback.py` | 新增 | 回调编排：验签 → 存证 → 解密 → 解析 → 去重 | crypto / inbox |
| `lanxin_inbox.py` | 新增 | 收件箱 + 发送台账存储（原子读写，仿 `followup_store` 风格） | 无 |
| `lanxin.py` | 改 | 抽 `_send` 共用；新增 `send_bot_message`；`dispatch` 按 `sendAs` 选 | — |
| `lanxin_config.py` | 改 | 新增 `callbackAesKey` / `callbackSignToken` / `sendAs` | — |
| `lanxin_recipients.py` | 改 | 卡片底部加回复引导语（条件见 §8） | — |
| `server.py` | 改 | `/api/lanxin/callback`（免登录）+ `/api/lanxin/inbox/*`（超管） | — |
| 前端 | 改 | `/data` 配置卡扩展 + 新增「蓝信回复」签 | — |

---

## 5. 数据流与闸门顺序

**顺序本身是设计，不可调换。**

```
蓝信 POST /api/lanxin/callback?timestamp&nonce&signature   body {"dataEncrypt":"..."}
  │
  ├─① 报文大小上限（1 MiB）──────── 超限 → HTTP 413，不留痕
  │
  ├─② 验签 sha1(sorted(signToken, dataEncrypt, timestamp, nonce))
  │      失败 → 拒绝计数 +1（只记时间与来源，【不存 body】）→ errCode -2
  │
  ├─③ 存证：原始 body + query + 接收时间 → data/lanxin_callback_raw.jsonl
  │      失败 → errCode -4  ← 唯一让蓝信重推的分支
  │
  ├─④ 解密   失败 → 条目以「未解析」入箱 → errCode 0
  ├─⑤ 解析   失败 → 条目以「未解析」入箱 → errCode 0
  ├─⑥ 按事件 id 去重
  ├─⑦ 落收件箱
  │
  └─ {"errCode":0,"errMsg":"ok"}
```

### 5.1 为什么验签必须先于存证

`/api/lanxin/callback` 是全站唯一的免登录写入口。若先无条件存证，同网段任何人都能
POST 垃圾把磁盘灌满。验签只用请求自带的四个值做一次 SHA1，成本极低，
且验签通过即等于「持有 signToken」= 确认来自蓝信。

代价：signToken 配错时真实报文也不存。以 `/data` 上的**「已拒绝 N 次」计数器**显性暴露，
配错一眼可见，不会静默。

### 5.2 为什么解密/解析失败仍返回 errCode 0

一旦 ③ 落盘成功，重推毫无意义 —— 内容一模一样，我们会以同样方式再失败三次，
白白烧掉蓝信的 3 次重试额度。返回 0 之后条目以「未解析」进收件箱，
**不静默丢弃**（仓库既有约定），超管能看见有东西没读懂。
我们拿存证文件改解析器、重放，一条不丢。

**「成功」定义为「我已持久化」，不是「我已理解」。**

### 5.3 事件类型与字段兼容

认三种事件：`account_message`、`bot_private_message`、`bot_group_message`。

顶层与事件键名**两套都认**（见 §2.5）：
`type`/`eventType`、`app_id`/`appId`、`org_id`/`orgId`、`len`/`length`。
事件内取文本时同样兼容 `msgData.text.content` 与 `msg_text`；
取发送者兼容 `from` 与 `staff_id`。取不到不报错，落「未解析」并保留原始 `data`。

---

## 6. 安全边界

- `callbackAesKey` / `callbackSignToken` 与 `appSecret` 同级对待：
  **绝不进日志、审计、异常消息、前端下发**；读取接口一律脱敏（返回 `"***"` 或 `hasSecret: true`）
- `data/lanxin_config.json` 已 gitignore，新增两项不改变这一点
- `/api/lanxin/callback` 加入 `_AUTH_EXEMPT`（`server.py:191` 的 `_path_needs_auth`），
  且**绝不能**进 `_SUPER_ONLY_PATHS`（那个闸按 path 匹配、不分 method）
- 回调端点只接受 POST；其他 method 返回 405
- 存证文件按大小滚动，避免无限增长
- 后端仍**不接受前端传来的 staffId**（既有红线）；收件箱展示的 staffId 由后端台账反查得出

---

## 7. 存储结构

`data/lanxin_inbox.json` —— 一个文件装对话两端，因为它们是同一场对话：

```json
{
  "version": 1,
  "sent": [
    {"staffId": "...", "employId": "A000701", "name": "张三",
     "routeKey": "project", "projectIds": ["P001"], "sentAt": "...", "msgId": "..."}
  ],
  "items": [
    {"id": "evt-<事件id>", "receivedAt": "...", "status": "parsed",
     "eventType": "bot_private_message", "staffId": "...", "employId": "A000701",
     "name": "张三", "msgType": "text", "text": "...", "rawMsgData": {},
     "groupId": null, "groupName": null,
     "handled": false, "handledInfo": null}
  ],
  "seenEventIds": [{"id": "...", "ts": "..."}]
}
```

未解析条目：`id` 取 `raw-<存证行号>`，`status: "unparsed"`，
带失败原因（`decrypt` / `parse`）与原始密文前若干字符供排查。

**保留窗口**：`seenEventIds` 7 天（最长重推间隔 6 小时，7 天绰绰有余）；
`sent` 90 天；`items` **不自动删**（收件箱是人要读的，自动删会让人错过），超管手动清理。

---

## 8. 发送台账与归因

`sent` 不是冗余，一物两用：

1. **反查身份** —— 回调只给 `staffId`，而发送时做过 `employId → staffId` 的
   `id_mapping`。不留台账就只能拿一串 `524288-xxx` 给超管看
2. **归因候选** —— 按 staffId 找最近推给他的卡片，取其中项目作为归入下拉的**默认候选**

**归因天然是推测**：蓝信回调不带任何原卡标识，`referenceMsg` 连 `msgId` 都没有。
超管可选任意项目，UI 必须写明这是推测、不是结论。

**卡片回复引导语**：底部加一行「如有说明，请直接回复本消息」。
两种身份都加（都能收回复），但**回调凭证未配置时不加** —— 否则是让人对着收不到的地方说话。

---

## 9. 归入

超管在收件箱选一条 → 选目标域 → temp 时再选实例 → 选项目 → 写入该域**首个进展字段**。

四域的落点已核实，不可臆测：

| 域 | 写入字段 | 更新入口 | 备注 |
|---|---|---|---|
| risk | `followAction` | `risk_followup.apply_update` | — |
| payment_key | `followAction` | `payment_key_followup.apply_update` | — |
| temp | `weekProgress` | `temp_followup.apply_update`（传 instance） | 见 §9.4 |
| progress | `weekProgress` | `server.py` 内联 `_progress_apply_update` | **不走 `followup_store`** |

`progress` 域是唯一例外：它的 store 逻辑内联在 `server.py`（`_load_progress` / `_save_progress` /
`_progress_apply_update`），不经 `followup_store`。归入实现必须为它单开分支，
不能假定四域同构。

四域共用既有事务壳 `_followup_txn(lock, load, mutate, save)`，归入不另造事务机制。

### 9.1 必须追加，不可覆盖

`followup_store.py:71` 是 `rec[field] = content` —— **直接赋值**。
归入若原样调用 `apply_update`，会**抹掉该项目已有的跟进内容**
（与 V4.0.2 那个「读文件失败把现网归档覆盖成空」是同一类事故）。

归入流程必须是：读现有内容 → 拼接 → 再调 `apply_update`。
拼接逻辑放在调用方，**`followup_store.py` 一行不动**。

### 9.2 必须转义，不可当富文本

五个跟进页 V2.8.2 起是富文本内联编辑。回复文本是**员工任意输入**，
原样拼进去即**存储型 XSS**，攻击面是「任何能给机器人发消息的员工」。

回复文本**一律 HTML 转义后包进 `<p>`**，绝不当富文本解析 ——
回复本来就是纯文本（`msgType: text`），没有任何理由给它富文本能力。

### 9.3 temp 域的归档语义

`temp_followup` 的 `_CFG` 是 `clear_on_archive=True` —— 归档时 `current` 会被清空
（内容进 `archives`，不丢，但不再显示于当前表）。归入 temp 的回复同样遵循这一既有语义。
这不是缺陷，但归入 UI 应让超管知道所选实例的内容会随该实例的下次归档一并冻结。

### 9.4 幂等

归入后条目标 `handled: true` 并记 `handledInfo`（域 / 实例 / 项目 / 时间 / 操作人），
防重复归入。归入动作进审计（`_ACTION_MAP` 需加条目，否则是死埋点 —— V3.3.0 教训）。

---

## 10. 配置与前端

### 10.1 配置扩展

```
credentials: { appId, appSecret, orgId, apiGateway, idType,
               callbackAesKey, callbackSignToken }     // 后两项新增，同样脱敏
sendAs: "account" | "bot"                              // 新增，默认 "account"
```

`sendAs` 默认 `account`：机器人能力要额外审批，可能批不下来，应用号是安全落点。

### 10.2 前端

- **`/data` 配置签**：蓝信推送卡扩展 —— 发送身份单选、两个回调凭证框、
  回调地址一键复制（值为 `{location.origin}/api/lanxin/callback`）、**已拒绝 N 次**计数
- **`/data` 新增第四签「蓝信回复」**：收件箱表格 + 归入抽屉

走 Tab 而非新页：`/data` 自 V3.5.0 已 Tab 化，且这些全是超管专属、与蓝信配置同页最内聚，
不必动侧栏。这也是本次定为 Z 级（页内局部调整）的依据。

---

## 11. 测试策略

### 11.1 唯一的零凭证真实回归

`lanxin_crypto` 是整个功能里**唯一能在没有凭证的情况下做真实回归**的部分：
文档给了 aesKey 与两条真实密文，断言用官方向量，
**不是自造 fixture 自己验自己**。这条必须做实。

### 11.2 其余覆盖

- `lanxin_callback` 五条路径：验签失败 / 存证失败 / 解密失败 / 解析失败 / 正常
- 重复事件去重；两套字段名各一组用例
- 归入：**断言原有跟进内容仍在**（防覆盖）、断言 `<script>` 被转义（防 XSS）
- 发送：`send_message` 与 `send_bot_message` 只差 path，断言各自打到正确 URL
- 按仓库惯例，每条护栏做**变异验证**证明能变红

### 11.3 无法覆盖的

回调无法自检（须蓝信主动发）。以 `/data` 上「已收到 N 条 / 已拒绝 M 条」计数暴露，
超管给应用号或机器人发一条消息即可验证链路。

---

## 12. 已知风险与未决

| 风险 | 处置 |
|---|---|
| **凭证仍未下发**，全链路从未联调 | 已知并接受。存证设计（§5）就是为此兜底 |
| 真实报文形态与文档不符 | 存证 + 未解析条目可见 + 可重放，不丢数据 |
| 归因是推测，可能错 | 只作候选默认值，超管可改，UI 明示 |
| 蓝信「人员编号」≠ 我方工号 | 既有问题，处置不变：花名册加「人员编号」列 |
| WebSocket 路径未采用 | 事件列表明写这三个事件是「个人机器人通过 WebSocket 回调」，组织应用未必适用；且标准库无 WS 客户端。本期不做 |

### 12.1 顺带修正的陈旧记录

`server.py:3816` 实为 `ThreadingHTTPServer`（提交 `4bbff71` 改的）。
以下三处记载**已过期，本期一并修正**：

- `CLAUDE.md:153`「`server.py` 用单线程 `HTTPServer`，同步/更新 SSE 期间会阻塞全站」
- `server.py:341` 注释「服务是单线程 HTTPServer」
- `server.py:2948` 注释「单线程排队 = 把全站堵死」

这直接关系本设计：3 秒回调 SLA 在多线程下不存在被「更新数据」SSE 堵死的风险。

---

## 13. 交付后需更新的文档

- `docs/2026-07-20-蓝信接口与回调地址填写说明.md`：
  §1.2「回调地址留空」**结论作废**，改为填 `<部署地址>/api/lanxin/callback`；
  §1.3 补「订阅事件」步骤；§2 补两个新凭证
- `docs/2026-07-20-蓝信回调接口调研.md`：§「不做」结论作废，注明推翻理由（§2.4）
- `PROGRESS.md`：V4.0.5 条目
