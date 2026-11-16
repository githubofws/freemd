import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    // 产物直接输出到 WPF 工程的 wwwroot，由 WebView2 虚拟域 (https://app.local) 承载
    outDir: '../src/MyTypora.App/wwwroot',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
