// Name-bound completion codes.
//
// Students submit their completion log once per set (see sets.js). To keep a
// log from being reused between students, each completion is stamped with a
// short code derived from the week, the completion minute, the score, and the
// student's name as entered on this device. Change the name, the week, the
// date, or the score, and the code no longer verifies; copy a classmate's
// log and it carries their name.
//
// Honesty note: there is no server, so this is tamper-EVIDENCE, not proof.
// The salt ships in this file (the repo is public and the JS ships to every
// browser anyway). A student who reads the source can forge a code; the bar
// this sets is "more effort than doing the 10-question set", which is the
// right bar for a participation sliver. Points stay honor-system (SPEC).
//
// Shared by the browser, tests, and scripts/verify.js — keep it free of DOM
// and Node-only imports. Hashing uses Web Crypto, which both provide.

export const SALT = 'PAL9000/CIS9000/FA2026';
export const LOG_HEADER = 'PAL 9000 · COMPLETION LOG';
export const NAME_MAX = 60;

// Crockford base32: no I, L, O, U — reads cleanly off a phone screenshot.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MINUTE_CHARS = 6; // 32^6 minutes ≈ 2,000 years of epoch
const HASH_CHARS = 6; // 30 bits

// Case/whitespace/Unicode-normalized so "ian  anderson" and "Ian Anderson"
// sign identically — a retyped name on another device still verifies.
// Control characters are stripped and every kind of double quote becomes an
// apostrophe: the log wraps a differing name in "…", so a quote inside a name
// would break the parsing contract (and smart-quote autocorrect must not
// change how a name signs).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f]/g;
function scrubLine(text) {
  return String(text ?? '').normalize('NFKC').replace(CONTROL_RE, ' ').trim().replace(/\s+/g, ' ');
}
function scrub(name) {
  return scrubLine(name).replace(/["\u201C\u201D\u201E\u00AB\u00BB]/g, "'").trim();
}

export function normalizeName(name) {
  return scrub(name).slice(0, NAME_MAX).toLowerCase();
}

// What the app stores and prints: trimmed, single-spaced, capped, but with
// the student's own casing.
export function cleanName(name) {
  return scrub(name).slice(0, NAME_MAX);
}

export function encodeMinute(at) {
  let n = Math.floor(at / 60_000);
  if (!Number.isFinite(n) || n < 0) throw new Error('bad timestamp');
  let out = '';
  for (let i = 0; i < MINUTE_CHARS; i += 1) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

// Crockford's point: O reads as 0, I and L as 1 — fold them so a code retyped
// from a screenshot still verifies.
export function foldCode(code) {
  return String(code ?? '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function decodeMinute(str) {
  const s = foldCode(str);
  if (!s) return null;
  let n = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    n = n * 32 + v;
  }
  return n * 60_000;
}

async function sha256Bits30(input) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto unavailable (insecure context?)');
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  const b = new Uint8Array(buf);
  // 30 bits from the first four bytes → six base32 chars.
  let n = ((b[0] << 22) | (b[1] << 14) | (b[2] << 6) | (b[3] >> 2)) >>> 0;
  let out = '';
  for (let i = 0; i < HASH_CHARS; i += 1) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function material({ week, minuteCode, score, total, name }) {
  return [SALT, Number(week), minuteCode, Number(score), Number(total), normalizeName(name)].join('|');
}

// → "6C8W1K-7K3FQ2": completion minute, then the binding hash.
export async function signCompletion({ week, at, score, total, name }) {
  const minuteCode = encodeMinute(at);
  const hash = await sha256Bits30(material({ week, minuteCode, score, total, name }));
  return `${minuteCode}-${hash}`;
}

export const CODE_RE = /^([0-9A-Z]{6})-([0-9A-Z]{6})$/;

// → { ok, at } — `at` is the minute the code claims, for plausibility checks.
export async function verifyCompletion({ week, code, score, total, name }) {
  const m = CODE_RE.exec(foldCode(code));
  if (!m) return { ok: false, at: null };
  const [, minuteCode, hash] = m;
  const expected = await sha256Bits30(material({ week, minuteCode, score, total, name }));
  return { ok: expected === hash, at: decodeMinute(minuteCode) };
}

// ---------- log text ----------
// The text below is a parsing contract with scripts/verify.js (parseLog).
// The HTML log on the SYSTEMS page renders these same lines.

export const pad2 = (n) => String(n).padStart(2, '0');

export function localStamp(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// One completed-week line. `currentName` is the name in the log header; a
// record signed under a different name is marked so the discrepancy is
// visible to student and instructor alike.
export function recordLine(week, rec, currentName) {
  let line = `W${pad2(week)} ✓ ${localStamp(rec.at)} · ${rec.score}/${rec.total} · ${rec.code ?? 'UNSIGNED'}`;
  if (rec.code && normalizeName(rec.name) !== normalizeName(currentName)) {
    line += ` · SIGNED AS "${cleanName(rec.name) || '(no name)'}"`;
  }
  return line;
}

export function pendingLine(week) {
  return `W${pad2(week)} □ NOT YET COMPLETE`;
}

// Structured log: [{ kind: 'header'|'name'|'set'|'done'|'pending', text, week?, set? }]
export function buildLog(sets, progress, name, setHeading) {
  const rows = [
    { kind: 'header', text: LOG_HEADER },
    { kind: 'name', text: `NAME · ${cleanName(name) || '(not set)'}` },
  ];
  for (const s of sets) {
    rows.push({ kind: 'set', set: s.set, text: setHeading(s) });
    for (const w of s.weeks) {
      const rec = progress[w];
      rows.push(rec
        ? { kind: 'done', week: w, text: recordLine(w, rec, name) }
        : { kind: 'pending', week: w, text: pendingLine(w) });
    }
  }
  return rows;
}

export function logText(rows) {
  return rows.map((r) => r.text).join('\n');
}

// Parse pasted log text (one student) back into
//   { name, names, records, unparsed }
// name = the (last) NAME line; names = every NAME line seen, so a caller can
// flag two students' logs that were pasted together without the header;
// unparsed = lines that look like completion records but didn't parse (a
// paste that mangled the separators) so nothing fails silently.
// Tolerant of the noise a paste picks up: extra whitespace, dropped ✓,
// smart quotes, locale date formats (the score/code pair is anchored to each
// other, not to the date).
const NAME_RE = /^NAME\s*·\s*(.*)$/u;
const DONE_RE = /^W(\d{1,2})\b.*?(\d+)\s*\/\s*(\d+)\s*·\s*([0-9A-Z]{6}-[0-9A-Z]{6}|UNSIGNED)\b(?:.*?\bAS\s+["\u201C\u201D]([^"\u201C\u201D]*)["\u201C\u201D])?/u;
const AS_RE = /\bAS\s+["\u201C\u201D]([^"\u201C\u201D]*)["\u201C\u201D]/u;
const LOOKS_LIKE_RECORD_RE = /^W\d{1,2}\b.*(✓|\d\s*\/\s*\d)/u;

export function parseLog(text) {
  const out = { name: '', names: [], records: [], unparsed: [] };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = scrubLine(raw).slice(0, 400); // strips control chars, trims (quotes kept: the SIGNED AS "…" syntax needs them)
    const n = NAME_RE.exec(line);
    if (n) {
      const name = n[1].trim() === '(not set)' ? '' : cleanName(n[1]);
      out.name = name;
      out.names.push(name);
      continue;
    }
    const d = DONE_RE.exec(line.toUpperCase());
    if (d) {
      // Re-run on the original-case line for the SIGNED AS "name" capture.
      const asName = AS_RE.exec(line)?.[1];
      out.records.push({
        week: Number(d[1]),
        score: Number(d[2]),
        total: Number(d[3]),
        code: d[4] === 'UNSIGNED' ? null : d[4],
        name: asName !== undefined ? cleanName(asName) : null, // null → header name applies
      });
    } else if (LOOKS_LIKE_RECORD_RE.test(line)) {
      out.unparsed.push(line);
    }
  }
  return out;
}
