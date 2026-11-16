// M2 验收测试：多标签 / 文件树 / 大纲 / 外部修改 / 最近文件
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'

const samplePath = 'D:/tmp/myTypora/docs/sample.md'
const sampleOriginal = readFileSync('D:/tmp/myTypora/docs/sample.md', 'utf8')

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (let i = 0; i < 20 && !(await evaluate('!!window.__debug')); i++) await sleep(500)
check('调试钩子就绪', await evaluate('!!window.__debug'))

// 0. 清空测试残留标签，恢复 sample.md 原文
await evaluate(`window.__debug.loadText('')`)
await sleep(400)

// 1. 通过 app:openPath 通道打开文件 → 新标签
await evaluate(`window.__debug.openByPath(${JSON.stringify(samplePath)})`)
await sleep(900)
const info1 = JSON.parse(await evaluate('JSON.stringify(window.__debug.tabsInfo())'))
check(
  '打开文件产生标签',
  info1.some((t) => t.path && t.path.replace(/\\/g, '/').toLowerCase() === samplePath.toLowerCase()),
  JSON.stringify(info1),
)

// 2. 打开文件夹 → 文件树渲染（顶层 2 节点：子目录 + 笔记一.md）→ 展开子目录 → 3 节点
await evaluate(`window.__debug.openFolderTest('D:/tmp/myTypora/docs/demo')`)
await sleep(900)
const sidebar = JSON.parse(await evaluate('JSON.stringify(window.__debug.sidebar())'))
check('侧栏打开且为文件树', sidebar.open === true && sidebar.mode === 'tree', JSON.stringify(sidebar))
const rowCountTop = await evaluate(`document.querySelectorAll('.ft-body .row').length`)
check('文件树顶层节点', rowCountTop === 2, `节点数 ${rowCountTop}`)
await evaluate(`document.querySelectorAll('.ft-body .row')[0].click()`) // 展开子目录
await sleep(900)
const rowCountAll = await evaluate(`document.querySelectorAll('.ft-body .row').length`)
check('子目录懒加载展开', rowCountAll >= 3, `节点数 ${rowCountAll}`)

// 3. 大纲
const outline = JSON.parse(await evaluate('JSON.stringify(window.__debug.outline())'))
check('大纲提取标题', outline.length === 2 && outline[0].text === 'MyTypora 自测样例', JSON.stringify(outline.map((o) => o.text)))

// 4. 打开文件树中的中文文件（模拟点击 → 直接调 openByPath）
await evaluate(`window.__debug.openByPath('D:/tmp/myTypora/docs/demo/子目录/笔记二.md')`)
await sleep(800)
const info2 = JSON.parse(await evaluate('JSON.stringify(window.__debug.tabsInfo())'))
check('中文路径文件可打开', info2.filter((t) => t.path).length === 2, JSON.stringify(info2))

// 5. 外部修改监听（无脏 → 自动重载）
const before = JSON.parse(await evaluate('JSON.stringify(window.__debug.tabsInfo())'))
appendFileSync(samplePath, '\n## 外部追加的小节\n\n外部修改内容。\n', 'utf8')
await sleep(2000)
const after = JSON.parse(await evaluate('JSON.stringify(window.__debug.tabsInfo())'))
const sampleTabAfter = after.find((t) => t.path && t.path.toLowerCase().includes('sample'))
check(
  '外部修改自动重载',
  sampleTabAfter && !sampleTabAfter.dirty && sampleTabAfter.chars > Math.max(...before.map((t) => t.chars)),
  `字符数 ${sampleTabAfter?.chars}`,
)

// 6. 外部修改监听（脏 → 出横幅）
await evaluate(`window.__debug.openByPath(${JSON.stringify(samplePath)})`)
await sleep(600)
await evaluate(`window.__debug.dirtyTest()`) // 把活动标签弄脏
await sleep(300)
appendFileSync(samplePath, '\n更多外部改动。\n', 'utf8')
await sleep(2000)
const banner = await evaluate(`!!document.querySelector('.ext-banner')`)
check('脏文档外部修改出横幅', banner === true)

// 7. 最近文件
const recent = JSON.parse(
  await evaluate(
    `(async () => {
      const wv = window.chrome.webview
      return await new Promise((res) => {
        const h = (ev) => { const d = ev.data; if (d && d.id === 80001) { wv.removeEventListener('message', h); res(JSON.stringify(d.result)) } }
        wv.addEventListener('message', h)
        wv.postMessage({ id: 80001, method: 'recent:list' })
      })
    })()`,
  ),
)
check('最近文件记录', recent.includes(samplePath), recent.slice(0, 120))

// 恢复 sample.md 原文，清理测试残留
writeFileSync(samplePath, sampleOriginal, 'utf8')
await evaluate(`window.__debug.loadText('')`)

ws.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
