import React, { useRef, useEffect } from 'react';
import { useNMR } from '../NMRContext';

export default function FIDViewer() {
  const { state } = useNMR();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const animPhaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    resizeObserver.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    function draw() {
      const W = canvas!.width;
      const H = canvas!.height;
      const ctx = canvas!.getContext('2d')!;

      ctx.fillStyle = '#030d1a';
      ctx.fillRect(0, 0, W, H);

      const PLOT_TOP = 4;
      const PLOT_BOTTOM = H - 16;
      const PLOT_LEFT = 10;
      const PLOT_RIGHT = W - 10;
      const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
      const PLOT_H = PLOT_BOTTOM - PLOT_TOP;
      const midY = PLOT_TOP + PLOT_H / 2;

      // Grid lines
      ctx.strokeStyle = '#0a1628';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(PLOT_LEFT, midY); ctx.lineTo(PLOT_RIGHT, midY); ctx.stroke();

      const fid = state.fidData;
      const acqRunning = state.acqStatus === 'ACQUIRING';

      if (!fid || fid.length === 0) {
        if (acqRunning) {
          // Animated "scanning" waveform while acquiring
          animPhaseRef.current += 0.04;
          const t = animPhaseRef.current;
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 1;
          ctx.shadowBlur = 3;
          ctx.shadowColor = '#005577';
          ctx.beginPath();
          for (let x = 0; x < PLOT_W; x++) {
            const relX = x / PLOT_W;
            const decay = Math.exp(-relX * 4);
            const sig = 0.35 * decay * (
              Math.cos(2 * Math.PI * 8 * relX + t) +
              0.5 * Math.cos(2 * Math.PI * 5.2 * relX + t * 0.8) +
              0.3 * Math.cos(2 * Math.PI * 11 * relX + t * 1.2)
            );
            const y = midY - sig * PLOT_H;
            x === 0 ? ctx.moveTo(PLOT_LEFT, y) : ctx.lineTo(PLOT_LEFT + x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Scan progress marker
          const progress = state.currentScan / Math.max(1, state.NS);
          const markerX = PLOT_LEFT + progress * PLOT_W;
          ctx.strokeStyle = '#ffab00';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(markerX, PLOT_TOP); ctx.lineTo(markerX, PLOT_BOTTOM); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = '#1a3a5c';
          ctx.font = '10px JetBrains Mono,monospace';
          ctx.textAlign = 'center';
          ctx.fillText('FID VIEWER — No data', PLOT_LEFT + PLOT_W / 2, midY);
        }
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      // Draw actual FID
      const nPts = Math.min(fid.length, 4096); // limit display points for performance
      const stride = Math.max(1, Math.floor(fid.length / nPts));
      let maxVal = 0;
      for (let i = 0; i < fid.length; i += stride) maxVal = Math.max(maxVal, Math.abs(fid[i]));
      const scale = maxVal > 0 ? (PLOT_H * 0.42) / maxVal : 1;

      // Overflow clipping markers
      if (state.receiverOverflow) {
        ctx.fillStyle = 'rgba(255,23,68,0.08)';
        ctx.fillRect(PLOT_LEFT, PLOT_TOP, PLOT_W, PLOT_H * 0.1);
        ctx.fillRect(PLOT_LEFT, PLOT_BOTTOM - PLOT_H * 0.1, PLOT_W, PLOT_H * 0.1);
      }

      ctx.strokeStyle = state.receiverOverflow ? '#ff4444' : '#00d4ff';
      ctx.lineWidth = 1;
      ctx.shadowBlur = state.acqStatus === 'COMPLETE' ? 3 : 0;
      ctx.shadowColor = '#005577';
      ctx.beginPath();
      for (let i = 0; i < fid.length; i += stride) {
        const x = PLOT_LEFT + (i / fid.length) * PLOT_W;
        const y = midY - fid[i] * scale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Time axis
      ctx.fillStyle = '#3a6a8f';
      ctx.font = '8px JetBrains Mono,monospace';
      ctx.textAlign = 'left';
      ctx.fillText('0', PLOT_LEFT, PLOT_BOTTOM + 12);
      ctx.textAlign = 'right';
      ctx.fillText(`${state.AQ.toFixed(2)}s`, PLOT_RIGHT, PLOT_BOTTOM + 12);
      ctx.textAlign = 'center';
      ctx.fillText('time →', PLOT_LEFT + PLOT_W / 2, PLOT_BOTTOM + 12);

      if (state.receiverOverflow) {
        ctx.fillStyle = '#ff1744';
        ctx.font = 'bold 10px JetBrains Mono,monospace';
        ctx.textAlign = 'right';
        ctx.fillText('⚠ OVERFLOW', PLOT_RIGHT - 4, PLOT_TOP + 14);
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frameRef.current); resizeObserver.disconnect(); };
  }, [state.fidData, state.acqStatus, state.currentScan, state.NS, state.AQ, state.receiverOverflow]);

 return (
    <div className="flex flex-col h-full" style={{ background: '#030d1a', borderTop: '1px solid #1a3a5c' }}>
      <div className="flex items-center justify-between px-2 py-0.5 flex-shrink-0" style={{ borderBottom: '1px solid #0d1e38', background: '#071525' }}>
        <span className="font-mono text-[9px] text-[#3a6a8f]">FID — TD={state.TD} AQ={state.AQ}s</span>
        {state.acqStatus === 'ACQUIRING' && (
          <span className="font-mono text-[9px] text-[#00d4ff] led-slow">
            SCAN {state.currentScan}/{state.NS}
          </span>
        )}
        {state.acqStatus === 'COMPLETE' && (
          <span className="font-mono text-[9px] text-[#00e676]">COMPLETE ✓</span>
        )}
        {state.receiverOverflow && (
          <span className="font-mono text-[9px] text-[#ff1744] led-blink">⚠ OVERFLOW</span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: 0 }}>
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  ) ;
}
