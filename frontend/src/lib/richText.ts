// 就地富文本:严格白名单净化 + 去标签。无第三方依赖,用浏览器 DOMParser。
const TAG_WHITELIST = new Set(['B', 'STRONG', 'U', 'I', 'EM', 'S', 'STRIKE', 'DEL', 'BR', 'SPAN', 'FONT'])
// 这些标签连同其文本内容一起丢弃(否则脚本正文会作为纯文本残留)
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TITLE', 'TEXTAREA', 'NOSCRIPT'])
// 颜色只允许 #hex(3-8 位) 或 rgb(整数,整数,整数);排除 url()/expression()/具名色/含引号
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pickColor(el: Element): string {
  let color = ''
  if (el.tagName === 'FONT') color = (el.getAttribute('color') || '').trim()
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(el.getAttribute('style') || '')
  if (m) color = m[1].trim()
  return COLOR_RE.test(color) ? color : ''
}

function serializeChildren(node: Node): string {
  let out = ''
  node.childNodes.forEach((c) => { out += serializeNode(c) })
  return out
}

function serializeNode(node: Node): string {
  if (node.nodeType === 3) return escapeText(node.nodeValue || '')  // 文本
  if (node.nodeType !== 1) return ''                                // 注释等一律丢
  const el = node as Element
  const tag = el.tagName
  if (DROP_WITH_CONTENT.has(tag)) return ''
  if (!TAG_WHITELIST.has(tag)) return serializeChildren(el)         // 未白名单:拆解,保留净化后子内容
  if (tag === 'BR') return '<br>'
  if (tag === 'FONT' || tag === 'SPAN') {
    const color = pickColor(el)
    const inner = serializeChildren(el)
    return color ? `<span style="color:${color}">${inner}</span>` : inner   // 无合法色 → 拆解裸 span
  }
  const lower = tag.toLowerCase()                                   // b/strong/u/i/em/s/strike/del
  return `<${lower}>${serializeChildren(el)}</${lower}>`
}

export function sanitizeRichText(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return serializeChildren(doc.body)
}

export function htmlToPlainText(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let out = ''
  const walk = (node: Node) => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += c.nodeValue || ''
      else if (c.nodeType === 1) {
        if ((c as Element).tagName === 'BR') out += '\n'
        else walk(c)
      }
    })
  }
  walk(doc.body)
  return out.trim()
}
