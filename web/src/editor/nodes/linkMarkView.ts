import { $view } from '@milkdown/utils'
import { linkSchema } from '@milkdown/preset-commonmark'
import { getMarkRange } from '@milkdown/prose'
import { invoke } from '../../bridge'

/**
 * 链接标记视图：
 * - 常态渲染文本（样式由 CSS a 控制）
 * - 光标进入时在尾部显示 (href) 原始片段与编辑输入框
 * - Enter/失焦提交新链接
 */
export const linkMarkView = $view(linkSchema.mark, () => (markArg, viewArg) => {
  let mark = markArg
  const view = viewArg
  let editing = false
  let editRange: { from: number; to: number } | null = null

  const dom = document.createElement('a')
  dom.className = 'md-link-view'
  dom.setAttribute('data-href', String(mark.attrs.href ?? ''))
  const contentDOM = document.createElement('span')
  dom.appendChild(contentDOM)

  const editor = document.createElement('span')
  editor.className = 'md-link-editor'
  const prefix = document.createElement('span')
  prefix.className = 'md-syn'
  prefix.textContent = '('
  const input = document.createElement('input')
  input.className = 'md-link-input'
  input.spellcheck = false
  const suffix = document.createElement('span')
  suffix.className = 'md-syn'
  suffix.textContent = ')'
  editor.append(prefix, input, suffix)

  function startEdit($pos?: import('prosemirror-model').ResolvedPos) {
    if (editing) return
    // 定位标记范围：优先用事件坐标解析的位置，其次当前选区
    // （输入框聚焦后 PM 选区已不在链接内，所以必须在打开时锁定范围）
    const { state } = view
    const resolved = $pos ?? state.selection.$from
    const range = getMarkRange(resolved, mark.type)
    if (!range) return
    editRange = range
    editing = true
    input.value = String(mark.attrs.href ?? '')
    dom.classList.add('is-editing')
    dom.appendChild(editor)
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }

  function commit() {
    if (!editing) return
    editing = false
    dom.classList.remove('is-editing')
    editor.remove()
    const range = editRange
    editRange = null
    if (!range) return
    const { state } = view
    view.dispatch(
      state.tr
        .removeMark(range.from, range.to, mark.type)
        .addMark(range.from, range.to, mark.type.create({ ...mark.attrs, href: input.value })),
    )
  }

  function cancel() {
    if (!editing) return
    editing = false
    dom.classList.remove('is-editing')
    editor.remove()
  }

  input.addEventListener('blur', () => commit())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
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
    e.preventDefault()
    const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
    startEdit(pos ? view.state.doc.resolve(pos.pos) : undefined)
  })

  // Ctrl 悬停：手型光标提示“可点击打开”（Typora 同款交互）
  // 覆盖两种路径：按住 Ctrl 移入（mouseenter 自带 ctrlKey）；
  // 已悬停再按下/松开 Ctrl（window keydown/keyup 跟踪）
  let hovered = false
  let ctrlDown = false
  const applyCtrlCursor = () => dom.classList.toggle('is-ctrl', hovered && ctrlDown)
  const onCtrlKey = (e: KeyboardEvent) => {
    if (e.key === 'Control') {
      ctrlDown = e.type === 'keydown'
      applyCtrlCursor()
    }
  }
  const onWinBlur = () => {
    ctrlDown = false
    applyCtrlCursor()
  }
  const attachCtrlTracking = () => {
    window.addEventListener('keydown', onCtrlKey, true)
    window.addEventListener('keyup', onCtrlKey, true)
    window.addEventListener('blur', onWinBlur)
  }
  const detachCtrlTracking = () => {
    window.removeEventListener('keydown', onCtrlKey, true)
    window.removeEventListener('keyup', onCtrlKey, true)
    window.removeEventListener('blur', onWinBlur)
  }
  dom.addEventListener('mouseenter', (e) => {
    hovered = true
    ctrlDown = (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey
    attachCtrlTracking()
    applyCtrlCursor()
  })
  dom.addEventListener('mouseleave', () => {
    hovered = false
    detachCtrlTracking()
    applyCtrlCursor()
  })

  // Ctrl+点击：外部浏览器打开（普通点击仅定位光标，编辑态除外）
  dom.addEventListener('click', (e) => {
    if (editing) return
    if (!(e.ctrlKey || e.metaKey)) return
    const href = String(mark.attrs.href ?? '')
    if (!/^https?:\/\//i.test(href)) return
    e.preventDefault()
    e.stopPropagation()
    invoke('window:openExternal', { url: href }).catch(() => {})
  })

  return {
    dom,
    contentDOM,
    update(updatedMark) {
      mark = updatedMark
      dom.setAttribute('data-href', String(mark.attrs.href ?? ''))
      return true
    },
    selectNode() {
      // 光标进入链接：显示 (href) 编辑器
      startEdit()
    },
    deselectNode() {
      commit()
    },
    stopEvent(e: Event) {
      return editing || e.type === 'dblclick'
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      detachCtrlTracking()
      dom.remove()
    },
  }
})
