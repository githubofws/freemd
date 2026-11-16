<script setup lang="ts">
import type { OutlineItem } from '../editor/outline'
import { sidebarMode } from '../workspace'
import FileTree from './FileTree.vue'
import Outline from './Outline.vue'

defineEmits<{
  (e: 'jump', item: OutlineItem): void
  (e: 'openFile', path: string): void
}>()
</script>

<template>
  <aside class="sidebar">
    <div class="side-tabs">
      <button :class="{ on: sidebarMode === 'tree' }" @click="sidebarMode = 'tree'">文件夹</button>
      <button :class="{ on: sidebarMode === 'outline' }" @click="sidebarMode = 'outline'">大纲</button>
    </div>
    <FileTree v-if="sidebarMode === 'tree'" class="side-body" @open="$emit('openFile', $event)" />
    <Outline v-else class="side-body" @jump="$emit('jump', $event)" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 250px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  min-height: 0;
}

.side-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 10px 0;
  border-bottom: 1px solid var(--border);
}

.side-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--fg-soft);
  padding: 6px 0;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
}

.side-tabs button.on {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.side-body {
  flex: 1;
  min-height: 0;
}
</style>
