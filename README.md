# vtxf-blogs

vtxf 的博客：内容放在 `blogs/` 目录（JSL 年月结构），`index.html` 动态读取并渲染，托管于 GitHub Pages。

## 目录结构

```
vtxf-blogs/
├── index.html            # 入口页：文章列表 + Markdown 渲染 + HTML 展示
├── assets/
│   ├── style.css
│   └── marked.min.js     # Markdown 渲染库（本地化，无外部 CDN）
├── blogs/                # 博客内容（JSL(YM+S/A/F)，年月模式）
│   └── 2026/10/
│       ├── 20261011-131000-welcome.md
│       └── 20261011-131100-示例HTML页面.html
├── scripts/
│   └── gen-manifest.js   # 扫描 blogs/ 生成 posts.json
├── .github/workflows/manifest.yml  # push 时自动重新生成 posts.json
└── posts.json            # 文章清单（自动生成，勿手改）
```

## 如何写文章

1. 在 `blogs/YYYY/MM/` 下新建文件，命名 `YYYYMMDD-HHMMSS-<主题名>.md` 或 `.html`
   （主题名 ≤32 字符，空格用下划线替代）
2. Markdown 文章开头写 YAML front matter（列表页会展示）：

   ```yaml
   ---
   name: "主题名"
   description: "摘要"
   created: "YYYYMMDD HHMMSS"
   tags: ["标签"]
   ---
   ```

3. HTML 文章写完整独立的网页，展示时以 iframe 整页嵌入
4. push 到 main 后，GitHub Actions 自动更新 `posts.json`，页面即刻生效

## 本地预览

`posts.json` 须先存在（已提交），用任意静态服务器访问仓库根目录即可：

```bash
python3 -m http.server 8080
# 或 npx serve .
```

浏览器打开 http://localhost:8080 。注意：不能以 file:// 双击打开（浏览器会拦截 fetch）。
