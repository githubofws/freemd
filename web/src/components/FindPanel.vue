<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  query: string
  replacement: string
  caseSensitive: boolean
  regexp: boolean
  count: number // -1 = 未知（源码模式由 CM 管理）
}>()

const emit = defineEmits<{
  (e: 'update:query', v: string): void
  (e: 'update:replacement', v: string): void
  (e: 'update:caseSensitive', v: boolean): void
  (e: 'update:regexp', v: boolean): void
  (e: 'next'): void
  (e: 'prev'): void
  (e: 'replace'): void
  (e: 'replaceAll'): void
  (e: 'close'): void
}>()

const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
    }
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    emit(e.shiftKey ? 'prev' : 'next')
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
  e.stopPropagation()
}
</script>

<template>
  <div v-if="visible" class="find-panel" @keydown="onKeydown">
    <div class="row">
      <button class="opt" :class="{ on: caseSensitive }" title="区分大小写" @click="emit('update:caseSensitive', !caseSensitive)">Aa</button>
      <button class="opt" :class="{ on: regexp }" title="正则表达式" @click="emit('update:regexp', !regexp)">.*</button>
      <input
        ref="inputEl"
        class="find-input"
        placeholder="查找…"
        :value="query"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
      <span v-if="count >= 0" class="count" :class="{ none: count === 0 }">
        {{ count === 0 ? '无结果' : `${count} 个结果` }}
      </span>
      <button class="btn" title="上一个 (Shift+Enter)" @click="emit('prev')">↑</button>
      <button class="btn" title="下一个 (Enter)" @click="emit('next')">↓</button>
      <button class="btn" title="关闭 (Esc)" @click="emit('close')">✕</button>
    </div>
    <div class="row">
      <input
        class="find-input"
        placeholder="替换为…"
        :value="replacement"
        @input="emit('update:replacement', ($event.target as HTMLInputElement).value)"
      />
      <button class="btn wide" title="替换当前" @click="emit('replace')">替换</button>
      <button class="btn wide" title="全部替换" @click="emit('replaceAll')">全部</button>
    </div>
  </div>
</template>

<style scoped>
.find-panel {
  position: absolute;
  top: 10px;
  right: 18px;
  z-index: 20;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 380px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.opt {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-soft);
  font-size: 11px;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  flex: none;
}

.opt.on {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-weak);
}

.find-input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 13px;
  color: var(--fg);
  background: transparent;
  outline: none;
  min-width: 0;
}

.find-input:focus {
  border-color: var(--accent);
}

.count {
  font-size: 11px;
  color: var(--fg-soft);
  white-space: nowrap;
  flex: none;
}

.count.none {
  color: #e07b39;
}

.btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-soft);
  font-size: 12px;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  flex: none;
}

.btn.wide {
  width: auto;
  padding: 0 10px;
}

.btn:hover {
  color: var(--fg);
  background: var(--hover-bg);
}
</style>
