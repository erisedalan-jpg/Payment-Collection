import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// V4.4.8 页头与视图状态的全局守卫。三条都是【源码扫描】而非渲染断言 ——
// 它们防的是「今后有人顺手改一下」而单页测试察觉不到的整体性破坏。
const viewsDir = resolve(__dirname)
const read = (f: string) => readFileSync(resolve(viewsDir, f), 'utf-8')
const allViews = () => readdirSync(viewsDir).filter((x) => x.endsWith('.vue'))

describe('V4.4.8 页头与视图状态全局守卫', () => {
  it('豁免的五类页面不得出现 PageHeader', () => {
    // 首页是 landing page(点进来就知道是首页,加标题纯冗余);两个详情页标题是动态的(项目名)
    // 且需返回按钮,属另一种页头模式,本期不做;两个全屏页无侧栏无布局。
    // 防今后有人「补齐遗漏」把它们一并加上,破坏 spec B2.1 的判断。
    for (const f of ['OverviewView.vue', 'ProjectDetailView.vue', 'ClosedProjectDetailView.vue',
                     'LoginView.vue', 'ChangePasswordView.vue']) {
      expect(read(f), `${f} 属豁免页面,不应有 PageHeader`).not.toContain('PageHeader')
    }
  })

  it('usePersistedRefs 的参数里不得出现 modal / DOM 引用 / 分页页码', () => {
    // 存了 drillOpen:true 会让下次进页面弹出一个空 modal;HTMLElement 无法序列化;
    // currentPage 会让人「回来还停在第 5 页」且数据量变化后可能越界。
    // 正则用 [^)]*? 不跨右括号 —— 故调用之前的注释里出现这些词不会误报。
    const BAN = /usePersistedRefs\([^)]*?\b(drill\w*|status(Open|Title|Rows)|detailCardRef|currentPage)\b/s
    for (const f of allViews()) {
      expect(BAN.test(read(f)), `${f} 把禁传状态传进了 usePersistedRefs`).toBe(false)
    }
  })

  it('不得新增对 useFilterStore 的引用(全局单例筛选状态属第三期)', () => {
    // 白名单是 V4.4.8 之前就存在的 7 处既有引用,本期一行未动。
    // 第三期才会拆掉全局单例 filterStore;在那之前新增引用会让第三期的迁移面继续扩大。
    const BASELINE = ['BoardView.vue', 'CalendarView.vue', 'CostDetailView.vue', 'MilestoneView.vue',
                      'OverviewView.vue', 'PayNodesView.vue', 'PayProjectsView.vue']
    const actual = allViews().filter((f) => read(f).includes('useFilterStore')).sort()
    expect(actual).toEqual([...BASELINE].sort())
  })

  it('V4.4.9 三组件已广泛接入,且本期迁移过的旧类名未复活', () => {
    // 正向断言使用广度,而非负向禁止所有 -empty/-btn 模式 —— 后者会误伤大量【本期范围外】
    // 的卡内局部空态(如 PivotTable 的 .pv-empty、BoardView 的 .bv-empty)与组件内部按钮。
    const comps = resolve(viewsDir, '../components')
    const countUsers = (tag: string) =>
      [viewsDir, comps].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.vue'))
        .filter((f) => readFileSync(resolve(d, f), 'utf-8').includes(`<${tag}`))).length
    expect(countUsers('AppEmpty'), 'AppEmpty 接入数下降,可能有人改回自写空态').toBeGreaterThanOrEqual(11)
    expect(countUsers('AppPager'), 'AppPager 接入数下降').toBeGreaterThanOrEqual(14)
    expect(countUsers('AppButton'), 'AppButton 接入数下降').toBeGreaterThanOrEqual(11)

    // 本期删除的类名(按 文件:类名 精确配对,避免与他处同名类混淆)不得复活
    const GONE: [string, string][] = [
      ['ProjectsView.vue', 'pv-empty'], ['ClosedProjectsView.vue', 'cv-empty'],
      ['CostDetailView.vue', 'cd-btn'], ['YitianComplianceView.vue', 'yt-pager'],
      ['PayNodesView.vue', 'pv-btn'], ['PayProjectsView.vue', 'pov-btn'],
    ]
    for (const [f, cls] of GONE) {
      const src = readFileSync(resolve(viewsDir, f), 'utf-8')
      expect(new RegExp(`^\\.${cls}\\s*[,{]`, 'm').test(src), `${f} 的 .${cls} 复活了`).toBe(false)
    }
  })

  it('7 处次级按钮必须用 subtle 变体(灰底 12px),不得退回 default', () => {
    // 初版 AppButton 只有一种取值,导致这 7 处被误换成白底 14px 主色按钮,
    // 且当时的契约只断言 radius/padding/background 三项,【没有一条测试变红】。
    const comps = resolve(viewsDir, '../components')
    const SUBTLE: [string, string][] = [
      [viewsDir, 'CostDetailView.vue'], [viewsDir, 'PayNodesView.vue'], [viewsDir, 'PayProjectsView.vue'],
      [comps, 'MilestoneDelayedTab.vue'], [comps, 'MilestonePlanTab.vue'],
      [comps, 'MilestoneReminderTab.vue'], [comps, 'NoStageProjectsTable.vue'],
    ].map(([d, f]) => [d, f] as [string, string])
    for (const [d, f] of SUBTLE) {
      const src = readFileSync(resolve(d, f), 'utf-8')
      const uses = src.match(/<AppButton[^>]*/g) ?? []
      expect(uses.length, `${f} 没有 AppButton`).toBeGreaterThan(0)
      for (const u of uses) {
        expect(u, `${f} 的 AppButton 缺 variant="subtle"`).toContain('variant="subtle"')
      }
    }
  })

  it('V4.5.0 AppCard 已广泛接入,且 16 处非目标未被误套', () => {
    const comps = resolve(viewsDir, '../components')
    const dirs = [viewsDir, comps, resolve(comps, 'budget')]
    const users = dirs.flatMap((d) => {
      try {
        return readdirSync(d).filter((f) => f.endsWith('.vue'))
          .filter((f) => readFileSync(resolve(d, f), 'utf-8').includes('<AppCard'))
      } catch { return [] }
    }).length
    expect(users, 'AppCard 接入数下降,可能有人改回自写卡片').toBeGreaterThanOrEqual(30)

    // 非目标必须仍是自写样式 —— 它们满足「background+border+radius」但语义上不是内容容器
    // (交互控件/按钮/列表项/表单内部件/登录页表单),套 AppCard 是错的。
    const KEEP: [string, string, string][] = [
      [comps, 'SegToggle.vue', 'seg'], [comps, 'ChartTypeSelector.vue', 'cts'],
      [comps, 'ProjectDetailDrawer.vue', 'pd-cell'], [comps, 'FollowupRecords.vue', 'fr-record'],
      [comps, 'TodoQueue.vue', 'tq-count'], [viewsDir, 'ActivityView.vue', 'av-export'],
      [viewsDir, 'RiskBoardView.vue', 'rv-chart-item'],
      [viewsDir, 'LoginView.vue', 'lv-form'], [viewsDir, 'ChangePasswordView.vue', 'cpw-form'],
    ]
    for (const [d, f, cls] of KEEP) {
      expect(new RegExp(`^\\.${cls}\\s*[,{]`, 'm').test(readFileSync(resolve(d, f), 'utf-8')),
        `${f} 的 .${cls} 属非目标,不应被 AppCard 取代`).toBe(true)
    }

    // 本期迁移掉的卡片类【不得再含外观属性】。注意判据不是「类名消失」——
    // 按迁移铁律③,带 flex/min-width 等布局属性的卡片类要保留下来与 AppCard 并存
    // (如 <AppCard variant="flat" class="rv-card">),此时类名仍在但只剩布局。
    // 按「文件:类名」精确配对,避免同名类混淆(CalendarView.cd-card 归 inset
    // 而 CostDetailView.cd-card 归 flat)。
    const NO_SKIN: [string, string, string][] = [
      [viewsDir, 'BoardView.vue', 'bv-card'], [viewsDir, 'InsightView.vue', 'iv-card'],
      [viewsDir, 'RiskBoardView.vue', 'rv-card'], [viewsDir, 'OverviewView.vue', 'ov-acard'],
      [comps, 'MetricGrid.vue', 'mg-card'],
    ]
    for (const [d, f, cls] of NO_SKIN) {
      const m = readFileSync(resolve(d, f), 'utf-8').match(new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, 'm'))
      if (!m) continue                       // 类整条删除也是合格结果
      const body = m[1]
      for (const skin of ['background', 'border-radius', 'box-shadow']) {
        expect(body.includes(skin), `${f} 的 .${cls} 仍带 ${skin},外观未收归 AppCard`).toBe(false)
      }
    }
  })

  it('V4.5.1 SectionTitle 已接入,标题类不再自带字号字重,且非标题语义未被误纳入', () => {
    const comps = resolve(viewsDir, '../components')
    const dirs = [viewsDir, comps, resolve(comps, 'budget')]
    const users = dirs.flatMap((d) => {
      try {
        return readdirSync(d).filter((f) => f.endsWith('.vue'))
          .filter((f) => readFileSync(resolve(d, f), 'utf-8').includes('<SectionTitle'))
      } catch { return [] }
    }).length
    expect(users, 'SectionTitle 接入数下降').toBeGreaterThanOrEqual(20)

    // 判据是「不再自带字号字重」而非「类名消失」—— 按铁律②,带 margin 等布局属性的
    // 标题类要保留下来与组件并存(如 <SectionTitle class="yt-h">),此时类名仍在。
    const NO_FONT: [string, string, string][] = [
      [viewsDir, 'YitianOverviewView.vue', 'yt-h'], [viewsDir, 'DataQualityView.vue', 'gov-h'],
      [viewsDir, 'RiskBoardView.vue', 'rv-h3'], [comps, 'OrgRanking.vue', 'or-title'],
    ]
    for (const [d, f, cls] of NO_FONT) {
      const m = readFileSync(resolve(d, f), 'utf-8').match(new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, 'm'))
      if (!m) continue                      // 整条删除也是合格结果
      for (const k of ['font-size', 'font-weight']) {
        expect(m[1].includes(k), `${f} 的 .${cls} 仍自带 ${k},未收归 SectionTitle`).toBe(false)
      }
    }

    // 这些字号字重与标题相同、但【语义不是标题】(数值显示/名称字段/图标首字母/页头),
    // 必须仍是自写样式 —— 误套 SectionTitle 是本期最容易犯的错。
    const KEEP: [string, string, string][] = [
      [viewsDir, 'OverviewView.vue', 'ov-acard-count'], [viewsDir, 'ProjectDetailView.vue', 'pd-metric-v'],
      [viewsDir, 'ProjectDetailView.vue', 'pd-name'], [comps, 'TodoQueue.vue', 'tq-count-v'],
      [comps, 'PortalLaunchpad.vue', 'pl-initial'], [comps, 'PageHeader.vue', 'ph-title'],
    ]
    for (const [d, f, cls] of KEEP) {
      expect(new RegExp(`^\\.${cls}\\s*[,{]`, 'm').test(readFileSync(resolve(d, f), 'utf-8')),
        `${f} 的 .${cls} 语义不是标题,不应被 SectionTitle 取代`).toBe(true)
    }
  })

  it('页面组件里不得出现 hideFilter(它是 router meta,不属于 view)', () => {
    for (const f of allViews()) {
      expect(read(f), `${f} 不应引用 hideFilter`).not.toContain('hideFilter')
    }
  })
})
