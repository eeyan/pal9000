import { SETS, setHeading, shortDate, weekRange } from '../assets/js/sets.js';

// Default export ONLY (see CLAUDE.md gotcha on Eleventy data files).
export default function () {
  return SETS.map((s) => ({ ...s, heading: setHeading(s), range: weekRange(s), dateShort: shortDate(s.checkpointDate) }));
}
