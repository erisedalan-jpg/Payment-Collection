import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 白名单:确非展示用途的裸读(取 L4 选项/元信息/全库体检)。新增裸读展示数据须走 scoped-selector。
// InsightView 含 §5.1 明确的例外(:176 空态判断,读 data.data?.projects?.length 仅用于文案分支,不影响可见范围)。
const ALLOW = new Set(['AdminView.vue', 'DataView.vue', 'DataQualityView.vue', 'ActivityView.vue', 'InsightView.vue'])
const viewsDir = resolve(__dirname)

describe('防漏页守卫', () => {
  it('views 不直读 store 的展示数据字段(除白名单)', () => {
    const offenders: string[] = []
    for (const f of readdirSync(viewsDir)) {
      if (!f.endsWith('.vue') || ALLOW.has(f)) continue
      const src = readFileSync(resolve(viewsDir, f), 'utf-8')
      if (/data\.data\?\.(projects|closedProjects|paymentNodes|paymentRecords|projectMilestones|projectProfit|events)/.test(src)
          || /\bstore\.rows\b/.test(src) && f.startsWith('Opportunit')) {
        offenders.push(f)
      }
    }
    expect(offenders, `这些 view 仍裸读 store 展示数据,应改用 useScoped*: ${offenders.join(', ')}`).toEqual([])
  })
})
