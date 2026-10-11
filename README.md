# vtxf.github.io

vtxf 的博客（GitHub 用户站点）：内容放在 `blogs/` 目录（JSL 年月结构），`index.html` 动态读取并渲染，线上地址 **https://vtxf.u32.cn/**（CNAME）。

> 本仓库由 `vtxf-blogs` 改名而来，成为用户站点后直接服务在根域名。

## 功能

- 站内搜索：关键词匹配标题/摘要/标签（头部搜索框，纯前端，不抓正文）
- 标签筛选：列表顶部标签栏（含数量），点标签即筛选，可叠加搜索
- 归档视图：`#/archive`，按年月分组
- 关于页：`#/about`（微信可一键复制）
- 分批加载：列表每批 20 篇，滚动到底自动追加
- Markdown 增强：代码语法高亮 + 一键复制 + 语言标签；`cover:` 封面横幅；图片点击灯箱 + 懒加载；Mermaid 图直接渲染；KaTeX 数学公式（`$$…$$`、`\[…\]`、`\(…\)`）
- HTML 文章：iframe 通栏最大化展示（仅保留顶部工具条 + 「新窗口打开」）
- 阅读小件：上一篇/下一篇、阅读时长估算、复制本文链接、返回顶部
- 订阅与 SEO：`feed.xml`（RSS 2.0）、`sitemap.xml`、`robots.txt`、Open Graph、动态 `<title>`
- `404.html` 兜底页
- 全部第三方库本地化（无境外 CDN）：marked / highlight.js / mermaid / KaTeX / Feather Icons

## 目录结构

```
vtxf.github.io/
├── index.html            # 入口页：hero 头部 + 列表/归档/关于/文章四视图（hash 路由）
├── assets/
│   ├── style.css         # 全站样式（设计系统 + 响应式）
│   ├── app.js            # 前端逻辑（零框架原生 JS）
│   ├── marked.min.js     # Markdown 渲染库（本地化）
│   ├── highlight.min.js  # 代码高亮（本地化，common 语言集）
│   ├── hljs-github.min.css
│   ├── mermaid.min.js    # Mermaid 渲染（本地化，检出 mermaid 块才加载）
│   ├── katex/            # KaTeX + auto-render + fonts（本地化，检出公式才加载）
│   ├── avatar.png        # 头像（头部 + 关于页）
│   └── icons/            # Feather Icons（部分已内联进页面）
├── blogs/                # 博客内容（JSL(YM+S/A/F)，年月模式）
│   └── 2026/10/
│       ├── 20261011-131000-welcome.md
│       ├── 20261011-211500-markdown_demo.md   # Markdown 功能示例
│       └── 20261011-131100-sample-html-page.html
├── scripts/
│   └── gen-manifest.js   # 扫描 blogs/ 生成 posts.json + feed.xml + sitemap.xml
├── .github/workflows/manifest.yml  # push 时自动重新生成三个清单文件
├── 404.html              # GitHub Pages 兜底页
├── robots.txt
├── feed.xml / sitemap.xml / posts.json   # 自动生成，勿手改
├── CNAME                 # vtxf.u32.cn
└── .nojekyll             # 跳过 Jekyll，保证 _attachments/ 等下划线目录可被访问
```

## 如何写文章

1. 在 `blogs/YYYY/MM/` 下新建文件，命名 `YYYYMMDD-HHMMSS-<主题名>.md` 或 `.html`
   - **主题名只能用 ASCII 字符**（GitHub Pages 对中文文件名会 404，已踩坑），空格用下划线
   - 主题名 ≤32 字符；中文标题写在 front matter `name` 或 html `<title>` 里，列表页会展示
2. Markdown 文章开头写 YAML front matter（列表页会展示）：

   ```yaml
   ---
   name: "标题（可中文）"
   description: "摘要"
   created: "YYYYMMDD HHMMSS"
   tags: ["标签"]        # 标签会进入列表页筛选栏；建议复用四个栏目名：AI 前沿/技术笔记/财经观察/学习成长
   cover: "封面图相对路径"  # 可选，仅文章页顶部横幅展示
   ---
   ```

3. 正文可直接写 ` ```mermaid ` 代码块（自动渲染为图）和 KaTeX 公式（`$$…$$` / `\[…\]` / `\(…\)`）
4. HTML 文章写完整独立的网页（`<title>` 即列表标题），展示时以 iframe 通栏嵌入
5. 需要配图时，图片放 `<文件名>_attachments/` 目录（.nojekyll 已保证可访问），正文用相对路径引用
6. push 到 main 后，GitHub Actions 自动更新 `posts.json` / `feed.xml` / `sitemap.xml`，页面即刻生效

## 本地预览

用任意静态服务器访问仓库根目录：

```bash
python3 -m http.server 8080
# 或 npx serve .
```

浏览器打开 http://localhost:8080 。注意：不能以 file:// 双击打开（浏览器会拦截 fetch）。
