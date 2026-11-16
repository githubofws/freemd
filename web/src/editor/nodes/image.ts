import { $view } from '@milkdown/utils'
import { imageSchema } from '@milkdown/preset-commonmark'
import type { Node as PMNode } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'
import { activeTab } from '../../workspace'

/** 图片相对路径 → fs.local 虚拟域 URL（宿主把 fs.local 映射到文档所在目录） */
export function fsUrl(src: string): string {
  if (/^(https?:|data:|blob:)/.test(src) || src.startsWith('https://fs.local/')) return src
  const docPath = activeTab.value?.path
  if (!docPath) return src
  const rel = src.replace(/^\.\//, '').replace(/^\/+/, '')
  return `https://fs.local/${encodeURI(rel)}`
}

export function docDir(): string | null {
  const p = activeTab.value?.path
  if (!p) return null
  const norm = p.replace(/\\/g, '/')
  return norm.slice(0, norm.lastIndexOf('/')) || null
}

/**
 * 图片节点视图：
 * - 常态渲染 <img>（相对路径经 fs.local 解析）
 * - 选中时显示原始 Markdown `![alt](src)`
 * - 双击进入 alt/src 编辑表单，Enter/失焦提交
 */
export const imageView = $view(imageSchema.node, () => (node, view, getPos): NodeView => {
  let current: PMNode = node
  let editing = false

  const dom = document.createElement('span')
  dom.className = 'md-img-wrap'

  const img = document.createElement('img')
  img.className = 'md-img'
  img.draggable = true

  const raw = document.createElement('span')
  raw.className = 'md-img-raw'
  raw.spellcheck = false

  const form = document.createElement('span')
  form.className = 'md-img-form'
  const altInput = document.createElement('input')
  altInput.placeholder = 'alt'
  const srcInput = document.createElement('input')
  srcInput.placeholder = 'src'
  const applyBtn = document.createElement('button')
  applyBtn.textContent = '应用'
  form.append('![', altInput, '](', srcInput, ')', applyBtn)

  function apply() {
    const src = String(current.attrs.src ?? '')
    img.src = fsUrl(src)
    img.alt = String(current.attrs.alt ?? '')
    img.title = String(current.attrs.title ?? '')
  }
  apply()
  renderMode()
  img.addEventListener('error', () => img.classList.add('is-broken'))
  img.addEventListener('load', () => img.classList.remove('is-broken'))

  function renderMode() {
    dom.replaceChildren()
    if (editing) {
      dom.appendChild(form)
      altInput.value = String(current.attrs.alt ?? '')
      srcInput.value = String(current.attrs.src ?? '')
    } else {
      dom.append(img)
    }
  }

  function showRaw() {
    if (editing) return
    raw.textContent = `![${String(current.attrs.alt ?? '')}](${String(current.attrs.src ?? '')})`
    dom.replaceChildren(raw)
  }

  function startEdit() {
    editing = true
    dom.classList.add('is-editing')
    renderMode()
    srcInput.focus()
  }

  function commit() {
    if (!editing) return
    editing = false
    dom.classList.remove('is-editing')
    const pos = getPos()
    if (pos !== undefined) {
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...current.attrs,
          alt: altInput.value,
          src: srcInput.value,
        }),
      )
    }
    renderMode()
  }

  function cancel() {
    editing = false
    dom.classList.remove('is-editing')
    renderMode()
  }

  applyBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    commit()
  })
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
    e.stopPropagation()
  })
  form.addEventListener('click', (e) => e.stopPropagation())
  form.addEventListener('mousedown', (e) => e.stopPropagation())
  dom.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    e.preventDefault()
    startEdit()
  })

  return {
    dom,
    update(updated) {
      if (updated.type.name !== current.type.name) return false
      current = updated
      apply()
      if (!editing) renderMode()
      return true
    },
    selectNode() {
      dom.classList.add('is-selected')
      // Typora 行为：选中图片显示原始 Markdown
      showRaw()
    },
    deselectNode() {
      dom.classList.remove('is-selected')
      cancel()
    },
    stopEvent() {
      return editing
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      dom.remove()
    },
  }
})
