import { createApp } from 'vue'
// 样式顺序重要：base → themes（主题变量需覆盖 base 的 :root）→ 组件样式随 App 引入
import './styles/base.css'
import './styles/themes.css'
import App from './App.vue'

createApp(App).mount('#app')
