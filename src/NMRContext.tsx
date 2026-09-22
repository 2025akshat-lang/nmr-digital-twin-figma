import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import type {
  NMRState, NMRAction, PanelId, Nucleus, Solvent, ShimValues,
  SampleState, AirState, SpinnerStatus, LockState, TuneState,
  AcqState, VTStatus, ProcessingState, ViewMode, AlarmLevel,
  EventEntry, Alarm, QueueItem, SavedExperiment, Integration, PickedPeak,
  RelaxationPoint,
} from './types';
import {
  NUCLEUS_FREQ, NUCLEUS_SW_DEFAULT, LOCK_FREQ_2H, SOLVENT_INFO,
  SAMPLE_LIBRARY, computeShimQuality, autoShimOptimal, nowStr,
  EXPERIMENT_PRESETS, NUCLEUS_PPM_RANGE,
} from './simulation';

// ────────────────────────────────────────────────────────────
// Initial State
// ────────────────────────────────────────────────────────────
const IDEAL_SHIMS: ShimValues = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, X: 0, Y: 0, XZ: 0, YZ: 0 };
const INITIAL_SHIMS: ShimValues = { Z1: 45, Z2: -180, Z3: 60, Z4: -20, X: 30, Y: -25, XZ: 40, YZ: -15 };

function makeInitialState(): NMRState {
  const shims = INITIAL_SHIMS;
  return {
    power: 'OFF',
    systemStatus: 'SYSTEM OFF',
    consoleStatus: 'OFFLINE',
    commStatus: 'DISCONNECTED',

    magnetField: 11.7437,
    magnetFreq1H: 500.000,
    magnetStability: 'STABLE',
    magnetTemp: 4.2,
    magnetWarning: false,

    heliumLevel: 88,
    nitrogenLevel: 72,
    cryoStatus: 'NORMAL',

    sampleState: 'NONE',
    sampleId: '',
    solvent: 'None',
    tubeSize: '5mm',
    concentration: 50,
    sampleVolume: 600,
    selectedSample: 'ethanol',
    sampleYPct: 0,

    airState: 'OFF',
    airFlow: 0,

    spinnerStatus: 'STOPPED',
    spinRate: 0,
    targetSpinRate: 20,

    probeType: '5mm BBO SmartProbe',
    probeStatus: 'NOT_READY',
    observeNucleus: '1H',
    decouplingNucleus: '2H',
    probeTemp: 298,
    decouplerOn: false,

    tuneStatus: 'UNTUNED',
    tuningErrorHz: 850000,
    matchingErrorDB: -8.5,
    autoTuning: false,

    targetTemp: 25,
    currentTemp: 25,
    vtStatus: 'STABLE',
    tempRampRate: 5,
    tempStable: true,

    lockStatus: 'OFF',
    lockLevel: 0,
    lockPhase: 0,
    lockFrequency: LOCK_FREQ_2H,
    fieldStability: 0.05,
    autoShimming: false,
    autoShimStep: '',

    shims,
    shimQuality: computeShimQuality(shims),

    rfFrequency: NUCLEUS_FREQ['1H'],
    rfPower: -10,
    pulseWidth90: 9.6,
    rfPhase: 0,
    receiverGain: 40,
    receiverBandwidth: 100,
    receiverOverflow: false,
    rfActive: false,

    experiment: '1H_1D',
    nucleus: '1H',
    NS: 16,
    DS: 2,
    D1: 1.0,
    AQ: 2.0,
    SW: NUCLEUS_SW_DEFAULT['1H'],
    O1: 0,
    TD: 32768,
    pulprog: 'zg',
    digitalFilter: true,
    solventSuppression: false,
    suppressionStrength: 85,

    acqStatus: 'IDLE',
    currentScan: 0,
    acqStartTime: 0,
    acqPaused: false,

    fidData: null,
    fidSingleScan: null,

    twoDExperiment: 'COSY',
    twoDT1Increments: 128,
    twoDProgress: 0,
    twoDData: [],
    twoDRunning: false,

    relaxationType: 'T1',
    relaxationData: [],
    T1fitted: 0,
    T2fitted: 0,

    dosyData: [],

    processingStatus: 'IDLE',
    processingProgress: 0,
    apodLB: 0.3,
    zeroFillFactor: 2,
    phaseCorr0: 0,
    phaseCorr1: 0,
    baselineOrder: 1,
    referenceMode: 'SOLVENT',
    referenceShift: 0,
    magnitudeMode: false,
    windowFunction: 'EXPONENTIAL',

    spectrumPPM: [],
    spectrumIntensity: [],
    spectrumReady: false,

    pickedPeaks: [],
    integrations: [],
    peakThreshold: 10,

    qnmrRefConc: 1.0,
    qnmrRefIntegral: 1.0,
    qnmrRefNuclei: 1,
    qnmrAnalyteIntegral: 1.0,
    qnmrAnalyteNuclei: 1,

    experimentQueue: [],
    automationRunning: false,
    currentQueueIndex: -1,

    savedExperiments: [],

    eventLog: [],
    alarms: [],

    activePanel: 'none',
    menuOpen: false,
    viewMode: 'INSTRUMENT',
    educationalMode: false,
    expertMode: false,
    quickStartRunning: false,
    quickStartStep: '',
    spectrumFullscreen: false,

    notification: null,
  };
}

// ────────────────────────────────────────────────────────────
// Event log helper
// ────────────────────────────────────────────────────────────
let eventIdCounter = 0;
function makeEvent(message: string, level: AlarmLevel): EventEntry {
  return { id: `ev_${++eventIdCounter}`, time: nowStr(), message, level };
}

function addEvent(log: EventEntry[], message: string, level: AlarmLevel): EventEntry[] {
  const entry = makeEvent(message, level);
  return [entry, ...log].slice(0, 200);
}

// ────────────────────────────────────────────────────────────
// Reducer
// ────────────────────────────────────────────────────────────
function nmrReducer(state: NMRState, action: NMRAction): NMRState {
  switch (action.type) {

    case 'POWER_ON': {
      if (state.power !== 'OFF') return state;
      return {
        ...state,
        power: 'BOOTING',
        systemStatus: 'BOOTING...',
        consoleStatus: 'INITIALIZING',
        commStatus: 'CONNECTING',
        eventLog: addEvent(state.eventLog, 'System power ON — booting', 'INFO'),
        notification: { visible: true, level: 'INFO', title: 'SYSTEM BOOTING', message: 'NMR console initializing...' },
      };
    }

    case 'POWER_OFF': {
      return {
        ...makeInitialState(),
        eventLog: addEvent(state.eventLog, 'System power OFF', 'WARNING'),
        magnetField: state.magnetField,
        magnetFreq1H: state.magnetFreq1H,
        magnetStability: state.magnetStability,
        magnetTemp: state.magnetTemp,
        heliumLevel: state.heliumLevel,
        nitrogenLevel: state.nitrogenLevel,
        cryoStatus: state.cryoStatus,
      };
    }

    case 'SET_POWER':
      return { ...state, power: action.payload };

    case 'SET_SYSTEM_STATUS': {
      const updates: Partial<NMRState> = { systemStatus: action.payload };
      if (action.payload === 'SYSTEM READY') {
        updates.consoleStatus = 'ONLINE';
        updates.commStatus = 'CONNECTED';
        updates.probeStatus = 'READY';
        updates.eventLog = addEvent(state.eventLog, 'System ready — probe online', 'INFO');
      }
      return { ...state, ...updates };
    }

    case 'LOAD_SAMPLE': {
      if (state.power === 'OFF') return state;
      if (state.sampleState !== 'NONE' && state.sampleState !== 'EJECTED') return state;
      return {
        ...state,
        sampleState: 'LOADING',
        airState: 'EJECT',
        airFlow: 8.5,
        sampleYPct: 0,
        eventLog: addEvent(state.eventLog, 'Sample loading — air eject active', 'INFO'),
      };
    }

    case 'EJECT_SAMPLE': {
      if (state.spinnerStatus !== 'STOPPED') {
        return {
          ...state,
          notification: { visible: true, level: 'ERROR', title: 'EJECTION BLOCKED', message: 'Stop spinner before ejecting sample.' },
          eventLog: addEvent(state.eventLog, 'EJECTION BLOCKED: spinner active', 'ERROR'),
        };
      }
      return {
        ...state,
        sampleState: 'EJECTING',
        airState: 'EJECT',
        airFlow: 10.0,
        lockStatus: 'OFF',
        lockLevel: 0,
        spinnerStatus: 'STOPPED',
        spinRate: 0,
        eventLog: addEvent(state.eventLog, 'Sample ejection initiated', 'INFO'),
      };
    }

    case 'SET_SAMPLE_STATE':
      return { ...state, sampleState: action.payload };

    case 'SET_SAMPLE_Y': {
      const pct = action.payload;
      // Derive air state from sample position
      let airState = state.airState;
      let airFlow = state.airFlow;
      if (state.sampleState === 'LOADING' || state.sampleState === 'POSITIONING') {
        if (pct < 20) { airState = 'EJECT'; airFlow = 8.5; }
        else if (pct < 50) { airState = 'CUSHIONING'; airFlow = 6.0; }
        else if (pct < 80) { airState = 'SUPPORT'; airFlow = 3.0; }
        else { airState = 'DRIVE'; airFlow = 1.5; }
      } else if (state.sampleState === 'EJECTING') {
        if (pct > 20) { airState = 'EJECT'; airFlow = 10.0; }
        else { airState = 'OFF'; airFlow = 0; }
      }
      return { ...state, sampleYPct: pct, airState, airFlow };
    }

    case 'SET_AIR_STATE':
      return { ...state, airState: action.payload };

    case 'SET_AIR_FLOW':
      return { ...state, airFlow: action.payload };

    case 'SELECT_SAMPLE':
      return { ...state, selectedSample: action.payload };

    case 'SELECT_SOLVENT': {
      const info = SOLVENT_INFO[action.payload];
      return {
        ...state,
        solvent: action.payload,
        lockFrequency: LOCK_FREQ_2H + info.lockFreqOffset / 1e6,
        lockStatus: 'OFF',
        lockLevel: 0,
        eventLog: addEvent(state.eventLog, `Solvent set: ${action.payload}`, 'INFO'),
      };
    }

    case 'SET_CONCENTRATION':
      return { ...state, concentration: action.payload };

    case 'SET_SAMPLE_ID':
      return { ...state, sampleId: action.payload };

    case 'SET_SPINNER_STATUS':
      return { ...state, spinnerStatus: action.payload };

    case 'SET_SPIN_RATE':
      return { ...state, spinRate: action.payload };

    case 'SET_TARGET_SPIN_RATE':
      return { ...state, targetSpinRate: action.payload };

    case 'SET_PROBE_STATUS':
      return { ...state, probeStatus: action.payload };

    case 'SET_OBSERVE_NUCLEUS': {
      // NOTE: observeNucleus (probe) and nucleus (acquisition) must always
      // be the SAME physical nucleus — this reducer is the single source of
      // truth for both, so selecting a probe nucleus can never desync from
      // the nucleus actually used for acquisition/spectrum generation.
      if (action.payload === state.observeNucleus && action.payload === state.nucleus) return state;
      const freq = NUCLEUS_FREQ[action.payload];
      const sw = NUCLEUS_SW_DEFAULT[action.payload];
      const preset = Object.values(EXPERIMENT_PRESETS).find(p => p.nucleus === action.payload && p.category === '1D');
      return {
        ...state,
        observeNucleus: action.payload,
        nucleus: action.payload,
        rfFrequency: freq,
        SW: sw,
        TD: preset?.TD ?? state.TD,
        tuneStatus: 'UNTUNED',
        matchingErrorDB: -8.5,
        tuningErrorHz: 850000,
        // Changing nucleus mid-run invalidates whatever was picked/acquired
        pickedPeaks: [],
        integrations: [],
        spectrumReady: false,
        eventLog: addEvent(state.eventLog, `Observe nucleus: ${action.payload} (${freq.toFixed(3)} MHz)`, 'INFO'),
      };
    }

    case 'SET_DECOUPLER':
      return { ...state, decouplerOn: action.payload };

    case 'SET_TARGET_TEMP':
      return { ...state, targetTemp: action.payload, vtStatus: action.payload > state.currentTemp ? 'HEATING' : action.payload < state.currentTemp ? 'COOLING' : 'STABLE', tempStable: false };

    case 'SET_CURRENT_TEMP': {
      const stable = Math.abs(action.payload - state.targetTemp) < 0.2;
      return { ...state, currentTemp: action.payload, tempStable: stable, vtStatus: stable ? 'STABLE' : state.vtStatus };
    }

    case 'SET_VT_STATUS':
      return { ...state, vtStatus: action.payload };

    case 'ACQUIRE_LOCK': {
      if (state.solvent === 'None') {
        return {
          ...state,
          notification: { visible: true, level: 'ERROR', title: 'LOCK FAILED', message: 'No solvent selected. Select a deuterated solvent first.' },
          eventLog: addEvent(state.eventLog, 'LOCK FAILED: no solvent selected', 'ERROR'),
        };
      }
      if (state.sampleState !== 'POSITIONED') {
        return {
          ...state,
          notification: { visible: true, level: 'WARNING', title: 'NO SAMPLE', message: 'Load and position sample before acquiring lock.' },
        };
      }
      return {
        ...state,
        lockStatus: 'SEARCHING',
        lockLevel: 0,
        eventLog: addEvent(state.eventLog, `Lock search initiated — solvent: ${state.solvent}`, 'INFO'),
      };
    }

    case 'RELEASE_LOCK':
      return { ...state, lockStatus: 'OFF', lockLevel: 0, eventLog: addEvent(state.eventLog, 'Lock released', 'WARNING') };

    case 'SET_LOCK_STATE': {
      const updates: Partial<NMRState> = { lockStatus: action.payload };
      if (action.payload === 'LOCKED') {
        updates.eventLog = addEvent(state.eventLog, `Lock acquired — ${state.solvent}`, 'INFO');
        updates.notification = { visible: true, level: 'INFO', title: 'LOCK ACQUIRED', message: `Deuterium lock established on ${state.solvent}` };
        updates.fieldStability = 0.03;
      } else if (action.payload === 'LOST') {
        updates.eventLog = addEvent(state.eventLog, 'LOCK LOST — field drift detected', 'ERROR');
        updates.notification = { visible: true, level: 'ERROR', title: 'LOCK LOST', message: 'Re-acquire lock before continuing.' };
        updates.fieldStability = 2.0;
      }
      return { ...state, ...updates };
    }

    case 'SET_LOCK_LEVEL':
      return { ...state, lockLevel: action.payload };

    case 'SET_LOCK_PHASE':
      return { ...state, lockPhase: Math.max(-180, Math.min(180, action.payload)) };

    case 'AUTO_PHASE_LOCK':
      return { ...state, lockPhase: 0, eventLog: addEvent(state.eventLog, 'Lock phase auto-optimized', 'INFO') };

    case 'START_AUTO_SHIM': {
      if (state.lockStatus !== 'LOCKED') {
        return {
          ...state,
          notification: { visible: true, level: 'WARNING', title: 'SHIM BLOCKED', message: 'Lock must be acquired before auto-shimming.' },
        };
      }
      return { ...state, autoShimming: true, autoShimStep: 'ANALYZING FIELD', eventLog: addEvent(state.eventLog, 'Auto shim sequence started', 'INFO') };
    }

    case 'SET_AUTO_SHIM_RUNNING':
      return { ...state, autoShimming: action.payload };

    case 'SET_AUTO_SHIM_STEP':
      return { ...state, autoShimStep: action.payload };

    case 'SET_SHIM': {
      const newShims = { ...state.shims, [action.payload.key]: action.payload.value };
      return { ...state, shims: newShims, shimQuality: computeShimQuality(newShims) };
    }

    case 'SET_SHIM_QUALITY':
      return { ...state, shimQuality: action.payload };

    case 'SET_SHIMS': {
      return { ...state, shims: action.payload, shimQuality: computeShimQuality(action.payload) };
    }

    case 'AUTO_TUNE': {
      if (state.power === 'OFF') return state;
      return {
        ...state,
        tuneStatus: 'TUNING',
        autoTuning: true,
        eventLog: addEvent(state.eventLog, `Auto tune/match started — ${state.observeNucleus}`, 'INFO'),
      };
    }

    case 'SET_TUNE_STATE': {
      const updates: Partial<NMRState> = { tuneStatus: action.payload };
      if (action.payload === 'OPTIMAL') {
        updates.autoTuning = false;
        updates.tuningErrorHz = 0;
        updates.matchingErrorDB = 0;
        updates.eventLog = addEvent(state.eventLog, 'Probe tuned and matched — OPTIMAL', 'INFO');
        updates.notification = { visible: true, level: 'INFO', title: 'RF TUNE COMPLETE', message: 'Probe is tuned and matched.' };
      }
      return { ...state, ...updates };
    }

    case 'SET_TUNING_ERROR':
      return { ...state, tuningErrorHz: action.payload };

    case 'SET_MATCHING_ERROR':
      return { ...state, matchingErrorDB: action.payload };

    case 'SET_NUCLEUS': {
      if (action.payload === state.nucleus && action.payload === state.observeNucleus) return state;
      const freq = NUCLEUS_FREQ[action.payload];
      const sw = NUCLEUS_SW_DEFAULT[action.payload];
      const preset = Object.values(EXPERIMENT_PRESETS).find(p => p.nucleus === action.payload && p.category === '1D');
      return {
        ...state,
        nucleus: action.payload,
        observeNucleus: action.payload, // keep probe display in sync
        rfFrequency: freq,
        SW: sw,
        TD: preset?.TD ?? 32768,
        tuneStatus: 'UNTUNED',
        pickedPeaks: [],
        integrations: [],
        spectrumReady: false,
        eventLog: addEvent(state.eventLog, `Nucleus: ${action.payload} @ ${freq.toFixed(3)} MHz`, 'INFO'),
      };
    }

    case 'SET_EXPERIMENT': {
      const preset = EXPERIMENT_PRESETS[action.payload];
      if (!preset) return { ...state, experiment: action.payload };
      const nucleusChanged = preset.nucleus !== state.nucleus;
      return {
        ...state,
        experiment: action.payload,
        nucleus: preset.nucleus,
        observeNucleus: preset.nucleus, // keep probe display in sync with experiment
        NS: preset.NS,
        DS: preset.DS,
        D1: preset.D1,
        AQ: preset.AQ,
        SW: preset.SW,
        TD: preset.TD,
        pulprog: preset.pulprog,
        rfFrequency: NUCLEUS_FREQ[preset.nucleus],
        // If the nucleus actually changed, the probe is no longer tuned for it
        tuneStatus: nucleusChanged ? 'UNTUNED' : state.tuneStatus,
        eventLog: addEvent(state.eventLog, `Experiment: ${preset.name}`, 'INFO'),
      };
    }

    case 'SET_ACQ_PARAM':
      return { ...state, [action.payload.key]: action.payload.value };

    case 'START_ACQUISITION': {
      // Full prerequisite validation
      const errors: string[] = [];
      if (state.power === 'OFF') errors.push('System not powered');
      if (state.sampleState !== 'POSITIONED') errors.push('No sample positioned');
      if (state.solvent === 'None') errors.push('No solvent selected');
      if (state.lockStatus !== 'LOCKED') errors.push('Lock not acquired');
      if (state.shimQuality < 0.3) errors.push('Shim quality too poor');
      if (state.tuneStatus !== 'OPTIMAL') errors.push('RF not tuned/matched');
      if (!state.tempStable) errors.push('Temperature not stable');
      if (state.probeStatus !== 'READY') errors.push('Probe not ready');

      if (errors.length > 0) {
        return {
          ...state,
          notification: {
            visible: true,
            level: 'ERROR',
            title: 'ACQUISITION BLOCKED',
            message: errors.join(' | '),
          },
          eventLog: addEvent(state.eventLog, `ACQ BLOCKED: ${errors[0]}`, 'ERROR'),
        };
      }

      return {
        ...state,
        acqStatus: 'PREPARING',
        currentScan: 0,
        acqStartTime: Date.now(),
        rfActive: true,
        receiverOverflow: false,
        fidData: null,
        fidSingleScan: null,
        spectrumReady: false,
        pickedPeaks: [],
        integrations: [],
        eventLog: addEvent(state.eventLog, `Acquisition started — ${EXPERIMENT_PRESETS[state.experiment]?.name ?? state.experiment} NS=${state.NS}`, 'INFO'),
      };
    }

    case 'PAUSE_ACQUISITION':
      return { ...state, acqPaused: true, eventLog: addEvent(state.eventLog, 'Acquisition paused', 'WARNING') };

    case 'RESUME_ACQUISITION':
      return { ...state, acqPaused: false, eventLog: addEvent(state.eventLog, 'Acquisition resumed', 'INFO') };

    case 'STOP_ACQUISITION':
      return {
        ...state,
        acqStatus: 'COMPLETE',
        rfActive: false,
        eventLog: addEvent(state.eventLog, `Acquisition stopped at scan ${state.currentScan}/${state.NS}`, 'WARNING'),
      };

    case 'ABORT_ACQUISITION':
      return {
        ...state,
        acqStatus: 'ABORTED',
        rfActive: false,
        fidData: null,
        eventLog: addEvent(state.eventLog, 'Acquisition ABORTED', 'ERROR'),
        notification: { visible: true, level: 'ERROR', title: 'ACQUISITION ABORTED', message: 'Data discarded.' },
      };

    case 'SET_ACQ_STATUS':
      return { ...state, acqStatus: action.payload };

    case 'SET_CURRENT_SCAN':
      return { ...state, currentScan: action.payload };

    case 'SET_FID': {
      const overflow = action.payload.some(v => Math.abs(v) > 3.8);
      return { ...state, fidData: action.payload, fidSingleScan: action.payload, receiverOverflow: overflow };
    }

    case 'SET_RECEIVER_OVERFLOW':
      return { ...state, receiverOverflow: action.payload };

    case 'ACQUISITION_COMPLETE':
      return {
        ...state,
        acqStatus: 'COMPLETE',
        rfActive: false,
        notification: { visible: true, level: 'INFO', title: 'ACQUISITION COMPLETE', message: `${state.NS} scans acquired. Ready to process.` },
        eventLog: addEvent(state.eventLog, `Acquisition complete — ${state.NS} scans`, 'INFO'),
      };

    case 'START_PROCESSING': {
      if (!state.fidData && state.acqStatus !== 'COMPLETE') {
        return {
          ...state,
          notification: { visible: true, level: 'WARNING', title: 'NO DATA', message: 'Acquire data before processing.' },
        };
      }
      return {
        ...state,
        processingStatus: 'APODIZING',
        processingProgress: 0,
        spectrumReady: false,
        eventLog: addEvent(state.eventLog, 'Processing started', 'INFO'),
      };
    }

    case 'SET_PROCESSING_STATUS':
      return { ...state, processingStatus: action.payload };

    case 'SET_PROCESSING_PROGRESS':
      return { ...state, processingProgress: action.payload };

    case 'SET_PROC_PARAM':
      return { ...state, [action.payload.key]: action.payload.value };

    case 'SET_SPECTRUM':
      return { ...state, spectrumPPM: action.payload.ppm, spectrumIntensity: action.payload.intensity };

    case 'PROCESSING_COMPLETE':
      return {
        ...state,
        processingStatus: 'COMPLETE',
        processingProgress: 100,
        spectrumReady: true,
        eventLog: addEvent(state.eventLog, 'Processing complete — spectrum ready', 'INFO'),
        notification: { visible: true, level: 'INFO', title: 'PROCESSING COMPLETE', message: 'Spectrum is ready for analysis.' },
      };

    case 'AUTO_PICK_PEAKS':
      return { ...state, eventLog: addEvent(state.eventLog, `Auto peak pick — threshold ${state.peakThreshold}%`, 'INFO') };

    case 'SET_PICKED_PEAKS':
      return { ...state, pickedPeaks: action.payload };

    case 'ADD_INTEGRATION':
      return { ...state, integrations: [...state.integrations, action.payload] };

    case 'REMOVE_INTEGRATION':
      return { ...state, integrations: state.integrations.filter(i => i.id !== action.payload) };

    case 'NORMALIZE_INTEGRATIONS': {
      if (state.integrations.length === 0) return state;
      const maxRaw = Math.max(...state.integrations.map(i => i.rawValue));
      const normalized = state.integrations.map(i => ({ ...i, normalized: i.rawValue / maxRaw }));
      return { ...state, integrations: normalized };
    }

    case 'START_2D': {
      return {
        ...state,
        twoDExperiment: action.payload,
        twoDRunning: true,
        twoDProgress: 0,
        twoDData: [],
        rfActive: true,
        eventLog: addEvent(state.eventLog, `2D ${action.payload} acquisition started`, 'INFO'),
      };
    }

    case 'SET_2D_PROGRESS':
      return { ...state, twoDProgress: action.payload };

    case 'SET_2D_DATA':
      return { ...state, twoDData: action.payload };

    case 'SET_2D_RUNNING': {
      const updates: Partial<NMRState> = { twoDRunning: action.payload, rfActive: action.payload };
      if (!action.payload && state.twoDRunning) {
        updates.eventLog = addEvent(state.eventLog, `2D ${state.twoDExperiment} acquisition complete`, 'INFO');
        updates.notification = { visible: true, level: 'INFO', title: '2D ACQUISITION COMPLETE', message: `${state.twoDExperiment} dataset ready.` };
      }
      return { ...state, ...updates };
    }

    case 'START_RELAXATION':
      return { ...state, relaxationType: action.payload, relaxationData: [], T1fitted: 0, T2fitted: 0 };

    case 'SET_RELAXATION_DATA':
      return { ...state, relaxationData: action.payload };

    case 'SET_T1_T2': {
      const updates: Partial<NMRState> = {};
      if (action.payload.T1 !== undefined) updates.T1fitted = action.payload.T1;
      if (action.payload.T2 !== undefined) updates.T2fitted = action.payload.T2;
      return { ...state, ...updates };
    }

    case 'ADD_QUEUE_ITEM':
      return { ...state, experimentQueue: [...state.experimentQueue, action.payload] };

    case 'REMOVE_QUEUE_ITEM':
      return { ...state, experimentQueue: state.experimentQueue.filter(q => q.id !== action.payload) };

    case 'START_QUEUE':
      return { ...state, automationRunning: true, currentQueueIndex: 0, eventLog: addEvent(state.eventLog, 'Automation queue started', 'INFO') };

    case 'SET_AUTOMATION_RUNNING':
      return { ...state, automationRunning: action.payload };

    case 'SET_QUEUE_ITEM_STATUS':
      return {
        ...state,
        experimentQueue: state.experimentQueue.map(q =>
          q.id === action.payload.id ? { ...q, status: action.payload.status } : q
        ),
      };

    case 'SAVE_EXPERIMENT': {
      const saved: SavedExperiment = {
        id: `exp_${Date.now()}`,
        name: `${state.experiment}_${state.sampleId || 'sample'}`,
        sampleId: state.sampleId,
        solvent: state.solvent,
        nucleus: state.nucleus,
        frequency: state.rfFrequency,
        temperature: state.currentTemp,
        experiment: state.experiment,
        NS: state.NS,
        dateTime: new Date().toISOString(),
        spectrumPPM: state.spectrumPPM,
        spectrumIntensity: state.spectrumIntensity,
        peaks: state.pickedPeaks,
        integrations: state.integrations,
      };
      return {
        ...state,
        savedExperiments: [...state.savedExperiments, saved],
        eventLog: addEvent(state.eventLog, `Experiment saved: ${saved.name}`, 'INFO'),
      };
    }

    case 'DELETE_EXPERIMENT':
      return { ...state, savedExperiments: state.savedExperiments.filter(e => e.id !== action.payload) };

    case 'SET_ACTIVE_PANEL':
      return { ...state, activePanel: action.payload, menuOpen: false };

    case 'TOGGLE_MENU':
      return { ...state, menuOpen: !state.menuOpen };

    case 'CLOSE_MENU':
      return { ...state, menuOpen: false };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'TOGGLE_EDUCATIONAL_MODE':
      return { ...state, educationalMode: !state.educationalMode };

    case 'TOGGLE_EXPERT_MODE':
      return { ...state, expertMode: !state.expertMode };

    case 'TOGGLE_SPECTRUM_FULLSCREEN':
      return { ...state, spectrumFullscreen: !state.spectrumFullscreen };

    case 'QUICK_START':
      return { ...state, quickStartRunning: true, quickStartStep: 'Initializing...', eventLog: addEvent(state.eventLog, 'Quick Start 1H experiment initiated', 'INFO') };

    case 'SET_QUICK_START':
      return { ...state, quickStartRunning: action.payload.running, quickStartStep: action.payload.step };

    case 'ADD_EVENT':
      return { ...state, eventLog: addEvent(state.eventLog, action.payload.message, action.payload.level) };

    case 'CLEAR_EVENTS':
      return { ...state, eventLog: [] };

    case 'ADD_ALARM': {
      const existing = state.alarms.find(a => a.id === action.payload.id);
      if (existing) return state;
      return { ...state, alarms: [action.payload, ...state.alarms] };
    }

    case 'CLEAR_ALARM':
      return { ...state, alarms: state.alarms.map(a => a.id === action.payload ? { ...a, active: false } : a) };

    case 'SHOW_NOTIFICATION':
      return { ...state, notification: { visible: true, ...action.payload } };

    case 'HIDE_NOTIFICATION':
      return { ...state, notification: null };

    case 'RESET_EXPERIMENT':
      return {
        ...state,
        acqStatus: 'IDLE',
        currentScan: 0,
        fidData: null,
        fidSingleScan: null,
        processingStatus: 'IDLE',
        processingProgress: 0,
        spectrumPPM: [],
        spectrumIntensity: [],
        spectrumReady: false,
        pickedPeaks: [],
        integrations: [],
        rfActive: false,
        receiverOverflow: false,
        twoDRunning: false,
        twoDProgress: 0,
        twoDData: [],
        eventLog: addEvent(state.eventLog, 'Experiment reset', 'INFO'),
      };

    case 'RESET_SIMULATOR':
      return makeInitialState();

    case 'MAGNET_WARNING':
      return { ...state, magnetWarning: action.payload };

    default:
      return state;
  }
}

// ────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────
// Context & Web Worker Setup
// ────────────────────────────────────────────────────────────
interface NMRContextValue {
  state: NMRState;
  dispatch: React.Dispatch<NMRAction>;
  triggerSimulation: (type: 'FID' | 'SPECTRUM' | '2D', params: any) => void;
  isCalculating: boolean;
}

const NMRContext = createContext<NMRContextValue | null>(null);

export function NMRProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(nmrReducer, undefined, makeInitialState);
  const [isCalculating, setIsCalculating] = React.useState(false);
  
  // वर्कर का रेफ (Ref) बनाएँ
  const workerRef = useRef<Worker | null>(null);

  React.useEffect(() => {
    // Vite के अनुकूल वेब वर्कर का इन्स्टांस बनाएँ
    workerRef.current = new Worker(
      new URL('./simulation.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // जब बैकग्राउंड थ्रेड भारी कैलकुलेशन पूरी करके डेटा भेजेगा
    workerRef.current.onmessage = (event: MessageEvent) => {
      const { type, success, data, error } = event.data;
      setIsCalculating(false);

      if (success) {
        if (type === 'GENERATE_FID') {
          dispatch({ type: 'SET_FID', payload: data });
          dispatch({ type: 'ACQUISITION_COMPLETE' });
        } else if (type === 'GENERATE_SPECTRUM') {
          dispatch({ type: 'SET_SPECTRUM', payload: data });
          dispatch({ type: 'PROCESSING_COMPLETE' });
        } else if (type === 'GENERATE_2D') {
          dispatch({ type: 'SET_2D_DATA', payload: data });
          dispatch({ type: 'SET_2D_RUNNING', payload: false });
        }
      } else {
        console.error("Simulation Worker Error:", error);
        dispatch({ type: 'ADD_EVENT', payload: { message: `Simulation Failed: ${error}`, level: 'ERROR' } });
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // भारी कैलकुलेशन को बैकग्राउंड में भेजने वाला मुख्य फंक्शन
  const triggerSimulation = useCallback((type: 'FID' | 'SPECTRUM' | '2D', params: any) => {
    if (!workerRef.current) return;

    setIsCalculating(true);

    if (type === 'FID') {
      dispatch({ type: 'SET_ACQ_STATUS', payload: 'PREPARING' });
      workerRef.current.postMessage({ type: 'GENERATE_FID', params });
    } else if (type === 'SPECTRUM') {
      dispatch({ type: 'SET_PROCESSING_STATUS', payload: 'APODIZING' });
      workerRef.current.postMessage({ type: 'GENERATE_SPECTRUM', params });
    } else if (type === '2D') {
      dispatch({ type: 'SET_2D_RUNNING', payload: true });
      workerRef.current.postMessage({ type: 'GENERATE_2D', params });
    }
  }, []);

  return (
    <NMRContext.Provider value={{ state, dispatch, triggerSimulation, isCalculating }}>
      {children}
    </NMRContext.Provider>
  );
}

export function useNMR(): NMRContextValue {
  const ctx = useContext(NMRContext);
  if (!ctx) throw new Error('useNMR must be used within NMRProvider');
  return ctx;
}

