import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

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

  it('hideFilter 页面不得引用 usePaymentFilterStore(回款域筛选不外泄)', () => {
    // V4.4.8 那条「不得新增对 useFilterStore 的引用」的冻结基线,到 V4.5.3(第三期)到期,升级为结构守卫。
    // 以 router/index.ts 为单一来源解析,不维护手工白名单 —— 今后新增的 hideFilter 页面自动纳入。
    // 看得见 FilterBar 的页面才准读回款域筛选;看不见却读得到,就是「数据被筛过、用户无从察觉」
    // (V4.5.3 修的首页「年度回款进度」即此:文案写死"年度",数值却跟着 /payment 的区间走)。
    const routerSrc = readFileSync(resolve(viewsDir, '../router/index.ts'), 'utf-8')
    const hidden: string[] = []
    // 按 `{ path:` 切块 —— 每块即一条路由(单行或跨行皆可),块内同时出现 hideFilter 才算数
    for (const block of routerSrc.split(/\{\s*path:/).slice(1)) {
      if (!block.includes('hideFilter: true')) continue
      const m = block.match(/component:\s*([A-Za-z0-9_]+)/)
        ?? block.match(/import\('@\/views\/([A-Za-z0-9_]+)\.vue'\)/)
      if (m) hidden.push(m[1])
    }
    // 自证:正则一旦失配会返回空数组,下面的循环空跑、"零个文件违规"恒真通过(本仓最常见的假绿形态)。
    // 故先钉住解析结果规模 —— 当前 26 条 hideFilter 路由。
    expect(hidden.length, 'router 解析失配:hideFilter 路由数异常').toBeGreaterThan(20)
    for (const name of hidden) {
      const file = `${name}.vue`
      if (!allViews().includes(file)) continue
      expect(read(file), `${file} 是 hideFilter 页面,不得引用 usePaymentFilterStore`)
        .not.toContain('usePaymentFilterStore')
    }
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

  it('不得自行手写 <hN> 标题标签(标题由 SectionTitle / PageHeader 唯一实现)', () => {
    // 上一条只断言「用 SectionTitle 的文件数 >= 20」这个【下界】——
    // 新页面直接手写 <h3> 不会让任何数字下降,一条测试都不会红。
    // 这一条补上负向面:全仓扫 <h1>~<h6> 的直接使用,不在豁免清单里就是违规。
    // 只扫模板(剥掉 <script>/<style>),避免 CSS 里的 `h4 {}` 选择器与脚本字符串误报。
    const srcRoot = resolve(viewsDir, '..')
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.omc' || e.name === 'node_modules') continue
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (e.name.endsWith('.vue')) out.push(p)
      }
      return out
    }
    const files = walk(srcRoot)
    const template = (f: string) => readFileSync(f, 'utf-8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    const relOf = (f: string) => f.slice(srcRoot.length + 1).replace(/\\/g, '/')

    // 豁免清单:每一条都要有理由。分两类 ——
    // 【A 类·结构性豁免】标题组件自身,以及 spec 明确不归 SectionTitle 管的页头/页名。
    // 【B 类·存量欠账】卡内三级小节标题。规范只定义了两级(card / section),
    //   这些是第三级,SectionTitle 目前无对应 level;spec §12.3「现有页面不迁移」故不算违规。
    //   今后 SectionTitle 若补了三级 level,应逐个迁移并把条目从这里删掉。
    const ALLOW: Record<string, string> = {
      'components/SectionTitle.vue': 'A:标题组件自身的 <h3 class="st">',
      'components/PageHeader.vue': 'A:页头唯一实现,spec 明确页头标题不属于两级标题体系',
      'components/PageStub.vue': 'A:占位页,不走 AppLayout',
      'views/LoginView.vue': 'A:全屏页,无侧栏无布局无 PageHeader',
      'views/ChangePasswordView.vue': 'A:全屏页,同上',
      'views/ProjectDetailView.vue': 'A:<h2 class="pd-name"> 是项目名,上一条 KEEP 清单已裁定语义不是标题',
      'views/ClosedProjectDetailView.vue': 'A:<h2 class="cd-name"> 同上',
      'components/budget/DirectCostSection.vue': 'B:卡内三级小节(差补/住宿/交通),卡标题已用 SectionTitle',
      'components/budget/ProductSection.vue': 'B:卡内三级小节(标准实施/非标实施/工作内容)',
      'components/budget/PmSection.vue': 'B:卡内三级小节(小结)',
      'components/budget/RateReferenceCard.vue': 'B:卡内三级小节(四张费率表各自的表名)',
      'components/YitianRulesCard.vue': 'B:卡内三级小节,且 <h4> 内嵌了 el-switch,SectionTitle 无该插槽位',
    }

    const HEADING = /<h[1-6][\s>]/
    const offenders = files.filter((f) => HEADING.test(template(f))).map(relOf)
    for (const f of offenders) {
      expect(ALLOW[f], `${f} 手写了 <hN> 标题。卡片/小节标题请用 <SectionTitle level="card|section">;` +
        '确有理由手写(全屏页/组件自身/非标题语义)就把它加进本测试的 ALLOW 清单并写明理由').toBeTruthy()
    }

    // 自证 ①:扫描规模。路径失配/模板剥离写坏会让 files 或 offenders 退化成空集合,
    // 上面的循环空跑、「零处违规」恒真通过(本仓 V4.5.3 踩过的第五种假绿)。
    expect(files.length, '.vue 扫描数异常(实测 134)').toBeGreaterThan(120)
    expect(offenders.length, '手写 <hN> 的文件数异常(实测 12)').toBeGreaterThan(8)

    // 自证 ②:豁免清单不得腐烂。某文件的标题已经迁走了,条目却留着,
    // 就会一直替一个不存在的违规兜底 —— 下次真有人在该文件手写标题时不会红。
    // 这条同时是扫描是否生效的第二重保险:扫不出任何 heading 时它会全部失败。
    for (const f of Object.keys(ALLOW)) {
      expect(offenders, `${f} 已不含手写 <hN>,请把它从 ALLOW 清单里删掉`).toContain(f)
    }
  })

  it('页面组件里不得出现 hideFilter(它是 router meta,不属于 view)', () => {
    for (const f of allViews()) {
      expect(read(f), `${f} 不应引用 hideFilter`).not.toContain('hideFilter')
    }
  })
})
