// Builds a local, single-file review page for a week's candidates so curation
// is keypresses instead of YAML editing. Opens from disk (file://), no network,
// no dependencies — nothing leaves the machine. Progress persists in the
// browser's localStorage; the page exports a decisions JSON that
// scripts/curate.js writes back into the candidates file.
//
// Usage:  node scripts/review.js <week-number>
// Reads:  content/questions/week-NN.candidates.yaml
// Writes: content/questions/week-NN.review.html (gitignored; regenerate freely)
//
// Keys on the page: ↓/↑ or J/K move · A accept · E edit · R reject · 1–5 reject
// reason · N focus the guidance note · ⌘/Ctrl+Enter next · Esc leave the note.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const week = Number(process.argv[2]);
if (!Number.isInteger(week) || week < 1) {
  console.error('Usage: node scripts/review.js <week-number>');
  process.exit(1);
}

const ww = String(week).padStart(2, '0');
const candidatesPath = join('content/questions', `week-${ww}.candidates.yaml`);
const outPath = join('content/questions', `week-${ww}.review.html`);

if (!existsSync(candidatesPath)) {
  console.error(`${candidatesPath} not found — generate the week first.`);
  process.exit(1);
}

const doc = yaml.load(readFileSync(candidatesPath, 'utf8'));
const questions = (doc.questions ?? []).map((q) => ({
  id: q.id,
  type: q.type,
  status: q.status,
  note: q.note ?? '',
  rejectNote: q.rejectNote ?? '',
  stem: q.stem,
  options: q.options,
  answer: q.answer,
  feedback: q.feedback,
  selfExplainPrompt: q.selfExplainPrompt ?? '',
  source: q.source,
}));

const REJECT_REASONS = ['hallucination', 'leakage', 'trivia', 'ambiguous', 'duplicate'];

// Embedded as JSON, not interpolated into markup — the page renders everything
// through textContent, so question text can contain anything.
const payload = JSON.stringify({
  week,
  promptVersion: doc.promptVersion ?? null,
  model: doc.model ?? null,
  reasons: REJECT_REASONS,
  questions,
}).replace(/<\//g, '<\\/');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PAL 9000 — Week ${week} review</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f4ee; --panel: #ffffff; --ink: #1c1b18; --muted: #6b665c; --line: #d9d4c7;
    --amber: #c47f00; --amber-soft: #fff1d6; --green: #2f7d4f; --green-soft: #e3f3e8;
    --blue: #2f5f9e; --blue-soft: #e4ecf7; --red: #b3261e; --red-soft: #fbe5e3;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #141310; --panel: #1e1c18; --ink: #ece7da; --muted: #a39c8c; --line: #3a362e;
      --amber: #f0a500; --amber-soft: #3a2c0a; --green: #6fcf97; --green-soft: #173523;
      --blue: #8ab4f8; --blue-soft: #162740; --red: #ff6b5f; --red-soft: #3d1512;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  button, textarea { font: inherit; color: inherit; }
  kbd { font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 2px 5px; background: var(--panel); }

  .app { display: grid; grid-template-rows: auto 1fr; height: 100vh; }
  header { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
  header h1 { font-size: 16px; margin: 0; }
  header h1 small { color: var(--muted); font-weight: normal; margin-left: 8px; }
  .progress { flex: 1; min-width: 200px; }
  .bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; display: flex; }
  .bar span { display: block; height: 100%; }
  .bar .ba { background: var(--green); } .bar .be { background: var(--blue); } .bar .br { background: var(--red); }
  .counts { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .actions label { font-size: 13px; color: var(--muted); display: flex; gap: 6px; align-items: center; }
  button { border: 1px solid var(--line); background: var(--panel); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
  button:hover { border-color: var(--amber); }
  button.primary { background: var(--amber); border-color: var(--amber); color: #1c1b18; font-weight: 600; }

  main { display: grid; grid-template-columns: 300px 1fr; min-height: 0; }
  nav { overflow-y: auto; min-height: 0; border-right: 1px solid var(--line); background: var(--panel); }
  nav ol { list-style: none; margin: 0; padding: 6px; }
  nav li { display: grid; grid-template-columns: 10px 62px 1fr; gap: 8px; align-items: baseline; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  nav li:hover { background: var(--bg); }
  nav li.current { background: var(--amber-soft); outline: 1px solid var(--amber); }
  nav li .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line); align-self: center; }
  nav li.accepted .dot { background: var(--green); } nav li.edited .dot { background: var(--blue); } nav li.rejected .dot { background: var(--red); }
  nav li .id { color: var(--muted); font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  nav li .short { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  nav li.hidden { display: none; }

  section.card { display: grid; grid-template-rows: 1fr auto; min-height: 0; }
  .body { overflow-y: auto; min-height: 0; padding: 22px 28px 40px; max-width: 900px; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--muted); font-size: 13px; margin-bottom: 8px; }
  .meta .id { font-family: ui-monospace, Menlo, monospace; color: var(--ink); }
  .pill { border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; }
  .stem { font-size: 17px; margin: 6px 0 16px; }
  .options { list-style: none; padding: 0; margin: 0 0 18px; display: grid; gap: 8px; }
  .options li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .options li.correct { border-color: var(--amber); background: var(--amber-soft); }
  .options .key { font-weight: 700; color: var(--amber); }
  .fb { border-left: 3px solid var(--line); padding: 2px 0 2px 12px; margin: 10px 0; }
  .fb.correct { border-color: var(--green); }
  .fb b { color: var(--muted); font-weight: 600; font-size: 13px; display: block; }
  .se { margin: 16px 0; padding: 12px 14px; background: var(--blue-soft); border-radius: 8px; }
  .se b { display: block; font-size: 13px; color: var(--muted); }
  .cite { color: var(--muted); font-size: 13px; margin: 8px 0 20px; }
  .prior { color: var(--red); font-size: 13px; margin-bottom: 10px; }

  .decide { background: var(--panel); border-top: 1px solid var(--line); padding: 14px 28px 18px; max-width: 900px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
  .row .spacer { flex: 1; }
  button.st { min-width: 110px; }
  button.st.on.accepted { background: var(--green-soft); border-color: var(--green); }
  button.st.on.edited { background: var(--blue-soft); border-color: var(--blue); }
  button.st.on.rejected { background: var(--red-soft); border-color: var(--red); }
  .reasons { display: flex; gap: 6px; flex-wrap: wrap; }
  .reasons button { padding: 4px 10px; font-size: 13px; }
  .reasons button.on { background: var(--red-soft); border-color: var(--red); }
  .reasons.dim { opacity: .45; }
  textarea { width: 100%; min-height: 64px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--bg); }
  textarea:focus { outline: 2px solid var(--amber); border-color: transparent; }
  .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .toast { position: fixed; right: 16px; bottom: 16px; background: var(--ink); color: var(--bg); padding: 8px 14px; border-radius: 8px; opacity: 0; transition: opacity .2s; pointer-events: none; }
  .toast.show { opacity: 1; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } nav { display: none; } }
</style>
</head>
<body>
<div class="app">
  <header>
    <h1>Week ${week} candidates <small id="model"></small></h1>
    <div class="progress"><div class="bar"><span class="ba"></span><span class="be"></span><span class="br"></span></div><div class="counts" id="counts"></div></div>
    <div class="actions">
      <label><input type="checkbox" id="onlyOpen"> unreviewed only</label>
      <button id="copy" class="primary">Copy decisions</button>
      <button id="download">Download JSON</button>
      <button id="reset">Reset</button>
    </div>
  </header>
  <main>
    <nav><ol id="list"></ol></nav>
    <section class="card" id="card"></section>
  </main>
</div>
<div class="toast" id="toast"></div>
<script type="application/json" id="data">${payload}</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById('data').textContent);
  const KEY = 'pal9000.review.w' + String(data.week).padStart(2, '0');
  const STATUSES = ['accepted', 'edited', 'rejected'];

  // Decisions: { id: { status, reason, note } }. Pre-seed from statuses already
  // in the file so a re-generated page after a partial curate.js pass is honest.
  let decisions = {};
  try { decisions = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { decisions = {}; }
  for (const q of data.questions) {
    if (decisions[q.id]) continue;
    const m = /^rejected:\\s*(.+)$/.exec(q.status || '');
    if (q.status === 'accepted' || q.status === 'edited') decisions[q.id] = { status: q.status, note: q.note || '' };
    else if (m) decisions[q.id] = { status: 'rejected', reason: m[1], note: q.note || '' };
  }
  let idx = Math.max(0, data.questions.findIndex((q) => !decisions[q.id]));

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(decisions)); } catch {} };
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1600); };
  const decided = (q) => decisions[q.id] && decisions[q.id].status && (decisions[q.id].status !== 'rejected' || decisions[q.id].reason);

  $('model').textContent = [data.promptVersion, data.model].filter(Boolean).join(' · ');

  function renderHeader() {
    const n = data.questions.length;
    const c = { accepted: 0, edited: 0, rejected: 0 };
    for (const q of data.questions) if (decided(q)) c[decisions[q.id].status]++;
    const done = c.accepted + c.edited + c.rejected;
    document.querySelector('.bar .ba').style.width = (c.accepted / n * 100) + '%';
    document.querySelector('.bar .be').style.width = (c.edited / n * 100) + '%';
    document.querySelector('.bar .br').style.width = (c.rejected / n * 100) + '%';
    $('counts').textContent = done + '/' + n + ' reviewed · ' + c.accepted + ' accepted · ' + c.edited + ' edited · ' + c.rejected + ' rejected';
  }

  function renderList() {
    const list = $('list');
    list.replaceChildren();
    const onlyOpen = $('onlyOpen').checked;
    data.questions.forEach((q, i) => {
      const d = decisions[q.id];
      const li = el('li', (decided(q) ? d.status : '') + (i === idx ? ' current' : '') + (onlyOpen && decided(q) && i !== idx ? ' hidden' : ''));
      li.append(el('span', 'dot'), el('span', 'id', q.id), el('span', 'short', q.stem.trim()));
      li.addEventListener('click', () => go(i));
      list.append(li);
    });
    const cur = list.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function renderCard() {
    const q = data.questions[idx];
    const d = decisions[q.id] || {};
    const host = $('card');
    host.replaceChildren();
    const card = el('div', 'body');
    host.append(card);

    const meta = el('div', 'meta');
    meta.append(el('span', 'id', q.id), el('span', 'pill', q.type), el('span', null, (idx + 1) + ' of ' + data.questions.length));
    card.append(meta);
    if (q.rejectNote) card.append(el('div', 'prior', 'Pre-marked malformed by the generator: ' + q.rejectNote));
    card.append(el('p', 'stem', q.stem.trim()));

    const ol = el('ul', 'options');
    for (const o of q.options) {
      const li = el('li', o.key === q.answer ? 'correct' : '');
      li.append(el('span', 'key', o.key + (o.key === q.answer ? ' ✓' : '')), el('span', null, o.text.trim()));
      ol.append(li);
    }
    card.append(ol);

    const fbc = el('div', 'fb correct'); fbc.append(el('b', null, 'Feedback · correct (' + q.answer + ')'), el('span', null, (q.feedback.correct || '').trim())); card.append(fbc);
    for (const o of q.options) {
      if (o.key === q.answer) continue;
      const f = el('div', 'fb'); f.append(el('b', null, 'Feedback · ' + o.key), el('span', null, (q.feedback[o.key] || '(missing)').trim())); card.append(f);
    }
    if (q.selfExplainPrompt) { const se = el('div', 'se'); se.append(el('b', null, 'Self-explain prompt'), el('span', null, q.selfExplainPrompt.trim())); card.append(se); }
    card.append(el('div', 'cite', 'Source: ' + (q.source ? q.source.doc + ' — ' + q.source.loc : '(none)')));

    const decide = el('div', 'decide');
    const row1 = el('div', 'row');
    for (const s of STATUSES) {
      const b = el('button', 'st ' + s + (d.status === s ? ' on' : ''), { accepted: 'A · Accept', edited: 'E · Edit', rejected: 'R · Reject' }[s]);
      b.addEventListener('click', () => setStatus(s));
      row1.append(b);
    }
    row1.append(el('span', 'spacer'));
    const reasons = el('div', 'reasons' + (d.status === 'rejected' ? '' : ' dim'));
    data.reasons.forEach((r, i) => {
      const b = el('button', d.reason === r ? 'on' : '', (i + 1) + ' ' + r);
      b.addEventListener('click', () => setReason(r));
      reasons.append(b);
    });
    row1.append(reasons);
    decide.append(row1);

    const ta = el('textarea');
    ta.id = 'note';
    ta.placeholder = 'N · Guidance for a better version — what to change, what the question should test instead, a sharper scenario, a distractor to swap…';
    ta.value = d.note || '';
    ta.addEventListener('input', () => { decisions[q.id] = { ...(decisions[q.id] || {}), note: ta.value }; save(); });
    decide.append(ta);
    decide.append(el('div', 'hint', 'Keys: ↓/↑ or J/K move · A accept · E edit · R reject · 1–5 reason · N note · ⌘/Ctrl+Enter next · Esc leave note'));
    host.append(decide);
    card.scrollTop = 0;
  }

  function render() { renderHeader(); renderList(); renderCard(); }
  function go(i) { if (i < 0 || i >= data.questions.length) return; idx = i; render(); }
  function next() { go(Math.min(idx + 1, data.questions.length - 1)); }
  function nextOpen() { const j = data.questions.findIndex((q, i) => i > idx && !decided(q)); if (j >= 0) go(j); else next(); }

  function setStatus(s) {
    const q = data.questions[idx];
    decisions[q.id] = { ...(decisions[q.id] || {}), status: s };
    if (s !== 'rejected') delete decisions[q.id].reason;
    save();
    render();
    if (s === 'accepted') nextOpen();
    else if (s === 'edited') $('note').focus();
    // rejected: leave focus on the page so 1–5 picks the reason; setReason then focuses the note
  }
  function setReason(r) {
    const q = data.questions[idx];
    decisions[q.id] = { ...(decisions[q.id] || {}), status: 'rejected', reason: r };
    save(); render(); $('note').focus();
  }

  function exportJson() {
    const out = {};
    for (const q of data.questions) if (decided(q)) out[q.id] = { status: decisions[q.id].status, ...(decisions[q.id].reason ? { reason: decisions[q.id].reason } : {}), ...(decisions[q.id].note && decisions[q.id].note.trim() ? { note: decisions[q.id].note.trim() } : {}) };
    return JSON.stringify({ week: data.week, exportedAt: new Date().toISOString(), decisions: out }, null, 2);
  }

  $('copy').addEventListener('click', async () => {
    const text = exportJson();
    try { await navigator.clipboard.writeText(text); toast('Copied — now: pbpaste | node scripts/curate.js ' + data.week); }
    catch { window.prompt('Copy the decisions JSON:', text); }
  });
  $('download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    a.download = 'week-' + String(data.week).padStart(2, '0') + '.decisions.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('reset').addEventListener('click', () => {
    if (!window.confirm('Clear all decisions for week ' + data.week + ' from this browser?')) return;
    decisions = {}; save(); idx = 0; render();
  });
  $('onlyOpen').addEventListener('change', renderList);

  document.addEventListener('keydown', (e) => {
    const inNote = document.activeElement && document.activeElement.id === 'note';
    if (inNote) {
      if (e.key === 'Escape') { document.activeElement.blur(); e.preventDefault(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { document.activeElement.blur(); nextOpen(); e.preventDefault(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 'j') { next(); e.preventDefault(); }
    else if (k === 'arrowup' || k === 'k') { go(idx - 1); e.preventDefault(); }
    else if (k === 'a') setStatus('accepted');
    else if (k === 'e') setStatus('edited');
    else if (k === 'r') setStatus('rejected');
    else if (k === 'n') { $('note').focus(); e.preventDefault(); }
    else if (/^[1-5]$/.test(k) && data.reasons[Number(k) - 1]) setReason(data.reasons[Number(k) - 1]);
  });

  render();
})();
</script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${questions.length} candidates). Open it:  open "${outPath}"`);
console.log(`When done: click "Copy decisions", then  pbpaste | node scripts/curate.js ${week}`);
