# V2.3.2 设计：售前客户口径单一来源化（后端算 Project.customer + 项目名解析回退）

> 状态：设计已与用户确认（2 决策：后端算单一 `Project.customer` 字段 / 商机页不动）。
> 日期：2026-06-29　版本：V2.3.1 → **V2.3.2**。
> 交流语言：简体中文。沿用既有设计令牌/口径/打包约定（CLAUDE.md）。

## 0. 总览与全局约束

把散在前后端 5+ 处的「售前服务类项目客户」判断，**收敛为后端算一次、持久化的 `Project.customer` 字段**；TOP1000 判定与前端所有客户列/筛选统一读它。单一来源，杜绝口径漂移（V2.3.0 的孤儿消费方 Critical 即口径漂移所致）。

**全局约束（每个任务隐含遵守）：**
- **本次改 `schema.py` + `projects.py`（preprocess 域）+ TOP1000 重算 → 升级必须点「更新数据」才生效**（本次例外；近几版均不需要——手册需醒目标注）。
- 改 `schema.py` 后必须 `cd frontend && npm run gen:types` 重生成 `src/types/analysis.ts`。
- 不使用 emoji；设计令牌只引用 `theme.css` 变量。
- 商机页（/opportunities、/opportunities/key）与已关闭项目（清单/详情、ProjectDetailView 原项目卡）**不动**——客户口径与项目售前客户不同源。
- 版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.3.2'`、`RELEASE_DATE='2026-06-29'`。
- 验证：`bash verify.sh` 全绿。改后端纯函数先补测试再改实现。

## 1. 口径单一定义（effectiveCustomer）

对每个在建主域项目算「有效客户」：
- **非售前**：本项目 `projectPmis[pid].customer.最终客户`（去空白）。
- **售前服务类**（`projectPmis[pid].status.项目类型 == config.PRESALE_PROJECT_TYPE`）：
  1. 原项目 `projectPmis[relatedClosedId].customer.最终客户`（去空白）；
  2. 若为空（含 relatedClosedId 空 / 原项目未导出 / 原项目客户空 三种殊途同归）→ **从项目名解析**：正则 `^售前服务-(.+)-(\d+)$` 取 group(1)（贪婪 + 尾部数字锚定，正确处理客户名内含 `-` 的 2 例；不匹配 → 空）。
- 落为新字段 `Project.customer`；TOP1000 判定改用它（精确命中 `TOP1000.xlsx` 名单，**实证 19 个售前由「否」翻「是」**；对 207 个原项目客户已知的售前判定 207/207 不变——回退不改任何现有正确结果）。

> 项目名格式实证 297/297 严格 `售前服务-客户名称-12位数字`，分隔符仅 ASCII `-`；故用贪婪正则而非 `split('-')`。

## 2. 后端改动

### 2.1 解析纯函数（`projects.py`）
```python
import re  # 文件顶部若未导入则加

def parse_presale_customer_from_name(name: str) -> str:
    """从售前项目名解析客户:`售前服务-客户名称-12位数字` → 客户名称。
    贪婪 + 尾部数字锚定(客户名内含 '-' 也正确);不匹配 → ''。"""
    m = re.match(r'^' + re.escape(config.PRESALE_PREFIX) + r'-(.+)-(\d+)$', str(name or '').strip())
    return m.group(1).strip() if m else ''
```
（`config.PRESALE_PREFIX == "售前服务"` 已存在。）

### 2.2 `build_projects` 算有效客户并落字段（`projects.py:235-258`）
把 237-241 段改为带回退：
```python
        # 有效客户:非售前取本项目最终客户;售前取原项目最终客户,空则从项目名解析(单一来源,前端与 TOP1000 同读)。
        if is_presale:
            orig_customer = (project_pmis.get(related_closed) or {}).get("customer") or {}
            final_customer = str(orig_customer.get("最终客户") or "").strip()
            if not final_customer:
                final_customer = parse_presale_customer_from_name(name)
        else:
            final_customer = str(customer.get("最终客户") or "").strip()
```
（`name` 即 242 行上文 `name = str(team.get("项目名称") or "").strip()`。）TOP1000 行（242-244）不变（已用 `final_customer`）。在 append 的项目字典（245-258）加一行：
```python
            "customer": final_customer,
```

### 2.3 schema（`schema.py` Project，166-181）
在 `quadrant` 行后（或 `relatedClosedId` 后）加：
```python
    customer: str = ""        # 有效客户(单一来源):非售前=本项目最终客户;售前=原项目最终客户,空则项目名解析
```
然后 `cd frontend && npm run gen:types` 重生成 `frontend/src/types/analysis.ts`（`Project` 多 `customer`）。

### 2.4 pytest（`tests/test_presale_customer.py` 新建）
- `parse_presale_customer_from_name`：标准名 → 客户名；客户名内含 `-`（如 `售前服务-SS-Guangdong-202501010001` → `SS-Guangdong`）；不匹配（无前缀 / 无尾部数字 / 空）→ ''。
- 售前回退三态：原项目有客户 → 取原项目（不走解析）；原项目缺失但名可解析 → 取解析名；relatedClosedId 空但名可解析 → 取解析名。
- 非售前 → 取本项目最终客户。
- `build_projects` 产出的项目字典含 `customer` 字段且与有效客户一致；TOP1000 用有效客户（构造一个「原项目缺失但解析名命中 TOP1000 名单」的售前 → top1000='是'）。

## 3. 前端改动（各客户点统一读 `p.customer`，收掉 V2.3.1 散在的售前判断）

| 文件 | 现状 | 改为 |
|---|---|---|
| `lib/projectList.ts buildProjectRows` (L66) | `customer.最终客户 \|\| '-'`（本项目，售前显空） | `(p.customer ?? '') \|\| '-'` |
| `lib/keyProjects.ts buildProgressRowBase` (L50) | `p.isPresale ? v(ccust.最终客户,'-') : v(cust.最终客户,'-')`（V2.3.1 closedPmis 参） | `v(p.customer, '-')`；**移除第 4 参 `closedPmis?` 与售前分支** |
| `lib/keyProjects.ts buildKeyProjectRows` / `lib/tempFollowup.ts buildTempRows` | 传 `pmisMap[p.relatedClosedId ?? '']` 做第 4 参 | 去掉该实参 |
| `lib/riskRows.ts buildRiskRows` (L44) | `p.isPresale ? s(closedCust['最终客户']) : s(ownCust['最终客户'])` | `s(p.customer)`；移除 ownCust/closedCust/售前分支 |
| `views/ProjectDetailView.vue` 主客户 (L298) | `m.customer?.最终客户`（本项目，售前显空） | `project.customer \|\| '-'`（取主域字段；售前感知）|

- temp 范围输入 `buildScopeInputs` 的 `customer = pr?.customer` 来自 `buildProjectRows` 产出，现 `pr.customer = p.customer`，**自动跟着对，无需改**。
- 更新 V2.3.1 的 `keyProjects.test.ts` / `riskRows.test.ts` 客户用例：从「按 closedPmis 参断言售前」改为「在项目 fixture 上设 `p.customer`，断言行客户读 `p.customer`」（删除已不存在的 closedPmis 参用例）。
- `ProjectDetailView.test.ts`（若有客户断言）相应同步。

> 注：`p.customer` 经 `Project` 主域下发，已按账号 L4 裁剪（随项目一并过滤），无额外 L4 处理。

## 4. 不动（明确边界）
- 商机页 /opportunities、/opportunities/key（客户=商机独立字段）。
- `views/ProjectDetailView.vue` 原项目信息卡客户 (L266，专指原项目)。
- `lib/closedProjectList.ts`、`views/ClosedProjectDetailView.vue`（已关闭项目=原项目本身，非售前）。

## 5. 影响与交付
- **TOP1000 成员变化**：约 19 个售前项目入 TOP1000 → 升级点「更新数据」后，它们进入「重点项目进展」「重点商机跟进」等 TOP1000 范围、各页客户列显示解析出的客户名。这是需求 item 3（TOP1000 客户判断）想要的效果。
- 约 90 个当前客户列显空的售前项目，升级后客户列显示解析客户名（或原项目客户）。
- `verify.sh` 全绿（后端 pytest + gen:types 后 typecheck/vitest/build）。
- **升级必须点「更新数据」**（手册醒目标注；含 schema 变更 → 前端类型同步、TOP1000/客户字段重算）。打包按用户发话。

## 实现拆解（3 工作流）
1. **WS-1 后端**：`parse_presale_customer_from_name` + `build_projects` 有效客户/落 `customer` 字段 + `schema.py` 加字段 + `gen:types` + pytest。
2. **WS-2 前端**：`buildProjectRows`/`buildProgressRowBase`(+callers)/`buildRiskRows`/`ProjectDetailView` 改读 `p.customer` + 移除 V2.3.1 散在售前判断 + 更新测试。
3. **WS-3 收尾**：版本 V2.3.2 + PROGRESS.md（标注本次需点「更新数据」）+ `bash verify.sh`。

WS-2 依赖 WS-1 的 `gen:types`（`Project.customer` 类型）。
