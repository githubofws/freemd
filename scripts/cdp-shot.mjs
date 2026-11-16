// 用法: node scripts/cdp-shot.mjs [输出.png]
// 通过 CDP 对 WebView2 页面截图（本机调试用）
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'scripts/shot.png'

const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('未找到页面目标')
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

const resp = await send('Page.captureScreenshot', { format: 'png' })
if (resp?.result?.data) {
  writeFileSync(out, Buffer.from(resp.result.data, 'base64'))
  console.log(`已保存截图: ${out}`)
} else {
  console.error('截图失败', JSON.stringify(resp))
}
ws.close()
process.exit(0)
