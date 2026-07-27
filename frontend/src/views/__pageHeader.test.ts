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

  it('页面组件里不得出现 hideFilter(它是 router meta,不属于 view)', () => {
    for (const f of allViews()) {
      expect(read(f), `${f} 不应引用 hideFilter`).not.toContain('hideFilter')
    }
  })
})
