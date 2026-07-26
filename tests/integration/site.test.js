import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { loadBank } from '../../src/lib/bank.js';

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

  it('no rejected or candidate question text leaks anywhere in the output', () => {
    for (const page of ['index.html', 'review/index.html']) {
      const html = readFileSync(join(SITE, page), 'utf8');
      expect(html).not.toMatch(/rejected:/);
      expect(html).not.toMatch(/"status":"candidate"/);
    }
  });

  it('assets are copied through', () => {
    for (const f of ['assets/css/style.css', 'assets/js/engine.js', 'assets/js/scheduler.js']) {
      expect(existsSync(join(SITE, f)), f).toBe(true);
    }
  });
});
