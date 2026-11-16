<script setup lang="ts">
import { inject, type Ref } from 'vue'
import { normPath, type TreeNode } from '../stores/fileTree'

const props = defineProps<{ node: TreeNode; depth: number }>()

interface FileTreeCtx {
  expandedPaths: Ref<Set<string>>
  toggle(node: TreeNode): void
  openFile(path: string): void
}

const ft = inject<FileTreeCtx>('ft')!

function onClick() {
  if (props.node.type === 'dir') ft.toggle(props.node)
  else ft.openFile(props.node.path)
}
</script>

<template>
  <div>
    <div class="row" :style="{ paddingLeft: 6 + depth * 14 + 'px' }" @click="onClick">
      <span v-if="node.type === 'dir'" class="caret" :class="{ open: ft.expandedPaths.value.has(normPath(node.path)) }">▸</span>
      <span v-else class="doc" :class="{ md: node.isMd }">{{ node.isMd ? 'M↓' : '·' }}</span>
      <span class="name" :title="node.path">{{ node.name }}</span>
    </div>
    <template v-if="node.type === 'dir' && ft.expandedPaths.value.has(normPath(node.path))">
      <TreeRow v-for="c in node.children ?? []" :key="c.path" :node="c" :depth="depth + 1" />
    </template>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  font-size: 12.5px;
  color: var(--fg-soft);
  cursor: default;
  white-space: nowrap;
  overflow: hidden;
  border-radius: 4px;
  padding-right: 8px;
}

.row:hover {
  background: #f1f3f5;
  color: var(--fg);
}

.caret {
  width: 12px;
  flex: none;
  font-size: 10px;
  color: #a5abb5;
  transition: transform 0.12s;
  display: inline-block;
}

.caret.open {
  transform: rotate(90deg);
}

.doc {
  width: 12px;
  flex: none;
  text-align: center;
  font-size: 9px;
  color: #c0c4cc;
}

.doc.md {
  color: var(--accent);
  font-weight: 600;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
