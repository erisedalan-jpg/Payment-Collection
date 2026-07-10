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
