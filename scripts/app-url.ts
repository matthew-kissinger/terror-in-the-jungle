type QueryValue = string | number | boolean | null | undefined;

interface LocalAppUrlOptions {
  host?: string;
  port: number;
  path?: string;
  query?: Record<string, QueryValue>;
}

export function localAppUrl(options: LocalAppUrlOptions): string {
  const host = options.host ?? '127.0.0.1';
  const path = options.path ?? '/';
  const url = new URL(path, `http://${host}:${options.port}/`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }

  return url.toString();
}
