/* Minimal PDF writer: one page with one JPEG image (DCTDecode). */

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * One-page PDF holding a JPEG. w/h are the image's pixel size; `scale` is how many image
 * pixels make one CSS pixel (2 for a 2× drawing), so the page keeps its normal size and
 * the picture stays sharp when zoomed or printed.
 */
export function jpegToPdf(jpegDataUrl, w, h, scale = 1) {
  const img = dataUrlToBytes(jpegDataUrl),
    enc = new TextEncoder();
  const pw = ((w / scale) * 0.75).toFixed(2),
    ph = ((h / scale) * 0.75).toFixed(2);
  const parts = [],
    offs = [];
  let off = 0;
  const push = (p) => {
    const b = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(b);
    off += b.length;
  };
  const obj = (n, s) => {
    offs[n] = off;
    push(n + ' 0 obj\n' + s + '\nendobj\n');
  };
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      pw +
      ' ' +
      ph +
      '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
  );
  offs[4] = off;
  push(
    '4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' +
      w +
      ' /Height ' +
      h +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
      img.length +
      ' >>\nstream\n',
  );
  push(img);
  push('\nendstream\nendobj\n');
  const cs = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
  obj(5, '<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream');
  const x = off;
  let t = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) t += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(t + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}
