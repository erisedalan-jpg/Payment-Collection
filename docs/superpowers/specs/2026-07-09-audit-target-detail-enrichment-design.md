# 审计「目标/详情」全量富化设计 · V2.8.1

> 日期：2026-07-09
> 状态：设计已确认（用户认可四段）
> 范围：给审计日志的「目标(target)/详情(detail)」两列补全高价值写操作的内容。当前仅账号管理 4 个动作 + 登录失败有值，其余约 40 个已审计写操作两列皆空。纯后端埋点富化，无 schema/数据管线/前端功能改动，守住 `audit.py 不依赖 server` 边界与审计隐私红线。

## 1. 背景与问题

V2.7.0 引入操作审计（`audit.py` + `server.py` 中央埋点 + `AuditLogTab.vue`）。前端表格列：时间 / 账号 / 动作 / IP / **目标** / 结果 / **详情**。其中 `target`（目标）、`detail`（详情）两个字段在 `server.py:_reset_audit_state` 每请求复位为 `None`，**只有账号管理 handler（创建/修改/删除账号、修改本人密码）与登录失败**显式赋值。因此普通管理员日常的跟进/进展/标签/商机、以及超管的数据运维等约 40 个动作，这两列一律为空。

`_audit_request`（`server.py`）已具备读取与降级：
```python
'target': target if target is not None else getattr(self, '_audit_target', None),
'detail': detail if detail is not None else getattr(self, '_audit_detail', None),
```
所以富化只需让各 handler 在处理时 `set` 这两个实例属性；读取端与降级逻辑**一字不改**。

## 2. 已定决策（brainstorm 确认）

| 决策点 | 选择 |
|---|---|
| 覆盖范围 | **全覆盖 A+B+C**：业务跟进 + 商机 + 数据运维 |
| 长文本业务正文（跟进内容/进展文字） | **只标注`（已填写/已改）`不落正文**；枚举字段记具体值；需原文用记录编号回查 |
| 更新类枚举字段 | **旧→新对比**（如 `状态 待处理→进行中`）；长文本仍只标已改 |
| 架构 | **方案一 · 分布式 per-handler 富化**：各 handler 调 `_audit_set`，格式化/diff 逻辑下沉 `audit.py` 纯函数 |
| 商机 target | **名称优先、缺则 id** |
| cookie 详情 | **不落任何 cookie 值/预览** |
| 异步动作（更新数据/PMIS 拉取） | 只记「触发」，非最终结果 |
| 版本 | **V2.8.1**（Z 级：既有审计页内增强，无新页面/路由） |
| 前端 | **零功能改动**（列已在，仅 version.ts bump） |
| 后端 | 改 `server.py` handler + `audit.py` 纯函数；**升级须重启后端** |

## 3. 架构与单元边界（方案一）

### 3.1 `server.py` 新增助手

```python
def _audit_set(self, target=None, detail=None):
    """handler 内富化本请求的审计目标/详情;仅覆盖未设的默认 None。"""
    if target is not None:
        self._audit_target = target
    if detail is not None:
        self._audit_detail = detail
```

各 handler 在解析完 body（或在 `_apply`/mutate 闭包内、能拿到旧值处）调用 `self._audit_set(...)`。`_reset_audit_state` / `_audit_request` **不改**。

### 3.2 `audit.py` 新增纯函数（TDD 覆盖，不依赖 server）

- `field_label(key)`：`weekProgress`→`本周进展`、`nextPlan`→`下步计划`，未知键原样返回。
- `diff_enum(old, new, fields, labels)`：对 `fields` 中**发生变化**的枚举字段，拼 `"状态 待处理→进行中；类型 邮件推动→电话"`；旧值缺省显 `（空）`；无任何变化返回 `""`。
- `summarize_scope(scope)`：读 `{combinator, groups}` → `"AND · 3 组条件"`；空/畸形返回 `"清空范围"` 或 `""`。
- `join_detail(parts)`：过滤空片段，用 `" · "` 拼接，统一详情风格。

以上纯函数无副作用、无 server import，`tests/` 直接单测。

### 3.3 防御式富化（零回归铁律）

- 富化取值一律 `.get`/短路/局部 `try`，任何异常都让 target/detail 退化为空，**绝不因审计富化让主流程 500**。
- 漏改某 handler 只是该动作两列为空（= 今天行为），非回归。
- `_reset_audit_state` 已在 `do_GET`/`do_POST` 开头复位，keep-alive 下不串请求，新富化不破该保证。

## 4. target / 详情 规格表（A+B+C 全量）

### A · 业务跟进

| 动作 | 目标(target) | 详情(detail) |
|---|---|---|
| 添加跟进记录 | `项目编号 · 项目名称` | `跟进类型「X」 · 状态「Y」 · （内容已填写）` |
| 删除跟进记录 | `记录编号` | `删除跟进记录` |
| 修改跟进记录 | `记录编号` | `diff_enum(跟进类型/跟进状态)` + 跟进人变更；内容/日期改动标 `（已修改）` |
| 项目进展 更新 | `项目编号` | `本周进展/下步计划（已修改）`（按 field 中文名） |
| 项目进展 归档 | —（空） | `归档 N 行` |
| 项目进展 删归档 | `快照#idx` | `删除历史快照` |
| 临时/风险/商机/回款重点 · 更新 | `项目编号`（商机跟进为 `商机号` oppId） | `本周进展/下步计划（已修改）` |
| 四类跟进 · 范围设置 | —（空） | `summarize_scope` → `范围 AND/OR · N 组条件` |
| 四类跟进 · 归档 | —（空） | `归档 N 行` |
| 四类跟进 · 删归档 | `快照#idx` | `删除历史快照` |
| 保存标签 | —（空） | `标签库 N 个 · 挂载 M 项目`；相对旧 store 计数变化给 Δ（如 `12→13`） |

### B · 商机

| 动作 | 目标 | 详情 |
|---|---|---|
| 新建商机 | `商机名称`（缺则 `id`） | `新建商机 · L4:xxx` |
| 更新商机 | `商机名称`（缺则 `id`） | 改动字段 `字段 旧→新`（短值）；长文本字段只标 `（已改）` |
| 删除商机 | `N 个商机`（`ids` 数量；≤5 个列出 id） | `删除商机` |
| 导入商机 | —（整表替换） | `整表替换 · 导入 N 条（旧表已备份）` |

商机名称字段键在实现期读 `opportunities.py` 确认（取显示名字段，缺则回退 `id`）。

### C · 数据运维

| 动作 | 目标 | 详情 |
|---|---|---|
| 更新数据（reprocess） | —（空） | `触发数据重新处理` |
| 清空数据 | —（空） | `清空全部数据` |
| 停止服务 | —（空） | `请求停止服务` |
| PMIS 拉取（download） | —（空） | `触发 PMIS 数据拉取` |
| 上传 PMIS 文件 | `文件名`（query `name`） | `上传 PMIS 文件 · N 字节` |
| 上传数据文件 | `文件名`（query `name`） | `上传项目域文件 · N 字节` |
| 更新 PMIS Cookie | —（空） | `更新 PMIS Cookie`（**不含值/预览**） |
| 更新倚天 Cookie | —（空） | `更新倚天 Cookie`（**不含值**） |
| 数据回滚 | `版本 id` | `回滚到版本 <id>` |
| 撤销数据回滚 | —（空） | `撤销上次数据回滚` |
| 人工数据导入 | `文件名`（body `fileName`） | `导入 项目标签 N 条 · 跟进记录 M 条`（读 `summary`） |
| 人工数据回滚 | `版本 id` | `回滚人工导入 <id>` |

## 5. 隐私边界与边界情形

- **红线不变**：绝不记密码/哈希/salt/token/**cookie 值或预览**/完整请求体。cookie 两动作只记「更新了 X Cookie」。
- **长文本正文**（跟进内容 ≤500 字、进展文字、商机长字段）一律只标 `（已填写/已改）`，不落正文。
- **异步动作只记「触发」**：`reprocess`/`download` 在 `send_response(200)`（SSE 开始）即判成功，记的是"谁触发"，非最终结果。**关键边界**：被拒分支（其他操作进行中，走 `_json_response` 200）**不得** `_audit_set("触发…")`——`_audit_set` 仅放在**成功抢到运行槽之后**（`_acquire_run_slot` 返回 True 后、SSE 阻塞循环前）。被拒时动作/账号/时间/结果照记，详情留空。
- **旧值获取**：商机更新旧 row（`target` 变量已指向）、跟进修改旧记录（在覆盖 editable_fields 前 copy）、标签/进展旧 store（`_apply` 闭包入参 `s`）——均在 `save` 前捕获并算 diff。
- **`_audit_status` 时序**：上传/cookie/reprocess 用裸 `send_response` 或 `_json_response`，均经 `send_response` override 落 `self._audit_status`，`success` 正常计算。SSE handler 的 `_audit_request` 在流结束（handler 返回）后于 `finally` 触发，故 `_audit_set` 必须在阻塞循环之前调用。

## 6. 测试策略

1. **`audit.py` 纯函数单测**（`tests/`，pytest）：
   - `diff_enum`：无变化→`""`；单/多字段变化；旧值缺省→`（空）`；未在 `fields` 的键不出现。
   - `field_label`：已知映射、未知键原样。
   - `summarize_scope`：AND/OR + N 组；空/畸形。
   - `join_detail`：滤空、分隔符。
2. **端到端**（复用 V2.7.0 审计测试骨架 `_wait_for` 有界轮询读 `audit_log.jsonl`）：跟进 add/update/delete、进展 update、商机 update、标签 save、上传、数据回滚、reprocess（被拒 vs 正常）——断言 target/detail 符合规格表。
3. **隐私回归**：cookie save 后断言记录**不含** cookie 值/预览；带长内容的跟进 add/update 后断言 detail **不含**正文。

## 7. 版本与交付

- **版本**：**V2.8.1**（Z 级）。单一来源 `frontend/src/version.ts`；前端功能不变，仅版本号 bump → 需重建 dist。X 不动。
- **交付**：改 `server.py`（约 40 个 handler，多为 1-3 行 `_audit_set`）+ `audit.py`（纯函数）+ `version.ts`。**升级须重启后端**；不需点更新数据（审计独立于 analysis_data.json）；不需改 nginx（XFF 已配）；无 schema/数据管线变化。前端 `AuditLogTab` 零功能改动。从在线基线 V2.8.0 增量。

## 8. 非目标（YAGNI）

- 不新增审计事件类型/端点（`_ACTION_MAP` 已覆盖的写操作即全集；不新增读操作审计）。
- 不做历史空记录回填（无法重建旧请求上下文）。
- 不改前端 `AuditLogTab` 的列/筛选/导出结构。
- 不改账号管理/登录已有的 target/detail 写法。
- 不引入 before/after 的完整字段级快照存储；仅枚举字段 inline diff。
