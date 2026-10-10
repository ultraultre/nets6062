import fs from 'node:fs';
import path from 'node:path';
import { parseDeadline } from '../src/utils/deadlines.js';

const root = process.cwd();
const source = path.join(root, 'document');
const target = path.join(root, 'public', 'downloads');
const data = path.join(root, 'public', 'data');
const deadlineFile = path.join(data, 'file-deadlines.json');
const deadlines = fs.existsSync(deadlineFile) ? JSON.parse(fs.readFileSync(deadlineFile, 'utf8')) : {};
if (!deadlines || typeof deadlines !== 'object' || Array.isArray(deadlines)) throw new Error('file-deadlines.json 必须是文件路径到截止时间的对象');
for (const [name, dueAt] of Object.entries(deadlines)) {
  if (dueAt !== null && parseDeadline(dueAt) === null) throw new Error(`${name} 的截止时间无效，请使用 YYYY-MM-DD HH:mm（UTC+8）或 null`);
}
// Validate editable content before publishing; IDs only need to be unique within each list.
for (const name of ['notices.json', 'todos.json', 'tools.json']) {
  const items = JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
  if (!Array.isArray(items)) throw new Error(`${name} 必须是数组`);
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim() || ids.has(item.id)) throw new Error(`${name} 存在空白或重复 ID：${item?.id}`);
    ids.add(item.id);
    if (name === 'todos.json') {
      const start = parseDeadline(item.startAt), due = parseDeadline(item.dueAt);
      if (start === null || due === null || due < start) throw new Error(`${name} 中 ${item.id} 的起止时间无效（UTC+8）`);
    }
  }
}
const reviewFile = path.join(root, 'document-review.json');
const policy = fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, 'utf8')) : { exclude: [] };
const excluded = new Set(policy.exclude || []);
const maxSize = 100 * 1024 * 1024;
const files = [];
const pending = [];
const publishedPaths = new Set();

function walk(dir, relative = '') {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$') || /\.(tmp|bak|part|swp)$/i.test(entry.name)) continue;
    const rel = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    else if (entry.isFile()) {
      const stat = fs.statSync(path.join(dir, entry.name));
      const reason = excluded.has(rel) ? '需人工确认公开权限' : stat.size > maxSize ? '超过单文件 100 MiB 限制' : null;
      if (reason) { pending.push({ name: rel, size: stat.size, reason }); continue; }
      const ext = path.extname(entry.name).slice(1).toLowerCase() || 'file';
      files.push({ name: entry.name, relativePath: rel, extension: ext, size: stat.size, dueAt: deadlines[rel] ?? null,
        category: /^(pdf|doc|docx|txt)$/i.test(ext) ? '文档' : /^(xls|xlsx|csv)$/i.test(ext) ? '表格' : /^(ppt|pptx)$/i.test(ext) ? '演示文稿' : /^(zip|rar|7z)$/i.test(ext) ? '压缩包' : '其他' });
      publishedPaths.add(rel);
      const dest = path.join(target, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const old = fs.existsSync(dest) ? fs.statSync(dest) : null;
      if (!old || old.size !== stat.size || old.mtimeMs < stat.mtimeMs) fs.copyFileSync(path.join(dir, entry.name), dest);
    }
  }
}

fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(target, { recursive: true });
walk(source);
function prune(dir, relative = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(relative, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { prune(full, rel); if (fs.readdirSync(full).length === 0) fs.rmdirSync(full); }
    else if (entry.isFile() && !publishedPaths.has(rel)) fs.unlinkSync(full);
  }
}
prune(target);
files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
fs.writeFileSync(path.join(data, 'files.json'), JSON.stringify(files, null, 2));
fs.writeFileSync(path.join(data, 'pending-files.json'), JSON.stringify(pending, null, 2));
console.log(`Published ${files.length} file(s); ${pending.length} held for review.`);
for (const item of pending) console.log(`REVIEW: ${item.name} — ${item.reason}`);
