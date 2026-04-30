/* ============================================================
   Local-only charts — pure Canvas. No CDN dependency.
   Brutalist styling: thick black axes, hard fills, no glow.
   ============================================================ */

const Charts = (() => {
  const dpr = () => Math.max(1, window.devicePixelRatio || 1);
  const INK     = '#000000';
  const ASH     = '#6B6B6B';
  const PAPER   = '#FFFFFF';
  const YELLOW  = '#FFD400';

  const setupCanvas = (canvas, w, h) => {
    const r = dpr();
    canvas.width = w * r;
    canvas.height = h * r;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(r, r);
    return ctx;
  };

  const display = (size = 11) => `900 ${size}px "Archivo Black","Anton",Impact,system-ui,sans-serif`;
  const monoFont = (size = 11) => `${size}px "JetBrains Mono","Courier New",monospace`;

  // ---- PIE (donut) ----
  const pie = (canvas, data, opts = {}) => {
    const W = canvas.clientWidth || 320;
    const H = opts.height || 200;
    const ctx = setupCanvas(canvas, W, H);
    ctx.clearRect(0, 0, W, H);

    const total = data.reduce((s, d) => s + d.value, 0);
    if (total <= 0) {
      ctx.fillStyle = ASH;
      ctx.font = display(14);
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', W / 2, H / 2);
      return;
    }

    const cx = W / 2;
    const cy = H / 2;
    const r  = Math.min(W, H) / 2 - 16;
    const ir = r * 0.5;

    let start = -Math.PI / 2;
    data.forEach((d) => {
      const a = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.fillStyle = d.color || YELLOW;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + a);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      start += a;
    });

    // donut hole
    ctx.beginPath();
    ctx.fillStyle = PAPER;
    ctx.arc(cx, cy, ir, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // outer black ring
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // total in middle
    ctx.fillStyle = INK;
    ctx.font = display(10);
    ctx.textAlign = 'center';
    ctx.fillText('TOTAL', cx, cy - 4);
    ctx.font = display(14);
    ctx.fillText('₹' + Math.round(total).toLocaleString('en-IN'), cx, cy + 14);
  };

  // ---- BAR ----
  const bar = (canvas, data, opts = {}) => {
    const W = canvas.clientWidth || 320;
    const H = opts.height || 200;
    const ctx = setupCanvas(canvas, W, H);
    ctx.clearRect(0, 0, W, H);

    if (!data.length) {
      ctx.fillStyle = ASH;
      ctx.font = display(14);
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', W / 2, H / 2);
      return;
    }

    const padL = 36, padR = 12, padT = 14, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const max = Math.max(1, ...data.map(d => d.value));
    const bw = innerW / data.length;

    // grid + y labels
    ctx.font = monoFont(9);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    [0, 0.5, 1].forEach((p) => {
      const y = padT + innerH * (1 - p);
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + innerW, y);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(Math.round(max * p), padL - 4, y + 3);
    });

    // axis (thick black)
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + innerH);
    ctx.lineTo(padL + innerW, padT + innerH);
    ctx.stroke();

    data.forEach((d, i) => {
      const h = (d.value / max) * innerH;
      const x = padL + i * bw + bw * 0.15;
      const y = padT + innerH - h;
      const w = bw * 0.7;
      ctx.fillStyle = YELLOW;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // x label
      ctx.fillStyle = INK;
      ctx.font = display(9);
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + w / 2, padT + innerH + 16);
    });
  };

  // ---- LINE ----
  const line = (canvas, series, labels, opts = {}) => {
    const W = canvas.clientWidth || 320;
    const H = opts.height || 200;
    const ctx = setupCanvas(canvas, W, H);
    ctx.clearRect(0, 0, W, H);

    if (!series.length || !labels.length) {
      ctx.fillStyle = ASH;
      ctx.font = display(14);
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', W / 2, H / 2);
      return;
    }

    const padL = 36, padR = 12, padT = 14, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    let max = 1;
    series.forEach(s => s.points.forEach(p => { if (p.y > max) max = p.y; }));

    // grid + y labels
    ctx.font = monoFont(9);
    [0, 0.5, 1].forEach((p) => {
      const y = padT + innerH * (1 - p);
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + innerW, y);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(max * p), padL - 4, y + 3);
    });

    // axis
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + innerH);
    ctx.lineTo(padL + innerW, padT + innerH);
    ctx.stroke();

    const stepX = innerW / Math.max(1, labels.length - 1);

    // x labels
    ctx.fillStyle = INK;
    ctx.font = display(9);
    ctx.textAlign = 'center';
    labels.forEach((lab, i) => {
      ctx.fillText(lab, padL + i * stepX, padT + innerH + 16);
    });

    series.forEach(s => {
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = s.color;
      labels.forEach((lab, i) => {
        const p = s.points.find(pp => pp.x === lab) || { y: 0 };
        const x = padL + i * stepX;
        const y = padT + innerH - (p.y / max) * innerH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      labels.forEach((lab, i) => {
        const p = s.points.find(pp => pp.x === lab) || { y: 0 };
        const x = padL + i * stepX;
        const y = padT + innerH - (p.y / max) * innerH;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK;
        ctx.stroke();
      });
    });
  };

  return { pie, bar, line };
})();
