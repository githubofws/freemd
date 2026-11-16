import { $markSchema } from '@milkdown/utils'

/** 自定义 remark 插件：解析侧把文本中的 ==高亮== 切成 highlight 节点 */
export function remarkHighlight() {
  type MdastNode = {
    children?: Array<Record<string, unknown>>
    value?: string
    type?: string
  }
  const walk = (node: MdastNode): void => {
    const children = node.children
    if (!Array.isArray(children)) return
    const next: Array<Record<string, unknown>> = []
    for (const child of children) {
      if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('==')) {
        const parts = child.value.split(/(==[^=]+==)/g).filter((p) => p !== '')
        for (const part of parts) {
          if (/^==[^=]+==$/.test(part)) {
            next.push({ type: 'highlight', children: [{ type: 'text', value: part.slice(2, -2) }] })
          } else {
            next.push({ type: 'text', value: part })
          }
        }
      } else {
        walk(child as MdastNode)
        next.push(child)
      }
    }
    node.children = next
  }
  return (tree: unknown) => {
    walk(tree as MdastNode)
    return tree
  }
}

/** ==高亮== 标记（Typora 语法，序列化为 ==text==） */
export const highlightSchema = $markSchema('highlight', () => ({
  attrs: {},
  parseDOM: [{ tag: 'mark' }, { tag: 'span.md-highlight' }],
  toDOM: () => ['mark', { class: 'md-highlight' }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'highlight',
    runner: (state, node, markType) => {
      state.openMark(markType, {})
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark) => {
      state.withMark(mark, 'highlight')
    },
  },
}))
