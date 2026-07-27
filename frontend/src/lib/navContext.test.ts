import { describe, it, expect, vi } from 'vitest'
import { goBoard } from './navContext'

describe('goBoard', () => {
  it('push 到 /payment/board 并带 dim query', () => {
    const router = { push: vi.fn() } as any
    goBoard(router, 'orgL4')
    expect(router.push).toHaveBeenCalledWith({ path: '/payment/board', query: { dim: 'orgL4' } })
  })
})
