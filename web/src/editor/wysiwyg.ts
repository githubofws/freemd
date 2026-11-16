import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkPluginsCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/core'
import { callCommand } from '@milkdown/utils'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import 'katex/dist/katex.min.css'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { docDir } from './nodes/image'
import { invoke } from '../bridge'
import { inlineMathSchema, inlineMathView, mathBlockSchema, mathBlockView } from './nodes/math'
import { codeBlockView, codeHighlightPlugin } from './nodes/codeBlockView'
import { frontmatterSchema, frontmatterView, tocDecorationPlugin } from './nodes/extra'
import { imageView } from './nodes/image'
import { headingView } from './nodes/headingView'
import { linkMarkView } from './nodes/linkMarkView'
import { activeSyntaxPlugin } from './nodes/activeSyntax'
import { highlightSchema, remarkHighlight } from './nodes/highlight'
import { tableView } from './nodes/tableView'
import { searchDecorationPlugin } from './search'

export interface WysiwygOptions {
  container: HTMLElement
  initialText: string
  onMarkdown: (md: string) => void
  onActivity: () => void
}

export interface WysiwygEditor {
  /** 直接从 ProseMirror 文档同步序列化（保存/导出永远最新） */
  getMarkdown(): string
  focus(): void
  /** 在 ProseMirror 视图上执行操作（命令/状态读取） */
  withView<T>(fn: (view: EditorView) => T): T | undefined
  /** 调用 milkdown 命令（表格增删行列/对齐等） */
  call(key: string, payload?: unknown): boolean
  destroy(): void
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/')
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 保存图片到文档旁的 assets 目录，返回相对路径 */
async function saveImageToAssets(file: File): Promise<string | null> {
  const dir = docDir()
  if (!dir) {
    console.warn('MyTypora: 请先保存文档，再粘贴/拖入图片')
    return null
  }
  try {
    const base64 = arrayBufferToBase64(await file.arrayBuffer())
    const res = await invoke<{ name: string; relPath: string }>('file:writeBase64', {
      dir: `${dir}/assets`,
      name: file.name || `image-${Date.now()}`,
      base64,
    })
    return res.relPath
  } catch (e) {
    console.error('保存图片失败', e)
    return null
  }
}

function insertImage(view: EditorView, src: string, alt: string, pos?: number): void {
  const schema = view.state.schema
  const img = schema.nodes.image?.create({ src, alt })
  if (!img) return
  if (pos !== undefined) {
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))))
  }
  view.dispatch(view.state.tr.replaceSelectionWith(img))
  view.focus()
}

export async function createWysiwyg(opts: WysiwygOptions): Promise<WysiwygEditor> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, opts.container)
      ctx.set(defaultValueCtx, opts.initialText)

      // remark 插件：数学公式 / front matter（[TOC] 由段落装饰插件处理，无需 remark 转换）
      // milkdown 要求 {plugin, options} 包装格式，裸插件会被静默忽略
      ctx.update(remarkPluginsCtx, (plugins) =>
        [
          ...plugins,
          { plugin: remarkMath, options: {} },
          { plugin: remarkFrontmatter, options: ['yaml'] },
          { plugin: remarkHighlight, options: {} },
        ] as typeof plugins)

      // 序列化风格对齐 Typora：无序列表用 '-'（remark 默认 '*'），自定义 highlight 节点的输出
      ctx.update(remarkStringifyOptionsCtx, (prev) =>
        ({
          ...prev,
          bullet: '-',
          handlers: {
            ...(prev.handlers ?? {}),
            highlight: (node: { children?: Array<{ value?: string; children?: unknown[] }> }) => {
              const flatten = (n: { value?: string; children?: Array<unknown> }): string =>
                n.value ?? (n.children ?? []).map((c) => flatten(c as never)).join('')
              return '==' + flatten(node) + '=='
            },
          },
        }) as typeof prev)

      // dirty 标记与大纲刷新走这里；保存/导出的序列化走 getMarkdown 的直接序列化
      ctx.get(listenerCtx).markdownUpdated((_ctx, _prev, next) => {
        opts.onMarkdown(next)
      })

      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        attributes: { ...(prev.attributes ?? {}), class: 'mytypora-write', spellcheck: 'false' },
        // 拦截事务分发：保持默认更新逻辑，同时给状态栏发信号
        dispatchTransaction(this: EditorView, tr) {
          this.updateState(this.state.apply(tr))
          opts.onActivity()
        },
        // 粘贴/拖入图片 → 存 assets 并插入
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter(isImageFile)
          if (files.length === 0) return false
          event.preventDefault()
          void (async () => {
            for (const f of files) {
              const rel = await saveImageToAssets(f)
              if (rel) insertImage(view, rel, f.name)
            }
          })()
          return true
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false
          const files = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile)
          if (files.length === 0) return false
          event.preventDefault()
          const clientX = event.clientX
          const clientY = event.clientY
          void (async () => {
            const pos = view.posAtCoords({ left: clientX, top: clientY })?.pos
            for (const f of files) {
              const rel = await saveImageToAssets(f)
              if (rel) insertImage(view, rel, f.name, pos)
            }
          })()
          return true
        },
      }))
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(inlineMathSchema)
    .use(mathBlockSchema)
    .use(inlineMathView)
    .use(mathBlockView)
    .use(codeBlockView)
    .use(codeHighlightPlugin)
    .use(frontmatterSchema)
    .use(frontmatterView)
    .use(tocDecorationPlugin)
    .use(imageView)
    .use(headingView)
    .use(linkMarkView)
    .use(tableView)
    .use(highlightSchema)
    .use(activeSyntaxPlugin)
    .use(searchDecorationPlugin)
    .create()

  return {
    // 直接从 ProseMirror 文档同步序列化，保证保存/导出永远拿到最新内容
    // （listener 的 markdownUpdated 缓存有延迟，不能用于保存路径）
    getMarkdown() {
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        return ctx.get(serializerCtx)(view.state.doc)
      })
    },
    focus() {
      editor.action((ctx) => ctx.get(editorViewCtx).focus())
    },
    withView<T>(fn: (view: EditorView) => T): T | undefined {
      return editor.action((ctx) => fn(ctx.get(editorViewCtx)))
    },
    call(key: string, payload?: unknown): boolean {
      return editor.action(callCommand(key, payload))
    },
    destroy() {
      editor.destroy()
    },
  }
}

/** 当前行:列（近似值：用 '\n' 连接块级文本估算） */
export function caretPosition(view: EditorView): { line: number; col: number } {
  const { from } = view.state.selection
  const textBefore = view.state.doc.textBetween(0, from, '\n', '\n')
  const lines = textBefore.split('\n')
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 }
}
