export function assetUrl(relative: string, base = import.meta.env.BASE_URL): string {
  const prefix = '/' + base.replace(/^\/+|\/+$/g, '') + '/';
  return prefix.replace(/\/+/g, '/') + relative.split('/').map(encodeURIComponent).join('/');
}

export function humanSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
