<script setup lang="ts">
export interface AppSettings {
  theme: 'github' | 'dark' | 'paper'
  typewriter: boolean
  focus: boolean
  autosave: boolean
  autosaveInterval: number // 分钟
  baseFontSize: number
}

defineProps<{ visible: boolean; settings: AppSettings }>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'change', key: keyof AppSettings, value: string | number | boolean): void
}>()

const themes: Array<{ id: AppSettings['theme']; label: string; color: string }> = [
  { id: 'github', label: 'GitHub 亮色', color: '#ffffff' },
  { id: 'dark', label: '夜间', color: '#1e2227' },
  { id: 'paper', label: '纸张护眼', color: '#f7f3e8' },
]
</script>

<template>
  <div v-if="visible" class="mask" @click.self="emit('close')">
    <div class="panel">
      <div class="head">
        <span>设置</span>
        <button class="close" @click="emit('close')">✕</button>
      </div>

      <div class="group">
        <div class="label">主题</div>
        <div class="theme-row">
          <button
            v-for="t in themes"
            :key="t.id"
            class="theme-item"
            :class="{ on: settings.theme === t.id }"
            @click="emit('change', 'theme', t.id)"
          >
            <i class="swatch" :style="{ background: t.color }" />
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="group">
        <div class="label">编辑</div>
        <label class="row">
          <input type="checkbox" :checked="settings.typewriter" @change="emit('change', 'typewriter', ($event.target as HTMLInputElement).checked)" />
          打字机模式（光标固定在屏幕中央）
        </label>
        <label class="row">
          <input type="checkbox" :checked="settings.focus" @change="emit('change', 'focus', ($event.target as HTMLInputElement).checked)" />
          聚焦模式（淡出非当前段落）
        </label>
        <label class="row">
          正文字号
          <input
            class="num"
            type="number"
            min="12"
            max="24"
            :value="settings.baseFontSize"
            @change="emit('change', 'baseFontSize', Number(($event.target as HTMLInputElement).value))"
          />
          px
        </label>
      </div>

      <div class="group">
        <div class="label">自动保存</div>
        <label class="row">
          <input type="checkbox" :checked="settings.autosave" @change="emit('change', 'autosave', ($event.target as HTMLInputElement).checked)" />
          启用自动保存
        </label>
        <label class="row">
          间隔
          <input
            class="num"
            type="number"
            min="1"
            max="60"
            :value="settings.autosaveInterval"
            @change="emit('change', 'autosaveInterval', Number(($event.target as HTMLInputElement).value))"
          />
          分钟
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel {
  width: 420px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 16px 20px 20px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 10px;
}

.close {
  border: none;
  background: transparent;
  color: var(--fg-soft);
  font-size: 13px;
}

.close:hover {
  color: var(--fg);
}

.group {
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.label {
  font-size: 11px;
  color: var(--fg-soft);
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  padding: 4px 0;
}

.row input[type='checkbox'] {
  accent-color: var(--accent);
}

.num {
  width: 56px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--fg);
  padding: 3px 6px;
  font-size: 13px;
}

.theme-row {
  display: flex;
  gap: 8px;
}

.theme-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 6px;
}

.theme-item.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-weak);
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--border);
  display: inline-block;
  flex: none;
}
</style>
