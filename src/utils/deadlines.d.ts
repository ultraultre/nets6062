export function parseDeadline(value: unknown): number | null;
export function isExpired(dueAt: unknown, now?: number): boolean;
export function todoStatus(todo: { startAt: string; dueAt: string }, now?: number): string;
export function partitionFiles<T extends { dueAt?: string | null }>(files: T[], now?: number): { active: T[]; expired: T[] };
