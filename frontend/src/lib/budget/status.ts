import type { RatioStatus } from './types'

/** 成本比例三态的文案与配色 —— 页面徽标(RatioCard)与导出 Excel(exportEstimate)的
 *  唯一真相源。原先两处各写一份"比例正常/偏低/偏高",改一处漏一处就会出现页面说
 *  「比例偏高」、Excel 里写「比例正常」的分裂。
 *
 *  cls 是「淡底 + 深字」的状态类(设计规范:禁止实底状态色配小号白字);na 不出徽标,
 *  只有导出时需要它的文案。 */
export const RATIO_STATUS: Record<RatioStatus, { text: string; cls: string }> = {
  normal: { text: '比例正常', cls: 'is-ok' },
  low: { text: '比例偏低', cls: 'is-warn' },
  high: { text: '比例偏高', cls: 'is-danger' },
  na: { text: '未判定', cls: '' },
}

export const ratioStatusText = (s: RatioStatus): string => RATIO_STATUS[s].text
