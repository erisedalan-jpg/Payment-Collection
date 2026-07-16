// 把以 / 开头的绝对路径(/api、/data 等)挂到 Vite base 下,支持 /pm 路径前缀部署。
// base 形如 '/'(默认/开发) 或 '/pm/'(--base=/pm/ 构建)。默认 '/' 时原样返回,向后兼容。
export function joinBase(base: string, path: string): string {
  return (base || '/').replace(/\/$/, '') + path
}
export function apiUrl(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path)
}
