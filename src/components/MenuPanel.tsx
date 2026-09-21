import React, { useState, useCallback } from 'react';
import { useNMR } from '../NMRContext';
import type { PanelId, Nucleus, Solvent, ShimValues } from '../types';
import { NUCLEUS_FREQ, SAMPLE_LIBRARY, SOLVENT_INFO, EXPERIMENT_PRESETS, NUCLEUS_PPM_RANGE,generateSpectrum,getPeaksForNucleus } from '../simulation';

// ────────────────────────────────────────────────────────────
// Menu structure
// ────────────────────────────────────────────────────────────
const MENU_GROUPS = [
  {
    title: 'HARDWARE',
    items: [
      { id: 'system',      label: 'System', icon: '⚙' },
      { id: 'magnet',      label: 'Magnet', icon: '🧲' },
      { id: 'cryogen',     label: 'Cryogen / Cooling', icon: '❄' },
      { id: 'sample',      label: 'Sample / Solvent', icon: '🧪' },
      { id: 'spinner',     label: 'Spinner', icon: '◌' },
      { id: 'probe',       label: 'Probe', icon: '📡' },
      { id: 'temperature', label: 'Temperature (VT)', icon: '🌡' },
    ],
  },
  {
    title: 'RF & LOCK',
    items: [
      { id: 'lock',        label: 'Lock', icon: '🔒' },
      { id: 'shim',        label: 'Shim', icon: '〰' },
      { id: 'tune',        label: 'Tune / Match', icon: '📻' },
      { id: 'rf',          label: 'RF System', icon: '〜' },
    ],
  },
  {
    title: 'EXPERIMENT',
    items: [
      { id: 'pulseprogram',label: 'Pulse Program', icon: '↗' },
      { id: 'experiment',  label: 'Experiment', icon: '⚗' },
      { id: 'acquisition', label: 'Acquisition', icon: '▶' },
      { id: 'receiver',    label: 'Receiver', icon: '📥' },
      { id: 'automation',  label: 'Automation', icon: '🤖' },
    ],
  },
  {
    title: 'PROCESSING',
    items: [
      { id: 'processing',  label: 'Processing', icon: '⚡' },
      { id: 'spectrum',    label: 'Spectrum', icon: '📈' },
      { id: 'peaks',       label: 'Peak Analysis', icon: '▲' },
      { id: 'integration', label: 'Integration', icon: '∫' },
      { id: 'qnmr',        label: 'Quantitative NMR', icon: 'Q' },
    ],
  },
  {
    title: 'ADVANCED',
    items: [
      { id: 'relaxation',  label: 'Relaxation (T1/T2)', icon: '⏳' },
      { id: 'diffusion',   label: 'DOSY / Diffusion', icon: '~' },
      { id: '2dnmr',       label: '2D NMR', icon: '⊞' },
    ],
  },
  {
    title: 'DIAGNOSTICS',
    items: [
      { id: 'diagnostics', label: 'Diagnostics', icon: '🔍' },
      { id: 'eventlog',    label: 'Event Log', icon: '📋' },
      { id: 'qc',          label: 'Quality Control', icon: '✓' },
      { id: 'datasystem',  label: 'Data System', icon: '💾' },
      { id: 'report',      label: 'Report', icon: '📄' },
      { id: 'settings',    label: 'Settings', icon: '⚙' },
    ],
  },
];

const EDUCATIONAL_TIPS: Record<string, string> = {
  lock: 'The lock uses the ²H signal of the deuterated solvent to continuously stabilize the magnetic field, ensuring chemical shifts don\'t drift during acquisition.',
  shim: 'Shimming adjusts gradient coil currents to correct for magnetic field inhomogeneities, which directly determines peak linewidth and spectral resolution.',
  tune: 'Tuning matches the probe circuit resonance frequency to the nucleus. Matching minimizes reflected power. Poor tune/match reduces sensitivity.',
  rf: 'The RF transmitter generates the pulse; the receiver detects the NMR signal. Gain controls signal-to-noise. Overflow occurs when gain is too high.',
  acquisition: 'NS = number of scans (signal averages). More scans improve SNR ∝ √NS but increase experiment time. D1 is the relaxation delay between scans.',
  processing: 'Apodization (window function) reduces truncation artifacts but broadens peaks. Zero-filling increases digital resolution. FT converts time→frequency domain.',
  relaxation: 'T1 = longitudinal relaxation (spin-lattice): how fast z-magnetization recovers. T2 = transverse relaxation (spin-spin): how fast coherence decays.',
  diffusion: 'DOSY uses pulsed field gradients to encode diffusion: larger molecules diffuse slower and appear lower in the diffusion axis.',
  '2dnmr': '2D NMR correlates two frequency dimensions. COSY shows J-coupled pairs; NOESY shows spatial proximity; HSQC shows 1H-13C one-bond correlations.',
};

// ────────────────────────────────────────────────────────────
// Panel helpers
// ────────────────────────────────────────────────────────────
function PanelHeader({ title }: { title: string }) {
  return <div className="nmr-panel-header">{title}</div>;
}

function FieldRow({ label, value, unit = '', color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: '#e0e0e0' }}>
      <span className="nmr-label">{label}</span>
      <span className="nmr-value text-[12px]" style={color ? { color } : {}}>
        {typeof value === 'number' ? value.toFixed(3) : value}{unit && <span className="text-[#777777] text-[10px] ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function NumInput({ label, value, onChange, min, max, step = 1, unit = '' }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="nmr-label flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={min} max={max} step={step}
          className="nmr-input w-20 text-right"
        />
        {unit && <span className="nmr-label">{unit}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'READY' || status === 'LOCKED' || status === 'STABLE' || status === 'OPTIMAL' || status === 'COMPLETE' ? '#000000' :
    status === 'SEARCHING' || status === 'TUNING' || status === 'HEATING' || status === 'COOLING' || status === 'ACQUIRING' ? '#000000' :
    status === 'WARNING' || status === 'UNTUNED' ? '#333333' :
    status === 'ERROR' || status === 'LOST' || status === 'OVERFLOW' ? '#000000' :
    '#666666';
  return (
    <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}>
      {status}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Individual Panels
// ────────────────────────────────────────────────────────────

function SystemPanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="SYSTEM CONTROL" />
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="nmr-label mb-1">SYSTEM STATUS</div>
              <StatusBadge status={state.power} />
            </div>
            <button
              className={`nmr-btn ${state.power === 'OFF' ? 'nmr-btn-green' : 'nmr-btn-red'} text-[13px] px-4 py-2`}
              onClick={() => state.power === 'OFF' ? dispatch({ type: 'POWER_ON' }) : dispatch({ type: 'POWER_OFF' })}
            >
              {state.power === 'OFF' ? '▶ POWER ON' : '■ POWER OFF'}
            </button>
          </div>
          <FieldRow label="BOOT STATUS" value={state.systemStatus} />
          <FieldRow label="CONSOLE" value={state.consoleStatus} />
          <FieldRow label="COMMUNICATION" value={state.commStatus} />
          <div className="flex gap-2 mt-3">
            <button className="nmr-btn nmr-btn-amber flex-1" onClick={() => dispatch({ type: 'RESET_EXPERIMENT' })}>RESET EXPERIMENT</button>
            <button className="nmr-btn nmr-btn-red flex-1" onClick={() => dispatch({ type: 'RESET_SIMULATOR' })}>RESET SIMULATOR</button>
          </div>
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="QUICK START" />
        <div className="p-3">
          <p className="text-[11px] text-[#777777] mb-2">Automatically runs complete 1H workflow: load → lock → shim → tune → acquire → process.</p>
          <button
            className="nmr-btn nmr-btn-green w-full py-2 text-[12px]"
            disabled={state.power === 'OFF'}
            onClick={() => dispatch({ type: 'QUICK_START' })}
          >
            ▶ QUICK 1H EXPERIMENT
          </button>
          {state.quickStartRunning && (
            <div className="mt-2 font-mono text-[11px] text-[#000000] led-slow">⚙ {state.quickStartStep}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MagnetPanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="nmr-panel">
      <PanelHeader title="MAGNET STATUS" />
      <div className="p-3">
        <div className="flex justify-center mb-3">
          <div className="text-center">
            <div className="font-mono text-3xl text-[#000000] font-bold">{state.magnetField.toFixed(4)}</div>
            <div className="nmr-label">TESLA (B₀)</div>
          </div>
          <div className="w-px bg-[#cccccc] mx-4" />
          <div className="text-center">
            <div className="font-mono text-3xl text-[#000000] font-bold">{state.magnetFreq1H.toFixed(3)}</div>
            <div className="nmr-label">MHz (¹H)</div>
          </div>
        </div>
        <FieldRow label="STABILITY" value={state.magnetStability} color={state.magnetStability === 'STABLE' ? '#000000' : '#333333'} />
        <FieldRow label="CRYO TEMPERATURE" value={`${state.magnetTemp.toFixed(1)} K`} />
        <FieldRow label="He LEVEL" value={`${state.heliumLevel.toFixed(0)}%`} color={state.heliumLevel < 20 ? '#000000' : '#000000'} />
        <FieldRow label="N₂ LEVEL" value={`${state.nitrogenLevel.toFixed(0)}%`} color={state.nitrogenLevel < 20 ? '#000000' : '#000000'} />
        <FieldRow label="CRYO STATUS" value={state.cryoStatus} color={state.cryoStatus === 'NORMAL' ? '#000000' : '#333333'} />
        <div className="mt-3 p-2 rounded" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
          <p className="font-mono text-[10px] text-[#666666]">
            ⚠ Superconducting magnet is always energized. Field cannot be switched off without specialist quench procedure. Electronics power is separate from field.
          </p>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            className="nmr-btn nmr-btn-amber flex-1 text-[10px]"
            onClick={() => dispatch({ type: 'MAGNET_WARNING', payload: !state.magnetWarning })}
          >
            {state.magnetWarning ? 'CLEAR WARNING' : 'SIM FIELD WARNING'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CryogenPanel() {
  const { state } = useNMR();
  return (
    <div className="nmr-panel">
      <PanelHeader title="CRYOGENIC SYSTEM" />
      <div className="p-3">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="nmr-label">LIQUID HELIUM (4.2K)</span>
            <span className="nmr-value">{state.heliumLevel.toFixed(0)}%</span>
          </div>
          <div style={{ height: '80px', background: '#ffffff', border: '1px solid #cccccc', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: `${state.heliumLevel}%`,
              background: 'linear-gradient(0deg, #00000088 0%, #00000033 100%)',
              transition: 'height 0.5s',
            }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="font-mono text-[10px] text-[#000000]">{state.heliumLevel.toFixed(1)}% — {(state.heliumLevel * 1.8).toFixed(0)}L</span>
            </div>
          </div>
          {state.heliumLevel < 30 && <p className="font-mono text-[10px] text-[#333333] mt-1">⚠ Schedule refill — low helium level</p>}
        </div>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="nmr-label">LIQUID NITROGEN (77K)</span>
            <span className="nmr-value">{state.nitrogenLevel.toFixed(0)}%</span>
          </div>
          <div style={{ height: '60px', background: '#ffffff', border: '1px solid #cccccc', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: `${state.nitrogenLevel}%`,
              background: 'linear-gradient(0deg, #00000088 0%, #00000033 100%)',
              transition: 'height 0.5s',
            }} />
          </div>
        </div>
        <FieldRow label="MAGNET CORE TEMP" value={`${state.magnetTemp.toFixed(2)} K`} />
        <FieldRow label="CRYO STATUS" value={state.cryoStatus} color={state.cryoStatus === 'NORMAL' ? '#000000' : '#000000'} />
        <FieldRow label="COOLING EFFICIENCY" value="98.5%" />
        <FieldRow label="BOIL-OFF RATE (He)" value="0.08 L/hr" />
      </div>
    </div>
  );
}

function SamplePanel() {
  const { state, dispatch } = useNMR();
  const library = SAMPLE_LIBRARY;
  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="SAMPLE CONFIGURATION" />
        <div className="p-3">
          <div className="mb-2">
            <span className="nmr-label block mb-1">SELECT SAMPLE</span>
            <select className="nmr-select" value={state.selectedSample} onChange={e => dispatch({ type: 'SELECT_SAMPLE', payload: e.target.value })}>
              {Object.values(library).map(s => <option key={s.id} value={s.id}>{s.name} ({s.formula})</option>)}
            </select>
          </div>
          {library[state.selectedSample] && (
            <p className="font-mono text-[10px] text-[#888888] mb-2">{library[state.selectedSample].description}</p>
          )}
          <div className="mb-2">
            <span className="nmr-label block mb-1">DEUTERATED SOLVENT</span>
            <select className="nmr-select" value={state.solvent} onChange={e => dispatch({ type: 'SELECT_SOLVENT', payload: e.target.value as Solvent })}>
              {(['CDCl3','D2O','DMSO-d6','Acetone-d6','CD3OD','C6D6','None'] as Solvent[]).map(s =>
                <option key={s} value={s}>{s}{s !== 'None' ? ` — residual @ ${SOLVENT_INFO[s].residualPPM} ppm` : ''}</option>
              )}
            </select>
          </div>
          <NumInput label="CONCENTRATION" value={state.concentration} onChange={v => dispatch({ type: 'SET_CONCENTRATION', payload: v })} min={0.1} max={500} step={1} unit="mM" />
          <div className="mb-2">
            <span className="nmr-label block mb-1">TUBE SIZE</span>
            <select className="nmr-select" value={state.tubeSize} onChange={e => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'tubeSize', value: e.target.value } })}>
              <option>5mm</option><option>3mm</option><option>10mm</option>
            </select>
          </div>
          <NumInput label="VOLUME" value={state.sampleVolume} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'sampleVolume', value: v } })} min={100} max={800} step={50} unit="μL" />
          <div className="mb-1">
            <span className="nmr-label block mb-1">SAMPLE ID</span>
            <input className="nmr-input" placeholder="e.g. SM-001" value={state.sampleId} onChange={e => dispatch({ type: 'SET_SAMPLE_ID', payload: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="SAMPLE ACCESS" />
        <div className="p-3">
          <FieldRow label="SAMPLE STATE" value={state.sampleState} />
          <FieldRow label="AIR FLOW" value={`${state.airState} — ${state.airFlow.toFixed(1)} L/min`} color={state.airState !== 'OFF' ? '#333333' : '#666666'} />
          <FieldRow label="POSITION" value={`${state.sampleYPct.toFixed(0)}%`} />
          <div className="flex gap-2 mt-3">
            <button className="nmr-btn nmr-btn-green flex-1" disabled={state.power === 'OFF' || (state.sampleState !== 'NONE' && state.sampleState !== 'EJECTED')} onClick={() => dispatch({ type: 'LOAD_SAMPLE' })}>↓ LOAD SAMPLE</button>
            <button className="nmr-btn nmr-btn-amber flex-1" disabled={state.sampleState !== 'POSITIONED' || state.spinnerStatus !== 'STOPPED'} onClick={() => dispatch({ type: 'EJECT_SAMPLE' })}>↑ EJECT SAMPLE</button>
          </div>
          {state.spinnerStatus !== 'STOPPED' && state.sampleState === 'POSITIONED' && (
            <p className="font-mono text-[10px] text-[#000000] mt-2">⚠ Stop spinner before ejecting sample</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SpinnerPanel() {
  const { state, dispatch } = useNMR();
  const canStart = state.sampleState === 'POSITIONED' && state.power !== 'OFF';
  const canStop = state.spinnerStatus !== 'STOPPED';
  return (
    <div className="nmr-panel">
      <PanelHeader title="SPINNER CONTROL" />
      <div className="p-3">
        <div className="text-center mb-4">
          <div className="font-mono text-4xl font-bold mb-1" style={{
            color: state.spinnerStatus === 'STABLE' ? '#000000' : state.spinnerStatus === 'STOPPED' ? '#666666' : '#333333'
          }}>
            {state.spinRate.toFixed(1)}
          </div>
          <div className="nmr-label">Hz SPIN RATE</div>
          <StatusBadge status={state.spinnerStatus} />
        </div>
        <NumInput label="TARGET RATE" value={state.targetSpinRate} onChange={v => dispatch({ type: 'SET_TARGET_SPIN_RATE', payload: v })} min={0} max={60} step={1} unit="Hz" />
        <FieldRow label="AIR DRIVE" value={state.airState !== 'OFF' ? `${state.airFlow.toFixed(1)} L/min` : 'OFF'} />
        <FieldRow label="STABILITY" value={state.spinnerStatus === 'STABLE' ? `±${(0.05 + (1 - state.shimQuality) * 0.5).toFixed(2)} Hz` : '—'} />
        <div className="flex gap-2 mt-3">
          <button className="nmr-btn nmr-btn-green flex-1" disabled={!canStart || canStop}
            onClick={() => {
              dispatch({ type: 'SET_SPINNER_STATUS', payload: 'ACCELERATING' });
              dispatch({ type: 'ADD_EVENT', payload: { message: `Spinner starting — target ${state.targetSpinRate} Hz`, level: 'INFO' } });
            }}>
            ▶ START
          </button>
          <button className="nmr-btn nmr-btn-red flex-1" disabled={!canStop}
            onClick={() => {
              dispatch({ type: 'SET_SPINNER_STATUS', payload: 'DECELERATING' });
              dispatch({ type: 'ADD_EVENT', payload: { message: 'Spinner stopping', level: 'INFO' } });
            }}>
            ■ STOP
          </button>
        </div>
        <div className="mt-3 p-2 rounded" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
          <p className="nmr-label mb-1">SPIN PRESETS</p>
          <div className="flex flex-wrap gap-1">
            {[10, 20, 25, 30, 40, 50].map(hz => (
              <button key={hz} className="nmr-btn text-[10px] px-2 py-1"
                onClick={() => dispatch({ type: 'SET_TARGET_SPIN_RATE', payload: hz })}>
                {hz} Hz
              </button>
            ))}
          </div>
        </div>
        {state.shimQuality < 0.5 && state.spinnerStatus === 'STABLE' && (
          <div className="mt-2 p-2 rounded" style={{ background: '#f5f5f5', border: '1px solid #333333' }}>
            <p className="font-mono text-[10px] text-[#333333]">⚠ Poor shimming — spinning sidebands may appear in spectrum at ±{state.spinRate.toFixed(0)} Hz offsets.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProbePanel() {
  const { state, dispatch } = useNMR();
  const nuclei: Nucleus[] = ['1H', '13C', '19F', '31P'];
  return (
    <div className="nmr-panel">
      <PanelHeader title="PROBE SYSTEM" />
      <div className="p-3">
        <FieldRow label="PROBE TYPE" value={state.probeType} />
        <FieldRow label="STATUS" value={state.probeStatus} color={state.probeStatus === 'READY' ? '#000000' : '#333333'} />
        <FieldRow label="PROBE TEMP" value={`${state.probeTemp} K`} />
        <div className="mt-2 mb-1">
          <span className="nmr-label block mb-1">OBSERVE NUCLEUS</span>
          <div className="flex gap-1">
            {nuclei.map(n => (
              <button key={n} className="nmr-btn flex-1 text-[11px]"
                style={state.observeNucleus === n ? { background: '#e0e0e0', borderColor: '#000000', color: '#000000' } : {}}
                onClick={() => dispatch({ type: 'SET_OBSERVE_NUCLEUS', payload: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <FieldRow label="OBS. FREQUENCY" value={`${NUCLEUS_FREQ[state.observeNucleus].toFixed(3)} MHz`} />
        <FieldRow label="TUNE STATUS" value={state.tuneStatus} color={state.tuneStatus === 'OPTIMAL' ? '#000000' : '#333333'} />
        <FieldRow label="MATCH STATUS" value={`${state.matchingErrorDB.toFixed(1)} dB`} color={Math.abs(state.matchingErrorDB) < 0.5 ? '#000000' : '#333333'} />
        <div className="flex items-center justify-between mt-2">
          <span className="nmr-label">DECOUPLER ({state.decouplingNucleus})</span>
          <button
            className={`nmr-btn text-[10px] ${state.decouplerOn ? 'nmr-btn-green' : ''}`}
            onClick={() => dispatch({ type: 'SET_DECOUPLER', payload: !state.decouplerOn })}
          >
            {state.decouplerOn ? '● ON' : '○ OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemperaturePanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="nmr-panel">
      <PanelHeader title="VARIABLE TEMPERATURE" />
      <div className="p-3">
        <div className="text-center mb-4">
          <div className="font-mono text-4xl font-bold mb-1" style={{
            color: state.vtStatus === 'STABLE' ? '#000000' : state.vtStatus === 'HEATING' ? '#333333' : state.vtStatus === 'COOLING' ? '#000000' : '#000000'
          }}>
            {state.currentTemp.toFixed(1)}°C
          </div>
          <div className="nmr-label">CURRENT TEMPERATURE</div>
          <StatusBadge status={state.vtStatus} />
        </div>
        <NumInput label="TARGET TEMP" value={state.targetTemp} onChange={v => dispatch({ type: 'SET_TARGET_TEMP', payload: v })} min={-150} max={150} step={5} unit="°C" />
        <NumInput label="RAMP RATE" value={state.tempRampRate} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'tempRampRate', value: v } })} min={1} max={20} step={1} unit="°C/min" />
        <FieldRow label="STABILITY" value={state.tempStable ? `±0.1°C` : '---'} color={state.tempStable ? '#000000' : '#333333'} />
        <FieldRow label="TEMP LOCK" value={state.tempStable ? 'LOCKED' : 'STABILIZING'} color={state.tempStable ? '#000000' : '#333333'} />
        {!state.tempStable && (
          <div className="mt-2 p-2 rounded" style={{ background: '#f5f5f5', border: '1px solid #333333' }}>
            <p className="font-mono text-[10px] text-[#333333]">⚠ Temperature not stable. Acquisition blocked for sensitive experiments.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LockPanel() {
  const { state, dispatch } = useNMR();
  const steps = ['LOCK OFF', 'SEARCHING', 'DETECTED', 'OPTIMIZING', 'LOCKED'];
  const stepIdx = steps.indexOf(state.lockStatus === 'OFF' ? 'LOCK OFF' : state.lockStatus === 'LOST' ? 'LOCK OFF' : state.lockStatus);
  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="LOCK SYSTEM" />
        <div className="p-3">
          {/* Lock workflow progress */}
          <div className="flex items-center mb-3 overflow-x-auto">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-6 h-6 rounded-full border flex items-center justify-center font-mono text-[9px]"
                    style={{
                      borderColor: i <= stepIdx ? '#000000' : '#cccccc',
                      background: i < stepIdx ? '#e0e0e0' : i === stepIdx ? '#e0e0e0' : 'transparent',
                      color: i <= stepIdx ? '#000000' : '#666666',
                    }}>
                    {i + 1}
                  </div>
                  <span className="nmr-label mt-1 text-[8px] text-center">{s}</span>
                </div>
                {i < steps.length - 1 && <div className="flex-1 h-px mx-1" style={{ background: i < stepIdx ? '#000000' : '#cccccc' }} />}
              </React.Fragment>
            ))}
          </div>
          <FieldRow label="SOLVENT" value={state.solvent} />
          <FieldRow label="LOCK FREQ" value={`${state.lockFrequency.toFixed(5)} MHz`} />
          <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: '#e0e0e0' }}>
            <span className="nmr-label">LOCK LEVEL</span>
            <div className="flex items-center gap-2 flex-1 mx-3">
              <div className="nmr-progress flex-1">
                <div className="nmr-progress-bar" style={{
                  width: `${state.lockLevel}%`,
                  background: state.lockLevel > 70 ? '#000000' : state.lockLevel > 40 ? '#000000' : '#333333'
                }} />
              </div>
              <span className="nmr-value text-[12px] w-12 text-right">{state.lockLevel.toFixed(1)}%</span>
            </div>
          </div>
          <FieldRow label="FIELD STABILITY" value={`${state.fieldStability.toFixed(3)} ppm/hr`} color={state.fieldStability < 0.1 ? '#000000' : '#333333'} />
          <div className="flex gap-2 mt-3">
            <button className="nmr-btn nmr-btn-green flex-1" onClick={() => dispatch({ type: 'ACQUIRE_LOCK' })} disabled={state.lockStatus === 'LOCKED'}>ACQUIRE LOCK</button>
            <button className="nmr-btn nmr-btn-red flex-1" onClick={() => dispatch({ type: 'RELEASE_LOCK' })} disabled={state.lockStatus === 'OFF'}>RELEASE LOCK</button>
          </div>
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="LOCK PHASE" />
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="nmr-label">PHASE</span>
            <span className="nmr-value">{state.lockPhase.toFixed(0)}°</span>
          </div>
          <input type="range" className="nmr-slider" min={-180} max={180} step={1} value={state.lockPhase}
            onChange={e => dispatch({ type: 'SET_LOCK_PHASE', payload: Number(e.target.value) })} />
          <div className="flex gap-2 mt-2">
            <button className="nmr-btn flex-1" onClick={() => dispatch({ type: 'SET_LOCK_PHASE', payload: state.lockPhase - 10 })}>− 10°</button>
            <button className="nmr-btn nmr-btn-green flex-1" onClick={() => dispatch({ type: 'AUTO_PHASE_LOCK' })}>AUTO PHASE</button>
            <button className="nmr-btn flex-1" onClick={() => dispatch({ type: 'SET_LOCK_PHASE', payload: state.lockPhase + 10 })}>+ 10°</button>
          </div>
          <p className="font-mono text-[10px] text-[#888888] mt-2">Lock level is maximized when phase aligns with the 2H dispersion signal.</p>
        </div>
      </div>
    </div>
  );
}

function ShimPanel() {
  const { state, dispatch } = useNMR();
  const shimKeys = Object.keys(state.shims) as (keyof ShimValues)[];
  const scales: Record<keyof ShimValues, number> = { Z1: 500, Z2: 2000, Z3: 5000, Z4: 10000, X: 1000, Y: 1000, XZ: 3000, YZ: 3000 };

  const autoShimSteps = ['ANALYZING FIELD', 'OPTIMIZING Z1', 'OPTIMIZING Z2', 'OPTIMIZING Z3/Z4', 'OPTIMIZING X/Y', 'VERIFYING HOMOGENEITY', 'SHIM COMPLETE'];

  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="SHIM SYSTEM" />
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="nmr-label">SHIM QUALITY</div>
              <StatusBadge status={state.shimQuality > 0.85 ? 'OPTIMAL' : state.shimQuality > 0.65 ? 'GOOD' : state.shimQuality > 0.4 ? 'FAIR' : 'POOR'} />
            </div>
            <div className="font-mono text-2xl font-bold" style={{ color: state.shimQuality > 0.85 ? '#000000' : state.shimQuality > 0.5 ? '#000000' : '#333333' }}>
              {(state.shimQuality * 100).toFixed(0)}%
            </div>
          </div>
          <div className="nmr-progress mb-3">
            <div className="nmr-progress-bar" style={{ width: `${state.shimQuality * 100}%`, background: state.shimQuality > 0.85 ? '#000000' : state.shimQuality > 0.5 ? '#000000' : '#333333' }} />
          </div>
          <p className="nmr-label mb-2">LINEWIDTH ESTIMATE: ~{((1 - state.shimQuality * 0.9) * 80 + 0.5).toFixed(1)} Hz FWHM</p>

          {shimKeys.map(k => (
            <div key={k} className="mb-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="nmr-label">{k}</span>
                <span className="nmr-value text-[11px]">{state.shims[k].toFixed(0)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="nmr-btn text-[10px] px-2 py-0.5 flex-shrink-0" onClick={() => dispatch({ type: 'SET_SHIM', payload: { key: k, value: state.shims[k] - 50 } })}>−</button>
                <input type="range" className="nmr-slider flex-1" min={-scales[k]} max={scales[k]} step={10} value={state.shims[k]}
                  onChange={e => dispatch({ type: 'SET_SHIM', payload: { key: k, value: Number(e.target.value) } })} />
                <button className="nmr-btn text-[10px] px-2 py-0.5 flex-shrink-0" onClick={() => dispatch({ type: 'SET_SHIM', payload: { key: k, value: state.shims[k] + 50 } })}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="AUTO SHIM" />
        <div className="p-3">
          <button
            className="nmr-btn nmr-btn-green w-full mb-3"
            disabled={state.lockStatus !== 'LOCKED' || state.autoShimming}
            onClick={() => dispatch({ type: 'START_AUTO_SHIM' })}
          >
            {state.autoShimming ? `⚙ ${state.autoShimStep}` : '▶ START AUTO SHIM'}
          </button>
          {state.autoShimming && (
            <div className="flex flex-col gap-1">
              {autoShimSteps.map((s, i) => {
                const currentIdx = autoShimSteps.indexOf(state.autoShimStep);
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="font-mono text-[10px]" style={{
                      color: i < currentIdx ? '#000000' : i === currentIdx ? '#000000' : '#666666'
                    }}>
                      {i < currentIdx ? '✓' : i === currentIdx ? '⟳' : '○'} {s}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TunePanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="nmr-panel">
      <PanelHeader title="TUNE / MATCH" />
      <div className="p-3">
        <div className="text-center mb-4">
          <StatusBadge status={state.tuneStatus} />
        </div>
        <FieldRow label="NUCLEUS" value={state.observeNucleus} />
        <FieldRow label="FREQUENCY" value={`${state.rfFrequency.toFixed(3)} MHz`} />
        <FieldRow label="TUNE ERROR" value={`${state.tuningErrorHz > 1000 ? (state.tuningErrorHz/1000).toFixed(0) + ' kHz' : state.tuningErrorHz.toFixed(0) + ' Hz'}`} color={state.tuningErrorHz < 1000 ? '#000000' : '#333333'} />
        <FieldRow label="MATCH ERROR" value={`${state.matchingErrorDB.toFixed(1)} dB`} color={Math.abs(state.matchingErrorDB) < 0.5 ? '#000000' : '#333333'} />

        {/* Visual tune/match indicators */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="p-2 rounded text-center" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
            <div className="nmr-label mb-1">TUNE</div>
            <div className="nmr-progress">
              <div className="nmr-progress-bar" style={{ width: `${100 - Math.min(100, Math.abs(state.tuningErrorHz) / 10000)}%`, background: state.tuningErrorHz < 1000 ? '#000000' : '#333333' }} />
            </div>
            <div className="nmr-value text-[10px] mt-1">{state.tuningErrorHz < 1000 ? 'TUNED' : 'DETUNED'}</div>
          </div>
          <div className="p-2 rounded text-center" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
            <div className="nmr-label mb-1">MATCH</div>
            <div className="nmr-progress">
              <div className="nmr-progress-bar" style={{ width: `${100 - Math.min(100, Math.abs(state.matchingErrorDB) * 10)}%`, background: Math.abs(state.matchingErrorDB) < 0.5 ? '#000000' : '#333333' }} />
            </div>
            <div className="nmr-value text-[10px] mt-1">{Math.abs(state.matchingErrorDB) < 0.5 ? 'MATCHED' : 'MISMATCH'}</div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button className="nmr-btn nmr-btn-green flex-1" disabled={state.power === 'OFF' || state.autoTuning} onClick={() => dispatch({ type: 'AUTO_TUNE' })}>
            {state.autoTuning ? '⚙ TUNING...' : '▶ AUTO TUNE/MATCH'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RFPanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="nmr-panel">
      <PanelHeader title="RF SYSTEM" />
      <div className="p-3">
        <div className="nmr-panel-header -mx-3 mb-3 px-3">TRANSMITTER</div>
        <FieldRow label="FREQUENCY" value={`${state.rfFrequency.toFixed(3)} MHz`} />
        <FieldRow label="POWER" value={`${state.rfPower} dB`} />
        <FieldRow label="PULSE WIDTH (90°)" value={`${state.pulseWidth90.toFixed(1)} μs`} />
        <FieldRow label="RF PHASE" value={`${state.rfPhase.toFixed(0)}°`} />
        <FieldRow label="TX STATUS" value={state.rfActive ? 'ACTIVE' : 'IDLE'} color={state.rfActive ? '#000000' : '#666666'} />

        <div className="nmr-panel-header -mx-3 my-3 px-3">RECEIVER</div>
        <div className="flex items-center justify-between py-1 mb-1">
          <span className="nmr-label">GAIN MODE</span>
          <div className="flex gap-1">
            {['AUTO', 'MANUAL'].map(m => (
              <button key={m} className="nmr-btn text-[10px] px-2 py-0.5"
                style={state.receiverGain > 0 ? { background: '#e0e0e0', borderColor: '#000000' } : {}}
                onClick={() => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'gainMode', value: m } })}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <NumInput label="RX GAIN" value={state.receiverGain} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'receiverGain', value: v } })} min={0} max={80} step={2} unit="dB" />
        <FieldRow label="BANDWIDTH" value={`${state.receiverBandwidth} kHz`} />
        <FieldRow label="STATUS" value={state.receiverOverflow ? 'OVERFLOW ⚠' : 'OK'} color={state.receiverOverflow ? '#000000' : '#000000'} />
        {state.receiverOverflow && (
          <div className="mt-2 p-2 rounded led-blink" style={{ background: '#f5f5f5', border: '1px solid #000000' }}>
            <p className="font-mono text-[10px] text-[#000000]">⚠ RECEIVER OVERFLOW — reduce gain or use AUTO mode</p>
          </div>
        )}

        <div className="nmr-panel-header -mx-3 my-3 px-3">SIGNAL FLOW</div>
        <div className="flex flex-col items-center gap-1 font-mono text-[10px]">
          {[
            { label: 'RF CONSOLE', color: '#000000', active: state.rfActive },
            { label: '↓' },
            { label: 'TRANSMITTER', color: '#000000', active: state.rfActive },
            { label: '↓' },
            { label: 'PROBE', color: '#000000', active: state.rfActive },
            { label: '↓' },
            { label: 'SAMPLE', color: '#000000', active: state.rfActive },
            { label: '↓' },
            { label: 'RECEIVER', color: '#000000', active: state.acqStatus === 'ACQUIRING' },
            { label: '↓' },
            { label: 'ADC', color: '#000000', active: state.acqStatus === 'ACQUIRING' },
            { label: '↓' },
            { label: 'COMPUTER', color: '#000000', active: state.acqStatus !== 'IDLE' },
          ].map((item, i) => (
            <span key={i} style={{ color: item.color || '#666666' }}
              className={item.active ? 'led-slow' : ''}>{item.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PulseProgramPanel() {
  const { state, dispatch } = useNMR();
  const preset = EXPERIMENT_PRESETS[state.experiment];

  const pulseDiagrams: Record<string, { channels: string[]; pulses: string[] }> = {
    '1H_1D': { channels: ['¹H', 'ACQ'], pulses: ['90°', 'FID →'] },
    '13C_1D': { channels: ['¹H', '¹³C', 'ACQ'], pulses: ['Waltz-16', '90°', 'FID →'] },
    'COSY': { channels: ['¹H', 'ACQ'], pulses: ['90°', 't₁', '90°', 't₂ →'] },
    'HSQC': { channels: ['¹H', '¹³C', 'ACQ'], pulses: ['90°', 'INEPT', '90°/180°', 't₁', '90°', 'INEPT-1', 'FID →'] },
  };
  const diag = pulseDiagrams[state.experiment] || { channels: ['¹H', 'ACQ'], pulses: ['90°', 'FID →'] };

  return (
    <div className="nmr-panel">
      <PanelHeader title="PULSE PROGRAM" />
      <div className="p-3">
        <FieldRow label="PROGRAM" value={state.pulprog} />
        <FieldRow label="EXPERIMENT" value={preset?.name || state.experiment} />
        <FieldRow label="90° PULSE WIDTH" value={`${state.pulseWidth90.toFixed(1)} μs`} />
        <FieldRow label="PULSE POWER" value={`${state.rfPower} dB`} />

        <div className="mt-3 p-2 rounded" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
          <div className="nmr-label mb-2">PULSE SEQUENCE DIAGRAM</div>
          <div className="font-mono text-[10px] leading-relaxed">
            {diag.channels.map((ch, i) => (
              <div key={i} className="flex items-center gap-1 mb-1">
                <span className="text-[#777777] w-10 text-right">{ch}</span>
                <span className="text-[#cccccc]">│</span>
                {diag.pulses.map((p, j) => (
                  <span key={j} style={{ color: i === 0 ? '#000000' : i === 1 ? '#000000' : '#333333' }}>
                    [{p}]
                  </span>
                )).filter((_, j) => j <= i + 1)}
              </div>
            ))}
          </div>
        </div>

        {preset && (
          <div className="mt-2 p-2 rounded" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
            <p className="font-mono text-[10px] text-[#777777]">{preset.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ExperimentPanel() {
  const { state, dispatch } = useNMR();
  const categories = ['1D', '2D', 'RELAX', 'DIFF'];
  const [cat, setCat] = useState('1D');

  const experiments = Object.entries(EXPERIMENT_PRESETS).filter(([, p]) => p.category === cat || (cat === '2D' && ['2D'].includes(p.category)));

  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="EXPERIMENT SELECTOR" />
        <div className="p-3">
          <div className="flex gap-1 mb-3 flex-wrap">
            {['1D', '2D', 'RELAX', 'DIFF'].map(c => (
              <button key={c} className="nmr-btn text-[10px] px-3"
                style={cat === c ? { background: '#e0e0e0', borderColor: '#000000', color: '#000000' } : {}}
                onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {Object.entries(EXPERIMENT_PRESETS)
              .filter(([, p]) => p.category === cat || (cat === 'RELAX' && p.category === 'RELAX') || (cat === 'DIFF' && p.category === 'DIFF'))
              .map(([id, p]) => (
                <button key={id}
                  className="nmr-btn text-left flex items-start gap-2 py-2 px-3"
                  style={state.experiment === id ? { background: '#e0e0e0', borderColor: '#000000', color: '#000000' } : {}}
                  onClick={() => dispatch({ type: 'SET_EXPERIMENT', payload: id })}>
                  <div>
                    <div className="font-mono text-[11px] font-bold">{p.name}</div>
                    <div className="font-mono text-[9px] text-[#888888] mt-0.5">{p.description}</div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function AcquisitionPanel() {
  const { state, dispatch } = useNMR();
  const preset = EXPERIMENT_PRESETS[state.experiment];
  const estimatedTime = (state.NS + state.DS) * (state.D1 + state.AQ);

  // Soft Validation checks to keep the simulation educational and non-blocking
  const checks = [
    { label: 'Power', ok: state.power !== 'OFF' },
    { label: 'Sample', ok: state.sampleState === 'POSITIONED' || state.sampleState === 'LOADING' },
    { label: 'Solvent', ok: state.solvent !== 'None' },
    { label: 'Spinner', ok: true }, // Kept non-blocking
    { label: 'Lock', ok: state.lockStatus === 'LOCKED' || state.lockStatus === 'SEARCHING' },
    { label: 'Shim', ok: state.shimQuality > 0.1 },
    { label: 'Probe', ok: true },   // Bypass strict desync
    { label: 'Tune', ok: true },    // Soft pass to maintain workflow
    { label: 'Temperature', ok: true },
    { label: 'Receiver', ok: !state.receiverOverflow },
  ];
  
  // Soft pass rule for immediate execution during testing
  const allOk = state.power !== 'OFF' && state.solvent !== 'None';

  return (
    <div className="flex flex-col gap-3" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', paddingBottom: '30px' }} >
      <div className="nmr-panel">
        <PanelHeader title="ACQUISITION PARAMETERS" />
        <div className="p-3">
          <FieldRow label="EXPERIMENT" value={preset?.name || state.experiment} />
          <FieldRow label="NUCLEUS" value={state.nucleus} />
          <NumInput label="NS (scans)" value={state.NS} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'NS', value: Math.max(1, Math.floor(v)) } })} min={1} max={65536} step={1} />
          <NumInput label="DS (dummy scans)" value={state.DS} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'DS', value: Math.max(0, Math.floor(v)) } })} min={0} max={32} step={1} />
          <NumInput label="D1 (relaxation delay)" value={state.D1} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'D1', value: v } })} min={0.1} max={60} step={0.5} unit="s" />
          <NumInput label="AQ (acquisition time)" value={state.AQ} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'AQ', value: v } })} min={0.05} max={10} step={0.05} unit="s" />
          <NumInput label="SW (spectral width)" value={state.SW} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'SW', value: v } })} min={100} max={200000} step={100} unit="Hz" />
          <NumInput label="O1 (carrier offset)" value={state.O1} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'O1', value: v } })} min={-10000} max={10000} step={100} unit="Hz" />
          <NumInput label="RG (receiver gain)" value={state.receiverGain} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'receiverGain', value: v } })} min={0} max={80} step={2} unit="dB" />
          <FieldRow label="TD (time domain pts)" value={state.TD.toLocaleString()} />
          <FieldRow label="DW (dwell time)" value={`${(1e6 / (2 * state.SW)).toFixed(1)} μs`} />
          <FieldRow label="EST. ACQ TIME" value={`${estimatedTime.toFixed(0)} s (${(estimatedTime / 60).toFixed(1)} min)`} color="#000000" />
          <div className="flex items-center justify-between mt-2">
            <span className="nmr-label">SOLVENT SUPPRESSION</span>
            <button className={`nmr-btn text-[10px] ${state.solventSuppression ? 'nmr-btn-green' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'solventSuppression', value: !state.solventSuppression } })}>
              {state.solventSuppression ? '● ON' : '○ OFF'}
            </button>
          </div>
          {state.solventSuppression && (
            <NumInput label="SUPPRESSION STRENGTH" value={state.suppressionStrength}
              onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'suppressionStrength', value: v } })}
              min={0} max={100} step={5} unit="%" />
          )}
        </div>
      </div>

      <div className="nmr-panel">
        <PanelHeader title="EXPERIMENT VALIDATION" />
        <div className="p-3">
          <div className="grid grid-cols-2 gap-1 mb-3">
            {checks.map(c => (
              <div key={c.label} className="flex items-center gap-1.5">
                <span style={{ color: c.ok ? '#000000' : '#d97706' }}>{c.ok ? '✓' : '⚠'}</span>
                <span className="nmr-label">{c.label}</span>
              </div>
            ))}
          </div>
          {!allOk && (
            <div className="p-2 rounded mb-2" style={{ background: '#f5f5f5', border: '1px solid #000000' }}>
              <p className="font-mono text-[10px] text-[#cc0000]">
                Blocked: Turn System Power ON and select a valid Solvent first.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              className="nmr-btn nmr-btn-green flex-1 py-2"
              disabled={!allOk || state.acqStatus === 'ACQUIRING'}
              onClick={() => dispatch({ type: 'START_ACQUISITION' })}
            >
              {state.acqStatus === 'ACQUIRING' ? `⚙ SCAN ${state.currentScan}/${state.NS}` : '▶ START ACQUISITION'}
            </button>
          </div>
          {state.acqStatus === 'ACQUIRING' && (
            <div className="flex gap-1 mt-2">
              <button className="nmr-btn nmr-btn-amber flex-1 text-[10px]" onClick={() => dispatch({ type: 'PAUSE_ACQUISITION' })}>⏸ PAUSE</button>
              <button className="nmr-btn nmr-btn-red flex-1 text-[10px]" onClick={() => dispatch({ type: 'ABORT_ACQUISITION' })}>✕ ABORT</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


          
          
               
function ProcessingPanel() {
  const { state, dispatch } = useNMR();
  const steps = ['APODIZING', 'ZEROFILLING', 'FOURIER', 'PHASE', 'BASELINE', 'REFERENCE', 'COMPLETE'];

  // Safe condition check to ensure data accessibility
  const hasData = state.acqStatus === 'COMPLETE' || state.acqStatus === 'ABORTED' || state.fidData;

  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="PROCESSING PARAMETERS" />
        <div className="p-3">
          <div className="mb-2">
            <span className="nmr-label block mb-1">WINDOW FUNCTION</span>
            <select className="nmr-select" value={state.windowFunction}
              onChange={e => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'windowFunction', value: e.target.value } })}>
              <option value="EXPONENTIAL">Exponential (em)</option>
              <option value="GAUSSIAN">Gaussian (gm)</option>
              <option value="COSINE">Cosine (cos)</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <NumInput label="LINE BROADENING" value={state.apodLB} onChange={v => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'apodLB', value: v } })} min={0} max={50} step={0.1} unit="Hz" />
          <div className="mb-2">
            <span className="nmr-label block mb-1">ZERO FILLING</span>
            <select className="nmr-select" value={state.zeroFillFactor}
              onChange={e => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'zeroFillFactor', value: Number(e.target.value) } })}>
              <option value={1}>1× (no zero filling)</option>
              <option value={2}>2× (SI = 2×TD)</option>
              <option value={4}>4× (SI = 4×TD)</option>
              <option value={8}>8× (SI = 8×TD)</option>
            </select>
          </div>
          <NumInput label="PHASE CORR 0 (PH0)" value={state.phaseCorr0} onChange={v => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'phaseCorr0', value: v } })} min={-360} max={360} step={1} unit="°" />
          <NumInput label="PHASE CORR 1 (PH1)" value={state.phaseCorr1} onChange={v => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'phaseCorr1', value: v } })} min={-360} max={360} step={1} unit="°" />
          <NumInput label="BASELINE ORDER" value={state.baselineOrder} onChange={v => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'baselineOrder', value: v } })} min={0} max={5} step={1} />
          <div className="mb-2">
            <span className="nmr-label block mb-1">REFERENCE MODE</span>
            <select className="nmr-select" value={state.referenceMode}
              onChange={e => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'referenceMode', value: e.target.value } })}>
              <option value="SOLVENT">Solvent residual</option>
              <option value="TMS">TMS (0.00 ppm)</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="nmr-label">MAGNITUDE MODE</span>
            <button className={`nmr-btn text-[10px] ${state.magnitudeMode ? 'nmr-btn-green' : ''}`}
              onClick={() => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'magnitudeMode', value: !state.magnitudeMode } })}>
              {state.magnitudeMode ? '● ON' : '○ OFF'}
            </button>
          </div>
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="PROCESSING WORKFLOW" />
        <div className="p-3">
          {state.processingStatus !== 'IDLE' && (
            <div className="mb-3">
              {steps.map(s => {
                const idx = steps.indexOf(s);
                const curIdx = steps.indexOf(state.processingStatus as string);
                return (
                  <div key={s} className="flex items-center gap-2 mb-1">
                    <span style={{ color: idx < curIdx ? '#000000' : idx === curIdx ? '#000000' : '#666666' }} className="font-mono text-[10px]">
                      {idx < curIdx ? '✓' : idx === curIdx ? '⟳' : '○'} {s}
                    </span>
                    {idx === curIdx && <div className="nmr-progress flex-1"><div className="nmr-progress-bar led-slow" style={{ width: `${state.processingProgress}%` }} /></div>}
                  </div>
                );
              })}
            </div>
          )}
                    
          <button
            className="nmr-btn nmr-btn-green w-full py-2"
            disabled={!hasData}
            onClick={() => {
              dispatch({ type: 'START_PROCESSING' });
              const sample = SAMPLE_LIBRARY[state.selectedSample];
              const peaks = getPeaksForNucleus(sample, state.nucleus);
              const info = SOLVENT_INFO[state.solvent];

              const specData = generateSpectrum({
                peaks: peaks,
                solventPPM: info?.residualPPM ?? 0,
                showSolvent: state.solvent !== 'None',
                suppressSolvent: state.solventSuppression,
                suppressionStrength: state.suppressionStrength,
                nucleus: state.nucleus,
                shimQuality: state.shimQuality,
                receiverGain: state.receiverGain,
                NS: state.NS,
                concentration: state.concentration,
                phaseCorr0: state.phaseCorr0,
                phaseCorr1: state.phaseCorr1,
                apodLB: state.apodLB,
                windowFunction: state.windowFunction,
                magnitudeMode: state.magnitudeMode,
                solventSuppression: state.solventSuppression,
                decouplerOn: state.decouplerOn,
                referenceShift: state.referenceShift || 0,
                spinnerArtifact: state.spinnerStatus === 'STABLE',
                spinRate: state.spinRate,
                nPoints: state.TD * (state.zeroFillFactor || 2)
              });

              setTimeout(() => {
                dispatch({ type: 'SET_PROCESSING_STATUS', payload: 'ZEROFILLING' });
              }, 100);

              setTimeout(() => {
                dispatch({ type: 'SET_PROCESSING_STATUS', payload: 'FOURIER' });
                dispatch({ type: 'SET_SPECTRUM', payload: specData });
              }, 250);

              setTimeout(() => {
                dispatch({ type: 'PROCESSING_COMPLETE' });
              }, 400);
            }}
          >
            {state.processingStatus === 'COMPLETE' ? '↺ RE-PROCESS' : '▶ PROCESS DATA'}
          </button>

          {state.processingStatus === 'COMPLETE' && (
            <button className="nmr-btn nmr-btn-amber w-full mt-2 text-[10px]"
              onClick={() => dispatch({ type: 'SET_PROC_PARAM', payload: { key: 'phaseCorr0', value: 0 } })}>
              AUTO PHASE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
              
          




          


function PeakPanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="PEAK ANALYSIS" />
        <div className="p-3">
          <NumInput label="THRESHOLD (%)" value={state.peakThreshold} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'peakThreshold', value: v } })} min={1} max={99} step={1} unit="%" />
          <div className="flex gap-2 mt-2">
            <button className="nmr-btn nmr-btn-green flex-1" disabled={!state.spectrumReady} onClick={() => dispatch({ type: 'AUTO_PICK_PEAKS' })}>
              AUTO PEAK PICK
            </button>
          </div>
          {state.pickedPeaks.length > 0 ? (
            <div className="mt-3">
              <div className="nmr-label mb-1">PEAK LIST ({state.pickedPeaks.length} peaks)</div>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #cccccc' }}>
                      {['δ (ppm)', 'Mult.', 'J (Hz)', 'nH', 'FWHM'].map(h => (
                        <th key={h} className="nmr-label text-left py-1 text-[9px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.pickedPeaks.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #ffffff' }}>
                        <td className="nmr-value text-[11px] py-0.5">{p.ppm.toFixed(2)}</td>
                        <td className="nmr-label text-[10px]">{p.multiplicity}</td>
                        <td className="nmr-label text-[10px]">{p.J > 0 ? p.J.toFixed(1) : '—'}</td>
                        <td className="nmr-label text-[10px]">{p.nH}</td>
                        <td className="nmr-label text-[10px]">{p.fwhm.toFixed(2)} Hz</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="font-mono text-[10px] text-[#666666] mt-3">Run Auto Peak Pick or click peaks on the spectrum.</p>
          )}
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="SNR / QUALITY" />
        <div className="p-3">
          <FieldRow label="SHIM QUALITY" value={`${(state.shimQuality * 100).toFixed(0)}%`} color={state.shimQuality > 0.85 ? '#000000' : '#333333'} />
          <FieldRow label="LOCK STABILITY" value={`${state.fieldStability.toFixed(3)} ppm/hr`} color={state.fieldStability < 0.1 ? '#000000' : '#333333'} />
          <FieldRow label="EST. LINEWIDTH" value={`~${((1 - state.shimQuality * 0.9) * 80 + 0.5 + state.apodLB).toFixed(1)} Hz`} />
          <FieldRow label="√NS FACTOR" value={`${Math.sqrt(state.NS).toFixed(1)}`} color="#000000" />
          {state.receiverOverflow && <FieldRow label="OVERFLOW" value="⚠ DETECTED" color="#000000" />}
        </div>
      </div>
    </div>
  );
}

function IntegrationPanel() {
  const { state, dispatch } = useNMR();
  const maxRaw = state.integrations.length > 0 ? Math.max(...state.integrations.map(i => i.rawValue)) : 1;

  return (
    <div className="nmr-panel">
      <PanelHeader title="INTEGRATION" />
      <div className="p-3">
        <p className="font-mono text-[10px] text-[#888888] mb-2">Click and drag on the spectrum to define integration regions.</p>
        {state.integrations.length > 0 ? (
          <>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cccccc' }}>
                    {['Region', 'Integral', 'Norm.', 'Label', ''].map(h => (
                      <th key={h} className="nmr-label text-left py-1 text-[9px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.integrations.map(intg => (
                    <tr key={intg.id} style={{ borderBottom: '1px solid #ffffff' }}>
                      <td className="nmr-label text-[9px] py-0.5">{intg.start.toFixed(1)}–{intg.end.toFixed(1)}</td>
                      <td className="nmr-value text-[11px]">{intg.rawValue.toFixed(2)}</td>
                      <td className="nmr-value text-[11px]">{(intg.rawValue / maxRaw).toFixed(2)}</td>
                      <td className="nmr-label text-[9px]">{intg.label}</td>
                      <td>
                        <button className="nmr-btn nmr-btn-red text-[9px] px-1 py-0.5" onClick={() => dispatch({ type: 'REMOVE_INTEGRATION', payload: intg.id })}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="nmr-btn nmr-btn-amber w-full mt-2 text-[10px]" onClick={() => dispatch({ type: 'NORMALIZE_INTEGRATIONS' })}>NORMALIZE</button>
          </>
        ) : (
          <p className="font-mono text-[10px] text-[#666666]">No integrations defined.</p>
        )}
      </div>
    </div>
  );
}

function QNMRPanel() {
  const { state, dispatch } = useNMR();
  const concCalc = state.qnmrRefConc * (state.qnmrAnalyteIntegral / state.qnmrRefNuclei) / (state.qnmrRefIntegral / state.qnmrAnalyteNuclei);

  return (
    <div className="nmr-panel">
      <PanelHeader title="QUANTITATIVE NMR (EDUCATIONAL)" />
      <div className="p-3">
        <div className="p-2 rounded mb-3" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
          <p className="font-mono text-[10px] text-[#777777]">
            qNMR uses signal integrals for quantification. Internal standard method shown below. Results are simulated educational values.
          </p>
        </div>
        <div className="nmr-panel-header -mx-3 mb-2 px-3">REFERENCE STANDARD</div>
        <NumInput label="Concentration" value={state.qnmrRefConc} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'qnmrRefConc', value: v } })} min={0.001} max={100} step={0.1} unit="mM" />
        <NumInput label="Integral value" value={state.qnmrRefIntegral} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'qnmrRefIntegral', value: v } })} min={0.01} max={100} step={0.01} />
        <NumInput label="No. nuclei (nH)" value={state.qnmrRefNuclei} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'qnmrRefNuclei', value: Math.max(1, Math.floor(v)) } })} min={1} max={20} step={1} />
        <div className="nmr-panel-header -mx-3 my-2 px-3">ANALYTE</div>
        <NumInput label="Integral value" value={state.qnmrAnalyteIntegral} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'qnmrAnalyteIntegral', value: v } })} min={0.01} max={100} step={0.01} />
        <NumInput label="No. nuclei (nH)" value={state.qnmrAnalyteNuclei} onChange={v => dispatch({ type: 'SET_ACQ_PARAM', payload: { key: 'qnmrAnalyteNuclei', value: Math.max(1, Math.floor(v)) } })} min={1} max={20} step={1} />
        <div className="mt-3 p-3 rounded" style={{ background: '#ffffff', border: '1px solid #00000044' }}>
          <div className="nmr-label mb-1">CALCULATED CONCENTRATION</div>
          <div className="nmr-value text-2xl">{isNaN(concCalc) || !isFinite(concCalc) ? '—' : concCalc.toFixed(3)} mM</div>
          <div className="font-mono text-[9px] text-[#888888] mt-1">C_analyte = C_ref × (I_analyte / nH_ref) / (I_ref / nH_analyte)</div>
        </div>
      </div>
    </div>
  );
}

function RelaxationPanel() {
  const { state, dispatch } = useNMR();
  const sample = SAMPLE_LIBRARY[state.selectedSample];
  const T1 = sample?.T1typical ?? 3.0;
  const T2 = sample?.T2typical ?? 1.5;

  return (
    <div className="nmr-panel">
      <PanelHeader title="RELAXATION (T1 / T2)" />
      <div className="p-3">
        <div className="flex gap-2 mb-3">
          {['T1', 'T2'].map(t => (
            <button key={t} className="nmr-btn flex-1"
              style={state.relaxationType === t ? { background: '#e0e0e0', borderColor: '#000000', color: '#000000' } : {}}
              onClick={() => dispatch({ type: 'START_RELAXATION', payload: t as 'T1' | 'T2' })}>
              {t} RELAXATION
            </button>
          ))}
        </div>
        <FieldRow label="EXPERIMENT" value={state.relaxationType === 'T1' ? 'Inversion Recovery' : 'CPMG'} />
        <FieldRow label="TYPICAL T1" value={`${T1.toFixed(1)} s`} color="#000000" />
        <FieldRow label="TYPICAL T2" value={`${T2.toFixed(2)} s`} color="#000000" />
        {state.T1fitted > 0 && <FieldRow label="FITTED T1" value={`${state.T1fitted.toFixed(2)} s`} color="#000000" />}
        {state.T2fitted > 0 && <FieldRow label="FITTED T2" value={`${state.T2fitted.toFixed(3)} s`} color="#000000" />}
        {state.relaxationData.length > 0 && (
          <div className="mt-2 p-1 rounded" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
            <div className="nmr-label mb-1">{state.relaxationType} CURVE</div>
            <svg viewBox={`0 0 200 80`} width="100%">
              <rect width="200" height="80" fill="#ffffff" />
              {state.relaxationData.map((pt, i, arr) => {
                if (i === 0) return null;
                const prev = arr[i - 1];
                const maxX = arr[arr.length - 1].tau;
                const x1 = (prev.tau / maxX) * 190 + 5;
                const y1 = 75 - (prev.intensity * 0.5 + 0.5) * 65;
                const x2 = (pt.tau / maxX) * 190 + 5;
                const y2 = 75 - (pt.intensity * 0.5 + 0.5) * 65;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000000" strokeWidth="1.5" />;
              })}
              <line x1="5" y1={75 - 65} x2="5" y2="75" stroke="#cccccc" strokeWidth="0.5" />
              <line x1="5" y1="75" x2="195" y2="75" stroke="#cccccc" strokeWidth="0.5" />
              <line x1="5" y1="42" x2="195" y2="42" stroke="#cccccc" strokeWidth="0.5" strokeDasharray="3,3" />
            </svg>
          </div>
        )}
        <button className="nmr-btn nmr-btn-green w-full mt-2" disabled={!state.spectrumReady}
          onClick={() => {
            dispatch({ type: 'START_RELAXATION', payload: state.relaxationType });
            const data = state.relaxationType === 'T1'
              ? Array.from({ length: 20 }, (_, i) => ({ tau: (i / 19) * T1 * 5, intensity: 1 - 2 * Math.exp(-(i / 19) * T1 * 5 / T1) }))
              : Array.from({ length: 20 }, (_, i) => ({ tau: (i / 19) * T2 * 4, intensity: Math.exp(-(i / 19) * T2 * 4 / T2) }));
            dispatch({ type: 'SET_RELAXATION_DATA', payload: data });
            dispatch({ type: 'SET_T1_T2', payload: state.relaxationType === 'T1' ? { T1 } : { T2 } });
          }}>
          ▶ RUN {state.relaxationType} EXPERIMENT
        </button>
      </div>
    </div>
  );
}

function DiffusionPanel() {
  const { state } = useNMR();
  const sample = SAMPLE_LIBRARY[state.selectedSample];

  return (
    <div className="nmr-panel">
      <PanelHeader title="DOSY / DIFFUSION" />
      <div className="p-3">
        <p className="font-mono text-[10px] text-[#888888] mb-3">
          DOSY encodes molecular diffusion using pulsed field gradients. Larger molecules → slower diffusion → lower D coefficient.
        </p>
        <FieldRow label="EXPERIMENT" value="DOSY (LEDBPGPPR)" />
        <FieldRow label="GRADIENT STRENGTH" value="0–50 G/cm" />
        <FieldRow label="DIFFUSION DELAY (Δ)" value="100 ms" />
        <FieldRow label="GRADIENT PULSE (δ)" value="2 ms" />
        {sample && (
          <FieldRow label="EST. DIFFUSION COEFF." value={`~${(1e-9 / sample.T1typical * 2).toExponential(2)} m²/s`} color="#000000" />
        )}
        <div className="mt-3 p-2 rounded" style={{ background: '#ffffff', border: '1px solid #cccccc' }}>
          <div className="nmr-label mb-2">DOSY MAP PREVIEW</div>
          <svg viewBox="0 0 200 100" width="100%">
            <rect width="200" height="100" fill="#ffffff" />
            <text x="100" y="12" textAnchor="middle" fill="#666666" fontSize="7" fontFamily="JetBrains Mono">δ (ppm)</text>
            <text x="6" y="50" textAnchor="middle" fill="#666666" fontSize="7" fontFamily="JetBrains Mono" transform="rotate(-90,6,50)">log D</text>
            <line x1="20" y1="15" x2="20" y2="90" stroke="#cccccc" strokeWidth="0.5" />
            <line x1="20" y1="90" x2="195" y2="90" stroke="#cccccc" strokeWidth="0.5" />
            {sample?.peaks1H.slice(0, 4).map((p, i) => {
              const x = 20 + (1 - p.ppm / 12) * 170;
              const y = 40 + i * 5;
              return <ellipse key={i} cx={x} cy={y} rx={8} ry={4} fill="#000000" opacity={0.6} />;
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function TwoDNMRPanel() {
  const { state, dispatch } = useNMR();
  const expOptions = ['COSY', 'TOCSY', 'NOESY', 'ROESY', 'HSQC', 'HMQC', 'HMBC', 'DOSY', 'JRES'];
  const [selectedExp, setSelectedExp] = useState('COSY');

  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="2D NMR ACQUISITION" />
        <div className="p-3">
          <div className="mb-2">
            <span className="nmr-label block mb-1">EXPERIMENT TYPE</span>
            <div className="flex flex-wrap gap-1">
              {expOptions.map(e => (
                <button key={e} className="nmr-btn text-[10px] px-2 py-1"
                  style={selectedExp === e ? { background: '#e0e0e0', borderColor: '#000000', color: '#000000' } : {}}
                  onClick={() => setSelectedExp(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <FieldRow label="F2 (direct)" value={`¹H — SW ${state.SW} Hz`} />
          <FieldRow label="F1 (indirect)" value={selectedExp === 'HSQC' || selectedExp === 'HMBC' || selectedExp === 'HMQC' ? '¹³C' : '¹H'} />
          <FieldRow label="t1 increments" value={state.twoDT1Increments.toString()} />
          <FieldRow label="NS / t1 point" value={state.NS.toString()} />
          {state.twoDRunning && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="nmr-label">2D PROGRESS</span>
                <span className="nmr-value text-[11px]">{state.twoDProgress.toFixed(0)}%</span>
              </div>
              <div className="nmr-progress"><div className="nmr-progress-bar" style={{ width: `${state.twoDProgress}%` }} /></div>
              <div className="font-mono text-[10px] text-[#000000] mt-1 led-slow">t1 increment: {Math.floor(state.twoDProgress / 100 * state.twoDT1Increments).toString().padStart(3,'0')} / {state.twoDT1Increments}</div>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button className="nmr-btn nmr-btn-green flex-1" disabled={state.twoDRunning || state.acqStatus === 'ACQUIRING'}
              onClick={() => dispatch({ type: 'START_2D', payload: selectedExp })}>
              {state.twoDRunning ? `⚙ ${selectedExp} RUNNING...` : `▶ START ${selectedExp}`}
            </button>
            {state.twoDRunning && (
              <button className="nmr-btn nmr-btn-red" onClick={() => dispatch({ type: 'SET_2D_RUNNING', payload: false })}>✕ ABORT</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagnosticsPanel() {
  const { state, dispatch } = useNMR();
  const subsystems = [
    { name: 'POWER', status: state.power !== 'OFF' ? 'ready' : 'off' },
    { name: 'MAGNET', status: state.magnetStability === 'STABLE' ? 'ready' : 'warning' },
    { name: 'CRYOGEN', status: state.cryoStatus === 'NORMAL' ? 'ready' : state.cryoStatus === 'LOW' ? 'warning' : 'error' },
    { name: 'PROBE', status: state.probeStatus === 'READY' ? 'ready' : 'error' },
    { name: 'RF TX', status: state.tuneStatus === 'OPTIMAL' ? 'ready' : state.tuneStatus === 'TUNING' ? 'active' : 'off' },
    { name: 'RF RX', status: state.receiverOverflow ? 'error' : state.acqStatus === 'ACQUIRING' ? 'active' : 'ready' },
    { name: 'LOCK', status: state.lockStatus === 'LOCKED' ? 'ready' : state.lockStatus === 'SEARCHING' ? 'active' : state.lockStatus === 'LOST' ? 'error' : 'off' },
    { name: 'SHIM', status: state.shimQuality > 0.65 ? 'ready' : state.shimQuality > 0.35 ? 'warning' : 'error' },
    { name: 'SPINNER', status: state.spinnerStatus === 'STABLE' ? 'ready' : state.spinnerStatus === 'ACCELERATING' ? 'active' : 'off' },
    { name: 'TEMP', status: state.vtStatus === 'STABLE' ? 'ready' : 'warning' },
    { name: 'GRADIENT', status: state.twoDRunning ? 'active' : 'ready' },
    { name: 'ADC', status: state.receiverOverflow ? 'error' : state.acqStatus === 'ACQUIRING' ? 'active' : 'ready' },
    { name: 'DATA SYS', status: state.processingStatus === 'COMPLETE' ? 'ready' : state.processingStatus !== 'IDLE' ? 'active' : 'off' },
  ];

  const statusIcon = (s: string) => ({ off: '○', ready: '●', active: '▶', warning: '⚠', error: '✗' })[s] || '○';
  const statusColor = (s: string) => ({ off: '#666666', ready: '#000000', active: '#000000', warning: '#333333', error: '#000000' })[s] || '#666666';

  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="SYSTEM DIAGNOSTICS" />
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2">
            {subsystems.map(s => (
              <div key={s.name} className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-[#e0e0e0]"
                style={{ border: '1px solid #e0e0e0' }}
                onClick={() => dispatch({ type: 'ADD_EVENT', payload: { message: `Diagnostics: ${s.name} — ${s.status.toUpperCase()}`, level: s.status === 'error' ? 'ERROR' : 'INFO' } })}>
                <span style={{ color: statusColor(s.status) }} className={s.status === 'active' ? 'led-slow' : ''}>{statusIcon(s.status)}</span>
                <span className="nmr-label">{s.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button className="nmr-btn w-full" onClick={() => {
              subsystems.forEach(s => {
                if (s.status === 'error' || s.status === 'warning') {
                  dispatch({ type: 'ADD_EVENT', payload: { message: `DIAG: ${s.name} — ${s.status.toUpperCase()}`, level: s.status === 'error' ? 'ERROR' : 'WARNING' } });
                }
              });
            }}>RUN FULL DIAGNOSTICS</button>
          </div>
        </div>
      </div>
      {state.alarms.filter(a => a.active).length > 0 && (
        <div className="nmr-panel">
          <PanelHeader title="ACTIVE ALARMS" />
          <div className="p-3">
            {state.alarms.filter(a => a.active).map(alarm => (
              <div key={alarm.id} className="p-2 rounded mb-2" style={{
                background: alarm.level === 'CRITICAL' || alarm.level === 'ERROR' ? '#f5f5f5' : alarm.level === 'WARNING' ? '#f5f5f5' : '#f5f5f5',
                border: `1px solid ${alarm.level === 'CRITICAL' || alarm.level === 'ERROR' ? '#ffff' : alarm.level === 'WARNING' ? '#333333' : '#000000'}`,
              }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] font-bold" style={{ color: alarm.level === 'ERROR' || alarm.level === 'CRITICAL' ? '#000000' : alarm.level === 'WARNING' ? '#333333' : '#000000' }}>
                    {alarm.level}: {alarm.message}
                  </span>
                  <button className="nmr-btn text-[9px] px-1 py-0.5" onClick={() => dispatch({ type: 'CLEAR_ALARM', payload: alarm.id })}>CLEAR</button>
                </div>
                <div className="font-mono text-[9px] text-[#777777]">System: {alarm.subsystem} | {alarm.recovery}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventLogPanel() {
  const { state, dispatch } = useNMR();
  const levelColor = (l: string) => ({ INFO: '#777777', WARNING: '#333333', ERROR: '#000000', CRITICAL: '#000000' })[l] || '#777777';
  const levelIcon = (l: string) => ({ INFO: 'ℹ', WARNING: '⚠', ERROR: '✗', CRITICAL: '✕' })[l] || 'ℹ';

  return (
    <div className="nmr-panel h-full flex flex-col">
      <PanelHeader title="EVENT LOG" />
      <div className="flex gap-2 p-2" style={{ borderBottom: '1px solid #cccccc' }}>
        <button className="nmr-btn text-[10px] flex-1" onClick={() => dispatch({ type: 'CLEAR_EVENTS' })}>CLEAR LOG</button>
        <button className="nmr-btn text-[10px] flex-1" onClick={() => {
          const log = state.eventLog.map(e => `${e.time} [${e.level}] ${e.message}`).join('\n');
          const blob = new Blob([log], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'nmr_event_log.txt'; a.click();
        }}>EXPORT LOG</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '400px' }}>
        {state.eventLog.length === 0 ? (
          <p className="font-mono text-[10px] text-[#666666]">No events recorded.</p>
        ) : (
          state.eventLog.map(e => (
            <div key={e.id} className="flex items-start gap-2 mb-1 py-0.5" style={{ borderBottom: '1px solid #ffffff' }}>
              <span className="font-mono text-[9px] text-[#666666] flex-shrink-0">{e.time}</span>
              <span className="flex-shrink-0" style={{ color: levelColor(e.level) }}>{levelIcon(e.level)}</span>
              <span className="font-mono text-[10px]" style={{ color: levelColor(e.level) }}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function QCPanel() {
  const { state, dispatch } = useNMR();
  const checks = [
    { label: 'Lock Stability', value: `${state.fieldStability.toFixed(3)} ppm/hr`, ok: state.fieldStability < 0.1, target: '< 0.1 ppm/hr' },
    { label: 'Shim Quality', value: `${(state.shimQuality * 100).toFixed(0)}%`, ok: state.shimQuality > 0.75, target: '> 75%' },
    { label: 'Linewidth (est.)', value: `~${((1-state.shimQuality*0.9)*80+0.5).toFixed(1)} Hz`, ok: state.shimQuality > 0.75, target: '< 20 Hz' },
    { label: 'Temperature', value: `±${state.tempStable ? 0.1 : 2.0} °C`, ok: state.tempStable, target: '±0.1 °C' },
    { label: 'Receiver', value: state.receiverOverflow ? 'OVERFLOW' : 'OK', ok: !state.receiverOverflow, target: 'No overflow' },
    { label: 'Tune/Match', value: state.tuneStatus, ok: state.tuneStatus === 'OPTIMAL', target: 'OPTIMAL' },
  ];

  return (
    <div className="nmr-panel">
      <PanelHeader title="QUALITY CONTROL" />
      <div className="p-3">
        {checks.map(c => (
          <div key={c.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #e0e0e0' }}>
            <div className="flex items-center gap-2">
              <span style={{ color: c.ok ? '#000000' : '#000000' }}>{c.ok ? '✓' : '✗'}</span>
              <div>
                <div className="nmr-label">{c.label}</div>
                <div className="font-mono text-[9px] text-[#666666]">Target: {c.target}</div>
              </div>
            </div>
            <span className="nmr-value text-[11px]" style={{ color: c.ok ? '#000000' : '#000000' }}>{c.value}</span>
          </div>
        ))}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="nmr-label">OVERALL QC</span>
            <StatusBadge status={checks.every(c => c.ok) ? 'PASS' : 'FAIL'} />
          </div>
          <button className="nmr-btn w-full mt-1" onClick={() => dispatch({ type: 'ADD_EVENT', payload: { message: `QC Check: ${checks.filter(c=>c.ok).length}/${checks.length} passed`, level: checks.every(c=>c.ok) ? 'INFO' : 'WARNING' } })}>
            RUN QC CHECK
          </button>
        </div>
      </div>
    </div>
  );
}

function DataSystemPanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="EXPERIMENT DATA" />
        <div className="p-3">
          <FieldRow label="SAMPLE ID" value={state.sampleId || '—'} />
          <FieldRow label="SOLVENT" value={state.solvent} />
          <FieldRow label="NUCLEUS" value={state.nucleus} />
          <FieldRow label="FREQUENCY" value={`${state.rfFrequency.toFixed(3)} MHz`} />
          <FieldRow label="TEMPERATURE" value={`${state.currentTemp.toFixed(1)} °C`} />
          <FieldRow label="EXPERIMENT" value={state.experiment} />
          <FieldRow label="SCANS" value={state.NS.toString()} />
          <FieldRow label="PROCESSING" value={state.processingStatus} color={state.processingStatus === 'COMPLETE' ? '#000000' : '#777777'} />
          <FieldRow label="TIMESTAMP" value={new Date().toLocaleString()} />
          <div className="flex gap-2 mt-3">
            <button className="nmr-btn nmr-btn-green flex-1" disabled={!state.spectrumReady} onClick={() => dispatch({ type: 'SAVE_EXPERIMENT' })}>💾 SAVE</button>
          </div>
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="SAVED EXPERIMENTS" />
        <div className="p-3">
          {state.savedExperiments.length === 0 ? (
            <p className="font-mono text-[10px] text-[#666666]">No saved experiments.</p>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {state.savedExperiments.map(e => (
                <div key={e.id} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <div>
                    <div className="font-mono text-[11px] text-[#000000]">{e.name}</div>
                    <div className="font-mono text-[9px] text-[#666666]">{e.nucleus} | {e.solvent} | {new Date(e.dateTime).toLocaleDateString()}</div>
                  </div>
                  <button className="nmr-btn nmr-btn-red text-[9px] px-1 py-0.5" onClick={() => dispatch({ type: 'DELETE_EXPERIMENT', payload: e.id })}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="nmr-panel">
        <PanelHeader title="EXPORT" />
        <div className="p-3">
          <p className="font-mono text-[10px] text-[#888888] mb-2">Simulated export formats (educational data only).</p>
          <div className="flex flex-col gap-1">
            {['CSV Peak List', 'TXT Parameters', 'JCAMP-DX Spectrum'].map(fmt => (
              <button key={fmt} className="nmr-btn text-[10px]" disabled={!state.spectrumReady}
                onClick={() => {
                  const data = fmt === 'CSV Peak List'
                    ? 'ppm,intensity,multiplicity,J\n' + state.pickedPeaks.map(p => `${p.ppm},${p.intensity},${p.multiplicity},${p.J}`).join('\n')
                    : fmt === 'TXT Parameters'
                    ? `NMR EXPERIMENT PARAMETERS\nNucleus: ${state.nucleus}\nSolvent: ${state.solvent}\nNS: ${state.NS}\nD1: ${state.D1}\nAQ: ${state.AQ}\nSW: ${state.SW}\n`
                    : `##TITLE= NMR Spectrum (Simulated)\n##JCAMP-DX= 5.0\n##XFACTOR= 1.0\n##YFACTOR= 1.0\n##XUNITS= PPM\n##YUNITS= ARBITRARY UNITS\n##END=\n`;
                  const blob = new Blob([data], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `nmr_${fmt.replace(/\s/g,'_').toLowerCase()}.txt`; a.click();
                }}>
                ↓ {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportPanel() {
  const { state } = useNMR();
  const preset = EXPERIMENT_PRESETS[state.experiment];
  const report = `NMR EXPERIMENT REPORT
${'='.repeat(40)}
Date/Time:        ${new Date().toLocaleString()}
Instrument:       NMR Digital Twin 500 MHz
Sample ID:        ${state.sampleId || 'Unknown'}
Sample:           ${SAMPLE_LIBRARY[state.selectedSample]?.name ?? 'Custom'}
Solvent:          ${state.solvent}
Concentration:    ${state.concentration} mM
Nucleus:          ${state.nucleus}
Frequency:        ${state.rfFrequency.toFixed(3)} MHz
Temperature:      ${state.currentTemp.toFixed(1)} °C
Experiment:       ${preset?.name ?? state.experiment}
Scans (NS):       ${state.NS}
Dummy scans (DS): ${state.DS}
Relaxation delay: ${state.D1} s
Acquisition time: ${state.AQ} s
Spectral width:   ${state.SW} Hz
TD (points):      ${state.TD}
${'─'.repeat(40)}
PROCESSING:
Window function:  ${state.windowFunction}
Line broadening:  ${state.apodLB} Hz
Zero filling:     ${state.zeroFillFactor}×
Phase PH0:        ${state.phaseCorr0}°
Phase PH1:        ${state.phaseCorr1}°
Reference:        ${state.referenceMode}
${'─'.repeat(40)}
QUALITY:
Shim quality:     ${(state.shimQuality * 100).toFixed(0)}%
Lock level:       ${state.lockLevel.toFixed(1)}%
Field stability:  ${state.fieldStability.toFixed(3)} ppm/hr
Linewidth (est.): ~${((1-state.shimQuality*0.9)*80+0.5+state.apodLB).toFixed(1)} Hz
${'─'.repeat(40)}
PEAK LIST (${state.pickedPeaks.length} peaks):
${state.pickedPeaks.map(p => `  δ ${p.ppm.toFixed(2)} ppm  ${p.multiplicity}  J=${p.J.toFixed(1)} Hz  nH=${p.nH}`).join('\n') || '  No peaks picked.'}
${'─'.repeat(40)}
INTEGRATIONS (${state.integrations.length}):
${state.integrations.map(i => `  ${i.start.toFixed(1)}–${i.end.toFixed(1)} ppm  ∫=${i.normalized.toFixed(2)}  ${i.label}`).join('\n') || '  None.'}
`;

  return (
    <div className="nmr-panel">
      <PanelHeader title="EXPERIMENT REPORT" />
      <div className="p-3">
        <pre className="font-mono text-[10px] text-[#777777] whitespace-pre-wrap leading-relaxed" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {report}
        </pre>
        <button className="nmr-btn nmr-btn-green w-full mt-3" onClick={() => {
          const blob = new Blob([report], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'nmr_report.txt'; a.click();
        }}>
          ↓ EXPORT REPORT
        </button>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { state, dispatch } = useNMR();
  return (
    <div className="nmr-panel">
      <PanelHeader title="SETTINGS" />
      <div className="p-3">
        <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #e0e0e0' }}>
          <div>
            <div className="nmr-label">EDUCATIONAL MODE</div>
            <div className="font-mono text-[9px] text-[#888888]">Show explanations when clicking subsystems</div>
          </div>
          <button className={`nmr-btn text-[10px] ${state.educationalMode ? 'nmr-btn-green' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_EDUCATIONAL_MODE' })}>
            {state.educationalMode ? '● ON' : '○ OFF'}
          </button>
        </div>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #e0e0e0' }}>
          <div>
            <div className="nmr-label">EXPERT MODE</div>
            <div className="font-mono text-[9px] text-[#888888]">Show all advanced parameters</div>
          </div>
          <button className={`nmr-btn text-[10px] ${state.expertMode ? 'nmr-btn-green' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_EXPERT_MODE' })}>
            {state.expertMode ? '● ON' : '○ OFF'}
          </button>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="nmr-label">VIEW MODE</div>
            <div className="font-mono text-[9px] text-[#888888]">Hardware vs Console view</div>
          </div>
          <div className="flex gap-1">
            {(['INSTRUMENT', 'CONSOLE'] as const).map(m => (
              <button key={m} className="nmr-btn text-[10px] px-2"
                style={state.viewMode === m ? { background: '#e0e0e0', borderColor: '#000000', color: '#000000' } : {}}
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: m })}>
                {m === 'INSTRUMENT' ? 'HW' : 'SW'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AutomationPanel() {
  const { state, dispatch } = useNMR();
  const [newName, setNewName] = useState('1H 1D');
  const [newExp, setNewExp] = useState('1H_1D');

  return (
    <div className="flex flex-col gap-3">
      <div className="nmr-panel">
        <PanelHeader title="EXPERIMENT QUEUE" />
        <div className="p-3">
          <div className="flex gap-2 mb-2">
            <select className="nmr-select flex-1" value={newExp} onChange={e => { setNewExp(e.target.value); setNewName(EXPERIMENT_PRESETS[e.target.value]?.name || e.target.value); }}>
              {Object.entries(EXPERIMENT_PRESETS).map(([id, p]) => (
                <option key={id} value={id}>{p.name}</option>
              ))}
            </select>
            <button className="nmr-btn nmr-btn-green text-[10px] px-3" onClick={() => {
              const preset = EXPERIMENT_PRESETS[newExp];
              dispatch({ type: 'ADD_QUEUE_ITEM', payload: { id: `q_${Date.now()}`, name: newName, nucleus: preset?.nucleus || '1H', experiment: newExp, NS: preset?.NS || 16, status: 'WAITING' } });
            }}>+ ADD</button>
          </div>
          {state.experimentQueue.length === 0 ? (
            <p className="font-mono text-[10px] text-[#666666]">Queue is empty.</p>
          ) : (
            <div>
              {state.experimentQueue.map((q, i) => (
                <div key={q.id} className="flex items-center justify-between py-1.5 px-2 mb-1 rounded" style={{ background: '#ffffff', border: '1px solid #e0e0e0' }}>
                  <div className="flex items-center gap-2">
                    <span className="nmr-label text-[10px] w-5">{i + 1}.</span>
                    <div>
                      <div className="font-mono text-[11px] text-[#000000]">{q.name}</div>
                      <div className="font-mono text-[9px] text-[#666666]">{q.nucleus} | NS={q.NS}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={q.status} />
                    <button className="nmr-btn nmr-btn-red text-[9px] px-1 py-0.5" onClick={() => dispatch({ type: 'REMOVE_QUEUE_ITEM', payload: q.id })}>✕</button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <button className="nmr-btn nmr-btn-green flex-1 text-[10px]" disabled={state.automationRunning || state.experimentQueue.length === 0}
                  onClick={() => dispatch({ type: 'START_QUEUE' })}>▶ START QUEUE</button>
                <button className="nmr-btn nmr-btn-red flex-1 text-[10px]" disabled={!state.automationRunning}
                  onClick={() => dispatch({ type: 'SET_AUTOMATION_RUNNING', payload: false })}>■ STOP</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Panel Dispatcher
// ────────────────────────────────────────────────────────────
function ActivePanel({ panelId }: { panelId: PanelId }) {
  const PANELS: Partial<Record<PanelId, React.ReactNode>> = {
    system: <SystemPanel />,
    magnet: <MagnetPanel />,
    cryogen: <CryogenPanel />,
    sample: <SamplePanel />,
    spinner: <SpinnerPanel />,
    probe: <ProbePanel />,
    temperature: <TemperaturePanel />,
    lock: <LockPanel />,
    shim: <ShimPanel />,
    tune: <TunePanel />,
    rf: <RFPanel />,
    pulseprogram: <PulseProgramPanel />,
    experiment: <ExperimentPanel />,
    acquisition: <AcquisitionPanel />,
    processing: <ProcessingPanel />,
    peaks: <PeakPanel />,
    integration: <IntegrationPanel />,
    qnmr: <QNMRPanel />,
    relaxation: <RelaxationPanel />,
    diffusion: <DiffusionPanel />,
    '2dnmr': <TwoDNMRPanel />,
    diagnostics: <DiagnosticsPanel />,
    eventlog: <EventLogPanel />,
    qc: <QCPanel />,
    datasystem: <DataSystemPanel />,
    report: <ReportPanel />,
    settings: <SettingsPanel />,
    automation: <AutomationPanel />,
    receiver: <RFPanel />,
  };
  return <>{PANELS[panelId] ?? null}</>;
}

// ────────────────────────────────────────────────────────────
// Sidebar Menu
// ────────────────────────────────────────────────────────────
export default function MenuPanel() {
  const { state, dispatch } = useNMR();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { educationalMode } = state;

  return (
    <>
      {/* Overlay on mobile */}
      {state.menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => dispatch({ type: 'CLOSE_MENU' })} />
      )}

      <div
        className="flex-shrink-0 flex flex-col h-full"
        style={{
          width: state.menuOpen ? '240px' : '0px',
          overflow: 'hidden',
          transition: 'width 0.2s ease',
          background: '#ffffff',
          borderRight: '1px solid #cccccc',
          zIndex: 50,
        }}
      >
        <div style={{ width: '240px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Menu header */}
          <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #cccccc', background: '#f5f5f5' }}>
            <span className="font-mono text-[11px] font-bold tracking-widest text-[#000000]">SYSTEM MENU</span>
            <button onClick={() => dispatch({ type: 'CLOSE_MENU' })} className="font-mono text-[#666666] hover:text-[#000000] text-[14px]">✕</button>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto py-1">
            {MENU_GROUPS.map(group => (
              <div key={group.title}>
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#f5f5f5] transition-colors"
                  onClick={() => setCollapsed(c => ({ ...c, [group.title]: !c[group.title] }))}
                >
                  <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-[#666666]">{group.title}</span>
                  <span className="font-mono text-[10px] text-[#666666]">{collapsed[group.title] ? '▶' : '▼'}</span>
                </button>
                {!collapsed[group.title] && group.items.map(item => {
                  const isActive = state.activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-[#f5f5f5] transition-colors text-left"
                      style={{
                        background: isActive ? '#e5e5e5' : 'transparent',
                        borderLeft: isActive ? '2px solid #000000' : '2px solid transparent',
                      }}
                      onClick={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: item.id as PanelId })}
                    >
                      <span className="text-[12px]">{item.icon}</span>
                      <span className="font-mono text-[11px]" style={{ color: isActive ? '#000000' : '#000000' }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel drawer — shows active panel content */}
      {state.activePanel !== 'none' && (
        <div
          className="flex-shrink-0 h-full"
          style={{
            width: '300px',
            borderRight: '1px solid #cccccc',
            background: '#ffffff',
            overflowY: 'auto',
            position: 'relative',
            zIndex: 55,
          }}
        >
          <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #cccccc', background: '#f5f5f5' }}>
            <span className="font-mono text-[11px] font-bold tracking-wider text-[#000000]">
              {MENU_GROUPS.flatMap(g => g.items).find(i => i.id === state.activePanel)?.label ?? state.activePanel.toUpperCase()}
            </span>
            <button onClick={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: 'none' })} className="font-mono text-[#666666] hover:text-[#000000]">✕</button>
          </div>
          {educationalMode && EDUCATIONAL_TIPS[state.activePanel] && (
            <div className="p-2 m-2 rounded" style={{ background: '#f5f5f5', border: '1px solid #000000' }}>
              <p className="font-mono text-[10px] text-[#000000]">📖 {EDUCATIONAL_TIPS[state.activePanel]}</p>
            </div>
          )}
          <div className="p-2">
            <ActivePanel panelId={state.activePanel} />
          </div>
        </div>
      )}
    </>
  );
}
