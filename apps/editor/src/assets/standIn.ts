/**
 * Stand-in art (D34, Evan's call): a placeholder image the editor makes, the name it stands in for
 * on a colour drawn from that name, so two stand-ins tell apart at a glance. The same name always
 * gives the same bytes. It is logged as a stand-in, and W107 lists it until real art replaces it.
 */
import { fnv1a64 } from '@eb/core';
import { slugify } from '../forms/labels.ts';

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The words in lines of about 14 characters, at most 3; a longer name ends in "…". */
function lines(label: string): string[] {
  const out: string[] = [];
  for (const word of label.trim().split(/\s+/)) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= 14) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out.length > 3 ? [...out.slice(0, 2), `${out[2]}…`] : out;
}

/** The stand-in's SVG: 512 px square, the name in white on a colour from its hash. */
export function standInSvg(label: string): string {
  const hue = Number.parseInt(fnv1a64(label).slice(0, 4), 16) % 360;
  const shown = lines(label);
  const size = Math.max(...shown.map((line) => line.length)) > 10 ? 44 : 60;
  const top = 256 - ((shown.length - 1) * size * 1.2) / 2;
  const text = shown
    .map((line, i) => `<tspan x="256" y="${Math.round(top + i * size * 1.2)}">${escapeXml(line)}</tspan>`)
    .join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
    `<rect width="512" height="512" fill="hsl(${hue} 45% 38%)"/>`,
    '<path d="M0 0L512 512M512 0L0 512" stroke="#fff" stroke-opacity="0.15" stroke-width="10"/>',
    `<text fill="#fff" font-family="system-ui, sans-serif" font-size="${size}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${text}</text>`,
    '<text x="256" y="470" fill="#fff" fill-opacity="0.8" font-family="system-ui, sans-serif" font-size="26" text-anchor="middle">stand-in</text>',
    '</svg>',
    '',
  ].join('\n');
}

/** Where a stand-in for `label` goes: stand-ins/<its id>.svg. */
export const standInPath = (label: string): string => `stand-ins/${slugify(label) || 'stand-in'}.svg`;
