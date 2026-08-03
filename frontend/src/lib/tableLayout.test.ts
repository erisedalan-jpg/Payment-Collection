import { describe, it, expect } from 'vitest'
import { DETAIL_TABLE_MAX_H, DIALOG_TABLE_MIN_H, dialogTableMaxHeight } from './tableLayout'

describe('dialogTableMaxHeight（弹窗内表格口径，L-64）', () => {
  it('按视口高度算，绝不复用页面内表格的 640', () => {
    // 弹窗的可用高度与「表格在页面里的位置」无关,只与视口和 dialog 自身的 chrome 有关,
    // 所以这条口径必须独立于 DETAIL_TABLE_MAX_H —— 640 在矮屏上加 dialog chrome 必然溢出。
    expect(dialogTableMaxHeight(950)).toBe(648)
    expect(dialogTableMaxHeight(950)).not.toBe(DETAIL_TABLE_MAX_H)
  })

  it('1366×768 笔记本（innerHeight 实测 620~660）上明显收窄，表体加 dialog chrome 仍在视口内', () => {
    const h = dialogTableMaxHeight(640)
    expect(h).toBe(384)
    expect(h + Math.round(640 * 0.15) + 54 + 40).toBeLessThan(640)
  })

  it('极矮视口退到地板，不会算出负数或几十像素的残表', () => {
    expect(dialogTableMaxHeight(300)).toBe(DIALOG_TABLE_MIN_H)
    expect(dialogTableMaxHeight(0)).toBe(DIALOG_TABLE_MIN_H)
  })

  it('不传参时读 window.innerHeight', () => {
    expect(dialogTableMaxHeight()).toBe(dialogTableMaxHeight(window.innerHeight))
  })
})

describe('DETAIL_TABLE_MAX_H', () => {
  // 【为什么单独钉这个数】三个 tab 的测试断言的是 `toBe(DETAIL_TABLE_MAX_H)`,
  // 常量和断言会一起移动 —— 只有这条把字面量 640 钉死,改常量才有测试变红。
  it('值为 640(≈15 行:表头 41 + 行高 41,(640-41)/41≈14.6),视口适配性见 tableLayout.ts 注释,不在此断言', () => {
    expect(DETAIL_TABLE_MAX_H).toBe(640)
  })
})
