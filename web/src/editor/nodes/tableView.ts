import { $view } from '@milkdown/utils'
import { tableSchema } from '@milkdown/preset-gfm'

/** 表格工具栏按钮定义（命令由 App 层通过 md-table-cmd 事件执行） */
const buttons: Array<{ label: string; title: string; cmd: string; align?: string }> = [
  { label: '＋行', title: '下方插入行', cmd: 'addRow' },
  { label: '＋列', title: '右侧插入列', cmd: 'addCol' },
  { label: '－行', title: '删除当前行', cmd: 'delRow' },
  { label: '－列', title: '删除当前列', cmd: 'delCol' },
  { label: '左', title: '当前列左对齐', cmd: 'align', align: 'left' },
  { label: '中', title: '当前列居中', cmd: 'align', align: 'center' },
  { label: '右', title: '当前列右对齐', cmd: 'align', align: 'right' },
]

/**
 * 表格节点视图：
 * - 常态渲染 <table>（样式由 CSS 控制）
 * - 悬停/聚焦时右上角浮出工具栏（增删行列、列对齐），
 *   按钮通过 md-table-cmd 事件交由 App 层执行 milkdown 表格命令
 */
export const tableView = $view(tableSchema.node, () => (node) => {
  const dom = document.createElement('div')
  dom.className = 'tbl-wrap'

  const contentDOM = document.createElement('table')
  contentDOM.className = 'md-table'
  dom.appendChild(contentDOM)

  const toolbar = document.createElement('div')
  toolbar.className = 'tbl-toolbar'
  toolbar.setAttribute('contenteditable', 'false')
  for (const btn of buttons) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = btn.label
    b.title = btn.title
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('md-table-cmd', { detail: { cmd: btn.cmd, align: btn.align } }))
    })
    toolbar.appendChild(b)
  }
  dom.appendChild(toolbar)

  // 工具栏不参与编辑事件
  toolbar.addEventListener('mousedown', (e) => e.stopPropagation())
  toolbar.addEventListener('dblclick', (e) => e.stopPropagation())

  return {
    dom,
    contentDOM,
    update(updated) {
      return updated.type.name === node.type.name
    },
    destroy() {
      dom.remove()
    },
  }
})
