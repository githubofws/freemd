import hljs from 'highlight.js/lib/common'
import { $prose, $view } from '@milkdown/utils'
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { NodeViewConstructor } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'

/* ---------------- highlight.js 装饰插件 ---------------- */

interface TokenRange {
  from: number
  to: number
  cls: string
}

/** highlight.js 输出的 HTML 转成文本位置区间 */
function highlightPositions(code: string, lang: string): TokenRange[] {
  const resolved = hljs.getLanguage(lang) ? lang : 'plaintext'
  let html: string
  try {
    html = hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
  } catch {
    return []
  }
  const parsed = new DOMParser().parseFromString(`<span id="r">${html}</span>`, 'text/html')
  const root = parsed.getElementById('r')!
  const out: TokenRange[] = []
  let pos = 0

  function walk(el: Node, cls: string): void {
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (cls && text.length > 0) out.push({ from: pos, to: pos + text.length, cls })
        pos += text.length
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el2 = child as HTMLElement
        walk(el2, el2.className || cls)
      }
    })
  }
  walk(root, '')
  return out
}

/**
 * 代码高亮装饰：每次视图刷新全量重算（普通文档足够快，M6 再做增量优化）。
 */
export function buildCodeDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'code_block') return
    const lang = String(node.attrs.language ?? '')
    const text = node.textContent
    if (!text) return
    for (const t of highlightPositions(text, lang)) {
      decos.push(Decoration.inline(offset + 1 + t.from, offset + 1 + t.to, { class: t.cls }))
    }
  })
  return DecorationSet.create(doc, decos)
}

export const codeHighlightPlugin = $prose(() =>
  new Plugin({
    props: {
      decorations(state: EditorState): DecorationSet {
        return buildCodeDecorations(state.doc)
      },
    },
  }),
)

/* ---------------- 代码块节点视图 ---------------- */

export const codeBlockViewFactory: NodeViewConstructor = (node, view, getPos) => {
  let current: PMNode = node

  const dom = document.createElement('div')
  dom.className = 'codeblock-wrap'

  // 语言徽标：点击编辑语言，Enter 确认
  const chip = document.createElement('div')
  chip.className = 'codeblock-lang'
  chip.contentEditable = 'false'
  setChipText()

  const contentDOM = document.createElement('pre')
  contentDOM.className = 'codeblock-content'

  dom.append(chip, contentDOM)

  function setChipText() {
    chip.textContent = String(current.attrs.language ?? '') || 'code'
  }

  function startLangEdit() {
    if (chip.querySelector('input')) return
    const input = document.createElement('input')
    input.value = String(current.attrs.language ?? '')
    input.spellcheck = false
    input.placeholder = '语言'
    chip.textContent = ''
    chip.appendChild(input)
    chip.classList.add('is-editing')
    input.focus()
    input.select()

    const commit = () => {
      const pos = getPos()
      chip.classList.remove('is-editing')
      if (pos !== undefined) {
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { language: input.value.trim() }),
        )
      }
      view.focus()
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setChipText()
        view.focus()
      }
      e.stopPropagation()
    })
  }

  chip.addEventListener('click', startLangEdit)

  return {
    dom,
    contentDOM,
    update(updated) {
      if (updated.type.name !== current.type.name) return false
      // 语言变成 mermaid 时交给图表视图重建
      if (String(updated.attrs.language ?? '') === 'mermaid') return false
      current = updated
      setChipText()
      return true
    },
    stopEvent(e) {
      return chip.contains(e.target as Node)
    },
    ignoreMutation(m) {
      return chip.contains((m.target as Node) ?? (m as unknown as Node))
    },
    destroy() {
      dom.remove()
    },
  }
}

/* ---------------- mermaid 节点视图 ---------------- */

let mermaidReady: Promise<typeof import('mermaid').default> | null = null

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((m) => {
      const mermaid = m.default
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })
      return mermaid
    })
  }
  return mermaidReady
}

let renderSeq = 0

/** language === 'mermaid' 的代码块：渲染图表，双击进入源码编辑 */
export const mermaidViewFactory: NodeViewConstructor = (node, view, getPos) => {
  let current: PMNode = node
  let editing = false

  const dom = document.createElement('div')
  dom.className = 'mermaid-wrap'

  const chip = document.createElement('div')
  chip.className = 'codeblock-lang'
  chip.contentEditable = 'false'
  chip.textContent = 'mermaid'

  const rendered = document.createElement('div')
  rendered.className = 'mermaid-render'

  const input = document.createElement('textarea')
  input.className = 'mermaid-input'
  input.spellcheck = false

  dom.append(chip, rendered, input)

  async function render() {
    const token = ++renderSeq
    const code = nodeText()
    if (!code.trim()) return
    rendered.classList.remove('is-error')
    try {
      const mermaid = await loadMermaid()
      if (token !== renderSeq) return
      const { svg } = await mermaid.render(`mmd-${Date.now()}-${renderSeq}`, code)
      if (token !== renderSeq) return
      rendered.innerHTML = svg
    } catch (e) {
      if (token !== renderSeq) return
      rendered.classList.add('is-error')
      rendered.textContent = `mermaid 语法错误：${e instanceof Error ? e.message : String(e)}`
    }
  }

  function nodeText(): string {
    return current.textContent
  }

  function startEdit() {
    if (editing) return
    editing = true
    input.value = nodeText()
    dom.classList.add('is-editing')
    input.focus()
  }

  function commit() {
    if (!editing) return
    editing = false
    dom.classList.remove('is-editing')
    const pos = getPos()
    if (pos !== undefined) {
      view.dispatch(
        view.state.tr.replaceWith(
          pos + 1,
          pos + 1 + current.content.size,
          current.type.schema.text(input.value),
        ),
      )
    }
    view.focus()
  }

  function cancel() {
    if (!editing) return
    editing = false
    dom.classList.remove('is-editing')
    view.focus()
  }

  input.addEventListener('blur', () => commit())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
    e.stopPropagation()
  })
  dom.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    startEdit()
  })

  if (nodeText().trim()) void render()

  return {
    dom,
    update(updated) {
      if (updated.type.name !== current.type.name) return false
      // 语言不再是 mermaid 时交回普通代码视图
      if (String(updated.attrs.language ?? '') !== 'mermaid') return false
      const textChanged = updated.textContent !== current.textContent
      current = updated
      if (textChanged && !editing) void render()
      return true
    },
    stopEvent(e) {
      return editing || e.type === 'dblclick' || chip.contains(e.target as Node)
    },
    ignoreMutation() {
      return true
    },
    selectNode() {
      dom.classList.add('is-selected')
    },
    deselectNode() {
      dom.classList.remove('is-selected')
    },
    destroy() {
      dom.remove()
    },
  }
}

/** 分发：mermaid → 图表视图，其余 → 代码编辑视图 */
export const codeBlockDispatchView: NodeViewConstructor = (
  node,
  view,
  getPos,
  decorations,
  innerDecorations,
) => {
  if (String(node.attrs.language ?? '') === 'mermaid') {
    return mermaidViewFactory(node, view, getPos, decorations, innerDecorations)
  }
  return codeBlockViewFactory(node, view, getPos, decorations, innerDecorations)
}

export const codeBlockView = $view(codeBlockSchema.node, () => codeBlockDispatchView)
