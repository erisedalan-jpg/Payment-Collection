import { describe, it, expect } from 'vitest'
import { sanitizeRichText, htmlToPlainText } from './richText'

describe('sanitizeRichText 白名单', () => {
  it('空/非串 → 空', () => {
    expect(sanitizeRichText('')).toBe('')
    expect(sanitizeRichText(null as unknown as string)).toBe('')
  })
  it('保留格式标签', () => {
    expect(sanitizeRichText('<b>粗</b>')).toBe('<b>粗</b>')
    expect(sanitizeRichText('<strong>a</strong>')).toBe('<strong>a</strong>')
    expect(sanitizeRichText('<u>x</u>')).toBe('<u>x</u>')
    expect(sanitizeRichText('<s>x</s>')).toBe('<s>x</s>')
    expect(sanitizeRichText('<i>x</i>')).toBe('<i>x</i>')
    expect(sanitizeRichText('<em>x</em>')).toBe('<em>x</em>')
    expect(sanitizeRichText('<br>')).toBe('<br>')
    expect(sanitizeRichText('<b><u>x</u></b>')).toBe('<b><u>x</u></b>')
  })
  it('颜色:合法 hex/rgb 保留,非法丢弃', () => {
    expect(sanitizeRichText('<span style="color:#f00">红</span>')).toBe('<span style="color:#f00">红</span>')
    expect(sanitizeRichText('<span style="color:rgb(1,2,3)">x</span>')).toBe('<span style="color:rgb(1,2,3)">x</span>')
    expect(sanitizeRichText('<span style="color:red">x</span>')).toBe('x')                 // 具名色不在正则内 → 丢色 → 裸 span 拆解
    expect(sanitizeRichText('<span style="color:expression(alert(1))">x</span>')).toBe('x') // 拦 expression
    expect(sanitizeRichText('<span style="color:#f00;background:url(x)">x</span>')).toBe('<span style="color:#f00">x</span>') // 只取 color
  })
  it('font[color] 归一化为 span', () => {
    expect(sanitizeRichText('<font color="#00f">蓝</font>')).toBe('<span style="color:#00f">蓝</span>')
  })
  it('XSS 向量被中和', () => {
    expect(sanitizeRichText('<script>alert(1)</script>')).toBe('')                 // script 连内容一起丢
    expect(sanitizeRichText('<img src=x onerror=alert(1)>')).toBe('')             // img 无子节点 → 空
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe('x')     // a 拆解,保留文字
    expect(sanitizeRichText('<b onclick="evil()">x</b>')).toBe('<b>x</b>')        // 属性全删
    expect(sanitizeRichText('<div><b>x</b></div>')).toBe('<b>x</b>')              // 未白名单容器拆解,保留内层格式
  })
  it('文本节点转义', () => {
    expect(sanitizeRichText('A & B')).toBe('A &amp; B')
    expect(sanitizeRichText('纯文本')).toBe('纯文本')
  })
  it('SVG 命名空间 script 也被丢弃(命名空间大小写归一)', () => {
    expect(sanitizeRichText('<svg><script>alert(1)</script></svg>')).toBe('')
  })
})

// 输入串全部取自真实 Chrome 151 在 contenteditable 里实测产出的 innerHTML(见 PROGRESS.md V4.5.15)。
// 浏览器用块级容器承载「按回车换行」——Chrome/Edge 用 <div>,粘贴自 Word/网页则常见 <p>/<li>。
// 这些标签不在白名单里会被拆解,拆解时**必须补回换行载体 <br>**,否则用户敲的回车被静默吃掉。
describe('sanitizeRichText 块级容器换行', () => {
  it('Enter 产生的 <div> 新行 → <br>', () => {
    expect(sanitizeRichText('第一行<div>第二行</div>')).toBe('第一行<br>第二行')
  })
  it('连按两次 Enter 的空行:不丢也不多(块内占位 <br> 不重复计)', () => {
    expect(sanitizeRichText('第一行<div><br></div><div>第三行</div>')).toBe('第一行<br><br>第三行')
  })
  it('开头的空行保留', () => {
    expect(sanitizeRichText('<div><br></div><div>第三行</div>')).toBe('<br>第三行')
  })
  it('粘贴自网页的 <p> 段落 → <br>', () => {
    expect(sanitizeRichText('<p>第一段</p><p>第二段</p>')).toBe('第一段<br>第二段')
  })
  it('块与块之间的缩进空白不算一行', () => {
    expect(sanitizeRichText(`<p>a</p>
  <p>b</p>`)).toBe('a<br>b')
  })
  it('列表每项一行', () => {
    expect(sanitizeRichText('<ul><li>a</li><li>b</li></ul>')).toBe('a<br>b')
  })
  it('嵌套块只算一次换行', () => {
    expect(sanitizeRichText('a<div><div>b</div></div>')).toBe('a<br>b')
  })
  it('单个块不凭空多出换行(现有契约不变)', () => {
    expect(sanitizeRichText('<div><b>x</b></div>')).toBe('<b>x</b>')
  })
  it('块内格式与块外 <br> 混排', () => {
    expect(sanitizeRichText('第一行<br><b>第二行</b><div><b>第三行</b></div>'))
      .toBe('第一行<br><b>第二行</b><br><b>第三行</b>')
  })
  it('在中间行按回车(块内含 <br>)', () => {
    expect(sanitizeRichText('第一行<div>插入行<br>第二行</div>')).toBe('第一行<br>插入行<br>第二行')
  })
  it('已扁平化的内容再编辑,往返稳定(幂等)', () => {
    const once = sanitizeRichText('第一行<br>第二行<div>第三行</div>')
    expect(once).toBe('第一行<br>第二行<br>第三行')
    expect(sanitizeRichText(once)).toBe(once)
  })
  it('拆解块级容器不会复活其中的脚本', () => {
    expect(sanitizeRichText('<div><script>alert(1)</script></div>')).toBe('')
    expect(sanitizeRichText('a<div><script>alert(1)</script></div>')).toBe('a<br>')
  })
})

describe('htmlToPlainText 去标签', () => {
  it('空 → 空', () => { expect(htmlToPlainText('')).toBe('') })
  it('去标签取文字', () => {
    expect(htmlToPlainText('<b>粗</b>体')).toBe('粗体')
    expect(htmlToPlainText('<span style="color:#f00">红</span>字')).toBe('红字')
  })
  it('<br> → 换行', () => { expect(htmlToPlainText('a<br>b')).toBe('a\nb') })
  it('trim + 纯文本原样', () => {
    expect(htmlToPlainText('  x  ')).toBe('x')
    expect(htmlToPlainText('纯文本')).toBe('纯文本')
  })
})
