import katex from 'katex'
import { $nodeSchema, $view } from '@milkdown/utils'
import type { Node } from 'prosemirror-model'
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view'

function renderKatex(el: HTMLElement, value: string, displayMode: boolean): void {
  try {
    katex.render(value || ' ', el, { throwOnError: false, displayMode })
  } catch {
    el.textContent = value
  }
}

/** 行内公式 $...$ */
export const inlineMathSchema = $nodeSchema('inline_math', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: { value: { default: '' } },
  toDOM: (node) => ['span', { class: 'inline-math', 'data-value': String(node.attrs.value ?? '') }],
  parseDOM: [
    {
      tag: 'span[data-type="inline-math"], span.inline-math',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: (node as { value?: string }).value ?? '' })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'inline_math',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, String(node.attrs.value ?? ''))
    },
  },
}))

/** 块级公式 $$...$$ */
export const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { value: { default: '' } },
  toDOM: (node) => ['div', { class: 'math-block', 'data-value': String(node.attrs.value ?? '') }],
  parseDOM: [
    {
      tag: 'div[data-type="math-block"], div.math-block',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.addNode(type, { value: (node as { value?: string }).value ?? '' })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, String(node.attrs.value ?? ''))
    },
  },
}))

interface MathViewOptions {
  displayMode: boolean
  cssClass: string
}

/** 公式节点视图：默认渲染 KaTeX，双击进入 TeX 编辑，Enter/失焦提交，Esc 取消 */
function createMathNodeView(options: MathViewOptions): NodeViewConstructor {
  return (n, v, gp) => {
    const node: Node = n
    const view: EditorView = v
    const getPos: () => number | undefined = gp

    const dom = document.createElement(options.displayMode ? 'div' : 'span')
    dom.className = options.cssClass

    const rendered = document.createElement(options.displayMode ? 'div' : 'span')
    rendered.className = `${options.cssClass}__render`

    const input = document.createElement('textarea')
    input.className = `${options.cssClass}__input`
    input.rows = options.displayMode ? 4 : 1
    input.spellcheck = false

    dom.append(rendered, input)
    let editing = false
    let currentNode: Node = node

    function render() {
      renderKatex(rendered, String(currentNode.attrs.value ?? ''), options.displayMode)
    }
    render()

    function startEdit() {
      if (editing) return
      editing = true
      input.value = String(currentNode.attrs.value ?? '')
      dom.classList.add('is-editing')
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }

    function commit() {
      if (!editing) return
      editing = false
      dom.classList.remove('is-editing')
      const pos = getPos()
      if (pos !== undefined) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value: input.value }))
      }
    }

    function cancel() {
      if (!editing) return
      editing = false
      dom.classList.remove('is-editing')
      render()
    }

    input.addEventListener('blur', () => commit())
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!options.displayMode || e.ctrlKey)) {
        e.preventDefault()
        commit()
        view.focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
        view.focus()
      }
      e.stopPropagation()
    })
    dom.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      startEdit()
    })

    const nodeView: NodeView = {
      dom,
      update(updated) {
        if (updated.type.name !== currentNode.type.name) return false
        currentNode = updated
        if (!editing) render()
        return true
      },
      stopEvent() {
        return editing
      },
      ignoreMutation() {
        return true
      },
      // Typora 行为：光标进入公式即显示 TeX 源码，点外面恢复渲染
      selectNode() {
        dom.classList.add('is-selected')
        startEdit()
      },
      deselectNode() {
        dom.classList.remove('is-selected')
        commit()
      },
      destroy() {
        dom.remove()
      },
    }
    return nodeView
  }
}

export const inlineMathView = $view(inlineMathSchema.node, () =>
  createMathNodeView({ displayMode: false, cssClass: 'math-inline' }),
)

export const mathBlockView = $view(mathBlockSchema.node, () =>
  createMathNodeView({ displayMode: true, cssClass: 'math-block' }),
)
