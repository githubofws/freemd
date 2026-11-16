import { $view } from '@milkdown/utils'
import { headingSchema } from '@milkdown/preset-commonmark'

/**
 * 标题节点视图：
 * - 常态渲染为语义标题（样式由 CSS h1-h6 控制）
 * - 双击打开「浮层原文编辑器」（挂在 body 上，与 contenteditable 物理隔离，
 *   避免 PM DOM 观察器把输入污染进文档），可修改 # 层级与文字
 * - Enter/失焦提交，Esc 取消
 */
export const headingView = $view(headingSchema.node, () => (node, view, getPos) => {
  let current = node

  const dom = document.createElement(`h${Number(current.attrs.level ?? 1)}`)
  dom.className = 'md-heading-view'
  const contentDOM = document.createElement('span')
  contentDOM.className = 'md-heading-content'
  dom.appendChild(contentDOM)

  let overlay: HTMLDivElement | null = null
  let textarea: HTMLTextAreaElement | null = null

  function closeOverlay() {
    overlay?.remove()
    overlay = null
    textarea = null
  }

  function startEdit() {
    if (overlay) return
    const pos = getPos()
    if (pos === undefined) return
    const level = Number(current.attrs.level ?? 1)
    const rect = dom.getBoundingClientRect()

    overlay = document.createElement('div')
    overlay.className = 'md-heading-overlay'
    // 字号随层级匹配标题渲染样式
    overlay.style.left = `${rect.left + window.scrollX}px`
    overlay.style.top = `${rect.top + window.scrollY}px`
    overlay.style.minWidth = `${Math.max(rect.width, 320)}px`

    textarea = document.createElement('textarea')
    textarea.className = `md-heading-overlay-input lv${level}`
    textarea.rows = 1
    textarea.spellcheck = false
    textarea.value = `${'#'.repeat(level)} ${current.textContent}`

    overlay.appendChild(textarea)
    document.body.appendChild(overlay)
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    textarea.addEventListener('blur', () => commit())
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeOverlay()
        view.focus()
      }
      e.stopPropagation()
    })

    // 滚动时关闭（浮层位置会失准）
    const host = view.dom.closest('.editor-host')
    host?.addEventListener('scroll', () => commit(), { once: true })
  }

  function commit() {
    const ta = textarea
    if (!ta) return
    const raw = ta.value
    closeOverlay()
    const m = raw.match(/^(#{1,6})\s+(.*)$/s)
    const level = m ? m[1].length : Number(current.attrs.level ?? 1)
    const text = m ? m[2] : raw
    const pos = getPos()
    if (pos === undefined) {
      view.focus()
      return
    }
    try {
      const schema = view.state.schema
      const heading = schema.nodes.heading
      if (!heading) return
      let tr = view.state.tr
      const from = pos + 1
      const to = pos + 1 + current.content.size
      if (text !== current.textContent) {
        tr = tr.replaceWith(from, to, text ? schema.text(text) : schema.nodes.paragraph!.create())
      }
      if (level !== Number(current.attrs.level ?? 1)) {
        tr = tr.setNodeMarkup(pos, undefined, { level })
      }
      ;(globalThis as Record<string, unknown>).__lastHeadingTr = {
        from,
        to,
        text,
        level,
        docChanged: tr.docChanged,
        contentSize: current.content.size,
        textContent: current.textContent,
      }
      if (tr.docChanged) {
        view.dispatch(tr)
      }
    } catch (err) {
      ;(globalThis as Record<string, unknown>).__headingErr = String(err).slice(0, 200)
    }
    view.focus()
  }

  dom.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    e.preventDefault()
    startEdit()
  })

  return {
    dom,
    contentDOM,
    update(updated) {
      if (updated.type.name !== current.type.name) return false
      // 层级变化时重建 DOM（更换语义标签）
      if (Number(updated.attrs.level ?? 1) !== Number(current.attrs.level ?? 1)) return false
      current = updated
      return true
    },
    stopEvent(e) {
      return e.type === 'dblclick'
    },
    destroy() {
      closeOverlay()
      dom.remove()
    },
  }
})
