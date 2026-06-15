# 2A 数据底座 实施计划（PMIS 核心回款模型）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]` 复选框追踪。

**Goal:** 把项目行回款表示换骨为 PMIS 核心——解析里程碑节点级计划回款比例，新增 `Project.paymentPmis` 摘要 + `paymentNodes` map（售前回退原项目），并在 /project/:id 回款 tab 接入。

**Architecture:** `milestones.py` 解析 `关联回款阶段` 抽 `payRatio`；`projects.build_payment_pmis` 纯函数产出摘要+节点；`preprocess_data.py` 9f 段逐项目回填（eff 售前回退）；`schema.py` 加 `ProjectPaymentPmis`/`PaymentNodePmis`/`Project.paymentPmis`/`AnalysisData.paymentNodes` + gen:types；`/project/:id` 回款 tab 加 PMIS 摘要 chips + 节点表。新增并存，旧 rawNodes/payment/panalysis 不动。依据 `docs/superpowers/specs/2026-06-15-2A-data-foundation-design.md`。

**Tech Stack:** Python 标准库 + pydantic；Vue3+Vite+TS+Vitest。

**分级调度：**

| 任务 | 难度 | 派发 | 理由 |
|---|---|---|---|
| T1 milestones payRatio 解析 | 常规 | sonnet | 纯函数+字段，TDD |
| T2 build_payment_pmis 纯函数 | 常规 | sonnet | 核心回款建模，TDD |
| T3 schema + 9f 回填 + gen:types + 真实数据 | 易踩坑 | opus | preprocess 集成/eff 售前回退/schema 校验/类型 |
| T4 /project:id 回款 tab 接入 + vitest | 常规 | sonnet | Vue 组件，仿现有 chips/表 |
| T5 版本 V1.2.0 + PROGRESS + verify | 机械 | 主循环 | 收尾 |

子代理产出经 git diff + pytest/vitest/真实数据核实。顺序 T1 → T2 → T3 →（T4）→ T5。

## 文件结构
- 改 `milestones.py`（parse_pay_stage_ratio + item payRatio）、`schema.py`（MilestoneItem.payRatio + 新模型）
- 改 `projects.py`（build_payment_pmis + _node_status + PAY_STAGES）、`tests/test_projects.py`（或新 test 文件）
- 改 `preprocess_data.py`（9f 回填）
- 改 `frontend/src/views/ProjectDetailView.vue`（+ 回款 tab PMIS 区）、`frontend/src/views/ProjectDetailView.test.ts`
- 改 `frontend/src/version.ts`、`PROGRESS.md`

---

### Task 1: `milestones.py` 解析节点级计划回款比例（TDD）

**Files:** Modify `milestones.py`、`schema.py`、`tests/test_milestones.py`

- [ ] **Step 1: 写失败测试 `tests/test_milestones.py` 追加**

```python
def test_parse_pay_stage_ratio():
    import milestones as M
    assert M.parse_pay_stage_ratio("到货款1，70.00%") == 0.70
    assert M.parse_pay_stage_ratio("到货款1，70%；到货款2，30%") == 1.0   # 多期累加
    assert M.parse_pay_stage_ratio("终验款，100.00%") == 1.0
    assert M.parse_pay_stage_ratio("") is None
    assert M.parse_pay_stage_ratio("无比例") is None


def test_row_to_milestones_has_payratio():
    import milestones as M
    rows = M.row_to_milestones({"项目编号": "P1", "计划到货时间": "2026-06-01",
                                "到货关联回款阶段": "到货款1，70.00%"})
    arrival = next(x for x in rows if x["name"] == "到货")
    assert arrival["payRatio"] == 0.70
```

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_milestones.py -q -k "payratio or pay_stage"`
Expected: FAIL（无 `parse_pay_stage_ratio` / item 无 payRatio）。

- [ ] **Step 2: 实现**

`milestones.py` 顶部确认 `import re`（无则加）。新增纯函数：

```python
def parse_pay_stage_ratio(pay_stage):
    """'到货款1，70.00%' / 多期 '到货款1，70%；到货款2，30%' → 计划回款比例(累加所有期 %/100);无 % → None。"""
    if not pay_stage:
        return None
    pcts = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*%", str(pay_stage))
    if not pcts:
        return None
    return round(sum(float(p) for p in pcts) / 100, 4)
```

`row_to_milestones`（`milestones.py:90-92`）item dict 加 `payRatio`：

```python
        out.append({"name": name, "planDate": plan, "actualDate": actual,
                    "payStage": pay, "pct": pct, "payRatio": parse_pay_stage_ratio(pay),
                    "priority": milestone_priority(name, pay)})
```

`schema.py` `MilestoneItem`（`:195-199`）加字段（在 `payStage` 后）：

```python
    payRatio: Optional[float] = None
```

- [ ] **Step 3: 通过 + 既有不回归**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_milestones.py -q && python -m py_compile milestones.py schema.py && python -m ruff check milestones.py`
Expected: 全 PASS；编译/ruff 无错。

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add milestones.py schema.py tests/test_milestones.py
git commit -m "feat(2a): milestones 解析节点级计划回款比例(关联回款阶段多期累加)+payRatio 字段"
```

---

### Task 2: `projects.build_payment_pmis` 纯函数（TDD）

**Files:** Modify `projects.py`、`tests/test_projects.py`

- [ ] **Step 1: 写失败测试 `tests/test_projects.py` 追加**

```python
class TestBuildPaymentPmis:
    def _ms(self, name, plan, actual, ratio):
        return {"name": name, "planDate": plan, "actualDate": actual, "payRatio": ratio}

    def test_nodes_and_summary(self):
        import projects as PJ
        ms = [self._ms("到货", "2026-01-01", "2026-01-02", 0.7),   # 已达成
              self._ms("终验", "2020-01-01", "", 0.3),             # planDate<today 未达成→延期
              self._ms("项目启动", "2026-01-01", "", None)]        # 非回款阶段/无比例→不计
        rec = {"total": 700000.0, "count": 2, "lastDate": "2026-06-04"}
        s, nodes = PJ.build_payment_pmis(1000000.0, ms, rec, "2026-06-15")
        assert len(nodes) == 2
        n0 = next(n for n in nodes if n["stage"] == "到货")
        assert n0["expectedPayment"] == 700000.0 and n0["reached"] is True and n0["status"] == "已达成"
        n1 = next(n for n in nodes if n["stage"] == "终验")
        assert n1["status"] == "延期" and n1["reached"] is False
        assert s["contract"] == 1000000.0 and s["actualTotal"] == 700000.0 and s["paymentCount"] == 2
        assert s["paymentRatio"] == 0.7 and s["expectedTotal"] == 1000000.0
        assert s["nodeCount"] == 2 and s["reachedCount"] == 1 and s["delayedCount"] == 1

    def test_robust_none(self):
        import projects as PJ
        s, nodes = PJ.build_payment_pmis(None, [], None, "2026-06-15")
        assert nodes == [] and s["paymentRatio"] is None and s["actualTotal"] is None
        assert s["expectedTotal"] == 0 and s["nodeCount"] == 0

    def test_pending_status(self):
        import projects as PJ
        ms = [{"name": "初验", "planDate": "2099-01-01", "actualDate": "", "payRatio": 0.5}]
        _, nodes = PJ.build_payment_pmis(1000000.0, ms, None, "2026-06-15")
        assert nodes[0]["status"] == "待达成"
```

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_projects.py -q -k "BuildPaymentPmis"`
Expected: FAIL（无 build_payment_pmis）。

- [ ] **Step 2: 实现 `projects.py`（在 `aggregate_payment` 附近追加）**

```python
PAY_STAGES = ("到货", "初验", "终验", "驻场")   # 有"关联回款阶段"的里程碑名


def _node_status(plan_date: str, reached: bool, today: str) -> str:
    if reached:
        return "已达成"
    if plan_date and plan_date < today:
        return "延期"
    return "待达成"


def build_payment_pmis(contract, milestones, pay_record, today):
    """PMIS 核心回款:计划侧=里程碑关联回款阶段比例×合同;实际侧=项目流水(不分摊节点)。
    返回 (summary, nodes)。入参已是 eff 口径(售前回退在调用方完成)。"""
    nodes = []
    for ms in milestones or []:
        if ms.get("name") not in PAY_STAGES or ms.get("payRatio") is None:
            continue
        reached = bool(ms.get("actualDate"))
        pr = ms["payRatio"]
        plan = ms.get("planDate") or ""
        nodes.append({
            "stage": ms["name"], "planDate": plan, "actualDate": ms.get("actualDate") or "",
            "payRatio": pr, "expectedPayment": round((contract or 0) * pr, 2),
            "reached": reached, "status": _node_status(plan, reached, today),
        })
    actual_total = (pay_record or {}).get("total")
    summary = {
        "contract": contract,
        "actualTotal": actual_total,
        "paymentCount": (pay_record or {}).get("count", 0),
        "paymentRatio": round(actual_total / contract, 4) if (actual_total is not None and contract) else None,
        "expectedTotal": round(sum(n["expectedPayment"] for n in nodes), 2),
        "nodeCount": len(nodes),
        "reachedCount": sum(1 for n in nodes if n["reached"]),
        "delayedCount": sum(1 for n in nodes if n["status"] == "延期"),
        "lastPaymentDate": (pay_record or {}).get("lastDate", ""),
        "fromOrigin": False,
    }
    return summary, nodes
```

（`fromOrigin` 默认 False，9f 命中原项目时改 True。）

- [ ] **Step 3: 通过 + 既有不回归**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_projects.py -q && python -m py_compile projects.py && python -m ruff check projects.py`
Expected: 全 PASS；编译/ruff 无错。

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add projects.py tests/test_projects.py
git commit -m "feat(2a): projects.build_payment_pmis 纯函数(PMIS 回款摘要+节点三态)+pytest"
```

---

### Task 3: schema 模型 + preprocess 9f 回填 + gen:types + 真实数据

**Files:** Modify `schema.py`、`preprocess_data.py`、Regenerate `frontend/src/types/analysis.ts`

依赖 T1（payRatio）、T2（build_payment_pmis）。

- [ ] **Step 1: schema 新增模型**

`schema.py`：在 `Project` 之前新增两模型，并给 `Project`/`AnalysisData` 加字段。

```python
class PaymentNodePmis(_Base):
    stage: str
    planDate: str = ""
    actualDate: str = ""
    payRatio: Optional[float] = None
    expectedPayment: float = 0
    reached: bool = False
    status: str = ""


class ProjectPaymentPmis(_Base):
    contract: Optional[float] = None
    actualTotal: Optional[float] = None
    paymentCount: int = 0
    paymentRatio: Optional[float] = None
    expectedTotal: float = 0
    nodeCount: int = 0
    reachedCount: int = 0
    delayedCount: int = 0
    lastPaymentDate: str = ""
    fromOrigin: bool = False
```

`Project`（`:157-167`）加（在 `health` 前）：`paymentPmis: Optional[ProjectPaymentPmis] = None`。
`AnalysisData`（`:277-296`）加：`paymentNodes: Dict[str, List[PaymentNodePmis]] = {}`。

- [ ] **Step 2: preprocess 9f 回填**

`preprocess_data.py`：在 9e 段末尾（S2 `overspendAmount` 回填之后、`# === 10. 构建最终数据 ===` 之前）插入 9f：

```python
    # === 9f. PMIS 核心回款模型(2A):节点级计划比例×合同 + 项目流水;售前回退原项目 ===
    def _pmis_contract(_pid):
        return ((project_pmis.get(_pid) or {}).get("customer") or {}).get("合同总额")
    _today = datetime.now().strftime("%Y-%m-%d")
    payment_nodes = {}
    for p in dept_projects:
        _pid = p["projectId"]
        _rid = p.get("relatedClosedId") or ""
        _eff, _from_origin = _pid, False
        if not _pmis_contract(_pid) and _rid and _pmis_contract(_rid):
            _eff, _from_origin = _rid, True
        _summary, _nodes = projects_mod.build_payment_pmis(
            _pmis_contract(_eff), project_milestones.get(_eff) or [],
            payment_records.get(_eff), _today)
        _summary["fromOrigin"] = _from_origin
        p["paymentPmis"] = _summary
        payment_nodes[_pid] = _nodes
    print(f"  [OK] PMIS 回款模型已回填 {len(dept_projects)} 项目(售前取原项目 {sum(1 for p in dept_projects if p['paymentPmis']['fromOrigin'])})")
```

在 `final_data` 字典（section 10）加一项：`"paymentNodes": payment_nodes,`。

注：`project_pmis`/`project_milestones`/`payment_records`/`dept_projects`/`datetime` 在 9e 段已就绪；`projects_mod` 已 import。

- [ ] **Step 3: 重生成类型 + 编译 + 既有 pytest**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile schema.py preprocess_data.py && python -m ruff check schema.py preprocess_data.py && cd frontend && npm run gen:types && cd .. && python -m pytest -q 2>&1 | tail -3`
Expected：编译/ruff 无错；`analysis.ts` 含 `paymentPmis`/`paymentNodes`/`PaymentNodePmis`；pytest 全绿（含 T1/T2 新测试）。

- [ ] **Step 4: 真实数据冒烟**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && PYTHONIOENCODING=utf-8 python preprocess_data.py 2>&1 | tail -3`
然后抽查：
```
grep -o '"fromOrigin": true' data/analysis_data.json | wc -l
python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8')); ps=[p['paymentPmis'] for p in d['projects'] if p.get('paymentPmis')]; print('有paymentPmis:',len(ps)); print('售前取原项目:',sum(1 for x in ps if x['fromOrigin'])); import itertools; print('样例:', next((x for x in ps if x['fromOrigin']), None))"
```
Expected：售前取原项目数与第一期同量级（~328）；样例 paymentPmis 的 contract/paymentRatio 合理；`paymentNodes` 非空。记录写入汇报。

- [ ] **Step 5: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add schema.py preprocess_data.py frontend/src/types/analysis.ts
git commit -m "feat(2a): schema PMIS 回款模型+preprocess 9f 回填(售前回退原项目)+类型同步"
```

---

### Task 4: `/project/:id` 回款 tab 接入 PMIS 模型（TDD）

**Files:** Modify `frontend/src/views/ProjectDetailView.vue`、`frontend/src/views/ProjectDetailView.test.ts`

依赖 T3（数据+类型就绪）。

- [ ] **Step 1: 写失败测试 `ProjectDetailView.test.ts` 追加**

沿用既有 `seed()`/`mountAt()`。先在 `seed()` 的 P-1 项目加 `paymentPmis`、`ds.data` 加 `paymentNodes`（在新测试内改 store 即可，不改 seed）：

```ts
  it('回款 tab:PMIS 回款摘要与节点表(2A)', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].paymentPmis = {
      contract: 1000000, actualTotal: 700000, paymentCount: 2, paymentRatio: 0.7,
      expectedTotal: 1000000, nodeCount: 2, reachedCount: 1, delayedCount: 1,
      lastPaymentDate: '2026-06-04', fromOrigin: false,
    }
    ;(ds.data as any).paymentNodes = { 'P-1': [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-02', payRatio: 0.7,
        expectedPayment: 700000, reached: true, status: '已达成' },
      { stage: '终验', planDate: '2020-01-01', actualDate: '', payRatio: 0.3,
        expectedPayment: 300000, reached: false, status: '延期' },
    ] }
    const w = await mountAt('/project/P-1')
    expect(w.text()).toContain('PMIS 回款')      // 区标题
    expect(w.text()).toContain('到货')
    expect(w.text()).toContain('已达成')
    expect(w.text()).toContain('延期')
  })
```

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/views/ProjectDetailView.test.ts -t "2A"`
Expected: FAIL（无 PMIS 回款区）。

- [ ] **Step 2: 实现 ProjectDetailView.vue**

`<script setup>` 加 computed（`profit`/`payRec` 定义附近）：

```ts
const pmisPay = computed(() => p.value?.paymentPmis ?? null)
const pmisNodes = computed(() =>
  ((data.data?.paymentNodes ?? {}) as Record<string, any[]>)[p.value?.projectId || ''] ?? [])
const pmisPaySummary = computed(() => {
  const s = pmisPay.value
  if (!s) return []
  return [
    { k: '合同总额(万)', v: fmtWan(s.contract) },
    { k: '流水累计(万)', v: fmtWan(s.actualTotal) },
    { k: '回款笔数', v: String(s.paymentCount ?? 0) },
    { k: '完成率', v: fmtRatio(s.paymentRatio) },
    { k: '计划回款(万)', v: fmtWan(s.expectedTotal) },
    { k: '达成/节点', v: `${s.reachedCount ?? 0}/${s.nodeCount ?? 0}` },
  ]
})
const PMIS_NODE_COLS: DataColumn[] = [
  { key: 'stage', label: '回款阶段' },
  { key: 'planDate', label: '计划日期', formatter: (v) => fmtDateCell(v) },
  { key: 'actualDate', label: '实际日期', formatter: (v) => fmtDateCell(v) },
  { key: 'payRatio', label: '计划比例', formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划回款(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'status', label: '状态' },
]
```

模板：回款 section（`tab === 'payment'`）内、`pd-note` 之前插入 PMIS 区（旧节点表保留）：

```html
            <template v-if="pmisPay">
              <div class="pd-section-title">PMIS 回款（系统核心口径<span v-if="pmisPay.fromOrigin">·取原项目</span>）</div>
              <div class="pd-chips">
                <div v-for="it in pmisPaySummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <DataTable v-if="pmisNodes.length" :columns="PMIS_NODE_COLS" :rows="pmisNodes" :show-count="false" />
              <div v-else class="pd-note">该项目无 PMIS 关联回款阶段节点。</div>
              <div class="pd-section-title">云文档回款节点（旧口径，2B 将下线）</div>
            </template>
```

（`fmtWan`/`fmtRatio`/`fmtDateCell`/`DataColumn`/`DataTable` 均已在该文件导入。）

- [ ] **Step 3: 通过 + 类型 + 构建**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/views/ProjectDetailView.test.ts && npm run typecheck && npm run build`
Expected: 全 PASS；typecheck/build 无错。

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(2a): /project/:id 回款 tab 接入 PMIS 回款摘要+节点表"
```

---

### Task 5: 版本 V1.2.0 + PROGRESS + 全量验证（主循环）

**Files:** Modify `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 升版本** `frontend/src/version.ts` → `APP_VERSION='V1.2.0'`、`RELEASE_DATE='2026-06-15'`。
- [ ] **Step 2: PROGRESS** 在回款重建程序条目下记 2A 完成（PMIS 回款模型落地，分支待合并）。
- [ ] **Step 3: 全量门禁** `cd "..." && bash verify.sh` 全绿。
- [ ] **Step 4: 提交** `git add frontend/src/version.ts PROGRESS.md && git commit -m "chore(2a): 版本 V1.2.0 + PROGRESS"`。

---

## 收尾
全部完成、pytest/vitest 全绿、真实数据冒烟核对（售前 fromOrigin ~328、paymentPmis 口径合理）后，用 superpowers:finishing-a-development-branch 收束（惯例「1 合并」→ 复跑 verify.sh → 删分支 → PROGRESS 翻 [x] 带 SHA）。2A 落地后即可立 2B（废 panalysis、在 paymentPmis/paymentNodes 上重建看板）。

## 自检（writing-plans 强制）
- **spec 覆盖**：§2.1 milestones payRatio→T1；§2.2 build_payment_pmis→T2；§2.3 9f→T3 Step2；§2.4 schema→T3 Step1；§4 节点三态→T2 `_node_status`；§5 售前 eff→T3 Step2；§6 /project:id→T4；§7 测试→T1/T2/T3 Step4/T4；§8 版本→T5。无遗漏。
- **占位符**：无 TBD；每代码步含完整代码。
- **命名一致**：`parse_pay_stage_ratio`/`build_payment_pmis`/`_node_status`/`PAY_STAGES` 在 T1/T2 定义、T3 调用；`paymentPmis`/`paymentNodes`/`ProjectPaymentPmis`/`PaymentNodePmis` 在 schema/9f/前端一致；摘要字段（contract/actualTotal/paymentRatio/expectedTotal/nodeCount/reachedCount/delayedCount/fromOrigin）贯通。
- **依赖顺序**：T3 依赖 T1+T2，T4 依赖 T3；计划已声明 T1→T2→T3→T4→T5。
