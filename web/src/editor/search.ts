import { Decoration, DecorationSet } from 'prosemirror-view'
import { Plugin, TextSelection } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { $prose } from '@milkdown/utils'

export interface SearchOptions {
  caseSensitive: boolean
  regexp: boolean
}

interface Segment {
  text: string
  start: number // PM 位置
}

interface MatchRange {
  from: number
  to: number
}

export interface SearchState {
  query: string
  options: SearchOptions
  matches: MatchRange[]
  activeIndex: number
}

let searchState: SearchState = {
  query: '',
  options: { caseSensitive: false, regexp: false },
  matches: [],
  activeIndex: -1,
}

/** 把文档文本拉平为段落段，便于全文匹配与位置回溯 */
function buildSegments(doc: PMNode): Segment[] {
  const segments: Segment[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      segments.push({ text: node.text, start: pos })
      return false
    }
    // 段落边界用 \n 间隔（跨节点匹配自然断开）
    return !(node.type.name === 'code_block' || node.type.name === 'math_block')
  })
  return segments
}

function computeMatches(doc: PMNode, query: string, options: SearchOptions): MatchRange[] {
  if (!query) return []
  const segments = buildSegments(doc)
  const matches: MatchRange[] = []

  let re: RegExp
  try {
    const source = options.regexp ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re = new RegExp(source, options.caseSensitive ? 'g' : 'gi')
  } catch {
    return []
  }

  for (const seg of segments) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(seg.text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      matches.push({ from: seg.start + m.index, to: seg.start + m.index + m[0].length })
    }
  }
  return matches
}

export function setSearch(query: string, options: SearchOptions): SearchState {
  searchState = { query, options, matches: [], activeIndex: -1 }
  return searchState
}

export function getSearchState(): SearchState {
  return searchState
}

/** 在给定视图上重新计算匹配 */
export function refreshMatches(view: EditorView): SearchState {
  searchState.matches = computeMatches(view.state.doc, searchState.query, searchState.options)
  if (searchState.activeIndex >= searchState.matches.length) {
    searchState.activeIndex = searchState.matches.length - 1
  }
  return searchState
}

/** 定位匹配序号：返回该匹配（并更新 activeIndex），越界返回 null */
export function jumpTo(view: EditorView, index: number): MatchRange | null {
  refreshMatches(view)
  const { matches } = searchState
  if (matches.length === 0) return null
  const wrapped = ((index % matches.length) + matches.length) % matches.length
  searchState.activeIndex = wrapped
  const match = matches[wrapped]
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)))
  const domPos = view.domAtPos(match.from)
  const el = domPos.node instanceof Element ? domPos.node : domPos.node.parentElement
  el?.scrollIntoView({ behavior: 'auto', block: 'center' })
  return match
}

export function replaceCurrent(view: EditorView, replacement: string): boolean {
  refreshMatches(view)
  const { activeIndex, matches } = searchState
  if (activeIndex < 0 || activeIndex >= matches.length) return false
  const { from, to } = matches[activeIndex]
  view.dispatch(view.state.tr.insertText(replacement, from, to))
  return true
}

export function replaceAllInView(view: EditorView, replacement: string): number {
  refreshMatches(view)
  const { matches } = searchState
  if (matches.length === 0) return 0
  let tr = view.state.tr
  // 倒序替换避免位置失效
  for (const { from, to } of [...matches].reverse()) {
    tr = tr.insertText(replacement, from, to)
  }
  view.dispatch(tr)
  return matches.length
}

/** 搜索高亮装饰插件 */
export const searchDecorationPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state: EditorState): DecorationSet {
          const { query, matches, activeIndex } = searchState
          if (!query || matches.length === 0) return DecorationSet.empty
          const decos: Decoration[] = []
          matches.forEach((m, i) => {
            if (i === activeIndex) {
              decos.push(Decoration.inline(m.from, m.to, { class: 'search-active' }))
            } else {
              decos.push(Decoration.inline(m.from, m.to, { class: 'search-match' }))
            }
          })
          return DecorationSet.create(state.doc, decos)
        },
      },
    }),
)
