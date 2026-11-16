import { computed, ref } from 'vue'

/** 多标签工作区状态：每个标签持有自己的 markdown 文本（唯一事实源） */
export interface FileMeta {
  encoding: string
  bom: boolean
  eol: string
}

export interface DocTab {
  id: number
  path: string | null
  text: string
  dirty: boolean
  meta: FileMeta
}

let nextId = 1

export const tabs = ref<DocTab[]>([])
export const activeId = ref(0)
export const mode = ref<'wysiwyg' | 'source'>('wysiwyg')
export const zoom = ref(100)
export const sidebarOpen = ref(false)
export const sidebarMode = ref<'tree' | 'outline'>('outline')

export const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value))
export const fileName = computed(() =>
  activeTab.value?.path ? baseName(activeTab.value.path) : '未命名',
)
export const dirty = computed(() => activeTab.value?.dirty ?? false)
export const anyDirty = computed(() => tabs.value.some((t) => t.dirty))
export const meta = computed(
  () => activeTab.value?.meta ?? { encoding: 'utf-8', bom: false, eol: 'lf' },
)

export function baseName(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop()!
}

export function findTabByPath(path: string): DocTab | undefined {
  const norm = path.replace(/\\/g, '/').toLowerCase()
  return tabs.value.find((t) => t.path && t.path.replace(/\\/g, '/').toLowerCase() === norm)
}

/** 打开文档标签；同路径已打开时直接激活 */
export function createTab(
  path: string | null,
  text: string,
  fileMeta: FileMeta,
  activate = true,
): number {
  if (path) {
    const existing = findTabByPath(path)
    if (existing) {
      if (activate) activeId.value = existing.id
      return existing.id
    }
  }
  const id = nextId++
  tabs.value.push({ id, path, text, dirty: false, meta: fileMeta })
  if (activate) activeId.value = id
  return id
}

/** 关闭标签，返回应激活的下一个标签 id（保证至少留一个空标签） */
export function removeTab(id: number): number {
  const idx = tabs.value.findIndex((t) => t.id === id)
  if (idx === -1) return activeId.value
  tabs.value.splice(idx, 1)
  if (tabs.value.length === 0) {
    const fresh = { id: nextId++, path: null, text: '', dirty: false, meta: { encoding: 'utf-8', bom: false, eol: 'lf' } }
    tabs.value.push(fresh)
  }
  if (activeId.value === id) {
    activeId.value = tabs.value[Math.min(idx, tabs.value.length - 1)]!.id
  }
  return activeId.value
}

/** 编辑器产出新 markdown 时写回活动标签 */
export function updateActiveText(next: string) {
  const t = activeTab.value
  if (t && next !== t.text) {
    t.text = next
    t.dirty = true
  }
}

/** 测试辅助：丢弃全部标签，重置为单个含指定文本的未命名标签 */
export function resetWithSingleTab(text: string): number {
  const id = nextId++
  tabs.value = [
    { id, path: null, text, dirty: false, meta: { encoding: 'utf-8', bom: false, eol: 'lf' } },
  ]
  activeId.value = id
  return id
}

export function applyZoom(delta: number) {
  zoom.value = Math.min(300, Math.max(50, zoom.value + delta))
}

export function resetZoom() {
  zoom.value = 100
}
