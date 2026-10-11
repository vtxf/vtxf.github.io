/* vtxf 博客前端 —— 零框架原生 JS
 * 路由：#/ 列表 · #/archive 归档 · #/blogs/<path> 文章（hash 路由，GitHub Pages 静态托管）
 * 依赖（全部本地化，无 CDN）：marked.min.js / highlight.min.js
 */
'use strict';
(function () {
  var $ = function (sel) { return document.querySelector(sel); };
  var POSTS = [];
  var BATCH = 20;  // 列表分批加载：每批篇数（滚动到底自动追加）
  var state = { query: '', tag: null, shown: 0, filtered: [] };

  /* ---------- 内联图标（取自 Feather Icons v4.29.2，MIT） ---------- */

  var ICONS = {
    copy: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    external: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-external-link"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
    link: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-link-2"><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"></path><line x1="8" y1="12" x2="16" y2="12"></line></svg>'
  };

  function icon(name) {
    var span = document.createElement('span');
    span.innerHTML = ICONS[name];
    return span.firstChild;
  }

  /* ---------- 工具 ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // '20261011 131000' → '2026-10-11 13:10'
  function fmtDate(ts) {
    var m = String(ts).match(/^(\d{4})(\d{2})(\d{2})[\s-]?(\d{2})?(\d{2})?/);
    if (!m) return String(ts);
    var s = m[1] + '-' + m[2] + '-' + m[3];
    if (m[4]) s += ' ' + m[4] + ':' + (m[5] || '00');
    return s;
  }

  // 把文章内相对路径解析为相对文章所在目录的路径
  function resolveRel(rel, postPath) {
    if (/^(https?:|mailto:|data:|#|\/\/)/i.test(rel)) return rel;
    var dir = postPath.indexOf('/') >= 0 ? postPath.slice(0, postPath.lastIndexOf('/') + 1) : '';
    return new URL(rel, 'http://d/' + dir).href.replace('http://d/', '');
  }

  function parseFrontMatter(text) {
    var m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta: {}, body: text };
    var meta = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (!kv) return;
      var v = kv[2].trim();
      if (v.charAt(0) === '[' && v.charAt(v.length - 1) === ']') {
        v = v.slice(1, -1).split(',').map(function (s) {
          return s.trim().replace(/^["']|["']$/g, '');
        }).filter(Boolean);
      } else {
        v = v.replace(/^["']|["']$/g, '');
      }
      meta[kv[1]] = v;
    });
    return { meta: meta, body: text.slice(m[0].length) };
  }

  function normalizeTags(t) {
    return t instanceof Array ? t : (t ? [String(t)] : []);
  }

  function showTip(box, message, isError) {
    box.textContent = '';
    box.appendChild(el('p', 'tip' + (isError ? ' error' : ''), message));
  }

  function replayFade(node) {
    node.classList.remove('fade-in');
    void node.offsetWidth;
    node.classList.add('fade-in');
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    ta.remove();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
    }
    legacyCopy(text);
    return Promise.resolve();
  }

  /* ---------- 代码块增强：语法高亮 + 语言标签 + 复制 ---------- */

  function enhanceCode(root) {
    var nodes = root.querySelectorAll('pre > code');
    Array.prototype.forEach.call(nodes, function (code) {
      var pre = code.parentNode;
      if (pre.parentNode && pre.parentNode.classList.contains('code-block')) return;

      var wrap = el('div', 'code-block');
      wrap.setAttribute('data-u32-name', '代码块');
      var lang = (code.className.match(/language-([\w+#-]+)/) || [])[1] || '';
      if (lang && lang !== 'mermaid') wrap.setAttribute('data-lang', lang);

      pre.replaceWith(wrap);
      wrap.appendChild(pre);

      if (window.hljs && lang !== 'mermaid') {
        try { window.hljs.highlightElement(code); } catch (e) { /* 高亮失败保留原样 */ }
      }

      var btn = el('button', 'code-copy-btn');
      btn.type = 'button';
      btn.title = '复制代码';
      btn.setAttribute('aria-label', '复制代码');
      btn.setAttribute('data-u32-name', '复制代码按钮');
      btn.appendChild(icon('copy'));
      btn.addEventListener('click', function () {
        var text = code.textContent;
        copyText(text).then(function () {
          btn.classList.add('done');
          btn.title = '已复制';
          btn.replaceChild(icon('check'), btn.firstChild);
          setTimeout(function () {
            btn.classList.remove('done');
            btn.title = '复制代码';
            btn.replaceChild(icon('copy'), btn.firstChild);
          }, 1600);
        });
      });
      wrap.appendChild(btn);
    });
  }

  /* ---------- 按需异步加载（Mermaid / KaTeX，检测到对应内容才加载） ---------- */

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { cb(null); };
    s.onerror = function () { cb(new Error('加载失败：' + src)); };
    document.head.appendChild(s);
  }

  // Mermaid 图：```mermaid 代码块 → 异步渲染为 SVG；失败降级为源码
  var mermaidLoading = false;

  function renderMermaid(root) {
    var blocks = root.querySelectorAll('pre > code.language-mermaid');
    if (!blocks.length) return;

    var keepSource = function (ns) {
      Array.prototype.forEach.call(ns, function (n) {
        if (!n.querySelector('svg')) {
          var pre = document.createElement('pre');
          pre.className = 'mermaid-source';
          pre.textContent = n.textContent;
          n.replaceWith(pre);
        }
      });
    };

    Array.prototype.forEach.call(blocks, function (code) {
      var holder = el('div', 'mermaid-chart');
      holder.setAttribute('data-u32-name', 'Mermaid图');
      holder.textContent = code.textContent;
      code.parentNode.replaceWith(holder);
    });
    var nodes = root.querySelectorAll('.mermaid-chart');

    var run = function () {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
        window.mermaid.run({ nodes: Array.prototype.slice.call(nodes), suppressErrors: true })
          .catch(function () { keepSource(nodes); });
      } catch (e) { keepSource(nodes); }
    };

    if (window.mermaid) { run(); return; }
    if (mermaidLoading) return;  // 首次加载中，稍后的文章重新进入时会再次调用
    mermaidLoading = true;
    loadScript('assets/mermaid.min.js', function (err) {
      mermaidLoading = false;
      if (err) keepSource(nodes);
      else run();
    });
  }

  // KaTeX 数学公式：检出 $$ / \[ / \( 分隔符才异步加载渲染
  var katexLoading = false;

  function renderMath(root, bodyText) {
    if (!/\$\$|\\\[|\\\(/.test(bodyText)) return;

    var run = function () {
      try {
        window.renderMathInElement(root, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      } catch (e) { /* 渲染失败保留原文 */ }
    };

    if (window.renderMathInElement) { run(); return; }
    if (katexLoading) return;
    katexLoading = true;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'assets/katex/katex.min.css';
    document.head.appendChild(css);
    loadScript('assets/katex/katex.min.js', function (err) {
      if (err) { katexLoading = false; return; }
      loadScript('assets/katex/auto-render.min.js', function (err2) {
        katexLoading = false;
        if (!err2) run();
      });
    });
  }

  /* ---------- 图片灯箱 + 懒加载 ---------- */

  var lightbox = $('#lightbox');
  var lbImg = $('#lightbox-img');

  function openLightbox(src, alt) {
    lbImg.src = src;
    lbImg.alt = alt || '';
    lightbox.hidden = false;
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.src = '';
  }

  lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });

  // 正文图与封面图点击放大（事件委托，覆盖动态渲染内容）
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof HTMLImageElement)) return;
    if (!t.closest('.markdown-body') && !t.closest('.cover-banner')) return;
    openLightbox(t.currentSrc || t.src, t.alt);
  });

  function lazyImages(root) {
    root.querySelectorAll('img').forEach(function (img) {
      img.setAttribute('loading', 'lazy');
      img.decoding = 'async';
      if (!img.alt) img.alt = '';
    });
  }

  /* ---------- 列表：搜索 + 标签筛选 + 分批加载 ---------- */

  var listBox, tagBar, postUl, sentinel, infoTip, observer;

  function collectTags() {
    var counts = {};
    POSTS.forEach(function (p) {
      normalizeTags(p.tags).forEach(function (t) {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, 'zh');
    });
  }

  function buildToolbar() {
    listBox = $('#list-box');
    listBox.textContent = '';

    tagBar = el('div', 'tag-bar');
    tagBar.setAttribute('data-u32-name', '标签筛选栏');
    listBox.appendChild(tagBar);

    postUl = el('ul', 'post-list');
    postUl.setAttribute('data-u32-name', '文章列表');
    listBox.appendChild(postUl);

    sentinel = el('div', 'list-sentinel');
    sentinel.setAttribute('data-u32-name', '分批加载哨兵');
    listBox.appendChild(sentinel);

    infoTip = el('p', 'list-footer-tip');
    infoTip.setAttribute('data-u32-name', '列表信息');
    listBox.appendChild(infoTip);

    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) renderMore();
    });
    observer.observe(sentinel);

    rebuildTagBar();
    renderResults();
  }

  function rebuildTagBar() {
    tagBar.textContent = '';
    var mk = function (label, count, value) {
      var b = el('button', 'tag-chip' + ((state.tag || null) === value ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('data-u32-name', '标签筛选-' + label);
      b.appendChild(el('span', null, label));
      b.appendChild(el('span', 'chip-count', String(count)));
      b.addEventListener('click', function () {
        state.tag = (state.tag === value) ? null : value;
        state.shown = 0;
        rebuildTagBar();
        renderResults();
      });
      tagBar.appendChild(b);
    };
    mk('全部', POSTS.length, null);
    collectTags().forEach(function (t) {
      mk(t, POSTS.filter(function (p) { return normalizeTags(p.tags).indexOf(t) >= 0; }).length, t);
    });
  }

  // 关键词匹配标题/摘要/标签；叠加标签筛选（与关系）
  function computeFiltered() {
    var q = state.query.trim().toLowerCase();
    return POSTS.filter(function (p) {
      if (state.tag && normalizeTags(p.tags).indexOf(state.tag) < 0) return false;
      if (!q) return true;
      var hay = (p.title + ' ' + (p.description || '') + ' ' + normalizeTags(p.tags).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function buildPostItem(p) {
    var li = el('li', 'post-item');
    var h3 = el('h3', 'post-title');
    var a = el('a', null, p.title);
    a.href = '#/' + p.path;
    h3.appendChild(a);
    li.appendChild(h3);

    var meta = el('div', 'post-meta');
    meta.appendChild(el('span', 'post-type', p.type === 'md' ? 'Markdown' : 'HTML'));
    if (p.date) meta.appendChild(el('span', 'post-date', fmtDate(p.date)));
    normalizeTags(p.tags).forEach(function (t) {
      meta.appendChild(el('span', 'tag', t));
    });
    li.appendChild(meta);

    if (p.description) li.appendChild(el('p', 'post-desc', p.description));
    return li;
  }

  function renderResults() {
    state.filtered = computeFiltered();
    state.shown = Math.min(BATCH, state.filtered.length);
    postUl.textContent = '';
    for (var i = 0; i < state.shown; i++) postUl.appendChild(buildPostItem(state.filtered[i]));
    updateInfo();
  }

  function renderMore() {
    if (state.shown >= state.filtered.length) return;
    var to = Math.min(state.shown + BATCH, state.filtered.length);
    for (var i = state.shown; i < to; i++) postUl.appendChild(buildPostItem(state.filtered[i]));
    state.shown = to;
    updateInfo();
  }

  function updateInfo() {
    infoTip.textContent = '';
    var filtering = !!(state.query.trim() || state.tag);
    infoTip.appendChild(el('span', null, filtering
      ? (state.shown < state.filtered.length
        ? '已显示 ' + state.shown + ' / ' + state.filtered.length + ' 篇（滚动加载更多）'
        : '筛选出 ' + state.filtered.length + ' / ' + POSTS.length + ' 篇')
      : '共 ' + POSTS.length + ' 篇 · 内容来自 blogs/ 目录'));
    if (filtering) {
      var clear = el('button', 'clear-filter-btn', '清除筛选');
      clear.type = 'button';
      clear.setAttribute('data-u32-name', '清除筛选按钮');
      clear.addEventListener('click', function () {
        state.query = '';
        state.tag = null;
        $('#search-input').value = '';
        $('#search-clear').hidden = true;
        rebuildTagBar();
        renderResults();
      });
      infoTip.appendChild(clear);
    }
  }

  /* ---------- 归档视图 ---------- */

  function showArchive() {
    setView('archive');
    var box = $('#archive-box');
    box.textContent = '';

    var byYear = {};
    POSTS.forEach(function (p) {
      var y = (String(p.date).match(/^\d{4}/) || ['其他'])[0];
      (byYear[y] = byYear[y] || []).push(p);
    });
    Object.keys(byYear).sort(function (a, b) { return b.localeCompare(a); }).forEach(function (y) {
      var group = el('section', 'archive-group');
      group.setAttribute('data-u32-name', '归档-' + y);
      group.appendChild(el('h2', 'archive-year', y + ' 年'));

      var byMonth = {};
      byYear[y].forEach(function (p) {
        var mm = (String(p.date).match(/^\d{4}(\d{2})/) || [])[1] || '?';
        (byMonth[mm] = byMonth[mm] || []).push(p);
      });
      Object.keys(byMonth).sort(function (a, b) { return b.localeCompare(a); }).forEach(function (mm) {
        group.appendChild(el('h3', 'archive-month', parseInt(mm, 10) + ' 月'));
        var ul = el('ul', 'archive-list');
        byMonth[mm].forEach(function (p) {
          var li = el('li');
          li.appendChild(el('span', 'a-date', String(p.date).replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$2-$3')));
          var a = el('a', 'a-title', p.title);
          a.href = '#/' + p.path;
          li.appendChild(a);
          li.appendChild(el('span', 'post-type', p.type === 'md' ? 'MD' : 'HTML'));
          ul.appendChild(li);
        });
        group.appendChild(ul);
      });
      box.appendChild(group);
    });
    if (!POSTS.length) showTip(box, '暂无文章。');
    document.title = '归档 - vtxf 的博客';
  }

  /* ---------- 文章页 ---------- */

  // 阅读时长估算：正文去掉代码块后按每分钟约 450 字计
  function readingMinutes(body) {
    var chars = body.replace(/```[\s\S]*?```/g, '').replace(/\s/g, '').length;
    return Math.max(1, Math.round(chars / 450));
  }

  function buildCopyLinkBtn() {
    var btn = el('button', 'meta-btn');
    btn.type = 'button';
    btn.setAttribute('data-u32-name', '复制本文链接按钮');
    btn.appendChild(icon('link'));
    btn.appendChild(el('span', null, '复制链接'));
    btn.addEventListener('click', function () {
      copyText(location.href).then(function () {
        btn.classList.add('done');
        btn.replaceChild(el('span', null, '已复制'), btn.lastChild);
        setTimeout(function () {
          btn.classList.remove('done');
          btn.replaceChild(el('span', null, '复制链接'), btn.lastChild);
        }, 1600);
      });
    });
    return btn;
  }

  // 上一篇/下一篇（清单按时间倒序：idx-1 更新，idx+1 更早）
  function appendPostFooter(box, p) {
    var idx = POSTS.indexOf(p);
    var older = POSTS[idx + 1];
    var newer = POSTS[idx - 1];
    if (!older && !newer) return;

    var foot = el('div', 'post-footer');
    foot.setAttribute('data-u32-name', '上下篇导航');
    var mk = function (label, post, cls) {
      var a = el('a', 'post-nav-card' + (cls ? ' ' + cls : ''));
      if (post) {
        a.href = '#/' + post.path;
        a.setAttribute('data-u32-name', label);
        a.appendChild(el('span', 'pn-label', label));
        a.appendChild(el('span', 'pn-title', post.title));
      } else {
        a.classList.add('empty');
        a.setAttribute('aria-hidden', 'true');
      }
      return a;
    };
    foot.appendChild(mk('← 上一篇', older, 'prev'));
    foot.appendChild(mk('下一篇 →', newer, 'next'));
    box.appendChild(foot);
  }

  function showMdPost(p) {
    var box = $('#post-box');
    fetch(p.path).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      var fm = parseFrontMatter(text);
      var html = marked.parse(fm.body);
      var title = fm.meta.name || p.title;

      box.textContent = '';
      var head = el('div', 'entry-head');
      head.appendChild(el('h1', null, title));
      var meta = el('div', 'entry-meta');
      if (p.date) meta.appendChild(el('span', 'post-date', fmtDate(p.date)));
      meta.appendChild(el('span', null, '约 ' + readingMinutes(fm.body) + ' 分钟'));
      normalizeTags(fm.meta.tags || p.tags).forEach(function (t) {
        meta.appendChild(el('span', 'tag', t));
      });
      meta.appendChild(buildCopyLinkBtn());
      head.appendChild(meta);
      box.appendChild(head);

      // 封面横幅（front matter cover 字段，仅文章页展示，列表不展示）
      var coverRel = fm.meta.cover || p.cover;
      if (coverRel) {
        var cover = el('div', 'cover-banner');
        cover.setAttribute('data-u32-name', '封面图');
        var cimg = document.createElement('img');
        cimg.src = resolveRel(String(coverRel), p.path);
        cimg.alt = title + ' 封面';
        cover.appendChild(cimg);
        box.appendChild(cover);
      }

      var body = el('div', 'markdown-body');
      body.innerHTML = html;
      // 相对路径修正：图片/链接相对于文章所在目录
      body.querySelectorAll('img[src]').forEach(function (node) {
        node.src = resolveRel(node.getAttribute('src'), p.path);
      });
      body.querySelectorAll('a[href]').forEach(function (node) {
        var href = resolveRel(node.getAttribute('href'), p.path);
        node.href = href;
        if (/\.md$|\.html$/i.test(href)) node.href = '#/' + href;  // 站内文章互链走 hash 路由
      });
      lazyImages(body);
      box.appendChild(body);

      renderMermaid(body);   // 先于 enhanceCode：mermaid 块提取为图容器，不进代码块包装
      enhanceCode(body);
      appendPostFooter(box, p);
      renderMath(body, fm.body);
      replayFade(box);
      document.title = title + ' - vtxf 的博客';
    }).catch(function (err) {
      showTip(box, '文章加载失败：' + err.message, true);
    });
  }

  // HTML 文章：通栏最大化，只保留工具条（遵守 vh 禁令，高度用 JS 按视口剩余空间计算）
  function fitHtmlFrame() {
    if (!$('#post-view').classList.contains('html-mode')) return;
    var frame = $('#post-box .html-frame');
    var bar = $('#post-box .html-bar');
    var header = $('.site-header');
    if (!frame) return;
    var used = (header ? header.offsetHeight : 0) + (bar ? bar.offsetHeight : 0);
    frame.style.height = Math.max(320, window.innerHeight - used) + 'px';
  }
  window.addEventListener('resize', fitHtmlFrame);

  function showHtmlPost(p) {
    var box = $('#post-box');
    $('#post-view').classList.add('html-mode');
    document.body.classList.add('html-mode');

    box.textContent = '';
    var bar = el('div', 'html-bar');
    var inner = el('div', 'html-bar-inner');
    inner.setAttribute('data-u32-name', 'HTML文章工具条内容');
    var back = el('a', 'back', '← 返回列表');
    back.href = '#/';
    var title = el('span', 'bar-title', p.title);
    var open = el('a', 'open-btn');
    open.href = p.path;
    open.target = '_blank';
    open.rel = 'noopener';
    open.setAttribute('data-u32-name', '新窗口打开按钮');
    open.appendChild(icon('external'));
    open.appendChild(el('span', null, '新窗口打开'));
    inner.appendChild(back);
    inner.appendChild(title);
    inner.appendChild(open);
    bar.appendChild(inner);
    box.appendChild(bar);

    var frame = el('iframe', 'html-frame');
    frame.setAttribute('data-u32-name', 'HTML文章内嵌框');
    frame.src = p.path;
    frame.title = p.title;
    box.appendChild(frame);

    appendPostFooter(box, p);
    fitHtmlFrame();
    replayFade(box);
    document.title = p.title + ' - vtxf 的博客';
  }

  /* ---------- 视图切换 ---------- */

  function setView(name) {
    $('#list-view').hidden = name !== 'list';
    $('#archive-view').hidden = name !== 'archive';
    $('#about-view').hidden = name !== 'about';
    $('#post-view').hidden = name !== 'post';
    if (name === 'list') {
      if (listBox) renderResults();
      document.title = 'vtxf 的博客';
    }
    if (name === 'about') {
      document.title = '关于 - vtxf 的博客';
    }
  }

  /* ---------- 搜索框 ---------- */

  function initSearch() {
    var input = $('#search-input');
    var clear = $('#search-clear');
    input.addEventListener('input', function () {
      state.query = input.value;
      clear.hidden = !input.value;
      // 非列表视图时先跳回列表（触发 route → setView('list') → renderResults）
      if (!/^#\/?$/.test(location.hash)) location.hash = '#/';
      else { state.shown = 0; renderResults(); }
    });
    clear.addEventListener('click', function () {
      input.value = '';
      state.query = '';
      clear.hidden = true;
      if (/^#\/?$/.test(location.hash)) renderResults();
      input.focus();
    });
  }

  /* ---------- 返回顶部 ---------- */

  function initBackTop() {
    var btn = $('#back-top');
    window.addEventListener('scroll', function () {
      btn.hidden = window.scrollY < 400;
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 关于页（微信复制） ---------- */

  function initAbout() {
    var btn = $('#copy-wechat');
    if (!btn) return;
    btn.addEventListener('click', function () {
      copyText('vtxf3d').then(function () {
        btn.classList.add('done');
        btn.replaceChild(el('span', null, '已复制'), btn.lastChild);
        setTimeout(function () {
          btn.classList.remove('done');
          btn.replaceChild(el('span', null, '复制'), btn.lastChild);
        }, 1600);
      });
    });
  }

  /* ---------- 路由 ---------- */

  function route() {
    // 离开 HTML 全屏态与灯箱
    $('#post-view').classList.remove('html-mode');
    document.body.classList.remove('html-mode');
    closeLightbox();

    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!h || h === '/') {
      setView('list');
      return;
    }
    if (h === '/archive') {
      showArchive();
      return;
    }
    if (h === '/about') {
      setView('about');
      return;
    }
    h = h.replace(/^\//, '');  // '#/blogs/...' 与清单路径 'blogs/...' 对齐
    var p = POSTS.find(function (x) { return x.path === h; });
    if (p) {
      setView('post');
      if (p.type === 'html') showHtmlPost(p);
      else showMdPost(p);
    } else {
      setView('post');
      showTip($('#post-box'), '文章不存在：' + h + '。可能已被移动或重命名。', true);
    }
  }

  function showError(message) {
    setView('list');
    showTip($('#list-box'), message, true);
  }

  /* ---------- 启动 ---------- */

  if (window.hljs) {
    try { window.hljs.configure({ ignoreUnescapedHTML: true }); } catch (e) { /* 忽略 */ }
  }

  // 时间戳参数穿透 CDN 缓存，保证 push 后文章清单即刻生效
  fetch('posts.json?ts=' + Date.now()).then(function (res) {
    if (!res.ok) throw new Error('posts.json 加载失败（HTTP ' + res.status + '）');
    return res.json();
  }).then(function (data) {
    POSTS = (data && data.posts) || [];
    buildToolbar();
    initSearch();
    initBackTop();
    initAbout();
    window.addEventListener('hashchange', route);
    route();
  }).catch(function (err) {
    showError('清单加载失败：' + err.message + '。请通过 http 服务器访问（不能双击 file:// 打开），或在仓库根目录运行 node scripts/gen-manifest.js 重新生成清单。');
  });
})();
