import { ElMessage } from 'element-plus'

/** 归档后的统一提示。五张跟进表(temp/risk/payment_key/opportunity/progress)共用,文案只此一处。
 *
 *  kept = 后端保留下来的【范围外记录】条数(L-63)。这些记录在页面上看不见(不在范围设置命中集里、
 *  或不是重点项目),因此不在归档 rows 里 —— 后端不再连带清空它们,但用户必须知道它们存在,
 *  否则「归档后表清空了、可 store 里还留着东西」会变成又一处无声的状态错位。
 *
 *  kept 恒等于全部记录数时(例如前端行结构变了、一个 key 都提不出),这条提示就是唯一的告警。 */
export function notifyArchived(kept: number): void {
  if (kept > 0) {
    ElMessage.warning(
      `已归档。另有 ${kept} 条记录不在当前范围内（页面上看不到），已原样保留 —— `
      + '未被清空，也未进入本次归档快照。',
    )
    return
  }
  ElMessage.success('已归档')
}
