/* vtxf 博客前端 —— 零框架原生 JS
 * 路由：#/ 列表 · #/blogs/<path> 文章（hash 路由，GitHub Pages 静态托管）
 * 依赖（全部本地化，无 CDN）：marked.min.js / highlight.min.js
 */
'use strict';
(function () {
  var $ = function (sel) { return document.querySelector(sel); };
  var POSTS = [];

  /* ---------- 内联图标（取自 Feather Icons v4.29.2，MIT） ---------- */

  var ICONS = {
    copy: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    external: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-external-link"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>'
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

  /* ---------- 代码块增强：语法高亮 + 语言标签 + 复制 ---------- */

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    ta.remove();
  }

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
        var done = function () {
          btn.classList.add('done');
          btn.title = '已复制';
          btn.replaceChild(icon('check'), btn.firstChild);
          setTimeout(function () {
            btn.classList.remove('done');
            btn.title = '复制代码';
            btn.replaceChild(icon('copy'), btn.firstChild);
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
        } else {
          legacyCopy(text);
          done();
        }
      });
      wrap.appendChild(btn);
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

  /* ---------- 列表 ---------- */

  function renderList() {
    var box = $('#list-box');
    box.textContent = '';
    if (!POSTS.length) {
      showTip(box, 'blogs/ 目录下还没有文章。');
      return;
    }
    var ul = el('ul', 'post-list');
    POSTS.forEach(function (p) {
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
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el('p', 'list-footer-tip', '共 ' + POSTS.length + ' 篇 · 内容来自 blogs/ 目录'));
  }

  /* ---------- 文章页 ---------- */

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
      normalizeTags(fm.meta.tags || p.tags).forEach(function (t) {
        meta.appendChild(el('span', 'tag', t));
      });
      head.appendChild(meta);
      box.appendChild(head);

      // 封面横幅（front matter cover 字段，仅文章页展示，列表不展示）
      if (fm.meta.cover) {
        var cover = el('div', 'cover-banner');
        cover.setAttribute('data-u32-name', '封面图');
        var cimg = document.createElement('img');
        cimg.src = resolveRel(String(fm.meta.cover), p.path);
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

      enhanceCode(body);
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
    bar.setAttribute('data-u32-name', 'HTML文章工具条');
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
    bar.appendChild(back);
    bar.appendChild(title);
    bar.appendChild(open);
    box.appendChild(bar);

    var frame = el('iframe', 'html-frame');
    frame.setAttribute('data-u32-name', 'HTML文章内嵌框');
    frame.src = p.path;
    frame.title = p.title;
    box.appendChild(frame);

    fitHtmlFrame();
    replayFade(box);
    document.title = p.title + ' - vtxf 的博客';
  }

  function showPost(p) {
    $('#list-view').hidden = true;
    $('#post-view').hidden = false;
    if (p.type === 'html') showHtmlPost(p);
    else showMdPost(p);
  }

  function showList() {
    $('#post-view').hidden = true;
    $('#list-view').hidden = false;
    document.title = 'vtxf 的博客';
  }

  /* ---------- 路由 ---------- */

  function route() {
    // 离开 HTML 全屏态与灯箱
    $('#post-view').classList.remove('html-mode');
    document.body.classList.remove('html-mode');
    closeLightbox();

    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!h || h === '/') {
      showList();
      return;
    }
    h = h.replace(/^\//, '');  // '#/blogs/...' 与清单路径 'blogs/...' 对齐
    var p = POSTS.find(function (x) { return x.path === h; });
    if (p) {
      showPost(p);
    } else {
      $('#list-view').hidden = true;
      $('#post-view').hidden = false;
      showTip($('#post-box'), '文章不存在：' + h + '。可能已被移动或重命名。', true);
    }
  }

  function showError(message) {
    $('#list-view').hidden = false;
    $('#post-view').hidden = true;
    showTip($('#list-box'), message, true);
  }

  /* ---------- 启动 ---------- */

  if (window.hljs) {
    try { window.hljs.configure({ ignoreUnescapedHTML: true }); } catch (e) { /* 忽略 */ }
  }

  fetch('posts.json').then(function (res) {
    if (!res.ok) throw new Error('posts.json 加载失败（HTTP ' + res.status + '）');
    return res.json();
  }).then(function (data) {
    POSTS = (data && data.posts) || [];
    renderList();
    window.addEventListener('hashchange', route);
    route();
  }).catch(function (err) {
    showError('清单加载失败：' + err.message + '。请通过 http 服务器访问（不能双击 file:// 打开），或在仓库根目录运行 node scripts/gen-manifest.js 重新生成清单。');
  });
})();
