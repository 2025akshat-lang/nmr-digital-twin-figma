import React, { useEffect, useState } from 'react';
import { useNMR } from '../NMRContext';
import { NUCLEUS_FREQ } from '../simulation';

function LED({ color, pulse }: { color: 'off' | 'green' | 'cyan' | 'amber' | 'red'; pulse?: 'slow' | 'fast' | 'blink' }) {
  const base = 'hw-led';
  const colorClass = {
    off: 'hw-led-off',
    green: 'hw-led-ready',
    cyan: 'hw-led-active',
    amber: 'hw-led-warning',
    red: 'hw-led-error',
  }[color];
  const pulseClass = pulse === 'slow' ? 'led-slow' : pulse === 'fast' ? 'led-fast' : pulse === 'blink' ? 'led-blink' : '';
  return <span className={`${base} ${colorClass} ${pulseClass}`} />;
}

function StatusIndicator({ label, color, pulse }: { label: string; color: 'off' | 'green' | 'cyan' | 'amber' | 'red'; pulse?: 'slow' | 'fast' | 'blink' }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded flex-shrink-0 bg-gray-100 border border-gray-200">
      <LED color={color} pulse={pulse} />
      <span className="font-mono text-[10px] tracking-widest whitespace-nowrap text-gray-700 font-medium">
        {label}
      </span>
    </div>
  );
}

export default function TopBar() {
  const { state, dispatch } = useNMR();
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  const power = state.power;
  const isPowered = power !== 'OFF';

  // Derive LED states from actual simulator state
  const systemColor = power === 'OFF' ? 'off' : power === 'BOOTING' || power === 'INITIALIZING' ? 'amber' : power === 'READY' || power === 'RUNNING' ? 'green' : power === 'WARNING' ? 'amber' : 'red';
  const systemPulse = power === 'BOOTING' ? 'fast' : power === 'RUNNING' ? 'slow' : undefined;

  const magnetColor = state.magnetStability === 'STABLE' ? (isPowered ? 'cyan' : 'off') : state.magnetStability === 'WARNING' ? 'amber' : 'red';

  const probeColor = !isPowered ? 'off' : state.probeStatus === 'READY' ? 'green' : state.probeStatus === 'WARNING' ? 'amber' : 'red';
  const probePulse = state.tuneStatus === 'TUNING' ? 'fast' : undefined;

  const lockColor = !isPowered ? 'off' : state.lockStatus === 'LOCKED' ? 'green' : state.lockStatus === 'SEARCHING' || state.lockStatus === 'OPTIMIZING' ? 'amber' : state.lockStatus === 'LOST' ? 'red' : 'off';
  const lockPulse = state.lockStatus === 'SEARCHING' ? 'fast' : state.lockStatus === 'OPTIMIZING' ? 'slow' : undefined;

  const shimColor = !isPowered ? 'off' : state.shimQuality > 0.85 ? 'green' : state.shimQuality > 0.5 ? 'cyan' : state.shimQuality > 0.25 ? 'amber' : 'red';

  const rfColor = !isPowered ? 'off' : state.tuneStatus === 'OPTIMAL' ? 'green' : state.tuneStatus === 'TUNING' || state.tuneStatus === 'MATCHING' ? 'amber' : 'red';
  const rfPulse = state.rfActive ? 'fast' : undefined;

  const acqColor = !isPowered ? 'off' : state.acqStatus === 'ACQUIRING' ? 'cyan' : state.acqStatus === 'COMPLETE' ? 'green' : state.acqStatus === 'ABORTED' ? 'red' : 'off';
  const acqPulse = state.acqStatus === 'ACQUIRING' ? 'fast' : undefined;

  const freq = NUCLEUS_FREQ[state.nucleus];

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 z-50 w-full overflow-hidden bg-white border-b border-gray-200 shadow-sm"
      style={{ height: '48px' }}
    >
      {/* Left: hamburger + title */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_MENU' })}
          className="flex flex-col gap-1 p-2 rounded hover:bg-gray-100 transition-colors"
          title="Menu"
        >
          <span className="block w-5 h-0.5 bg-gray-700" />
          <span className="block w-5 h-0.5 bg-gray-700" />
          <span className="block w-5 h-0.5 bg-gray-700" />
        </button>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.1em] text-blue-600">NMR</span>
          <span className="font-mono text-[11px] sm:text-[13px] font-bold text-gray-800">{freq.toFixed(0)} MHz</span>
        </div>
      </div>

      {/* Center: status indicators */}
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap mx-2 py-1 scrollbar-none flex-1 max-w-[45%] md:max-w-none">
        <StatusIndicator label={power === 'OFF' ? 'OFFLINE' : power === 'BOOTING' ? 'BOOTING' : 'SYSTEM'} color={systemColor} pulse={systemPulse} />
        <StatusIndicator label="MAGNET" color={magnetColor} />
        <StatusIndicator label={state.probeStatus === 'READY' ? 'PROBE' : 'PROBE!'} color={probeColor} pulse={probePulse} />
        <StatusIndicator label={state.lockStatus === 'LOCKED' ? 'LOCKED' : state.lockStatus === 'SEARCHING' ? 'LOCK...' : 'LOCK'} color={lockColor} pulse={lockPulse} />
        <StatusIndicator label="SHIM" color={shimColor} />
        <StatusIndicator label={state.rfActive ? 'RF ACT' : 'RF'} color={rfColor} pulse={rfPulse} />
        {state.acqStatus !== 'IDLE' && <StatusIndicator label={state.acqStatus === 'ACQUIRING' ? 'ACQIRE' : state.acqStatus} color={acqColor} pulse={acqPulse} />}
      </div>

      {/* Right: view toggle + extra info + time */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {state.receiverOverflow && (
          <span className="font-mono text-[10px] text-red-600 led-blink bg-red-50 px-1.5 py-0.5 rounded border border-red-200 hidden sm:inline-block">⚠ OVERFLOW</span>
        )}
        {state.magnetWarning && (
          <span className="font-mono text-[10px] text-amber-600 led-slow bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 hidden sm:inline-block">⚠ MAGNET</span>
        )}
        <div className="flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded overflow-hidden">
          <button
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'INSTRUMENT' })}
            className="font-mono text-[10px] px-1.5 py-1 tracking-wider transition-colors font-medium"
            style={{
              background: state.viewMode === 'INSTRUMENT' ? '#2563eb' : 'transparent',
              color: state.viewMode === 'INSTRUMENT' ? '#ffffff' : '#4b5563',
            }}
          >HW</button>
          <button
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'CONSOLE' })}
            className="font-mono text-[10px] px-1.5 py-1 tracking-wider transition-colors font-medium"
            style={{
              background: state.viewMode === 'CONSOLE' ? '#2563eb' : 'transparent',
              color: state.viewMode === 'CONSOLE' ? '#ffffff' : '#4b5563',
            }}
          >SW</button>
        </div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_EDUCATIONAL_MODE' })}
          title="Educational Mode"
          className="font-mono text-[10px] px-1.5 py-1 rounded border transition-colors hidden sm:inline-block font-medium"
          style={{
            background: state.educationalMode ? '#ecfdf5' : 'transparent',
            borderColor: state.educationalMode ? '#10b981' : '#d1d5db',
            color: state.educationalMode ? '#059669' : '#4b5563',
          }}
        >EDU</button>
        <div className="font-mono text-[11px] text-gray-500 hidden lg:block">{time}</div>
        <button
          onClick={() => isPowered ? dispatch({ type: 'POWER_OFF' }) : dispatch({ type: 'POWER_ON' })}
          className="font-mono text-[10px] px-2 py-1 rounded border transition-all ml-0.5 font-semibold"
          style={{
            borderColor: isPowered ? '#ef4444' : '#10b981',
            color: isPowered ? '#dc2626' : '#059669',
            background: isPowered ? '#fef2f2' : '#ecfdf5',
          }}
        >
          {isPowered ? '■ OFF' : '▶ ON'}
        </button>
      </div>
    </div>
  );
}
