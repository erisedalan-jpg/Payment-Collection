import { describe, it, expect } from 'vitest'
import { canHandle } from './lanxinInbox'

describe('lanxinInbox', () => {
  // LTS 无归入,canHandle 只看 handled(未解析条目同样可标记——收件箱只读,不写业务数据)。
  it('已处理的条目不可再次标记', () => {
    expect(canHandle({ handled: true })).toBe(false)
  })

  it('未处理的条目可标记为已处理(无论是否解析成功)', () => {
    expect(canHandle({ handled: false })).toBe(true)
  })
})
