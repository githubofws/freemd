<script setup lang="ts">
import { provide, ref } from 'vue'
import {
  currentFolder,
  expandedPaths,
  folderRoot,
  loadChildren,
  normPath,
  openFolder,
  type TreeNode,
} from '../stores/fileTree'
import TreeRow from './TreeRow.vue'

const emit = defineEmits<{ (e: 'open', path: string): void }>()

const refreshing = ref(false)

async function toggle(node: TreeNode) {
  const key = normPath(node.path)
  const set = new Set(expandedPaths.value)
  if (set.has(key)) {
    set.delete(key)
  } else {
    set.add(key)
    if (!node.children) await loadChildren(node.path)
  }
  expandedPaths.value = set
}

async function refresh() {
  if (!currentFolder.value) return
  refreshing.value = true
  try {
    await openFolder(currentFolder.value)
  } finally {
    refreshing.value = false
  }
}

provide('ft', { expandedPaths, toggle, openFile: (p: string) => emit('open', p) })
</script>

<template>
  <div class="filetree">
    <div class="ft-header">
      <span class="ft-title" :title="currentFolder ?? ''">
        {{ currentFolder ? (folderRoot?.name ?? '') : '未打开文件夹' }}
      </span>
      <button v-if="currentFolder" class="ft-btn" :class="{ spin: refreshing }" title="刷新" @click="refresh">⟳</button>
    </div>

    <div v-if="!folderRoot" class="ft-empty">
      <button class="ft-open" @click="openFolder()">打开文件夹…</button>
    </div>
    <div v-else class="ft-body">
      <TreeRow v-for="c in folderRoot.children ?? []" :key="c.path" :node="c" :depth="0" @open="emit('open', $event)" />
    </div>
  </div>
</template>

<style scoped>
.filetree {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ft-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
}

.ft-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ft-btn {
  border: none;
  background: transparent;
  color: var(--fg-soft);
  font-size: 13px;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  flex: none;
}

.ft-btn:hover {
  background: var(--hover-bg);
  color: var(--fg);
}

.ft-btn.spin {
  animation: spin 0.6s linear;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ft-empty {
  padding: 20px 14px;
  text-align: center;
}

.ft-open {
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--fg-soft);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
}

.ft-open:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.ft-body {
  flex: 1;
  overflow: auto;
  padding: 0 4px 16px;
}
</style>
