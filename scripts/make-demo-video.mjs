// 用法: node scripts/make-demo-video.mjs
// CDP 驱动 FreeMD 执行一串演示操作，逐帧截图后用 ffmpeg 合成 MP4 + GIF 推广素材
// 依赖：正在运行的 FreeMD（CDP 9222）+ ffmpeg（/tmp/freemd-tools/ffmpeg.exe 或 PATH 中）
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const WORK = path.join(os.tmpdir(), 'freemd-demo-frames')
const FF = ['ffmpeg', path.join(os.tmpdir(), 'freemd-tools', 'ffmpeg.exe')].find(existsSync)
const OUT_DIR = path.join(process.cwd(), 'demo')
if (!FF) {
  console.error('未找到 ffmpeg（PATH 或 %TEMP%/freemd-tools）')
  process.exit(1)
}

// ---- CDP 连接 ----
const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('未找到 FreeMD 页面目标（应用须在运行）')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
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
function send(method, params) {
  return new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) {
    throw new Error('eval 失败: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  }
  return r.result?.result?.value
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (!r?.result?.data) throw new Error('截图失败: ' + name)
  writeFileSync(path.join(WORK, name), Buffer.from(r.result.data, 'base64'))
  console.log('帧', name)
}
async function loadText(md) {
  await evalJs(`__debug.loadText(${JSON.stringify(md)})`)
  await evalJs(`document.querySelector('.mytypora-write').focus()`)
}
async function menu(idArg) {
  await evalJs(`__debug.menu(${JSON.stringify(idArg)})`)
}

// ---- 演示场景 ----
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

// S1 开场：真实打字出标题（input rule：'# '+空格 → 一级标题）
await menu('file.new')
await evalJs(`document.querySelector('.mytypora-write').focus()`)
await send('Input.insertText', { text: '#' })
await sleep(250)
await send('Input.insertText', { text: ' ' })
await sleep(500)
await shot('f01.png')
await send('Input.insertText', { text: 'FreeMD — 免费、轻量、所见即所得' })
await sleep(350)
await shot('f02.png')

// S2 格式全家桶：光标进入加粗词，** 语法显形
await loadText(
  '# FreeMD — 免费、轻量、所见即所得\n\n' +
    '像 Typora 一样写作：语法在光标停留处显形，离开即渲染。\n\n' +
    '**加粗**、*斜体*、==高亮==、~~删除线~~、`行内代码` 全部即时预览\n\n' +
    '刚输入完的文字，不选中直接按 Ctrl+B 也能加粗\n',
)
await evalJs(`__debug.caretIntoBold()`)
await sleep(400)
await shot('f03.png')

// S3 表格 + 悬停工具栏
await loadText(
  '# 表格编辑\n\n' +
    '| 语言 | 特点 | 诞生 |\n| ---- | ---- | ---- |\n' +
    '| JavaScript | 动态类型 | 1995 |\n| TypeScript | 渐进类型 | 2012 |\n',
)
const rect = await evalJs(
  `(() => { const t = document.querySelector('.md-table'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`,
)
if (rect) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y })
  await sleep(350)
  await shot('f04.png')
  // 点击工具栏“整列居中”
  await evalJs(
    `document.dispatchEvent(new CustomEvent('md-table-cmd', { detail: { cmd: 'align', align: 'center' } }))`,
  )
  await sleep(400)
  await shot('f05.png')
}

// S4 数学公式 + 代码高亮 + mermaid
await loadText(
  '# 数学 · 代码 · 图表\n\n' +
    '行内公式 $E = mc^2$，块级公式：\n\n' +
    '$$\n\\int_{-\\infty}^{+\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}\n$$\n\n' +
    '```js\nconst editor = "FreeMD" // 语法高亮\nconsole.log(`hello ${editor}`)\n```\n\n' +
    '```mermaid\ngraph LR\nA[写作] --> B[导出]\nB --> C[PDF]\nB --> D[HTML]\n```\n',
)
await sleep(2000) // 等 mermaid 渲染
await evalJs(`document.querySelectorAll('*').forEach((el) => { if (el.scrollTop > 0) el.scrollTop = 0 })`)
await sleep(200)
await shot('f06.png')

// S5 链接 href 浮层（真实双击链接 → dblclick → startEdit）
await loadText(
  '# 超链接\n\n' +
    'Ctrl+K 把光标下的词变成链接，双击或选中即可编辑地址，Ctrl+单击跳转浏览器\n\n' +
    '灵感来自 [Typora 官网](https://typora.io)\n',
)
const linkPos = await evalJs(
  `(() => { const a = [...document.querySelectorAll('a.md-link-view')].at(-1); if (!a) return null; const r = a.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`,
)
if (linkPos) {
  const { x, y } = linkPos
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  await sleep(120)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 })
  await sleep(500)
  await shot('f07.png')
}

// S6 主题三连（标题栏/菜单随主题变色）
await menu('theme.github')
await sleep(500)
await shot('f08.png')
await menu('theme.dark')
await sleep(500)
await shot('f09.png')
await menu('theme.paper')
await sleep(500)
await shot('f10.png')

// S7 源代码模式
await menu('view.sourceMode')
await sleep(600)
await shot('f11.png')
await menu('view.sourceMode')
await sleep(400)

// S8 大纲 + 回到 github 主题收尾
await menu('theme.github')
await sleep(300)
await menu('view.outline')
await sleep(500)
await shot('f12.png')

ws.close()

// ---- ffmpeg 合成：MP4（每帧 1.8~2.4s）+ GIF（960 宽）----
const frames = ['f01', 'f02', 'f03', 'f04', 'f05', 'f06', 'f07', 'f08', 'f09', 'f10', 'f11', 'f12']
const dur = { f01: 2.0, f02: 1.8, f03: 2.0, f04: 1.8, f05: 1.8, f06: 2.4, f07: 2.2, f08: 1.6, f09: 1.6, f10: 1.6, f11: 2.2, f12: 2.4 }
let concat = 'ffconcat version 1.0\n'
for (const f of frames) {
  concat += `file '${f}.png'\nduration ${dur[f] ?? 1.8}\n`
}
concat += `file '${frames[frames.length - 1]}.png'\n` // concat demuxer 需要末帧重复
const listPath = path.join(WORK, 'frames.ffconcat')
writeFileSync(listPath, concat)

const mp4 = path.join(OUT_DIR, 'freemd-demo.mp4')
execFileSync(FF, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
console.log('MP4:', mp4)

const gif = path.join(OUT_DIR, 'freemd-demo.gif')
execFileSync(FF, [
  '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
  '-vf', 'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
  '-loop', '0', gif,
])
console.log('GIF:', gif)
