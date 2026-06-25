# 服务器端数据下载 + /insight/board 排名图表随排序换口径 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/data` 增「下载数据」按钮（服务器后台跑 PMIS 下载流水线 + Cookie 经认证通道送达 config.json）并压缩文件清单展示；让 `/insight/board` 排名区的柱/折/饼图随「排序」指标整体换口径。

**Architecture:** 后端新增 3 个超管端点（`POST/GET /api/pmis/cookie` 写/读 cookie、`GET /api/pmis/download` SSE 跑 `pmisdata/run_pmis_pipeline.sh`），复用既有 `ThreadingHTTPServer` + SSE + `_authz_gate` 超管门；Cookie 读写抽为独立纯模块 `pmis_config.py`。前端 `DataView.vue` 加下载区（cookie 文本域 + 下载按钮 + 独立进度条）并把文件清单改多列网格；`BoardView.vue` 用既有 `buildRankingOption` 单系列按 `sortKey` 指标构图。

**Tech Stack:** Python 标准库 HTTP（server.py）、bash 流水线脚本、Vue3 + TS + Pinia + Element Plus、ECharts、Vitest、pytest。

## Global Constraints

- 交流/文案一律**简体中文**；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts`；本次为 **Z 级**，目标 `V2.1.1`，只改此处。
- 前端**只引用设计令牌**（`styles/theme.css` 的 `--*`），不手写散值；样式倾向补 CSS 而非引框架。
- 后端任何"调用脚本/读写文件路径"逻辑须兼顾 **frozen/dev 两条分支**；本特性下载脚本位于磁盘 `pmisdata/`、依赖系统 `python3`，两模式**同走 `subprocess bash`**（无需 importlib 直跑）。
- 回款口径（Σ流水净额÷Σ合同总额等）**不动**。
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 下载与 cookie 推送本机无 PMIS 访问，**功能性冒烟由用户在可访问机器上做**；本计划只保证纯函数/端点鉴权/前端接线的自动化测试全绿。

---

## Task 1: chartOptions.ts 增加可选 palette 参数

**Files:**
- Modify: `frontend/src/lib/chartOptions.ts`
- Test: `frontend/src/lib/chartOptions.test.ts`

**Interfaces:**
- Produces: `buildRankingOption(type, { categories, values, metricLabel, valueKind, legendCounts?, palette? })` —— 新增可选 `palette?: string[]`；不传时回落 `CHART_LIGHT`（零回归）。返回对象的 `color` 字段为该色板。

- [ ] **Step 1: 写失败测试**（追加到 `chartOptions.test.ts` 末尾）

```ts
describe('buildRankingOption palette 参数', () => {
  it('传 palette 覆盖默认色板(bar)', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count', palette: ['#111', '#222'] })
    expect(opt.color).toEqual(['#111', '#222'])
  })
  it('pie 同样接受 palette', () => {
    const opt = buildRankingOption('pie', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount', palette: ['#abc'] })
    expect(opt.color).toEqual(['#abc'])
  })
  it('不传 palette 回落 CHART_LIGHT(零回归)', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    expect(opt.color[0]).toBe('#0d3a69')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/chartOptions.test.ts`
Expected: FAIL（`palette: ['#111','#222']` 时 `opt.color` 仍为 `CHART_LIGHT`）

- [ ] **Step 3: 最小实现**

在 `RankingOptionParams` 接口加字段：

```ts
export interface RankingOptionParams {
  categories: string[]
  values: number[]
  metricLabel: string
  valueKind: ValueKind
  legendCounts?: number[]
  palette?: string[]
}
```

在 `buildRankingOption` 体内，紧接 `const formatter = makeLabelFormatter(valueKind)` 后加一行：

```ts
  const color = params.palette ?? CHART_LIGHT
```

把 pie 分支 `return { ... color: CHART_LIGHT, ... }` 改为 `color,`；把末尾 bar/line 的 `return { ... color: CHART_LIGHT, ... }` 也改为 `color,`。（两处 `color: CHART_LIGHT` → `color`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/chartOptions.test.ts`
Expected: PASS（含原有用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/chartOptions.ts frontend/src/lib/chartOptions.test.ts
git commit -m "feat(chart): buildRankingOption 增加可选 palette 参数(默认 CHART_LIGHT)"
```

---

## Task 2: BoardView 排名图随排序指标整体换口径

**Files:**
- Modify: `frontend/src/views/BoardView.vue`
- Test: `frontend/src/views/BoardView.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `buildRankingOption(..., { palette })`；既有 `valueKindForPie`、`CHART_LIGHT/CHART_DARK`、`sortKey: Ref<PayBoardSortKey>`、`chartTop`（=`sortedGroups.slice(0,15)`）。
- Produces: 暴露 `activeChart`（`{label,kind,val}`）、`pieRenderable`（`boolean`）供测试读取。

- [ ] **Step 1: 改写图表测试**（替换 `BoardView.test.ts` 第 103-115 的「柱状图含已回/待回/总计数字 label」整块为下面两个用例；其余用例不动）

```ts
  it('柱状图随排序指标换口径：默认项目数→各组计数；切合同金额→合同额(万)', async () => {
    seed()
    const w = mount(BoardView, opts)
    await flushPromises()
    // 默认 sort=projectCount(count)：北京/上海各 1 个项目
    let opt = (w.findComponent(ChartBox).props('option') as any)
    expect(opt.series[0].data).toEqual([1, 1])
    expect(w.text()).toContain('项目数排名')
    // 切合同金额(amount,÷万)：北京 200万 居首
    await w.get('[data-test="seg-contractSum"]').trigger('click')
    opt = (w.findComponent(ChartBox).props('option') as any)
    expect(opt.xAxis.data[0]).toBe('北京')
    expect(opt.series[0].data[0]).toBe(200)
    expect(w.text()).toContain('合同金额排名')
  })

  it('完成率指标饼图降级(pieRenderable=false)，合同金额可饼图', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-rate"]').trigger('click')
    expect((w.vm as any).pieRenderable).toBe(false)
    await w.get('[data-test="seg-contractSum"]').trigger('click')
    expect((w.vm as any).pieRenderable).toBe(true)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/BoardView.test.ts`
Expected: FAIL（当前柱图为已回/待回堆叠，`series[0].data` 非 `[1,1]`；无 `pieRenderable`）

- [ ] **Step 3: 改 BoardView.vue —— import 与映射**

在 `<script setup>` 顶部 import 区：
- 把 `import { buildRankingOption } from '@/lib/chartOptions'` 改为
  `import { buildRankingOption, valueKindForPie, type ValueKind } from '@/lib/chartOptions'`
- 把 `import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'` 改为
  `import { CHART_LIGHT, CHART_DARK } from '@/charts/echartsTheme'`

删除三个旧 computed：`stackedBarOption`、`lineChartOption`、`pieChartOption`（约第 98-149 行）及其上方注释；保留 `chartTop`（第 97 行）。新增映射与派生（放在 `chartTop` 之后）：

```ts
type SortChart = { label: string; kind: ValueKind; val: (g: PayBoardGroup) => number }
const SORT_CHART: Record<PayBoardSortKey, SortChart> = {
  projectCount:   { label: '项目数',   kind: 'count',  val: (g) => g.projectCount },
  contractSum:    { label: '合同金额', kind: 'amount', val: (g) => g.contractSum },
  rate:           { label: '完成率',   kind: 'ratio',  val: (g) => g.rate ?? 0 },
  delayedNodeSum: { label: '延期节点', kind: 'count',  val: (g) => g.delayedNodeSum },
}
const activeChart = computed(() => SORT_CHART[sortKey.value])
const pieRenderable = computed(() => valueKindForPie(activeChart.value.kind))
const chartPalette = computed(() => (settings.theme === 'dark' ? CHART_DARK : CHART_LIGHT))

function chartOptionForType(type: string) {
  const ac = activeChart.value
  return buildRankingOption(type as 'bar' | 'line' | 'pie', {
    categories: chartTop.value.map((g) => g.key),
    values: chartTop.value.map((g) => ac.val(g)),
    metricLabel: ac.label,
    valueKind: ac.kind,
    palette: chartPalette.value,
  })
}
```

把文件末尾的 `defineExpose({ drillOpen, dimKey })` 改为
`defineExpose({ drillOpen, dimKey, activeChart, pieRenderable })`。

- [ ] **Step 4: 改 BoardView.vue —— 单维图表模板**

把单维图表 `<section v-for="type in chartTypes" ...>`（约第 279-290 行）整块替换为：

```html
          <section
            v-for="type in chartTypes"
            :key="type"
            class="bv-card bv-chart-item"
          >
            <h3 class="bv-title">{{ activeChart.label }}排名（Top {{ chartTop.length }}）</h3>
            <ChartBox v-if="type !== 'pie' || pieRenderable" :option="chartOptionForType(type)" height="320px" />
            <div v-else class="bv-empty">完成率为比率，不宜用饼图（请改用柱状/折线）</div>
          </section>
```

- [ ] **Step 5: 跑测试 + typecheck 确认通过**

Run: `cd frontend && npx vitest run src/views/BoardView.test.ts && npm run typecheck`
Expected: PASS；typecheck 无错（若 `STATUS_LIGHT/DARK` 仍被别处引用则 typecheck 会报未使用 import——本视图已无其它引用，删干净即可）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts
git commit -m "feat(board): 排名柱/折/饼随排序指标整体换口径(单系列+比率饼图降级+主题色板)"
```

---

## Task 3: pmis_config.py —— cookie 读写纯模块

**Files:**
- Create: `pmis_config.py`
- Test: `tests/test_pmis_config.py`

**Interfaces:**
- Produces:
  - `session_preview(cookie: str) -> str`（SESSION 值前 8 位，无则 `''`）
  - `write_session_cookie(config_path: str, cookie: str) -> str`（校验非空且含 `SESSION=`，否则 `raise ValueError`；保留其余键、原子替换；返回预览）
  - `read_session_status(config_path: str) -> dict`（`{'sessionPreview':..., 'updatedAt':...}`；文件缺失/坏 JSON 返回空串）

- [ ] **Step 1: 写失败测试** `tests/test_pmis_config.py`

```python
# -*- coding: utf-8 -*-
import json
import pytest
import pmis_config as pc


def _cfg(tmp_path, cookie='SESSION=abc12345-zzzz'):
    p = tmp_path / 'config.json'
    p.write_text(json.dumps({'session_cookie': cookie, 'base_url': 'https://x', 'page_size': 100},
                            ensure_ascii=False), encoding='utf-8')
    return str(p)


def test_write_replaces_and_keeps_other_keys(tmp_path):
    p = _cfg(tmp_path)
    preview = pc.write_session_cookie(p, 'a=1; SESSION=deadbeef-0000; b=2')
    cfg = json.loads(open(p, encoding='utf-8').read())
    assert cfg['session_cookie'] == 'a=1; SESSION=deadbeef-0000; b=2'
    assert cfg['base_url'] == 'https://x'   # 其余键保留
    assert cfg['page_size'] == 100
    assert preview == 'deadbeef'            # SESSION 前 8 位


def test_write_rejects_missing_session(tmp_path):
    p = _cfg(tmp_path)
    with pytest.raises(ValueError):
        pc.write_session_cookie(p, 'a=1; b=2')


def test_write_rejects_empty(tmp_path):
    p = _cfg(tmp_path)
    with pytest.raises(ValueError):
        pc.write_session_cookie(p, '   ')


def test_read_status(tmp_path):
    p = _cfg(tmp_path, cookie='x=1; SESSION=feedface-9999')
    st = pc.read_session_status(p)
    assert st['sessionPreview'] == 'feedface'
    assert st['updatedAt']                  # 非空时间串


def test_read_status_missing_file(tmp_path):
    st = pc.read_session_status(str(tmp_path / 'nope.json'))
    assert st == {'sessionPreview': '', 'updatedAt': ''}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_pmis_config.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'pmis_config'`）

- [ ] **Step 3: 实现** `pmis_config.py`

```python
"""pmisdata/config.json 的 session_cookie 读写(独立纯函数,供 server 端点与测试复用)。"""
import json
import os
import re
import time

_SESSION_RE = re.compile(r'SESSION=([^;]+)')


def session_preview(cookie):
    """取 cookie 串里 SESSION 值前 8 位;无则空串。"""
    m = _SESSION_RE.search(cookie or '')
    return m.group(1)[:8] if m else ''


def write_session_cookie(config_path, cookie):
    """把 session_cookie 写回 config.json,保留其余键,原子替换。
    cookie 必须非空且含 'SESSION='。返回 SESSION 前 8 位预览。"""
    cookie = (cookie or '').strip()
    if not cookie or 'SESSION=' not in cookie:
        raise ValueError('cookie 为空或缺少 SESSION')
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    config['session_cookie'] = cookie
    tmp = config_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config_path)
    return session_preview(cookie)


def read_session_status(config_path):
    """返回 {sessionPreview, updatedAt}。文件不存在/坏 JSON 返回空串。"""
    try:
        mtime = os.path.getmtime(config_path)
        with open(config_path, 'r', encoding='utf-8') as f:
            cookie = json.load(f).get('session_cookie', '')
    except (OSError, ValueError):
        return {'sessionPreview': '', 'updatedAt': ''}
    return {
        'sessionPreview': session_preview(cookie),
        'updatedAt': time.strftime('%Y-%m-%d %H:%M', time.localtime(mtime)),
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_pmis_config.py -q`
Expected: PASS（5 passed）

- [ ] **Step 5: 提交**

```bash
git add pmis_config.py tests/test_pmis_config.py
git commit -m "feat(pmis): pmis_config 纯模块——session_cookie 校验写入/状态读取"
```

---

## Task 4: server.classify_download_line —— 下载进度行解析纯函数

**Files:**
- Modify: `server.py`（新增模块级函数 + `_DOWNLOAD_MARKERS` 常量；建议放在 `classify_progress_line` 函数附近，约第 1695 行后）
- Test: `tests/test_server_download.py`

**Interfaces:**
- Produces: `classify_download_line(line: str) -> tuple[int|None, str] | None` —— 空行返回 `None`；命中步骤标记返回 `(进度, 提示)`；其余非空行返回 `(None, 原行)`（只更新消息、不动进度）。

- [ ] **Step 1: 写失败测试** `tests/test_server_download.py`（先只放解析用例，端点用例在 Task 5/6 追加）

```python
# -*- coding: utf-8 -*-
import server as S


def test_step_markers_map_progress():
    assert S.classify_download_line('[2026-06-25 12:00:00]   Step 1/3: ...') == (10, '下载 PMIS 报表...')
    assert S.classify_download_line('  ✓ fetch_pmis_tables.py 执行成功') == (30, 'PMIS 报表已下载')
    assert S.classify_download_line('Step 2/3') == (35, '下载全量项目损益(耗时较长)...')
    assert S.classify_download_line('  ✓ fetch_all_projects.py 执行成功') == (75, '项目损益已下载')
    assert S.classify_download_line('Step 3/3') == (80, '交付成本分析...')
    assert S.classify_download_line('  ✓ delivery_analysis.py 执行成功') == (90, '成本分析完成')
    assert S.classify_download_line('  拷贝到目标路径') == (95, '拷贝到 input/...')
    assert S.classify_download_line('  流水线完成') == (100, '下载完成，请点更新数据生效')


def test_empty_line_returns_none():
    assert S.classify_download_line('   ') is None


def test_other_line_keeps_progress_none_with_message():
    prog, msg = S.classify_download_line('   下载项目 123/500 ...')
    assert prog is None
    assert msg == '下载项目 123/500 ...'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_download.py -q`
Expected: FAIL（`AttributeError: module 'server' has no attribute 'classify_download_line'`）

- [ ] **Step 3: 实现**（在 `server.py` 的 `classify_progress_line` 函数定义之后插入）

```python
_DOWNLOAD_MARKERS = [
    ("Step 1/3", 10, "下载 PMIS 报表..."),
    ("fetch_pmis_tables.py 执行成功", 30, "PMIS 报表已下载"),
    ("Step 2/3", 35, "下载全量项目损益(耗时较长)..."),
    ("fetch_all_projects.py 执行成功", 75, "项目损益已下载"),
    ("Step 3/3", 80, "交付成本分析..."),
    ("delivery_analysis.py 执行成功", 90, "成本分析完成"),
    ("拷贝到目标路径", 95, "拷贝到 input/..."),
    ("流水线完成", 100, "下载完成，请点更新数据生效"),
]


def classify_download_line(line):
    """解析 run_pmis_pipeline.sh 的一行 → (progress|None, message) 或 None(空行)。
    命中步骤标记→(进度,提示);其余非空行→(None,原行)只更新消息。"""
    s = line.strip()
    if not s:
        return None
    for needle, prog, msg in _DOWNLOAD_MARKERS:
        if needle in s:
            return (prog, msg)
    return (None, s)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_download.py -q`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add server.py tests/test_server_download.py
git commit -m "feat(server): classify_download_line 解析下载流水线进度行"
```

---

## Task 5: 后端 Cookie 端点（POST 写 / GET 读，超管专属）

**Files:**
- Modify: `server.py`（路径常量、`_SUPER_ONLY_PATHS`、do_GET/do_POST 路由、两个 handler）
- Test: `tests/test_server_download.py`（追加端点用例）

**Interfaces:**
- Consumes: Task 3 的 `pmis_config.write_session_cookie/read_session_status`。
- Produces:
  - 模块常量 `PMISDATA_DIR`、`PMISDATA_CONFIG`、`PMIS_PIPELINE_SCRIPT`。
  - `POST /api/pmis/cookie {cookie}` → `{success, sessionPreview, message}`（校验失败 `_error_payload(ERR_VALIDATION,...)`）。
  - `GET /api/pmis/cookie` → `{sessionPreview, updatedAt}`。
  - 两路径加入 `_SUPER_ONLY_PATHS`（非超管 403）。

- [ ] **Step 1: 追加失败测试**（在 `tests/test_server_download.py` 末尾）

```python
import json as _json
import http.client
import threading
import auth


def _accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "d1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["D1"], "displayName": "D1"},
    }})


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", _json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse(); cookie = r.getheader("Set-Cookie").split(";")[0]; r.read()
    return conn, cookie


def _req(conn, method, path, cookie, body=None):
    headers = {"Cookie": cookie}
    if body is not None:
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body, headers)
    r = conn.getresponse(); st = r.status; data = r.read().decode("utf-8")
    return st, data


def test_cookie_paths_are_super_only():
    assert "/api/pmis/cookie" in S._SUPER_ONLY_PATHS
    assert "/api/pmis/download" in S._SUPER_ONLY_PATHS


def test_nonsuper_blocked_from_cookie(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "d1")
        assert _req(conn, "GET", "/api/pmis/cookie", ck)[0] == 403
        assert _req(conn, "POST", "/api/pmis/cookie", ck, body="{}")[0] == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_super_cookie_roundtrip(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    cfg = tmp_path / "config.json"
    cfg.write_text(_json.dumps({"session_cookie": "SESSION=old00000-aaaa", "base_url": "u"}),
                   encoding="utf-8")
    monkeypatch.setattr(S, "PMISDATA_CONFIG", str(cfg))
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "POST", "/api/pmis/cookie", ck,
                        body=_json.dumps({"cookie": "x=1; SESSION=newvalue-123"}))
        assert st == 200
        assert _json.loads(data)["sessionPreview"] == "newvalue"
        # 写盘保留其余键
        assert _json.loads(cfg.read_text(encoding="utf-8"))["base_url"] == "u"
        # GET 状态回读
        st2, data2 = _req(conn, "GET", "/api/pmis/cookie", ck)
        assert st2 == 200 and _json.loads(data2)["sessionPreview"] == "newvalue"
        # 非法 cookie：success False
        st3, data3 = _req(conn, "POST", "/api/pmis/cookie", ck,
                          body=_json.dumps({"cookie": "no-session-here"}))
        assert _json.loads(data3)["success"] is False
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_download.py -q`
Expected: FAIL（`/api/pmis/cookie` 未在 `_SUPER_ONLY_PATHS`；端点未路由 → 403 用例失败或 404）

- [ ] **Step 3: 加路径常量**（`server.py` 第 82 行 `PARENT_DIR = ...` 之后）

```python
# ── PMIS 在线下载流水线(pmisdata/)──
PMISDATA_DIR = os.path.join(BASE_DIR, 'pmisdata')
PMISDATA_CONFIG = os.path.join(PMISDATA_DIR, 'config.json')
PMIS_PIPELINE_SCRIPT = os.path.join(PMISDATA_DIR, 'run_pmis_pipeline.sh')
```

- [ ] **Step 4: 加入超管白名单**（`_SUPER_ONLY_PATHS` frozenset 内追加两项）

```python
    '/api/temp-followup/scope', '/api/temp-followup/archive',
    '/api/pmis/cookie', '/api/pmis/download',
})
```

- [ ] **Step 5: 加路由**

do_GET（`elif parsed.path == '/api/files/status':` 之前或之后任一处，与同级 elif 并列）追加：

```python
        elif parsed.path == '/api/pmis/cookie':
            self.handle_pmis_cookie_get()
        elif parsed.path == '/api/pmis/download':
            self.handle_pmis_download()
```

do_POST（在 `elif parsed.path == '/api/inputs/upload':` 一组附近）追加：

```python
        elif parsed.path == '/api/pmis/cookie':
            self.handle_pmis_cookie_save()
```

- [ ] **Step 6: 加 handler**（放在 `handle_reprocess` 方法之前，与其它 handler 并列，注意缩进为类方法）

```python
    def handle_pmis_cookie_get(self):
        """GET /api/pmis/cookie - 当前 cookie 状态(SESSION 前 8 位 + 更新时间)。超管专属。"""
        import pmis_config
        self._json_response(pmis_config.read_session_status(PMISDATA_CONFIG))

    def handle_pmis_cookie_save(self):
        """POST /api/pmis/cookie {cookie} - 写 pmisdata/config.json 的 session_cookie。超管专属。"""
        import pmis_config
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求体解析失败: {e}"))
            return
        try:
            preview = pmis_config.write_session_cookie(PMISDATA_CONFIG, body.get('cookie') or '')
        except ValueError as e:
            self._json_response(_error_payload(ERR_VALIDATION, str(e)))
            return
        except OSError as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"写入失败: {e}"))
            return
        self._json_response({"success": True, "sessionPreview": preview, "message": "Cookie 已更新"})
```

> 注：`handle_pmis_download` 在 Task 6 实现；本任务 do_GET 已引用它，故 Task 5、6 需连续完成才整体可跑。若分别提交，可在本任务先加一个占位：`def handle_pmis_download(self): self._json_response({"running": False, "progress": 0, "message": "未实现"})`，Task 6 再替换。

- [ ] **Step 7: 跑测试确认通过**

Run: `python -m pytest tests/test_server_download.py -q`
Expected: PASS（cookie 相关用例通过）

- [ ] **Step 8: 提交**

```bash
git add server.py tests/test_server_download.py
git commit -m "feat(server): /api/pmis/cookie 读写端点(超管专属,写 pmisdata/config.json)"
```

---

## Task 6: 后端下载端点（SSE）+ run_download + 互斥

**Files:**
- Modify: `server.py`（`download_state` 全局、`run_download`、`handle_pmis_download`、reprocess/data-history 互斥）
- Test: `tests/test_server_download.py`（追加下载端点用例）

**Interfaces:**
- Consumes: Task 4 `classify_download_line`；Task 5 的 `PMIS_PIPELINE_SCRIPT`、`PMISDATA_DIR`。
- Produces: `download_state` 全局；`GET /api/pmis/download`（SSE，单调进度，与 reprocess/history/自身互斥）。

- [ ] **Step 1: 追加失败测试**（`tests/test_server_download.py` 末尾，复用上面的 `_accounts/_login/_req`）

```python
def test_nonsuper_blocked_from_download(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "d1")
        assert _req(conn, "GET", "/api/pmis/download", ck)[0] == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_super_download_missing_script_reports(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(S, "PMIS_PIPELINE_SCRIPT", str(tmp_path / "nope.sh"))
    S.download_state = {"running": False, "progress": 0, "message": ""}
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "GET", "/api/pmis/download", ck)
        assert st == 200          # 非 403：超管放行
        assert "下载脚本不存在" in data
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_download.py -q`
Expected: FAIL（无 `download_state` / `handle_pmis_download` 占位返回"未实现"）

- [ ] **Step 3: 加 download_state 全局**（`server.py` 第 119 行 `reprocess_state = ...` 之后）

```python
# PMIS 在线下载流水线状态(独立于 reprocess)
download_state = {"running": False, "progress": 0, "message": ""}
```

- [ ] **Step 4: 实现 run_download**（放在 `run_reprocess` 函数之后，模块级）

```python
def run_download():
    """跑 pmisdata/run_pmis_pipeline.sh:备份→从 PMIS 下载→覆盖 input/。
    frozen/dev 同走 subprocess(脚本在磁盘 pmisdata/、依赖系统 python3)。不自动 reprocess。"""
    global download_state
    if not os.path.exists(PMIS_PIPELINE_SCRIPT):
        download_state = {"running": False, "progress": 0,
                          "message": "下载脚本不存在(pmisdata/run_pmis_pipeline.sh)"}
        return
    try:
        download_state = {"running": True, "progress": 5, "message": "启动下载流水线..."}
        env = {**os.environ, "PMPLATFORM_DIR": BASE_DIR}
        _flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        process = subprocess.Popen(
            ["bash", PMIS_PIPELINE_SCRIPT],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            cwd=PMISDATA_DIR, env=env, encoding='utf-8', errors='replace',
            creationflags=_flags)
        errs = []
        for raw in process.stdout:
            if '✗' in raw:
                errs.append(raw.strip())
            parsed = classify_download_line(raw)
            if parsed is None:
                continue
            prog, msg = parsed
            cur = download_state["progress"]
            if prog is not None and prog > cur:
                cur = prog
            download_state = {"running": True, "progress": cur, "message": msg}
        process.wait()
        if process.returncode != 0 or errs:
            tail = '; '.join(errs[-3:]) if errs else f"退出码 {process.returncode}"
            download_state = {"running": False, "progress": 0, "message": f"下载失败: {tail}"}
            return
        download_state = {"running": True, "progress": 100, "message": "下载完成，请点更新数据生效"}
    except FileNotFoundError:
        download_state = {"running": False, "progress": 0,
                          "message": "下载失败: 未找到 bash(需 Linux/含 bash 环境)"}
    except Exception as e:
        download_state = {"running": False, "progress": 0, "message": f"下载失败: {str(e)[:100]}"}
        logger.error(f"download 失败: {e}", exc_info=True)
    finally:
        time.sleep(3)
        download_state["running"] = False
```

- [ ] **Step 5: 实现 handle_pmis_download**（替换 Task 5 的占位；与 `handle_reprocess` 并列）

```python
    def handle_pmis_download(self):
        """GET /api/pmis/download - 服务器端跑 PMIS 下载流水线,SSE 流式进度。超管专属。"""
        global download_state
        if history_state.get("running") or reprocess_state.get("running"):
            self._json_response({"running": False, "progress": 0, "message": "其他数据操作进行中,请稍后再下载"})
            return
        if download_state.get("running"):
            self._json_response(download_state)
            return
        download_state = {"running": True, "progress": 0, "message": "启动下载..."}
        threading.Thread(target=run_download, daemon=True).start()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        while True:
            self.wfile.write(f"data: {json.dumps(download_state)}\n\n".encode('utf-8'))
            self.wfile.flush()
            if download_state["progress"] >= 100 or not download_state["running"]:
                break
            time.sleep(0.5)
```

- [ ] **Step 6: 互斥反向加锁**（让 reprocess/历史回滚拒绝在下载进行中启动）

`handle_reprocess` 开头的 `if history_state.get("running"):` 改为：

```python
        if history_state.get("running") or download_state.get("running"):
            self._json_response({"running": False, "progress": 0, "message": "其他数据操作进行中,请稍后再更新"})
            return
```

`_history_busy` 方法改为：

```python
    def _history_busy(self):
        return reprocess_state.get("running") or history_state.get("running") or download_state.get("running")
```

- [ ] **Step 7: 跑测试确认通过**

Run: `python -m pytest tests/test_server_download.py -q`
Expected: PASS（全部下载/cookie 用例）

- [ ] **Step 8: 全后端回归 + 提交**

Run: `python -m pytest -q`
Expected: PASS（无回归）

```bash
git add server.py tests/test_server_download.py
git commit -m "feat(server): /api/pmis/download SSE 跑下载流水线 + 与 reprocess/历史互斥"
```

---

## Task 7: run_pmis_pipeline.sh 参数化目标根目录

**Files:**
- Modify: `pmisdata/run_pmis_pipeline.sh`

**Interfaces:**
- Produces: 脚本读环境变量 `PMPLATFORM_DIR`（缺省 `/opt/pmplatform`）决定拷贝目标，server 经 `env` 传入 `BASE_DIR`。

- [ ] **Step 1: 改目标路径定义**（第 210-211 行）

把：

```bash
PMIS_TARGET="/opt/pmplatform/input/pmis"
INPUT_TARGET="/opt/pmplatform/input"
```

改为：

```bash
PMPLATFORM_DIR="${PMPLATFORM_DIR:-/opt/pmplatform}"
PMIS_TARGET="$PMPLATFORM_DIR/input/pmis"
INPUT_TARGET="$PMPLATFORM_DIR/input"
```

- [ ] **Step 2: 语法自检**（不实际跑流水线，仅校验 bash 语法）

Run: `bash -n pmisdata/run_pmis_pipeline.sh`
Expected: 无输出（语法 OK）

- [ ] **Step 3: 提交**

```bash
git add pmisdata/run_pmis_pipeline.sh
git commit -m "feat(pmis): run_pmis_pipeline.sh 用 PMPLATFORM_DIR 参数化拷贝目标(默认 /opt/pmplatform)"
```

---

## Task 8: update_cookie.py 增加 --server 直推

**Files:**
- Modify: `pmisdata/update_cookie.py`

**Interfaces:**
- Produces: 新增 CLI 参数 `--server <url>`、`--account <账号>`、`--password <pw>`；抓到 cookie 后 `POST <url>/api/login` 登录、再 `POST <url>/api/pmis/cookie` 推送；stdlib `urllib` 实现，打印 `[OK]/[ERROR]`。

- [ ] **Step 1: 扩展 parse_args**（`parse_args` 内 `--txt` 之后追加）

```python
    p.add_argument("--server", help="pmplatform 地址(如 http://10.0.0.5:8080);给出则把 cookie 推送到服务器")
    p.add_argument("--account", help="pmplatform 超管账号(--server 时用于登录鉴权)")
    p.add_argument("--password", help="pmplatform 超管密码(缺省则交互输入)")
```

- [ ] **Step 2: 加推送函数**（模块级，`main` 之前）

```python
def push_cookie_to_server(base_url, account, password, cookie_string):
    """登录 pmplatform 拿会话,再把 cookie 推到 /api/pmis/cookie。stdlib urllib,无新依赖。"""
    import getpass
    import urllib.request
    base = base_url.rstrip("/")
    if not account:
        account = input("  pmplatform 超管账号: ").strip()
    if not password:
        password = getpass.getpass("  pmplatform 超管密码: ")

    def _post(path, payload, cookie=None):
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(base + path, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        if cookie:
            req.add_header("Cookie", cookie)
        resp = urllib.request.urlopen(req, timeout=30)
        set_cookie = resp.headers.get("Set-Cookie")
        return json.loads(resp.read().decode("utf-8")), set_cookie

    try:
        login_data, set_cookie = _post("/api/login", {"account": account, "password": password})
    except Exception as e:
        print(f"[ERROR] 登录 pmplatform 失败: {e}")
        return False
    if not login_data.get("success") or not set_cookie:
        print("[ERROR] 登录 pmplatform 失败: 账号或密码错误")
        return False
    session = set_cookie.split(";")[0]
    try:
        data, _ = _post("/api/pmis/cookie", {"cookie": cookie_string}, cookie=session)
    except Exception as e:
        print(f"[ERROR] 推送 cookie 失败: {e}")
        return False
    if data.get("success"):
        print(f"[OK] Cookie 已推送到服务器 (SESSION {data.get('sessionPreview', '')})")
        return True
    print(f"[ERROR] 推送 cookie 失败: {data.get('message', '未知')}")
    return False
```

- [ ] **Step 3: 在 main 末尾接入**（捕获 cookie、`cookie_string` 已就绪、本地写/打印之后，函数 `print()` 收尾之前追加）

```python
    if args.server:
        print()
        print("=" * 60)
        print("  推送到服务器")
        print("=" * 60)
        push_cookie_to_server(args.server, args.account, args.password, cookie_string)
```

- [ ] **Step 4: 语法/import 自检**（无 PMIS、不实际登录；仅确认可解析 + `--help` 列出新参数）

Run: `python -c "import ast; ast.parse(open('pmisdata/update_cookie.py', encoding='utf-8').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 5: 提交**

```bash
git add pmisdata/update_cookie.py
git commit -m "feat(pmis): update_cookie.py 增加 --server 直推(登录 pmplatform 后 POST /api/pmis/cookie)"
```

---

## Task 9: 前端下载 composable + DataView 下载区

**Files:**
- Create: `frontend/src/composables/usePmisDownload.ts`
- Modify: `frontend/src/views/DataView.vue`
- Test: `frontend/src/views/DataView.test.ts`

**Interfaces:**
- Consumes: 既有 `apiUrl`、`api`（client）、`useReprocess` 模式；后端 `/api/pmis/cookie`（GET/POST）、`/api/pmis/download`（SSE）。
- Produces: `usePmisDownload({onDone?})` → `{progress, message, running, start}`（与 `useReprocess` 同形，打 `/api/pmis/download`）。DataView 暴露 `data-test="pmis-cookie"`（文本域）、`data-test="btn-download"`（下载按钮）。

- [ ] **Step 1: 写失败测试**（在 `DataView.test.ts` 的 `describe` 内追加；并在 `beforeEach` 的 fetch stub 中确保未知 url 仍返回 `{ok:true,json:()=>({})}`——现状已是）

```ts
  it('点下载数据：cookie 非空时先 POST /api/pmis/cookie，再开 /api/pmis/download', async () => {
    const w = await mountView()
    await w.find('[data-test="pmis-cookie"]').setValue('x=1; SESSION=abc')
    await w.find('[data-test="btn-download"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/pmis/cookie'))).toBe(true)
    expect(calls.some((u: string) => u.includes('/api/pmis/download'))).toBe(true)
  })

  it('下载按钮在更新按钮左侧(DOM 顺序)', async () => {
    const w = await mountView()
    const btns = w.findAll('button').map((b) => b.text())
    const di = btns.findIndex((t) => t.includes('下载数据'))
    const ui = btns.findIndex((t) => t.includes('更新数据（重新处理）'))
    expect(di).toBeGreaterThanOrEqual(0)
    expect(ui).toBeGreaterThan(di)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: FAIL（无 `data-test="pmis-cookie"` / `btn-download`）

- [ ] **Step 3: 新建 composable** `frontend/src/composables/usePmisDownload.ts`

```ts
import { ref } from 'vue'
import { apiUrl } from '@/lib/baseUrl'

/** PMIS 在线下载流水线 SSE（/api/pmis/download），与 useReprocess 同形。 */
export function usePmisDownload(opts: { onDone?: () => void } = {}) {
  const progress = ref(0)
  const message = ref('')
  const running = ref(false)

  async function start() {
    running.value = true; progress.value = 0
    try {
      const res = await fetch(apiUrl('/api/pmis/download'))
      if (!res.ok) { message.value = `下载失败 (${res.status})`; return }
      const reader = res.body?.getReader()
      if (!reader) { message.value = '无响应体'; return }
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          const t = line.startsWith('data:') ? line.slice(5).trim() : ''
          if (!t) continue
          try {
            const s = JSON.parse(t)
            progress.value = s.progress; message.value = s.message; running.value = s.running
          } catch { /* 跳过半包 */ }
        }
      }
      opts.onDone?.()
    } finally {
      running.value = false
    }
  }
  return { progress, message, running, start }
}
```

- [ ] **Step 4: DataView.vue 脚本接线**（`<script setup>` 内）

import 区追加：

```ts
import { usePmisDownload } from '@/composables/usePmisDownload'
```

在 `const { progress: repProgress, ... } = useReprocess({...})` 附近追加：

```ts
// —— PMIS 在线下载 ——
const pmisCookie = ref('')
const cookieStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })
const cookieMsg = ref('')
const cookieErr = ref(false)
const { progress: dlProgress, message: dlMessage, running: dlRunning, start: startDownload } =
  usePmisDownload({ onDone: () => { loadFileStatus(); loadCookieStatus() } })

async function loadCookieStatus() {
  try { cookieStatus.value = await api.get('/api/pmis/cookie') } catch { /* 未登录/缺接口静默 */ }
}
async function onDownload() {
  cookieMsg.value = ''; cookieErr.value = false
  const ck = pmisCookie.value.trim()
  if (ck) {
    try {
      const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: ck })
      cookieStatus.value = { sessionPreview: r.sessionPreview, updatedAt: '刚刚' }
      pmisCookie.value = ''
    } catch (e) {
      cookieErr.value = true
      cookieMsg.value = 'Cookie 保存失败：' + (e instanceof Error ? e.message : String(e))
      return  // cookie 失败则中止,不进入下载
    }
  }
  await startDownload()
}
```

在 `onMounted(...)` 调用末尾追加 `loadCookieStatus()`：

```ts
onMounted(() => { if (!data.data) data.load(); loadFileStatus(); loadHistory(); loadManBackups(); if (!projectTags.loaded) projectTags.load(); loadCookieStatus() })
```

- [ ] **Step 5: DataView.vue 模板下载区**（把现有 `<div class="dv-grid2">` 内的「更新数据」卡——约第 167-174 行——替换为下面这张更宽的卡，并把它移出 grid2 单独成行：即在 `<div class="dv-grid2">` 之前插入新卡，grid2 内只留「设置」卡）

在 `<div class="dv-grid2">` **之前**插入：

```html
    <div class="dv-card">
      <div class="dv-card-head">数据下载 / 更新数据</div>
      <div class="dv-row dv-cookie">
        <span class="dv-label">PMIS Cookie</span>
        <textarea v-model="pmisCookie" data-test="pmis-cookie" class="dv-cookie-box" rows="2"
          placeholder="粘贴完整 cookie 串；已用 update_cookie.py --server 推送可留空"></textarea>
        <span class="dv-hint">当前 SESSION {{ cookieStatus.sessionPreview || '-' }} · 更新于 {{ cookieStatus.updatedAt || '-' }}</span>
      </div>
      <div v-if="cookieMsg" class="dv-row dv-hint" :class="cookieErr ? '' : 'ok'">{{ cookieMsg }}</div>
      <div class="dv-row">
        <button class="dv-btn" data-test="btn-download" :disabled="dlRunning || repRunning" @click="onDownload">下载数据</button>
        <button class="dv-btn primary" :disabled="repRunning || dlRunning" @click="startReprocess()">更新数据（重新处理）</button>
        <span class="dv-hint">下载：从 PMIS 抓取并覆盖 input/（只下载不更新）；更新：读取已获取数据重算看板</span>
      </div>
      <div v-if="dlRunning || dlProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: dlProgress + '%' }"></div></div><div class="dv-msg">{{ dlMessage }}</div></div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>
```

把原 `<div class="dv-grid2">` 块改为只含「设置」卡：

```html
    <div class="dv-grid2">
      <div class="dv-card">
        <div class="dv-card-head">设置</div>
        <div class="dv-row"><span class="dv-label">清空数据</span><button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button><span v-if="clearState" class="dv-hint ok">{{ clearState }}</span></div>
      </div>
    </div>
```

- [ ] **Step 6: DataView.vue 样式**（`<style scoped>` 末尾追加）

```css
.dv-cookie { align-items: flex-start; }
.dv-cookie-box { flex: 1 1 320px; min-width: 220px; font-size: var(--fs-1); font-family: var(--font-sans);
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--txt);
  padding: var(--sp-2); resize: vertical; }
```

- [ ] **Step 7: 跑测试 + typecheck 确认通过**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts && npm run typecheck`
Expected: PASS（含原有用例：「更新数据卡与设置卡保留」仍命中卡头「数据下载 / 更新数据」含子串「更新数据」与「设置」）

- [ ] **Step 8: 提交**

```bash
git add frontend/src/composables/usePmisDownload.ts frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(data): /data 下载区——PMIS cookie 文本域 + 下载按钮(更新左侧) + 独立 SSE 进度"
```

---

## Task 10: DataView 文件清单改多列网格压缩

**Files:**
- Modify: `frontend/src/views/DataView.vue`
- Test: `frontend/src/views/DataView.test.ts`

**Interfaces:**
- Produces: 文件清单两组（PMIS 九表 / 项目域）改 `.dv-fgrid` 多列网格；每格保留**完整文件名**于 DOM（视觉用 CSS 省略号 + `title` 全名）；PMIS 行保留 `data-test="pmis-row"`。

> 说明：保留完整文件名于 DOM（不去扩展名），以维持 `DataView.test.ts` 既有断言（files-card 含 `collection_stages.csv` 等全名、`payment_records.csv` mtime）；空间压缩来自**多列网格**（纵向占用降约 ⅔），视觉截断用省略号，不影响 `.text()`。这是对 spec §5.2「去扩展名短名」的细化（语义不变：减少占用、全名可得）。

- [ ] **Step 1: 追加压缩断言测试**（`DataView.test.ts` 内）

```ts
  it('文件清单为多列网格(.dv-fgrid)，PMIS 仍 9 行且保留全名', async () => {
    const w = await mountView()
    expect(w.findAll('.dv-fgrid').length).toBeGreaterThanOrEqual(2)  // PMIS + 项目域两组
    expect(w.findAll('[data-test="pmis-row"]')).toHaveLength(9)
    expect(w.find('[data-test="files-card"]').text()).toContain('collection_stages.csv')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: FAIL（无 `.dv-fgrid`）

- [ ] **Step 3: 改模板**（把「PMIS 九表」与「项目域文件」两段 `v-for` 行列表各包进一个 `.dv-fgrid`，单元格用 `.dv-fcell`）

PMIS 段（原 `<div v-for="name in PMIS_FILE_NAMES" ... class="dv-frow" data-test="pmis-row">...`）替换为：

```html
      <div class="dv-fgrid">
        <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-fcell" data-test="pmis-row" :title="name">
          <span class="dv-fname2">{{ name }}</span>
          <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
        </div>
      </div>
```

项目域段（原 `<div v-for="name in INPUT_DISPLAY_NAMES" ... class="dv-frow">...`）替换为：

```html
      <div class="dv-fgrid">
        <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-fcell" :title="name">
          <span class="dv-fname2">{{ name }}</span>
          <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
        </div>
      </div>
```

- [ ] **Step 4: 改样式**（`<style scoped>` 末尾追加；旧 `.dv-frow/.dv-fname/.dv-ftime` 可保留不删，无害）

```css
.dv-fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 2px var(--sp-4); padding: var(--sp-2) var(--sp-4); }
.dv-fcell { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); padding: 3px 0; border-bottom: 1px dashed var(--line); min-width: 0; }
.dv-fname2 { color: var(--txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dv-ftime2 { color: var(--mut); font-size: var(--fs-1); flex-shrink: 0; }
@media (max-width: 768px) { .dv-fgrid { grid-template-columns: 1fr; } }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: PASS（含原有 PMIS 九行、collection_stages、payment_records mtime 等断言）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(data): 文件清单改多列网格压缩纵向占用(全名省略号+title)"
```

---

## Task 11: 版本号、打包纳入 pmisdata、PROGRESS、整仓验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `make_deploy_zip.py`
- Modify: `PROGRESS.md`

**Interfaces:**
- Produces: `APP_VERSION='V2.1.1'`；部署 zip 含 `pmisdata/` 脚本 + `config.json` + `A.xlsx`。

- [ ] **Step 1: 版本号**（`frontend/src/version.ts`）

```ts
export const APP_VERSION = 'V2.1.1'
export const RELEASE_DATE = '2026-06-25'
```

- [ ] **Step 2: make_deploy_zip 纳入 pmisdata 白名单**（在 `TOP_DIRS`/`SKIP_DIRS` 定义之后、`added = 0` 之前插入常量；并在写入循环里追加一段）

插入常量：

```python
# pmisdata 按白名单纳入(避免打进时间戳备份目录与日志)
PMISDATA_FILES = [
    "run_pmis_pipeline.sh", "fetch_pmis_tables.py", "fetch_all_projects.py",
    "delivery_analysis.py", "update_cookie.py", "config.json", "A.xlsx",
]
```

在 `with zipfile.ZipFile(...) as z:` 块内、`for d in TOP_DIRS:` 循环之后追加：

```python
    for f in PMISDATA_FILES:
        p = os.path.join(ROOT, "pmisdata", f)
        if os.path.isfile(p):
            z.write(p, os.path.join(TOP, "pmisdata", f))
            added += 1
```

- [ ] **Step 3: 验证打包含 pmisdata**（实跑打包脚本，确认 zip 内含 pmisdata 脚本）

Run:
```bash
python make_deploy_zip.py
python -c "import zipfile,glob; z=zipfile.ZipFile(sorted(glob.glob('pmplatform-deploy-V2.1.1*.zip'))[-1]); names=z.namelist(); assert any('pmisdata/run_pmis_pipeline.sh' in n for n in names), 'missing pipeline'; assert any('pmisdata/config.json' in n for n in names), 'missing config'; print('pmisdata 已纳入')"
```
Expected: `[OK] ...zip` + `pmisdata 已纳入`

- [ ] **Step 4: 更新 PROGRESS.md**

在 `PROGRESS.md` 版本史顶部追加一条 V2.1.1 记录（简述：服务器端 PMIS 下载 + cookie 三路径 + /data 清单网格压缩 + board 排名图随排序换口径；列已知边界：下载/cookie 推送需在可访问 PMIS 的机器冒烟）。

- [ ] **Step 5: 整仓验证全绿**

Run: `bash verify.sh`
Expected: 语法/ruff/pytest/前端 typecheck+vitest+build 全 PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/version.ts make_deploy_zip.py PROGRESS.md
git commit -m "chore(release): V2.1.1(PMIS下载+cookie三路径+清单压缩+board排名图换口径) + 打包纳入 pmisdata"
```

> 注：`python make_deploy_zip.py` 产出的 `pmplatform-deploy-V2.1.1*.zip` 已被 `.gitignore` 忽略（沿用历史 deploy zip 约定），不提交。

---

## Self-Review（写计划后自查）

**1. Spec 覆盖**
- §4.1 cookie 端点 → Task 5；§4.1.3 + §4.2 下载 SSE/run_download → Task 6；§4.2 classify → Task 4；§4.3 脚本参数化 → Task 7；§4.4 三路径（粘贴框=Task 9 前端、服务器本机直写=update_cookie 现有行为保留、--server=Task 8）；§4.5 互斥/超管门 → Task 5/6；§4.6 打包 → Task 11。
- §5.1 下载区 → Task 9；§5.2 清单压缩 → Task 10。
- §6 board 换口径 → Task 1（palette）+ Task 2（映射/单系列/饼图降级）。
- §8 验证 → 各任务 TDD + Task 11 `verify.sh`。
- 全覆盖，无遗漏。

**2. 占位符扫描**：无 TBD/TODO；每个代码步骤含完整代码与确切命令/预期。

**3. 类型/命名一致性**：`classify_download_line`（Task 4 定义、Task 6 消费）一致；`download_state`/`PMIS_PIPELINE_SCRIPT`/`PMISDATA_CONFIG`（Task 5 定义、Task 6 消费）一致；`buildRankingOption(..., palette)`（Task 1 定义、Task 2 消费）一致；`usePmisDownload`（Task 9 定义并消费）一致；`pmis_config.write_session_cookie/read_session_status`（Task 3 定义、Task 5 消费）一致。
- 注意 Task 5 do_GET 引用 `handle_pmis_download`（Task 6 实现）：已在 Task 5 Step 6 注明占位策略，确保各任务独立可跑。
