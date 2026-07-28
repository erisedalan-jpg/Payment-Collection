# 客户与产品分析页 V4.5.5 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/yitian/customer-product`「客户与产品分析」页，把 V4.5.4 落地的派生字段变成 6 个可下钻的分析块，并扩充倚天域共享筛选器。

**Architecture:** 纯前端为主 —— 聚合口径全部下沉到 `lib/yitian/customerProduct.ts` 纯函数（可单测、零 DOM 依赖），页面只做装配；两张热力图共用一个 HTML 表格组件（不用 ECharts heatmap —— 工具 v4.0 实践证明表格在这个数据规模下更清晰且可折叠）。后端仅两处小改：补 `meta.top1000Named`（B-3 的分母必须来自清单全量，不能只统计我们碰过的客户）+ 修 `_YITIAN_PAGE_KEYS` 漏 `yitian-detail` 的既有缺陷。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + ECharts + vitest（前端）；Python 标准库 + pydantic（后端两处小改）。无新增依赖。

## Global Constraints

- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 版本号 **V4.5.5**，单一来源 `frontend/src/version.ts`，只改此处。
- **不改 V4.5.4 已定的任何口径**：五档枚举值、校准状态枚举、`transferable` 判定顺序一律不动。
- **不改饱和度口径**（V4.4.5 双基准）。本期**禁止修改** `lib/yitian/metrics.ts`。
- 设计令牌：间距只用 `--sp-*`，圆角 `--r-*`，阴影只有 `--shadow-1/2`，数字列必须挂 `.u-num`，状态色只用 `--ok/--warn/--danger` 及其 `-bg/-text` 变体。**页面不得自绘页头与 tab 条**（用 `PageHeader.vue` / `PageTabs.vue`）。
- 新页**挂 `tabGroup: 'yitian-analysis'`，侧栏项数保持 23 不变**。
- 完成定义：`bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 提交信息结尾附 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。
- **绝不 `git add -A`**；只 add 本任务明确改动的文件。
- 反向验证还原**绝不用 `git checkout <file>`**（工作树常有其它未提交改动）；用 Read+Edit，或 `cp` 备份到 scratchpad **并立刻验证备份文件存在**（Git Bash 下 `$TMPDIR` 为空，`cp` 会静默失败）。

## 四个判断调用（已定，实施勿改；如需推翻请先反馈）

1. **B-3 的市场BG 轴当前退化**：`input/TOP1000.xlsx` 139 行**全部是「市场BG3」**，故该表当前只有 1 行。**仍按 BG 分组实现** —— 换一份更全的清单（backlog L-40）后自动生效，零代码改动。
2. **B-2 客户清单默认 TOP50**：实测 953 个客户，全量渲染不可用。默认按工时降序取前 50，提供「显示全部」开关。
3. **A-4 客户 × 产品交叉固定取 TOP20 客户**：实测 1664 个非零组合，坐标轴放 953 个客户不可读。
4. **五档 KPI 在本页随筛选变**：`YitianReadinessCard`（总览页那张）是全量口径、不随筛选，本页需要跟着筛选走的版本。故把五档聚合抽成 `derived.transferBuckets()` 共用，**并把 `YitianReadinessCard` 改为调用它**（避免同一口径两份实现漂移），该卡既有测试即回归安全网。

## 实测基线（设计期实跑，作为实施期对拍标准）

数据快照：`data/yitian_data.json`，客户类工时 **10195 行 / 62314 h**。

**B-1 客户支持情况**（客户分类 × 客户象限，全区间无筛选）：

| 客户分类 | 象限 | 客户数 | 合计 | 项目类 | 售前类 | 售后类 |
|---|---|---|---|---|---|---|
| TOP1000 | M1 | 74 | 16851 | 12534 | 2295 | 2021 |
| TOP1000 | M2 | 20 | 7653 | 5734 | 391 | 1528 |
| TOP1000 | M3 | 1 | 26 | 0 | 0 | 26 |
| TOP1000 | M4 | 2 | 101 | 0 | 0 | 101 |
| 非TOP1000 | (未匹配) | 856 | 37683 | 24717 | 5247 | 7719 |

**B-2**：953 个不同客户；工时 TOP5 = `受影响的客户 2810` / `中国农业银行股份有限公司 2044` / `中国建设银行股份有限公司 1481` / `新华人寿保险股份有限公司 1250` / `中国移动通信集团北京有限公司 1224`。

**B-3**：指名 139（全部市场BG3），实际支持 97，覆盖率 **69.8%**。

**B-4 / A-2 产品大类分布**（10 档）：终端安全 22796(36.6%) / 其他 9687(15.5%) / 传统等保 9615(15.4%) / 天眼 7141(11.5%) / 态势感知 6484(10.4%) / 云与服务器安全 2648(4.2%) / 数据安全 1862(3.0%) / AI等新方向 1256(2.0%) / 工控安全 792(1.3%) / 电子取证 32(0.1%)。

**A-2 组织轴**：12 个 L4，工时前四 = 小金融服务组 10910 / 银行服务组 10552 / 浙江服务组 8420 / 京津服务组 7163。

**A-4**：1664 个非零（客户 × 大类）组合。

> **重要事实**：`其他` 是 `产品分类.xlsx` 里的**合法大类**且 `channel=false`，所以校准失败的行落在「其他」而非「未分类」，并保守地全部计入「非渠道可交付」。实测 `ec is None` 的客户类行数为 **0**，**热力图不需要「未分类」列**。

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| 改 `yitian.py` | `meta` 增 `top1000Named`（市场BG → 指名客户数，取自清单全量） | T1 |
| 改 `schema.py` | `YitianMeta.top1000Named: Dict[str, int]` | T1 |
| 改 `server.py` | `_YITIAN_PAGE_KEYS` 补 `yitian-detail`（既有缺陷）与新页 key | T1 |
| 改 `config.py` | `PAGE_DOMAINS` 增 `yitian-customer-product` | T1 |
| 改 `frontend/src/lib/pageAccess.ts` / `pageScope.ts` / `nav.ts` / `router/index.ts` | 新 pageKey 全链路注册 | T1 |
| 改 `frontend/src/types/yitian.ts` | `gen:types` 生成 | T1 |
| **新建** `frontend/src/views/YitianCustomerProductView.vue` | 页面骨架（T1）→ 装配六块（T5） | T1 T5 |
| 改 `frontend/src/stores/yitianView.ts` | 新增 `prodCats` / `types` / `mgrMode` / `displayMode` 四个筛选状态 | T2 |
| 改 `frontend/src/components/YitianToolbar.vue` | 三个筛选器 + 显示项切换 UI | T2 |
| 改 `frontend/src/lib/yitian/derived.ts` | 抽出 `transferBuckets()` 供两处共用 | T3 |
| 改 `frontend/src/components/YitianReadinessCard.vue` | 改调 `transferBuckets()`（口径单一来源） | T3 |
| **新建** `frontend/src/lib/yitian/customerProduct.ts` | 六块聚合口径（纯函数） | T3 T4 |
| **新建** `frontend/src/components/HeatmapTable.vue` | 两张热力图共用的 HTML 表格 | T4 |
| 改 `frontend/src/version.ts` / `PROGRESS.md` | 收尾 | T6 |

---

### Task 1: 新页链路打通（后端 + pageKey 全链路 + 空页骨架）

**Files:**
- Modify: `yitian.py`（`build_yitian_data` 的 `meta` 段）
- Modify: `schema.py`（`YitianMeta`）
- Modify: `server.py:343`（`_YITIAN_PAGE_KEYS`）
- Modify: `config.py`（`PAGE_DOMAINS`）
- Modify: `frontend/src/lib/pageAccess.ts`、`frontend/src/lib/pageScope.ts`、`frontend/src/nav.ts`、`frontend/src/router/index.ts`
- Create: `frontend/src/views/YitianCustomerProductView.vue`（骨架）
- Test: `tests/test_yitian.py`、`tests/test_server_yitian.py`、`frontend/src/lib/pageAccess.test.ts`、`frontend/src/nav.test.ts`

**Interfaces:**
- Consumes: V4.5.4 的 `read_top1000(path) -> {name: {"level","quad","bg"}}`
- Produces:
  - `yitian_data.meta.top1000Named: Dict[str, int]` —— 市场BG → 该 BG **指名**的 TOP1000 客户数（取自清单全量，**与工时数据无关、不随筛选变**）。市场BG 为空的客户归入键 `"(未标BG)"`。
  - pageKey `yitian-customer-product`，路由 `/yitian/customer-product`，`tabGroup: 'yitian-analysis'`，`hideFilter: true`。

**背景（两个必须知道的点）**：
1. B-3「TOP1000 覆盖度」的分母是「**指名**多少」，必须来自 TOP1000 清单全量 —— 只统计工时里出现过的客户会把分母缩成 97，覆盖率恒等于 100%，指标彻底失效。
2. `server.py:343` 的 `_YITIAN_PAGE_KEYS` 是「持有任一倚天页面授权即可读倚天数据」的闸，**它漏了 `yitian-detail`**（V4.1.0 加明细页时没同步）。后果：只勾「工时明细」的账号能进页面，但 `/api/yitian/data` 回 403、页面报错。本任务一并修。

- [ ] **Step 1: 写后端失败测试**

在 `tests/test_yitian.py` 末尾追加：

```python
def test_meta_top1000Named_取自清单全量(tmp_path, monkeypatch):
    """指名数是覆盖率的分母,必须来自 TOP1000 清单全量——只算工时里出现过的客户
    会让分母缩成实际支持数、覆盖率恒 100%,指标彻底失效。"""
    import yitian as Y
    monkeypatch.setattr(Y, "read_org_roster", lambda p: [
        {"id": "A001", "name": "老王", "l2": "", "l3": "", "l31": "", "l4": "一组",
         "category": "正式", "supId": "", "supName": ""}])
    monkeypatch.setattr(Y, "read_top1000", lambda p: {
        # 甲有工时、乙丙没有 —— 三家都必须计入指名
        "甲公司": {"level": "TOP1000大客户", "quad": "M1 战略核心区", "bg": "市场BG3"},
        "乙公司": {"level": "TOP1000大客户", "quad": "M2 现金牛/打猎区", "bg": "市场BG3"},
        "丙公司": {"level": "TOP1000大客户", "quad": "M4 待开拓/长尾区", "bg": "市场BG1"},
        "丁公司": {"level": "普通客户", "quad": "", "bg": "市场BG1"},   # 非 TOP1000,不计
        "戊公司": {"level": "TOP1000大客户", "quad": "M3 潜力培育区", "bg": ""},  # 无 BG
    })
    monkeypatch.setattr(Y, "read_product_categories", lambda p: {})
    store = {"rows": [{
        "wid": "1", "emp_id": "A001", "date": "2026-06-01", "work_type": "项目类",
        "hours": 8.0, "content": "巡检", "customer": "甲公司", "project_type": "",
        "work_type3": "产品巡检", "product_line": "NGSOC", "product_name": "",
        "work_order": "", "sales_l2": "", "service_mode": "",
    }]}
    d = Y.build_yitian_data(str(tmp_path), store=store)
    assert d["meta"]["top1000Named"] == {"市场BG3": 2, "市场BG1": 1, "(未标BG)": 1}


def test_meta_top1000Named_无清单时为空字典(tmp_path, monkeypatch):
    import yitian as Y
    monkeypatch.setattr(Y, "read_org_roster", lambda p: [
        {"id": "A001", "name": "老王", "l2": "", "l3": "", "l31": "", "l4": "一组",
         "category": "正式", "supId": "", "supName": ""}])
    monkeypatch.setattr(Y, "read_top1000", lambda p: {})
    monkeypatch.setattr(Y, "read_product_categories", lambda p: {})
    store = {"rows": [{
        "wid": "1", "emp_id": "A001", "date": "2026-06-01", "work_type": "项目类",
        "hours": 8.0, "content": "x", "customer": "", "project_type": "",
        "work_type3": "", "product_line": "", "product_name": "",
        "work_order": "", "sales_l2": "", "service_mode": "",
    }]}
    d = Y.build_yitian_data(str(tmp_path), store=store)
    assert d["meta"]["top1000Named"] == {}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian.py -k "top1000Named" -v`
Expected: FAIL —— `KeyError: 'top1000Named'`

- [ ] **Step 3: 后端实现**

`yitian.py` 的 `build_yitian_data`，在既有 `top_names = {...}` 之后加：

```python
    # 指名客户数(B-3 覆盖率的分母):取自 TOP1000 清单【全量】,与工时数据无关。
    # 只统计工时里出现过的客户会让分母缩成实际支持数、覆盖率恒 100%,指标失效。
    named_by_bg: Dict[str, int] = {}
    for _n, _v in top1000.items():
        if _v.get("level") != config.TOP1000_LEVEL:
            continue
        _bg = _v.get("bg", "") or "(未标BG)"
        named_by_bg[_bg] = named_by_bg.get(_bg, 0) + 1
```

在返回 dict 的 `meta` 段（`dataReadiness` 之前）加：

```python
            "top1000Named": named_by_bg,   # 市场BG → 指名客户数(清单全量,B-3 覆盖率分母)
```

`schema.py` 的 `YitianMeta`，在 `dataReadiness` 之前加：

```python
    top1000Named: Dict[str, int]     # 市场BG → 指名的 TOP1000 客户数(清单全量,不随工时变)
```
（`Dict` 已在 `schema.py` 顶部 import；若无则加 `from typing import Dict`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian.py tests/test_schema_yitian.py -q`
Expected: 全部 PASS。
> `tests/test_schema_yitian.py` 的 `minimal_yitian` fixture 需在 `meta` 里补 `"top1000Named": {}`，否则 pydantic 报缺字段 —— 这是**预期的**，补上即可。

- [ ] **Step 5: 用真实数据核对**

```bash
python preprocess_data.py 2>&1 | grep -E "倚天工时域"
python -c "
import sys, json; sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open('data/yitian_data.json', encoding='utf-8'))
print('top1000Named =', d['meta']['top1000Named'])
print('指名合计 =', sum(d['meta']['top1000Named'].values()))
"
```
Expected: `top1000Named = {'市场BG3': 139}`，指名合计 **139**。
> 对不上就停下查，不要改期望值。

- [ ] **Step 6: 修 `_YITIAN_PAGE_KEYS` 并写回归测试**

`server.py:343` 改为（补 `yitian-detail` 与新页）：

```python
# 持有任一倚天页面授权即可读倚天数据(纵深防御:工时是员工级数据,未授权页面的账号连 curl 也不该拿到)
# yitian-detail 曾被漏掉(V4.1.0 加明细页时未同步),后果是只勾「工时明细」的账号
# 能进页面却拿不到数据、页面报 403。新增倚天页面时必须同步本元组。
_YITIAN_PAGE_KEYS = ('yitian', 'yitian-detail', 'yitian-compliance', 'yitian-analytics',
                     'yitian-trend', 'yitian-customer', 'yitian-customer-product')
```

`tests/test_server_yitian.py` 里**已有一条会被撞红的孤儿断言**（`TestYitianPageGate.test_page_keys_cover_five_pages`，写死了 5 个页键的精确集合）。**把它整条替换**为以 `PAGE_DOMAINS` 为单一来源的守卫，今后新增倚天页面自动纳入：

```python
    def test_页键元组与倚天域页面集合一致(self):
        """新增倚天页面忘了同步这个元组 → 该页账号进得去页面却拿不到数据(403)。
        取代原来写死五个 key 的断言:那种写法每加一页都要手工改,而漏改正是
        yitian-detail 当年被落下的原因。"""
        domain_pages = set(config.DOMAIN_PAGES['yitian'])
        # 自证断言:PAGE_DOMAINS 解析失配会得到空集,下面的相等断言就成了空对空恒真
        assert len(domain_pages) >= 6, 'PAGE_DOMAINS 倚天域页面数异常: %r' % domain_pages
        assert set(S._YITIAN_PAGE_KEYS) == domain_pages
```

再追加一条端到端回归（沿用该文件既有的 `_start` / `_login` 辅助，本仓服务端测试走真实 HTTP、不 mock）：

```python
def test_只勾工时明细的账号也能读倚天数据(tmp_path, monkeypatch):
    """V4.1.0 起 yitian-detail 是独立 pageKey,但 _YITIAN_PAGE_KEYS 漏了它,
    导致只勾「工时明细」的账号进得去页面、拿不到数据(403)。本条钉死修复。"""
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/admin/accounts/create",
                     json.dumps({"account": "det", "password": "Pw123456", "displayName": "d",
                                 "allowedPages": ["yitian-detail"], "allowedL4": ["*"]}),
                     {"Content-Type": "application/json", "Cookie": ck})
        conn.getresponse().read()
        conn2, ck2 = _login(port, "det", "Pw123456")
        conn2.request("GET", "/api/yitian/data", headers={"Cookie": ck2})
        r = conn2.getresponse()
        body = r.read()
        # 修复前这里是 403「无倚天工时页面权限」。200 或 404(本地无 yitian_data.json)
        # 都算通过 —— 要钉的是「不再被页面权限闸拦掉」,不是数据一定存在。
        assert r.status != 403, body[:200]
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 7: 前端 pageKey 全链路注册（七处，缺一不可）**

1. `config.py` 的 `PAGE_DOMAINS` 增 `'yitian-customer-product': 'yitian',`（放在 `'yitian-customer'` 之后）
2. `frontend/src/lib/pageScope.ts` 的 `PAGE_DOMAINS` 同样增一条（**与 config.py 有跨语言同步测试锁着，两边必须一致**）
3. `frontend/src/lib/pageAccess.ts` 的 `PAGE_KEYS` 数组增 `'yitian-customer-product'`（放在 `'yitian-customer'` 之后）；把该文件第 22 行注释里的「30 个 PageKey」改为「31 个 PageKey」
4. `frontend/src/nav.ts` 的 `TAB_GROUPS['yitian-analysis']` 增：
```ts
    { label: '客户与产品分析', to: '/yitian/customer-product', key: 'yitian-customer-product' },
```
5. `frontend/src/router/index.ts` 在 `/yitian/customer` 之后增：
```ts
    { path: '/yitian/customer-product', name: 'yitian-customer-product', component: YitianCustomerProductView, meta: { title: '客户与产品分析', hideFilter: true, pageKey: 'yitian-customer-product', tabGroup: 'yitian-analysis' } },
```
并在文件顶部按既有风格 import `YitianCustomerProductView`。
6. `frontend/src/nav.test.ts:26` 的 `expect(groups.flat().length).toBe(10)` 改为 `toBe(11)`
7. `frontend/src/lib/pageAccess.test.ts` 里两处「五个倚天页面」的数组各补 `'yitian-customer-product'`，标题「五个」改「六个」

> **`NAV_SECTIONS` 的项数断言（`nav.test.ts` 里的 `toBe(23)`）不要改** —— 新页挂 tab 组，不进侧栏 items，23 保持不变。若它变红说明第 4 步改错了地方。

- [ ] **Step 8: 建页面骨架**

`frontend/src/views/YitianCustomerProductView.vue`：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import PageTabs from '@/components/PageTabs.vue'
import AppCard from '@/components/AppCard.vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'

const store = useYitianStore()
onMounted(() => store.load())
</script>

<template>
  <div>
    <PageHeader title="客户与产品分析" />
    <PageTabs />
    <YitianToolbar />
    <AppCard v-if="store.error"><p class="ycp-err">{{ store.error }}</p></AppCard>
    <AppCard v-else><p class="ycp-todo">分析块将在后续任务装配。</p></AppCard>
  </div>
</template>

<style scoped>
.ycp-err { margin: 0; color: var(--danger-text); }
.ycp-todo { margin: 0; color: var(--mut); font-size: var(--fs-1); }
</style>
```
> `PageHeader` / `PageTabs` 的实际 props 以仓库里 `YitianCustomerView.vue` 的用法为准（照抄那一份的写法，勿臆造 props）。

- [ ] **Step 9: 生成类型并全量跑**

```bash
npm --prefix frontend run gen:types
npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- src/lib/pageAccess.test.ts src/nav.test.ts src/lib/pageScope.test.ts
python -m pytest tests/test_yitian.py tests/test_schema_yitian.py tests/test_server_yitian.py tests/test_server_page_scope.py -q
```
Expected: 全部 PASS。

- [ ] **Step 10: 提交**

```bash
git add yitian.py schema.py server.py config.py \
        frontend/src/lib/pageAccess.ts frontend/src/lib/pageAccess.test.ts \
        frontend/src/lib/pageScope.ts frontend/src/nav.ts frontend/src/nav.test.ts \
        frontend/src/router/index.ts frontend/src/types/yitian.ts \
        frontend/src/views/YitianCustomerProductView.vue \
        tests/test_yitian.py tests/test_schema_yitian.py tests/test_server_yitian.py
git commit -m "feat(yitian): 新增客户与产品分析页骨架,并补 top1000Named 与倚天页键守卫

meta.top1000Named 是 B-3 覆盖率的分母,必须取自 TOP1000 清单全量——只统计工时里
出现过的客户会让分母缩成实际支持数、覆盖率恒 100%。

顺修既有缺陷:_YITIAN_PAGE_KEYS 漏了 yitian-detail(V4.1.0 加明细页时未同步),
只勾「工时明细」的账号进得去页面却拿不到数据。已加以 PAGE_DOMAINS 为单一来源的守卫。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 筛选器扩充与显示项切换

**Files:**
- Modify: `frontend/src/stores/yitianView.ts`
- Modify: `frontend/src/components/YitianToolbar.vue`
- Test: `frontend/src/stores/yitianView.test.ts`（若不存在则新建）、`frontend/src/components/YitianToolbar.test.ts`

**Interfaces:**
- Consumes: 无（与 T1 文件不重叠，可并行）
- Produces: `useYitianViewStore()` 新增四个响应式成员，供 T3/T4/T5 消费：
  - `prodCats: Ref<string[]>` —— 选中的产品大类；空数组 = 不过滤
  - `types: Ref<string[]>` —— 选中的工时类型；空数组 = 不过滤
  - `mgrMode: Ref<'all' | 'only' | 'exclude'>` —— 管理干部；默认 `'all'`
  - `displayMode: Ref<'hours' | 'pct' | 'both'>` —— 显示项；默认 `'both'`
  - 四者一并进 `persist()` / `hydrate()`（按登录账号持久化，V2.8.3 范式）

- [ ] **Step 1: 写失败测试**

新建或追加 `frontend/src/stores/yitianView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useYitianViewStore } from './yitianView'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('yitianView 新增筛选维度(V4.5.5)', () => {
  it('四个新成员有正确默认值', () => {
    const v = useYitianViewStore()
    expect(v.prodCats).toEqual([])       // 空 = 不过滤
    expect(v.types).toEqual([])
    expect(v.mgrMode).toBe('all')
    expect(v.displayMode).toBe('both')
  })

  it('hydrate 能读回持久化的四个新成员', () => {
    const a = useYitianViewStore()
    a.hydrate()
    a.prodCats = ['终端安全']
    a.types = ['项目类']
    a.mgrMode = 'exclude'
    a.displayMode = 'pct'
    // 换一个 pinia 实例模拟刷新
    setActivePinia(createPinia())
    const b = useYitianViewStore()
    b.hydrate()
    expect(b.prodCats).toEqual(['终端安全'])
    expect(b.types).toEqual(['项目类'])
    expect(b.mgrMode).toBe('exclude')
    expect(b.displayMode).toBe('pct')
  })

  it('坏的 mgrMode/displayMode 值被忽略而非原样写入', () => {
    localStorage.setItem(
      Object.keys(localStorage).find((k) => k.includes('yitian_view')) ?? 'yitian_view',
      JSON.stringify({ mgrMode: 'xxx', displayMode: 'yyy', prodCats: 'not-an-array' }),
    )
    const v = useYitianViewStore()
    v.hydrate()
    expect(v.mgrMode).toBe('all')
    expect(v.displayMode).toBe('both')
    expect(v.prodCats).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/stores/yitianView.test.ts`
Expected: FAIL —— `expect(v.prodCats).toEqual([])` 得到 `undefined`

- [ ] **Step 3: 改 store**

`frontend/src/stores/yitianView.ts`：

```ts
  const l4s = ref<string[]>([])
  // ── V4.5.5 新增筛选维度(客户与产品分析页共用) ──
  const prodCats = ref<string[]>([])                                   // 产品大类;空 = 不过滤
  const types = ref<string[]>([])                                      // 工时类型;空 = 不过滤
  const mgrMode = ref<'all' | 'only' | 'exclude'>('all')               // 管理干部
  const displayMode = ref<'hours' | 'pct' | 'both'>('both')            // 显示项
```

`persist()` 的 JSON 增四个键；`watch` 的依赖数组增四个 ref；`hydrate()` 增：

```ts
        if (Array.isArray(p.prodCats)) prodCats.value = p.prodCats
        if (Array.isArray(p.types)) types.value = p.types
        // 枚举值必须白名单校验:坏值原样写入会让下游 switch 落到 default 分支静默失效
        if (p.mgrMode === 'only' || p.mgrMode === 'exclude' || p.mgrMode === 'all') {
          mgrMode.value = p.mgrMode
        }
        if (p.displayMode === 'hours' || p.displayMode === 'pct' || p.displayMode === 'both') {
          displayMode.value = p.displayMode
        }
```

`hydrate()` 的 `Partial<{...}>` 类型注解同步补四个字段；`return` 增四个成员。
若该 store 有 `reset()`，四个新成员一并复位为默认值。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/stores/yitianView.test.ts`
Expected: 3 passed

- [ ] **Step 5: 反向验证**

把 `if (p.mgrMode === 'only' || ...)` 整段换成无条件 `mgrMode.value = p.mgrMode as never`，重跑，**必须红**在「坏的 mgrMode/displayMode 值被忽略」。确认后改回。

- [ ] **Step 6: 加工具栏 UI**

`YitianToolbar.vue` 的 `<script setup>` 增：

```ts
import { useYitianStore } from '@/stores/yitian'   // 已有,勿重复 import

/** 产品大类选项:取自数据码表,按 dims.prodCats 原序(后端已按业务顺序排,"其他"末位)。 */
const prodCatOptions = computed(() => store.data?.dims.prodCats ?? [])
/** 工时类型选项:取自数据码表。 */
const typeOptions = computed(() => store.data?.dims.types ?? [])

const MGR_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'only', label: '仅管理干部' },
  { value: 'exclude', label: '排除管理干部' },
] as const
const DISPLAY_OPTIONS = [
  { value: 'hours', label: '只显示工时' },
  { value: 'pct', label: '只显示比例' },
  { value: 'both', label: '工时和比例' },
] as const
```

模板中在既有 L4 选择器之后加（用 Element Plus，与既有控件同款 `size`）：

```vue
    <el-select v-model="view.prodCats" multiple collapse-tags clearable
               placeholder="产品大类(全部)" class="yt-sel" data-test="yt-prodcat">
      <el-option v-for="c in prodCatOptions" :key="c" :label="c" :value="c" />
    </el-select>
    <el-select v-model="view.types" multiple collapse-tags clearable
               placeholder="工时类型(全部)" class="yt-sel" data-test="yt-type">
      <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
    </el-select>
    <el-select v-model="view.mgrMode" class="yt-sel yt-sel--sm" data-test="yt-mgr">
      <el-option v-for="o in MGR_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
    </el-select>
    <el-radio-group v-model="view.displayMode" size="small" data-test="yt-display">
      <el-radio-button v-for="o in DISPLAY_OPTIONS" :key="o.value" :value="o.value">
        {{ o.label }}
      </el-radio-button>
    </el-radio-group>
```

样式按既有 `.yt-sel` 补 `.yt-sel--sm { min-width: 140px; }`（间距只用 `--sp-*`）。

- [ ] **Step 7: 加工具栏测试**

在 `frontend/src/components/YitianToolbar.test.ts` 追加：

```ts
it('四个新筛选控件都渲染出来', async () => {
  const w = await mountToolbar()          // 沿用该文件既有的挂载辅助
  for (const t of ['yt-prodcat', 'yt-type', 'yt-mgr', 'yt-display']) {
    expect(w.find(`[data-test="${t}"]`).exists(), t).toBe(true)
  }
})

it('产品大类选项取自 dims.prodCats 而非写死', async () => {
  const store = useYitianStore()
  store.data = {
    days: [], roster: [],
    dims: { prodCats: ['甲类', '乙类'], types: ['项目类'], custQuads: [], custBgs: [],
            customers: [], workTypes: [], products: [], productNames: [],
            projectTypes: [], salesL2: [], serviceModes: [] },
    entries: [], issues: [], meta: { calendarSource: 'csv' },
  } as never
  const w = mount(YitianToolbar, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  // el-select 的 option 只在展开后才渲染,直接读组件 props 更稳(也避开 teleport)
  const sel = w.findComponent('[data-test="yt-prodcat"]')
  const opts = sel.findAllComponents({ name: 'ElOption' }).map((o) => o.props('value'))
  expect(opts).toEqual(['甲类', '乙类'])   // 写死清单会在数据换档时静默错位
})
```
> 若 `ElOption` 在未展开时确实不渲染（Element Plus 版本差异），改为断言 `prodCatOptions` 这个 computed 的产出 —— 通过 `w.vm` 读不到 `<script setup>` 的局部变量，故改为把断言下沉：在 `YitianToolbar.vue` 里给 `<el-select>` 加 `:data-opts="prodCatOptions.join(',')"`，测试断言该属性等于 `'甲类,乙类'`。**二选一，别两个都做。**
> 该测试文件若没有 `flushPromises` / `ElementPlus` 的 import，一并补上；若整个文件不存在，按 `YitianSourceCard.test.ts` 的模式新建（`beforeEach` 里 `setActivePinia(createPinia())`）。

- [ ] **Step 8: 跑测试并 typecheck**

Run:
```bash
npm --prefix frontend run test:run -- src/stores/yitianView.test.ts src/components/YitianToolbar.test.ts
npm --prefix frontend run typecheck
```
Expected: 全部 PASS。

- [ ] **Step 9: 提交**

```bash
git add frontend/src/stores/yitianView.ts frontend/src/stores/yitianView.test.ts \
        frontend/src/components/YitianToolbar.vue frontend/src/components/YitianToolbar.test.ts
git commit -m "feat(yitian-toolbar): 扩充产品大类/工时类型/管理干部三个筛选维度与显示项切换

四者一并按登录账号持久化。枚举值 hydrate 时白名单校验——坏值原样写入会让下游
switch 落到 default 分支静默失效。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 聚合口径（上半）—— 筛选、五档共用、B-1、B-2、B-3

**Files:**
- Create: `frontend/src/lib/yitian/customerProduct.ts`
- Create: `frontend/src/lib/yitian/customerProduct.test.ts`
- Modify: `frontend/src/lib/yitian/derived.ts`（抽出 `transferBuckets`）
- Modify: `frontend/src/lib/yitian/derived.test.ts`
- Modify: `frontend/src/components/YitianReadinessCard.vue`（改调共用函数）

**Interfaces:**
- Consumes: `stores/yitianView` 的四个新成员（T2 定义；本任务只按**普通参数**接收，不 import store，保持纯函数）
- Produces（T5 装配时按此签名调用）：

```ts
// 统一筛选入参。页面从 store 组装后传入,lib 不 import store(纯函数、可单测)。
export interface CpFilter {
  start: string; end: string
  l4s: string[]; prodCats: string[]; types: string[]
  mgrMode: 'all' | 'only' | 'exclude'
}
export function selectCpEntries(data: YitianData, f: CpFilter): YitianEntry[]

export interface CustSupportRow {
  custClass: string; quad: string; customers: number
  hours: number; project: number; presale: number; postsale: number
}
export function custSupport(data: YitianData, rows: YitianEntry[]): CustSupportRow[]

export interface CustListRow {
  customer: string; custClass: string; quad: string
  hours: number; project: number; presale: number; postsale: number
  topProducts: string
}
export function custList(data: YitianData, rows: YitianEntry[], topN: number): CustListRow[]

export interface CoverageRow {
  bg: string; named: number; supported: number; coverage: number | null
  hours: number; project: number; presale: number; postsale: number
}
export function top1000Coverage(data: YitianData, rows: YitianEntry[]): CoverageRow[]
```
以及 `derived.ts` 新增：
```ts
export interface TransferBucket { label: string; hours: number; pct: number }
export function transferBuckets(data: YitianData, rows: YitianEntry[]): TransferBucket[]
```

**口径约定（全部来自 spec §5.1 与 V4.5.4 既有口径，实施勿改）**：
- 六块**一律只统计客户类工时**（`工时类型 ∈ {项目类, 售前类, 售后类}`），与后端 `transferable` 判定口径一致。
- `mgrMode` 按**员工**过滤：`only` 只留 `roster.isMgr === true` 的人的工时；`exclude` 反之；`all` 不过滤。
- 象限统一取**前 2 字符**（`M1 战略核心区` → `M1`）；未匹配为 `(未匹配)`。
- 客户名为空或占位词的行，`custList` 里客户名显示为 `dims.customers` 的原值（占位词照显，那正是治理要看的）；客户名**为空**（`cu` 为 null）的行归入 `(未填客户)`。

- [ ] **Step 1: 写失败测试（建 fixture）**

新建 `frontend/src/lib/yitian/customerProduct.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { YitianData } from '@/types/yitian'
import {
  selectCpEntries, custSupport, custList, top1000Coverage, type CpFilter,
} from './customerProduct'

/** 最小 fixture:2 人(1 管理干部) x 4 条客户类工时 + 1 条管理类(必须被排除)。 */
const D = {
  meta: { top1000Named: { 市场BG3: 3, 市场BG1: 1 } },
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    customers: ['甲公司', '乙公司', '丙公司'],
    custQuads: ['M1 战略核心区', 'M2 现金牛/打猎区'],
    custBgs: ['市场BG3', '市场BG1'],
    prodCats: ['终端安全', '天眼'],
    workTypes: [], products: [], productNames: [], projectTypes: [],
    salesL2: [], serviceModes: [],
  },
  entries: [
    // 甲公司 TOP1000/M1/BG3:项目类 10h(老张,管理干部) + 售前类 4h(小李)
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, cu: 0, cq: 0, cbg: 0, ec: 0, tr: 4, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-02', e: 'A002', t: 1, h: 4, cu: 0, cq: 0, cbg: 0, ec: 1, tr: 1, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    // 乙公司 TOP1000/M2/BG1:售后类 6h(小李)
    { d: '2026-06-03', e: 'A002', t: 2, h: 6, cu: 1, cq: 1, cbg: 1, ec: 0, tr: 3, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: false, pm: false },
    // 丙公司 非TOP1000:项目类 20h(小李)
    { d: '2026-06-04', e: 'A002', t: 0, h: 20, cu: 2, cq: null, cbg: null, ec: 1, tr: 4, top: false,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    // 管理类 100h —— 六块一律不得统计
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, cu: 2, cq: null, cbg: null, ec: 1, tr: 4, top: false,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
  ],
  days: [], issues: [],
} as unknown as YitianData

const ALL: CpFilter = { start: '', end: '', l4s: [], prodCats: [], types: [], mgrMode: 'all' }

describe('selectCpEntries', () => {
  it('只留客户类工时,管理类被排除', () => {
    const r = selectCpEntries(D, ALL)
    expect(r).toHaveLength(4)
    expect(r.reduce((s, e) => s + e.h, 0)).toBe(40)   // 10+4+6+20,不含管理类 100
  })

  it('按产品大类过滤', () => {
    expect(selectCpEntries(D, { ...ALL, prodCats: ['天眼'] }).reduce((s, e) => s + e.h, 0)).toBe(24)
  })

  it('按工时类型过滤', () => {
    expect(selectCpEntries(D, { ...ALL, types: ['项目类'] }).reduce((s, e) => s + e.h, 0)).toBe(30)
  })

  it('管理干部三态', () => {
    expect(selectCpEntries(D, { ...ALL, mgrMode: 'only' }).reduce((s, e) => s + e.h, 0)).toBe(10)
    expect(selectCpEntries(D, { ...ALL, mgrMode: 'exclude' }).reduce((s, e) => s + e.h, 0)).toBe(30)
  })

  it('按日期区间过滤', () => {
    expect(selectCpEntries(D, { ...ALL, start: '2026-06-03', end: '2026-06-04' })
      .reduce((s, e) => s + e.h, 0)).toBe(26)
  })
})

describe('custSupport(B-1)', () => {
  it('按 客户分类 x 象限 汇总,象限取前两字符', () => {
    const r = custSupport(D, selectCpEntries(D, ALL))
    const m1 = r.find((x) => x.custClass === 'TOP1000' && x.quad === 'M1')
    expect(m1).toMatchObject({ customers: 1, hours: 14, project: 10, presale: 4, postsale: 0 })
    const non = r.find((x) => x.custClass === '非TOP1000')
    expect(non).toMatchObject({ quad: '(未匹配)', customers: 1, hours: 20, project: 20 })
  })

  it('客户数按去重计,同客户多条只算一个', () => {
    const r = custSupport(D, selectCpEntries(D, ALL))
    expect(r.find((x) => x.quad === 'M1')?.customers).toBe(1)   // 甲公司两条工时
  })
})

describe('custList(B-2)', () => {
  it('按工时降序取前 N', () => {
    const r = custList(D, selectCpEntries(D, ALL), 2)
    expect(r.map((x) => x.customer)).toEqual(['丙公司', '甲公司'])   // 20 > 14 > 6
  })

  it('主要支持产品按工时类型分组', () => {
    const r = custList(D, selectCpEntries(D, ALL), 10)
    const jia = r.find((x) => x.customer === '甲公司')
    expect(jia?.topProducts).toContain('项目类')
    expect(jia?.topProducts).toContain('终端安全')
    expect(jia?.topProducts).toContain('天眼')
  })
})

describe('top1000Coverage(B-3)', () => {
  it('指名来自 meta.top1000Named,不随筛选变;支持数随筛选变', () => {
    const r = top1000Coverage(D, selectCpEntries(D, ALL))
    const bg3 = r.find((x) => x.bg === '市场BG3')
    expect(bg3).toMatchObject({ named: 3, supported: 1, hours: 14 })
    expect(bg3?.coverage).toBeCloseTo(1 / 3)
  })

  it('指名为 0 的 BG 覆盖率为 null 而不是 0 或 NaN', () => {
    const d2 = { ...D, meta: { ...D.meta, top1000Named: {} } } as unknown as YitianData
    const r = top1000Coverage(d2, selectCpEntries(d2, ALL))
    for (const x of r) expect(x.coverage).toBeNull()
  })

  it('清单里有、但本期零支持的 BG 也要出现在表里', () => {
    // 市场BG1 指名 1、本期支持 1(乙公司);再造一个指名 2 零支持的 BG 必须出现
    const d3 = { ...D, meta: { ...D.meta, top1000Named: { 市场BG3: 3, 市场BG1: 1, 市场BG2: 2 } } } as unknown as YitianData
    const r = top1000Coverage(d3, selectCpEntries(d3, ALL))
    const bg2 = r.find((x) => x.bg === '市场BG2')
    expect(bg2).toMatchObject({ named: 2, supported: 0, hours: 0 })
    expect(bg2?.coverage).toBe(0)      // 零支持是 0%,不是 null —— null 只表示"分母缺失"
  })
})
```

在 `frontend/src/lib/yitian/derived.test.ts` 追加：

```ts
import { transferBuckets } from './derived'

it('transferBuckets 只统计客户类工时并算出比例', () => {
  // 复用 customerProduct.test.ts 同款 fixture 结构:tr 分别为 4/1/3/4,管理类 tr=4 须排除
  // 合计 40h:tr4=30(10+20) tr1=4 tr3=6
  const r = transferBuckets(D2, ENTRIES2)
  expect(r).toHaveLength(5)
  expect(r[4]).toMatchObject({ label: '可转移非原厂', hours: 30 })
  expect(r[4].pct).toBeCloseTo(0.75)
  expect(r[1].hours).toBe(4)
  expect(r[0].hours).toBe(0)
})

it('总量为 0 时 pct 为 0 而不是 NaN', () => {
  const r = transferBuckets(D2, [])
  for (const b of r) expect(b.pct).toBe(0)
})
```
> `D2`/`ENTRIES2` 在该测试文件内按上面 `customerProduct.test.ts` 的 fixture 结构自建（**不要跨文件 import fixture** —— 两边各自独立更禁得住改动）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/customerProduct.test.ts src/lib/yitian/derived.test.ts`
Expected: FAIL —— 无法解析 `./customerProduct`；`transferBuckets` is not a function

- [ ] **Step 3: 在 `derived.ts` 加 `transferBuckets`**

```ts
import type { YitianData, YitianEntry } from '@/types/yitian'

/** 五档聚合的唯一实现。总览页那张卡与客户与产品分析页都调它 —— 同一口径两份实现必漂移。 */
export interface TransferBucket { label: string; hours: number; pct: number }

const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']

export function transferBuckets(data: YitianData, rows: YitianEntry[]): TransferBucket[] {
  const acc = [0, 0, 0, 0, 0]
  for (const e of rows) {
    const t = e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
    if (!CUSTOMER_TYPES.includes(t)) continue
    acc[e.tr] = (acc[e.tr] ?? 0) + e.h
  }
  const tot = acc.reduce((a, b) => a + b, 0)
  return acc.map((h, i) => ({
    label: TRANSFER_LABELS[i],
    hours: h,
    pct: tot ? h / tot : 0,     // 分母为 0 → 0,不得产出 NaN(会渲染成空白)
  }))
}
```

`YitianReadinessCard.vue` 的 `transfer` computed 改为调它（**主值/比例/状态色的呈现逻辑保持不变**）：

```ts
import { TRANSFER_LABELS, transferBuckets } from '@/lib/yitian/derived'

const transfer = computed(() => {
  const d = props.data
  if (!d) return []
  return transferBuckets(d, d.entries).map((b, i) => ({
    k: b.label,
    v: String(Math.round(b.hours)),
    sub: b.pct ? `${Math.round(b.pct * 100)}%` : (b.hours ? '0%' : '-'),
    cls: i === 4 ? 'ok' : i === 0 ? 'warn' : '',
  }))
})
```
> **`YitianReadinessCard.test.ts` 必须保持全绿且断言一字不改** —— 它是这次重构的回归安全网。若变红，是重构改了行为，回退重来，**不要改断言**。

- [ ] **Step 4: 建 `customerProduct.ts`**

```ts
import type { YitianData, YitianEntry } from '@/types/yitian'
import { NO_L4 } from './metrics'

/** 六块统一只看客户类工时(与后端 transferable 判定口径一致)。 */
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']
const NO_QUAD = '(未匹配)'
const NO_CUSTOMER = '(未填客户)'
const NO_BG = '(未标BG)'

export interface CpFilter {
  start: string
  end: string
  l4s: string[]
  prodCats: string[]
  types: string[]
  mgrMode: 'all' | 'only' | 'exclude'
}

function dv(arr: string[], i: number | null | undefined): string {
  return i === null || i === undefined ? '' : (arr[i] ?? '')
}

/** 象限统一取前两字符:「M1 战略核心区」→「M1」。后半段是描述文案、随时会被业务改字。 */
export function quadOf(data: YitianData, e: YitianEntry): string {
  const q = dv(data.dims.custQuads, e.cq).trim()
  return q ? q.slice(0, 2) : NO_QUAD
}

export function selectCpEntries(data: YitianData, f: CpFilter): YitianEntry[] {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  const mgrOf = new Map(data.roster.map((p) => [p.id, !!p.isMgr]))
  const l4Set = new Set(f.l4s)
  const catSet = new Set(f.prodCats)
  const typeSet = new Set(f.types)
  return data.entries.filter((e) => {
    const t = dv(data.dims.types, e.t)
    if (!CUSTOMER_TYPES.includes(t)) return false
    if (f.start && e.d < f.start) return false
    if (f.end && e.d > f.end) return false
    if (l4Set.size && !l4Set.has(l4Of.get(e.e) ?? NO_L4)) return false
    if (typeSet.size && !typeSet.has(t)) return false
    if (catSet.size && !catSet.has(dv(data.dims.prodCats, e.ec))) return false
    if (f.mgrMode === 'only' && !mgrOf.get(e.e)) return false
    if (f.mgrMode === 'exclude' && mgrOf.get(e.e)) return false
    return true
  })
}

/** 三个类型列的累加:返回下标 0/1/2 对应 项目类/售前类/售后类,其它类型返回 -1。 */
function typeIdx(t: string): number {
  return CUSTOMER_TYPES.indexOf(t)
}

export interface CustSupportRow {
  custClass: string
  quad: string
  customers: number
  hours: number
  project: number
  presale: number
  postsale: number
}

export function custSupport(data: YitianData, rows: YitianEntry[]): CustSupportRow[] {
  const acc = new Map<string, { custs: Set<string>; h: number; t: number[] }>()
  for (const e of rows) {
    const cls = e.top ? 'TOP1000' : '非TOP1000'
    const quad = quadOf(data, e)
    const key = cls + '|' + quad
    let a = acc.get(key)
    if (!a) { a = { custs: new Set(), h: 0, t: [0, 0, 0] }; acc.set(key, a) }
    const c = dv(data.dims.customers, e.cu)
    if (c) a.custs.add(c)
    a.h += e.h
    const i = typeIdx(dv(data.dims.types, e.t))
    if (i >= 0) a.t[i] += e.h
  }
  return [...acc.entries()]
    .map(([key, a]) => {
      const [custClass, quad] = key.split('|')
      return {
        custClass, quad, customers: a.custs.size, hours: a.h,
        project: a.t[0], presale: a.t[1], postsale: a.t[2],
      }
    })
    // TOP1000 在前、象限升序;非TOP1000 恒末位
    .sort((x, y) => (x.custClass === y.custClass
      ? x.quad.localeCompare(y.quad)
      : (x.custClass === 'TOP1000' ? -1 : 1)))
}

export interface CustListRow {
  customer: string
  custClass: string
  quad: string
  hours: number
  project: number
  presale: number
  postsale: number
  topProducts: string
}

/** 主要支持产品:按工时类型分组、组内按工时降序各取前 3 个产品大类。 */
function topProductsText(byType: Map<string, Map<string, number>>): string {
  const parts: string[] = []
  for (const t of CUSTOMER_TYPES) {
    const m = byType.get(t)
    if (!m || !m.size) continue
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0])
    parts.push(`${t}: ${top.join('/')}`)
  }
  return parts.join('；')
}

export function custList(data: YitianData, rows: YitianEntry[], topN: number): CustListRow[] {
  const acc = new Map<string, {
    cls: string; quad: string; h: number; t: number[]; byType: Map<string, Map<string, number>>
  }>()
  for (const e of rows) {
    const name = dv(data.dims.customers, e.cu) || NO_CUSTOMER
    let a = acc.get(name)
    if (!a) {
      a = { cls: e.top ? 'TOP1000' : '非TOP1000', quad: quadOf(data, e), h: 0, t: [0, 0, 0],
            byType: new Map() }
      acc.set(name, a)
    }
    a.h += e.h
    const t = dv(data.dims.types, e.t)
    const i = typeIdx(t)
    if (i >= 0) a.t[i] += e.h
    const cat = dv(data.dims.prodCats, e.ec)
    if (cat) {
      let m = a.byType.get(t)
      if (!m) { m = new Map(); a.byType.set(t, m) }
      m.set(cat, (m.get(cat) ?? 0) + e.h)
    }
  }
  return [...acc.entries()]
    .map(([customer, a]) => ({
      customer, custClass: a.cls, quad: a.quad, hours: a.h,
      project: a.t[0], presale: a.t[1], postsale: a.t[2],
      topProducts: topProductsText(a.byType),
    }))
    .sort((x, y) => y.hours - x.hours)
    .slice(0, topN)
}

export interface CoverageRow {
  bg: string
  named: number
  supported: number
  coverage: number | null
  hours: number
  project: number
  presale: number
  postsale: number
}

export function top1000Coverage(data: YitianData, rows: YitianEntry[]): CoverageRow[] {
  const named = data.meta.top1000Named ?? {}
  const acc = new Map<string, { custs: Set<string>; h: number; t: number[] }>()
  // 先按清单建桶:指名了却零支持的 BG 也必须出现在表里,否则覆盖率表会漏掉最该看的那几行
  for (const bg of Object.keys(named)) {
    acc.set(bg, { custs: new Set(), h: 0, t: [0, 0, 0] })
  }
  for (const e of rows) {
    if (!e.top) continue                       // 覆盖率只看 TOP1000 客户
    const bg = dv(data.dims.custBgs, e.cbg) || NO_BG
    let a = acc.get(bg)
    if (!a) { a = { custs: new Set(), h: 0, t: [0, 0, 0] }; acc.set(bg, a) }
    const c = dv(data.dims.customers, e.cu)
    if (c) a.custs.add(c)
    a.h += e.h
    const i = typeIdx(dv(data.dims.types, e.t))
    if (i >= 0) a.t[i] += e.h
  }
  return [...acc.entries()]
    .map(([bg, a]) => {
      const n = named[bg] ?? 0
      return {
        bg, named: n, supported: a.custs.size,
        // 分母缺失 → null(前端显 "-");分母有值、分子为 0 → 0(那是真的 0%,两者不能混)
        coverage: n > 0 ? a.custs.size / n : null,
        hours: a.h, project: a.t[0], presale: a.t[1], postsale: a.t[2],
      }
    })
    .sort((x, y) => y.named - x.named || x.bg.localeCompare(y.bg))
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/customerProduct.test.ts src/lib/yitian/derived.test.ts src/components/YitianReadinessCard.test.ts`
Expected: 全部 PASS（含 `YitianReadinessCard.test.ts` 的既有 5 条，断言未改）

- [ ] **Step 6: 反向验证（三条）**

用 Read+Edit 逐条制造违规、确认变红、改回：
1. `selectCpEntries` 里删掉 `if (!CUSTOMER_TYPES.includes(t)) return false` → **必须红**在「管理类被排除」。
2. `top1000Coverage` 里把「先按清单建桶」那个循环删掉 → **必须红**在「清单里有、但本期零支持的 BG 也要出现」。
3. `top1000Coverage` 的 `coverage: n > 0 ? ... : null` 改成 `a.custs.size / n` → **必须红**在「指名为 0 的 BG 覆盖率为 null」（会得到 `NaN`）。

- [ ] **Step 7: 用真实数据对拍（关键验收）**

```bash
npm --prefix frontend exec -- vitest run --reporter=basic src/lib/yitian/customerProduct.test.ts
node --input-type=module -e "
console.log('对拍改用下方 python 脚本 —— lib 是 TS,直接跑真实数据需构建,成本不划算')
"
```
改用等价的 python 对拍（口径与 TS 实现逐条对应，**只验数值不验实现**）：

```bash
python -c "
# -*- coding: utf-8 -*-
import sys,json,collections; sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open('data/yitian_data.json',encoding='utf-8'))
D=d['dims']; CT=('项目类','售前类','售后类')
def g(e,k,a):
    i=e[k]; return a[i] if i is not None else ''
rows=[e for e in d['entries'] if g(e,'t',D['types']) in CT]
acc=collections.defaultdict(lambda:[set(),0.0])
for e in rows:
    q=(g(e,'cq',D['custQuads'])[:2] or '(未匹配)')
    k=('TOP1000' if e['top'] else '非TOP1000', q)
    c=g(e,'cu',D['customers'])
    if c: acc[k][0].add(c)
    acc[k][1]+=e['h']
print('B-1:')
for k in sorted(acc): print('  %-10s %-8s 客户%3d 合计%7.0f'%(k[0],k[1],len(acc[k][0]),acc[k][1]))
sup={g(e,'cu',D['customers']) for e in rows if e['top']}
named=d['meta']['top1000Named']
print('B-3: 指名 %s 合计 %d;实际支持 %d;覆盖率 %.1f%%'%(named,sum(named.values()),len(sup),len(sup)/sum(named.values())*100))
"
```
Expected（与本计划「实测基线」一节逐项一致）：B-1 五行数字全对；B-3 `指名 {'市场BG3': 139} 合计 139;实际支持 97;覆盖率 69.8%`。
> **对不上就停下报告，不要改期望值。**

- [ ] **Step 8: typecheck 并提交**

```bash
npm --prefix frontend run typecheck
git add frontend/src/lib/yitian/customerProduct.ts frontend/src/lib/yitian/customerProduct.test.ts \
        frontend/src/lib/yitian/derived.ts frontend/src/lib/yitian/derived.test.ts \
        frontend/src/components/YitianReadinessCard.vue
git commit -m "feat(yitian-cp): 客户与产品分析上半三块的聚合口径

selectCpEntries 统一六块的筛选入口(只客户类工时 + 五个维度);B-1 客户支持情况、
B-2 客户清单(含主要支持产品)、B-3 TOP1000 覆盖度。覆盖率分母取 meta.top1000Named
(清单全量),先按清单建桶保证零支持的 BG 也出现;分母缺失返回 null、分子为 0 返回 0,
两者不可混为一谈。

五档聚合抽为 derived.transferBuckets 供总览卡与本页共用,避免同一口径两份实现漂移。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 聚合口径（下半）+ 热力图组件 —— B-4、A-2、A-4

**Files:**
- Modify: `frontend/src/lib/yitian/customerProduct.ts`
- Modify: `frontend/src/lib/yitian/customerProduct.test.ts`
- Create: `frontend/src/components/HeatmapTable.vue`
- Create: `frontend/src/components/HeatmapTable.test.ts`

**Interfaces:**
- Consumes: T3 的 `selectCpEntries` / `CpFilter` / `quadOf`
- Produces:

```ts
export interface Matrix {
  rows: string[]; cols: string[]
  cells: number[][]        // cells[rowIdx][colIdx]
  rowTotals: number[]; colTotals: number[]; total: number
}
export function custClassProductMatrix(data: YitianData, rows: YitianEntry[]): Matrix  // B-4
export function orgProductMatrix(data: YitianData, rows: YitianEntry[]): Matrix        // A-2
export interface CrossRow { customer: string; cells: number[]; total: number }
export function custProductCross(
  data: YitianData, rows: YitianEntry[], topN: number,
): { cols: string[]; rows: CrossRow[] }                                                 // A-4
```
以及组件 `HeatmapTable.vue`，props：
```ts
{ matrix: Matrix; rowLabel: string; displayMode: 'hours' | 'pct' | 'both' }
```

**设计约束**：
- 列顺序一律用 `data.dims.prodCats` 的**原序**（后端已按业务顺序排、`其他` 末位），**不得在前端重排**。
- 热力图用 **HTML 表格**不用 ECharts heatmap：本仓 `/yitian/compliance` 那张 ECharts heatmap 在 12×10 规模下标签拥挤；表格可折叠、可挂 `.u-num`、可直接支持三种显示项。
- 颜色深浅用 `--accent` 的 alpha 派生（`background: color-mix(in srgb, var(--accent) ${pct}%, transparent)`），**不引入新色**；文字恒 `--txt`（实底+小号白字被设计规范禁止）。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/yitian/customerProduct.test.ts` 追加（复用该文件顶部已建的 `D` / `ALL`）：

```ts
import { custClassProductMatrix, orgProductMatrix, custProductCross } from './customerProduct'

describe('custClassProductMatrix(B-4)', () => {
  it('行=客户分类+象限,列=产品大类原序', () => {
    const m = custClassProductMatrix(D, selectCpEntries(D, ALL))
    expect(m.cols).toEqual(['终端安全', '天眼'])          // 与 dims.prodCats 原序一致
    expect(m.rows).toContain('TOP1000 · M1')
    expect(m.total).toBe(40)
    const i = m.rows.indexOf('TOP1000 · M1')
    expect(m.cells[i]).toEqual([10, 4])                   // 甲公司:终端安全 10 + 天眼 4
    expect(m.rowTotals[i]).toBe(14)
  })

  it('列合计与总计自洽', () => {
    const m = custClassProductMatrix(D, selectCpEntries(D, ALL))
    expect(m.colTotals.reduce((a, b) => a + b, 0)).toBe(m.total)
    expect(m.rowTotals.reduce((a, b) => a + b, 0)).toBe(m.total)
  })
})

describe('orgProductMatrix(A-2)', () => {
  it('行=L4 组织', () => {
    const m = orgProductMatrix(D, selectCpEntries(D, ALL))
    expect(m.rows).toEqual(['一组'])
    expect(m.rowTotals[0]).toBe(40)
  })
})

describe('custProductCross(A-4)', () => {
  it('按总工时降序取前 N 个客户', () => {
    const r = custProductCross(D, selectCpEntries(D, ALL), 2)
    expect(r.rows.map((x) => x.customer)).toEqual(['丙公司', '甲公司'])
    expect(r.cols).toEqual(['终端安全', '天眼'])
    expect(r.rows[0].cells).toEqual([0, 20])              // 丙公司只有天眼 20h
    expect(r.rows[0].total).toBe(20)
  })
})
```

新建 `frontend/src/components/HeatmapTable.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HeatmapTable from './HeatmapTable.vue'

const M = {
  rows: ['甲组', '乙组'], cols: ['终端安全', '天眼'],
  cells: [[30, 10], [0, 60]],
  rowTotals: [40, 60], colTotals: [30, 70], total: 100,
}

describe('HeatmapTable', () => {
  it('hours 模式只显示工时', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'hours' } })
    const t = w.text()
    expect(t).toContain('30')
    expect(t).not.toContain('%')
  })

  it('pct 模式只显示比例,分母是总计', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'pct' } })
    expect(w.text()).toContain('30%')
  })

  it('both 模式两者都有', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'both' } })
    const t = w.text()
    expect(t).toContain('30')
    expect(t).toContain('%')
  })

  it('零值单元格不上色也不显示 0(留白比满屏 0 可读)', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'hours' } })
    const cells = w.findAll('[data-test="hm-cell"]')
    const zero = cells.find((c) => c.attributes('data-v') === '0')
    expect(zero?.text().trim()).toBe('')
  })

  it('空矩阵不炸', () => {
    const w = mount(HeatmapTable, {
      props: { matrix: { rows: [], cols: [], cells: [], rowTotals: [], colTotals: [], total: 0 },
               rowLabel: 'L4 组织', displayMode: 'both' },
    })
    expect(w.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/customerProduct.test.ts src/components/HeatmapTable.test.ts`
Expected: FAIL

- [ ] **Step 3: 加三个矩阵函数**

在 `customerProduct.ts` 末尾追加：

```ts
export interface Matrix {
  rows: string[]
  cols: string[]
  cells: number[][]
  rowTotals: number[]
  colTotals: number[]
  total: number
}

/** 通用矩阵构建。列顺序恒取 dims.prodCats 原序(后端已按业务顺序排、"其他"末位),前端不重排。 */
function buildMatrix(
  data: YitianData, rows: YitianEntry[], rowKeyOf: (e: YitianEntry) => string,
): Matrix {
  const cols = [...data.dims.prodCats]
  const colIdx = new Map(cols.map((c, i) => [c, i]))
  const acc = new Map<string, number[]>()
  for (const e of rows) {
    const rk = rowKeyOf(e)
    const ci = colIdx.get(dv(data.dims.prodCats, e.ec))
    if (ci === undefined) continue          // 无产品大类的行不进热力图(实测为 0 行)
    let arr = acc.get(rk)
    if (!arr) { arr = new Array(cols.length).fill(0); acc.set(rk, arr) }
    arr[ci] += e.h
  }
  const rowKeys = [...acc.keys()].sort()
  const cells = rowKeys.map((k) => acc.get(k) as number[])
  const rowTotals = cells.map((r) => r.reduce((a, b) => a + b, 0))
  const colTotals = cols.map((_, ci) => cells.reduce((s, r) => s + r[ci], 0))
  return {
    rows: rowKeys, cols, cells, rowTotals, colTotals,
    total: rowTotals.reduce((a, b) => a + b, 0),
  }
}

/** B-4:客户分类分级 x 产品大类。行键形如「TOP1000 · M1」。 */
export function custClassProductMatrix(data: YitianData, rows: YitianEntry[]): Matrix {
  return buildMatrix(data, rows, (e) =>
    `${e.top ? 'TOP1000' : '非TOP1000'} · ${quadOf(data, e)}`)
}

/** A-2:L4 组织 x 产品大类。回答「哪个组在做哪类产品」,与 B-4 的「哪档客户消耗哪类产品」不同问。 */
export function orgProductMatrix(data: YitianData, rows: YitianEntry[]): Matrix {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  return buildMatrix(data, rows, (e) => l4Of.get(e.e) ?? NO_L4)
}

export interface CrossRow { customer: string; cells: number[]; total: number }

/** A-4:客户 x 产品大类交叉。实测 953 个客户,坐标轴放不下,固定取工时前 topN。 */
export function custProductCross(
  data: YitianData, rows: YitianEntry[], topN: number,
): { cols: string[]; rows: CrossRow[] } {
  const m = buildMatrix(data, rows, (e) => dv(data.dims.customers, e.cu) || NO_CUSTOMER)
  const idx = m.rows.map((_, i) => i).sort((a, b) => m.rowTotals[b] - m.rowTotals[a])
  return {
    cols: m.cols,
    rows: idx.slice(0, topN).map((i) => ({
      customer: m.rows[i], cells: m.cells[i], total: m.rowTotals[i],
    })),
  }
}
```

- [ ] **Step 4: 建 `HeatmapTable.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Matrix } from '@/lib/yitian/customerProduct'

const props = defineProps<{
  matrix: Matrix
  rowLabel: string
  displayMode: 'hours' | 'pct' | 'both'
}>()

/** 单元格文案。零值留白 —— 满屏的 0 比留白难读得多。 */
function cellText(v: number): string {
  if (!v) return ''
  const h = String(Math.round(v))
  const p = props.matrix.total ? `${Math.round((v / props.matrix.total) * 100)}%` : '0%'
  if (props.displayMode === 'hours') return h
  if (props.displayMode === 'pct') return p
  return `${h} · ${p}`
}

/** 底色深浅按「该格 / 全表最大格」派生,只用 --accent 的 alpha,不引入新色。
 *  文字恒 --txt:设计规范禁止实底 + 小号白字。 */
const maxCell = computed(() =>
  Math.max(0, ...props.matrix.cells.flatMap((r) => r)))

function cellStyle(v: number): Record<string, string> {
  if (!v || !maxCell.value) return {}
  const pct = Math.round((v / maxCell.value) * 60)   // 上限 60% 保证文字始终可读
  return { background: `color-mix(in srgb, var(--accent) ${pct}%, transparent)` }
}
</script>

<template>
  <div class="hm-wrap">
    <table class="hm">
      <thead>
        <tr>
          <th class="hm-rowhead">{{ rowLabel }}</th>
          <th v-for="c in matrix.cols" :key="c">{{ c }}</th>
          <th class="hm-total">合计</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, ri) in matrix.rows" :key="r">
          <td class="hm-rowhead">{{ r }}</td>
          <td v-for="(v, ci) in matrix.cells[ri]" :key="ci" class="u-num" data-test="hm-cell"
              :data-v="v" :style="cellStyle(v)">{{ cellText(v) }}</td>
          <td class="u-num hm-total">{{ cellText(matrix.rowTotals[ri]) }}</td>
        </tr>
        <tr v-if="matrix.rows.length" class="hm-foot">
          <td class="hm-rowhead">合计</td>
          <td v-for="(v, ci) in matrix.colTotals" :key="ci" class="u-num">{{ cellText(v) }}</td>
          <td class="u-num hm-total">{{ cellText(matrix.total) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!matrix.rows.length" class="hm-empty">本区间无数据</p>
  </div>
</template>

<style scoped>
/* 宽表必须自己横向滚动,页面 body 不得出现横向滚动条 */
.hm-wrap { overflow-x: auto; }
.hm { border-collapse: collapse; width: 100%; font-size: var(--fs-1); }
.hm th, .hm td {
  padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line);
  text-align: right; white-space: nowrap; vertical-align: middle; color: var(--txt);
}
.hm th { font-weight: 600; color: var(--sub); background: var(--card2); }
.hm-rowhead { text-align: left; font-weight: 600; background: var(--card2); }
.hm-total { font-weight: 700; }
.hm-foot td { background: var(--card2); font-weight: 700; }
.hm-empty { margin: var(--sp-3) 0 0; color: var(--mut); font-size: var(--fs-1); }
</style>
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/customerProduct.test.ts src/components/HeatmapTable.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 反向验证（两条）**

1. `buildMatrix` 里把 `const cols = [...data.dims.prodCats]` 换成 `[...data.dims.prodCats].sort()` → **必须红**在「列=产品大类原序」。
2. `cellText` 里把 `if (!v) return ''` 删掉 → **必须红**在「零值单元格不显示 0」。

- [ ] **Step 7: 用真实数据对拍**

```bash
python -c "
# -*- coding: utf-8 -*-
import sys,json,collections; sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open('data/yitian_data.json',encoding='utf-8'))
D=d['dims']; R={p['id']:p for p in d['roster']}; CT=('项目类','售前类','售后类')
def g(e,k,a):
    i=e[k]; return a[i] if i is not None else ''
rows=[e for e in d['entries'] if g(e,'t',D['types']) in CT]
pc=collections.Counter()
for e in rows: pc[g(e,'ec',D['prodCats'])]+=e['h']
print('产品大类 %d 档,合计 %.0f h'%(len(pc),sum(pc.values())))
l4=collections.Counter()
for e in rows: l4[(R.get(e['e']) or {}).get('l4') or '未分配L4']+=e['h']
print('A-2 矩阵规模: %d 行 x %d 列'%(len(l4),len(pc)))
cust=collections.Counter()
for e in rows: cust[g(e,'cu',D['customers']) or '(未填客户)']+=e['h']
print('A-4 客户数 %d,TOP5:'%len(cust),[k[:12] for k,_ in cust.most_common(5)])
"
```
Expected：产品大类 **10 档 / 62314 h**；A-2 矩阵 **12 行 × 10 列**；A-4 客户 **953**，TOP5 与本计划基线一致。

- [ ] **Step 8: typecheck 并提交**

```bash
npm --prefix frontend run typecheck
git add frontend/src/lib/yitian/customerProduct.ts frontend/src/lib/yitian/customerProduct.test.ts \
        frontend/src/components/HeatmapTable.vue frontend/src/components/HeatmapTable.test.ts
git commit -m "feat(yitian-cp): 三个矩阵口径与共用热力图表格组件

B-4 客户分级 x 产品大类、A-2 L4 组织 x 产品大类(两者行维度不同、回答不同问题,
都要), A-4 客户 x 产品交叉(953 个客户,固定取工时前 N)。列序恒取 dims.prodCats
原序,前端不重排。热力图用 HTML 表格而非 ECharts heatmap:12x10 规模下标签更清晰,
且能直接支持三种显示项;底色只用 --accent 的 alpha 派生,不引入新色。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 页面装配

**Files:**
- Modify: `frontend/src/views/YitianCustomerProductView.vue`
- Create: `frontend/src/views/YitianCustomerProductView.test.ts`

**Interfaces:**
- Consumes: T2 的四个 store 成员、T3 的 `selectCpEntries`/`custSupport`/`custList`/`top1000Coverage`/`CpFilter`、`derived.transferBuckets`、T4 的三个矩阵函数与 `HeatmapTable.vue`
- Produces: 完整页面

**版面顺序（自上而下）**：页头 → tab 条 → 工具栏 → 五档 KPI → B-1 → B-3 → B-2 → B-4 → A-2 → A-4。
> 把 B-3（覆盖度）提到 B-2（客户清单）之前：覆盖率是管理层最先要看的单一数字，953 行的客户清单不该挡在它前面。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/views/YitianCustomerProductView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianCustomerProductView from './YitianCustomerProductView.vue'
import { useYitianStore } from '@/stores/yitian'

// fixture 与 src/lib/yitian/customerProduct.test.ts 的 D 同构,但**各自独立维护、勿跨文件 import**
// (两边独立更禁得住改动)。本文件用 `as never` 绕过类型完整性 —— 视图只读下列字段:
//   meta.top1000Named(B-3 分母) / meta.calendarSource(工具栏的日历降级提示)
//   dims 全部码表 / roster(L4 与 isMgr) / entries / days(工具栏日期选择器)
// 其余 meta 字段视图一概不读,不必构造。
const DATA = {
  meta: { top1000Named: { 市场BG3: 3, 市场BG1: 1 }, calendarSource: 'csv' },
  days: [],
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    customers: ['甲公司', '乙公司', '丙公司'],
    custQuads: ['M1 战略核心区', 'M2 现金牛/打猎区'],
    custBgs: ['市场BG3', '市场BG1'],
    prodCats: ['终端安全', '天眼'],
    workTypes: [], products: [], productNames: [], projectTypes: [],
    salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, cu: 0, cq: 0, cbg: 0, ec: 0, tr: 4, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-02', e: 'A002', t: 1, h: 4, cu: 0, cq: 0, cbg: 0, ec: 1, tr: 1, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-03', e: 'A002', t: 2, h: 6, cu: 1, cq: 1, cbg: 1, ec: 0, tr: 3, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: false, pm: false },
    { d: '2026-06-04', e: 'A002', t: 0, h: 20, cu: 2, cq: null, cbg: null, ec: 1, tr: 4, top: false,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
  ],
  issues: [],
}

beforeEach(() => setActivePinia(createPinia()))

function mountView() {
  useYitianStore().data = DATA as never
  return mount(YitianCustomerProductView, {
    global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
  })
}

describe('YitianCustomerProductView', () => {
  it('六个分析块的标题都在', () => {
    const t = mountView().text()
    for (const s of ['可转移非原厂支持', '客户支持情况', 'TOP1000 大客户支持覆盖度',
                     '客户支持清单', '客户分级 × 产品大类', 'L4 组织 × 产品大类',
                     '客户 × 产品交叉']) {
      expect(t, s).toContain(s)
    }
  })

  it('两张热力图都渲染且是不同的行维度', () => {
    const w = mountView()
    const tables = w.findAllComponents({ name: 'HeatmapTable' })
    expect(tables).toHaveLength(2)
    expect(tables[0].props('rowLabel')).toBe('客户分级')
    expect(tables[1].props('rowLabel')).toBe('L4 组织')
  })

  it('store 无数据时不炸', () => {
    setActivePinia(createPinia())
    const w = mount(YitianCustomerProductView, {
      global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
    })
    expect(w.exists()).toBe(true)
  })

  it('客户清单默认只显示 TOP50', () => {
    // 该断言靠组件内 showAllCustomers 的默认值;fixture 客户数少于 50 时
    // 改为断言「显示全部」开关存在,以及切换后行数不减少
    const w = mountView()
    expect(w.find('[data-test="ycp-showall"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/views/YitianCustomerProductView.test.ts`
Expected: FAIL —— 找不到区块标题

- [ ] **Step 3: 装配页面**

`YitianCustomerProductView.vue` 的 `<script setup>`：

```ts
import { computed, ref, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import PageTabs from '@/components/PageTabs.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HeatmapTable from '@/components/HeatmapTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useScopedYitian } from '@/composables/useScopedData'
import { transferBuckets } from '@/lib/yitian/derived'
import {
  selectCpEntries, custSupport, custList, top1000Coverage,
  custClassProductMatrix, orgProductMatrix, custProductCross, type CpFilter,
} from '@/lib/yitian/customerProduct'

const CUST_TOP_N = 50      // B-2 默认行数(实测 953 个客户,全量渲染不可用)
const CROSS_TOP_N = 20     // A-4 图表客户数上限

const store = useYitianStore()
const scoped = useScopedYitian()
const view = useYitianViewStore()
const showAllCustomers = ref(false)

onMounted(() => { view.hydrate(); store.load() })

const filter = computed<CpFilter>(() => ({
  start: view.start, end: view.end, l4s: view.l4s,
  prodCats: view.prodCats, types: view.types, mgrMode: view.mgrMode,
}))

const rows = computed(() => (scoped.value ? selectCpEntries(scoped.value, filter.value) : []))

const kpi = computed(() => {
  const d = scoped.value
  if (!d) return []
  return transferBuckets(d, rows.value).map((b, i) => ({
    k: b.label,
    v: String(Math.round(b.hours)),
    sub: `${Math.round(b.pct * 100)}%`,
    cls: i === 4 ? 'ok' : i === 0 ? 'warn' : '',
  }))
})

const supportRows = computed(() => (scoped.value ? custSupport(scoped.value, rows.value) : []))
const coverageRows = computed(() => (scoped.value ? top1000Coverage(scoped.value, rows.value) : []))
const listRows = computed(() => (scoped.value
  ? custList(scoped.value, rows.value, showAllCustomers.value ? Number.MAX_SAFE_INTEGER : CUST_TOP_N)
  : []))
const matrixCust = computed(() => (scoped.value
  ? custClassProductMatrix(scoped.value, rows.value)
  : { rows: [], cols: [], cells: [], rowTotals: [], colTotals: [], total: 0 }))
const matrixOrg = computed(() => (scoped.value
  ? orgProductMatrix(scoped.value, rows.value)
  : { rows: [], cols: [], cells: [], rowTotals: [], colTotals: [], total: 0 }))
const cross = computed(() => (scoped.value
  ? custProductCross(scoped.value, rows.value, CROSS_TOP_N)
  : { cols: [], rows: [] }))

const fmtH = (v: unknown) => (typeof v === 'number' ? Math.round(v).toLocaleString() : '')
const fmtPct = (v: unknown) => (v === null || v === undefined ? '-' : `${Math.round(Number(v) * 100)}%`)

const SUPPORT_COLS: DataColumn[] = [
  { key: 'custClass', label: '客户分类', width: 110 },
  { key: 'quad', label: '客户象限', width: 100 },
  { key: 'customers', label: '支持客户数', width: 110, num: true, sortable: true },
  { key: 'hours', label: '累计工时', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, formatter: fmtH },
]

const COVERAGE_COLS: DataColumn[] = [
  { key: 'bg', label: '市场BG', width: 120 },
  { key: 'named', label: '指名客户数', width: 110, num: true, sortable: true },
  { key: 'supported', label: '实际支持', width: 100, num: true, sortable: true },
  { key: 'coverage', label: '支持覆盖率', width: 110, num: true, sortable: true, formatter: fmtPct },
  { key: 'hours', label: '累计工时', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, formatter: fmtH },
]

const LIST_COLS: DataColumn[] = [
  { key: 'customer', label: '客户名称', width: 240 },
  { key: 'custClass', label: '客户分类', width: 110 },
  { key: 'quad', label: '客户象限', width: 100 },
  { key: 'hours', label: '累计工时', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, formatter: fmtH },
  { key: 'topProducts', label: '主要支持产品', width: 320, wrap: true },
]

/** A-4:横轴产品大类、按客户分组的堆叠柱。客户已按工时降序取前 20。 */
const crossOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll' },
  grid: { left: 8, right: 8, bottom: 8, top: 40, containLabel: true },
  xAxis: { type: 'category', data: cross.value.rows.map((r) => r.customer),
           axisLabel: { interval: 0, rotate: 40, width: 90, overflow: 'truncate' } },
  yAxis: { type: 'value', name: '工时' },
  series: cross.value.cols.map((c, ci) => ({
    name: c, type: 'bar', stack: 'total',
    data: cross.value.rows.map((r) => r.cells[ci]),
  })),
}))
</script>
```

模板：

```vue
<template>
  <div>
    <PageHeader title="客户与产品分析" />
    <PageTabs />
    <YitianToolbar />

    <AppCard v-if="store.error"><p class="ycp-err">{{ store.error }}</p></AppCard>
    <template v-else>
      <AppCard>
        <SectionTitle level="section">可转移非原厂支持</SectionTitle>
        <p class="ycp-note">
          随上方筛选联动。口径边界见「工时总览」页的数据就绪度卡：
          TOP1000 清单不全会让「可转移」偏高。
        </p>
        <MetricGrid :items="kpi" col-min="170px" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">客户支持情况</SectionTitle>
        <DataTable :columns="SUPPORT_COLS" :rows="supportRows" row-key="custClass" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">TOP1000 大客户支持覆盖度</SectionTitle>
        <p class="ycp-note">
          指名客户数取自 TOP1000 清单全量，不随筛选变；实际支持数与工时随筛选变。
        </p>
        <DataTable :columns="COVERAGE_COLS" :rows="coverageRows" row-key="bg" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">客户支持清单</SectionTitle>
        <div class="ycp-bar">
          <span class="ycp-note">
            共 {{ listRows.length }} 行{{ showAllCustomers ? '（全部）' : `（工时前 ${CUST_TOP_N}）` }}
          </span>
          <el-switch v-model="showAllCustomers" active-text="显示全部" data-test="ycp-showall" />
        </div>
        <DataTable :columns="LIST_COLS" :rows="listRows" row-key="customer" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">客户分级 × 产品大类</SectionTitle>
        <HeatmapTable :matrix="matrixCust" row-label="客户分级" :display-mode="view.displayMode" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">L4 组织 × 产品大类</SectionTitle>
        <p class="ycp-note">与上表行维度不同：上表看「哪档客户消耗哪类产品」，本表看「哪个组在做哪类产品」。</p>
        <HeatmapTable :matrix="matrixOrg" row-label="L4 组织" :display-mode="view.displayMode" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">客户 × 产品交叉</SectionTitle>
        <p class="ycp-note">按累计工时取前 {{ CROSS_TOP_N }} 个客户。</p>
        <ChartBox :option="crossOption" height="420px" />
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.ycp-err { margin: 0; color: var(--danger-text); }
.ycp-note { margin: 0 0 var(--sp-3); font-size: var(--fs-1); color: var(--mut); }
.ycp-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }
</style>
```
> `DataTable` / `ChartBox` / `PageHeader` / `PageTabs` 的实际 props 名以仓库现状为准 —— 动手前先 Read `YitianCustomerView.vue`，照抄它的用法，**勿臆造 props**。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/views/YitianCustomerProductView.test.ts`
Expected: 4 passed

- [ ] **Step 5: 跑全部倚天前端测试**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/ src/views/Yitian src/components/Yitian src/components/HeatmapTable.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: typecheck 并提交**

```bash
npm --prefix frontend run typecheck
git add frontend/src/views/YitianCustomerProductView.vue frontend/src/views/YitianCustomerProductView.test.ts
git commit -m "feat(yitian-cp): 装配客户与产品分析页六个分析块

版面把 TOP1000 覆盖度提到 953 行的客户清单之前——覆盖率是管理层最先要看的单一
数字,不该被长表挡住。五档 KPI 随筛选联动(与总览卡的全量口径不同,共用同一聚合函数)。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 全量验证、版本号与 PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 饱和度口径回归安全网（先单独跑）**

```bash
npm --prefix frontend run test:run -- src/lib/yitian/metrics.test.ts
git diff --numstat frontend/src/lib/yitian/metrics.ts | wc -l
```
Expected: 测试全绿且断言一字未改；`metrics.ts` 改动行数为 **0**。本期承诺不动饱和度口径，非 0 即违约，回退。

- [ ] **Step 2: 改版本号**

`frontend/src/version.ts` 改为 `V4.5.5`，`RELEASE_DATE` 改为当天日期。

- [ ] **Step 3: 跑全量验证**

```bash
bash verify.sh
```
Expected: 全绿。已知非本期引入的噪声（可忽略但要如实记）：`tests/test_server_download.py::test_super_download_missing_script_reports` 与 `tests/test_server_budget.py::test_config_post_未登录401` 是既有 flake（backlog L-32）；build 的 `>500KB` 单 chunk 与 esbuild CSS 注释两条警告为既有。除此之外有红**必须修**。

- [ ] **Step 4: 重跑管线并最终对拍**

```bash
python preprocess_data.py 2>&1 | tail -12
```
再跑 Task 3 Step 7 与 Task 4 Step 7 的两个对拍脚本，确认与本计划「实测基线」一节一致。

- [ ] **Step 5: 更新 PROGRESS.md**

在顶部版本区插入 V4.5.5 条目，「当前版本」改 V4.5.5、原 V4.5.4 降为「上一版本」、V4.5.3 降为「更早版本」。条目须含：
- 本期范围：新页 6 块 + 筛选器扩充 + 显示项切换 + `meta.top1000Named` + 修 `_YITIAN_PAGE_KEYS` 漏 `yitian-detail`
- **实测基线**：B-1 五行、B-3 指名 139/支持 97/覆盖率 69.8%、产品大类 10 档、A-2 12×10、A-4 953 客户
- **需点「更新数据」**：本期改了 `yitian.py`/`schema.py`（`meta.top1000Named` 是新字段），属数据管线变更
- **新增 pageKey `yitian-customer-product`**：升级后**已有账号不会自动获得该页**，超管需在账号管理里逐个勾选；`allowedPages` 含 `'*'` 的账号自动可见
- **顺修的既有缺陷**：`_YITIAN_PAGE_KEYS` 漏 `yitian-detail`（V4.1.0 遗留），只勾「工时明细」的账号此前拿不到数据
- 未做项：三期（工时治理监控页 + 员工明细 5 列 + 趋势半年/年）

backlog 新增一条：
```
- [ ] **L-44（V4.5.5 遗留）** B-3「TOP1000 覆盖度」的市场BG 轴当前只有一个值
      （`input/TOP1000.xlsx` 139 行全部是「市场BG3」），该表只有 1 行。功能完整、
      换一份含多 BG 的清单即自动生效（与 L-40 同源）。在清单补全前，该块的信息量
      等同于一个单一覆盖率数字。
```

同时新增人工目验清单（照 L-43 体例）。

- [ ] **Step 6: 提交并推送**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.5.5 客户与产品分析页

新页 6 个分析块 + 三个筛选维度与显示项切换 + meta.top1000Named。
顺修 _YITIAN_PAGE_KEYS 漏 yitian-detail 的既有缺陷。
verify.sh 全绿。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin master
```
> 推送前 `git status` + `git diff --cached --stat` 核一眼：**不得出现 `data/`、`input/`、`release/`、`yitian*/` 下的任何文件**。

---

## 人工验证清单（AI 无浏览器，须用户执行）

1. 侧栏「倚天工时 → 工时分析」下出现第 5 个 tab「客户与产品分析」，**侧栏项数没变**。
2. 页面六个块都渲染：五档 KPI、客户支持情况（5 行）、TOP1000 覆盖度（覆盖率 **69.8%**）、客户支持清单（默认 50 行，可切全部）、两张热力图（**行维度分别是「客户分级」和「L4 组织」**）、客户×产品交叉图（20 个客户）。
3. **筛选联动**：选一个产品大类（如「终端安全」）→ 六块数字全部跟着变；五档 KPI 的合计等于该筛选下的客户类工时。
4. **显示项切换**：切「只显示比例」→ 两张热力图的单元格只剩百分比；切「只显示工时」→ 只剩数字。
5. **持久化**：设好筛选 → F5 刷新 → 筛选条件仍在。
6. **权限**：用一个 `allowedPages` 不含新页的普通管理员登录 → 看不到该 tab；超管勾上后可见。
7. **既有缺陷修复验证**：建一个只勾「工时明细」的账号 → 登录 → `/yitian/detail` **有数据**（修复前会报 403）。
