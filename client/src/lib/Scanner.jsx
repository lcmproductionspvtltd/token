/* QR scanner for staff and owners: live camera, scan from a photo, or type the token ID. */

import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon, toast } from '../core/ui.jsx';
import { QRDecode } from './qr-decoder.js';

/*
 * Uses the browser's BarcodeDetector when available (fast on Chrome / Android) and the
 * built-in QRDecode engine everywhere else (iPhone Safari, Firefox, desktop).
 */

function beep() {
  try {
    if (navigator.vibrate) navigator.vibrate(60);
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    const a = new A();
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.value = 1150;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.12);
    setTimeout(() => a.close && a.close(), 400);
  } catch (err) {
    /* sound is optional */
  }
}

function tokenFromCode(code) {
  const s = String(code || '').trim();
  const m = s.match(/\/t\/([A-Za-z0-9]{6,32})(?:[/?#]|$)/) || s.match(/^([a-f0-9]{8,32})$/i);
  if (m) return { id: m[1] };
  if (/\/b\/[A-Za-z0-9]+/.test(s) || /\/s\/[^/]+/.test(s))
    return { err: 'That is a branch QR code. Scan the QR on the customer’s token.' };
  return { err: 'This QR code is not a BQuee token.' };
}

async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not open the image'));
      i.src = url;
    });
    const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc);
    c.height = Math.round(img.height * sc);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    if ('BarcodeDetector' in window) {
      try {
        const r = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(c);
        if (r.length) return r[0].rawValue;
      } catch (err) {
        /* fall back to the built-in decoder */
      }
    }
    return QRDecode.decode(x.getImageData(0, 0, c.width, c.height));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * <Scanner onToken={(id) => …} onClose={…} />
 */
export function Scanner({ onToken, onClose, title = 'Scan a customer token' }) {
  const video = useRef(null);
  const fileInput = useRef(null);
  const handled = useRef(false);
  const [message, setMessage] = useState('Starting camera…');
  const [facing, setFacing] = useState('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [torch, setTorch] = useState(null); // null = not supported
  const [manual, setManual] = useState('');
  const secure = window.isSecureContext !== false;
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const live = secure && hasCamera;
  const trackRef = useRef(null);

  const done = (code) => {
    if (handled.current) return true;
    const r = tokenFromCode(code);
    if (r.err) {
      toast(r.err, 'err');
      return false;
    }
    handled.current = true;
    beep();
    onClose();
    onToken(r.id);
    return true;
  };

  useEffect(() => {
    if (!live) return undefined;
    let stream = null;
    let timer = null;
    let stopped = false;
    let native = null;
    let frame = 0;
    const work = document.createElement('canvas');
    const wctx = work.getContext('2d', { willReadFrequently: true });

    if ('BarcodeDetector' in window) {
      try {
        window.BarcodeDetector.getSupportedFormats()
          .then((f) => {
            if (f.includes('qr_code')) native = new window.BarcodeDetector({ formats: ['qr_code'] });
          })
          .catch(() => {});
      } catch (err) {
        /* not supported */
      }
    }

    const loop = async () => {
      if (stopped || handled.current) return;
      const v = video.current;
      if (v && v.videoWidth && v.videoHeight) {
        try {
          let code = null;
          if (native) {
            const r = await native.detect(v);
            if (r.length) code = r[0].rawValue;
          }
          if (!code) {
            const side = Math.min(v.videoWidth, v.videoHeight) * 0.86;
            const out = Math.min(720, Math.round(side));
            work.width = out;
            work.height = out;
            wctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, out, out);
            code = QRDecode.decode(wctx.getImageData(0, 0, out, out), { fast: frame++ % 4 !== 3 });
          }
          if (code && done(code)) return;
        } catch (err) {
          /* keep scanning */
        }
      }
      timer = setTimeout(loop, native ? 120 : 60);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setMessage('Point the camera at the QR code on the token');
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        setTorch(caps.torch ? false : null);
        try {
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          setCanFlip(cams.length > 1);
        } catch (err) {
          /* ignore */
        }
        loop();
      } catch (err) {
        setMessage(
          err && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it in the browser settings, or scan from a photo.'
            : 'The camera could not start. Scan from a photo instead.',
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing, live]);

  const toggleTorch = () => {
    const on = !torch;
    setTorch(on);
    if (trackRef.current) trackRef.current.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
  };

  const fromPhoto = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setMessage('Reading the photo…');
    try {
      const code = await decodeImageFile(f);
      if (code) done(code);
      else {
        setMessage('No QR code found. Try a closer, sharper photo.');
        toast('No QR code found in the photo', 'err');
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  return (
    <Dialog title={title} onClose={onClose} width={460} className="scanner" focusFirst={false}>
      <div className="scan-view">
        {live ? <video ref={video} playsInline muted autoPlay /> : <Icon name="camera" className="scan-off" />}
        <div className="scan-frame" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          {live && <b />}
        </div>
        <p className="scan-msg">{live ? message : 'Live camera is not available here'}</p>
      </div>
      <div className="scan-tools">
        {canFlip && (
          <Button
            size="sm"
            icon="refresh"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          >
            Switch camera
          </Button>
        )}
        {torch !== null && (
          <Button size="sm" icon="bolt" variant={torch ? 'primary' : ''} onClick={toggleTorch}>
            Light
          </Button>
        )}
        <Button size="sm" icon="image" onClick={() => fileInput.current.click()}>
          Scan from photo
        </Button>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={fromPhoto} />
      </div>
      {!secure && (
        <p className="scan-note">The live camera needs a secure (https://) address. Scan from a photo instead.</p>
      )}
      <form
        className="scan-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) done(manual.trim());
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type the token ID / paste the link"
          autoComplete="off"
          aria-label="Token ID or link"
        />
        <button className="btn primary" type="submit">
          <span>Open</span>
        </button>
      </form>
    </Dialog>
  );
}
