// 统一标签筛选:一个多选控件,选项 = [无标签] + 启用标签,语义 OR/并集。
// 用 sentinel 值避免与真实标签"无标签"重名。各页本地态,不联动;不影响全局 filter.ts 的"按标签排除(统计)"。
export const NO_TAG_VALUE = '__NO_TAG__'

export function tagFilterOptions(activeTags: { name: string }[]): { value: string; label: string }[] {
  return [{ value: NO_TAG_VALUE, label: '无标签' }, ...activeTags.map((t) => ({ value: t.name, label: t.name }))]
}

/** selected 空→全部;否则 (选了无标签 且 项目无标签) 或 项目某标签∈selected。 */
export function tagMatch(projectTags: string[], selected: string[]): boolean {
  if (!selected.length) return true
  if (selected.includes(NO_TAG_VALUE) && projectTags.length === 0) return true
  return projectTags.some((t) => selected.includes(t))
}
