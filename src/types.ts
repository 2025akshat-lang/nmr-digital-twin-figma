// ============================================================
// NMR Digital Twin — Complete Type Definitions
// ============================================================

export type PowerState = 'OFF' | 'BOOTING' | 'INITIALIZING' | 'READY' | 'RUNNING' | 'WARNING' | 'ERROR';
export type SampleState = 'NONE' | 'LOADING' | 'POSITIONING' | 'POSITIONED' | 'EJECTING' | 'EJECTED';
export type AirState = 'OFF' | 'EJECT' | 'CUSHIONING' | 'SUPPORT' | 'DRIVE';
export type SpinnerStatus = 'STOPPED' | 'ACCELERATING' | 'STABLE' | 'DECELERATING';
export type LockState = 'OFF' | 'SEARCHING' | 'DETECTED' | 'OPTIMIZING' | 'LOCKED' | 'LOST';
export type TuneState = 'UNTUNED' | 'TUNING' | 'MATCHING' | 'OPTIMAL';
export type AcqState = 'IDLE' | 'PREPARING' | 'ACQUIRING' | 'PAUSED' | 'COMPLETE' | 'ABORTED';
export type VTStatus = 'STABLE' | 'HEATING' | 'COOLING' | 'WARNING';
export type ProcessingState = 'IDLE' | 'APODIZING' | 'ZEROFILLING' | 'FOURIER' | 'PHASE' | 'BASELINE' | 'REFERENCE' | 'COMPLETE';
export type MagnetStability = 'STABLE' | 'UNSTABLE' | 'WARNING';
export type AlarmLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type Nucleus = '1H' | '13C' | '19F' | '31P';
export type Solvent = 'CDCl3' | 'D2O' | 'DMSO-d6' | 'Acetone-d6' | 'CD3OD' | 'C6D6' | 'None';
export type ViewMode = 'INSTRUMENT' | 'CONSOLE';
export type PanelId =
  | 'none' | 'system' | 'magnet' | 'cryogen' | 'sample' | 'spinner'
  | 'probe' | 'temperature' | 'lock' | 'shim' | 'tune' | 'rf'
  | 'pulseprogram' | 'acquisition' | 'receiver' | 'experiment'
  | 'automation' | 'processing' | 'spectrum' | 'peaks' | 'integration'
  | 'qnmr' | 'relaxation' | 'diffusion' | '2dnmr' | 'diagnostics'
  | 'datasystem' | 'report' | 'settings' | 'eventlog' | 'qc';

export interface ShimValues {
  Z1: number; Z2: number; Z3: number; Z4: number;
  X: number; Y: number; XZ: number; YZ: number;
}

export interface PeakDef {
  ppm: number;
  amplitude: number;
  multiplicity: 'S' | 'D' | 'T' | 'Q' | 'M' | 'DD' | 'DT';
  J: number;    // Hz — coupling constant
  nH: number;   // number of protons
  label?: string;
  width?: number;  // relative linewidth multiplier
}

export interface SampleLibEntry {
  id: string;
  name: string;
  formula: string;
  peaks1H: PeakDef[];
  peaks13C: PeakDef[];
  description: string;
  T1typical: number;  // seconds
  T2typical: number;  // seconds
}

export interface Integration {
  id: string;
  start: number;  // ppm
  end: number;    // ppm
  rawValue: number;
  normalized: number;
  label: string;
}

export interface PickedPeak {
  ppm: number;
  intensity: number;
  multiplicity: string;
  J: number;
  fwhm: number;   // Hz
  nH: number;
  label?: string;
}

export interface Alarm {
  id: string;
  level: AlarmLevel;
  message: string;
  subsystem: string;
  recovery: string;
  active: boolean;
  timestamp: string;
}

export interface EventEntry {
  id: string;
  time: string;
  message: string;
  level: AlarmLevel;
}

export interface QueueItem {
  id: string;
  name: string;
  nucleus: Nucleus;
  experiment: string;
  NS: number;
  status: 'WAITING' | 'RUNNING' | 'COMPLETE' | 'FAILED';
}

export interface SavedExperiment {
  id: string;
  name: string;
  sampleId: string;
  solvent: Solvent;
  nucleus: Nucleus;
  frequency: number;
  temperature: number;
  experiment: string;
  NS: number;
  dateTime: string;
  spectrumPPM: number[];
  spectrumIntensity: number[];
  peaks: PickedPeak[];
  integrations: Integration[];
}

export interface RelaxationPoint {
  tau: number;
  intensity: number;
}

// ────────────────────────────────────────────────────────────
// Central NMR State
// ────────────────────────────────────────────────────────────
export interface NMRState {
  // ── System
  power: PowerState;
  systemStatus: string;
  consoleStatus: string;
  commStatus: string;

  // ── Magnet (superconducting — always energized when booted)
  magnetField: number;        // Tesla
  magnetFreq1H: number;       // MHz for 1H at this field
  magnetStability: MagnetStability;
  magnetTemp: number;         // K — cryo vessel temp
  magnetWarning: boolean;

  // ── Cryogen
  heliumLevel: number;        // %
  nitrogenLevel: number;      // %
  cryoStatus: 'NORMAL' | 'LOW' | 'CRITICAL';

  // ── Sample
  sampleState: SampleState;
  sampleId: string;
  solvent: Solvent;
  tubeSize: string;           // '5mm' | '10mm'
  concentration: number;      // mM
  sampleVolume: number;       // μL
  selectedSample: string;     // key into SAMPLE_LIBRARY
  sampleYPct: number;         // 0=top (ejected), 100=bottom (seated), for animation

  // ── Air / pneumatics
  airState: AirState;
  airFlow: number;            // L/min

  // ── Spinner
  spinnerStatus: SpinnerStatus;
  spinRate: number;           // Hz actual
  targetSpinRate: number;     // Hz target

  // ── Probe
  probeType: string;
  probeStatus: 'READY' | 'NOT_READY' | 'WARNING';
  observeNucleus: Nucleus;
  decouplingNucleus: string;
  probeTemp: number;          // K
  decouplerOn: boolean;

  // ── Tune / Match
  tuneStatus: TuneState;
  tuningErrorHz: number;
  matchingErrorDB: number;
  autoTuning: boolean;

  // ── Variable Temperature
  targetTemp: number;         // °C
  currentTemp: number;        // °C
  vtStatus: VTStatus;
  tempRampRate: number;       // °C/min
  tempStable: boolean;

  // ── Lock
  lockStatus: LockState;
  lockLevel: number;          // 0–100
  lockPhase: number;          // degrees
  lockFrequency: number;      // MHz (2H at this field)
  fieldStability: number;     // ppm/hr — derived from lock
  autoShimming: boolean;
  autoShimStep: string;

  // ── Shim
  shims: ShimValues;
  shimQuality: number;        // 0–1 derived from shim values

  // ── RF System
  rfFrequency: number;        // MHz — observe frequency
  rfPower: number;            // dB
  pulseWidth90: number;       // μs
  rfPhase: number;            // degrees
  receiverGain: number;       // dB
  receiverBandwidth: number;  // kHz
  receiverOverflow: boolean;
  rfActive: boolean;

  // ── Acquisition parameters
  experiment: string;
  nucleus: Nucleus;
  NS: number;
  DS: number;
  D1: number;               // s
  AQ: number;               // s
  SW: number;               // Hz
  O1: number;               // Hz (carrier offset from nucleus freq)
  TD: number;               // time-domain points
  pulprog: string;
  digitalFilter: boolean;
  solventSuppression: boolean;
  suppressionStrength: number;  // 0–100

  // ── Acquisition state
  acqStatus: AcqState;
  currentScan: number;
  acqStartTime: number;       // ms timestamp
  acqPaused: boolean;

  // ── FID data
  fidData: Float32Array | null;         // accumulated
  fidSingleScan: Float32Array | null;   // latest scan

  // ── 2D NMR
  twoDExperiment: string;
  twoDT1Increments: number;
  twoDProgress: number;       // 0–100
  twoDData: number[][];       // [F1][F2] intensity
  twoDRunning: boolean;

  // ── Relaxation
  relaxationType: 'T1' | 'T2';
  relaxationData: RelaxationPoint[];
  T1fitted: number;
  T2fitted: number;

  // ── DOSY
  dosyData: { ppm: number; D: number; intensity: number }[];

  // ── Processing
  processingStatus: ProcessingState;
  processingProgress: number;  // 0–100
  apodLB: number;              // Hz line broadening
  zeroFillFactor: number;      // 1x, 2x, 4x, 8x
  phaseCorr0: number;          // degrees
  phaseCorr1: number;          // degrees
  baselineOrder: number;       // polynomial order
  referenceMode: 'TMS' | 'SOLVENT' | 'MANUAL';
  referenceShift: number;      // ppm
  magnitudeMode: boolean;
  windowFunction: 'EXPONENTIAL' | 'GAUSSIAN' | 'COSINE' | 'NONE';

  // ── Spectrum
  spectrumPPM: number[];
  spectrumIntensity: number[];
  spectrumReady: boolean;

  // ── Analysis
  pickedPeaks: PickedPeak[];
  integrations: Integration[];
  peakThreshold: number;       // 0–100 percentage of max

  // ── qNMR
  qnmrRefConc: number;
  qnmrRefIntegral: number;
  qnmrRefNuclei: number;
  qnmrAnalyteIntegral: number;
  qnmrAnalyteNuclei: number;

  // ── Automation
  experimentQueue: QueueItem[];
  automationRunning: boolean;
  currentQueueIndex: number;

  // ── Data storage
  savedExperiments: SavedExperiment[];

  // ── Events and alarms
  eventLog: EventEntry[];
  alarms: Alarm[];

  // ── UI state
  activePanel: PanelId;
  menuOpen: boolean;
  viewMode: ViewMode;
  educationalMode: boolean;
  expertMode: boolean;
  quickStartRunning: boolean;
  quickStartStep: string;
  spectrumFullscreen: boolean;

  // ── Notifications (transient popups)
  notification: {
    visible: boolean;
    level: AlarmLevel;
    title: string;
    message: string;
  } | null;
}

// ────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────
export type NMRAction =
  | { type: 'POWER_ON' }
  | { type: 'POWER_OFF' }
  | { type: 'SET_POWER'; payload: PowerState }
  | { type: 'SET_SYSTEM_STATUS'; payload: string }
  | { type: 'LOAD_SAMPLE' }
  | { type: 'EJECT_SAMPLE' }
  | { type: 'SET_SAMPLE_STATE'; payload: SampleState }
  | { type: 'SET_SAMPLE_Y'; payload: number }
  | { type: 'SET_AIR_STATE'; payload: AirState }
  | { type: 'SET_AIR_FLOW'; payload: number }
  | { type: 'SELECT_SAMPLE'; payload: string }
  | { type: 'SELECT_SOLVENT'; payload: Solvent }
  | { type: 'SET_CONCENTRATION'; payload: number }
  | { type: 'SET_SAMPLE_ID'; payload: string }
  | { type: 'SET_SPINNER_STATUS'; payload: SpinnerStatus }
  | { type: 'SET_SPIN_RATE'; payload: number }
  | { type: 'SET_TARGET_SPIN_RATE'; payload: number }
  | { type: 'SET_PROBE_STATUS'; payload: 'READY' | 'NOT_READY' | 'WARNING' }
  | { type: 'SET_OBSERVE_NUCLEUS'; payload: Nucleus }
  | { type: 'SET_DECOUPLER'; payload: boolean }
  | { type: 'SET_TARGET_TEMP'; payload: number }
  | { type: 'SET_CURRENT_TEMP'; payload: number }
  | { type: 'SET_VT_STATUS'; payload: VTStatus }
  | { type: 'ACQUIRE_LOCK' }
  | { type: 'RELEASE_LOCK' }
  | { type: 'SET_LOCK_STATE'; payload: LockState }
  | { type: 'SET_LOCK_LEVEL'; payload: number }
  | { type: 'SET_LOCK_PHASE'; payload: number }
  | { type: 'AUTO_PHASE_LOCK' }
  | { type: 'START_AUTO_SHIM' }
  | { type: 'SET_AUTO_SHIM_RUNNING'; payload: boolean }
  | { type: 'SET_AUTO_SHIM_STEP'; payload: string }
  | { type: 'SET_SHIM'; payload: { key: keyof ShimValues; value: number } }
  | { type: 'SET_SHIM_QUALITY'; payload: number }
  | { type: 'SET_SHIMS'; payload: ShimValues }
  | { type: 'AUTO_TUNE' }
  | { type: 'SET_TUNE_STATE'; payload: TuneState }
  | { type: 'SET_TUNING_ERROR'; payload: number }
  | { type: 'SET_MATCHING_ERROR'; payload: number }
  | { type: 'SET_NUCLEUS'; payload: Nucleus }
  | { type: 'SET_EXPERIMENT'; payload: string }
  | { type: 'SET_ACQ_PARAM'; payload: { key: string; value: number | string | boolean } }
  | { type: 'START_ACQUISITION' }
  | { type: 'PAUSE_ACQUISITION' }
  | { type: 'RESUME_ACQUISITION' }
  | { type: 'STOP_ACQUISITION' }
  | { type: 'ABORT_ACQUISITION' }
  | { type: 'SET_ACQ_STATUS'; payload: AcqState }
  | { type: 'SET_CURRENT_SCAN'; payload: number }
  | { type: 'SET_FID'; payload: Float32Array }
  | { type: 'SET_RECEIVER_OVERFLOW'; payload: boolean }
  | { type: 'ACQUISITION_COMPLETE' }
  | { type: 'START_PROCESSING' }
  | { type: 'SET_PROCESSING_STATUS'; payload: ProcessingState }
  | { type: 'SET_PROCESSING_PROGRESS'; payload: number }
  | { type: 'SET_PROC_PARAM'; payload: { key: string; value: number | string | boolean } }
  | { type: 'SET_SPECTRUM'; payload: { ppm: number[]; intensity: number[] } }
  | { type: 'PROCESSING_COMPLETE' }
  | { type: 'AUTO_PICK_PEAKS' }
  | { type: 'SET_PICKED_PEAKS'; payload: PickedPeak[] }
  | { type: 'ADD_INTEGRATION'; payload: Integration }
  | { type: 'REMOVE_INTEGRATION'; payload: string }
  | { type: 'NORMALIZE_INTEGRATIONS' }
  | { type: 'START_2D'; payload: string }
  | { type: 'SET_2D_PROGRESS'; payload: number }
  | { type: 'SET_2D_DATA'; payload: number[][] }
  | { type: 'SET_2D_RUNNING'; payload: boolean }
  | { type: 'START_RELAXATION'; payload: 'T1' | 'T2' }
  | { type: 'SET_RELAXATION_DATA'; payload: RelaxationPoint[] }
  | { type: 'SET_T1_T2'; payload: { T1?: number; T2?: number } }
  | { type: 'ADD_QUEUE_ITEM'; payload: QueueItem }
  | { type: 'REMOVE_QUEUE_ITEM'; payload: string }
  | { type: 'START_QUEUE' }
  | { type: 'SET_AUTOMATION_RUNNING'; payload: boolean }
  | { type: 'SET_QUEUE_ITEM_STATUS'; payload: { id: string; status: QueueItem['status'] } }
  | { type: 'SAVE_EXPERIMENT' }
  | { type: 'DELETE_EXPERIMENT'; payload: string }
  | { type: 'SET_ACTIVE_PANEL'; payload: PanelId }
  | { type: 'TOGGLE_MENU' }
  | { type: 'CLOSE_MENU' }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'TOGGLE_EDUCATIONAL_MODE' }
  | { type: 'TOGGLE_EXPERT_MODE' }
  | { type: 'TOGGLE_SPECTRUM_FULLSCREEN' }
  | { type: 'QUICK_START' }
  | { type: 'SET_QUICK_START'; payload: { running: boolean; step: string } }
  | { type: 'ADD_EVENT'; payload: { message: string; level: AlarmLevel } }
  | { type: 'CLEAR_EVENTS' }
  | { type: 'ADD_ALARM'; payload: Alarm }
  | { type: 'CLEAR_ALARM'; payload: string }
  | { type: 'SHOW_NOTIFICATION'; payload: { level: AlarmLevel; title: string; message: string } }
  | { type: 'HIDE_NOTIFICATION' }
  | { type: 'RESET_EXPERIMENT' }
  | { type: 'RESET_SIMULATOR' }
  | { type: 'MAGNET_WARNING'; payload: boolean };
