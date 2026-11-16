import { $prose } from '@milkdown/utils'
import { getMarkRange } from '@milkdown/prose'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'

/** 语法标记 widget 的 DOM 构建 */
function synSpan(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'md-syn'
  span.textContent = text
  return span
}

/** 各行内标记对应的原始语法围栏 */
const markSyntax: Record<string, { before: string; after: string }> = {
  strong: { before: '**', after: '**' },
  em: { before: '*', after: '*' },
  strikethrough: { before: '~~', after: '~~' },
  del: { before: '~~', after: '~~' },
  inlineCode: { before: '`', after: '`' },
  code_inline: { before: '`', after: '`' },
}

/**
 * Typora 式「活动语法显示」：
 * 光标所在元素的原始 Markdown 标记以不可编辑 widget 形式显示，
 * 光标离开后恢复纯渲染。装饰不进入文档，序列化天然无损。
 */
export const activeSyntaxPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state: EditorState): DecorationSet {
          const decos: Decoration[] = []
          const { $from } = state.selection

          // ---- 标题：前缀 # ——（光标在标题内时显示） ----
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'heading') {
              const level = Number(node.attrs.level ?? 1)
              decos.push(Decoration.widget($from.before(d) + 1, () => synSpan('#'.repeat(level) + ' '), { side: -1 }))
              break
            }
            if (node.type.name === 'code_block' || node.type.name === 'math_block') break
          }

          // ---- 块引用：每行前缀 >（光标在引用内时显示） ----
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'blockquote') {
              const base = $from.before(d)
              node.forEach((child, _offset, i) => {
                if (child.isTextblock) {
                  decos.push(Decoration.widget(base + childOffset(node, i) + 1, () => synSpan('> '), { side: -1 }))
                }
              })
              break
            }
            if (node.type.name === 'code_block') break
          }

          // ---- 列表项：- / N. / [ ] [x]（光标所在列表项显示） ----
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'list_item' || node.type.name === 'task_list_item') {
              const pos = $from.before(d) + 1
              const parentList = $from.node(d - 1)
              if (node.type.name === 'task_list_item') {
                const checked = node.attrs.checked === true || node.attrs.checked === 'true'
                decos.push(Decoration.widget(pos, () => synSpan(checked ? '[x] ' : '[ ] '), { side: -1 }))
              } else if (parentList.type.name === 'ordered_list') {
                // 计算当前项在有序列表中的序号
                const itemOffset = $from.before(d) - $from.before(d - 1)
                let ordinal = 1
                let off = 0
                parentList.forEach((child) => {
                  if (off >= itemOffset) return false
                  off += child.nodeSize
                  ordinal++
                  return true
                })
                const start = Number(parentList.attrs.order ?? parentList.attrs.start ?? 1)
                decos.push(Decoration.widget(pos, () => synSpan(`${ordinal + start - 1}. `), { side: -1 }))
              } else {
                decos.push(Decoration.widget(pos, () => synSpan('- '), { side: -1 }))
              }
              break
            }
            if (node.type.name === 'code_block' || node.type.name === 'math_block') break
          }

          // ---- 行内标记：边界显示 ** * ~~ `（光标位于标记内时显示） ----
          const marks = $from.marks()
          for (const mark of marks) {
            const spec = markSyntax[mark.type.name]
            if (!spec) continue
            try {
              const range = getMarkRange($from, mark.type)
              if (!range) continue
              decos.push(Decoration.widget(range.from, () => synSpan(spec.before), { side: -1 }))
              decos.push(Decoration.widget(range.to, () => synSpan(spec.after), { side: 1 }))
            } catch {
              /* 标记范围解析失败则跳过 */
            }
          }

          return decos.length > 0 ? DecorationSet.create(state.doc, decos) : DecorationSet.empty
        },
      },
    }),
)

/** blockquote 内第 i 个直接子节点在文档中的偏移 */
function childOffset(parent: PMNode, index: number): number {
  let offset = 0
  parent.forEach((child, _offset, i) => {
    if (i < index) offset += child.nodeSize
  })
  return offset
}
