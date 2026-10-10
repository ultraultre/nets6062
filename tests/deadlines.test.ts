import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isExpired, parseDeadline, partitionFiles, todoStatus } from '../src/utils/deadlines.js';

describe('UTC+8 deadlines', () => {
  const due = '2026-10-20 18:00';
  const instant = Date.parse('2026-10-20T10:00:00Z');
  it('uses UTC+8 for wall-clock values and accepts explicit UTC+8', () => {
    expect(parseDeadline(due)).toBe(instant);
    expect(parseDeadline('2026-10-20T18:00:00+08:00')).toBe(instant);
    expect(isExpired(due, instant - 1)).toBe(false);
    expect(isExpired(due, instant)).toBe(true);
    expect(isExpired(due, instant + 1)).toBe(true);
  });
  it('rejects invalid dates instead of silently rolling them over', () => {
    for (const value of ['2026-02-30 12:00', '2026-10-20 24:00', '2026-10-20 18:60', '2026-10-20', 'bad', null, '2026-10-20T18:00:00Z']) expect(parseDeadline(value)).toBeNull();
    expect(parseDeadline('2028-02-29 12:00')).not.toBeNull();
  });
  it('transitions tasks from upcoming to active to ended', () => {
    const todo = { startAt: '2026-10-20 09:00', dueAt: due };
    const start = Date.parse('2026-10-20T01:00:00Z');
    expect(todoStatus(todo, start - 1)).toBe('未开始');
    expect(todoStatus(todo, start)).toBe('进行中');
    expect(todoStatus(todo, instant)).toBe('已经结束');
    expect(todoStatus({ ...todo, dueAt: 'bad' }, instant)).toBe('时间待确认');
  });
  it('automatically archives expired files while preserving download paths', () => {
    const files = [{ relativePath: '资料/报名.docx', dueAt: due }, { relativePath: '说明.pdf', dueAt: null }, { relativePath: '长期.pdf' }];
    expect(partitionFiles(files, instant - 1).active).toHaveLength(3);
    const groups = partitionFiles(files, instant);
    expect(groups.expired).toEqual([files[0]]);
    expect(groups.active).toEqual(files.slice(1));
    expect(files[0].relativePath).toBe('资料/报名.docx');
  });
});

describe('editable JSON content', () => {
  const data = path.resolve(import.meta.dirname, '../public/data');
  it('has nonempty unique IDs within each content list', () => {
    for (const name of ['notices.json', 'todos.json', 'tools.json']) {
      const items = JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
      const ids = items.map((item: { id: string }) => item.id);
      expect(ids.every((id: unknown) => typeof id === 'string' && id.trim() === id && id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('keeps configured file deadlines through index generation', () => {
    const deadlines = JSON.parse(fs.readFileSync(path.join(data, 'file-deadlines.json'), 'utf8'));
    const files = JSON.parse(fs.readFileSync(path.join(data, 'files.json'), 'utf8'));
    for (const file of files) expect(file.dueAt).toBe(deadlines[file.relativePath] ?? null);
  });
});
