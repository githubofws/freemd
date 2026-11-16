<script setup lang="ts">
import { computed, ref } from 'vue'
import { extractOutline, type OutlineItem } from '../editor/outline'
import { activeTab } from '../workspace'

const emit = defineEmits<{ (e: 'jump', item: OutlineItem): void }>()

const items = computed(() => extractOutline(activeTab.value?.text ?? ''))
const activeLine = ref(-1)

function jump(item: OutlineItem) {
  activeLine.value = item.line
  emit('jump', item)
}
</script>

<template>
  <div class="outline">
    <div class="ol-header">大纲</div>
    <div v-if="items.length === 0" class="ol-empty">暂无标题</div>
    <div v-else class="ol-body">
      <div
        v-for="(item, i) in items"
        :key="i"
        class="ol-item"
        :class="{ active: item.line === activeLine }"
        :style="{ paddingLeft: 12 + (item.level - 1) * 12 + 'px' }"
        :title="item.text"
        @click="jump(item)"
      >
        <span class="ol-text">{{ item.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.outline {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ol-header {
  padding: 10px 12px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}

.ol-empty {
  padding: 20px 14px;
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
}

.ol-body {
  flex: 1;
  overflow: auto;
  padding: 0 6px 16px;
}

.ol-item {
  display: block;
  padding: 4px 8px;
  font-size: 12.5px;
  color: var(--fg-soft);
  cursor: default;
  border-radius: 4px;
  line-height: 1.45;
}

.ol-item:hover {
  background: var(--hover-bg);
  color: var(--fg);
}

.ol-item.active {
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 500;
}

.ol-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
