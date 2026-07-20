# SP-4 数据量控制（L4 数据隔离） 设计（权限控制功能 第 4 子项目）

> 后端在下发 `/data/analysis_data.json` 时，按当前账号 `allowedL4` 过滤到其 L4 组织的项目数据再返回；越权 L4 的项目数据不出后端。超管/`allowedL4=['*']` 直接返回全量。
> **仍不做超管建号界面(SP-5)。** 本期把"数据切片"落地。

## 0. 背景与边界

威胁模型=折中：L4 数据后端切。SP-3 已把 `/data/analysis_data.json` 收口到"已登录"门后(`_auth_gate`)，但仍返回全量。本期改为：非超管按 `allowedL4` 过滤后下发。

**已勘察结论(基础)**：`analysis_data.json`(~15MB，`schema.py` 定义)经 `server.py` do_GET 静态兜底原样吐出(无专用 handler)。顶层分三类：
- **projectId 键控的业务 dict**（过滤时按允许 id 集裁键）：`projectPmis`、`paymentNodes`、`projectMilestones`、`paymentRecords`、`projectProfit`、`naguanMap`、`naguanExclude`、`followupRecords`。
- **projects 数组**：`projects[]`(每项 `orgL4`)、`closedProjects[]`(也有 `orgL4`)。`events[]`(每条 `Event.projectId`)。
- **预计算聚合块(非 projectId 键控)**：`meta`(lastUpdate/totalProjects/totalClosed/totalPaymentNodes，前端直读)、`dataQuality`/`projectsQuality`(治理页直读)、`periodCompare`(动态页直读)、`projectOverview`(仅 clearBusinessData 引用)、`tagSeed`(标签类别键)。
- **售前关系**：售前项目数据可能挂在 `relatedClosedId`(原项目号)下；过滤的 keep_ids 必须含允许项目的 `relatedClosedId`(否则售前的 nodes/milestones/records/profit 丢失)。前端大多数指标从 `projects[]`+键控 dict **重算**(过滤后自动一致)；`meta` 计数被直读(过滤后须重算)。

## 1. 范围与非目标

**范围**：
- 新 `data_scope.py`：纯函数 `allowed_project_ids(projects, allowed_l4)->set`、`filter_analysis_data(data, allowed_l4)->dict`。
- `server.py`：`/data/analysis_data.json` 专用 handler `handle_data_json`——按会话账号 `allowedL4` 切；超管/`['*']` 走原样快路;`/data/*` 其余仍静态(门后)。
- 15MB 解析的 **mtime 缓存**(避免每请求重解析)。

**非目标**：
- 不切 `dataQuality`/`projectsQuality`/`periodCompare`/`projectOverview`——这些是**数据管线/系统健康**统计(匹配率、文件行数、周期对比)，非"某 L4 的业务项目数据"；L4 用户(若有治理/动态页权限)看到的是全库管线健康，**有意原样透传**(记 scope 决策;逐用户重算这些不成比例;且若该用户无 /governance·/activity 权限则根本看不到)。
- 不做超管界面(SP-5)。不改 `/input` 等(SP-3 已门后、且原始全量无法切片)。

## 2. 全局约束（写入 plan Global Constraints）

- 后端纯标准库；并发(ThreadingHTTPServer)下缓存字典读写加 `threading.Lock`。
- `filter_analysis_data` 为**纯函数**(可单测)：输入 data + allowed_l4，返回过滤后的新 dict，不改入参。
- `allowed_l4` 含 `'*'` → 不过滤(返回原 data 引用/或调用方走快路)。
- keep_ids 必须含允许项目的 `relatedClosedId`。
- 过滤后**重算** `meta.totalProjects`/`totalClosed`/`totalPaymentNodes`(`lastUpdate` 不变)。
- 异常项目(orgL4 空)不属任何 L4 → 非超管不可见(与"异常项目排除回款统计"一致)。
- 逐文件 `git add`；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。不改 `frontend/src/version.ts`。

## 3. 架构

```
GET /data/analysis_data.json ──(_auth_gate 已确保已登录)── handle_data_json
   token→validate_session→account→load_accounts[account] → {isSuper, allowedL4}
     isSuper or allowedL4==['*'] → 原样发磁盘文件(快路,不解析)
     否则 → load_analysis_cached(mtime缓存)→ data_scope.filter_analysis_data(data, allowedL4) → json.dumps → _send_json(200,...)
```

前端无改动：`data.ts` 仍 `fetch('/data/analysis_data.json')`，拿到的就是已切片数据；所有 lib 重算自动只覆盖可见项目；`meta` 计数已被后端重算一致。

## 4. data_scope.py API

```python
def allowed_project_ids(projects: list, allowed_l4: list) -> set:
    """orgL4 ∈ allowed_l4 的项目 id ∪ 其 relatedClosedId。allowed_l4 含 '*' → 全部 id(含 relatedClosedId)。"""

def filter_analysis_data(data: dict, allowed_l4: list) -> dict:
    """按 allowed_l4 过滤 analysis_data 的副本:
       - allowed_l4 含 '*' → 直接返回 data(不过滤)。
       - keep = allowed_project_ids(data.get('projects',[]), allowed_l4)
       - projects/closedProjects 按 orgL4 ∈ allowed_l4 过滤(closedProjects 用自身 orgL4)
       - 每个 projectId 键控 dict(projectPmis/paymentNodes/projectMilestones/paymentRecords/projectProfit/naguanMap/naguanExclude/followupRecords)按 key ∈ keep 裁剪
       - events 按 event['projectId'] ∈ keep 过滤
       - meta.totalProjects=len(过滤后 projects)、totalClosed=len(过滤后 closedProjects)、totalPaymentNodes=Σ过滤后 paymentNodes 各列表长度;lastUpdate 不变
       - dataQuality/projectsQuality/periodCompare/projectOverview/tagSeed 原样透传(系统/管线统计)
       返回新 dict(浅拷顶层 + 重建被过滤的子结构);不改入参 data。"""
```

实现要点：`allowed_l4` 集合化加速;`relatedClosedId` 从 projects 项读;缺失字段(某 key 不在 data)安全跳过;非 dict/list 的意外结构按原样保留。

## 5. server.py 改动

- 新 handler `handle_data_json(self)`：
  ```
  token = auth.parse_cookie_token(self.headers.get('Cookie'))
  account = auth.validate_session(token)            # 经 _auth_gate 必有效
  rec = auth.load_accounts().get('users', {}).get(account) or {}
  allowed = rec.get('allowedL4', [])
  if rec.get('isSuper') or '*' in allowed:
      return self._serve_raw_data_file()             # 原样发文件(快路)
  data = _load_analysis_cached()                      # mtime 缓存
  if data is None: 404/空
  filtered = data_scope.filter_analysis_data(data, allowed)
  self._send_json(200, filtered)                      # 或流式 dumps
  ```
- `do_GET` 的 if/elif 链加 `elif parsed.path == '/data/analysis_data.json': self.handle_data_json()`（在静态 else 之前;`_auth_gate` 已在 do_GET 首行拦未登录）。
- `_serve_raw_data_file()`：复用既有静态发送(读 `ANALYSIS_FILE` 流式写 200 + Content-Type application/json)。
- `_load_analysis_cached()`：模块级 `{path:(mtime,dict)}` + Lock；mtime 变则重解析。
- 超管快路不解析 15MB(当前仅 2 超管账号，常路快)。

## 6. 测试

后端 `tests/test_data_scope.py`(纯函数)：
- `allowed_project_ids`:orgL4 命中筛选、`'*'` 返全部、含 relatedClosedId、异常(orgL4 空)项目不入非超管集。
- `filter_analysis_data`:
  - `['*']` → 原样(项目数不变)。
  - 给 fixture(projects 含 D1/D2 两 L4、各种键控 dict、closedProjects、events、meta、dataQuality)，`allowed_l4=['D1']` → projects 仅 D1;projectPmis/paymentNodes/... 仅 D1 项目(+其 relatedClosedId)键;closedProjects 仅 orgL4 D1;events 仅 D1 项目;**meta.totalProjects/totalClosed/totalPaymentNodes 重算正确**;dataQuality/periodCompare **原样透传**;不改入参。
  - 售前:D1 项目带 relatedClosedId='C9',paymentNodes 挂 'C9' → 过滤后保留 'C9' 键。

后端 `tests/test_server_data.py`(集成,真 HTTP)：
- 种子超管 + 手工写一个 `isSuper:false, allowedL4:['D1']` 账号(测试内构造 accounts.json) → 该账号登录拿 cookie → GET /data/analysis_data.json → 200，体 projects 仅 D1;超管账号同请求 → 全量(项目数 = 全 fixture)。(用小 fixture analysis_data.json via monkeypatch ANALYSIS_FILE / 缓存路径。)

`bash verify.sh` 全绿。手动冒烟：超管登录看全量;手改一账号 allowedL4=['某L4'] 登录 → 各页只见该 L4 项目、KPI/清单/看板随之、meta 计数一致。

## 7. 对后续 SP 的接口预留

- SP-5 超管界面编辑账号 `allowedL4`(及 allowedPages/isSuper),保存到 `accounts.json`;本 SP 的 `filter_analysis_data` 立即对其生效(下次该用户拉 /data)。
- `data_scope.filter_analysis_data` 的"透传系统统计"边界若日后要按 L4 重算 dataQuality,可在此函数扩展。
