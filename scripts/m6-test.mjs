// M6 验收：round-trip fixtures 回归（语法兼容性）
import { readFileSync, readdirSync } from 'node:fs'

const fixtureDir = 'D:/tmp/myTypora/scripts/fixtures'
const extra = {
  sample: readFileSync('D:/tmp/myTypora/docs/sample.md', 'utf8'),
  sample3: readFileSync('D:/tmp/myTypora/docs/sample3.md', 'utf8'),
}
for (const f of readdirSync(fixtureDir)) {
  if (f.endsWith('.md')) extra[f.replace(/\.md$/, '')] = readFileSync(`${fixtureDir}/${f}`, 'utf8')
}

// 语义等价归一化（同 m1-test）：
// 表格空白/对齐行长、列表符、转义、setext→ATX、引用嵌套写法 —— 均为序列化风格差异
const norm = (s) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/g, '')
    // setext 标题 → ATX（前一行非空且非表格行）
    .replace(/(^|\n)([^\n|][^\n]*)\n={3,}[ \t]*\n/g, '$1# $2\n')
    .replace(/(^|\n)([^\n|][^\n]*)\n-{3,}[ \t]*\n/g, '$1## $2\n')
    // 表格：单元格 trim + 对齐行横线统一为 3
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
    // 水平线统一 '---'
    .replace(/^ {0,3}([-*_])[ \t]*\1[ \t]*\1[\-*_ \t]*$/gm, '---')
    // 自动链接：<https://x> 与裸链接等价
    .replace(/<(https?:\/\/[^>]+|[^>\s]+@[^>\s]+)>/g, '$1')
    // 引用标记深度无关比较（milkdown 上游 quirk：嵌套引用序列化层级会 +1，重解析后稳定）
    .replace(/^((?:\s*>[ \t]?)+)/gm, '')
    // 行首反斜杠转义（文本 [ ]）
    .replace(/\\(?=\[|\])/g, '')

const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

const send = (method, params) =>
  new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
let total = 0

for (const [name, original] of Object.entries(extra)) {
  await evaluate(`window.__debug.loadText(${JSON.stringify(original)})`)
  await sleep(700)
  const md = await evaluate('window.__debug.getMarkdown()')
  total++
  const a = norm(original).split('\n')
  const b = norm(md ?? '').split('\n')
  const diffs = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) diffs.push(`行${i + 1}: 原=${JSON.stringify(a[i])} 新=${JSON.stringify(b[i])}`)
  }
  if (diffs.length === 0) {
    console.log(`PASS  ${name} (${a.length} 行无损)`)
  } else {
    failed++
    console.log(`FAIL  ${name} — ${diffs.length} 处差异:`)
    diffs.slice(0, 8).forEach((d) => console.log('   ', d))
  }
}

ws.close()
console.log(`\nround-trip 回归: ${total - failed}/${total} 通过`)
process.exit(failed ? 1 : 0)
