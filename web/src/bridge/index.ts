/**
 * 原生桥封装：web ⇄ C# (WebView2)。
 * 协议：请求 {id, method, params} → 响应 {id, ok, result|error}；事件 {event, payload}。
 */

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: number
}

interface HostWebView {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void
}

function getHostWebView(): HostWebView | undefined {
  const chrome = (globalThis as Record<string, unknown>).chrome as
    | { webview?: HostWebView }
    | undefined
  return chrome?.webview
}

const wv = getHostWebView()

/** 是否运行在 WebView2 宿主中 */
export const isHostAvailable = !!wv

const pending = new Map<number, PendingCall>()
const listeners = new Map<string, Set<(payload: unknown) => void>>()
let seq = 0

if (wv) {
  wv.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data as
      | { id?: number; ok?: boolean; result?: unknown; error?: { message?: string } }
      | { event?: string; payload?: unknown }
      | null
    if (!msg || typeof msg !== 'object') return

    if ('id' in msg && typeof msg.id === 'number') {
      const call = pending.get(msg.id)
      if (!call) return
      pending.delete(msg.id)
      window.clearTimeout(call.timer)
      if (msg.ok) call.resolve(msg.result)
      else call.reject(new Error(msg.error?.message ?? 'bridge call failed'))
    } else if ('event' in msg && typeof msg.event === 'string') {
      listeners.get(msg.event)?.forEach((fn) => fn(msg.payload))
    }
  })
}

/** 调用 C# 侧方法，返回 result；失败 reject */
export function invoke<T = unknown>(method: string, params?: unknown, timeoutMs = 30000): Promise<T> {
  if (!wv) return Promise.reject(new Error('原生桥不可用（浏览器预览模式）'))
  return new Promise<T>((resolve, reject) => {
    const id = ++seq
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error(`桥调用超时: ${method}`))
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
    wv.postMessage({ id, method, params })
  })
}

/** 订阅 C# 侧事件，返回取消订阅函数 */
export function on(event: string, handler: (payload: unknown) => void): () => void {
  let set = listeners.get(event)
  if (!set) listeners.set(event, (set = new Set()))
  set.add(handler)
  return () => {
    set.delete(handler)
  }
}
