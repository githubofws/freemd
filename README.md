# FreeMD（原 MyTypora）

![FreeMD 演示](demo/freemd-demo.gif)

对标 Typora 的轻量级 Markdown 所见即所得编辑器（Windows 桌面应用）。

**架构**：WPF 原生外壳 + WebView2（系统自带 Chromium）渲染 Web 编辑器内核 —— 与 Typora 自身（原生壳 + Web 内核）同款架构思路，安装包仅几 MB，无需打包浏览器。

```
┌────────────────────────────────────┐
│ WPF：深色标题栏 · 原生菜单 · 文件IO  │
│      编码检测 · 文件监听 · 打印导出  │
│ ┌────────────────────────────────┐ │
│ │ WebView2（JSON 桥双向通信）      │ │
│ │  Milkdown(ProseMirror+remark)   │ │
│ │  WYSIWYG ⇄ 源码模式(CodeMirror6)│ │
│ │  KaTeX · mermaid · highlight.js │ │
│ │  标签页 · 文件树 · 大纲 · 主题   │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

## 功能

- **编辑**：所见即所得（语法标记即时显隐）、源代码模式（Ctrl+/）无损切换、Markdown 往返序列化无损
- **语法**：CommonMark + GFM（表格/任务列表/删除线/自动链接）、KaTeX 行内块级公式、mermaid 图表、代码高亮（highlight.js + 语言徽标）、YAML front matter、`[TOC]`、行内 HTML
- **文档**：多标签页、文件树（懒加载目录）、大纲跳转、最近文件、拖拽打开、外部修改监听（干净自动重载 / 脏文档横幅提示）、大文档建议源码模式
- **效率**：查找替换（高亮计数/正则/大小写）、字数统计（CJK 逐字 + 西文按词）、打字机模式、聚焦模式、缩放
- **主题**：GitHub 亮色 / 夜间 / 纸张护眼，菜单栏跟随联动，设置持久化
- **导出**：PDF（A4 分页打印管线）、HTML（内联全部样式 + 图片转 data URL 的单文件）
- **健壮性**：UTF-8/UTF-16/GB18030 编码检测、BOM/CRLF 保留、原子写入、自动保存（可配置间隔）、未保存关闭拦截

## 构建运行

环境要求：.NET SDK（含 WPF）、Node.js、Windows 10/11（系统自带 WebView2 运行时）。

```bash
# 前端
cd web
npm install
npm run build        # 产物输出到 src/MyTypora.App/wwwroot

# 运行桌面应用
cd ..
dotnet run --project src/MyTypora.App (产物为 FreeMD.exe)
```

开发热更新：`cd web && npm run dev`，然后设置环境变量 `MYTYPORA_DEV_URL=http://localhost:5173` 启动应用（同时开放 CDP 调试口 9222）。

打包发布：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish.ps1          # 绿色版单文件 dist/FreeMD.exe（约 10 MB）
powershell -ExecutionPolicy Bypass -File scripts/make-installer.ps1   # 上面 + Inno Setup 安装包 dist/FreeMD-Setup-*.exe
```

- **环境要求**：WebView2 Runtime 由 Win10/11 系统自带，用户无需处理；唯一变量是 .NET 10 桌面运行时（~55 MB，一次性，多个 .NET 程序共享）。
- **绿色版**（默认）：`dist/FreeMD.exe` ≈ 10 MB，双击即用，但目标机器需装有 [.NET 10 桌面运行时](https://dotnet.microsoft.com/download/dotnet/10.0)。
- **零依赖版**（推荐分发用）：`powershell -File scripts/publish.ps1 -SelfContained` → .NET 运行时打进 exe，实测 **65 MB**（单文件压缩启用；未压缩约 150 MB），普通用户下载即可运行、什么都不用装，代价是首次启动稍慢（需解压）。
- **安装包**：`scripts/installer/FreeMD.iss`（Inno Setup 6 脚本），装 [Inno Setup](https://jrsoftware.org/isdl.php) 后由 `make-installer.ps1 [-SelfContained]` 自动编译（打包上一步产出的 exe）；按用户级安装到 `%LOCALAPPDATA%\Programs\FreeMD`（免管理员），含开始菜单/桌面快捷方式、可选 .md“打开方式”注册与卸载器。未装 Inno Setup 时自动跳过、仍产出绿色版。

## 快捷键

| 键 | 功能 |
|---|---|
| Ctrl+S / Ctrl+Shift+S | 保存 / 另存为 |
| Ctrl+O / Ctrl+Shift+O | 打开文件 / 打开文件夹 |
| Ctrl+N / Ctrl+W | 新建标签 / 关闭标签 |
| Ctrl+/ | 所见即所得 ⇄ 源代码 |
| Ctrl+F | 查找替换 |
| Ctrl+1~6 | 标题一~六级 |
| Ctrl+B / Ctrl+I | 加粗 / 斜体 |
| Ctrl+Shift+C | 复制为 Markdown |
| Ctrl+P | 导出 PDF |
| Ctrl+, | 设置 |
| F11 | 全屏 |
| Ctrl+= / Ctrl+- / Ctrl+0 | 缩放 |

## 自动化测试

应用启动后（CDP 端口 9222 已随应用开启）：

```bash
node scripts/m1-test.mjs   # 编辑核心 round-trip
node scripts/m2-test.mjs   # 标签/文件树/大纲/监听/最近文件
node scripts/m3-test.mjs   # 扩展语法（KaTeX/mermaid/TOC/图片）
node scripts/m6-test.mjs   # round-trip fixtures 回归
```

## 目录结构

```
web/                       # Vue3 + Vite + TS 前端
  src/editor/              # Milkdown 封装：节点视图（公式/mermaid/图片）、搜索、源码模式
  src/components/          # TabBar/Sidebar/FindPanel/SettingsPanel 等
  src/stores/, src/workspace.ts
src/MyTypora.App/          # WPF 外壳
  Bridge/                  # JSON 桥：文件/目录/监听/设置/最近文件/对话框服务
scripts/                   # CDP 诊断与自动化验收脚本、fixtures
docs/                      # 样例文档
```

## 已知限制

- 代码块编辑采用原生文本 + highlight.js 装饰（非 CodeMirror 嵌入），超大单文件（>500KB）建议源码模式
- mermaid 大图渲染为 SVG 快照，编辑需双击进入源码态
- 脚注语法暂以原文形式保留（round-trip 无损，渲染待实现）
- Typora 第三方主题 CSS 兼容为实验目标，DOM 采用 `#write` + 语义标签约定但未完全对齐
- 嵌套引用序列化层级会 +1（milkdown 上游 quirk，重新解析后稳定；回归测试按深度无关方式比较）
- 表格对齐行长度、setext→ATX 标题、`*`/`-` 列表符等序列化风格差异视为语义等价（回归测试已归一化比较）
