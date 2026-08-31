import { describe, it, expect } from 'vitest';
import {
  CODE_RE, LOG_HEADER, NAME_MAX, buildLog, cleanName, decodeMinute, encodeMinute, foldCode, logText,
  normalizeName, parseLog, pendingLine, recordLine, signCompletion, verifyCompletion,
} from '../../src/assets/js/completion.js';
import { SETS, setHeading } from '../../src/assets/js/sets.js';

const AT = Date.parse('2026-09-04T01:14:30Z');
const base = { week: 1, at: AT, score: 9, total: 11, name: 'Ian Anderson' };

describe('names', () => {
  it('normalizes case, whitespace, and Unicode compatibility forms for signing', () => {
    expect(normalizeName('  Ian   Anderson ')).toBe('ian anderson');
    expect(normalizeName('IAN ANDERSON')).toBe('ian anderson');
    expect(normalizeName('Ian Anderson')).toBe('ian anderson'); // nbsp
    expect(normalizeName('ﬁona')).toBe('fiona'); // NFKC ligature
    expect(normalizeName(null)).toBe('');
  });

  it('cleanName keeps casing but trims, single-spaces, and caps length', () => {
    expect(cleanName('  Ian   Anderson ')).toBe('Ian Anderson');
    expect(cleanName('x'.repeat(NAME_MAX + 20)).length).toBe(NAME_MAX);
    expect(cleanName(undefined)).toBe('');
  });

  it('folds every double quote to an apostrophe and strips control characters (log-format safety)', () => {
    expect(cleanName('Jon "JD" Doe')).toBe("Jon 'JD' Doe");
    expect(cleanName('Jon “JD” Doe')).toBe("Jon 'JD' Doe");
    expect(cleanName('Ian\u001bAnderson\u0000')).toBe('Ian Anderson');
    expect(normalizeName('Jon “JD” Doe')).toBe(normalizeName('Jon "JD" Doe'));
  });
});

describe('minute encoding', () => {
  it('round-trips to minute precision', () => {
    const enc = encodeMinute(AT);
    expect(enc).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(decodeMinute(enc)).toBe(Math.floor(AT / 60_000) * 60_000);
  });
  it('folds Crockford confusables (O→0, I/L→1) and rejects garbage', () => {
    expect(foldCode('0wdfs4-dg9qgm'.replace('0', 'O').replace('1', 'I'))).toBe('0WDFS4-DG9QGM');
    expect(decodeMinute('OI0L1O')).toBe(decodeMinute('010110'));
    expect(decodeMinute('')).toBeNull();
    expect(decodeMinute('ABCU!!')).toBeNull();
    expect(() => encodeMinute(-1)).toThrow();
    expect(() => encodeMinute(NaN)).toThrow();
  });
});

describe('signCompletion / verifyCompletion', () => {
  it('produces a well-formed, deterministic code that verifies', async () => {
    const code = await signCompletion(base);
    expect(code).toMatch(CODE_RE);
    expect(await signCompletion(base)).toBe(code);
    const v = await verifyCompletion({ ...base, code });
    expect(v.ok).toBe(true);
    expect(v.at).toBe(Math.floor(AT / 60_000) * 60_000);
  });

  it('verifies regardless of name casing/spacing, and within the same minute', async () => {
    const code = await signCompletion(base);
    expect((await verifyCompletion({ ...base, code, name: 'IAN  anderson' })).ok).toBe(true);
    expect(await signCompletion({ ...base, at: AT + 20_000 })).toBe(code);
  });

  it('fails when any bound field changes', async () => {
    const code = await signCompletion(base);
    for (const change of [{ name: 'Jon Doe' }, { week: 2 }, { score: 11 }, { total: 12 }]) {
      expect((await verifyCompletion({ ...base, code, ...change })).ok, JSON.stringify(change)).toBe(false);
    }
    // Different minute → different code
    expect(await signCompletion({ ...base, at: AT + 60_000 })).not.toBe(code);
  });

  it('verifies a code retyped with O for 0 and l for 1', async () => {
    const code = await signCompletion(base);
    const retyped = code.replaceAll('0', 'O').replaceAll('1', 'l').toLowerCase();
    expect((await verifyCompletion({ ...base, code: retyped })).ok).toBe(true);
  });

  it('rejects malformed codes without throwing', async () => {
    for (const code of ['', null, 'ABCDEF', 'ABCDEF-ABCDE', 'ABCDEF-ABCDEFG', 'abcdef-ghijkl!']) {
      expect((await verifyCompletion({ ...base, code })).ok, String(code)).toBe(false);
    }
  });

  it('name affects the code even when empty vs set', async () => {
    expect(await signCompletion({ ...base, name: '' })).not.toBe(await signCompletion(base));
  });
});

describe('log text ⇄ parseLog', () => {
  async function fixture(name, weeks, extra = {}) {
    const progress = {};
    for (const w of weeks) {
      const at = AT + w * 86_400_000;
      progress[w] = { score: 9, total: 11, at, name, code: await signCompletion({ week: w, at, score: 9, total: 11, name }), ...extra };
    }
    return progress;
  }

  it('builds one row per header/name/set/week and round-trips through parseLog', async () => {
    const progress = await fixture('Ian Anderson', [1, 3]);
    const rows = buildLog(SETS, progress, 'Ian Anderson', setHeading);
    const allWeeks = SETS.flatMap((s) => s.weeks);
    expect(rows.length).toBe(2 + SETS.length + allWeeks.length);
    expect(rows[0].text).toBe(LOG_HEADER);
    expect(rows[1].text).toBe('NAME · Ian Anderson');
    expect(rows.filter((r) => r.kind === 'done').map((r) => r.week)).toEqual([1, 3]);
    expect(rows.filter((r) => r.kind === 'set').map((r) => r.text)).toEqual(SETS.map(setHeading));

    const parsed = parseLog(logText(rows));
    expect(parsed.name).toBe('Ian Anderson');
    expect(parsed.records).toEqual([
      { week: 1, score: 9, total: 11, code: progress[1].code, name: null },
      { week: 3, score: 9, total: 11, code: progress[3].code, name: null },
    ]);
    for (const r of parsed.records) {
      expect((await verifyCompletion({ ...r, name: parsed.name })).ok).toBe(true);
    }
  });

  it('marks records signed under a different name and parses the override', async () => {
    const progress = await fixture('Jon Doe', [2]);
    const line = recordLine(2, progress[2], 'Ian Anderson');
    expect(line).toContain('· SIGNED AS "Jon Doe"');
    expect(recordLine(2, progress[2], 'jon  DOE')).not.toContain('AS "'); // normalization-equal
    const parsed = parseLog(`${LOG_HEADER}\nNAME · Ian Anderson\n${line}`);
    expect(parsed.records[0].name).toBe('Jon Doe');
    // Smart quotes (autocorrect) and a quote inside the name still parse and verify.
    const smart = line.replace('"Jon Doe"', '“Jon Doe”');
    expect(parseLog(smart).records[0].name).toBe('Jon Doe');
    const quoted = await fixture('Jon "JD" Doe', [2]);
    const qLine = recordLine(2, quoted[2], 'Ian Anderson');
    const qRec = parseLog(qLine).records[0];
    expect(qRec.name).toBe("Jon 'JD' Doe");
    expect((await verifyCompletion({ ...qRec, name: qRec.name })).ok).toBe(true);
  });

  it('reports every NAME line and flags record-looking lines that did not parse', () => {
    const text = `NAME · A\nW01 ✓ Aug 1 - 9/11 - 0WDNEA-KZ1F20\nNAME · B\nW02 ✓ Aug 2 · 9/11 · 0WDNEA-KZ1F20`;
    const parsed = parseLog(text);
    expect(parsed.names).toEqual(['A', 'B']);
    expect(parsed.name).toBe('B');
    expect(parsed.records.map((r) => r.week)).toEqual([2]);
    expect(parsed.unparsed.length).toBe(1);
    expect(parsed.unparsed[0]).toMatch(/^W01/);
  });

  it('caps and scrubs a hostile NAME line', () => {
    const parsed = parseLog(`NAME · \u001b[31m${'x'.repeat(200)}`);
    expect(parsed.name.length).toBeLessThanOrEqual(NAME_MAX);
    expect(parsed.name).not.toMatch(/\u001b/);
  });

  it('renders unsigned legacy records and parses them as code: null', () => {
    const line = recordLine(1, { score: 9, total: 11, at: AT }, 'Ian Anderson');
    expect(line).toContain('UNSIGNED');
    expect(parseLog(line).records[0].code).toBeNull();
    expect(pendingLine(7)).toBe('W07 □ NOT YET COMPLETE');
    expect(parseLog(pendingLine(7)).records).toEqual([]);
  });

  it('tolerates paste noise: extra spaces, missing ✓, lowercase code, slash dates', async () => {
    const progress = await fixture('Ian Anderson', [1]);
    const code = progress[1].code;
    const noisy = `NAME  ·   Ian Anderson\n  W01   2026/09/05, 01:14   ·  9 / 11  ·  ${code.toLowerCase()}  `;
    const parsed = parseLog(noisy);
    expect(parsed.name).toBe('Ian Anderson');
    expect(parsed.records).toEqual([{ week: 1, score: 9, total: 11, code, name: null }]);
  });

  it('treats "(not set)" as no name', () => {
    expect(parseLog('NAME · (not set)').name).toBe('');
  });
});
