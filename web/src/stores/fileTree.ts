import { ref } from 'vue'
import { invoke } from '../bridge'

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  isMd: boolean
  children: TreeNode[] | null
}

export const folderRoot = ref<TreeNode | null>(null)
export const currentFolder = ref<string | null>(null)
export const expandedPaths = ref<Set<string>>(new Set())

/** 统一路径分隔符，避免 C:\... 与 C:/... 比较失效 */
export function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/(.+)\/$/, '$1').toLowerCase()
}

export async function openFolder(path?: string): Promise<string | null> {
  const p = path ?? (await invoke<string | null>('folder:pick'))
  if (!p) return null
  currentFolder.value = p
  folderRoot.value = await invoke<TreeNode>('folder:tree', { path: p, depth: 3 })
  expandedPaths.value = new Set([normPath(p)])
  return p
}

/** 懒加载子目录（children===null 时展开触发） */
export async function loadChildren(path: string): Promise<void> {
  const sub = await invoke<TreeNode>('folder:tree', { path, depth: 2 })
  patch(folderRoot.value, path, sub.children ?? [])
}

function patch(node: TreeNode | null, path: string, children: TreeNode[]): void {
  if (!node) return
  if (normPath(node.path) === normPath(path)) {
    node.children = children
    return
  }
  node.children?.forEach((c) => patch(c, path, children))
}
