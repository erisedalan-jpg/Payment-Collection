# V2.3.2 实现计划：售前客户口径单一来源化（后端算 Project.customer + 项目名解析回退）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把售前服务类项目「客户」口径收敛为后端算一次、持久化的 `Project.customer` 字段（售前回退链：原项目最终客户→空则项目名解析），TOP1000 与前端所有客户列/筛选统一读它。

**Architecture:** 后端 `projects.py` 加两个纯函数（项目名解析 + 有效客户）+ `build_projects` 写 `Project.customer` 字段 + `schema.py` 加字段 + `gen:types`；前端各客户点改读 `p.customer`，收掉 V2.3.1 散在 3 处的售前判断。

**Tech Stack:** Python 标准库 + pydantic（schema）；Vue3 + Vite + TS + Pinia；pytest + vitest。

## Global Constraints

- 版本单一来源 `frontend/src/version.ts`：本期 `APP_VERSION='V2.3.2'`、`RELEASE_DATE='2026-06-29'`（仅 Task 3 改）。
- **本次改 `schema.py` + `projects.py`（preprocess 域）+ TOP1000 重算 → 升级必须点「更新数据」才生效**（本次例外，手册醒目标注）。
- 改 `schema.py` 后必须 `cd frontend && npm run gen:types` 重生成 `frontend/src/types/analysis.ts`，并把生成结果一并提交。
- 口径单一定义（effectiveCustomer）：非售前=本项目 `最终客户`；售前=原项目 `最终客户`→空则项目名解析 `^售前服务-(.+)-(\d+)$` 取 group(1)（贪婪+尾部数字锚定；不匹配→''）。
- **不动**：商机页（/opportunities、/opportunities/key）、已关闭项目（清单/详情）、ProjectDetailView 原项目信息卡客户。
- 不使用 emoji；设计令牌只引用 `theme.css` 变量。
- 每任务 TDD：先写失败测试 → 跑红 → 最小实现 → 跑绿 → 提交。完成定义＝该任务测试绿；全部完成后 `bash verify.sh` 全绿。
- **提交只 `git add` 本任务源/测试文件**（Task 1 含 gen 出的 `analysis.ts`），不得 `git add -A`，不得提交 `.superpowers/` 下任何文件。提交信息结尾加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 后端已确认事实（实现者直接用）

- `projects.py` 顶部导入 `os`、`config`、`from pmis import ...`，**未导入 `re`**（本任务需加 `import re`）。`config.PRESALE_PREFIX == "售前服务"`、`config.PRESALE_PROJECT_TYPE == "售前服务类"`、`config.TOP1000_LEVEL == "TOP1000大客户"`。
- `build_projects` 装配段（`projects.py:224-258`）：`name = str(team.get("项目名称") or "").strip()`（项目名）；`customer = pm.get("customer") or {}`；`is_presale`；`related_closed`；现 237-244 算 `final_customer` 仅用于 `top1000`/`quadrant`；append 的项目字典（245-258）**无 `customer` 字段**。
- `schema.py` `Project`（166-181）现有字段含 `top1000`/`quadrant`，无 `customer`。

## 前端已确认事实（合并后实测）

- `lib/keyProjects.ts buildProgressRowBase`（38-69）已有第 4 参 `closedPmis?` + `customer: p.isPresale ? v(ccust.最终客户,'-') : v(cust.最终客户,'-')`（L46/50）；`buildKeyProjectRows`（L78）传 `pmisMap[p.relatedClosedId ?? '']`。
- `lib/tempFollowup.ts buildTempRows`（L24）传 `pmisMap[p.relatedClosedId ?? '']` 第 4 参。
- `lib/riskRows.ts buildRiskRows`（33-34/44）有 `ownCust`/`closedCust` + `'客户': p.isPresale ? s(closedCust['最终客户']) : s(ownCust['最终客户'])`。
- `lib/projectList.ts buildProjectRows`（L62/66）：`const customer = m.customer ?? {}` + `customer: customer.最终客户 || '-'`（L67 的 `contractAmount` 仍用 `customer.合同总额`，**保留**，只改 L66）。
- `views/ProjectDetailView.vue`：主客户 L298 `{{ m.customer?.最终客户 || '-' }}`（`p` 为 Project，`m` 为本项目 pmis）；原项目卡 L266 `cm.value.customer?.最终客户`（**不动**）。

## 文件结构（修改一览，无新建源文件）

- 后端：`projects.py`（+2 纯函数 + build_projects 接线）、`schema.py`（+字段）、`frontend/src/types/analysis.ts`（gen 重生成）。
- 后端测试：`tests/test_presale_customer.py`（新建）。
- 前端：`lib/projectList.ts`、`lib/keyProjects.ts`、`lib/tempFollowup.ts`、`lib/riskRows.ts`、`views/ProjectDetailView.vue`。
- 前端测试：`lib/keyProjects.test.ts`、`lib/riskRows.test.ts`（更新 V2.3.1 客户用例）。
- `frontend/src/version.ts`、`PROGRESS.md`。

**任务依赖**：Task 1（后端 + gen:types）→ Task 2（前端读 `Project.customer` 类型）。Task 3 收尾。

---

### Task 1: 后端有效客户口径 + Project.customer 字段 + schema/gen:types

**Files:**
- Modify: `projects.py`、`schema.py`、`frontend/src/types/analysis.ts`(gen)
- Test: `tests/test_presale_customer.py`

**Interfaces:**
- Produces: `parse_presale_customer_from_name(name: str) -> str`、`effective_customer(is_presale: bool, own_fc: str, orig_fc: str, project_name: str) -> str`；`Project.customer: str`（前端 Task 2 依赖）。

- [ ] **Step 1: 写失败测试** —— `tests/test_presale_customer.py`：

```python
import projects


def test_parse_presale_customer_standard():
    assert projects.parse_presale_customer_from_name("售前服务-中国农业发展银行-202410140295") == "中国农业发展银行"


def test_parse_presale_customer_name_contains_dash():
    # 客户名内含 '-'(英文测试名):贪婪 + 尾部数字锚定须正确保留中段
    assert projects.parse_presale_customer_from_name("售前服务-SS-Guangdong-202501010001") == "SS-Guangdong"


def test_parse_presale_customer_with_paren():
    assert projects.parse_presale_customer_from_name(
        "售前服务-沈阳市大数据管理中心（沈阳市信息中心、沈阳市信用中心）-202502100166"
    ) == "沈阳市大数据管理中心（沈阳市信息中心、沈阳市信用中心）"


def test_parse_presale_customer_no_match_returns_empty():
    assert projects.parse_presale_customer_from_name("中国农业发展银行") == ""        # 无前缀
    assert projects.parse_presale_customer_from_name("售前服务-某客户") == ""          # 无尾部数字
    assert projects.parse_presale_customer_from_name("") == ""
    assert projects.parse_presale_customer_from_name(None) == ""


def test_effective_customer_non_presale_uses_own():
    assert projects.effective_customer(False, "本项目客户", "", "any") == "本项目客户"


def test_effective_customer_presale_prefers_origin():
    assert projects.effective_customer(True, "", "原项目客户", "售前服务-忽略-202501010001") == "原项目客户"


def test_effective_customer_presale_falls_back_to_name_parse():
    # 售前 + 原项目无客户 → 用项目名解析
    assert projects.effective_customer(True, "", "", "售前服务-某银行-202501010001") == "某银行"


def test_effective_customer_presale_no_origin_no_name_returns_empty():
    assert projects.effective_customer(True, "", "", "不规范名") == ""
```

- [ ] **Step 2: 跑红** —— `python -m pytest tests/test_presale_customer.py -q`。预期 FAIL（两函数不存在）。

- [ ] **Step 3: 实现两纯函数** —— `projects.py`：顶部 `import os` 旁加 `import re`；在 `build_projects` 之前（模块级）加：

```python
def parse_presale_customer_from_name(name) -> str:
    """从售前项目名解析客户:`售前服务-客户名称-12位数字` → 客户名称。
    贪婪 + 尾部数字锚定(客户名内含 '-' 也正确);不匹配 → ''。"""
    m = re.match(r'^' + re.escape(config.PRESALE_PREFIX) + r'-(.+)-(\d+)$', str(name or '').strip())
    return m.group(1).strip() if m else ''


def effective_customer(is_presale: bool, own_fc: str, orig_fc: str, project_name) -> str:
    """有效客户(单一来源):非售前=本项目最终客户;售前=原项目最终客户,空则项目名解析。"""
    if not is_presale:
        return own_fc
    if orig_fc:
        return orig_fc
    return parse_presale_customer_from_name(project_name)
```

- [ ] **Step 4: 跑绿（纯函数）** —— `python -m pytest tests/test_presale_customer.py -q`。预期 PASS。

- [ ] **Step 5: 接入 build_projects** —— 把 `projects.py:235-241` 那段（注释 + if/else 算 final_customer）替换为：

```python
        # 有效客户(单一来源):非售前=本项目最终客户;售前=原项目最终客户,空则项目名解析。
        # 用于 TOP1000 判定 + 落 Project.customer(前端各客户列/筛选统一读)。
        own_fc = str(customer.get("最终客户") or "").strip()
        orig_fc = str(((project_pmis.get(related_closed) or {}).get("customer") or {}).get("最终客户") or "").strip()
        final_customer = effective_customer(is_presale, own_fc, orig_fc, name)
```
（242-244 的 `t1`/`top1000`/`quadrant` 不变，仍用 `final_customer`。）在 append 的项目字典里（`"relatedClosedId": related_closed,` 之后或 `"quadrant": quadrant,` 之后）加一行：
```python
            "customer": final_customer,
```

- [ ] **Step 6: schema 加字段** —— `schema.py` 的 `Project`（166-181），在 `quadrant` 行后加：
```python
    customer: str = ""        # 有效客户(单一来源):非售前=本项目最终客户;售前=原项目最终客户,空则项目名解析
```

- [ ] **Step 7: gen:types** —— `cd frontend && npm run gen:types`。预期重生成 `frontend/src/types/analysis.ts`，`Project` 接口新增 `customer`（字符串）。

- [ ] **Step 8: 后端编译 + 测试** —— `python -m py_compile projects.py schema.py && python -m pytest tests/test_presale_customer.py -q`。预期编译通过 + 测试 PASS。

- [ ] **Step 9: 提交** ——
```bash
git add projects.py schema.py tests/test_presale_customer.py frontend/src/types/analysis.ts
git commit -m "feat(customer): 后端算有效客户(售前原项目→项目名解析回退)落 Project.customer+TOP1000用它"
```

---

### Task 2: 前端各客户点统一读 `p.customer`（收掉 V2.3.1 散在售前判断）

**Files:**
- Modify: `frontend/src/lib/projectList.ts`、`frontend/src/lib/keyProjects.ts`、`frontend/src/lib/tempFollowup.ts`、`frontend/src/lib/riskRows.ts`、`frontend/src/views/ProjectDetailView.vue`
- Test: `frontend/src/lib/keyProjects.test.ts`、`frontend/src/lib/riskRows.test.ts`

**Interfaces:**
- Consumes: Task 1 `Project.customer`。
- Produces: 所有项目客户展示读 `p.customer`；`buildProgressRowBase` 去掉第 4 参 `closedPmis`。

- [ ] **Step 1: 写失败测试（替换 V2.3.1 客户用例）** —— `keyProjects.test.ts`：把 V2.3.1 的 `describe('buildProgressRowBase 客户列售前取原项目', ...)` 整块替换为：

```ts
describe('buildProgressRowBase 客户取 Project.customer(单一来源)', () => {
  it('读 p.customer(售前/非售前都一样,口径在后端算好)', () => {
    const p1 = { projectId: 'A', customer: '已算好的客户', paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p1, {} as any, {}).customer).toBe('已算好的客户')
    const p2 = { projectId: 'B', customer: '', paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p2, {} as any, {}).customer).toBe('-')   // 空 → '-'
  })
})
```

`riskRows.test.ts`：把 V2.3.1 的 `it('风险行客户列:售前取原项目、非售前取本项目', ...)` 整条替换为：

```ts
it('风险行客户列读 Project.customer(单一来源)', () => {
  const projects = [
    { projectId: 'A', projectName: '甲', customer: 'A已算客户', paymentPmis: { contract: 0 } },
    { projectId: 'B', projectName: '乙', customer: '', paymentPmis: { contract: 0 } },
  ] as any
  const pmis = {
    A: { status: {}, riskRecords: [{ 风险编码: 'X1', 风险状态: '未关闭' }] },
    B: { status: {}, riskRecords: [{ 风险编码: 'X2', 风险状态: '未关闭' }] },
  } as any
  const rows = buildRiskRows(projects, pmis, {})
  expect(rows.find((r) => r.riskKey === 'A::X1')!['客户']).toBe('A已算客户')
  expect(rows.find((r) => r.riskKey === 'B::X2')!['客户']).toBe('')
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/keyProjects.test.ts src/lib/riskRows.test.ts`。预期 FAIL（现读 closedPmis/ownCust，非 p.customer）。

- [ ] **Step 3: 改 `keyProjects.ts`** —— `buildProgressRowBase` 去掉第 4 参与售前分支：
```ts
export function buildProgressRowBase(
  p: Project,
  pmis: ProjectPmis | undefined,
  rec: ProgressRecord,
): KeyProjectRow {
  const m = (pmis ?? {}) as Record<string, any>
  const st = m.status ?? {}, risk = m.risk ?? {}, team = m.team ?? {}
  const contract = p.paymentPmis?.contract
  return {
    projectId: p.projectId,
    customer: v(p.customer, '-'),
    projectName: p.projectName || p.projectId,
    projectLevel: v(st.项目级别, '-'),
    projectManager: v(p.projectManager, '-'),
    ar: v(team.AR, '-'),
    sr: v(team.SR, '-'),
    orgL4: v(p.orgL4, '-'),
    contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
    riskLevel: v(risk.最高等级, '无'),
    openRisks: Number(risk.未关闭风险数 ?? 0),
    weekProgress: v(rec.weekProgress),
    weekProgressEditTime: v(rec.weekProgressEditTime),
    weekProgressEditBy: v(rec.weekProgressEditBy),
    nextPlan: v(rec.nextPlan),
    nextPlanEditTime: v(rec.nextPlanEditTime),
    nextPlanEditBy: v(rec.nextPlanEditBy),
    followDate: followDate(rec),
    followBy: followBy(rec),
  }
}
```
（删了 `cust`、`ccust` 两个局部变量。）`buildKeyProjectRows` 的 map 调用去掉第 4 参：
```ts
    .map((p) => buildProgressRowBase(p, pmisMap[p.projectId], current[p.projectId] ?? {}))
```

- [ ] **Step 4: 改 `tempFollowup.ts`** —— `buildTempRows` 第 24 行去掉第 4 参：
```ts
      const base = buildProgressRowBase(p, pmis, current[p.projectId] ?? {})
```

- [ ] **Step 5: 改 `riskRows.ts`** —— `buildRiskRows` 删 `ownCust`/`closedCust` 两行（33-34），并把 `'客户'`（L44）改为读 `p.customer`：
```ts
    const contract = (p.paymentPmis as Record<string, any> | null | undefined)?.contract
    const status = m.status ?? {}
    for (const rr of recs) {
      const riskCode = s(rr['风险编码'])
      const riskKey = `${p.projectId}::${riskCode}`
      const follow = current[riskKey] ?? {}
      out.push({
        ...rr,
        projectId: p.projectId,
        '项目编号': p.projectId,
        '项目名称': p.projectName ?? '',
        '客户': s(p.customer),
        '项目金额': typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
        // …其余项目列与跟进字段保持不变…
      })
    }
```

- [ ] **Step 6: 改 `projectList.ts`** —— `buildProjectRows` 第 66 行（`customer: customer.最终客户 || '-'`）改为：
```ts
      customer: p.customer || '-',
```
（第 62 行 `const customer = m.customer ?? {}` 与第 67 行 `contractAmount: ... customer.合同总额` **保留**——合同总额仍来自 pmis customer。）

- [ ] **Step 7: 改 `ProjectDetailView.vue`** —— 主客户 L298（`{{ m.customer?.最终客户 || '-' }}`）改为：
```vue
            <span>客户 <b>{{ p.customer || '-' }}</b></span>
```
（L301/302 的 `m.customer?.签约单位`/`合同总额` 保留；原项目卡 L266 不动。）

- [ ] **Step 8: 跑绿 + typecheck** —— `cd frontend && npx vitest run src/lib/keyProjects.test.ts src/lib/riskRows.test.ts && npm run typecheck`。预期 PASS + 无新增类型错误。

- [ ] **Step 9: 全量前端测试回归** —— `cd frontend && npx vitest run`。预期全绿（若别处 buildProjectRows/buildProgressRowBase 的客户断言因口径改变需同步，按真实新值更新——只改测试断言、不放宽）。

- [ ] **Step 10: 提交** ——
```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/keyProjects.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/riskRows.ts frontend/src/views/ProjectDetailView.vue frontend/src/lib/keyProjects.test.ts frontend/src/lib/riskRows.test.ts
git commit -m "feat(customer): 前端各客户点统一读 Project.customer(收掉V2.3.1散在售前判断)"
```

---

### Task 3: 版本号 + PROGRESS.md + 全量验证

**Files:** Modify `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本号** —— `frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V2.3.2'
export const RELEASE_DATE = '2026-06-29'
```

- [ ] **Step 2: PROGRESS.md** —— 同步头部（当前 V2.3.2 / 上一 V2.3.1）；版本史顶部加 V2.3.2 摘要：售前客户口径单一来源化——后端算有效客户（售前=原项目最终客户→空则项目名解析 `^售前服务-(.+)-(\d+)$`）落 `Project.customer`，TOP1000 与前端所有客户列/筛选统一读它；约 19 个售前入 TOP1000、约 90 个客户列由空变有值；商机/已关闭页不动。**醒目标注：本次改 schema/preprocess + TOP1000 重算 → 升级必须点「更新数据」才生效**。风格同现有条目，不使用 emoji。

- [ ] **Step 3: 全量验证** —— `bash verify.sh`。预期全绿（py 编译 + ruff + pytest + 前端 typecheck + vitest + build）。

- [ ] **Step 4: 提交** ——
```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.3.2 版本号+PROGRESS(售前客户口径单一来源化,升级须点更新数据)"
```

---

## 交付（实现全绿后，按用户发话决定是否打包）

1. PowerShell 出 `/pm` 构建 + `make_update_zip.py` → `release/pmplatform-update-V2.3.2.zip` + 重建默认 base dist（同以往套路）。
2. 写 `deploy/升级手册-V2.3.2.md`：**头号醒目——升级后必须点「更新数据」**（含 schema 变更/TOP1000 与客户字段重算才生效）；售前项目客户列将显示解析/原项目客户、约 19 个售前入 TOP1000（会进重点项目/重点商机范围）；商机/已关闭页不变；无新依赖、无新页。
3. 走 superpowers:finishing-a-development-branch。

## Self-Review 摘要

- **Spec 覆盖**：口径单一定义=Task1 两纯函数；后端落字段+TOP1000=Task1；schema/gen:types=Task1；前端各点读 p.customer（projectList/keyProjects+callers/tempFollowup/riskRows/ProjectDetailView）=Task2；不动商机/已关闭/原项目卡=Task2 明确保留；升级须更新数据=Task3+交付。全覆盖。
- **类型一致**：`parse_presale_customer_from_name`/`effective_customer`(Task1) ↔ pytest 用名一致；`Project.customer`(Task1 schema/gen) ↔ 前端 `p.customer`(Task2) 一致；`buildProgressRowBase` 去第 4 参 ↔ buildKeyProjectRows/buildTempRows 去实参一致。
- **占位**：Task5 riskRows「其余项目列与跟进字段保持不变」为既有代码保留说明（MODIFY），非真空白。
