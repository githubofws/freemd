// CDP 网络域探测：观察 fs.local 请求的响应头
const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
  if (m.method === 'Network.responseReceived') {
    const r = m.params.response
    console.log('URL:', r.url.slice(0, 70), '| status', r.status, '| mime:', r.mimeType)
    console.log('  headers:', JSON.stringify(r.headers).slice(0, 300))
  }
  if (m.method === 'Network.loadingFailed') {
    console.log('FAILED:', m.params.errorText, m.params.type)
  }
}

await new Promise((r) => (ws.onopen = r))
await send('Network.enable', {})
await new Promise((r) => setTimeout(r, 300))

const evalP = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
evalP(
  "(async()=>{const p=new Image();p.src='https://fs.local/assets/paste-test.png?v='+Date.now();await new Promise(r=>{p.onload=p.onerror=r;setTimeout(r,3000)});const q=new Image();q.src='https://fs.local/test2.png?v='+Date.now();await new Promise(r=>{q.onload=q.onerror=r;setTimeout(r,3000)});return 'done'})()",
)
await new Promise((r) => setTimeout(r, 6500))
process.exit(0)
