import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CSSProperties } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Mascot } from '../src/office/appearance';
import { KLOPIK_SKINS, type KlopikSkin } from '../src/office/skins';

// The native Settings thumbnails use the same artwork as live Office characters.
const directory = process.argv[2] ?? '/private/tmp/kliprun-klopik-preview';
mkdirSync(directory, { recursive: true });
const colors = ['#ed987f', '#8eb5ff', '#8dd5ae', '#efd081'];
const cards = Object.entries(KLOPIK_SKINS).map(([skin, label]) => `<section><h2>${label}</h2>${renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" id={skin} width="440" height="120" viewBox="0 0 440 120" shapeRendering="crispEdges">
    {colors.map((color, variant) => <g key={variant} transform={`translate(${variant * 110 - 60} 0)`} style={{ '--resident-color': color } as CSSProperties}>
      <Mascot skin={skin as KlopikSkin} variant={variant} />
    </g>)}
  </svg>
)}</section>`).join('');
await Bun.write(join(directory, 'index.html'), `<!doctype html><html><meta charset="utf-8"><title>Klopik skins</title><style>body{margin:0;padding:24px;background:#161b22;color:#c9d1d9;font:13px system-ui}main{display:grid;grid-template-columns:repeat(2,466px);gap:20px}h1{font-size:20px}h2{font-size:13px;font-weight:500;margin:0}section{padding:12px;border:1px solid #30363d;border-radius:6px}svg{display:block}</style><h1>Klopik skins</h1><main>${cards}</main></html>`);
console.log(join(directory, 'index.html'));
