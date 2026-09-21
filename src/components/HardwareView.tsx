import React, { useEffect, useRef } from 'react';
import { useNMR } from '../NMRContext';

// ─── LED dot helper ────────────────────────────────────────
function HWLed({ status }: { status: 'off' | 'ready' | 'active' | 'warning' | 'error' }) {
  const cls = {
    off: 'hw-led hw-led-off',
    ready: 'hw-led hw-led-ready',
    active: 'hw-led hw-led-active led-slow',
    warning: 'hw-led hw-led-warning led-slow',
    error: 'hw-led hw-led-error led-blink',
  }[status];
  return <span className={cls} />;
}

function HWRow({ label, value, status }: { label: string; value: string; status: 'off' | 'ready' | 'active' | 'warning' | 'error' }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <div className="flex items-center gap-1.5">
        <HWLed status={status} />
        <span className="nmr-label">{label}</span>
      </div>
      <span className="nmr-value text-[12px]">{value}</span>
    </div>
  );
}

// ─── Signal path animation on canvas ──────────────────────
function SignalPathCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (!active) {
        // Static dim path
        ctx.strokeStyle = '#1a3a5c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W * 0.5, 4);
        ctx.lineTo(W * 0.5, H - 4);
        ctx.stroke();
        return;
      }

      // Animated signal flow down (TX path)
      const t = tRef.current;
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, 'rgba(0,212,255,0)');
      gradient.addColorStop((t % 1 + 0.1) % 1, 'rgba(0,212,255,0.9)');
      gradient.addColorStop(Math.min(1, (t % 1 + 0.3) % 1 + 0.3), 'rgba(0,212,255,0)');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#00d4ff';
      ctx.beginPath();
      ctx.moveTo(W * 0.5, 4);
      ctx.lineTo(W * 0.5, H - 4);
      ctx.stroke();
      ctx.shadowBlur = 0;

      tRef.current += 0.015;
      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active]);

  return <canvas ref={canvasRef} width={20} height={120} style={{ display: 'block' }} />;
}

// ─── Spinner visualization ─────────────────────────────────
function SpinnerViz({ rate, status }: { rate: number; status: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 2;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // Background circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#1a3a5c';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (status !== 'STOPPED') {
        // Spinning tick marks
        const speed = rate / 20 * 0.06;
        angleRef.current += speed;
        for (let i = 0; i < 4; i++) {
          const a = angleRef.current + (i * Math.PI) / 2;
          const x1 = cx + (r - 4) * Math.cos(a);
          const y1 = cy + (r - 4) * Math.sin(a);
          const x2 = cx + r * Math.cos(a);
          const y2 = cy + r * Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#00d4ff';
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
      // Rate text
      ctx.fillStyle = status === 'STABLE' ? '#00e676' : status === 'STOPPED' ? '#3a6a8f' : '#ffab00';
      ctx.font = `bold 9px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${rate.toFixed(0)}Hz`, cx, cy);

      frameRef.current = requestAnimationFrame(draw);
    }
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [rate, status]);

  return <canvas ref={canvasRef} width={50} height={50} />;
}

// ─── Lock waveform ─────────────────────────────────────────
function LockWaveform({ level, status }: { level: number; status: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // Grid
      ctx.strokeStyle = '#0b1d35';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();

      if (status === 'OFF' || status === 'SEARCHING') {
        // Noise
        ctx.strokeStyle = status === 'SEARCHING' ? '#ffab00' : '#1a3a5c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
          const noise = (Math.sin(x * 0.5 + tRef.current * 3) * 0.3 + Math.random() * 0.1) * (H / 2);
          ctx.lineTo(x, H / 2 + noise);
        }
        ctx.stroke();
      } else if (status === 'LOCKED') {
        // Stable sine with slight flutter
        const amp = (level / 100) * (H / 2 - 4);
        const flutter = 0.015 * Math.sin(tRef.current * 0.7);
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#00e676';
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
          const y = H / 2 - amp * Math.sin((x / W) * Math.PI * 4 + tRef.current * 0.5 + flutter);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (status === 'OPTIMIZING' || status === 'DETECTED') {
        const amp = (level / 100) * (H / 2 - 4) * 0.6;
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
          const y = H / 2 - amp * Math.sin((x / W) * Math.PI * 4 + tRef.current);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      tRef.current += 0.03;
      frameRef.current = requestAnimationFrame(draw);
    }
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [level, status]);

  return <canvas ref={canvasRef} width={120} height={36} style={{ display: 'block' }} />;
}

// ─── Field strength visual ─────────────────────────────────
function FieldViz({ tesla }: { tesla: number }) {
  const lines = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  return (
    <svg width="60" height="60" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="28" fill="none" stroke="#1a3a5c" strokeWidth="1" />
      {lines.map((r, i) => (
        <ellipse
          key={i}
          cx="30" cy="30"
          rx={28 * r} ry={28 * r * 0.3}
          fill="none"
          stroke="#00d4ff"
          strokeWidth="0.7"
          opacity={0.3 + i * 0.12}
        />
      ))}
      <text x="30" y="30" textAnchor="middle" dominantBaseline="middle" fill="#00d4ff"
        fontFamily="JetBrains Mono,monospace" fontSize="8" fontWeight="bold">{tesla.toFixed(2)}T</text>
    </svg>
  );
}

// ─── Temperature graph ─────────────────────────────────────
function TempGraph({ current, target }: { current: number; target: number }) {
  const history = useRef<number[]>([]);
  const frameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    history.current = [...history.current, current].slice(-60);
  }, [current]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const hist = history.current;
      if (hist.length < 2) { frameRef.current = requestAnimationFrame(draw); return; }

      const min = Math.min(...hist, target) - 2;
      const max = Math.max(...hist, target) + 2;
      const range = max - min || 1;

      // Target line
      const ty = H - ((target - min) / range) * H;
      ctx.strokeStyle = '#ffab00';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, ty); ctx.lineTo(W, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Temperature trace
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      hist.forEach((v, i) => {
        const x = (i / (hist.length - 1)) * W;
        const y = H - ((v - min) / range) * H;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      frameRef.current = requestAnimationFrame(draw);
    }
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return <canvas ref={canvasRef} width={120} height={36} style={{ display: 'block' }} />;
}

// ─── Main NMR Hardware Visualization ──────────────────────
export default function HardwareView() {
  const { state, dispatch } = useNMR();

  const powered = state.power !== 'OFF';
  const sampleColor =
    state.sampleState === 'POSITIONED' ? '#00d4ff' :
    state.sampleState === 'LOADING' || state.sampleState === 'POSITIONING' ? '#ffab00' :
    state.sampleState === 'EJECTING' ? '#ff1744' : '#1a3a5c';

  const probeColor = state.probeStatus === 'READY' ? '#00e676' : state.probeStatus === 'WARNING' ? '#ffab00' : '#3a6a8f';
  const rfColor = state.tuneStatus === 'OPTIMAL' ? '#00e676' : state.tuneStatus === 'TUNING' ? '#00d4ff' : '#3a6a8f';

  const canEject = state.sampleState === 'POSITIONED' && state.spinnerStatus === 'STOPPED';
  const canLoad = state.sampleState === 'NONE' || state.sampleState === 'EJECTED';

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ gap: '8px', padding: '8px' }}>

      {/* ── Magnet Cross-Section SVG ─── */}
      <div className="nmr-panel flex-shrink-0">
        <div className="nmr-panel-header">INSTRUMENT VIEW — 500 MHz NMR</div>
        <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr]  justify-center items-start gap-6 p-4 w-full max-w-5xl mx-auto">

          {/* Magnet SVG */}
          <svg width="180" height="320" viewBox="0 0 180 320" style={{ flexShrink: 0 }}>
            {/* Outer dewar */}
            <rect x="15" y="10" width="150" height="300" rx="8" fill="#071525" stroke="#1a3a5c" strokeWidth="1.5" />
            <rect x="20" y="15" width="140" height="290" rx="6" fill="#0a1628" />

            {/* Nitrogen shield */}
            <rect x="28" y="22" width="124" height="276" rx="5" fill="none" stroke="#1a4a6a" strokeWidth="1" strokeDasharray="3,2" />
            <text x="32" y="35" fill="#fff" fontSize="10" fontFamily="JetBrains Mono,monospace">N₂ SHIELD</text>

            {/* Helium vessel */}
            <rect x="40" y="50" width="100" height="230" rx="4" fill="#071a2e" stroke="#00aacc" strokeWidth="1" />
            <text x="50" y="65" fill="#fff" fontSize="10" fontFamily="JetBrains Mono,monospace" opacity="0.9">He VESSEL</text>
            <text x="50" y="76" fill="#fff" fontSize="10" fontFamily="JetBrains Mono,monospace" opacity="0.9">4.2 K</text>

            {/* Superconducting coil */}
            {[100, 114, 128, 142, 156, 170, 184, 198, 212, 226].map((y, i) => (
              <rect key={i} x="52" y={y} width="76" height="8" rx="2"
                fill="none" stroke={powered ? '#00d4ff' : '#1a3a5c'}
                strokeWidth="1.8" opacity={powered ? 0.7 + i * 0.03 : 0.3} />
            ))}
            <text x="90" y="165" textAnchor="middle" fill={powered ? '#ffff' : '#fff'}
              fontSize="10" fontFamily="JetBrains Mono,monospace">
              SC COIL
            </text>

            {/* Field lines animation */}
            {powered && [1,2,3].map(i => (
              <ellipse key={i} cx="90" cy="168" rx={25 + i * 15} ry={8 + i * 3}
                fill="none" stroke="#00d4ff" strokeWidth="0.5" opacity={0.15 + i * 0.05}
                strokeDasharray="4,4" />
            ))}

            {/* Bore tube */}
            <rect x="74" y="10" width="32" height="300" rx="2" fill="#050d1a" stroke="#1a3a5c" strokeWidth="0.5" />

            {/* Probe insert */}
            <rect x="78" y="230" width="24" height="80" rx="2"
              fill="#0b1d35" stroke={probeColor} strokeWidth="1" />
            <text x="90" y="258" textAnchor="middle" fill={probeColor}
              fontSize="10" fontFamily="JetBrains Mono,monospace">PROBE</text>
            {/* RF coil in probe */}
            {[265, 272, 279].map((y, i) => (
              <rect key={i} x="82" y={y} width="16" height="3" rx="1"
                fill="none" stroke={rfColor} strokeWidth="1" />
            ))}

            {/* Sample tube */}
            {state.sampleState !== 'NONE' && state.sampleState !== 'EJECTED' && (
              <>
                <rect
                  x="82" y={10 + (1 - state.sampleYPct / 100) * 240}
                  width="16" height="70" rx="2"
                  fill="#0a1a2e" stroke={sampleColor} strokeWidth="1.5"
                />
                <rect
                  x="84" y={12 + (1 - state.sampleYPct / 100) * 240}
                  width="12" height="66" rx="1"
                  fill={`${sampleColor}22`}
                />
                <text x="90"
                  y={15 + (1 - state.sampleYPct / 100) * 240 + 35}
                  textAnchor="middle" fill={sampleColor}
                  fontSize="5" fontFamily="JetBrains Mono,monospace">SAMPLE</text>
              </>
            )}

            {/* Air flow indicator */}
            {state.airState !== 'OFF' && (
              <>
                {[0, 1, 2].map(i => (
                  <g key={i}>
                    <line x1={68} y1={80 + i * 60} x2={68} y2={100 + i * 60}
                      stroke="#ffab00" strokeWidth="1" opacity="0.6" markerEnd="url(#arr)" />
                  </g>
                ))}
                <text x="62" y="75" fill="#ffab00" fontSize="10" fontFamily="JetBrains Mono,monospace">
                  AIR:{state.airState}
                </text>
              </>
            )}

            {/* Top cap */}
            <rect x="74" y="5" width="32" height="8" rx="2" fill="#0b1d35" stroke="#1a3a5c" strokeWidth="1" />
            <text x="90" y="11" textAnchor="middle" fill="#3a6a8f" fontSize="6" fontFamily="JetBrains Mono,monospace">BORE</text>

            {/* Labels */}
            <text x="22" y="170" fill="#3a6a8f" fontSize="7" fontFamily="JetBrains Mono,monospace">B₀</text>
            <line x1="30" y1="168" x2="46" y2="168" stroke="#3a6a8f" strokeWidth="0.5" markerEnd="url(#arr2)" />

            {/* Cryogen levels */}
            <rect x="152" y="50" width="8" height="230" rx="2" fill="#071a2e" stroke="#1a3a5c" strokeWidth="0.5" />
            <rect x="152" y={50 + 230 * (1 - state.heliumLevel / 100)} width="8"
              height={230 * state.heliumLevel / 100} rx="2" fill="#00aacc" opacity="0.5" />
            <text x="165" y="60" fill="#00aacc" fontSize="6" fontFamily="JetBrains Mono,monospace" transform="rotate(90,165,60)">He {state.heliumLevel}%</text>
          </svg>

          {/* Right panel: hardware status rows */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">

            {/* Magnet Status */}
            <div className="nmr-panel p-2">
              <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">MAGNET</div>
              <HWRow label="FIELD" value={`${state.magnetField.toFixed(4)} T`} status={powered ? 'active' : 'off'} />
              <HWRow label="FREQ 1H" value={`${state.magnetFreq1H.toFixed(3)} MHz`} status={powered ? 'ready' : 'off'} />
              <HWRow label="STABILITY" value={state.magnetStability} status={state.magnetStability === 'STABLE' ? 'ready' : 'warning'} />
              <HWRow label="CRYO TEMP" value={`${state.magnetTemp.toFixed(1)} K`} status="active" />
              <div className="flex justify-center mt-1">
                <FieldViz tesla={state.magnetField} />
              </div>
            </div>

            {/* Cryogen */}
            <div className="nmr-panel p-2">
              <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">CRYOGEN</div>
              <div className="flex items-center justify-between mb-1">
                <span className="nmr-label">He</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                  <div className="nmr-progress flex-1"><div className="nmr-progress-bar" style={{ width: `${state.heliumLevel}%`, background: '#00d4ff' }} /></div>
                </div>
                <span className="nmr-value text-[11px]">{state.heliumLevel.toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="nmr-label">N₂</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                  <div className="nmr-progress flex-1"><div className="nmr-progress-bar" style={{ width: `${state.nitrogenLevel}%`, background: '#00e676' }} /></div>
                </div>
                <span className="nmr-value text-[11px]">{state.nitrogenLevel.toFixed(0)}%</span>
              </div>
            </div>

            {/* Sample + Spinner */}
            <div className="nmr-panel p-2">
              <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">SAMPLE / SPINNER</div>
              <div className="flex items-center justify-between">
                <div>
                  <HWRow label="SAMPLE" value={state.sampleState} status={state.sampleState === 'POSITIONED' ? 'ready' : state.sampleState === 'NONE' ? 'off' : 'warning'} />
                  <HWRow label="AIR" value={`${state.airState} ${state.airFlow.toFixed(1)} L/m`} status={state.airState !== 'OFF' ? 'active' : 'off'} />
                  <HWRow label="SOLVENT" value={state.solvent} status={state.solvent !== 'None' ? 'ready' : 'off'} />
                </div>
                <SpinnerViz rate={state.spinRate} status={state.spinnerStatus} />
              </div>
              <div className="flex gap-1 mt-2">
                {canLoad && powered && (
                  <button className="nmr-btn nmr-btn-green text-[10px] flex-1" onClick={() => dispatch({ type: 'LOAD_SAMPLE' })}>
                    ↓ LOAD
                  </button>
                )}
                {canEject && (
                  <button className="nmr-btn nmr-btn-amber text-[10px] flex-1" onClick={() => dispatch({ type: 'EJECT_SAMPLE' })}>
                    ↑ EJECT
                  </button>
                )}
              </div>
            </div>

            {/* Lock */}
            <div className="nmr-panel p-2">
              <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">LOCK</div>
              <HWRow
                label="STATUS"
                value={state.lockStatus}
                status={state.lockStatus === 'LOCKED' ? 'ready' : state.lockStatus === 'SEARCHING' || state.lockStatus === 'OPTIMIZING' ? 'warning' : state.lockStatus === 'LOST' ? 'error' : 'off'}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="nmr-label">LEVEL</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                  <div className="nmr-progress flex-1">
                    <div className="nmr-progress-bar" style={{
                      width: `${state.lockLevel}%`,
                      background: state.lockLevel > 70 ? '#00e676' : state.lockLevel > 40 ? '#00d4ff' : '#ffab00'
                    }} />
                  </div>
                </div>
                <span className="nmr-value text-[11px]">{state.lockLevel.toFixed(1)}%</span>
              </div>
              <div className="mt-1 rounded overflow-hidden" style={{ background: '#030d1a', border: '1px solid #1a3a5c' }}>
                <LockWaveform level={state.lockLevel} status={state.lockStatus} />
              </div>
            </div>

            {/* Probe + RF */}
            <div className="nmr-panel p-2">
              <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">PROBE / RF</div>
              <HWRow label="PROBE" value={state.probeType.substring(0, 16)} status={state.probeStatus === 'READY' ? 'ready' : 'off'} />
              <HWRow label="OBSERVE" value={state.observeNucleus} status={powered ? 'active' : 'off'} />
              <HWRow label="TUNE" value={state.tuneStatus} status={state.tuneStatus === 'OPTIMAL' ? 'ready' : state.tuneStatus === 'TUNING' ? 'active' : 'off'} />
              <HWRow label="RX GAIN" value={`${state.receiverGain} dB`} status={state.receiverOverflow ? 'error' : 'ready'} />
            </div>

            {/* VT */}
            <div className="nmr-panel p-2">
              <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">VARIABLE TEMPERATURE</div>
              <HWRow label="CURRENT" value={`${state.currentTemp.toFixed(1)} °C`}
                status={state.vtStatus === 'STABLE' ? 'ready' : state.vtStatus === 'HEATING' || state.vtStatus === 'COOLING' ? 'warning' : 'error'} />
              <HWRow label="TARGET" value={`${state.targetTemp.toFixed(1)} °C`} status="off" />
              <HWRow label="STATUS" value={state.vtStatus} status={state.tempStable ? 'ready' : 'warning'} />
              <div className="mt-1 rounded overflow-hidden" style={{ background: '#030d1a', border: '1px solid #1a3a5c' }}>
                <TempGraph current={state.currentTemp} target={state.targetTemp} />
              </div>
            </div>

            {/* Signal path during acquisition */}
            {state.acqStatus === 'ACQUIRING' && (
              <div className="nmr-panel p-2">
                <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">SIGNAL PATH</div>
                <div className="flex flex-col items-center gap-1 font-mono text-[10px]">
                  {[
                    { label: 'RF CONSOLE', color: '#00d4ff' },
                    { label: '↓', color: '#005577' },
                    { label: 'TRANSMITTER', color: '#00d4ff' },
                    { label: '↓', color: '#005577' },
                    { label: 'PROBE → SAMPLE', color: '#00d4ff' },
                    { label: '↓', color: '#005577' },
                    { label: 'RECEIVER', color: '#00e676' },
                    { label: '↓', color: '#005577' },
                    { label: 'ADC → COMPUTER', color: '#00e676' },
                  ].map((item, i) => (
                    <span key={i} style={{ color: item.color }} className={i % 2 === 0 ? 'led-slow' : ''}>{item.label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Shim quality bar ─── */}
      <div className="nmr-panel p-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="nmr-label">SHIM QUALITY</span>
          <span className="nmr-value text-[11px]" style={{
            color: state.shimQuality > 0.85 ? '#00e676' : state.shimQuality > 0.5 ? '#00d4ff' : state.shimQuality > 0.25 ? '#ffab00' : '#ff1744'
          }}>
            {state.shimQuality > 0.85 ? 'EXCELLENT' : state.shimQuality > 0.65 ? 'GOOD' : state.shimQuality > 0.4 ? 'FAIR' : 'POOR'}
            {' '}({(state.shimQuality * 100).toFixed(0)}%)
          </span>
        </div>
        <div className="nmr-progress">
          <div className="nmr-progress-bar" style={{
            width: `${state.shimQuality * 100}%`,
            background: state.shimQuality > 0.85 ? '#00e676' : state.shimQuality > 0.5 ? '#00d4ff' : state.shimQuality > 0.25 ? '#ffab00' : '#ff1744',
          }} />
        </div>
      </div>

      {/* ── Acquisition progress (if active) ─── */}
      {state.acqStatus !== 'IDLE' && (
        <div className="nmr-panel p-2 flex-shrink-0">
          <div className="nmr-panel-header -mx-2 -mt-2 mb-2 px-2">ACQUISITION</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><span className="nmr-label">SCAN</span> <span className="nmr-value">{state.currentScan}/{state.NS}</span></div>
            <div><span className="nmr-label">STATUS</span> <span className="nmr-value">{state.acqStatus}</span></div>
            <div><span className="nmr-label">LOCK</span> <span className="nmr-value">{state.lockLevel.toFixed(1)}%</span></div>
            <div><span className="nmr-label">SPIN</span> <span className="nmr-value">{state.spinRate.toFixed(1)} Hz</span></div>
          </div>
          <div className="nmr-progress mt-2">
            <div className="nmr-progress-bar" style={{ width: `${(state.currentScan / state.NS) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
            }
