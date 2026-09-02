import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { router } from './index'   // 具名导出,不是 default

// 视觉验证清单 ↔ 路由表 的契约。
//
// ★ 这条测试是「验证回路不会再断」的那个机制。2026-08-31 审查发现 backlog 里 8 条、
//   30+ 项目验欠账全写着「因 AI 无浏览器而积压」,而 puppeteer-core + 系统 Chrome
//   一直都在、单页 2.4 秒 —— 真正的问题是没有清单、没有入口,于是每发一个版本
//   就新增一批永远没人会看的欠账。
//
//   光把脚本放进仓库挡不住这件事重演:下次有人加一个页面,不加进清单,它就又
//   永远不会被目验,而且没有任何东西会提醒他。所以必须有一条测试盯着两边对齐。

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST = resolve(HERE, '../../../tools/visual/routes.json')

type Manifest = {
  capture: { route: string; visit: string; name: string; title: string; auth?: boolean }[]
  parameterized: { route: string; name: string; env: string }[]
  skip: Record<string, string>
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'))

/** 路由表里【有 component】的那些 —— 即真正能渲染出页面的。redirect 条目不算。 */
function componentRoutes(): string[] {
  return router.getRoutes()
    .filter((r) => (r.components && Object.keys(r.components).length > 0))
    .map((r) => r.path)
}

describe('视觉验证清单 ↔ 路由表', () => {
  it('自证规模:确实从路由表读到了足够多的页面', () => {
    // 没有这条,下面两条在「读到空数组」时会恒真 —— 本仓栽过的假绿形态
    // (结构守卫正则失配 → 空集合 → 断言恒成立)。
    const routes = componentRoutes()
    expect(routes.length).toBeGreaterThan(30)
    expect(routes).toContain('/projects')
    expect(routes).toContain('/payment/board')
    expect(manifest.capture.length).toBeGreaterThan(30)
  })

  it('路由表里每个可渲染页面都必须在清单里(登记 / 参数化 / 显式跳过 三选一)', () => {
    const known = new Set([
      ...manifest.capture.map((c) => c.route),
      ...manifest.parameterized.map((p) => p.route),
      ...Object.keys(manifest.skip),
    ])
    const missing = componentRoutes().filter((p) => !known.has(p))
    expect(missing, [
      '这些页面在路由表里,但视觉验证清单没登记 —— 它们将永远不会被目验。',
      '请在 tools/visual/routes.json 的 capture / parameterized 里加上,',
      '或放进 skip 并写明为什么不用拍。',
    ].join('\n')).toEqual([])
  })

  it('清单里不得有路由表已经没有的页面(防清单里躺着死路径)', () => {
    const real = new Set(componentRoutes())
    const stale = [
      ...manifest.capture.map((c) => c.route),
      ...manifest.parameterized.map((p) => p.route),
      ...Object.keys(manifest.skip),
    ].filter((p) => !real.has(p))
    expect(stale, '清单里这些路径路由表里已经没有了,删掉').toEqual([])
  })

  it('capture 的 name 唯一 —— 它是截图文件名,重名会互相覆盖', () => {
    const names = manifest.capture.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('参数化页面必须声明取样用的环境变量,而不是内置一个真实项目号', () => {
    // 项目号是真实业务数据,本仓是 public,绝不能写进清单。
    for (const p of manifest.parameterized) {
      expect(p.env, `${p.route} 没声明 env`).toBeTruthy()
      expect(JSON.stringify(p)).not.toMatch(/QAGD|WSGF|HKGJ|QABJ|XS20/)
    }
  })
})

describe('视觉验证白名单的精确度', () => {
  // ★ 白名单一宽,工具就瞎了 —— 每次都喊「有问题」会训练人忽略它,
  //   而放行太多则真缺陷混在噪音里过去。这组用例钉住两个方向都不许错。
  //   matchesIgnore 是【capture.js 实际用的那一份】,不是测试里另写的等价物。
  const { matchesIgnore } = require('../../../tools/visual/ignore.js')
  const ignore = (manifest as unknown as { ignore?: unknown[] }).ignore ?? []

  const CASES: [string, boolean, string][] = [
    ['... status of 401 (Unauthorized) @ http://127.0.0.1:8099/api/auth/me', true,
      '登录页未登录时 /api/auth/me 必然 401 —— 预期噪音'],
    ['... status of 401 (Unauthorized) @ http://127.0.0.1:8099/data/analysis_data.json', false,
      '★ 数据接口 401(权限范围 bug)必须报出来'],
    ['... status of 404 (File not found) @ http://127.0.0.1:8099/favicon.ico', true,
      '缺 favicon 是已知小缺口'],
    ['... status of 404 (File not found) @ http://127.0.0.1:8099/assets/index-abc.js', false,
      '★ 主 chunk 404 必须报出来'],
    ['TypeError: Cannot read properties of undefined', false, '★ 未捕获异常必须报出来'],
  ]

  it.each(CASES)('%s', (msg, expected, why) => {
    expect(matchesIgnore(msg, ignore), why).toBe(expected)
  })

  it('白名单条目必须写明理由 —— 不写 why 就会变成垃圾桶', () => {
    expect(ignore.length).toBeGreaterThan(0)
    for (const ig of ignore as { match?: string; why?: string }[]) {
      expect(ig.match, '缺 match').toBeTruthy()
      expect((ig.why || '').length, `${ig.match} 没写 why`).toBeGreaterThan(15)
    }
  })
})
