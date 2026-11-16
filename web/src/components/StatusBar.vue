<script setup lang="ts">
defineProps<{
  words: number
  chars: number
  line: number
  col: number
  encoding: string
  eol: string
  mode: 'wysiwyg' | 'source'
}>()
</script>

<template>
  <div class="statusbar">
    <span class="item">{{ words }} 字</span>
    <span class="item">{{ chars }} 字符</span>
    <span class="item">行 {{ line }}，列 {{ col }}</span>
    <span class="spacer" />
    <button class="item clickable" title="切换编辑模式" @click="$emit('toggleMode')">
      {{ mode === 'wysiwyg' ? '所见即所得' : '源代码' }}
    </button>
    <span class="item">{{ encoding.toUpperCase() }} · {{ eol.toUpperCase() }}</span>
  </div>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 26px;
  padding: 0 14px;
  background: var(--statusbar-bg);
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--fg-soft);
  user-select: none;
}

.item {
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.clickable {
  border: none;
  background: transparent;
  color: var(--fg-soft);
  font: inherit;
  padding: 2px 8px;
  border-radius: 4px;
}

.clickable:hover {
  background: var(--hover-bg);
  color: var(--fg);
}
</style>
