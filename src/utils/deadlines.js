// All wall-clock values are interpreted in UTC+8, regardless of the visitor's timezone.
export function parseDeadline(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\+08:00)?$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, sec = '0'] = match;
  const wall = new Date(`${y}-${m}-${d}T${h}:${min}:${sec.padStart(2, '0')}Z`);
  if (!Number.isFinite(wall.getTime()) || wall.getUTCFullYear() !== +y || wall.getUTCMonth() + 1 !== +m || wall.getUTCDate() !== +d || wall.getUTCHours() !== +h || wall.getUTCMinutes() !== +min || wall.getUTCSeconds() !== +sec) return null;
  return wall.getTime() - 8 * 60 * 60 * 1000;
}

export function isExpired(dueAt, now = Date.now()) {
  const deadline = parseDeadline(dueAt);
  return deadline !== null && now >= deadline;
}

export function todoStatus(todo, now = Date.now()) {
  if (parseDeadline(todo.dueAt) === null || parseDeadline(todo.startAt) === null) return '时间待确认';
  if (isExpired(todo.dueAt, now)) return '已经结束';
  return now < parseDeadline(todo.startAt) ? '未开始' : '进行中';
}

export function partitionFiles(files, now = Date.now()) {
  return {
    active: files.filter(file => !isExpired(file.dueAt, now)),
    expired: files.filter(file => isExpired(file.dueAt, now)),
  };
}
