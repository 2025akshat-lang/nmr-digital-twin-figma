import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useNMR } from '../NMRContext';
import { NUCLEUS_PPM_RANGE, NUCLEUS_FREQ, SAMPLE_LIBRARY, getPeaksForNucleus } from '../simulation';
import type { PickedPeak, Integration } from '../types';

interface ViewRange { min: number; max: number; }

export default function SpectrumViewer() {
  const { state, dispatch } = useNMR();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const [viewRange, setViewRange] = useState<ViewRange>(() => {
    const [max, min] = NUCLEUS_PPM_RANGE['1H'];
    return { min, max };
  });
  const [cursor, setCursor] = useState<{ ppm: number; intensity: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; ppm: number } | null>(null);
  const [integrationStart, setIntegrationStart] = useState<number | null>(null);
  const [mode, setMode] = useState<'zoom' | 'integrate' | 'peak'>('zoom');

  // Update view range when nucleus changes
  useEffect(() => {
    const [max, min] = NUCLEUS_PPM_RANGE[state.nucleus];
    setViewRange({ min, max });
  }, [state.nucleus]);

  const ppmToX = useCallback((ppm: number, W: number): number => {
    const { min, max } = viewRange;
    return W - ((ppm - min) / (max - min)) * W;
  }, [viewRange]);

  const xToPpm = useCallback((x: number, W: number): number => {
    const { min, max } = viewRange;
    return max - (x / W) * (max - min);
  }, [viewRange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    observer.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    function draw() {
      const W = canvas!.width;
      const H = canvas!.height;
      const ctx = canvas!.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);

      const PLOT_TOP = 20;
      const PLOT_BOTTOM = H - 35;
      const PLOT_LEFT = 45;
      const PLOT_RIGHT = W - 15;
      const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
      const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

      // Background
      ctx.fillStyle = '#0000';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.5;
      const ppmStep = viewRange.max - viewRange.min > 5 ? 1 : 0.5;
      for (let ppm = Math.ceil(viewRange.min); ppm <= Math.floor(viewRange.max); ppm += ppmStep) {
        const x = PLOT_LEFT + PLOT_W - ((ppm - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        ctx.beginPath(); ctx.moveTo(x, PLOT_TOP); ctx.lineTo(x, PLOT_BOTTOM); ctx.stroke();
        // ppm label
        ctx.fillStyle = '#ffff';
        ctx.font = 'bold 12px JetBrains Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ppm.toFixed(1), x, PLOT_BOTTOM + 20);
      }

      // Horizontal baseline
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PLOT_LEFT, PLOT_BOTTOM);
      ctx.lineTo(PLOT_RIGHT, PLOT_BOTTOM);
      ctx.stroke();

      // y-axis
      ctx.beginPath();
      ctx.moveTo(PLOT_LEFT, PLOT_TOP);
      ctx.lineTo(PLOT_LEFT, PLOT_BOTTOM);
      ctx.stroke();

      // ppm axis label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px JetBrains Mono,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('δ (ppm)', PLOT_LEFT + PLOT_W / 2, H - 4);

      if (!state.spectrumReady || state.spectrumPPM.length === 0) {
        // No data message
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px JetBrains Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          state.acqStatus === 'IDLE' ? 'SPECTRUM VIEWER — Acquire data to display' :
          state.acqStatus === 'ACQUIRING' ? 'ACQUIRING...' :
          state.acqStatus === 'COMPLETE' ? 'Press PROCESS DATA to generate spectrum' :
          'No spectrum data',
          PLOT_LEFT + PLOT_W / 2, PLOT_TOP + PLOT_H / 2
        );
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const { spectrumPPM: ppmArr, spectrumIntensity: intArr } = state;
      const maxI = Math.max(...intArr);
      const minI = Math.min(...intArr);
      const range = maxI - minI || 1;

      // Integration regions
      state.integrations.forEach(intg => {
        const x1 = PLOT_LEFT + PLOT_W - ((Math.max(intg.start, intg.end) - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        const x2 = PLOT_LEFT + PLOT_W - ((Math.min(intg.start, intg.end) - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(Math.min(x1,x2), PLOT_TOP, Math.abs(x2-x1), PLOT_H);
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.min(x1,x2), PLOT_TOP);
        ctx.lineTo(Math.min(x1,x2), PLOT_BOTTOM);
        ctx.moveTo(Math.max(x1,x2), PLOT_TOP);
        ctx.lineTo(Math.max(x1,x2), PLOT_BOTTOM);
        ctx.stroke();
        // Integral label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px JetBrains Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(intg.normalized.toFixed(2), (Math.min(x1,x2) + Math.max(x1,x2)) / 2, PLOT_TOP + 12);
      });

      // Spectrum trace
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#fff';
      let started = false;
      for (let i = 0; i < ppmArr.length; i++) {
        const ppm = ppmArr[i];
        if (ppm < viewRange.min || ppm > viewRange.max) continue;
        const x = PLOT_LEFT + PLOT_W - ((ppm - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        const y = PLOT_BOTTOM - ((intArr[i] - minI) / range) * PLOT_H * 0.85;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Baseline fill
      ctx.beginPath();
      started = false;
      for (let i = 0; i < ppmArr.length; i++) {
        const ppm = ppmArr[i];
        if (ppm < viewRange.min || ppm > viewRange.max) continue;
        const x = PLOT_LEFT + PLOT_W - ((ppm - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        const y = PLOT_BOTTOM - ((intArr[i] - minI) / range) * PLOT_H * 0.85;
        if (!started) { ctx.moveTo(x, PLOT_BOTTOM); ctx.lineTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(PLOT_RIGHT, PLOT_BOTTOM);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, PLOT_TOP, 0, PLOT_BOTTOM);
      grad.addColorStop(0, 'rgba(255,255,255,0.15)');
      grad.addColorStop(1, 'rgba(255,255,255,0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Peak labels
      state.pickedPeaks.forEach(pk => {
        if (pk.ppm < viewRange.min || pk.ppm > viewRange.max) return;
        const ppmIdx = ppmArr.reduce((best, p, i) => Math.abs(p - pk.ppm) < Math.abs(ppmArr[best] - pk.ppm) ? i : best, 0);
        const x = PLOT_LEFT + PLOT_W - ((pk.ppm - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        const y = PLOT_BOTTOM - ((intArr[ppmIdx] - minI) / range) * PLOT_H * 0.85;
        // Peak tick
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.3;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y - 12); ctx.stroke();
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px JetBrains Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${pk.ppm.toFixed(2)}`, x, y - 25);
        if (pk.multiplicity) ctx.fillText(pk.multiplicity, x, y - 12);
      });

      // Reference marker
      ctx.strokeStyle = '#ffffff44';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const refX = PLOT_LEFT + PLOT_W - ((0 - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
      if (refX >= PLOT_LEFT && refX <= PLOT_RIGHT) {
        ctx.moveTo(refX, PLOT_TOP); ctx.lineTo(refX, PLOT_BOTTOM);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Cursor crosshair
      if (cursor) {
        const cx = PLOT_LEFT + PLOT_W - ((cursor.ppm - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(cx, PLOT_TOP); ctx.lineTo(cx, PLOT_BOTTOM); ctx.stroke();
        ctx.setLineDash([]);
        // Cursor label
        ctx.fillStyle = '#ffffff';
        ctx.font = ' bold 13px JetBrains Mono,monospace';
        ctx.textAlign = cx > PLOT_LEFT + PLOT_W / 2 ? 'right' : 'left';
        ctx.fillText(`δ ${cursor.ppm.toFixed(3)} ppm`, cx + (cx > PLOT_LEFT + PLOT_W / 2 ? -4 : 4), PLOT_TOP + 14);
      }

      // Integration drag preview
      if (integrationStart !== null && cursor !== null) {
        const x1 = PLOT_LEFT + PLOT_W - ((integrationStart - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        const x2 = PLOT_LEFT + PLOT_W - ((cursor.ppm - viewRange.min) / (viewRange.max - viewRange.min)) * PLOT_W;
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(Math.min(x1,x2), PLOT_TOP, Math.abs(x2-x1), PLOT_H);
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frameRef.current); observer.disconnect(); };
  }, [state.spectrumReady, state.spectrumPPM, state.spectrumIntensity, state.pickedPeaks, state.integrations, viewRange, cursor, integrationStart, state.acqStatus]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const W = canvas.width;
    const PLOT_LEFT = 45;
    const PLOT_RIGHT = W - 15;
    const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
    const xRel = x - PLOT_LEFT;
    const ppm = viewRange.max - (xRel / PLOT_W) * (viewRange.max - viewRange.min);
    const { spectrumPPM, spectrumIntensity } = state;
    let intensity = 0;
    if (spectrumPPM.length > 0) {
      const idx = spectrumPPM.reduce((best, p, i) => Math.abs(p - ppm) < Math.abs(spectrumPPM[best] - ppm) ? i : best, 0);
      intensity = spectrumIntensity[idx] ?? 0;
    }
    setCursor({ ppm, intensity });

    if (isDragging && dragStart) {
      if (mode === 'zoom') {
        // Pan
        const deltaPPM = (e.clientX - (dragStart.x + rect.left)) / PLOT_W * (viewRange.max - viewRange.min);
        setViewRange(vr => ({ min: vr.min + deltaPPM * 0.005, max: vr.max + deltaPPM * 0.005 }));
      }
    }
  }, [viewRange, state.spectrumPPM, state.spectrumIntensity, isDragging, dragStart, mode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const W = canvas.width;
    const PLOT_W = W - 60;
    const fracX = (x - 45) / PLOT_W;
    const ppmCenter = viewRange.max - fracX * (viewRange.max - viewRange.min);
    const factor = e.deltaY > 0 ? 1.3 : 0.7;
    const newRange = (viewRange.max - viewRange.min) * factor;
    setViewRange({ min: ppmCenter - newRange * (1 - fracX), max: ppmCenter + newRange * fracX });
  }, [viewRange]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !state.spectrumReady) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const W = canvas.width;
    const PLOT_W = W - 60;
    const ppm = viewRange.max - ((x - 45) / PLOT_W) * (viewRange.max - viewRange.min);

    if (mode === 'peak') {
      // Manual peak pick
      const { spectrumPPM, spectrumIntensity } = state;
      if (spectrumPPM.length > 0) {
        const idx = spectrumPPM.reduce((best, p, i) => Math.abs(p - ppm) < Math.abs(spectrumPPM[best] - ppm) ? i : best, 0);
        const sample = SAMPLE_LIBRARY[state.selectedSample];
        const refPeaks = getPeaksForNucleus(sample, state.nucleus);
        const closestPeak = refPeaks.reduce((best: any, p: any) => Math.abs(p.ppm - spectrumPPM[idx]) < Math.abs((best?.ppm ?? 999) - spectrumPPM[idx]) ? p : best, null as any);
        const newPeak: PickedPeak = {
          ppm: spectrumPPM[idx],
          intensity: spectrumIntensity[idx],
          multiplicity: closestPeak?.multiplicity ?? 'S',
          J: closestPeak?.J ?? 0,
          fwhm: ((1 - state.shimQuality * 0.9) * 80 + 0.5 + state.apodLB),
          nH: closestPeak?.nH ?? 1,
          label: closestPeak?.label,
        };
        dispatch({ type: 'SET_PICKED_PEAKS', payload: [...state.pickedPeaks, newPeak] });
      }
    } else if (mode === 'integrate') {
      if (integrationStart === null) {
        setIntegrationStart(ppm);
      } else {
        // Compute integral from spectrum
        const { spectrumPPM, spectrumIntensity } = state;
        const [lo, hi] = [Math.min(ppm, integrationStart), Math.max(ppm, integrationStart)];
        let rawVal = 0;
        for (let i = 0; i < spectrumPPM.length; i++) {
          if (spectrumPPM[i] >= lo && spectrumPPM[i] <= hi) rawVal += spectrumIntensity[i];
        }
        const intg: Integration = {
          id: `int_${Date.now()}`,
          start: hi, end: lo,
          rawValue: rawVal,
          normalized: rawVal,
          label: '',
        };
        dispatch({ type: 'ADD_INTEGRATION', payload: intg });
        dispatch({ type: 'NORMALIZE_INTEGRATIONS' });
        setIntegrationStart(null);
      }
    }
  }, [mode, viewRange, state, integrationStart, dispatch]);

  // Auto peak-pick: runs once per fresh spectrum (and again if the user
  // adjusts the threshold), matched against the peak list for whichever
  // nucleus is actually selected — not always 1H.
  const autoPickedForRef = useRef<string>('');
  useEffect(() => {
    if (!state.spectrumReady) { autoPickedForRef.current = ''; return; }
    const { spectrumPPM, spectrumIntensity, peakThreshold } = state;
    if (spectrumPPM.length === 0) return;

    const runKey = `${state.nucleus}:${state.selectedSample}:${peakThreshold}:${spectrumPPM.length}`;
    if (autoPickedForRef.current === runKey) return; // already auto-picked for this spectrum
    autoPickedForRef.current = runKey;

    const threshold = (peakThreshold / 100) * Math.max(...spectrumIntensity);
    const peaks: PickedPeak[] = [];
    const sample = SAMPLE_LIBRARY[state.selectedSample];
    const refPeaks = getPeaksForNucleus(sample, state.nucleus);
    for (let i = 1; i < spectrumPPM.length - 1; i++) {
      if (spectrumIntensity[i] > threshold &&
          spectrumIntensity[i] > spectrumIntensity[i-1] &&
          spectrumIntensity[i] > spectrumIntensity[i+1]) {
        const closestPeak = refPeaks.reduce((best: any, p: any) =>
          Math.abs(p.ppm - spectrumPPM[i]) < Math.abs((best?.ppm ?? 999) - spectrumPPM[i]) ? p : best, null as any);
        peaks.push({
          ppm: spectrumPPM[i],
          intensity: spectrumIntensity[i],
          multiplicity: closestPeak?.multiplicity ?? 'S',
          J: closestPeak?.J ?? 0,
          fwhm: (1 - state.shimQuality * 0.9) * 80 + 0.5 + state.apodLB,
          nH: closestPeak?.nH ?? 1,
          label: closestPeak?.label,
        });
      }
    }
    // Deduplicate (within 0.05 ppm)
    const deduped = peaks.filter((p, i) =>
      !peaks.slice(0, i).some(q => Math.abs(q.ppm - p.ppm) < 0.05)
    );
    if (deduped.length > 0 && deduped.length !== state.pickedPeaks.length) {
      dispatch({ type: 'SET_PICKED_PEAKS', payload: deduped });
    }
  }, [state.spectrumReady, state.peakThreshold, state.nucleus, state.selectedSample]);

  const resetView = () => {
    const [max, min] = NUCLEUS_PPM_RANGE[state.nucleus];
    setViewRange({ min, max });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0b192c' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 flex-shrink-0" style={{ borderBottom: '1px solid #333333', background: '#111111' }}>
        <span className="font-mono text-[10px] text-[#aaaaaa]">SPECTRUM — {state.nucleus} @ {NUCLEUS_FREQ[state.nucleus].toFixed(1)} MHz</span>
        <div className="flex gap-1 ml-auto">
          {(['zoom', 'peak', 'integrate'] as const).map(m => (
            <button key={m} className="nmr-btn text-[10px] px-2 py-0.5"
              style={mode === m ? { background: '#ffff', borderColor: '#ffffff', color: '#000000' } : {}}
              onClick={() => { setMode(m); setIntegrationStart(null); }}>
              {m === 'zoom' ? '🔍 ZOOM' : m === 'peak' ? '▲ PEAK' : '∫ INTEG'}
            </button>
          ))}
          <button className="nmr-btn text-[10px] px-2 py-0.5" onClick={resetView}>FULL</button>
          {cursor && <span className="nmr-value text-[10px] ml-2">δ {cursor.ppm.toFixed(3)} ppm</span>}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ cursor: mode === 'peak' ? 'crosshair' : mode === 'integrate' ? 'col-resize' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setCursor(null)}
          onClick={handleClick}
          onWheel={handleWheel}
        />
        {!state.spectrumReady && state.acqStatus !== 'ACQUIRING' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="font-mono text-[13px] text-[#333333] mb-1">NO SPECTRUM</div>
              <div className="font-mono text-[10px] text-[#1a1a1a]">Acquire and process data to display spectrum</div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1 flex-shrink-0 flex-wrap" style={{ borderTop: '1px solid #333333', background: '#0d0d0d' }}>
        <span className="font-mono text-[9px] text-[#999999]">
          SHIM: {state.shimQuality > 0.85 ? 'EXCELLENT' : state.shimQuality > 0.65 ? 'GOOD' : 'FAIR'}
        </span>
        <span className="font-mono text-[9px] text-[#999999]">LW≈{((1-state.shimQuality*0.9)*80+0.5+state.apodLB).toFixed(1)}Hz</span>
        <span className="font-mono text-[9px] text-[#999999]">√NS={Math.sqrt(state.NS).toFixed(1)}</span>
        <span className="font-mono text-[9px] text-[#999999]">PEAKS:{state.pickedPeaks.length}</span>
        <span className="font-mono text-[9px] text-[#999999]">{state.referenceMode} ref</span>
        {state.receiverOverflow && <span className="font-mono text-[9px] text-[#ffffff] led-blink">⚠ OVERFLOW</span>}
        {mode === 'integrate' && integrationStart !== null && (
          <span className="font-mono text-[9px] text-[#ffffff]">Click to set integration end...</span>
        )}
        <span className="font-mono text-[9px] text-[#999999] ml-auto">
          {viewRange.max.toFixed(1)}…{viewRange.min.toFixed(1)} ppm | Scroll=zoom Click=action
        </span>
      </div>
    </div>
  );
}
