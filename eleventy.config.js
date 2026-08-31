import { setForWeek } from './src/assets/js/sets.js';

export default function (eleventyConfig) {
  // Sets ↔ weeks lookups for templates (Nunjucks can't set a variable from
  // inside a nested loop, so the search happens here).
  eleventyConfig.addFilter('findWeek', (weeks, n) => weeks.find((w) => w.week === Number(n)) ?? null);
  eleventyConfig.addFilter('setOf', (week) => setForWeek(week));
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  // Stamps the service-worker cache name so every deploy replaces the precache.
  eleventyConfig.addGlobalData('buildStamp', String(Date.now()));
  eleventyConfig.addFilter('pad2', (n) => String(n).padStart(2, '0'));
  // Safe JSON for <script type="application/json"> embeds: escaping `<` keeps
  // question text containing "</script>" from terminating the script element.
  eleventyConfig.addFilter('embedJson', (v) => JSON.stringify(v).replaceAll('<', '\\u003c'));

  return {
    dir: {
      input: 'src',
      includes: '_includes',
      data: '_data',
      output: '_site',
    },
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
  };
}
