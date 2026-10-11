#!/usr/bin/env node
/**
 * 扫描 blogs/ 目录，生成文章清单 posts.json
 *
 * 条目规则（JSL(YM+S/A/F) 年月模式）：
 *  - 单文件模式：blogs/YYYY/MM/YYYYMMDD-HHMMSS-<主题名>.md|.html 直接作为一条文章
 *  - 文件夹模式：blogs/YYYY/MM/YYYYMMDD-HHMMSS-<主题名>/ 文件夹，
 *    以内部与文件夹同名的 .md（优先）或 .html 为主文档作为一条文章，
 *    其余平级文件视为资料（不进清单，可被文章相对路径引用）
 *  - 任何下划线开头的目录（如 *_attachments/）跳过
 *
 * 用法：node scripts/gen-manifest.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOGS_DIR = path.join(ROOT, 'blogs');
const OUT_FILE = path.join(ROOT, 'posts.json');

const TS_DIR_RE = /^(\d{8})-(\d{6})-(.+)$/;

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('_') || name.endsWith('_attachments')) continue;
    const full = path.join(dir, name);
    const rel = path.relative(BLOGS_DIR, full).split(path.sep).join('/');
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (TS_DIR_RE.test(name)) acc.timestampedDirs.push({ name, rel });
      else walk(full, acc);
    } else {
      acc.files.push({ name, rel });
    }
  }
  return acc;
}

function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    meta[kv[1]] = v;
  }
  return meta;
}

function makeEntry(relPath, type) {
  const base = path.posix.basename(relPath);
  const m = base.match(/^(\d{8})-(\d{6})-(.+)\.(md|html)$/);
  const topic = m ? m[3] : base.replace(/\.(md|html)$/, '');
  let title = topic;
  let description = '';
  let tags = [];
  if (type === 'md') {
    const text = fs.readFileSync(path.join(BLOGS_DIR, relPath), 'utf8');
    const meta = parseFrontMatter(text);
    if (meta.name) title = String(meta.name);
    if (meta.description) description = String(meta.description);
    if (Array.isArray(meta.tags)) tags = meta.tags;
    else if (meta.tags) tags = [String(meta.tags)];
  } else {
    // html 条目：从 <title> 取标题，避免 ASCII 文件名直接暴露为标题
    const text = fs.readFileSync(path.join(BLOGS_DIR, relPath), 'utf8');
    const m = text.match(/<title>([\s\S]*?)<\/title>/i);
    if (m) title = m[1].trim();
  }
  return {
    path: 'blogs/' + relPath,
    type,
    title,
    date: m ? m[1] + ' ' + m[2] : '',
    description,
    tags
  };
}

function main() {
  if (!fs.existsSync(BLOGS_DIR)) {
    console.error('未找到 blogs/ 目录：' + BLOGS_DIR);
    process.exit(1);
  }

  const acc = walk(BLOGS_DIR, { files: [], timestampedDirs: [] });
  const entries = [];
  const usedFiles = new Set();

  // 文件夹模式：时间戳文件夹内与文件夹同名的主文档
  for (const d of acc.timestampedDirs) {
    const mdRel = d.rel + '/' + d.name + '.md';
    const htmlRel = d.rel + '/' + d.name + '.html';
    const mainRel = fs.existsSync(path.join(BLOGS_DIR, mdRel)) ? mdRel
      : fs.existsSync(path.join(BLOGS_DIR, htmlRel)) ? htmlRel : null;
    if (!mainRel) {
      console.warn('警告：文件夹模式条目缺少主文档（<文件夹名>.md|.html）：%s', d.rel);
      continue;
    }
    usedFiles.add(mainRel);
    entries.push(makeEntry(mainRel, mainRel.endsWith('.md') ? 'md' : 'html'));
  }

  // 单文件模式：未被文件夹模式占用的时间戳 md/html 文件
  for (const f of acc.files) {
    if (!TS_DIR_RE.test(f.name.replace(/\.(md|html)$/, ''))) continue;
    if (usedFiles.has(f.rel)) continue;
    const type = f.name.endsWith('.md') ? 'md' : 'html';
    entries.push(makeEntry(f.rel, type));
  }

  entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const generated = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate())
    + ' ' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());

  const out = { generated, count: entries.length, posts: entries };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('已生成 posts.json：%d 篇文章（%s）', entries.length, generated);
  for (const e of entries) console.log('  [' + e.type + '] ' + e.date + ' ' + e.title);
}

main();
