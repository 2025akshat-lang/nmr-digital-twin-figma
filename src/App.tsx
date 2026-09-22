import React, { useEffect, useRef } from 'react';
import { NMRProvider, useNMR } from './NMRContext';
import TopBar from './components/TopBar';
import HardwareView from './components/HardwareView';
import MenuPanel from './components/MenuPanel';
import SpectrumViewer from './components/SpectrumViewer';
import FIDViewer from './components/FIDViewer';
import EventLog, { NotificationToast } from './components/EventLog';
import {
  computeLockLevel, generateFID, generateSpectrum, generate2DSpectrum,
  SAMPLE_LIBRARY, SOLVENT_INFO, autoShimOptimal, getPeaksForNucleus,
} from './simulation';
import type { ProcessingState } from './types';

// ────────────────────────────────────────────────────────────
// Simulation Controller — all timers live here
// ────────────────────────────────────────────────────────────
function SimulationController() {
  const { state, dispatch } = useNMR();
  const stateRef = useRef(state);
  stateRef.current = state;

  const bootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acqTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tempTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoShimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTuneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const twoDTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quickStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeRef = useRef(0);

  // ── Boot sequence ─────────────────────────────────────────
  useEffect(() => {
    if (state.power === 'BOOTING') {
      bootTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_POWER', payload: 'INITIALIZING' });
        dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'INITIALIZING...' });
        dispatch({ type: 'ADD_EVENT', payload: { message: 'Console hardware check...', level: 'INFO' } });
      }, 1000);
    } else if (state.power === 'INITIALIZING') {
      bootTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_POWER', payload: 'READY' });
        dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'SYSTEM READY' });
        dispatch({ type: 'ADD_EVENT', payload: { message: 'System ready', level: 'INFO' } });
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { level: 'INFO', title: 'SYSTEM READY', message: 'NMR console online. Superconducting field stable at 11.7437 T.' } });
      }, 1500);
    }
    return () => { if (bootTimerRef.current) clearTimeout(bootTimerRef.current); };
  }, [state.power]);

  // ── Sample loading/ejection animation ─────────────────────
  useEffect(() => {
    if (state.sampleState === 'LOADING' || state.sampleState === 'POSITIONING') {
      sampleTimerRef.current = setInterval(() => {
        const s = stateRef.current;
        if (s.sampleState !== 'LOADING' && s.sampleState !== 'POSITIONING') return;
        const newY = Math.min(100, s.sampleYPct + 4);
        dispatch({ type: 'SET_SAMPLE_Y', payload: newY });
        if (s.sampleState === 'LOADING' && newY > 20) {
          dispatch({ type: 'SET_SAMPLE_STATE', payload: 'POSITIONING' });
        }
        if (newY >= 100) {
          dispatch({ type: 'SET_SAMPLE_STATE', payload: 'POSITIONED' });
          dispatch({ type: 'SET_AIR_STATE', payload: 'OFF' });
          dispatch({ type: 'SET_AIR_FLOW', payload: 0 });
          dispatch({ type: 'ADD_EVENT', payload: { message: 'Sample positioned in probe', level: 'INFO' } });
          clearInterval(sampleTimerRef.current!);
        }
      }, 80);
    } else if (state.sampleState === 'EJECTING') {
      sampleTimerRef.current = setInterval(() => {
        const s = stateRef.current;
        if (s.sampleState !== 'EJECTING') return;
        const newY = Math.max(0, s.sampleYPct - 6);
        dispatch({ type: 'SET_SAMPLE_Y', payload: newY });
        if (newY <= 0) {
          dispatch({ type: 'SET_SAMPLE_STATE', payload: 'EJECTED' });
          dispatch({ type: 'SET_AIR_STATE', payload: 'OFF' });
          dispatch({ type: 'SET_AIR_FLOW', payload: 0 });
          dispatch({ type: 'ADD_EVENT', payload: { message: 'Sample ejected', level: 'INFO' } });
          dispatch({ type: 'SHOW_NOTIFICATION', payload: { level: 'WARNING', title: 'SAMPLE EJECTED', message: 'Sample has been removed from the magnet bore.' } });
          clearInterval(sampleTimerRef.current!);
        }
      }, 80);
    }
    return () => { if (sampleTimerRef.current) clearInterval(sampleTimerRef.current); };
  }, [state.sampleState]);

  // ── Spinner simulation ────────────────────────────────────
  useEffect(() => {
    if (state.spinnerStatus === 'STOPPED') return;
    spinnerTimerRef.current = setInterval(() => {
      const s = stateRef.current;
      const { spinRate, targetSpinRate, spinnerStatus } = s;
      if (spinnerStatus === 'ACCELERATING') {
        const newRate = spinRate + 1.5;
        dispatch({ type: 'SET_SPIN_RATE', payload: newRate });
        if (newRate >= targetSpinRate) {
          dispatch({ type: 'SET_SPIN_RATE', payload: targetSpinRate });
          dispatch({ type: 'SET_SPINNER_STATUS', payload: 'STABLE' });
          dispatch({ type: 'ADD_EVENT', payload: { message: `Spinner stable at ${targetSpinRate} Hz`, level: 'INFO' } });
          dispatch({ type: 'SHOW_NOTIFICATION', payload: { level: 'INFO', title: 'SPINNER STABLE', message: `Spinning at ${targetSpinRate} Hz` } });
        }
      } else if (spinnerStatus === 'DECELERATING') {
        const newRate = Math.max(0, spinRate - 2);
        dispatch({ type: 'SET_SPIN_RATE', payload: newRate });
        if (newRate <= 0) {
          dispatch({ type: 'SET_SPINNER_STATUS', payload: 'STOPPED' });
          dispatch({ type: 'ADD_EVENT', payload: { message: 'Spinner stopped', level: 'INFO' } });
        }
      }
    }, 200);
    return () => { if (spinnerTimerRef.current) clearInterval(spinnerTimerRef.current); };
  }, [state.spinnerStatus]);

  // ── Lock simulation ───────────────────────────────────────
  useEffect(() => {
    lockTimerRef.current = setInterval(() => {
      const s = stateRef.current;
      if (s.lockStatus === 'OFF' || s.lockStatus === 'LOST') return;

      lockTimeRef.current += 0.1;
      const t = lockTimeRef.current;

      if (s.lockStatus === 'SEARCHING') {
        dispatch({ type: 'SET_LOCK_LEVEL', payload: 5 + Math.sin(t * 2) * 5 });
        // After 2s of searching → detected
        if (t > 2) {
          dispatch({ type: 'SET_LOCK_STATE', payload: 'DETECTED' });
          dispatch({ type: 'ADD_EVENT', payload: { message: `2H signal detected — ${s.solvent}`, level: 'INFO' } });
        }
      } else if (s.lockStatus === 'DETECTED') {
        dispatch({ type: 'SET_LOCK_LEVEL', payload: 30 + Math.sin(t * 3) * 10 });
        if (t > 3.5) {
          dispatch({ type: 'SET_LOCK_STATE', payload: 'OPTIMIZING' });
          dispatch({ type: 'ADD_EVENT', payload: { message: 'Lock signal optimizing...', level: 'INFO' } });
        }
      } else if (s.lockStatus === 'OPTIMIZING') {
        const targetLevel = computeLockLevel(s.solvent, s.shimQuality, s.lockPhase, s.fieldStability, t);
        const currentLevel = s.lockLevel;
        dispatch({ type: 'SET_LOCK_LEVEL', payload: currentLevel + (targetLevel - currentLevel) * 0.1 });
        if (s.lockLevel > 50 && t > 5) {
          dispatch({ type: 'SET_LOCK_STATE', payload: 'LOCKED' });
          lockTimeRef.current = 0;
        }
      } else if (s.lockStatus === 'LOCKED') {
        const level = computeLockLevel(s.solvent, s.shimQuality, s.lockPhase, s.fieldStability, t);
        dispatch({ type: 'SET_LOCK_LEVEL', payload: level });
        // Lock loss if shim quality becomes very bad
        if (level < 10 && s.lockLevel < 10) {
          dispatch({ type: 'SET_LOCK_STATE', payload: 'LOST' });
        }
      }
    }, 100);
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
  }, [state.lockStatus, state.solvent]);

  // Reset lockTimeRef when lock searching starts
  useEffect(() => {
    if (state.lockStatus === 'SEARCHING') lockTimeRef.current = 0;
  }, [state.lockStatus]);

  // ── Temperature ramp ──────────────────────────────────────
  useEffect(() => {
    tempTimerRef.current = setInterval(() => {
      const s = stateRef.current;
      const diff = s.targetTemp - s.currentTemp;
      if (Math.abs(diff) < 0.05) {
        if (s.vtStatus !== 'STABLE') dispatch({ type: 'SET_VT_STATUS', payload: 'STABLE' });
        return;
      }
      const step = Math.sign(diff) * Math.min(Math.abs(diff), s.tempRampRate / 60);
      dispatch({ type: 'SET_CURRENT_TEMP', payload: s.currentTemp + step });
      dispatch({ type: 'SET_VT_STATUS', payload: diff > 0 ? 'HEATING' : 'COOLING' });
    }, 1000);
    return () => { if (tempTimerRef.current) clearInterval(tempTimerRef.current); };
  }, []);

  // ── Auto shim sequence ────────────────────────────────────
  useEffect(() => {
    if (!state.autoShimming) return;
    const steps = [
      { label: 'ANALYZING FIELD', delay: 800 },
      { label: 'OPTIMIZING Z1', delay: 1200 },
      { label: 'OPTIMIZING Z2', delay: 1200 },
      { label: 'OPTIMIZING Z3/Z4', delay: 1000 },
      { label: 'OPTIMIZING X/Y', delay: 1000 },
      { label: 'VERIFYING HOMOGENEITY', delay: 800 },
      { label: 'SHIM COMPLETE', delay: 500 },
    ];
    let cumDelay = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    steps.forEach((step, i) => {
      cumDelay += step.delay;
      const t = setTimeout(() => {
        dispatch({ type: 'SET_AUTO_SHIM_STEP', payload: step.label });
        // Gradually improve shims towards optimal
        const progress = (i + 1) / steps.length;
        const currentShims = stateRef.current.shims;
        const optimal = autoShimOptimal();
        const newShims = {
          Z1: currentShims.Z1 * (1 - progress * 0.7),
          Z2: currentShims.Z2 * (1 - progress * 0.7),
          Z3: currentShims.Z3 * (1 - progress * 0.7),
          Z4: currentShims.Z4 * (1 - progress * 0.7),
          X:  currentShims.X  * (1 - progress * 0.7),
          Y:  currentShims.Y  * (1 - progress * 0.7),
          XZ: currentShims.XZ * (1 - progress * 0.7),
          YZ: currentShims.YZ * (1 - progress * 0.7),
        };
        dispatch({ type: 'SET_SHIMS', payload: newShims });

        if (i === steps.length - 1) {
          dispatch({ type: 'SET_AUTO_SHIM_RUNNING', payload: false });
          dispatch({ type: 'SHOW_NOTIFICATION', payload: { level: 'INFO', title: 'AUTO SHIM COMPLETE', message: 'Field homogeneity optimized.' } });
          dispatch({ type: 'ADD_EVENT', payload: { message: 'Auto shim complete — shims optimized', level: 'INFO' } });
        }
      }, cumDelay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [state.autoShimming]);

  // ── Auto tune sequence ────────────────────────────────────
  useEffect(() => {
    if (!state.autoTuning) return;
    const steps = [
      { state: 'TUNING' as const, errorHz: 500000, errorDB: -6, delay: 600 },
      { state: 'TUNING' as const, errorHz: 100000, errorDB: -3, delay: 800 },
      { state: 'MATCHING' as const, errorHz: 10000, errorDB: -1.5, delay: 700 },
      { state: 'MATCHING' as const, errorHz: 2000, errorDB: -0.5, delay: 600 },
      { state: 'OPTIMAL' as const, errorHz: 0, errorDB: 0, delay: 500 },
    ];
    let cumDelay = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach(step => {
      cumDelay += step.delay;
      const t = setTimeout(() => {
        dispatch({ type: 'SET_TUNE_STATE', payload: step.state });
        dispatch({ type: 'SET_TUNING_ERROR', payload: step.errorHz });
        dispatch({ type: 'SET_MATCHING_ERROR', payload: step.errorDB });
      }, cumDelay);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [state.autoTuning]);

  // ── Acquisition simulation ────────────────────────────────
  useEffect(() => {
    if (state.acqStatus !== 'PREPARING' && state.acqStatus !== 'ACQUIRING') return;

    // Dummy scans
    if (state.acqStatus === 'PREPARING') {
      const dsTime = state.DS * (state.D1 + state.AQ) * 200; // compressed time
      const t = setTimeout(() => {
        dispatch({ type: 'SET_ACQ_STATUS', payload: 'ACQUIRING' });
        dispatch({ type: 'SET_CURRENT_SCAN', payload: 0 });
        dispatch({ type: 'ADD_EVENT', payload: { message: `Dummy scans complete — starting NS=${state.NS}`, level: 'INFO' } });
      }, Math.min(dsTime, 500));
      return () => clearTimeout(t);
    }

    if (state.acqStatus !== 'ACQUIRING' || state.acqPaused) return;

    const scanInterval = Math.max(200, Math.min(1500, (state.D1 + state.AQ) * 300)); // compressed
    acqTimerRef.current = setInterval(() => {
      const s = stateRef.current;
      if (s.acqStatus !== 'ACQUIRING' || s.acqPaused) return;

      const nextScan = s.currentScan + 1;
      dispatch({ type: 'SET_CURRENT_SCAN', payload: nextScan });

      // Generate FID for this scan
      const sample = SAMPLE_LIBRARY[s.selectedSample];
      const peaks = getPeaksForNucleus(sample, s.nucleus);
      const solventInfo = SOLVENT_INFO[s.solvent];
      const fid = generateFID({
        peaks,
        solventPPM: solventInfo.residualPPM,
        showSolvent: true,
        suppressSolvent: s.solventSuppression,
        suppressionStrength: s.suppressionStrength,
        nucleus: s.nucleus,
        SW: s.SW,
        O1: s.O1,
        TD: Math.min(s.TD, 4096),
        AQ: s.AQ,
        shimQuality: s.shimQuality,
        receiverGain: s.receiverGain,
        NS: nextScan,
        concentration: s.concentration,
        temperature: s.currentTemp,
        solventSuppression: s.solventSuppression,
        decouplerOn: s.decouplerOn,
        nucleus13Cmode: s.nucleus === '13C',
        seed: nextScan * 7 + 42,
      });
      dispatch({ type: 'SET_FID', payload: fid });

      if (nextScan >= s.NS) {
        clearInterval(acqTimerRef.current!);
        dispatch({ type: 'ACQUISITION_COMPLETE' });
      }
    }, scanInterval);

    return () => { if (acqTimerRef.current) clearInterval(acqTimerRef.current); };
  }, [state.acqStatus, state.acqPaused]);

  // ── Processing simulation ─────────────────────────────────
  useEffect(() => {
    if (state.processingStatus !== 'APODIZING') return;
    const steps: Array<{ status: ProcessingState; progress: number; delay: number }> = [
      { status: 'APODIZING',   progress: 15,  delay: 300 },
      { status: 'ZEROFILLING', progress: 30,  delay: 250 },
      { status: 'FOURIER',     progress: 55,  delay: 400 },
      { status: 'PHASE',       progress: 70,  delay: 250 },
      { status: 'BASELINE',    progress: 85,  delay: 200 },
      { status: 'REFERENCE',   progress: 95,  delay: 150 },
    ];
    let cumDelay = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach(step => {
      cumDelay += step.delay;
      const t = setTimeout(() => {
        dispatch({ type: 'SET_PROCESSING_STATUS', payload: step.status });
        dispatch({ type: 'SET_PROCESSING_PROGRESS', payload: step.progress });
        if (step.status === 'ADD_EVENT' as any) {
          dispatch({ type: 'ADD_EVENT', payload: { message: `Processing: ${step.status}`, level: 'INFO' } });
        }
      }, cumDelay);
      timers.push(t);
    });

    // Generate spectrum after all steps
    cumDelay += 200;
    const finalTimer = setTimeout(() => {
      const s = stateRef.current;
      const sample = SAMPLE_LIBRARY[s.selectedSample];
      const peaks = getPeaksForNucleus(sample, s.nucleus);
      const solventInfo = SOLVENT_INFO[s.solvent];

      if (peaks.length === 0 && (s.nucleus === '19F' || s.nucleus === '31P')) {
        dispatch({
          type: 'ADD_EVENT',
          payload: { message: `No ${s.nucleus} reference peaks defined for ${sample?.name ?? s.selectedSample} — spectrum will show baseline/solvent only`, level: 'WARNING' },
        });
      }

      const spectrum = generateSpectrum({
        peaks,
        solventPPM: solventInfo.residualPPM,
        showSolvent: true,
        suppressSolvent: s.solventSuppression,
        suppressionStrength: s.suppressionStrength,
        nucleus: s.nucleus,
        shimQuality: s.shimQuality,
        receiverGain: s.receiverGain,
        NS: s.NS,
        concentration: s.concentration,
        phaseCorr0: s.phaseCorr0,
        phaseCorr1: s.phaseCorr1,
        apodLB: s.apodLB,
        windowFunction: s.windowFunction,
        magnitudeMode: s.magnitudeMode,
        solventSuppression: s.solventSuppression,
        decouplerOn: s.decouplerOn,
        referenceShift: s.referenceShift,
        spinnerArtifact: s.spinnerStatus !== 'STOPPED' && s.shimQuality < 0.6,
        spinRate: s.spinRate,
        nPoints: 4096,
      });

      dispatch({ type: 'SET_SPECTRUM', payload: spectrum });
      dispatch({ type: 'PROCESSING_COMPLETE' });
      dispatch({ type: 'SET_ACTIVE_PANEL', payload: 'peaks' });
    }, cumDelay);
    timers.push(finalTimer);

    return () => timers.forEach(clearTimeout);
  }, [state.processingStatus === 'APODIZING' ? state.processingStatus : null]);

  // ── 2D NMR simulation ─────────────────────────────────────
  useEffect(() => {
    if (!state.twoDRunning) return;
    let progress = 0;
    twoDTimerRef.current = setInterval(() => {
      const s = stateRef.current;
      if (!s.twoDRunning) { clearInterval(twoDTimerRef.current!); return; }
      progress += 100 / (s.twoDT1Increments * 0.5); // compressed
      dispatch({ type: 'SET_2D_PROGRESS', payload: Math.min(100, progress) });
      if (progress >= 100) {
        clearInterval(twoDTimerRef.current!);
        // Generate 2D data
        const sample = SAMPLE_LIBRARY[s.selectedSample];
        const peaks = sample?.peaks1H ?? [];
        const data = generate2DSpectrum(s.twoDExperiment, peaks, 128, 256);
        dispatch({ type: 'SET_2D_DATA', payload: data });
        dispatch({ type: 'SET_2D_RUNNING', payload: false });
      }
    }, 150);
    return () => { if (twoDTimerRef.current) clearInterval(twoDTimerRef.current); };
  }, [state.twoDRunning]);

  // ── Quick Start workflow ──────────────────────────────────
  useEffect(() => {
    if (!state.quickStartRunning) return;
    const steps = [
      { msg: 'Loading sample...', delay: 100, action: () => { dispatch({ type: 'LOAD_SAMPLE' }); dispatch({ type: 'SELECT_SAMPLE', payload: 'ethanol' }); dispatch({ type: 'SELECT_SOLVENT', payload: 'CDCl3' }); }},
      { msg: 'Sample positioning...', delay: 3500, action: () => {} },
      { msg: 'Starting spinner (20 Hz)...', delay: 500, action: () => { dispatch({ type: 'SET_TARGET_SPIN_RATE', payload: 20 }); dispatch({ type: 'SET_SPINNER_STATUS', payload: 'ACCELERATING' }); }},
      { msg: 'Acquiring lock (CDCl3)...', delay: 1500, action: () => { dispatch({ type: 'ACQUIRE_LOCK' }); }},
      { msg: 'Lock acquired. Running auto shim...', delay: 4000, action: () => { dispatch({ type: 'START_AUTO_SHIM' }); }},
      { msg: 'Auto shimming...', delay: 7500, action: () => {} },
      { msg: 'Auto tune/match...', delay: 500, action: () => { dispatch({ type: 'AUTO_TUNE' }); }},
      { msg: 'Setting up 1H experiment...', delay: 4000, action: () => { dispatch({ type: 'SET_EXPERIMENT', payload: '1H_1D' }); }},
      { msg: 'Starting acquisition (NS=16)...', delay: 500, action: () => { dispatch({ type: 'START_ACQUISITION' }); }},
      { msg: 'Acquiring...', delay: 500, action: () => {} },
      { msg: 'Processing spectrum...', delay: 8000, action: () => { dispatch({ type: 'START_PROCESSING' }); }},
      { msg: 'Quick start complete!', delay: 3000, action: () => { dispatch({ type: 'SET_QUICK_START', payload: { running: false, step: '' } }); dispatch({ type: 'SET_ACTIVE_PANEL', payload: 'spectrum' }); dispatch({ type: 'SET_VIEW_MODE', payload: 'CONSOLE' }); }},
    ];
    let cumDelay = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach(step => {
      cumDelay += step.delay;
      const t = setTimeout(() => {
        dispatch({ type: 'SET_QUICK_START', payload: { running: true, step: step.msg } });
        step.action();
      }, cumDelay);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [state.quickStartRunning && !state.quickStartStep]);

  return null;
}

// ────────────────────────────────────────────────────────────
// TwoDViewer placeholder — defined inline for brevity
// ────────────────────────────────────────────────────────────
function TwoDViewerInline() {
  const { state } = useNMR();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    observer.observe(container);

    function draw() {
      const W = canvas!.width;
      const H = canvas!.height;
      const ctx = canvas!.getContext('2d')!;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      const data = state.twoDData;
      if (!data || data.length === 0) {
        ctx.fillStyle = '#333333';
        ctx.font = '11px JetBrains Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          state.twoDRunning ? `${state.twoDExperiment} — ${state.twoDProgress.toFixed(0)}%` : '2D VIEWER — Run 2D NMR experiment',
          W / 2, H / 2
        );
        if (state.twoDRunning) {
          const progress = state.twoDProgress / 100;
          ctx.fillStyle = '#ffffff22';
          ctx.fillRect(30, H / 2 + 20, (W - 60) * progress, 4);
          ctx.strokeStyle = '#333333';
          ctx.strokeRect(30, H / 2 + 20, W - 60, 4);
        }
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      // Draw 2D contour map
      const nF1 = data.length;
      const nF2 = data[0].length;
      const MARGIN = 30;
      const pw = W - MARGIN * 2;
      const ph = H - MARGIN * 2;
      const cellW = pw / nF2;
      const cellH = ph / nF1;

      let maxVal = 0;
      for (let i = 0; i < nF1; i++) for (let j = 0; j < nF2; j++) maxVal = Math.max(maxVal, data[i][j]);

      // Color map: black→blue→cyan→white
      for (let i = 0; i < nF1; i++) {
        for (let j = 0; j < nF2; j++) {
          const v = data[i][j] / (maxVal || 1);
          if (v < 0.05) continue;
          const alpha = Math.min(1, v * 1.5);
          const gray = Math.round(v * 255);
          const r = gray;
          const g = gray;
          const b = gray;
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(MARGIN + j * cellW, MARGIN + i * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
        }
      }

      // Axes
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN, MARGIN, pw, ph);
      ctx.fillStyle = '#999999';
      ctx.font = '9px JetBrains Mono,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('F2 (ppm)', W / 2, H - 5);
      ctx.save();
      ctx.translate(10, H / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('F1 (ppm)', 0, 0);
      ctx.restore();

      // Experiment label
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(`${state.twoDExperiment} — ${state.nucleus}`, MARGIN + 5, MARGIN + 14);

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frameRef.current); observer.disconnect(); };
  }, [state.twoDData, state.twoDRunning, state.twoDProgress, state.twoDExperiment, state.nucleus]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ background: '#0000' }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Layout
// ────────────────────────────────────────────────────────────
function NMRApp() {
  const { state, dispatch } = useNMR();

  // Determine what to show in the main area
  const showConsole = state.viewMode === 'CONSOLE';
  const show2D = state.twoDData.length > 0 || state.twoDRunning;
  const show1D = state.spectrumReady || state.acqStatus !== 'IDLE';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0000' }}>
      <SimulationController />
      <TopBar />
      <NotificationToast />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Hamburger Menu sidebar */}
        <MenuPanel />

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden min-w-0">

          {/* Left: Instrument / Hardware view */}
          {(!showConsole || state.viewMode === 'INSTRUMENT') && (
            <div
              className="flex-shrink-0 overflow-y-auto"
              style={{
                width: showConsole ? '0px' : '100%',
                transition: 'width 0.2s ease',
                borderRight: '1px solid #333333',
                overflow: showConsole ? 'hidden' : 'auto',
              }}
            >
              <HardwareView />
            </div>
          )}

          {/* Center/Right: Console view */}
          {showConsole && (
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              {/* Spectrum or 2D viewer */}
              <div className="flex-1 overflow-hidden min-h-0" style={{ minHeight: '200px' }}>
                {show2D && (state.activePanel === '2dnmr' || state.twoDRunning || state.twoDData.length > 0) ? (
                  <TwoDViewerInline />
                ) : (
                  <SpectrumViewer />
                )}
              </div>

              {/* FID viewer — bottom strip */}
              <div style={{ height: '120px', flexShrink: 0 }}>
                <FIDViewer />
              </div>
            </div>
          )}

          {/* If instrument view: show spectrum/FID on right */}
          {!showConsole && (state.activePanel === 'spectrum' || state.viewMode !== 'INSTRUMENT') && (
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              {/* Spectrum */}
              <div className="flex-1 overflow-hidden min-h-0" style={{ minHeight: '200px' }}>
                {show2D && (state.twoDData.length > 0 || state.twoDRunning) ? (
                  <TwoDViewerInline />
                ) : (
                  <SpectrumViewer />
                )}
              </div>
              {/* FID + Event log */}
              <div className="flex overflow-hidden" style={{ height: '180px', flexShrink: 0, borderTop: '1px solid #333333' }}>
                <div className="flex-1 min-w-0">
                  <FIDViewer />
                </div>
                <div className="flex-shrink-0" style={{ width: '260px', borderLeft: '1px solid #333333' }}>
                  <EventLog compact />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spectrum fullscreen overlay */}
      {state.spectrumFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0000' }}>
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #333333', background: '#111111' }}>
            <span className="font-mono text-[12px] font-bold text-[#ffffff]">SPECTRUM — FULLSCREEN</span>
            <button className="nmr-btn text-[11px]" onClick={() => dispatch({ type: 'TOGGLE_SPECTRUM_FULLSCREEN' })}>✕ CLOSE</button>
          </div>
          <div className="flex-1 min-h-0">
            <SpectrumViewer />
          </div>
        </div>
      )}

      {/* Fullscreen spectrum button */}
      {state.spectrumReady && !state.spectrumFullscreen && (
        <button
          className="fixed bottom-4 right-4 nmr-btn text-[10px] z-40"
          onClick={() => dispatch({ type: 'TOGGLE_SPECTRUM_FULLSCREEN' })}
          title="Fullscreen spectrum"
        >⛶ SPECTRUM FS</button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Root with Provider
// ────────────────────────────────────────────────────────────
export default function App() {
  return (
    <NMRProvider>
      <NMRApp />
    </NMRProvider>
  );
}
