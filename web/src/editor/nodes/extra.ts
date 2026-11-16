import { $nodeSchema, $prose, $view } from '@milkdown/utils'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'
import type { Node } from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'

/** YAML front matter（--- 包裹的元数据块） */
export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { value: { default: '' } },
  toDOM: (node) => ['pre', { class: 'frontmatter', 'data-value': String(node.attrs.value ?? '') }],
  parseDOM: [
    {
      tag: 'pre[class*=frontmatter]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, { value: (node as { value?: string }).value ?? '' })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, String(node.attrs.value ?? ''))
    },
  },
}))

/** front matter 视图：灰色块，双击可编辑 */
export const frontmatterView = $view(frontmatterSchema.node, () => (node, view, getPos) => {
  let current: Node = node
  let editing = false

  const dom = document.createElement('pre')
  dom.className = 'frontmatter-view'

  const content = document.createElement('code')
  const input = document.createElement('textarea')
  input.className = 'frontmatter-input'
  input.spellcheck = false
  input.rows = 4

  dom.append(content, input)

  function render() {
    content.textContent = String(current.attrs.value ?? '')
  }
  render()

  function startEdit() {
    if (editing) return
    editing = true
    input.value = String(current.attrs.value ?? '')
    dom.classList.add('is-editing')
    input.focus()
  }

  function commit() {
    if (!editing) return
    editing = false
    dom.classList.remove('is-editing')
    const pos = getPos()
    if (pos !== undefined) {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value: input.value }))
    }
    view.focus()
  }

  input.addEventListener('blur', () => commit())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      editing = false
      dom.classList.remove('is-editing')
      render()
      view.focus()
    }
    e.stopPropagation()
  })
  dom.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    startEdit()
  })

  return {
    dom,
    update(updated) {
      if (updated.type.name !== current.type.name) return false
      current = updated
      if (!editing) render()
      return true
    },
    stopEvent(e) {
      return editing || e.type === 'dblclick'
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      dom.remove()
    },
  }
})

/* ---------------- [TOC] 目录（段落装饰实现，序列化天然无损） ---------------- */

function buildTocWidget(doc: Node): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'toc-widget'
  const items: { level: number; text: string; pos: number }[] = []
  doc.descendants((n, pos) => {
    if (n.type.name === 'heading') {
      items.push({ level: Number(n.attrs.level ?? 1), text: n.textContent, pos })
      return false
    }
    // 跳过代码块内部的 # 注释
    return n.type.name !== 'code_block'
  })
  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'toc-empty'
    empty.textContent = '[TOC]（文档暂无标题）'
    wrap.appendChild(empty)
    return wrap
  }
  for (const it of items) {
    const row = document.createElement('div')
    row.className = `toc-item lv${it.level}`
    row.textContent = it.text
    row.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('mytypora-toc-jump', { detail: { pos: it.pos, text: it.text } }))
    })
    wrap.appendChild(row)
  }
  return wrap
}

/** 段落文本恰为 [TOC] 时，用目录 widget 替换渲染（内容仍可编辑、序列化为普通段落） */
export const tocDecorationPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state: EditorState) {
          const decos: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'paragraph' && node.textContent.trim() === '[TOC]') {
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'toc-paragraph' }))
              decos.push(Decoration.widget(pos + 1, () => buildTocWidget(state.doc), { side: -1 }))
              return false
            }
            return true
          })
          return DecorationSet.create(state.doc, decos)
        },
      },
    }),
)
