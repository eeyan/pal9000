import { describe, it, expect } from 'vitest';
import { inAppBrowser } from '../../src/assets/js/browser-check.js';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  // Bare WKWebView (and the installed home-screen app) — no Safari/ token.
  iosWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('inAppBrowser', () => {
  it.each(['iosSafari', 'iosChrome', 'androidChrome', 'macSafari', 'winChrome'])('%s is a real browser', (k) => {
    expect(inAppBrowser(UA[k])).toBe(false);
  });

  it.each(['iosWebView', 'iosInstagram', 'androidWebView'])('%s is an in-app browser', (k) => {
    expect(inAppBrowser(UA[k])).toBe(true);
  });

  it('never flags the installed home-screen app, whose UA also lacks the Safari token', () => {
    expect(inAppBrowser(UA.iosWebView, true)).toBe(false);
  });

  it('tolerates a missing user agent', () => {
    expect(inAppBrowser(undefined)).toBe(false);
    expect(inAppBrowser('')).toBe(false);
  });
});
