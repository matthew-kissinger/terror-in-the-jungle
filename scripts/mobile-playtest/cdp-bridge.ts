import { chromium, type Browser, type CDPSession, type Page } from 'playwright';

export type ConsoleEntry = { ts: string; type: string; text: string };

export class CDPBridge {
  private browser!: Browser;
  private _page!: Page;
  private _cdp!: CDPSession;
  private consoleMessages: ConsoleEntry[] = [];
  private consoleErrors: ConsoleEntry[] = [];

  get page(): Page { return this._page; }
  get cdp(): CDPSession { return this._cdp; }

  async connect(cdpPort: number = 9222): Promise<void> {
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 60_000 });
    const contexts = this.browser.contexts();
    if (contexts.length === 0) throw new Error('No browser contexts found');
    const pages = contexts[0].pages();
    if (pages.length === 0) throw new Error('No pages found');
    this._page = pages[0];
    this._cdp = await this._page.context().newCDPSession(this._page);

    this._page.on('console', msg => {
      const entry: ConsoleEntry = {
        ts: new Date().toISOString(),
        type: msg.type(),
        text: msg.text(),
      };
      this.consoleMessages.push(entry);
      if (msg.type() === 'error') {
        this.consoleErrors.push(entry);
      }
    });

    this._page.on('pageerror', err => {
      const entry: ConsoleEntry = {
        ts: new Date().toISOString(),
        type: 'pageerror',
        text: String(err.stack ?? err),
      };
      this.consoleMessages.push(entry);
      this.consoleErrors.push(entry);
    });

    console.log('CDP bridge connected to phone Chrome');
  }

  async navigate(url: string): Promise<void> {
    await this._page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  }

  async screenshot(path: string): Promise<void> {
    await this._page.screenshot({ path, type: 'png', timeout: 10_000 });
  }

  async evaluate<T>(fn: string | (() => T)): Promise<T> {
    return this._page.evaluate(fn);
  }

  async waitForSelector(selector: string, timeoutMs: number = 60_000): Promise<void> {
    await this._page.waitForSelector(selector, { timeout: timeoutMs });
  }

  async waitForFunction(fn: string | (() => boolean), timeoutMs: number = 120_000): Promise<void> {
    await this._page.waitForFunction(fn, undefined, { timeout: timeoutMs });
  }

  async getElementCenter(selector: string): Promise<{ x: number; y: number } | null> {
    return this._page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
  }

  async getViewportSize(): Promise<{ width: number; height: number }> {
    return this._page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }

  getConsoleLog(): ConsoleEntry[] { return this.consoleMessages; }
  getErrors(): ConsoleEntry[] { return this.consoleErrors; }

  clearLogs(): void {
    this.consoleMessages.length = 0;
    this.consoleErrors.length = 0;
  }

  async disconnect(): Promise<void> {
    try { await this._cdp?.detach(); } catch { /* ok */ }
    try { await this.browser?.close(); } catch { /* ok */ }
  }
}
