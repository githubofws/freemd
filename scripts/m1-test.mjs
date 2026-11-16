// M1 验收测试：通过 CDP 驱动编辑器做 round-trip 无损校验
// 用法: node scripts/m1-test.mjs
import { readFileSync } from 'node:fs'

const sample = readFileSync(new URL('../docs/sample.md', import.meta.url), 'utf8')
// 语义等价归一化：remark 序列化风格差异（表格空白压缩/列表符/转义）不算内容损失
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
    throw new Error('求值异常: ' + JSON.stringify(resp.result.exceptionDetails).slice(0, 400))
  }
  return resp?.result?.result?.value
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// 0. 页面就绪 & 调试钩子
for (let i = 0; i < 20 && !(await evaluate('!!window.__debug')); i++) {
  await new Promise((r) => setTimeout(r, 500))
}
check('调试钩子就绪', await evaluate('!!window.__debug'))

// 1. WYSIWYG round-trip
await evaluate(`window.__debug.loadText(${JSON.stringify(sample)})`)
await new Promise((r) => setTimeout(r, 800))
const md1 = await evaluate('window.__debug.getMarkdown()')
check('WYSIWYG round-trip 文本一致', norm(md1) === norm(sample), `长度 ${sample.length} → ${md1?.length}`)

// 2. 切到源码模式，再切回，round-trip
await evaluate('window.__debug.toggleMode()')
await new Promise((r) => setTimeout(r, 500))
check('源码模式生效', (await evaluate('window.__debug.mode()')) === 'source')
const mdSource = await evaluate('window.__debug.getMarkdown()')
check('源码模式文本一致', norm(mdSource) === norm(sample))

await evaluate('window.__debug.toggleMode()')
await new Promise((r) => setTimeout(r, 800))
check('切回所见即所得', (await evaluate('window.__debug.mode()')) === 'wysiwyg')
const md2 = await evaluate('window.__debug.getMarkdown()')
check('双次 round-trip 稳定', norm(md2) === norm(md1))

// 3. 状态栏
const st = await evaluate('JSON.stringify(window.__debug.status())')
const s = JSON.parse(st)
check('字数统计合理', s.words > 20, JSON.stringify(s))

if (norm(md1) !== norm(sample)) {
  console.log('\n--- WYSIWYG 序列化 diff（原始 → 序列化）---')
  const a = norm(sample).split('\n')
  const b = norm(md1).split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`行 ${i + 1}:\n  原: ${JSON.stringify(a[i])}\n  新: ${JSON.stringify(b[i])}`)
    }
  }
}

ws.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
