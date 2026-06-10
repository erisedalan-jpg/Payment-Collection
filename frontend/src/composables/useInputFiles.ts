export const INPUT_FILE_NAMES = ['组织架构.xlsx', 'A.xlsx', 'delivery_analysis.xlsx']

/** 项目主域三输入文件上传(组织架构/项目映射/预算核算)。白名单外文件跳过。 */
export function useInputFiles() {
  async function upload(files: File[]): Promise<number> {
    let ok = 0
    for (const f of files) {
      if (!INPUT_FILE_NAMES.includes(f.name)) continue
      const buf = await f.arrayBuffer()
      const res = await fetch('/api/inputs/upload?name=' + encodeURIComponent(f.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
      })
      if (res.ok) ok++
    }
    return ok
  }
  return { upload, INPUT_FILE_NAMES }
}
