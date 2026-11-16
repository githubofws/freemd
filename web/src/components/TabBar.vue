<script setup lang="ts">
export interface TabItem {
  id: number
  title: string
  dirty: boolean
}

defineProps<{
  tabs: TabItem[]
  activeId: number
}>()

defineEmits<{
  (e: 'select', id: number): void
  (e: 'close', id: number): void
}>()
</script>

<template>
  <div class="tabbar">
    <div
      v-for="t in tabs"
      :key="t.id"
      class="tab"
      :class="{ active: t.id === activeId }"
      @click="$emit('select', t.id)"
      @auxclick="$emit('close', t.id)"
    >
      <span class="tab-title" :title="t.title">{{ t.title }}</span>
      <i v-if="t.dirty" class="dirty-dot" title="未保存" />
      <button class="tab-close" title="关闭" @click.stop="$emit('close', t.id)">×</button>
    </div>
    <div class="tabbar-spacer" />
  </div>
</template>

<style scoped>
.tabbar {
  display: flex;
  align-items: stretch;
  height: 36px;
  background: var(--tabbar-bg);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  padding: 0 10px 0 16px;
  font-size: 12.5px;
  color: var(--fg-soft);
  cursor: default;
  border-right: 1px solid var(--border);
  position: relative;
}

.tab.active {
  background: var(--bg);
  color: var(--fg);
}

.tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--accent);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}

.tab-close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  width: 18px;
  height: 18px;
  line-height: 1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-close:hover {
  background: var(--hover-bg);
  color: var(--fg);
}

.tabbar-spacer {
  flex: 1;
}
</style>
