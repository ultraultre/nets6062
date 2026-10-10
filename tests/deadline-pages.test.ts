import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('updates task pages and the file archive at the UTC+8 deadline without a reload', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T09:59:59Z'));
  const app = { innerHTML: '' };
  const count = { textContent: '' };
  const list = { innerHTML: '' };
  const archive = { textContent: '' };
  const searchHandlers: Record<string, (event: { target: { value: string } }) => void> = {};
  const windowHandlers: Record<string, () => void> = {};
  const documentHandlers: Record<string, (event: unknown) => void> = {};
  const location = { hash: '#todos' };
  vi.stubGlobal('location', location);
  vi.stubGlobal('localStorage', { getItem: () => 'light' });
  vi.stubGlobal('window', { addEventListener: (name: string, handler: () => void) => { windowHandlers[name] = handler; } });
  vi.stubGlobal('document', {
    documentElement: { dataset: {} }, hidden: false,
    addEventListener: (name: string, handler: (event: unknown) => void) => { documentHandlers[name] = handler; },
    querySelector: (selector: string) => {
      if (selector === '#app') return app;
      if (selector === '.count') return count;
      if (selector === '.file-list') return list;
      if (selector === '[data-category="过期文件"]') return archive;
      if (selector === '#file-search') return { addEventListener: (name: string, handler: typeof searchHandlers[string]) => { searchHandlers[name] = handler; } };
      return null;
    },
  });
  const todo = { id: 'task', content: '报名', requirements: '提交', startAt: '2026-10-20 09:00', dueAt: '2026-10-20 18:00', details: '详情' };
  const files = [{ name: '报名.docx', relativePath: '报名.docx', extension: 'docx', size: 100, category: '文档', dueAt: todo.dueAt }, { name: '说明.pdf', relativePath: '说明.pdf', extension: 'pdf', size: 100, category: '文档', dueAt: null }];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('todos.json') ? [todo] : url.endsWith('files.json') ? files : url.endsWith('graph.json') ? { nodes: [], edges: [] } : [] })));
  await import('../src/main');
  await vi.advanceTimersByTimeAsync(0);
  expect(app.innerHTML).toContain('进行中');
  expect(app.innerHTML).toContain('UTC+8');
  await vi.advanceTimersByTimeAsync(1000);
  expect(app.innerHTML).toContain('已经结束');
  location.hash = '#todo/task'; windowHandlers.hashchange();
  expect(app.innerHTML).toContain('已经结束');
  location.hash = '#files'; windowHandlers.hashchange();
  expect(app.innerHTML).toContain('文件下载');
  expect(list.innerHTML).toContain('说明.pdf');
  expect(list.innerHTML).not.toContain('报名.docx');
  expect(archive.textContent).toBe('过期文件（1）');
  documentHandlers.click({ target: { closest: (selector: string) => selector === '[data-category]' ? { dataset: { category: '过期文件' } } : null } });
  expect(list.innerHTML).toContain('报名.docx');
  expect(list.innerHTML).toContain('已过期');
  expect(list.innerHTML).toContain('download="报名.docx"');
  searchHandlers.input({ target: { value: '说明' } });
  expect(count.textContent).toBe('0 个文件');
  // A clock correction moves the file back out of the archive on returning to the tab.
  vi.setSystemTime(new Date('2026-10-20T09:59:59Z'));
  windowHandlers.focus();
  expect(archive.textContent).toBe('过期文件（0）');
});
