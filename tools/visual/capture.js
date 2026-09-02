#!/usr/bin/env node
/* 视觉验证驱动:逐页截图 + 收集 console 错误 / 未捕获异常 / 请求失败。
 *
 * ★ 为什么存在:jsdom 不绘制。本仓历史上凡是「颜色 / 高度 / 绘制 / 真实挂载时机」类
 *   缺陷,单测一次都没逮到过 —— V4.5.13 的 CSS 注释提前闭合吞掉整条 .el-button 过渡
 *   躺了一个多月(构建只警告、测试不红、产物里还 grep 得到令牌);V3.2.0 暗色 canvas
 *   配色、V2.6.14 scoped 特异性斗不赢导致红字失效,都是截图逮到的。
 *
 * ★ 刻意【不】进 verify.sh:要起服务、要登录、要真实数据,跑一轮几十秒,而那个闸门
 *   本来就有两种已知 flake。发版前手动跑 visual.sh。
 *
 * 用法(见 visual.sh,一般不直接调):
 *   VISUAL_BASE_URL=http://127.0.0.1:8099 \
 *   VISUAL_ACCOUNT=xxx VISUAL_PASSWORD=yyy \
 *   node tools/visual/capture.js [--only <name>[,<name>...]]
 *
 * 凭证只走环境变量。本仓是 public,账号密码绝不进仓库。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { matchesIgnore } = require('./ignore')   // 匹配器只此一份,契约测试也 require 它

const ROOT = path.resolve(__dirname, '..', '..')
const MANIFEST = path.join(__dirname, 'routes.json')
const BASE = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:8099'
const ACCOUNT = process.env.VISUAL_ACCOUNT || ''
const PASSWORD = process.env.VISUAL_PASSWORD || ''
const SETTLE_MS = Number(process.env.VISUAL_SETTLE_MS || 1200)

// ── Chrome 定位:环境变量优先,否则按平台探常见位置。绝不写死单一绝对路径 ──
//    (avatar-drafts/ 里那份草稿就把 C:/Program Files/... 焊死了,换台机器直接废。)
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const cands = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ],
  }[process.platform] || []
  return cands.find((p) => fs.existsSync(p)) || ''
}

function loadPuppeteer() {
  // 装在 frontend/ 下(它是 frontend 的 devDependency)。从这里 require 相对路径,
  // 不依赖 cwd —— node 的模块解析按【脚本所在目录】走,不是按 cwd。
  const p = path.join(ROOT, 'frontend', 'node_modules', 'puppeteer-core')
  if (!fs.existsSync(p)) {
    console.error('[FAIL] 找不到 puppeteer-core。先 `cd frontend && npm install`。')
    console.error('       它在 frontend/package.json 的 devDependencies 里。')
    process.exit(2)
  }
  return require(p)
}

/** 用 /api/login 换 cookie,再塞进浏览器 —— 比填表单稳(不受登录页改版影响)。 */
async function loginCookie() {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  })
  const raw = res.headers.get('set-cookie') || ''
  const kv = raw.split(';')[0]
  if (!res.ok || !kv.includes('=')) {
    throw new Error(`登录失败 HTTP ${res.status} —— 检查 VISUAL_ACCOUNT / VISUAL_PASSWORD`)
  }
  const [name, ...rest] = kv.split('=')
  return { name, value: rest.join('='), domain: new URL(BASE).hostname, path: '/' }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'))
  const ignore = manifest.ignore || []
  const onlyArg = process.argv.indexOf('--only')
  const only = onlyArg > -1 ? new Set((process.argv[onlyArg + 1] || '').split(',')) : null

  const chrome = findChrome()
  if (!chrome) {
    console.error('[FAIL] 找不到 Chrome/Edge。设 CHROME_PATH 指向浏览器可执行文件。')
    process.exit(2)
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const outDir = path.join(ROOT, 'report', 'visual', stamp)
  fs.mkdirSync(outDir, { recursive: true })

  // 目标清单:无凭证时只拍 auth=false 的页面,并【明说跳过了什么】—— 不假装拍全了
  let targets = manifest.capture.slice()
  const skippedNoAuth = []
  if (!ACCOUNT || !PASSWORD) {
    skippedNoAuth.push(...targets.filter((t) => t.auth !== false).map((t) => t.name))
    targets = targets.filter((t) => t.auth === false)
  }
  for (const p of manifest.parameterized) {
    const id = process.env[p.env]
    if (id) targets.push({ ...p, visit: p.route.replace(/:\w+/, encodeURIComponent(id)) })
    else skippedNoAuth.push(`${p.name}(未设 ${p.env})`)
  }
  if (only) targets = targets.filter((t) => only.has(t.name))

  const puppeteer = loadPuppeteer()
  console.log(`浏览器 : ${chrome}`)
  console.log(`目标   : ${BASE}`)
  console.log(`输出   : ${path.relative(ROOT, outDir)}`)
  console.log(`拍 ${targets.length} 页${skippedNoAuth.length ? `,跳过 ${skippedNoAuth.length} 页` : ''}`)
  console.log('')

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    // --no-proxy-server 是必需的:本机代理会把 127.0.0.1 也劫持掉(本仓踩过)
    args: ['--no-proxy-server', '--no-sandbox', '--disable-dev-shm-usage'],
  })

  let cookie = null
  if (ACCOUNT && PASSWORD) cookie = await loginCookie()

  const rows = []
  for (const t of targets) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })
    if (cookie) await page.setCookie(cookie)
    const bad = { consoleError: [], pageError: [], reqFailed: [] }
    // 把资源 URL 一起记下来:console 文本只有「status of 404」,不带 URL,
    // 白名单就没法按 URL 精确放行(而按「status of 404」放行会把真正缺失的
    // chunk 也一起吞掉 —— 那才是要逮的东西)。
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const u = (m.location() || {}).url || ''
      bad.consoleError.push(u ? `${m.text()} @ ${u}` : m.text())
    })
    page.on('pageerror', (e) => bad.pageError.push(String(e)))
    page.on('requestfailed', (r) => bad.reqFailed.push(`${r.url()} :: ${(r.failure() || {}).errorText}`))

    const t0 = Date.now()
    let note = ''
    try {
      await page.goto(BASE + t.visit, { waitUntil: 'networkidle2', timeout: 90000 })
      await new Promise((r) => setTimeout(r, SETTLE_MS))
      await page.screenshot({ path: path.join(outDir, `${t.name}.png`), fullPage: true })
    } catch (e) {
      note = `导航/截图失败: ${e.message.slice(0, 80)}`
    }
    // 白名单过滤:预期内的噪音不计入「问题」。理由逐条写在 routes.json 的 ignore 里。
    for (const k of ['consoleError', 'pageError', 'reqFailed']) {
      bad[k] = bad[k].filter((m) => !matchesIgnore(m, ignore))
    }
    const n = bad.consoleError.length + bad.pageError.length + bad.reqFailed.length
    rows.push({ name: t.name, title: t.title, ms: Date.now() - t0, n, bad, note })
    const flag = note ? '✗' : (n ? '!' : ' ')
    console.log(`  ${flag} ${String(t.name).padEnd(26)} ${String(rows.at(-1).ms).padStart(6)}ms  问题 ${n}${note ? '  ' + note : ''}`)
    await page.close()
  }
  await browser.close()

  fs.writeFileSync(path.join(outDir, 'report.json'),
    JSON.stringify({ base: BASE, stamp, skipped: skippedNoAuth, rows }, null, 2), 'utf-8')

  console.log('')
  const dirty = rows.filter((r) => r.n || r.note)
  if (skippedNoAuth.length) {
    console.log(`跳过(无凭证/无样例 id):${skippedNoAuth.join('、')}`)
    console.log('  设 VISUAL_ACCOUNT / VISUAL_PASSWORD 后重跑才能覆盖它们。')
  }
  if (!dirty.length) {
    console.log(`[OK] ${rows.length} 页全部拍下,零 console 错误。截图在 ${path.relative(ROOT, outDir)}`)
    console.log('     注意:零错误 ≠ 长得对。截图仍需人眼看一遍 —— 这正是它存在的理由。')
    return 0
  }
  console.log(`[!] ${dirty.length} 页有问题:`)
  for (const r of dirty) {
    console.log(`  ── ${r.name} (${r.title})`)
    if (r.note) console.log(`     ${r.note}`)
    for (const k of ['pageError', 'consoleError', 'reqFailed']) {
      for (const m of r.bad[k].slice(0, 4)) console.log(`     [${k}] ${String(m).slice(0, 150)}`)
    }
  }
  return 1
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error('[FAIL] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
