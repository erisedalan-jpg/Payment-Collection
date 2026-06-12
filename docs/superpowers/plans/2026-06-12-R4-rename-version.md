# R4 产品改名 + 版本策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 产品名改「项目管理平台」（展示层）、关于页（作者=王叙潼牛逼/删数据来源行）、版本重置 V1.0.0 并将三位版本策略写入约定。Phase R 收官。

**Architecture:** 纯改名+文案+约定文档，零逻辑改动。快捷方式/.vbs/.bat/exe 文件名链**不动**（避免破坏既有桌面快捷方式与启动链，spec §5 决策延伸——server.py:1502-1557 快捷方式创建区整体保留旧名）。

**Tech Stack:** 无新依赖。分支 `feat/phase-r4-rename-version`。

## 改名位置清单（grep 实测，仅展示层）

| 文件:行 | 内容 | 处理 |
|---|---|---|
| frontend/index.html:6 | `<title>` | → 项目管理平台 |
| frontend/src/layout/AppHeader.vue:22 | 侧栏/头部标题 | → 项目管理平台 |
| frontend/src/views/AboutView.vue:29,34 | 名称+产品名称行 | → 项目管理平台 |
| frontend/src/views/AboutView.vue（作者行） | 交付中心-交付实施三部-阿童木 | → 王叙潼牛逼 |
| frontend/src/views/AboutView.vue（数据来源行） | 整行两个 div | **删除** |
| frontend/src/layout/AppHeader.test.ts:15、AboutView.test.ts:10 | 断言 | 同步 |
| server.py:1595 | 启动日志 | → 项目管理平台 |
| 停止服务.py:4,22 | docstring+print | → 项目管理平台 |
| **不动** | server.py:1502-1557（.lnk/.vbs 名与 Description）、*_启动.bat/.command、PaymentReviewApp.spec exe 名 | 文件名兼容链，随下次打包专项再议 |

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | 改名 8 处 + 关于页两改 + V1.0.0 + 测试同步 | 低（机械） | sonnet | 主循环 grep 复扫 |
| T2 | CLAUDE.md/PROGRESS 版本策略入约定 + verify + 终审（兼 Phase R 收官审） | 低 | 主循环 | opus 终审 |

---

### Task 1: 改名 + 关于页 + 版本重置（TDD：先改测试跑红）

**Files:**
- Modify: `frontend/src/views/AboutView.test.ts`、`frontend/src/layout/AppHeader.test.ts`（先改，跑红）
- Modify: `frontend/index.html:6`、`frontend/src/layout/AppHeader.vue:22`、`frontend/src/views/AboutView.vue`、`frontend/src/version.ts`
- Modify: `server.py:1595`、`停止服务.py:4,22`

- [ ] **Step 1: 改测试（跑红）**

AboutView.test.ts 的两个用例改为：

```ts
  it('版本号与发布信息', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain(APP_VERSION)
    expect(w.text()).toContain('项目管理平台')
    expect(w.text()).not.toContain('项目回款跟踪与管控平台')
  })

  it('双域功能说明,作者更新,数据来源行已删', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain('项目域')
    expect(w.text()).toContain('回款域')
    expect(w.text()).toContain('数据治理')
    expect(w.text()).toContain('王叙潼牛逼')
    expect(w.text()).not.toContain('数据来源')
  })
```

AppHeader.test.ts:15 断言改 `expect(wrapper.text()).toContain('项目管理平台')`。

Run: `cd frontend && npx vitest run src/views/AboutView.test.ts src/layout/AppHeader.test.ts` → FAIL

- [ ] **Step 2: 前端改名实现**

- index.html:6 → `<title>项目管理平台</title>`
- AppHeader.vue:22 → `<span class="title">项目管理平台</span>`
- AboutView.vue：`about-name` 与「产品名称」行值 → `项目管理平台`；「作者」行值 → `王叙潼牛逼`；删除「数据来源」k/v 两个 div（整行）
- version.ts → `export const APP_VERSION = 'V1.0.0'`（RELEASE_DATE 保持 2026-06-12）

Run 同 Step 1 → PASS；`npx vitest run` 全量确认无其他用例断言旧名（若有同步并报告）。

- [ ] **Step 3: 后端展示文案**

- server.py:1595 → `logger.info("项目管理平台 - 本地服务启动")`
- 停止服务.py:4 docstring 与 :22 print 中的旧名 → `项目管理平台`
- 确认不碰 server.py:1502-1557 快捷方式区（.lnk/.vbs 名保留旧名）

Run: `python -m pytest -q` → 209 不回归；`grep -rn "项目回款跟踪与管控平台" frontend/src frontend/index.html server.py 停止服务.py` → 仅剩 server.py 快捷方式区 6 处（预期保留）。

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src server.py 停止服务.py
git commit -m "feat(r4): 产品改名「项目管理平台」(展示层8处)+关于页作者更新/删数据来源行+版本重置 V1.0.0(快捷方式/.bat/exe 文件名链保留旧名)"
```

---

### Task 2: 版本策略入约定 + 收尾（主循环）

- [ ] **Step 1: CLAUDE.md**——第 1 节「当前版本」行改为：

```markdown
- 当前版本：**V1.0.0**（单一来源 `frontend/src/version.ts`，改版本只改此处）
- 产品名称：**项目管理平台**（2026-06-12 起；快捷方式/.bat/exe 文件名仍为旧名，随下次打包专项更名）
```

「关键约定」节版本条目改为：

```markdown
- **版本策略（2026-06-12 起）**：三位版本 `VX.Y.Z`——X（大版本）调整**须用户确认**；Y=整页级调整（新增页面/整页重设计）；Z=子页面、下钻页、页内局部调整。单一来源 `frontend/src/version.ts`。
```

- [ ] **Step 2: PROGRESS.md**——「版本（单一来源约定）」节整体替换为新策略（同上三位规则+单一来源）；头部版本 V1.0.0；「进行中」Phase R 改 R4 完成待合并、**Phase R 收官**；Handoff R4 条目（改名清单/不动清单/版本策略生效/烟雾清单：① 侧栏与浏览器标题为「项目管理平台」② 关于页作者与无数据来源行、版本 V1.0.0 ③ 启动日志新名 ④ 桌面快捷方式仍可用）。
- [ ] **Step 3**: `bash verify.sh` 全绿 → Commit `chore(r4): 版本策略入 CLAUDE.md/PROGRESS + V1.0.0 收官记录`
- [ ] **Step 4**: opus 整体终审（diff master..HEAD + **Phase R 四期收官检查**：母 spec §2-§5 全落地核对）→ finishing-a-development-branch 四选项菜单。
