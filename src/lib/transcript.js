// Turn a WebVTT / SRT transcript (Zoom cloud recordings, Otter, Whisper) into
// plain text the generator can read. Strips headers, cue numbers, timestamps,
// NOTE/STYLE blocks and <v Speaker>/<c> tags; keeps "Speaker: text" prefixes
// (they separate instructor from student contributions); merges consecutive
// cues from the same speaker into one paragraph; drops exact-duplicate lines,
// which Zoom emits when a cue is split across two timing windows.

export const TRANSCRIPT_FILE_RE = /\.(vtt|srt)$/i;

const TIMING_RE = /^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}/;
const CUE_NUMBER_RE = /^\s*\d+\s*$/;
const SPEAKER_RE = /^([^:\n]{1,60}):\s*(.*)$/;

export function transcriptToText(raw) {
  const lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
  const paragraphs = [];
  let lastSpeaker = null;
  let lastLine = null;
  let inBlock = false; // NOTE / STYLE / REGION blocks run until a blank line

  for (let line of lines) {
    if (inBlock) { if (line.trim() === '') inBlock = false; continue; }
    if (/^WEBVTT\b/.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) { inBlock = true; continue; }
    if (TIMING_RE.test(line) || CUE_NUMBER_RE.test(line) || line.trim() === '') continue;

    // <v Ian Anderson>text</v> → "Ian Anderson: text"; drop other tags.
    line = line.replace(/<v\s+([^>]+)>/g, '$1: ').replace(/<\/?[^>]+>/g, '').trim();
    if (!line || line === lastLine) continue;
    lastLine = line;

    const m = SPEAKER_RE.exec(line);
    const speaker = m ? m[1].trim() : null;
    const text = m ? m[2].trim() : line;
    if (speaker && speaker === lastSpeaker && paragraphs.length) {
      paragraphs[paragraphs.length - 1] += ` ${text}`;
    } else {
      paragraphs.push(speaker ? `${speaker}: ${text}` : text);
      lastSpeaker = speaker;
    }
  }
  return paragraphs.join('\n\n');
}

// "week-01-class-2026-09-01.vtt" → "2026-09-01"; null when the name has no date.
export function dateFromFilename(name) {
  return /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? null;
}
