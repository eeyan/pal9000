import { describe, it, expect } from 'vitest';
import { TRANSCRIPT_FILE_RE, transcriptToText, dateFromFilename } from '../../src/lib/transcript.js';

const ZOOM_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
Ian Anderson: Welcome back. Today we're talking about IS versus IT.

2
00:00:04.500 --> 00:00:08.000
Ian Anderson: The distinction matters because strategy lives in the S, not the T.

3
00:00:08.000 --> 00:00:11.000
Ian Anderson: The distinction matters because strategy lives in the S, not the T.

4
00:00:11.000 --> 00:00:15.000
Student A: So is an ERP an information system or IT?

NOTE
This is a Zoom note block
that spans lines

5
00:00:15.000 --> 00:00:20.000
Ian Anderson: Both — and that's exactly the point.
`;

const SRT = `1
00:00:01,000 --> 00:00:03,000
<v Ian Anderson>Alignment is a process, not a state.</v>

2
00:00:03,000 --> 00:00:05,000
<i>Alignment</i> is a <b>process</b>, not a state.

3
00:00:05,500 --> 00:00:09,000
Let's look at the insurer case.
`;

describe('transcriptToText', () => {
  it('flattens a Zoom VTT: no header, numbers, timings, or NOTE blocks; merges a speaker\'s consecutive cues; drops exact repeats', () => {
    const out = transcriptToText(ZOOM_VTT);
    expect(out).not.toMatch(/WEBVTT|-->|^\d+$|Zoom note/m);
    expect(out.split('\n\n')).toEqual([
      "Ian Anderson: Welcome back. Today we're talking about IS versus IT. The distinction matters because strategy lives in the S, not the T.",
      'Student A: So is an ERP an information system or IT?',
      "Ian Anderson: Both — and that's exactly the point.",
    ]);
  });

  it('handles SRT timing commas, <v> speaker tags, inline tags, and CRLF', () => {
    const out = transcriptToText(SRT.replace(/\n/g, '\r\n'));
    expect(out.split('\n\n')).toEqual([
      'Ian Anderson: Alignment is a process, not a state.',
      'Alignment is a process, not a state.', // different text after tag-stripping vs the <v> line → kept
      "Let's look at the insurer case.",
    ]);
  });

  it('returns an empty string for an empty or header-only file', () => {
    expect(transcriptToText('')).toBe('');
    expect(transcriptToText('WEBVTT\n\n')).toBe('');
  });

  it('recognises transcript filenames and pulls the class date out of them', () => {
    expect(TRANSCRIPT_FILE_RE.test('class-2026-09-01.vtt')).toBe(true);
    expect(TRANSCRIPT_FILE_RE.test('recording.SRT')).toBe(true);
    expect(TRANSCRIPT_FILE_RE.test('deck.pdf')).toBe(false);
    expect(dateFromFilename('GMT20260901-class-2026-09-01.vtt')).toBe('2026-09-01');
    expect(dateFromFilename('class.vtt')).toBeNull();
  });
});
