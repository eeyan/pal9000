import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import yaml from 'js-yaml';
import { loadBank, WEEK_FILE_RE } from '../../src/lib/bank.js';

const ROOT = join(import.meta.dirname, '../..');
const SITE = join(ROOT, '_site');
const bank = loadBank();

beforeAll(() => {
  execSync('npx eleventy', { cwd: ROOT, stdio: 'pipe' });
}, 60_000);

describe('built site', () => {
  it('home page lists every week and the review queue', () => {
    const $ = cheerio.load(readFileSync(join(SITE, 'index.html'), 'utf8'));
    const missions = $('.mission-list .mission');
    expect(missions.length).toBe(bank.weeks.length);
    expect($('a[href="/review/"]').length).toBeGreaterThan(0);
    expect($('title').text()).toContain('PAL 9000');
  });

  it('home page ships the install hint hidden, for home.js to reveal', () => {
    const $ = cheerio.load(readFileSync(join(SITE, 'index.html'), 'utf8'));
    const card = $('#install-hint');
    expect(card.length).toBe(1);
    expect(card.attr('hidden')).toBeDefined();
    expect(card.find('#install-hint-dismiss').length).toBe(1);
    expect(card.find('a[href="/systems/"]').length).toBe(1);
  });

  for (const w of bank.weeks) {
    it(`week ${w.week} page embeds exactly its live questions`, () => {
      const html = readFileSync(join(SITE, `week-${w.week}`, 'index.html'), 'utf8');
      const $ = cheerio.load(html);
      const data = JSON.parse($('#question-data').text());
      expect(data.length).toBe(w.questions.length);
      expect(data.map((q) => q.id)).toEqual(w.questions.map((q) => q.id));
      for (const q of data) {
        expect(['accepted', 'edited']).toContain(q.status);
      }
    });
  }

  it('review page embeds the full live bank', () => {
    const $ = cheerio.load(readFileSync(join(SITE, 'review', 'index.html'), 'utf8'));
    const weeks = JSON.parse($('#bank-data').text());
    const total = weeks.reduce((n, w) => n + w.questions.length, 0);
    expect(total).toBe(bank.totalQuestions);
  });

  it('no non-live question reaches ANY built page', () => {
    const questionsDir = join(ROOT, 'content/questions');
    const nonLiveIds = [];
    for (const file of readdirSync(questionsDir).filter((f) => WEEK_FILE_RE.test(f))) {
      const doc = yaml.load(readFileSync(join(questionsDir, file), 'utf8'));
      for (const q of doc.questions ?? []) {
        if (!['accepted', 'edited'].includes(q.status)) nonLiveIds.push(q.id);
      }
    }
    expect(nonLiveIds.length).toBeGreaterThan(0); // the guard must be guarding something

    const htmlFiles = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.html')) htmlFiles.push(p);
      }
    };
    walk(SITE);
    expect(htmlFiles.length).toBeGreaterThanOrEqual(5);

    for (const file of htmlFiles) {
      const html = readFileSync(file, 'utf8');
      expect(html, file).not.toMatch(/rejected:/);
      expect(html, file).not.toMatch(/"status":"candidate"/);
      for (const id of nonLiveIds) {
        expect(html.includes(`"${id}"`), `${id} leaked into ${file}`).toBe(false);
      }
    }
  });

  it('no copyright-sensitive file is tracked by git (public-repo guard)', () => {
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
    const sources = tracked.filter((f) => f.startsWith('content/sources/') && f !== 'content/sources/README.md');
    const candidates = tracked.filter((f) => f.endsWith('.candidates.yaml'));
    expect(sources, 'course/publisher material tracked by git').toEqual([]);
    expect(candidates, 'pre-curation LLM output tracked by git').toEqual([]);
  });

  it('assets are copied through', () => {
    for (const f of ['assets/css/style.css', 'assets/js/engine.js', 'assets/js/scheduler.js', 'assets/js/theme.js', 'assets/js/backup.js', 'assets/js/systems-page.js']) {
      expect(existsSync(join(SITE, f)), f).toBe(true);
    }
  });

  it('systems page ships the storage controls and week list', () => {
    const $ = cheerio.load(readFileSync(join(SITE, 'systems', 'index.html'), 'utf8'));
    for (const id of ['log-body', 'copy-log', 'export-btn', 'import-btn', 'import-file',
      'copy-backup-btn', 'paste-btn', 'paste-form', 'paste-text', 'paste-import', 'paste-cancel',
      'clear-queue-btn', 'full-reset-btn', 'reset-confirm', 'clear-confirm', 'import-confirm']) {
      expect($(`#${id}`).length, `#${id}`).toBe(1);
    }
    const weekNums = JSON.parse($('#weeks-data').text());
    expect(weekNums).toEqual(bank.weeks.map((w) => w.week));
    expect($('script[src="/assets/js/systems-page.js"]').length).toBe(1);
  });

  it('every page footer links to the systems page', () => {
    for (const page of ['index.html', 'week-1/index.html', 'review/index.html', 'systems/index.html']) {
      const $ = cheerio.load(readFileSync(join(SITE, page), 'utf8'));
      expect($('.site-foot a[href="/systems/"]').length, page).toBe(1);
    }
  });

  it('service worker precaches every page and every shipped asset', () => {
    const sw = readFileSync(join(SITE, 'sw.js'), 'utf8');
    for (const w of bank.weeks) {
      expect(sw, `week ${w.week} page`).toContain(`'/week-${w.week}/'`);
    }
    for (const url of ['\'/\'', '\'/review/\'', '\'/systems/\'', '\'/manifest.webmanifest\'']) {
      expect(sw).toContain(url);
    }
    // Every precache entry must actually exist in the build (a typo here
    // makes cache.addAll reject and kills offline support entirely).
    const shell = [...sw.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
    expect(shell.length).toBeGreaterThanOrEqual(20);
    for (const url of shell) {
      const file = url.endsWith('/') ? join(SITE, url, 'index.html') : join(SITE, url);
      expect(existsSync(file), `precached ${url} missing from build`).toBe(true);
    }
    expect(sw).toMatch(/pal9000-\d+/); // build-stamped cache name
  });

  it('manifest parses and its icons exist', () => {
    const manifest = JSON.parse(readFileSync(join(SITE, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.name).toContain('PAL 9000');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(existsSync(join(SITE, icon.src)), icon.src).toBe(true);
    }
    // id pins install identity across start_url changes; description and
    // shortcuts are what install sheets and long-press menus surface.
    expect(manifest.id).toBe('/');
    expect(manifest.description).toBeTruthy();
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(1);
    expect(manifest.shortcuts.map((s) => s.url)).toContain('/review/');
  });

  it('every page links the manifest and registers the service worker', () => {
    for (const page of ['index.html', 'week-1/index.html', 'review/index.html', 'systems/index.html', '404.html']) {
      const $ = cheerio.load(readFileSync(join(SITE, page), 'utf8'));
      expect($('link[rel="manifest"]').length, page).toBe(1);
      expect($('script[src="/assets/js/sw-register.js"]').length, page).toBe(1);
    }
  });

  it('every page opts into the display cutout so safe-area insets resolve', () => {
    for (const page of ['index.html', 'week-1/index.html', 'review/index.html', 'systems/index.html', '404.html']) {
      const $ = cheerio.load(readFileSync(join(SITE, page), 'utf8'));
      const viewport = $('meta[name="viewport"]').attr('content');
      expect(viewport, page).toBeTruthy();
      expect(viewport, page).toContain('viewport-fit=cover');
    }
  });

  it('every page ships the connectivity readout as a live region', () => {
    for (const page of ['index.html', 'week-1/index.html', 'review/index.html', 'systems/index.html', '404.html']) {
      const $ = cheerio.load(readFileSync(join(SITE, page), 'utf8'));
      const status = $('.head-status');
      expect(status.length, page).toBe(1);
      expect(status.attr('role'), page).toBe('status');
      // aria-hidden anywhere on it unregisters the live region — the offline
      // announcement would never fire. CSS hides it visually instead.
      expect(status.attr('aria-hidden'), page).toBeUndefined();
    }
  });

  it('every page ships the analytics snippet scoped to the production domain', () => {
    for (const page of ['index.html', 'week-1/index.html', 'review/index.html', 'systems/index.html', '404.html']) {
      const $ = cheerio.load(readFileSync(join(SITE, page), 'utf8'));
      const script = $('script[src="https://stats.ianjoshua.com/script.js"]');
      expect(script.length, page).toBe(1);
      expect(script.attr('data-website-id'), page).toBeTruthy();
      // data-domains keeps localhost/dev/preview builds out of the stats
      expect(script.attr('data-domains'), page).toBe('pal9000.netlify.app');
    }
  });

  it('every page has the theme toggle and bootstrap script', () => {
    for (const page of ['index.html', 'week-1/index.html', 'review/index.html', 'systems/index.html', '404.html']) {
      const $ = cheerio.load(readFileSync(join(SITE, page), 'utf8'));
      expect($('#theme-toggle').length, page).toBe(1);
      expect($('script[src="/assets/js/theme.js"]').length, page).toBe(1);
    }
  });
});
