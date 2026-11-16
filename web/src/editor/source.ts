import { defaultKeymap, history, historyKeymap, indentWithTab, redo, selectAll, undo } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

export interface SearchOptions {
  caseSensitive: boolean
  regexp: boolean
}

export interface SourceOptions {
  container: HTMLElement
  initialText: string
  onMarkdown: (md: string) => void
  onActivity: () => void
}

export interface SourceEditor {
  getMarkdown(): string
  focus(): void
  caret(): { line: number; col: number }
  scrollToLine(line: number): void
  centerCaret(): void
  setSearch(query: string, options: SearchOptions, replace?: string): void
  findNext(): boolean
  findPrev(): boolean
  replaceNext(replacement: string): boolean
  replaceAllMatches(replacement: string): void
  /** 自身根元素（供挂载竞态清理） */
  domEl(): HTMLElement
  undo(): boolean
  redo(): boolean
  selectAll(): boolean
  destroy(): void
}

export function createSource(opts: SourceOptions): SourceEditor {
  let latest = opts.initialText
  let lastQuery: SearchQuery | null = null

  function applyQuery(query: string, options: SearchOptions, replace?: string): void {
    lastQuery = new SearchQuery({
      search: query,
      caseSensitive: options.caseSensitive,
      regexp: options.regexp,
      replace,
    })
    view.dispatch({ effects: setSearchQuery.of(lastQuery) })
  }

  const view = new EditorView({
    state: EditorState.create({
      doc: opts.initialText,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'transparent' },
          '.cm-scroller': {
            fontFamily: "'Cascadia Code', Consolas, 'Microsoft YaHei UI', monospace",
            fontSize: 'calc(14px * var(--editor-zoom, 1))',
            lineHeight: 1.7,
          },
          '.cm-content': { padding: '48px 0 45vh', maxWidth: '860px', margin: '0 auto' },
          '&.cm-focused': { outline: 'none' },
          '.cm-gutters': { display: 'none' },
          '.cm-activeLine': { backgroundColor: 'transparent' },
          '.cm-line': { padding: '0 24px' },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            latest = u.state.doc.toString()
            opts.onMarkdown(latest)
          }
          if (u.selectionSet || u.docChanged) opts.onActivity()
        }),
      ],
    }),
    parent: opts.container,
  })

  return {
    getMarkdown: () => latest,
    focus: () => view.focus(),
    caret: () => caretPosition(view),
    scrollToLine(line: number) {
      const pos = view.state.doc.line(Math.min(line + 1, view.state.doc.lines)).from
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
      view.focus()
    },
    centerCaret() {
      const pos = view.state.selection.main.from
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    },
    setSearch: (query, options, replace) => applyQuery(query, options, replace),
    findNext: () => (lastQuery ? findNext(view) : false),
    findPrev: () => (lastQuery ? findPrevious(view) : false),
    replaceNext: (replacement) => {
      if (!lastQuery) return false
      lastQuery = new SearchQuery({
        search: lastQuery.search,
        caseSensitive: lastQuery.caseSensitive,
        regexp: lastQuery.regexp,
        replace: replacement,
      })
      view.dispatch({ effects: setSearchQuery.of(lastQuery) })
      return replaceNext(view)
    },
    replaceAllMatches: (replacement) => {
      if (!lastQuery) return
      lastQuery = new SearchQuery({
        search: lastQuery.search,
        caseSensitive: lastQuery.caseSensitive,
        regexp: lastQuery.regexp,
        replace: replacement,
      })
      view.dispatch({ effects: setSearchQuery.of(lastQuery) })
      replaceAll(view)
    },
    domEl: () => view.dom as HTMLElement,
    undo: () => undo(view),
    redo: () => redo(view),
    selectAll: () => selectAll(view),
    destroy: () => view.destroy(),
  }
}

/** 当前行:列 */
export function caretPosition(view: EditorView): { line: number; col: number } {
  const before = view.state.doc.toString().slice(0, view.state.selection.main.from)
  const lines = before.split('\n')
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 }
}
