<script setup lang="ts">
import type { ShallowRef } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { invoke, isHostAvailable, on } from './bridge'
import FindPanel from './components/FindPanel.vue'
import SettingsPanel, { type AppSettings } from './components/SettingsPanel.vue'
import Sidebar from './components/Sidebar.vue'
import StatusBar from './components/StatusBar.vue'
import TabBar from './components/TabBar.vue'
import { countText } from './editor/stats'
import {
  getSearchState,
  jumpTo as searchJumpTo,
  refreshMatches,
  replaceAllInView,
  replaceCurrent as searchReplaceCurrent,
  setSearch,
} from './editor/search'
import { caretPosition as pmCaret, createWysiwyg, type WysiwygEditor } from './editor/wysiwyg'
import { createSource, type SourceEditor } from './editor/source'
import type { OutlineItem } from './editor/outline'
import { extractOutline } from './editor/outline'
import {
  addColAfterCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
  selectColCommand,
  selectRowCommand,
  setAlignCommand,
} from '@milkdown/preset-gfm'
import { redo as pmRedo, undo as pmUndo } from 'prosemirror-history'
import { selectAll as pmSelectAll, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Node as PMNode, Schema } from 'prosemirror-model'
import {
  activeId,
  activeTab,
  anyDirty,
  baseName,
  createTab,
  dirty,
  fileName,
  findTabByPath,
  meta,
  mode,
  removeTab,
  resetWithSingleTab,
  sidebarMode,
  sidebarOpen,
  tabs,
  updateActiveText,
  zoom,
  applyZoom,
  resetZoom,
} from './workspace'
import { openFolder } from './stores/fileTree'
import './styles/editor.css'

/* ---------- 界面状态 ---------- */

const logs = ref<string[]>([])
const bridgeStatus = ref(isHostAvailable ? '已连接' : '浏览器预览模式')
const status = ref({ words: 0, chars: 0, line: 1, col: 1 })
const isFullscreen = ref(false)
const editorHost = ref<HTMLElement | null>(null)
const devlogVisible = ref(false)
const externalBanner = ref<{ path: string } | null>(null)

/* ---------- 主题与编辑模式（M4） ---------- */
type ThemeName = 'github' | 'dark' | 'paper'
const theme = ref<ThemeName>(
  (localStorage.getItem('mytypora-theme') as ThemeName | null) ?? 'github',
)
const typewriterMode = ref(false)
const focusMode = ref(false)

function applyTheme(t: ThemeName) {
  theme.value = t
  localStorage.setItem('mytypora-theme', t)
  document.documentElement.dataset.theme = t
  invoke('window:setChrome', { theme: t }).catch(() => {})
  log(`主题已切换: ${t}`)
}

function toggleTypewriter() {
  typewriterMode.value = !typewriterMode.value
  if (typewriterMode.value) applyTypewriter()
}

function toggleFocus() {
  focusMode.value = !focusMode.value
  if (!focusMode.value) clearActiveBlock()
  else applyFocusMode()
}

function applyTypewriter() {
  if (!typewriterMode.value) return
  const host = editorHost.value
  if (!host) return
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      const coords = view.coordsAtPos(view.state.selection.from)
      if (!coords) return true
      const hostRect = host.getBoundingClientRect()
      const delta = coords.top - (hostRect.top + hostRect.height / 2)
      if (Math.abs(delta) > 12) host.scrollTop += delta
      return true
    })
  } else if (sourceEd.value) {
    sourceEd.value.centerCaret()
  }
}

function clearActiveBlock() {
  document.querySelectorAll('.is-active-block').forEach((el) => el.classList.remove('is-active-block'))
}

function applyFocusMode() {
  if (!focusMode.value || !wysiwyg.value) return
  wysiwyg.value.withView((view) => {
    const { $from } = view.state.selection
    const idx = $from.index(0)
    Array.from((view.dom as HTMLElement).children).forEach((el, i) =>
      el.classList.toggle('is-active-block', i === idx),
    )
    return true
  })
}

/* ---------- 查找替换（M5） ---------- */

const findVisible = ref(false)
const findQuery = ref('')
const findReplacement = ref('')
const findCase = ref(false)
const findRegex = ref(false)
const findCount = ref(-1)

function findOptions() {
  return { caseSensitive: findCase.value, regexp: findRegex.value }
}

function runSearch() {
  if (!findVisible.value) return
  const opts = findOptions()
  if (wysiwyg.value) {
    setSearch(findQuery.value, opts)
    wysiwyg.value.withView((view) => {
      refreshMatches(view)
    })
    findCount.value = getSearchState().matches.length
  } else if (sourceEd.value) {
    sourceEd.value.setSearch(findQuery.value, opts, findReplacement.value)
    findCount.value = -1
  }
}

function findNext() {
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      searchJumpTo(view, getSearchState().activeIndex + 1)
    })
  } else {
    sourceEd.value?.findNext()
  }
}

function findPrev() {
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      searchJumpTo(view, getSearchState().activeIndex - 1)
    })
  } else {
    sourceEd.value?.findPrev()
  }
}

function replaceOne() {
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      searchReplaceCurrent(view, findReplacement.value)
    })
    runSearch()
  } else {
    sourceEd.value?.replaceNext(findReplacement.value)
  }
}

function replaceEverything() {
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      replaceAllInView(view, findReplacement.value)
    })
    runSearch()
  } else {
    sourceEd.value?.replaceAllMatches(findReplacement.value)
  }
}

function openFind() {
  findVisible.value = true
  runSearch()
}

function closeFind() {
  findVisible.value = false
  setSearch('', findOptions())
  if (sourceEd.value) sourceEd.value.setSearch('', findOptions())
  focusEditor()
}

/* ---------- 导出（M5） ---------- */

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function currentThemeVars(): Promise<string> {
  const cs = getComputedStyle(document.documentElement)
  const names = ['--bg', '--fg', '--fg-soft', '--border', '--code-bg', '--accent']
  const lines = names.map((n) => `${n}: ${cs.getPropertyValue(n).trim()};`)
  return `:root{${lines.join('')}}`
}

async function exportHtml(targetPath?: string) {
  try {
    stashCurrentTab()
    const write = document.querySelector('.mytypora-write')
    if (!write) return
    let css = ''
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        css += Array.from(sheet.cssRules).map((r) => r.cssText).join('\n') + '\n'
      } catch { /* 跨域样式表跳过 */ }
    }
    const themeVars = await currentThemeVars()
    const clone = write.cloneNode(true) as HTMLElement
    for (const img of Array.from(clone.querySelectorAll('img'))) {
      const src = img.getAttribute('src') ?? ''
      if (src.startsWith('https://fs.local/')) {
        try {
          img.setAttribute('src', await blobToDataUrl(await (await fetch(src)).blob()))
        } catch { /* 内联失败保持原样 */ }
      }
    }
    const title = fileName.value.replace(/\.md$/i, '')
    const html =
      `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n` +
      `<style>${css}\n${themeVars}\nbody{max-width:860px;margin:0 auto;padding:48px 24px;}\n` +
      `.toc-paragraph{font-size:0!important}.toc-widget{font-size:14px}</style>\n</head>\n` +
      `<body><div id="write" class="mytypora-write">${clone.innerHTML}</div></body>\n</html>\n`
    let path = targetPath
    if (!path) {
      path = await invoke<string | null>('dialog:pickSaveFile', {
        suggestedName: `${title}.html`,
        defaultExt: 'html',
        filterName: 'HTML 文件',
      })
      if (!path) return
    }
    await invoke('file:write', { path, text: html, encoding: 'utf-8', bom: false })
    log(`已导出 HTML: ${path}`)
  } catch (e) {
    log(`导出 HTML 失败: ${String(e)}`)
  }
}

async function exportPdf(targetPath?: string) {
  try {
    const title = fileName.value.replace(/\.md$/i, '')
    let path = targetPath
    if (!path) {
      path = await invoke<string | null>('dialog:pickSaveFile', {
        suggestedName: `${title}.pdf`,
        defaultExt: 'pdf',
        filterName: 'PDF 文件',
      })
      if (!path) return
    }
    document.body.classList.add('printing')
    await invoke('export:printPdf', { path })
    document.body.classList.remove('printing')
    log(`已导出 PDF: ${path}`)
  } catch (e) {
    document.body.classList.remove('printing')
    log(`导出 PDF 失败: ${String(e)}`)
  }
}

/* ---------- 设置与自动保存（M5） ---------- */

const settingsVisible = ref(false)

const settings = ref<AppSettings>({
  theme: 'github',
  typewriter: false,
  focus: false,
  autosave: false,
  autosaveInterval: 3,
  baseFontSize: 16,
})

let saveTimer: number | undefined

function scheduleSettingsSave() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    invoke('settings:save', { values: { ...settings.value } }).catch(() => {})
  }, 400)
}

function onSettingChange(key: keyof AppSettings, value: string | number | boolean) {
  ;(settings.value as unknown as Record<string, unknown>)[key] = value
  applySettings(key)
  scheduleSettingsSave()
}

function applySettings(changed?: keyof AppSettings) {
  if (!changed || changed === 'theme') applyTheme(settings.value.theme)
  if (!changed || changed === 'typewriter') {
    typewriterMode.value = settings.value.typewriter
    if (typewriterMode.value) applyTypewriter()
  }
  if (!changed || changed === 'focus') {
    focusMode.value = settings.value.focus
    if (focusMode.value) applyFocusMode()
    else clearActiveBlock()
  }
  if (!changed || changed === 'baseFontSize') {
    document.documentElement.style.setProperty('--editor-base', `${settings.value.baseFontSize}px`)
  }
}

async function loadSettings() {
  try {
    const saved = await invoke<Partial<AppSettings>>('settings:get')
    settings.value = { ...settings.value, ...saved }
  } catch { /* 用默认值 */ }
  applySettings()
}

function autosaveTick() {
  const tab = activeTab.value
  if (!settings.value.autosave || !tab?.dirty || !tab.path) return
  void save(false)
}

setInterval(() => autosaveTick(), 30_000)

function openSettings() {
  settingsVisible.value = true
}

function log(msg: string) {
  logs.value.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`)
  if (logs.value.length > 60) logs.value.pop()
  ;(globalThis as Record<string, unknown>).__mytyporaLogs = [...logs.value]
}

const tabItems = computed(() =>
  tabs.value.map((t) => ({ id: t.id, title: t.path ? baseName(t.path) : '未命名', dirty: t.dirty })),
)

/* ---------- 编辑器生命周期 ---------- */

const wysiwyg: ShallowRef<WysiwygEditor | null> = shallowRef(null)
const sourceEd: ShallowRef<SourceEditor | null> = shallowRef(null)

function destroyEditors() {
  wysiwyg.value?.destroy()
  wysiwyg.value = null
  sourceEd.value?.destroy()
  sourceEd.value = null
  // Milkdown/CodeMirror 的 destroy 不会移除自身 DOM，需手动清空容器
  if (editorHost.value) editorHost.value.innerHTML = ''
}

let mountSeq = 0

async function mountEditor() {
  const seq = ++mountSeq
  await nextTick()
  const host = editorHost.value
  if (!host) return
  destroyEditors()
  externalBanner.value = null
  host.scrollTop = 0
  const initial = activeTab.value?.text ?? ''
  try {
    if (mode.value === 'wysiwyg') {
      const ed = await createWysiwyg({
        container: host,
        initialText: initial,
        onMarkdown: updateActiveText,
        onActivity: refreshStatus,
      })
      // 挂载期间又有新挂载请求：只销毁自己的实例与根元素，勿动更新者的 DOM
      if (seq !== mountSeq) {
        if (wysiwyg.value === ed) wysiwyg.value = null
        ed.withView((v) => {
          v.dom.remove()
          return true
        })
        ed.destroy()
        return
      }
      wysiwyg.value = ed
    } else {
      const ed = createSource({
        container: host,
        initialText: initial,
        onMarkdown: updateActiveText,
        onActivity: refreshStatus,
      })
      if (seq !== mountSeq) {
        if (sourceEd.value === ed) sourceEd.value = null
        ed.domEl().remove()
        ed.destroy()
        return
      }
      sourceEd.value = ed
    }
  } catch (e) {
    log(`编辑器创建失败: ${String(e)}`)
  }
  // 归一化基线：初始序列化可能与磁盘原文有风格差异（表格空白等），
  // 打开时归一一次，避免"刚打开就标脏"
  const tab = activeTab.value
  if (tab) {
    const normalized = currentText()
    if (normalized !== tab.text) tab.text = normalized
    tab.dirty = false
  }
  refreshStatus()
  focusEditor()
  syncTitle()
}

function focusEditor() {
  wysiwyg.value?.focus()
  sourceEd.value?.focus()
}

function toggleMode() {
  const current = currentText()
  if (activeTab.value && current !== activeTab.value.text) updateActiveText(current)
  mode.value = mode.value === 'wysiwyg' ? 'source' : 'wysiwyg'
}

function currentText(): string {
  return wysiwyg.value?.getMarkdown() ?? sourceEd.value?.getMarkdown() ?? activeTab.value?.text ?? ''
}

function refreshStatus() {
  const { words, chars } = countText(currentText())
  let line = 1
  let col = 1
  wysiwyg.value?.withView((view) => {
    ;({ line, col } = pmCaret(view))
  })
  if (sourceEd.value) ({ line, col } = sourceEd.value.caret())
  status.value = { words, chars, line, col }
  applyTypewriter()
  applyFocusMode()
}

function syncTitle() {
  const title = `${dirty.value ? '*' : ''}${fileName.value} - FreeMD`
  invoke('window:setTitle', { title }).catch(() => {})
}

watch(mode, () => mountEditor())
watch(activeId, () => mountEditor())
watch(zoom, () => refreshStatus())

// 文档目录变化 → 更新 fs.local 虚拟域映射（图片相对路径加载）
watch(
  () => activeTab.value?.path ?? null,
  (path) => {
    if (!path) return
    const norm = path.replace(/\\/g, '/')
    const dir = norm.slice(0, norm.lastIndexOf('/'))
    if (dir) invoke('window:mapFs', { path: dir }).catch(() => {})
  },
)

/* ---------- 标签页操作 ---------- */

/** 切走前把活动编辑器最新内容写回标签 */
function stashCurrentTab() {
  const t = activeTab.value
  if (!t) return
  const cur = currentText()
  if (cur !== t.text) {
    t.text = cur
    t.dirty = true
  }
}

async function selectTab(id: number) {
  if (id === activeId.value) return
  stashCurrentTab()
  activeId.value = id
}

async function closeTabAction(id: number) {
  const tab = tabs.value.find((t) => t.id === id)
  if (!tab) return
  if (tab.dirty && isHostAvailable) {
    const ok = await invoke<boolean>('dialog:confirm', {
      title: '未保存的更改',
      message: `「${tab.path ? baseName(tab.path) : '未命名'}」已修改但尚未保存，是否丢弃并关闭？`,
    })
    if (!ok) return
  }
  if (tab.path) await invoke('watch:stop', { path: tab.path }).catch(() => {})
  removeTab(id)
}

async function confirmDiscardActive(): Promise<boolean> {
  if (!dirty.value || !isHostAvailable) return true
  return invoke<boolean>('dialog:confirm', {
    title: '未保存的更改',
    message: `「${fileName.value}」已修改但尚未保存，是否丢弃更改并继续？`,
  })
}

/* ---------- 文档动作 ---------- */

async function doNew() {
  createTab(null, '', { encoding: 'utf-8', bom: false, eol: 'lf' })
}

async function openByPath(path: string) {
  try {
    const existing = findTabByPath(path)
    if (existing) {
      stashCurrentTab()
      activeId.value = existing.id
      return
    }
    const f = await invoke<{ text: string; encoding: string; bom: boolean; eol: string; mtime: string }>(
      'file:read',
      { path },
    )
    stashCurrentTab()
    // 超大文档提示切换源码模式（ProseMirror 无行虚拟化，源码模式性能更好）
    if (f.text.length > 500_000 && isHostAvailable) {
      const useSource = await invoke<boolean>('dialog:confirm', {
        title: '大文档',
        message: `「${baseName(path)}」超过 500KB，建议以源代码模式获得更流畅的体验。使用源代码模式打开吗？（选"否"用所见即所得）`,
      }).catch(() => false)
      if (useSource) mode.value = 'source'
    }
    createTab(path, f.text, { encoding: f.encoding, bom: f.bom, eol: f.eol })
    await invoke('recent:add', { path }).catch(() => {})
    await invoke('watch:start', { path }).catch(() => {})
    log(`已打开 ${path}`)
  } catch (e) {
    log(`打开失败: ${String(e)}`)
  }
}

async function doOpen() {
  const path = await invoke<string | null>('dialog:pickOpenFile')
  if (!path) return
  await openByPath(path)
}

async function doOpenFolder() {
  const path = await openFolder()
  if (path) {
    sidebarOpen.value = true
    sidebarMode.value = 'tree'
    log(`已打开文件夹 ${path}`)
  }
}

async function save(as = false) {
  const tab = activeTab.value
  if (!tab) return
  try {
    let path = tab.path
    if (!path || as) {
      const name = fileName.value.endsWith('.md') ? fileName.value : `${fileName.value}.md`
      path = await invoke<string | null>('dialog:pickSaveFile', { suggestedName: name })
      if (!path) return
    }
    const content = currentText()
    tab.text = content
    await invoke('file:write', { path, text: content, encoding: tab.meta.encoding, bom: tab.meta.bom })
    const wasNew = tab.path !== path
    tab.path = path
    tab.dirty = false
    if (wasNew) {
      await invoke('recent:add', { path }).catch(() => {})
      await invoke('watch:start', { path }).catch(() => {})
    }
    log(`已保存 ${path}`)
  } catch (e) {
    log(`保存失败: ${String(e)}`)
  }
}

/* ---------- 外部修改监听 ---------- */

async function reloadExternal(path: string) {
  const tab = findTabByPath(path)
  if (!tab) return
  const f = await invoke<{ text: string; encoding: string; bom: boolean; eol: string }>('file:read', { path })
  tab.text = f.text
  tab.meta = { encoding: f.encoding, bom: f.bom, eol: f.eol }
  tab.dirty = false
  if (tab.id === activeId.value) await mountEditor()
}

on('file:external-change', async (payload) => {
  const { path } = (payload ?? {}) as { path?: string }
  if (!path) return
  const tab = findTabByPath(path)
  if (!tab) return
  try {
    const f = await invoke<{ text: string }>('file:read', { path })
    if (f.text === tab.text) return // 自己的保存触发
    if (!tab.dirty) {
      await reloadExternal(path)
      log(`已自动重载外部修改：${baseName(path)}`)
    } else {
      externalBanner.value = { path }
    }
  } catch {
    /* 文件可能被暂时占用 */
  }
})

async function bannerReload() {
  if (externalBanner.value) {
    await reloadExternal(externalBanner.value.path)
    externalBanner.value = null
  }
}

/* ---------- 编辑命令 ---------- */

function withWysiwygView(fn: (view: EditorView) => boolean): boolean {
  return wysiwyg.value?.withView(fn) ?? false
}

function cmdUndo() {
  if (wysiwyg.value) withWysiwygView((v) => pmUndo(v.state, v.dispatch))
  else sourceEd.value?.undo()
}

function cmdRedo() {
  if (wysiwyg.value) withWysiwygView((v) => pmRedo(v.state, v.dispatch))
  else sourceEd.value?.redo()
}

function cmdSelectAll() {
  if (wysiwyg.value) withWysiwygView((v) => pmSelectAll(v.state, v.dispatch))
  else sourceEd.value?.selectAll()
}

function setHeading(level: number) {
  const ok = withWysiwygView((v) => {
    const heading = v.state.schema.nodes.heading
    if (!heading) return false
    return setBlockType(heading, { level })(v.state, v.dispatch)
  })
  if (!ok && mode.value === 'source') log('格式命令请在所见即所得模式下使用')
}

function toggleMarkByNames(names: string[]) {
  const ok = withWysiwygView((v) => {
    const marks = v.state.schema.marks
    const mark = names.map((n) => marks[n]).find(Boolean)
    if (!mark) return false
    return toggleMark(mark)(v.state, v.dispatch)
  })
  if (!ok && mode.value === 'source') log('格式命令请在所见即所得模式下使用')
}

function cmdQuote() {
  const ok = withWysiwygView((v) => {
    const bq = v.state.schema.nodes.blockquote
    if (!bq) return false
    return wrapIn(bq)(v.state, v.dispatch)
  })
  if (!ok) log('当前上下文无法应用引用')
}

function cmdList(kind: 'ul' | 'ol') {
  const ok = withWysiwygView((v) => {
    const s = v.state.schema
    const listType = kind === 'ul' ? s.nodes.bullet_list : s.nodes.ordered_list
    if (!listType) return false
    return wrapInList(listType)(v.state, v.dispatch)
  })
  if (!ok) log('当前上下文无法应用列表')
}

function cmdCodeBlock() {
  const ok = withWysiwygView((v) => {
    const cb = v.state.schema.nodes.code_block
    if (!cb) return false
    return setBlockType(cb, { language: '' })(v.state, v.dispatch)
  })
  if (!ok) log('当前上下文无法应用代码块')
}

function insertMathBlock() {
  const ok = withWysiwygView((v) => {
    const mathBlock = v.state.schema.nodes.math_block
    if (!mathBlock) return false
    const pos = v.state.selection.from
    v.dispatch(v.state.tr.replaceSelectionWith(mathBlock.create({ value: 'E = mc^2' })))
    void pos
    return true
  })
  if (!ok && mode.value === 'source') log('请在所见即所得模式下插入公式块')
}

function buildTable(schema: Schema): PMNode | null {
  const { table, table_row: row, table_cell: cell, table_header: header, paragraph } = schema.nodes
  if (!table || !row || !cell || !header || !paragraph) return null
  const mk = (type: typeof cell, text: string) => type.create({}, paragraph.create({}, schema.text(text)))
  const headRow = row.create({}, [mk(header, '列 A'), mk(header, '列 B'), mk(header, '列 C')])
  const bodyRow = (a: string, b: string, c: string) => row.create({}, [mk(cell, a), mk(cell, b), mk(cell, c)])
  return table.create({}, [headRow, bodyRow('1', '2', '3'), bodyRow('4', '5', '6')])
}

function cmdInsertTable() {
  const ok = withWysiwygView((v) => {
    const t = buildTable(v.state.schema)
    if (!t) return false
    v.dispatch(v.state.tr.replaceSelectionWith(t))
    return true
  })
  if (!ok) log('当前上下文无法插入表格')
}

/* ---------- 超链接（Ctrl+K / 菜单 / 点击打开） ---------- */

const hrefOverlay = ref<{ from: number; to: number; value: string; left: number; top: number } | null>(null)
const hrefInputEl = ref<HTMLInputElement | null>(null)

function cmdLink() {
  if (!wysiwyg.value) {
    log('链接请在所见即所得模式下插入')
    return
  }
  wysiwyg.value.withView((view) => {
    const linkType = view.state.schema.marks.link
    if (!linkType) return false
    const { from, to, empty, $from } = view.state.selection
    let linkFrom = from
    let linkTo = to
    if (empty) {
      // Typora 行为：光标所在连续词直接变成链接（不插入占位文字）
      const parentText = $from.parent.textContent
      const off = $from.parentOffset
      const beforeWord = parentText.slice(0, off).match(/[^\s]+$/)?.[0] ?? ''
      const afterWord = parentText.slice(off).match(/^\S+/)?.[0] ?? ''
      const word = beforeWord + afterWord
      if (!word) {
        log('请先输入文字，再把光标放在词上按 Ctrl+K')
        return false
      }
      linkFrom = from - beforeWord.length
      linkTo = from + afterWord.length
    }
    view.dispatch(view.state.tr.addMark(linkFrom, linkTo, linkType.create({ href: '' })))
    const coords = view.coordsAtPos(linkTo)
    hrefOverlay.value = {
      from: linkFrom,
      to: linkTo,
      value: '',
      left: Math.min(coords.left, window.innerWidth - 320),
      top: coords.bottom + 8,
    }
    return true
  })
  nextTick(() => hrefInputEl.value?.focus())
}

function commitHref() {
  const o = hrefOverlay.value
  if (!o) return
  hrefOverlay.value = null
  wysiwyg.value?.withView((view) => {
    const linkType = view.state.schema.marks.link
    if (!linkType) return false
    const url = o.value.trim() || 'https://'
    view.dispatch(
      view.state.tr.removeMark(o.from, o.to, linkType).addMark(o.from, o.to, linkType.create({ href: url })),
    )
    view.focus()
    return true
  })
}

function cmdCopyAsMarkdown() {
  try {
    if (wysiwyg.value) {
      withWysiwygView((v) => {
        const { state } = v
        const md = state.doc.textBetween(state.selection.from, state.selection.to, '\n', ' ')
        navigator.clipboard.writeText(md).catch(() => {})
        return true
      })
    } else {
      const sel = window.getSelection()?.toString() ?? ''
      navigator.clipboard.writeText(sel).catch(() => {})
    }
    log('已复制所选内容')
  } catch (e) {
    log(String(e))
  }
}

/* ---------- 表格工具栏命令 ---------- */

function currentTableCellIndexes(): { row: number; col: number } | null {
  return (
    wysiwyg.value?.withView((view) => {
      const { $from } = view.state.selection
      let cellDepth = -1
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d)
        if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
          cellDepth = d
          break
        }
      }
      if (cellDepth < 1) return null
      return { row: $from.index(cellDepth - 2), col: $from.index(cellDepth - 1) }
    }) ?? null
  )
}

function onTableCmd(e: Event) {
  const { cmd, align } = (e as CustomEvent<{ cmd: string; align?: string }>).detail ?? {}
  const idx = currentTableCellIndexes()
  if (!idx || !wysiwyg.value) return
  const W = wysiwyg.value
  const run = (key: string, payload?: unknown) => W.call(key, payload)
  switch (cmd) {
    case 'addRow':
      run(addRowAfterCommand.key)
      break
    case 'addCol':
      run(addColAfterCommand.key)
      break
    case 'delRow':
      run(selectRowCommand.key, { index: idx.row })
      run(deleteSelectedCellsCommand.key)
      break
    case 'delCol':
      run(selectColCommand.key, { index: idx.col })
      run(deleteSelectedCellsCommand.key)
      break
    case 'align':
      run(selectColCommand.key, { index: idx.col })
      run(setAlignCommand.key, align ?? 'left')
      break
  }
}

/* ---------- 大纲跳转 ---------- */

function jumpToHeading(item: OutlineItem) {
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      let target: number | null = null
      const want = item.text
      view.state.doc.descendants((node, pos) => {
        if (target !== null) return false
        if (node.type.name === 'heading' && node.textContent.replace(/[*_~`]/g, '').trim() === want) {
          target = pos
          return false
        }
        return node.type.name !== 'codeBlock'
      })
      if (target !== null) {
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target + 1))),
        )
        const dom = view.nodeDOM(target) as HTMLElement | null
        dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        view.focus()
      } else {
        log('大纲定位失败（标题可能在代码块内）')
      }
    })
  } else if (sourceEd.value) {
    sourceEd.value.scrollToLine(item.line)
  }
}

/* ---------- 拖拽打开 ---------- */

async function onDrop(e: DragEvent) {
  // 图片交给编辑器的 handleDrop（存 assets 并插入），这里只处理 md 文件
  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => !f.type.startsWith('image/'))
  for (const f of files) {
    const path = (f as File & { path?: string }).path
    if (!path) {
      log('此环境未提供拖拽文件路径，请使用 文件 > 打开')
      continue
    }
    await openByPath(path)
  }
}

/* ---------- 菜单 / 快捷键 / 关闭守卫 ---------- */

async function handleMenu(id: string) {
  const handlers: Record<string, () => void> = {
    'file.new': () => void doNew(),
    'file.open': () => void doOpen(),
    'file.openFolder': () => void doOpenFolder(),
    'file.save': () => void save(false),
    'file.saveAs': () => void save(true),
    'file.saveAll': async () => {
      stashCurrentTab()
      for (const t of tabs.value.filter((x) => x.dirty && x.path)) {
        await invoke('file:write', { path: t.path, text: t.text, encoding: t.meta.encoding, bom: t.meta.bom })
        t.dirty = false
      }
      log('已保存全部')
    },
    'export.pdf': () => void exportPdf(),
    'export.html': () => void exportHtml(),
    'app.settings': openSettings,
    'edit.undo': cmdUndo,
    'edit.redo': cmdRedo,
    'edit.cut': () => document.execCommand('cut'),
    'edit.copy': () => document.execCommand('copy'),
    'edit.paste': async () => {
      try {
        const t = await navigator.clipboard.readText()
        document.execCommand('insertText', false, t)
      } catch {
        log('请使用 Ctrl+V 粘贴')
      }
    },
    'edit.selectAll': cmdSelectAll,
    'edit.find': openFind,
    'edit.copyAsMd': cmdCopyAsMarkdown,
    'para.h1': () => setHeading(1),
    'para.h2': () => setHeading(2),
    'para.h3': () => setHeading(3),
    'para.h4': () => setHeading(4),
    'para.h5': () => setHeading(5),
    'para.h6': () => setHeading(6),
    'para.quote': cmdQuote,
    'para.ul': () => cmdList('ul'),
    'para.ol': () => cmdList('ol'),
    'para.task': () => log('任务列表：请在列表项行首输入 [ ] 或 [x]'),
    'para.code': cmdCodeBlock,
    'para.mathBlock': insertMathBlock,
    'para.table': cmdInsertTable,
    'para.link': cmdLink,
    'para.image': () => log('图片：直接粘贴或拖入图片即可（需先保存文档）'),
    'fmt.bold': () => toggleMarkByNames(['strong']),
    'fmt.italic': () => toggleMarkByNames(['em', 'emphasis', 'italic']),
    'fmt.strike': () => toggleMarkByNames(['strike_through', 'strike', 'strikethrough']),
    'fmt.code': () => toggleMarkByNames(['inlineCode', 'code']),
    'fmt.highlight': () => toggleMarkByNames(['highlight']),
    'view.sourceMode': toggleMode,
    'view.outline': () => {
      if (sidebarOpen.value && sidebarMode.value === 'outline') sidebarOpen.value = false
      else {
        sidebarOpen.value = true
        sidebarMode.value = 'outline'
      }
    },
    'view.fileTree': () => {
      if (sidebarOpen.value && sidebarMode.value === 'tree') sidebarOpen.value = false
      else {
        sidebarOpen.value = true
        sidebarMode.value = 'tree'
      }
    },
    'view.typewriter': toggleTypewriter,
    'view.focus': toggleFocus,
    'view.zoomIn': () => applyZoom(10),
    'view.zoomOut': () => applyZoom(-10),
    'view.zoomReset': resetZoom,
    'view.fullscreen': () => void toggleFullscreen(),
    'theme.github': () => applyTheme('github'),
    'theme.dark': () => applyTheme('dark'),
    'theme.paper': () => applyTheme('paper'),
    'help.about': async () => {
      await invoke('dialog:alert', {
        title: '关于 FreeMD',
        message: 'FreeMD 0.1.0\n轻量级 Markdown 编辑器（WPF + WebView2）\n对标 Typora 的所见即所得体验。',
      }).catch(() => {})
    },
  }
  const h = handlers[id]
  if (h) h()
  else log(`未处理的菜单命令: ${id}`)
  log(`菜单命令: ${id}`)
}

async function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  await invoke('window:setFullscreen', { on: isFullscreen.value }).catch(() => {})
}

/** [TOC] widget 点击 → 跳转到标题位置 */
function onTocJump(e: Event) {
  const { pos } = (e as CustomEvent<{ pos?: number }>).detail ?? {}
  if (typeof pos !== 'number') return
  if (wysiwyg.value) {
    wysiwyg.value.withView((view) => {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))))
      const dom = view.nodeDOM(pos) as HTMLElement | null
      dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      view.focus()
      return true
    })
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.altKey && e.key.toLowerCase() === 'd') {
    // 切换调试日志面板
    e.preventDefault()
    devlogVisible.value = !devlogVisible.value
    return
  }
  const mod = e.ctrlKey || e.metaKey
  if (!mod && e.key !== 'F11') return

  if (mod && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void save(true)
  } else if (mod && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void save(false)
  } else if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    void exportPdf()
  } else if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    void doOpen()
  } else if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    void doOpenFolder()
  } else if (mod && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    void doNew()
  } else if (mod && e.key === '/') {
    e.preventDefault()
    toggleMode()
  } else if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openFind()
  } else if (mod && e.key === ',') {
    e.preventDefault()
    openSettings()
  } else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    cmdCopyAsMarkdown()
  } else if (mod && /^[1-6]$/.test(e.key)) {
    e.preventDefault()
    setHeading(Number(e.key))
  } else if (mod && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    toggleMarkByNames(['strong'])
  } else if (mod && e.key.toLowerCase() === 'i') {
    e.preventDefault()
    toggleMarkByNames(['em', 'emphasis', 'italic'])
  } else if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    cmdLink()
  } else if (mod && e.key.toLowerCase() === 'w') {
    e.preventDefault()
    void closeTabAction(activeId.value)
  } else if (e.key === 'F11') {
    e.preventDefault()
    void toggleFullscreen()
  }
}

/* ---------- 生命周期 ---------- */

const offHandlers: Array<() => void> = []

onMounted(async () => {
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('mytypora-toc-jump', onTocJump)
  window.addEventListener('md-table-cmd', onTableCmd)
  await loadSettings()
  applyTheme(settings.value.theme)

  if (isHostAvailable) {
    offHandlers.push(
      on('menu:command', (p) => void handleMenu((p as { id?: string })?.id ?? '')),
      on('app:openPath', (p) => void openByPath((p as { path?: string })?.path ?? '')),
      on('app:close-requested', async () => {
        let cancel = false
        if (anyDirty.value) {
          cancel = !(await invoke<boolean>('dialog:confirm', {
            title: '关闭 MyTypora',
            message: '有未保存的文档，确定退出并丢弃更改吗？',
          }).catch(() => true))
        }
        await invoke('app:confirmClose', { cancel }).catch(() => {})
      }),
      on('app:selftest', async (payload) => {
        const { path } = (payload ?? {}) as { path?: string }
        if (!path) return
        try {
          const f = await invoke<{ size: number; encoding: string; eol: string }>('file:read', { path })
          await invoke('sys:report', {
            ok: true,
            detail: `read ${path} · ${f.size}B · ${f.encoding} · ${f.eol}`,
          })
        } catch (err) {
          await invoke('sys:report', { ok: false, detail: String(err) }).catch(() => {})
        }
      }),
    )

    try {
      const info = await invoke<{ app: string; version: string }>('sys:ping')
      bridgeStatus.value = '已连接'
      log(`桥握手成功 · ${info.app} v${info.version}`)
      await invoke('sys:ready')
    } catch (e) {
      bridgeStatus.value = '连接失败'
      log(String(e))
    }
  } else {
    log('浏览器预览模式：无原生桥，仅可编辑')
  }

  // 初始空文档
  if (tabs.value.length === 0) createTab(null, '', { encoding: 'utf-8', bom: false, eol: 'lf' })
  await mountEditor()

  // 自动化验证钩子（内部调试用，非公开 API）
  ;(globalThis as Record<string, unknown>).__debug = {
    loadText: async (md: string) => {
      resetWithSingleTab(md)
      await mountEditor()
    },
    getMarkdown: () => currentText(),
    docText: () => wysiwyg.value?.withView((v) => v.state.doc.textBetween(0, v.state.doc.content.size, '\n', '\n')) ?? null,
    toggleMode: () => toggleMode(),
    mode: () => mode.value,
    status: () => status.value,
    fileInfo: () => ({ tabs: tabs.value.map((t) => ({ path: t.path, dirty: t.dirty })), activeId: activeId.value }),
    readFile: (path: string) => invoke('file:read', { path }),
    saveTo: (path: string, content: string) =>
      invoke('file:write', { path, text: content, encoding: 'utf-8', bom: false }),
    openByPath: (path: string) => openByPath(path),
    tabsInfo: () => tabs.value.map((t) => ({ id: t.id, path: t.path, dirty: t.dirty, chars: t.text.length })),
    menu: (id: string) => handleMenu(id),
    outline: () => extractOutline(activeTab.value?.text ?? ''),
    sidebar: () => ({ open: sidebarOpen.value, mode: sidebarMode.value }),
    openFolderTest: async (path: string) => {
      await openFolder(path)
      sidebarOpen.value = true
      sidebarMode.value = 'tree'
    },
    dirtyTest: () => updateActiveText((activeTab.value?.text ?? '') + '\n手改内容'),
    toggleTree: async () => {
      // 展开文件树中的指定子目录（测试用）
      const el = document.querySelectorAll('.ft-body .row')[0] as HTMLElement | undefined
      el?.click()
    },
    /** 选中第一个非空段落的全部文本 */
    selectFirstParagraph: () => {
      wysiwyg.value?.withView((view) => {
        let done = false
        view.state.doc.forEach((node, offset) => {
          if (done || node.type.name !== 'paragraph' || !node.textContent) return
          done = true
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, offset + 1, offset + 1 + node.textContent.length),
            ),
          )
        })
        view.focus()
        return done
      })
    },
    /** 光标落在第一个段落末尾（不选中） */
    caretEndOfFirstParagraph: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.forEach((node, offset) => {
          if (pos !== null || node.type.name !== 'paragraph' || !node.textContent) return
          pos = offset + 1 + node.textContent.length
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    /** 当前 stored marks（无选区快捷键测试用） */
    storedMarks: () =>
      wysiwyg.value?.withView((v) =>
        (v.state.storedMarks ?? v.state.selection.$to.marks()).map((m) => m.type.name),
      ) ?? null,
    /** 光标放进表格第一个单元格 */
    caretIntoTableCell: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.descendants((node, pos1) => {
          if (pos !== null) return false
          if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
            pos = pos1 + 1
            return false
          }
          return true
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    caretIntoFirstHeading: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.forEach((node, offset) => {
          if (pos === null && node.type.name === 'heading') pos = offset + 2
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    caretIntoBold: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.descendants((node, pos1) => {
          if (pos !== null) return false
          if (!node.isText) return true // 继续下钻
          const strong = node.marks.find((m) => m.type.name === 'strong')
          if (strong) {
            pos = pos1 + Math.floor(node.text!.length / 2)
            return false
          }
          return true
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    caretIntoFirstListItem: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.descendants((node, pos1) => {
          if (pos !== null) return false
          if (node.type.name === 'list_item' || node.type.name === 'task_list_item') {
            pos = pos1 + 2
            return false
          }
          return true
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    caretIntoQuote: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.descendants((node, pos1) => {
          if (pos !== null) return false
          if (node.type.name === 'blockquote') {
            pos = pos1 + 2
            return false
          }
          return true
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    caretIntoLink: () => {
      wysiwyg.value?.withView((view) => {
        let pos: number | null = null
        view.state.doc.descendants((node, pos1) => {
          if (pos !== null) return false
          if (!node.isText) return true
          const link = node.marks.find((m) => m.type.name === 'link')
          if (link) {
            pos = pos1 + Math.floor(node.text!.length / 2)
            return false
          }
          return true
        })
        if (pos !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          view.focus()
        }
        return pos !== null
      })
    },
    /** 选中第一个原子节点（图片/公式），触发 selectNode */
    selectFirstAtom: (typeName: string) => {
      wysiwyg.value?.withView((view) => {
        let target: number | null = null
        view.state.doc.descendants((node, pos) => {
          if (target !== null) return false
          if (node.type.name === typeName) {
            target = pos
            return false
          }
          return true
        })
        if (target !== null) {
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, target)))
          view.focus()
        }
        return target !== null
      })
    },
    findTest: (query: string) => {
      findVisible.value = true
      findQuery.value = query
      runSearch()
      return getSearchState().matches.length
    },
    findNextTest: () => {
      findNext()
      return getSearchState().activeIndex
    },
    replaceAllTest: (replacement: string) => {
      findReplacement.value = replacement
      replaceEverything()
      runSearch()
      return getSearchState().matches.length
    },
    settingsTest: () => ({ ...settings.value }),
    setSetting: (key: string, value: unknown) => {
      onSettingChange(key as keyof AppSettings, value as string | number | boolean)
    },
    exportHtmlTest: (path?: string) => exportHtml(path),
    exportPdfTest: (path?: string) => exportPdf(path),
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('mytypora-toc-jump', onTocJump)
  window.removeEventListener('md-table-cmd', onTableCmd)
  offHandlers.forEach((off) => off())
  destroyEditors()
})
</script>

<template>
  <div class="app-shell">
    <TabBar :tabs="tabItems" :active-id="activeId" @select="selectTab" @close="closeTabAction" />

    <div class="main-row">
      <Sidebar v-if="sidebarOpen" @jump="jumpToHeading" @open-file="openByPath" />

      <div class="editor-column">
        <div v-if="externalBanner" class="ext-banner">
          <span>「{{ baseName(externalBanner.path) }}」已被外部程序修改</span>
          <span class="ext-actions">
            <button class="ext-btn primary" @click="bannerReload">重新加载</button>
            <button class="ext-btn" @click="externalBanner = null">忽略</button>
          </span>
        </div>

        <div class="editor-wrap" @dragover.prevent @drop.prevent="onDrop">
          <div
            ref="editorHost"
            class="editor-host"
            :class="{ 'is-source': mode === 'source' }"
            :style="{ '--editor-zoom': zoom / 100 }"
          />
          <div v-if="!activeTab?.text" class="editor-empty-hint">输入 Markdown，即刻所见即所得</div>
          <FindPanel
            :visible="findVisible"
            v-model:query="findQuery"
            v-model:replacement="findReplacement"
            v-model:caseSensitive="findCase"
            v-model:regexp="findRegex"
            :count="findCount"
            @next="findNext"
            @prev="findPrev"
            @replace="replaceOne"
            @replace-all="replaceEverything"
            @close="closeFind"
          />
        </div>
      </div>
    </div>

    <input
      v-if="hrefOverlay"
      ref="hrefInputEl"
      v-model="hrefOverlay.value"
      class="href-overlay"
      placeholder="输入链接地址，Enter 确认，Esc 取消"
      :style="{ left: hrefOverlay.left + 'px', top: hrefOverlay.top + 'px' }"
      @keydown.enter.prevent="commitHref"
      @keydown.esc.prevent="hrefOverlay = null"
      @blur="commitHref"
    />

    <SettingsPanel :visible="settingsVisible" :settings="settings" @change="onSettingChange" @close="settingsVisible = false" />

    <StatusBar
      :words="status.words"
      :chars="status.chars"
      :line="status.line"
      :col="status.col"
      :encoding="meta.encoding"
      :eol="meta.eol"
      :mode="mode"
      @toggle-mode="toggleMode"
    />

    <div v-if="devlogVisible" class="devlog">
      <div class="devlog-head">
        <span :class="['chip-dot', { ok: bridgeStatus === '已连接' }]" />{{ bridgeStatus }}
      </div>
      <div v-for="(l, i) in logs" :key="i" class="line">{{ l }}</div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.main-row {
  flex: 1;
  display: flex;
  min-height: 0;
}

.editor-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ext-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #fff8e6;
  border-bottom: 1px solid #f0dfb2;
  font-size: 12.5px;
  color: #8a6d1a;
}

.ext-actions {
  display: flex;
  gap: 8px;
}

.ext-btn {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 5px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--fg-soft);
}

.ext-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.editor-wrap {
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-host {
  flex: 1;
}

.devlog {
  position: absolute;
  left: 12px;
  bottom: 34px;
  width: 460px;
  max-height: 150px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.7;
  color: #9aa1ad;
  text-align: left;
  user-select: text;
  z-index: 10;
  pointer-events: none;
}

.devlog-head {
  color: #b8bec9;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f0a020;
  display: inline-block;
}

.chip-dot.ok {
  background: #34c77b;
}

.href-overlay {
  position: fixed;
  z-index: 50;
  width: 300px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  outline: none;
}
</style>
