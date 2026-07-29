import { chromium, type Browser } from "playwright";
import { BaseWorker, type WorkerContext } from "./base.js";
import type { WorkerResult } from "@multi-agent/shared";
import path from "path";

interface PlaywrightParams {
  url: string;
  action: "scrape" | "screenshot" | "click" | "fill" | "navigate" | "extract" | "links";
  selector?: string;
  attribute?: string;
  structured?: boolean;
  value?: string;
  waitFor?: string;
  fullPage?: boolean;
  filename?: string;
  _criticSuggestion?: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--force-color-profile=srgb",
        "--font-render-hinting=none",
      ],
    });
  }
  return browserInstance;
}

export class PlaywrightWorker extends BaseWorker {
  readonly name = "PLAYWRIGHT";

  async execute(parameters: Record<string, unknown>, ctx: WorkerContext): Promise<WorkerResult> {
    const p = parameters as unknown as PlaywrightParams;

    // Validate and normalise URL before opening the browser
    if (!p.url || typeof p.url !== "string") {
      return this.fail(`playwright: "url" parameter is required but was ${JSON.stringify(p.url)}. Every playwright step must include the target URL.`);
    }
    if (!/^https?:\/\//i.test(p.url)) {
      p.url = `https://${p.url}`;
    }

    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });
    // Hide automation signals from bot-detection scripts
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });
    const page = await context.newPage();

    try {
      // Try networkidle first; fall back to load if it times out
      try {
        await page.goto(p.url, { waitUntil: "networkidle", timeout: 30000 });
      } catch {
        await page.goto(p.url, { waitUntil: "load", timeout: 30000 });
      }

      // Extra wait for JS-heavy pages (React/Next.js) to finish painting
      await page.waitForTimeout(1500);

      if (p.waitFor) {
        await page.waitForSelector(p.waitFor, { timeout: 10000 }).catch(() => null);
      }

      switch (p.action) {
        case "scrape":
        case "extract": {
          // Parse a fallback selector out of the critic's suggestion if we're retrying
          let selector = p.selector ?? (p.attribute ? "a" : undefined);
          if (p._criticSuggestion) {
            const m = p._criticSuggestion.match(/['"`]([^'"`]+)['"`]/);
            if (m) selector = m[1];
          }

          if (p.attribute) {
            const trySelectors = selector ? [selector] : ["a"];
            // On retry, try more specific fallbacks — avoid broad "a[href]" which grabs nav links
            const fallbacks = ["a.titlelink", "a.storylink", ".title > a", "td.title a", "span.titleline > a"];
            const allSelectors = [...new Set([...trySelectors, ...fallbacks])];

            for (const sel of allSelectors) {
              const values = await page.$$eval(
                sel,
                (els, attr) => els.map((el) => el.getAttribute(attr)).filter(Boolean) as string[],
                p.attribute,
              ).catch(() => [] as string[]);
              const unique = [...new Set(values)];
              if (unique.length > 0) {
                return this.ok(unique.join("\n"), `Extracted ${unique.length} "${p.attribute}" values using selector "${sel}" from ${p.url}`);
              }
            }
            // All selectors failed — return page debug info so critic can diagnose
            const pageTitle = await page.title().catch(() => "unknown");
            const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "");
            return this.ok(
              "",
              `Extracted 0 "${p.attribute}" values from ${p.url} — page title: "${pageTitle}" — page snippet: ${bodySnippet}`,
            );
          }

          const pageTitle = await page.title().catch(() => "");

          // structured=true → return [{title, url}] array from matched anchor elements
          if (p.structured) {
            const structSelectors = [
              p.selector ?? "a.titlelink",
              "a.titlelink", "span.titleline > a", "a.storylink", "td.title a",
            ];
            const seen2 = new Set<string>();
            for (const sel of structSelectors) {
              if (seen2.has(sel)) continue;
              seen2.add(sel);
              try {
                const items = await page.evaluate((s) => {
                  return Array.from(document.querySelectorAll(s))
                    .map((el) => ({
                      title: (el as HTMLElement).innerText?.trim() ?? "",
                      url: (el as HTMLAnchorElement).href ?? "",
                    }))
                    .filter((it) => it.title && it.url);
                }, sel);
                if (items.length > 0) {
                  return this.ok(
                    JSON.stringify(items),
                    `Scraped ${items.length} structured items using "${sel}" from ${p.url}`,
                  );
                }
              } catch { /* try next */ }
            }
            return this.ok("[]", `Scraped 0 structured items from ${p.url} — page title: "${pageTitle}"`);
          }

          if (!selector) {
            const content = await page.evaluate(() => document.body.innerText).catch(() => "");
            return this.ok(content, `Scraped ${content.length} characters from ${p.url} — page title: "${pageTitle}"`);
          }

          // Try the given selector then progressively broader fallbacks
          const textSelectors = [selector, "a.titlelink", "span.titleline > a", "a.storylink", "td.title a", ".title a"];
          const seen = new Set<string>();
          for (const sel of textSelectors) {
            if (seen.has(sel)) continue;
            seen.add(sel);
            try {
              const locator = page.locator(sel);
              const count = await locator.count();
              if (count > 0) {
                const texts = await locator.allInnerTexts();
                const content = texts.map((t) => t.trim()).filter(Boolean).join("\n");
                if (content) {
                  return this.ok(content, `Scraped ${count} elements using "${sel}" from ${p.url} — page title: "${pageTitle}"`);
                }
              }
            } catch { /* try next */ }
          }
          // All selectors failed — return body text so critic can see what actually loaded
          const body = await page.evaluate(() => document.body.innerText).catch(() => "");
          return this.ok(
            `SELECTOR_FAILED: none of [${textSelectors.join(", ")}] matched. Page snippet: ${body.slice(0, 500)}`,
            `Scraped 0 elements from ${p.url} — page title: "${pageTitle}"`,
          );
        }

        case "links": {
          // Extract all unique hrefs from the page
          const baseUrl = new URL(p.url);
          const hrefs = await page.$$eval(
            p.selector ?? "a[href]",
            (els, base) =>
              els
                .map((el) => {
                  const href = el.getAttribute("href") ?? "";
                  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
                  try { return new URL(href, base).href; } catch { return null; }
                })
                .filter((h): h is string => h !== null),
            baseUrl.origin,
          );
          const unique = [...new Set(hrefs)];
          return this.ok(unique, `Found ${unique.length} unique links on ${p.url}`);
        }

        case "screenshot": {
          const filename = p.filename ?? `screenshot_step${ctx.stepNumber}_${Date.now()}.png`;
          const screenshotPath = path.join(ctx.workDir, filename);
          await page.screenshot({
            path: screenshotPath,
            fullPage: p.fullPage ?? false,
          });
          return this.ok(screenshotPath, `Screenshot saved to ${filename}`);
        }

        case "click": {
          if (!p.selector) return this.fail("selector required for click");
          await page.click(p.selector, { timeout: 10000 });
          await page.waitForLoadState("domcontentloaded");
          return this.ok(null, `Clicked ${p.selector}`);
        }

        case "fill": {
          if (!p.selector) return this.fail("selector required for fill");
          await page.fill(p.selector, p.value ?? "");
          return this.ok(null, `Filled ${p.selector} with value`);
        }

        case "navigate": {
          const title = await page.title();
          const currentUrl = page.url();
          return this.ok({ url: currentUrl, title }, `Navigated to ${currentUrl}: "${title}"`);
        }

        default:
          return this.fail(`Unknown playwright action: ${String(p.action)}`);
      }
    } catch (err) {
      return this.fail(`Playwright error: ${(err as Error).message}`);
    } finally {
      await context.close();
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
