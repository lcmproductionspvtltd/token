/* Printable A4 QR poster for a branch (opens in a new tab with a Print button). */

import { initials, validColor } from '../core/format.js';
import { toast } from '../core/ui.jsx';
import { QR } from './qr-encoder.js';

const esc = (v) =>
  String(v == null ? '' : v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function printPoster(url, salon, branchName) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups for this site to print the poster', 'err');
  const c = validColor(salon.color);
  const o = location.origin;
  w.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(salon.name)} – ${esc(branchName)}</title>
<style>
@font-face{font-family:Poppins;font-weight:400;src:url(${o}/fonts/Poppins-Regular.woff) format('woff')}
@font-face{font-family:Poppins;font-weight:700;src:url(${o}/fonts/Poppins-Bold.woff) format('woff')}
@font-face{font-family:Lora;font-weight:400 700;src:url(${o}/fonts/Lora-Variable.woff) format('woff')}
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Poppins,system-ui,sans-serif;color:#221c2b;background:#fff}
.p{width:210mm;min-height:297mm;margin:0 auto;padding:22mm 20mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.lg{width:34mm;height:34mm;border-radius:8mm;object-fit:cover}
.ph{width:34mm;height:34mm;border-radius:8mm;background:${c};color:#fff;font:700 15mm Poppins,sans-serif;display:grid;place-items:center}
h1{font:600 15mm/1.1 Lora,Georgia,serif;margin:8mm 0 2mm}
.br{font-size:6mm;color:#6a6478;margin:0}
.q{width:118mm;margin:12mm 0 8mm;padding:7mm;border-radius:8mm;border:2.4mm solid ${c}}
.q svg{width:100%;display:block}
h2{font-size:9mm;margin:0;color:${c}}
ol{list-style:none;padding:0;margin:8mm 0 0;display:flex;gap:6mm;font-size:4.4mm;color:#4b4558}
ol b{display:block;font-size:6mm;color:#221c2b}
.u{margin-top:auto;font-size:3.6mm;color:#8a8496}
button{font:600 16px Poppins,sans-serif;padding:12px 28px;border-radius:999px;border:0;background:${c};color:#fff;margin-top:8mm;cursor:pointer}
@media print{button{display:none}}
</style></head><body><div class="p">
${salon.logo ? `<img class="lg" src="${esc(salon.logo)}" alt="">` : `<div class="ph">${esc(initials(salon.name))}</div>`}
<h1>${esc(salon.name)}</h1><p class="br">${esc(branchName)}</p>
<div class="q">${QR.svg(url, { margin: 1 })}</div>
<h2>Scan to get your token</h2>
<ol><li><b>1</b>Pick services</li><li><b>2</b>Choose a staff member</li><li><b>3</b>Track your wait live</li></ol>
<button id="pb">Print poster</button>
<p class="u">${esc(url)}</p>
</div></body></html>`);
  w.document.close();
  const btn = w.document.getElementById('pb');
  if (btn) btn.onclick = () => w.print();
}
