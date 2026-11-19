/* Draws the customer's token as an image (canvas) for the JPG / PDF download. */

import { LOTUS } from '../core/icon-paths.js';
import { clock, money, statusLabel, tokenNo, validColor, waitText } from '../core/format.js';
import { downloadBlob, toast } from '../core/ui.jsx';
import { jpegToPdf } from './pdf.js';
import { QR } from './qr-encoder.js';

const SANS = 'Poppins, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SERIF = 'Lora, Georgia, "Times New Roman", serif';

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fit(c, text, max) {
  let s = String(text || '');
  if (c.measureText(s).width <= max) return s;
  while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

function wrap(c, text, firstMax, max) {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = '';
  let limit = firstMax;
  for (const w of words) {
    const attempt = line ? line + ' ' + w : w;
    if (c.measureText(attempt).width > limit && line) {
      lines.push(line);
      line = w;
      limit = max;
    } else line = attempt;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const tint = (hex, t) =>
  'rgb(' +
  rgb(hex)
    .map((v) => Math.round(v + (255 - v) * t))
    .join(',') +
  ')';
const shade = (hex, t) =>
  'rgb(' +
  rgb(hex)
    .map((v) => Math.round(v * (1 - t)))
    .join(',') +
  ')';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const STATUS_COLORS = {
  waiting: ['#fdf0d5', '#8a4b06'],
  serving: ['#dde8fd', '#1e3fa8'],
  done: ['#dcf3e4', '#146c37'],
  cancelled: ['#fbe1e1', '#9b1c1c'],
  missed: ['#ecebf0', '#5d596b'],
};

/** Draws the token at 2× resolution. The page preview and both downloads use this same drawing. */
export async function drawToken(d) {
  if (document.fonts && document.fonts.load) {
    await Promise.all([
      document.fonts.load('700 40px Poppins'),
      document.fonts.load('500 20px Poppins'),
      document.fonts.load('600 30px Lora'),
    ]).catch(() => {});
  }
  const t = d.token;
  const s = d.salon;
  const b = d.branch || {};
  const col = validColor(s.color);
  const W = 720;
  const S = 2;
  const X = 40;
  const TW = 640;
  const Y = 40;
  const HH = 150;
  const total = t.total != null ? t.total : t.items.reduce((a, i) => a + i.price, 0);
  const minutes = t.items.reduce((a, i) => a + i.duration, 0);
  const waitLine =
    t.status === 'waiting'
      ? '~ ' + waitText(d.wait) + (d.ahead ? `  (${d.ahead} ahead)` : '')
      : t.status === 'serving'
        ? 'In service now'
        : t.status === 'done'
          ? 'Completed'
          : t.status === 'missed'
            ? `Expired (valid only on ${t.date})`
            : 'Cancelled';
  const rows = [
    ['Services', t.items.map((i) => i.serviceName).join(', ')],
    ['Staff', [...new Set(t.items.map((i) => i.staffName))].join(', ')],
    ['Waiting time', waitLine],
    ['Customer', t.customer.name + ' · ' + t.customer.mobile],
    ['Branch', (b.name || '') + (b.address ? ' · ' + b.address : '')],
    ['Booked', t.date + '  ' + clock(t.createdAt)],
    ...(t.offer
      ? [
          [
            'Offer',
            t.offer.title +
              (t.offer.code ? '  (' + t.offer.code + ')' : '') +
              (t.discount ? '  −' + money(t.discount, s.currency) : ''),
          ],
        ]
      : []),
    ['Total', money(total, s.currency) + '  ·  ' + minutes + ' min'],
  ];

  const measure = document.createElement('canvas').getContext('2d');
  const labelW = 170;
  const valueW = TW - 80 - labelW;
  measure.font = '500 20px ' + SANS;
  const laid = rows.map(([label, value]) => ({ label, lines: wrap(measure, value, valueW, valueW) }));
  const rowsH = laid.reduce((a, r) => a + r.lines.length * 30 + 16, 0);
  const TH = HH + 300 + rowsH + 100;
  const H = Y + TH + 40;

  const cv = document.createElement('canvas');
  cv.width = W * S;
  cv.height = H * S;
  const c = cv.getContext('2d');
  c.scale(S, S);
  c.fillStyle = tint(col, 0.93);
  c.fillRect(0, 0, W, H);

  // ticket
  c.save();
  c.shadowColor = 'rgba(30,20,45,.16)';
  c.shadowBlur = 28;
  c.shadowOffsetY = 10;
  c.fillStyle = '#fff';
  roundRect(c, X, Y, TW, TH, 24);
  c.fill();
  c.restore();

  // header band
  c.save();
  roundRect(c, X, Y, TW, TH, 24);
  c.clip();
  const g = c.createLinearGradient(X, Y, X + TW, Y + HH);
  g.addColorStop(0, shade(col, 0.2));
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.fillRect(X, Y, TW, HH);
  c.restore();

  const logo = await loadImage(s.logo);
  const LS = 76;
  const lx = X + 36;
  const ly = Y + (HH - LS) / 2;
  c.fillStyle = '#fff';
  roundRect(c, lx, ly, LS, LS, 18);
  c.fill();
  if (logo) {
    c.save();
    roundRect(c, lx + 5, ly + 5, LS - 10, LS - 10, 14);
    c.clip();
    const r = Math.max((LS - 10) / logo.width, (LS - 10) / logo.height);
    c.drawImage(
      logo,
      lx + LS / 2 - (logo.width * r) / 2,
      ly + LS / 2 - (logo.height * r) / 2,
      logo.width * r,
      logo.height * r,
    );
    c.restore();
  } else {
    c.save();
    c.translate(lx + 14, ly + 14);
    c.scale(48 / 24, 48 / 24);
    c.strokeStyle = col;
    c.lineWidth = 1.7;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const p of LOTUS) c.stroke(new Path2D(p));
    c.restore();
  }
  c.textAlign = 'left';
  c.fillStyle = '#fff';
  c.font = '600 32px ' + SERIF;
  c.fillText(fit(c, s.name, TW - LS - 110), lx + LS + 22, ly + 38);
  c.font = '400 18px ' + SANS;
  c.globalAlpha = 0.85;
  c.fillText(fit(c, s.tagline || b.name || '', TW - LS - 110), lx + LS + 22, ly + 66);
  c.globalAlpha = 1;

  // token number + status
  let y = Y + HH + 54;
  c.fillStyle = '#6a6478';
  c.font = '500 19px ' + SANS;
  c.fillText('Your token', X + 40, y);
  c.fillStyle = '#221c2b';
  let size = 92;
  c.font = `700 ${size}px ` + SANS;
  while (size > 48 && c.measureText(tokenNo(t)).width > TW - 80 - 200 - 24) {
    size -= 4;
    c.font = `700 ${size}px ` + SANS;
  }
  c.fillText(tokenNo(t), X + 36, y + 96);
  const [bg, fg] = STATUS_COLORS[t.status] || STATUS_COLORS.waiting;
  const label = statusLabel(t.status);
  c.font = '500 17px ' + SANS;
  const sw = c.measureText(label).width + 32;
  c.fillStyle = bg;
  roundRect(c, X + 40, y + 124, sw, 34, 17);
  c.fill();
  c.fillStyle = fg;
  c.fillText(label, X + 56, y + 147);

  // QR
  const qs = 200;
  const qx = X + TW - 40 - qs;
  const qy = Y + HH + 36;
  QR.draw(c, location.origin + '/t/' + t.id, qx, qy, qs, '#1b1622');

  // perforation with side notches
  y = Y + HH + 290;
  c.fillStyle = tint(col, 0.93);
  c.beginPath();
  c.arc(X, y, 16, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(X + TW, y, 16, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#d9d4e2';
  c.lineWidth = 2;
  c.setLineDash([8, 8]);
  c.beginPath();
  c.moveTo(X + 30, y);
  c.lineTo(X + TW - 30, y);
  c.stroke();
  c.setLineDash([]);

  // detail rows
  y += 44;
  for (const r of laid) {
    c.fillStyle = '#7a7389';
    c.font = '500 18px ' + SANS;
    c.fillText(r.label, X + 40, y);
    c.fillStyle = '#221c2b';
    c.font = '500 20px ' + SANS;
    r.lines.forEach((line, i) => c.fillText(line, X + 40 + labelW, y + i * 30));
    y += r.lines.length * 30 + 16;
  }

  // footer
  y += 30;
  c.textAlign = 'center';
  c.fillStyle = col;
  c.font = '500 18px ' + SANS;
  c.fillText('Show this QR to staff to start and finish your service', X + TW / 2, y);
  c.fillStyle = '#7a7389';
  c.font = '400 15px ' + SANS;
  c.fillText('Scan it to check your live waiting time · Token ID ' + t.id, X + TW / 2, y + 26);
  return cv;
}

/** Downloads exactly what the preview shows: kind = 'jpg' or 'pdf'. */
export async function downloadToken(d, kind) {
  try {
    // Same drawing as the on-page preview, at the same (2×) resolution.
    const cv = await drawToken(d);
    const out = document.createElement('canvas');
    out.width = cv.width;
    out.height = cv.height;
    const c = out.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(cv, 0, 0, out.width, out.height);
    const jpg = out.toDataURL('image/jpeg', 0.95);
    const name = 'token-' + String(d.token.number).padStart(3, '0') + '-' + d.token.id;
    if (kind === 'pdf') {
      downloadBlob(jpegToPdf(jpg, out.width, out.height, 2), name + '.pdf');
    } else {
      const bin = atob(jpg.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      downloadBlob(new Blob([bytes], { type: 'image/jpeg' }), name + '.jpg');
    }
  } catch (err) {
    toast('Could not create the file: ' + err.message, 'err');
  }
}
