// M3 验收测试：KaTeX / mermaid / 代码高亮 / TOC / frontmatter / 图片(fs.local) / round-trip
import { readFileSync } from 'node:fs'

const sample3 = readFileSync('D:/tmp/myTypora/docs/sample3.md', 'utf8')
// 语义等价归一化（同 m6-test）：表格空白/对齐行长/列表符/转义不算内容损失
const norm = (s) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/g, '')
    .split('\n')
    .map((ln) => {
      const t = ln.trim()
      if (t.startsWith('|')) {
        const isAlign = /^:?-+:?$/.test((t.split('|').filter((c) => c.trim())[0] ?? '').trim())
        const cells = t.split('|').slice(1, -1).map((c) => {
          const cell = c.trim()
          if (isAlign && /^:?-+:?$/.test(cell)) return cell.replace(/-+/, '---')
          return ` ${cell} `
        })
        return '|' + cells.join('|') + '|'
      }
      return ln
    })
    .join('\n')
    .replace(/^(\s*)\* /gm, '$1- ')
    .replace(/\\(?=\[|\])/g, '')

const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('未找到页面目标 — 应用是否已启动？')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

function send(method, params) {
  return new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}

await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

async function evaluate(expression) {
  const resp = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (resp?.result?.exceptionDetails) {
    throw new Error('求值异常: ' + JSON.stringify(resp.result.exceptionDetails).slice(0, 500))
  }
  return resp?.result?.result?.value
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (let i = 0; i < 20 && !(await evaluate('!!window.__debug')); i++) await sleep(500)
check('调试钩子就绪', await evaluate('!!window.__debug'))

// 1. 打开扩展语法样例
await evaluate(`window.__debug.openByPath('D:/tmp/myTypora/docs/sample3.md')`)
await sleep(1500)

// 2. round-trip
const md = await evaluate('window.__debug.getMarkdown()')
const a = norm(sample3).split('\n')
const b = norm(md ?? '').split('\n')
const diffs = []
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) diffs.push(`行${i + 1}: 原=${JSON.stringify(a[i])} 新=${JSON.stringify(b[i])}`)
}
check('M3 样例 round-trip 无损', diffs.length === 0, diffs.slice(0, 6).join(' | ') || `${a.length}行全部一致`)

// 3. 渲染检查
const dom = JSON.parse(
  await evaluate(`JSON.stringify({
  mathBlockSvg: !!document.querySelector('.math-block__render svg, .math-block__render .katex'),
  mathInlineSvg: !!document.querySelector('.math-inline__render .katex'),
  mermaidSvg: !!document.querySelector('.mermaid-render svg'),
  tocWidget: !!document.querySelector('.toc-widget'),
  tocItems: document.querySelectorAll('.toc-item').length,
  frontmatter: !!document.querySelector('.frontmatter-view'),
  hljsTokens: document.querySelectorAll('.codeblock-content .hljs-keyword, .codeblock-content .hljs-title, .codeblock-content .hljs-string').length,
  tableRows: document.querySelectorAll('.mytypora-write table tr').length,
})`),
)
check('块级公式 KaTeX 渲染', dom.mathBlockSvg)
check('行内公式 KaTeX 渲染', dom.mathInlineSvg)
check('mermaid 图表渲染', dom.mermaidSvg)
check('[TOC] 目录 widget', dom.tocWidget && dom.tocItems >= 3, `${dom.tocItems} 项`)
check('front matter 块', dom.frontmatter)
check('代码语法高亮', dom.hljsTokens >= 3, `${dom.hljsTokens} 个令牌`)
check('表格渲染', dom.tableRows >= 3, `${dom.tableRows} 行`)

// 4. 图片：fs.local 映射 + 相对路径加载
await evaluate(`window.chrome.webview.postMessage({ id: 71001, method: 'window:mapFs', params: { path: 'D:/tmp/myTypora/docs' } })`)
await sleep(300)
await evaluate(`window.__debug.openByPath('D:/tmp/myTypora/docs/sample3-img.md')`)
await sleep(1200)
const img = JSON.parse(
  await evaluate(`(() => {
    const im = document.querySelector('.md-img')
    return JSON.stringify({ found: !!im, loaded: im ? im.naturalWidth > 0 : false, src: im?.src ?? '' })
  })()`),
)
check('相对路径图片加载 (fs.local)', img.found && img.loaded, img.src.slice(0, 80))

// 5. file:writeBase64（粘贴图片的存储链路）
const w64 = JSON.parse(
  await evaluate(`(async () => {
    const wv = window.chrome.webview
    return await new Promise((res) => {
      const h = (ev) => { const d = ev.data; if (d && d.id === 71002) { wv.removeEventListener('message', h); res(JSON.stringify(d)) } }
      wv.addEventListener('message', h)
      wv.postMessage({ id: 71002, method: 'file:writeBase64', params: { dir: 'D:/tmp/myTypora/docs/assets', name: 'paste-test.png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR4nGP8z8Dwn4GBgYGRgYGBAQAkBgPKHh1mVAAAAABJRU5ErkJggg==' } })
    })
  })()`),
)
check('file:writeBase64 存图', w64.ok === true, JSON.stringify(w64).slice(0, 140))

// 6. 源码模式往返（确保 sample3 为活动标签）
await evaluate(`window.__debug.openByPath('D:/tmp/myTypora/docs/sample3.md')`)
await sleep(800)
await evaluate(`window.__debug.toggleMode()`)
await sleep(600)
const src = await evaluate('window.__debug.getMarkdown()')
check('源码模式文本一致', norm(src) === norm(sample3))
await evaluate(`window.__debug.toggleMode()`)
await sleep(1000)

ws.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
