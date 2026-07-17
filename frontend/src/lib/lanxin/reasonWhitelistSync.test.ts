// M-6:items.test.ts 里原来的「与后端 lanxin_config.REASON_WHITELIST 逐字一致」用例,实现是把
// 同一份字面量在 TS 里再抄一遍 —— 改后端不改这份抄本,测试照样绿,防不住它自称要防的跨语言
// 两份副本漂移。这里改为真的读 lanxin_config.py 源码、正则抠出数组,与 TS 常量逐项比对。
//
// 环境注:vitest 的 jsdom environment 本身仍跑在 Node 进程里,node:fs 照样可用,不需要切换
// 到另一个测试环境(试过用 vitest 的逐文件环境覆写注释:那会让全局 vitest.setup.ts 因访问
// 不存在的 window 而在本文件炸掉)。独立成文件只是不想让这条读文件断言和纯函数用例混在一起。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function readBackendReasonWhitelist(): string[] {
  const backendPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '../../../../lanxin_config.py')
  const src = readFileSync(backendPath, 'utf-8')
  const m = src.match(/REASON_WHITELIST\s*=\s*\[([\s\S]*?)\]/)
  if (!m) {
    throw new Error('未能在 lanxin_config.py 中找到 REASON_WHITELIST 定义,请检查路径/正则是否需要更新')
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

describe('ALL_RISK_CATEGORIES 与后端 REASON_WHITELIST 同步', () => {
  it('逐项一致(真读 lanxin_config.py 源码比对,不是抄一遍字面量)', async () => {
    const { ALL_RISK_CATEGORIES } = await import('@/lib/riskReasons')
    const backendList = readBackendReasonWhitelist()
    // 防正则本身失效却误判成"一致"(比如匹配到空数组、两边都是 0 长度)
    expect(backendList.length).toBeGreaterThan(0)
    expect([...ALL_RISK_CATEGORIES]).toEqual(backendList)
  })
})
