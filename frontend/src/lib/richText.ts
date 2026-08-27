// 就地富文本:严格白名单净化 + 去标签。无第三方依赖,用浏览器 DOMParser。
const TAG_WHITELIST = new Set(['B', 'STRONG', 'U', 'I', 'EM', 'S', 'STRIKE', 'DEL', 'BR', 'SPAN', 'FONT'])
// 这些标签连同其文本内容一起丢弃(否则脚本正文会作为纯文本残留)
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TITLE', 'TEXTAREA', 'NOSCRIPT'])
// 块级容器:contenteditable 里「按回车换行」由这些标签承载 —— Chrome/Edge 用 <div>(实测 Chrome 151:
// 打「第一行」回车「第二行」得到 `第一行<div>第二行</div>`),从 Word/网页粘贴则常见 <p>/<li>。
// 它们都不在白名单里,拆解时**必须补回换行载体**,否则用户敲的回车会被静默吃掉(V4.5.15 线上缺陷)。
// 载体统一用 <br>,与 server.py 蓝信归入处「换行只用 <br>」是同一条约定。
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CENTER', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR',
  'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'UL',
])
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

// 块级元素拆解后的内容。末尾那个 <br> 是浏览器给「空块 / 块的最后一行」放的占位符
// (空行的形态就是 <div><br></div>),不是用户敲的换行 —— 块之间的换行由下面 join('<br>') 负责,
// 这里不摘掉会让每个空行多算一次。
function serializeBlockInner(el: Element): string {
  const inner = serializeChildren(el)
  return inner.endsWith('<br>') ? inner.slice(0, -4) : inner
}

function serializeChildren(node: Node): string {
  const lines: string[] = []       // 每个块级子元素自成一行;连续的行内子节点合成一行
  let buf = ''
  let sawInline = false
  let sawBlock = false
  const flush = () => {
    if (!sawInline) return
    // 块与块之间的缩进/换行(粘贴来的 HTML 常带)不是内容,不算一行
    if (!(sawBlock && buf.trim() === '')) lines.push(buf)
    buf = ''
    sawInline = false
  }
  node.childNodes.forEach((c) => {
    const tag = c.nodeType === 1 ? (c as Element).tagName.toUpperCase() : ''
    // DROP_WITH_CONTENT 优先:那几个标签连内容一起丢,绝不能因为「像块级」而先被拆开
    if (tag && !DROP_WITH_CONTENT.has(tag) && BLOCK_TAGS.has(tag)) {
      sawBlock = true
      flush()
      lines.push(serializeBlockInner(c as Element))
    } else {
      sawInline = true
      buf += serializeNode(c)
    }
  })
  flush()
  return lines.join('<br>')        // 无块级子元素时 lines 至多一项,输出与拆分前逐字节一致
}

function serializeNode(node: Node): string {
  if (node.nodeType === 3) return escapeText(node.nodeValue || '')  // 文本
  if (node.nodeType !== 1) return ''                                // 注释等一律丢
  const el = node as Element
  const tag = el.tagName.toUpperCase()  // SVG/MathML 命名空间标签 tagName 保留原始大小写(如 svg script)→ 归一后才能命中大写集合
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
