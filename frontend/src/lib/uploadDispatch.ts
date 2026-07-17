import { PMIS_FILE_NAMES } from '@/composables/usePmisSync'
import { INPUT_FILE_NAMES } from '@/composables/useInputFiles'

/** 倚天工时域文件。它们在 INPUT_FILE_NAMES 内(后端按 INPUT_SUBDIR_MAP 落到 input/yitian/),
 *  但不属主域 —— 主域上传须排除,否则语义串域。 */
export const YITIAN_FILE_NAMES: readonly string[] = ['工时.xlsx', 'holidays.csv']

export type SkipReason = 'yitian' | 'unknown'

export interface DispatchResult {
  pmis: File[]
  inputs: File[]
  skipped: { name: string; reason: SkipReason }[]
}

/** 主域上传分发:按文件名把投放的文件分到两个既有端点,其余归 skipped(不静默丢弃)。 */
export function dispatchMainDomainFiles(files: File[]): DispatchResult {
  const r: DispatchResult = { pmis: [], inputs: [], skipped: [] }
  for (const f of files) {
    if (PMIS_FILE_NAMES.includes(f.name)) r.pmis.push(f)
    else if (YITIAN_FILE_NAMES.includes(f.name)) r.skipped.push({ name: f.name, reason: 'yitian' })
    else if (INPUT_FILE_NAMES.includes(f.name)) r.inputs.push(f)
    else r.skipped.push({ name: f.name, reason: 'unknown' })
  }
  return r
}

const SKIP_TEXT: Record<SkipReason, string> = {
  yitian: '属倚天工时域,请在「倚天工时域」卡上传',
  unknown: '不在主域白名单',
}

/** 上传反馈文案。okPmis/okInputs 是端点实际成功数(可能小于分发数——分发出的文件个个都过了
 *  白名单,分子分母之差只能是 HTTP 层失败,须显式报出,否则用户以为全成功、点更新数据后拿旧文件重算)。 */
export function formatDispatchMessage(r: DispatchResult, okPmis: number, okInputs: number): string {
  let msg = `已上传 ${okPmis} 个 PMIS 九表 + ${okInputs} 个项目域文件,请点[更新数据]生效`
  const failed = (r.pmis.length - okPmis) + (r.inputs.length - okInputs)
  if (failed > 0) msg += `;失败 ${failed} 个（服务端未接收,请重试）`
  if (r.skipped.length) {
    msg += ';已跳过:' + r.skipped.map((s) => `${s.name}（${SKIP_TEXT[s.reason]}）`).join('、')
  }
  return msg
}
