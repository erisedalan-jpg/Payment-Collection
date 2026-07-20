import { describe, it, expect } from 'vitest'
import { HANDLE_DOMAINS, needsInstance, canHandle } from './lanxinInbox'

describe('lanxinInbox', () => {
  it('四个归入目标域与后端一致', () => {
    expect(HANDLE_DOMAINS.map((d) => d.value).sort())
      .toEqual(['payment_key', 'progress', 'risk', 'temp'])
  })

  it('只有 temp 域需要选实例', () => {
    expect(needsInstance('temp')).toBe(true)
    expect(needsInstance('risk')).toBe(false)
    expect(needsInstance('progress')).toBe(false)
  })

  it('已归入的条目不可再次归入', () => {
    expect(canHandle({ handled: true, status: 'parsed' } as never)).toBe(false)
  })

  it('未解析的条目不可归入', () => {
    // 看不懂的东西不许往业务数据里写
    expect(canHandle({ handled: false, status: 'unparsed' } as never)).toBe(false)
  })

  it('已解析且未归入的条目可归入', () => {
    expect(canHandle({ handled: false, status: 'parsed' } as never)).toBe(true)
  })
})
