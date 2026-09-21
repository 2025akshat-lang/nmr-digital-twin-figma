// ============================================================
// NMR Digital Twin — Physics Simulation Engine
// Simplified but internally consistent educational models.
// ============================================================

import type { Nucleus, Solvent, ShimValues, PeakDef, SampleLibEntry, RelaxationPoint } from './types';

// ────────────────────────────────────────────────────────────
// Nuclear Frequency Constants (11.7437 T — 500 MHz 1H system)
// ────────────────────────────────────────────────────────────
export const FIELD_TESLA = 11.7437;
export const NUCLEUS_FREQ: Record<Nucleus, number> = {
  '1H':  500.000,
  '13C': 125.758,
  '19F': 470.563,
  '31P': 202.456,
};
export const NUCLEUS_SW_DEFAULT: Record<Nucleus, number> = {
  '1H':  6000,     // Hz  (12 ppm × 500 Hz/ppm)
  '13C': 37727,    // Hz  (300 ppm × 125.76 Hz/ppm)
  '19F': 94113,    // Hz  (200 ppm × 470.56 Hz/ppm)
  '31P': 20246,    // Hz  (100 ppm × 202.46 Hz/ppm)
};
export const NUCLEUS_PPM_RANGE: Record<Nucleus, [number, number]> = {
  '1H':  [12, -1],
  '13C': [220, -10],
  '19F': [0, -200],
  '31P': [30, -60],
};
export const LOCK_FREQ_2H = 76.753; // MHz (2H at 11.7437 T)

// ────────────────────────────────────────────────────────────
// Solvent residual signal positions (1H ppm) + lock behaviour
// ────────────────────────────────────────────────────────────
export const SOLVENT_INFO: Record<Solvent, {
  residualPPM: number;
  residualLabel: string;
  lockBase: number;   // base lock level 0–100
  lockFreqOffset: number; // offset from LOCK_FREQ_2H in Hz
}> = {
  'CDCl3':     { residualPPM: 7.26, residualLabel: 'CHCl₃', lockBase: 85, lockFreqOffset: 0 },
  'D2O':       { residualPPM: 4.79, residualLabel: 'HDO',   lockBase: 90, lockFreqOffset: 20 },
  'DMSO-d6':   { residualPPM: 2.50, residualLabel: 'DMSO-d5', lockBase: 82, lockFreqOffset: -15 },
  'Acetone-d6':{ residualPPM: 2.05, residualLabel: 'Acetone-d5', lockBase: 88, lockFreqOffset: 10 },
  'CD3OD':     { residualPPM: 3.31, residualLabel: 'CD₂HOD', lockBase: 86, lockFreqOffset: 5 },
  'C6D6':      { residualPPM: 7.16, residualLabel: 'C₆D₅H', lockBase: 84, lockFreqOffset: -8 },
  'None':      { residualPPM: 0,    residualLabel: '',       lockBase: 0,  lockFreqOffset: 0 },
};

// ────────────────────────────────────────────────────────────
// Sample Library
// ────────────────────────────────────────────────────────────
export const SAMPLE_LIBRARY: Record<string, SampleLibEntry> = {
  ethanol: {
    id: 'ethanol',
    name: 'Ethanol',
    formula: 'C₂H₅OH',
    description: 'Classic 1H reference sample. Shows triplet CH₃, quartet CH₂, broad OH.',
    T1typical: 3.5,
    T2typical: 2.0,
    peaks1H: [
      { ppm: 1.18, amplitude: 1.0, multiplicity: 'T', J: 7.1, nH: 3, label: 'CH₃' },
      { ppm: 3.69, amplitude: 0.67, multiplicity: 'Q', J: 7.1, nH: 2, label: 'CH₂' },
      { ppm: 2.61, amplitude: 0.33, multiplicity: 'S', J: 0, nH: 1, label: 'OH' },
    ],
    peaks13C: [
      { ppm: 18.3, amplitude: 0.8, multiplicity: 'Q', J: 126.9, nH: 0, label: 'CH₃' },
      { ppm: 57.8, amplitude: 0.6, multiplicity: 'T', J: 140.1, nH: 0, label: 'CH₂' },
    ],
  },
  caffeine: {
    id: 'caffeine',
    name: 'Caffeine',
    formula: 'C₈H₁₀N₄O₂',
    description: 'Trimethylxanthine. Shows four N-methyl groups and a vinyl proton.',
    T1typical: 2.8,
    T2typical: 1.2,
    peaks1H: [
      { ppm: 7.52, amplitude: 0.25, multiplicity: 'S', J: 0, nH: 1, label: 'H8' },
      { ppm: 3.99, amplitude: 0.75, multiplicity: 'S', J: 0, nH: 3, label: 'N-CH₃' },
      { ppm: 3.87, amplitude: 0.75, multiplicity: 'S', J: 0, nH: 3, label: 'N-CH₃' },
      { ppm: 3.59, amplitude: 0.75, multiplicity: 'S', J: 0, nH: 3, label: 'N-CH₃' },
    ],
    peaks13C: [
      { ppm: 155.3, amplitude: 0.5, multiplicity: 'S', J: 0, nH: 0, label: 'C2' },
      { ppm: 151.5, amplitude: 0.5, multiplicity: 'S', J: 0, nH: 0, label: 'C6' },
      { ppm: 148.7, amplitude: 0.5, multiplicity: 'S', J: 0, nH: 0, label: 'C4' },
      { ppm: 141.9, amplitude: 0.7, multiplicity: 'D', J: 200, nH: 0, label: 'C8' },
      { ppm: 107.3, amplitude: 0.5, multiplicity: 'S', J: 0, nH: 0, label: 'C5' },
      { ppm: 33.9, amplitude: 0.8, multiplicity: 'Q', J: 140, nH: 0, label: 'N-CH₃' },
      { ppm: 29.8, amplitude: 0.8, multiplicity: 'Q', J: 140, nH: 0, label: 'N-CH₃' },
      { ppm: 28.0, amplitude: 0.8, multiplicity: 'Q', J: 140, nH: 0, label: 'N-CH₃' },
    ],
  },
  toluene: {
    id: 'toluene',
    name: 'Toluene',
    formula: 'C₇H₈',
    description: 'Simple aromatic + methyl. Shows aromatic multiplet and methyl singlet.',
    T1typical: 4.0,
    T2typical: 2.5,
    peaks1H: [
      { ppm: 7.27, amplitude: 1.0, multiplicity: 'M', J: 7.5, nH: 5, label: 'ArH' },
      { ppm: 2.35, amplitude: 0.6, multiplicity: 'S', J: 0, nH: 3, label: 'CH₃' },
    ],
    peaks13C: [
      { ppm: 137.9, amplitude: 0.4, multiplicity: 'S', J: 0, nH: 0, label: 'C1' },
      { ppm: 129.2, amplitude: 0.8, multiplicity: 'D', J: 159, nH: 0, label: 'C3,5' },
      { ppm: 128.3, amplitude: 0.8, multiplicity: 'D', J: 159, nH: 0, label: 'C2,6' },
      { ppm: 125.5, amplitude: 0.5, multiplicity: 'D', J: 159, nH: 0, label: 'C4' },
      { ppm: 21.4, amplitude: 0.9, multiplicity: 'Q', J: 126, nH: 0, label: 'CH₃' },
    ],
  },
  acetone: {
    id: 'acetone',
    name: 'Acetone',
    formula: '(CH₃)₂CO',
    description: 'Single methyl singlet. Classic simple spectrum.',
    T1typical: 6.0,
    T2typical: 4.0,
    peaks1H: [
      { ppm: 2.17, amplitude: 1.0, multiplicity: 'S', J: 0, nH: 6, label: 'CH₃' },
    ],
    peaks13C: [
      { ppm: 206.7, amplitude: 0.4, multiplicity: 'S', J: 0, nH: 0, label: 'C=O' },
      { ppm: 29.9, amplitude: 1.0, multiplicity: 'Q', J: 127, nH: 0, label: 'CH₃' },
    ],
  },
  benzene: {
    id: 'benzene',
    name: 'Benzene',
    formula: 'C₆H₆',
    description: 'Single aromatic singlet. All protons equivalent.',
    T1typical: 5.0,
    T2typical: 3.5,
    peaks1H: [
      { ppm: 7.37, amplitude: 1.0, multiplicity: 'S', J: 0, nH: 6, label: 'ArH' },
    ],
    peaks13C: [
      { ppm: 128.4, amplitude: 1.0, multiplicity: 'D', J: 159, nH: 0, label: 'CH' },
    ],
  },
  ethylacetate: {
    id: 'ethylacetate',
    name: 'Ethyl Acetate',
    formula: 'CH₃COOC₂H₅',
    description: 'Three groups: acetyl CH₃ (s), OCH₂ (q), CH₃ (t).',
    T1typical: 3.2,
    T2typical: 1.8,
    peaks1H: [
      { ppm: 4.12, amplitude: 0.67, multiplicity: 'Q', J: 7.1, nH: 2, label: 'OCH₂' },
      { ppm: 2.05, amplitude: 1.0, multiplicity: 'S', J: 0, nH: 3, label: 'COCH₃' },
      { ppm: 1.26, amplitude: 1.0, multiplicity: 'T', J: 7.1, nH: 3, label: 'CH₃' },
    ],
    peaks13C: [
      { ppm: 171.0, amplitude: 0.3, multiplicity: 'S', J: 0, nH: 0, label: 'C=O' },
      { ppm: 60.5, amplitude: 0.6, multiplicity: 'T', J: 141, nH: 0, label: 'OCH₂' },
      { ppm: 21.0, amplitude: 0.8, multiplicity: 'Q', J: 127, nH: 0, label: 'COCH₃' },
      { ppm: 14.3, amplitude: 0.9, multiplicity: 'Q', J: 127, nH: 0, label: 'CH₃' },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom Sample',
    formula: '—',
    description: 'User-defined sample. Configure peaks in the Sample panel.',
    T1typical: 3.0,
    T2typical: 1.5,
    peaks1H: [
      { ppm: 5.0, amplitude: 1.0, multiplicity: 'S', J: 0, nH: 1, label: 'Custom' },
    ],
    peaks13C: [],
  },
};

// ────────────────────────────────────────────────────────────
// FIX: single place that decides which peak list to use for a
// given observe nucleus. Previously callers did:
//   nucleus === '1H' ? peaks1H : peaks13C
// which meant 19F and 31P silently rendered the sample's 13C
// carbon shifts remapped onto the 19F/31P ppm axis — completely
// unphysical "spectra" that looked broken/random to the user.
// None of the bundled samples actually contain F or P, so the
// correct, honest behaviour is to return an empty peak list
// (a blank spectrum, just the solvent residual) for nuclei the
// sample has no data for, rather than fabricating fake peaks.
// ────────────────────────────────────────────────────────────
export function getPeaksForNucleus(sample: SampleLibEntry | undefined, nucleus: Nucleus): PeakDef[] {
  if (!sample) return [];
  if (nucleus === '1H') return sample.peaks1H ?? [];
  if (nucleus === '13C') return sample.peaks13C ?? [];
  // 19F / 31P: no reference data in this sample library
  return [];
}

// ────────────────────────────────────────────────────────────
// Compute shimQuality from shim values (0–1)
// Optimal shims → quality ≈ 1. Deviated shims → quality < 1.
// ────────────────────────────────────────────────────────────
export function computeShimQuality(shims: ShimValues): number {
  const weights: Record<keyof ShimValues, number> = {
    Z1: 0.25, Z2: 0.20, Z3: 0.12, Z4: 0.08,
    X: 0.10,  Y: 0.10,  XZ: 0.08, YZ: 0.07,
  };
  const scales: Record<keyof ShimValues, number> = {
    Z1: 500, Z2: 2000, Z3: 5000, Z4: 10000,
    X: 1000, Y: 1000, XZ: 3000, YZ: 3000,
  };
  let penalty = 0;
  for (const k of Object.keys(shims) as (keyof ShimValues)[]) {
    const d = shims[k] / scales[k];
    penalty += weights[k] * d * d;
  }
  return Math.max(0, Math.min(1, 1 - Math.sqrt(penalty)));
}

// ────────────────────────────────────────────────────────────
// Lock level simulation
// ────────────────────────────────────────────────────────────
export function computeLockLevel(
  solvent: Solvent,
  shimQuality: number,
  lockPhase: number,
  fieldStability: number,
  t: number,
): number {
  if (solvent === 'None') return 0;
  const info = SOLVENT_INFO[solvent];
  const base = info.lockBase;
  const phaseFactor = Math.cos((lockPhase * Math.PI) / 180) ** 2;
  const fluctuation = 1 + 0.015 * Math.sin(2 * Math.PI * t / 7.3) + 0.008 * Math.sin(2 * Math.PI * t / 3.1);
  const level = base * shimQuality * phaseFactor * fluctuation;
  return Math.max(0, Math.min(100, level));
}

// ────────────────────────────────────────────────────────────
// FID Generation
// ────────────────────────────────────────────────────────────
export interface FIDParams {
  peaks: PeakDef[];
  solventPPM: number;
  showSolvent: boolean;
  suppressSolvent: boolean;
  suppressionStrength: number;
  nucleus: Nucleus;
  SW: number;
  O1: number;
  TD: number;
  AQ: number;
  shimQuality: number;
  receiverGain: number;
  NS: number;
  concentration: number;
  temperature: number;
  solventSuppression: boolean;
  decouplerOn: boolean;
  nucleus13Cmode: boolean;
  seed: number;
}

function lcgRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296 - 0.5;
  };
}

export function generateFID(p: FIDParams): Float32Array {
  const { TD, AQ, shimQuality, receiverGain, NS, concentration } = p;
  const dt = AQ / TD;
  const fid = new Float32Array(TD);
  const rand = lcgRand(p.seed);

  const T2star = 0.08 + shimQuality * 0.55;
  const gainFactor = Math.pow(10, receiverGain / 40);
  const concFactor = concentration / 100;

  for (const peak of p.peaks) {
    const hzPerPpm = NUCLEUS_FREQ[p.nucleus];
    const freqOffset = (peak.ppm * hzPerPpm - p.O1);

    let ampScale = 1.0;
    if (p.solventSuppression && p.suppressSolvent) {
      const solventFreqOffset = p.solventPPM * hzPerPpm - p.O1;
      const df = Math.abs(freqOffset - solventFreqOffset);
      const suppression = Math.max(0, 1 - (100 - p.suppressionStrength) / 100 * Math.exp(-df * df / (100 * 100)));
      ampScale *= suppression;
    }

    const A = peak.amplitude * ampScale * gainFactor * concFactor;
    for (let i = 0; i < TD; i++) {
      const t = i * dt;
      fid[i] += A * Math.cos(2 * Math.PI * freqOffset * t) * Math.exp(-t / T2star);
    }
  }

  if (p.showSolvent && p.solventPPM !== 0) {
    const hzPerPpm = NUCLEUS_FREQ[p.nucleus];
    const solventFreqOffset = p.solventPPM * hzPerPpm - p.O1;
    const solventAmp = 2.0 * gainFactor;
    const solventT2 = T2star * 1.2;
    let suppFactor = 1.0;
    if (p.solventSuppression && p.suppressSolvent) {
      suppFactor = Math.max(0.01, 1 - p.suppressionStrength / 100);
    }
    for (let i = 0; i < TD; i++) {
      const t = i * dt;
      fid[i] += solventAmp * suppFactor * Math.cos(2 * Math.PI * solventFreqOffset * t) * Math.exp(-t / solventT2);
    }
  }

  const maxVal = gainFactor * 2.5;
  for (let i = 0; i < TD; i++) {
    if (Math.abs(fid[i]) > maxVal) {
      fid[i] = Math.sign(fid[i]) * maxVal;
    }
  }

  const noiseAmp = (0.08 / Math.sqrt(Math.max(1, NS))) * gainFactor * 0.3;
  for (let i = 0; i < TD; i++) {
    fid[i] += rand() * noiseAmp;
  }

  return fid;
}

// ────────────────────────────────────────────────────────────
// Spectrum Generation (Lorentzian lineshapes)
// ────────────────────────────────────────────────────────────
export interface SpectrumParams {
  peaks: PeakDef[];
  solventPPM: number;
  showSolvent: boolean;
  suppressSolvent: boolean;
  suppressionStrength: number;
  nucleus: Nucleus;
  shimQuality: number;
  receiverGain: number;
  NS: number;
  concentration: number;
  phaseCorr0: number;
  phaseCorr1: number;
  apodLB: number;
  windowFunction: string;
  magnitudeMode: boolean;
  solventSuppression: boolean;
  decouplerOn: boolean;
  referenceShift: number;
  spinnerArtifact: boolean;
  spinRate: number;
  nPoints: number;
}

function lorentzian(x: number, x0: number, fwhm: number): number {
  const g = fwhm / 2;
  return (g * g) / ((x - x0) ** 2 + g * g);
}

export function generateSpectrum(p: SpectrumParams): { ppm: number[]; intensity: number[] } {
  const [ppmMax, ppmMin] = NUCLEUS_PPM_RANGE[p.nucleus];
  const range = ppmMax - ppmMin;
  const nPts = p.nPoints;

  const ppmArr = Array.from({ length: nPts }, (_, i) => ppmMax - (i / (nPts - 1)) * range);
  const intensity = new Float64Array(nPts);

  const hzPerPpm = NUCLEUS_FREQ[p.nucleus];
  const baseLWHz = p.apodLB + (1 - p.shimQuality) * 80 + 0.5;
  const baseLWppm = baseLWHz / hzPerPpm;

  const gainFactor = Math.pow(10, p.receiverGain / 40);
  const concFactor = p.concentration / 100;
  const snrFactor = Math.sqrt(Math.max(1, p.NS));

  for (const peak of p.peaks) {
    const A = peak.amplitude * gainFactor * concFactor * snrFactor;
    const lw = baseLWppm * (peak.width ?? 1.0);

    let suppFactor = 1.0;
    if (p.solventSuppression && p.suppressSolvent) {
      const df = Math.abs(peak.ppm - p.solventPPM);
      if (df < 0.5) suppFactor = Math.max(0.01, 1 - p.suppressionStrength / 100);
    }

    const lines = multiplicityLines(peak.ppm, peak.J / hzPerPpm, peak.multiplicity);
    for (const [pos, relA] of lines) {
      for (let i = 0; i < nPts; i++) {
        intensity[i] += A * relA * suppFactor * lorentzian(ppmArr[i], pos, lw);
      }
    }
  }

  if (p.showSolvent && p.solventPPM !== 0) {
    const A = 2.0 * gainFactor * snrFactor;
    let suppFactor = p.suppressSolvent && p.solventSuppression
      ? Math.max(0.01, 1 - p.suppressionStrength / 100)
      : 1.0;
    const lw = baseLWppm * 0.8;
    for (let i = 0; i < nPts; i++) {
      intensity[i] += A * suppFactor * lorentzian(ppmArr[i], p.solventPPM + p.referenceShift, lw);
    }
  }

  if (p.spinnerArtifact && p.spinRate > 5) {
    const sidebandOffset = p.spinRate / hzPerPpm;
    const sidebandAmp = (1 - p.shimQuality) ** 2 * 0.15;
    for (const peak of p.peaks) {
      const A = peak.amplitude * gainFactor * concFactor * snrFactor * sidebandAmp;
      const lw = baseLWppm * 2;
      for (const offset of [-sidebandOffset, sidebandOffset]) {
        const pos = peak.ppm + offset;
        if (pos > ppmMin && pos < ppmMax) {
          for (let i = 0; i < nPts; i++) {
            intensity[i] += A * lorentzian(ppmArr[i], pos, lw);
          }
        }
      }
    }
  }

  const phaseRad = (p.phaseCorr0 * Math.PI) / 180;
  const cosP = Math.cos(phaseRad);
  for (let i = 0; i < nPts; i++) {
    intensity[i] = intensity[i] * cosP;
  }

  const noiseLevel = (0.05 / Math.sqrt(Math.max(1, p.NS))) * gainFactor;
  const randB = lcgRand(42);
  for (let i = 0; i < nPts; i++) {
    intensity[i] += randB() * noiseLevel;
  }

  const maxI = Math.max(...intensity);
  const scale = maxI > 0 ? 1 / maxI : 1;
  const intensityArr = Array.from(intensity).map(v => v * scale);

  return { ppm: ppmArr, intensity: intensityArr };
}

function multiplicityLines(center: number, Jppm: number, mult: string): [number, number][] {
  switch (mult) {
    case 'S':  return [[center, 1.0]];
    case 'D':  return [[center - Jppm/2, 1.0], [center + Jppm/2, 1.0]];
    case 'T':  return [[center - Jppm, 0.5], [center, 1.0], [center + Jppm, 0.5]];
    case 'Q':  return [
      [center - 3*Jppm/2, 0.33],
      [center - Jppm/2,   1.0],
      [center + Jppm/2,   1.0],
      [center + 3*Jppm/2, 0.33],
    ];
    case 'DD': return [
      [center - Jppm, 0.25], [center, 0.5],
      [center + Jppm, 0.25], [center + Jppm*0.5, 0.5],
    ];
    case 'DT': return [
      [center - Jppm, 0.25], [center - Jppm/2, 0.5],
      [center, 0.5], [center + Jppm/2, 0.5], [center + Jppm, 0.25],
    ];
    default:   return [[center, 1.0]];
  }
}

// ────────────────────────────────────────────────────────────
// 2D NMR Spectrum Generation
// ────────────────────────────────────────────────────────────
export function generate2DSpectrum(
  experiment: string,
  peaks: PeakDef[],
  nF1: number,
  nF2: number,
): number[][] {
  const data: number[][] = Array.from({ length: nF1 }, () => new Array(nF2).fill(0));

  if (experiment === 'COSY' || experiment === 'TOCSY') {
    for (let i = 0; i < peaks.length; i++) {
      const f1i = peakToF1Index(peaks[i].ppm, nF1);
      const f2i = peakToF2Index(peaks[i].ppm, nF2);
      addGaussian2D(data, f1i, f2i, 1.0, 3, nF1, nF2);

      for (let j = i + 1; j < peaks.length; j++) {
        if (peaks[i].J > 0 && Math.abs(peaks[i].ppm - peaks[j].ppm) < 5) {
          const f1j = peakToF1Index(peaks[j].ppm, nF1);
          const f2j = peakToF2Index(peaks[j].ppm, nF2);
          addGaussian2D(data, f1i, f2j, 0.7, 3, nF1, nF2);
          addGaussian2D(data, f1j, f2i, 0.7, 3, nF1, nF2);
        }
      }
    }
  } else if (experiment === 'NOESY' || experiment === 'ROESY') {
    for (let i = 0; i < peaks.length; i++) {
      const f1i = peakToF1Index(peaks[i].ppm, nF1);
      const f2i = peakToF2Index(peaks[i].ppm, nF2);
      addGaussian2D(data, f1i, f2i, 1.0, 3, nF1, nF2);
      for (let j = i + 1; j < peaks.length; j++) {
        const ppmDiff = Math.abs(peaks[i].ppm - peaks[j].ppm);
        if (ppmDiff < 3) {
          const f1j = peakToF1Index(peaks[j].ppm, nF1);
          const f2j = peakToF2Index(peaks[j].ppm, nF2);
          const amp = 0.5 * Math.exp(-ppmDiff / 2);
          addGaussian2D(data, f1i, f2j, amp, 3, nF1, nF2);
          addGaussian2D(data, f1j, f2i, amp, 3, nF1, nF2);
        }
      }
    }
  } else if (experiment === 'HSQC' || experiment === 'HMQC') {
    const carbons = [20, 30, 55, 75, 120, 130, 170];
    for (let i = 0; i < peaks.length && i < 7; i++) {
      const f1c = (carbons[i] / 220) * nF1;
      const f2h = peakToF2Index(peaks[i].ppm, nF2);
      addGaussian2D(data, Math.round(nF1 - f1c), f2h, peaks[i].amplitude, 3, nF1, nF2);
    }
  } else if (experiment === 'HMBC') {
    const carbons = [20, 35, 55, 110, 130, 145, 165];
    for (let i = 0; i < peaks.length; i++) {
      for (let c = 0; c < Math.min(carbons.length, 3); c++) {
        const f1c = (carbons[(i + c) % carbons.length] / 220) * nF1;
        const f2h = peakToF2Index(peaks[i].ppm, nF2);
        addGaussian2D(data, Math.round(nF1 - f1c), f2h, 0.6, 3, nF1, nF2);
      }
    }
  } else if (experiment === 'DOSY') {
    for (let i = 0; i < peaks.length; i++) {
      const D_idx = Math.round(nF1 * 0.7);
      const f2i = peakToF2Index(peaks[i].ppm, nF2);
      addGaussian2D(data, D_idx, f2i, peaks[i].amplitude, 5, nF1, nF2);
    }
  } else if (experiment === 'JRES') {
    const center = Math.floor(nF1 / 2);
    for (const peak of peaks) {
      const f2 = peakToF2Index(peak.ppm, nF2);
      const lines = multiplicityLines(0, peak.J / 20, peak.multiplicity);
      for (const [pos, amp] of lines) {
        const f1 = center + Math.round(pos * 10);
        if (f1 >= 0 && f1 < nF1) {
          addGaussian2D(data, f1, f2, amp * peak.amplitude, 3, nF1, nF2);
        }
      }
    }
  }

  return data;
}

function peakToF1Index(ppm: number, n: number): number {
  const [max, min] = NUCLEUS_PPM_RANGE['1H'];
  return Math.round(((max - ppm) / (max - min)) * (n - 1));
}
function peakToF2Index(ppm: number, n: number): number {
  const [max, min] = NUCLEUS_PPM_RANGE['1H'];
  return Math.round(((max - ppm) / (max - min)) * (n - 1));
}
function addGaussian2D(data: number[][], f1: number, f2: number, amp: number, radius: number, nF1: number, nF2: number) {
  for (let i = Math.max(0, f1 - radius * 2); i < Math.min(nF1, f1 + radius * 2 + 1); i++) {
    for (let j = Math.max(0, f2 - radius * 2); j < Math.min(nF2, f2 + radius * 2 + 1); j++) {
      const d2 = ((i - f1) ** 2 + (j - f2) ** 2) / (radius * radius);
      data[i][j] = Math.max(data[i][j], amp * Math.exp(-d2));
    }
  }
}

// ────────────────────────────────────────────────────────────
// Relaxation Curves
// ────────────────────────────────────────────────────────────
export function generateT1Curve(T1: number, nPoints = 20): RelaxationPoint[] {
  const maxTau = T1 * 5;
  return Array.from({ length: nPoints }, (_, i) => {
    const tau = (i / (nPoints - 1)) * maxTau;
    const intensity = 1 - 2 * Math.exp(-tau / T1);
    return { tau, intensity };
  });
}

export function generateT2Curve(T2: number, nPoints = 20): RelaxationPoint[] {
  const maxTau = T2 * 4;
  return Array.from({ length: nPoints }, (_, i) => {
    const tau = (i / (nPoints - 1)) * maxTau;
    const intensity = Math.exp(-tau / T2);
    return { tau, intensity };
  });
}

// ────────────────────────────────────────────────────────────
// Auto-shim sequence — returns optimised ShimValues after delay
// ────────────────────────────────────────────────────────────
export function autoShimOptimal(): ShimValues {
  return { Z1: 0, Z2: 0, Z3: 0, Z4: 0, X: 0, Y: 0, XZ: 0, YZ: 0 };
}

// ────────────────────────────────────────────────────────────
// Utility: format time as HH:MM:SS
// ────────────────────────────────────────────────────────────
export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

export function formatElapsed(startMs: number): string {
  return formatTime(Date.now() - startMs);
}

export function nowStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// ────────────────────────────────────────────────────────────
// Experiment parameter presets
// ────────────────────────────────────────────────────────────
export interface ExpPreset {
  name: string;
  pulprog: string;
  nucleus: Nucleus;
  NS: number;
  DS: number;
  D1: number;
  AQ: number;
  SW: number;
  TD: number;
  category: string;
  description: string;
}

export const EXPERIMENT_PRESETS: Record<string, ExpPreset> = {
  '1H_1D':       { name: '1H 1D',        pulprog: 'zg', nucleus: '1H',  NS: 16, DS: 2, D1: 1.0, AQ: 2.0, SW: 6000,  TD: 32768, category: '1D',        description: 'Standard proton 1D experiment.' },
  '13C_1D':      { name: '13C 1D',        pulprog: 'zgdc', nucleus: '13C', NS: 256,DS: 4, D1: 2.0, AQ: 0.8, SW: 37727, TD: 65536, category: '1D',        description: 'Broadband proton-decoupled 13C.' },
  '19F_1D':      { name: '19F 1D',        pulprog: 'zg', nucleus: '19F', NS: 32, DS: 2, D1: 1.5, AQ: 0.8, SW: 94113, TD: 65536, category: '1D',        description: 'Fluorine 1D spectrum.' },
  '31P_1D':      { name: '31P 1D',        pulprog: 'zgpg30', nucleus: '31P', NS: 64, DS: 2, D1: 3.0, AQ: 0.5, SW: 20246, TD: 32768, category: '1D',    description: 'Phosphorus with NOE decoupling.' },
  '1H_DEPT':     { name: 'DEPT-135',      pulprog: 'dept135', nucleus: '1H', NS: 32, DS: 4, D1: 2.0, AQ: 0.8, SW: 37727, TD: 65536, category: '1D',    description: 'DEPT-135: CH/CH₃ up, CH₂ down.' },
  '1H_PRESAT':   { name: '1H Presaturation', pulprog: 'presat', nucleus: '1H', NS: 32, DS: 4, D1: 2.0, AQ: 2.0, SW: 6000, TD: 32768, category: '1D',   description: '1H with water presaturation.' },
  'COSY':        { name: 'COSY',          pulprog: 'cosygpqf', nucleus: '1H', NS: 8,  DS: 2, D1: 1.5, AQ: 0.15, SW: 6000, TD: 2048, category: '2D',     description: 'J-coupled correlation.' },
  'TOCSY':       { name: 'TOCSY',         pulprog: 'mlevph',  nucleus: '1H', NS: 8,  DS: 2, D1: 1.5, AQ: 0.15, SW: 6000, TD: 2048, category: '2D',     description: 'Total correlation (spin system).' },
  'NOESY':       { name: 'NOESY',         pulprog: 'noesygpph', nucleus: '1H', NS: 8, DS: 2, D1: 1.5, AQ: 0.15, SW: 6000, TD: 2048, category: '2D',    description: 'Nuclear Overhauser effect.' },
  'ROESY':       { name: 'ROESY',         pulprog: 'roesyph', nucleus: '1H', NS: 8,  DS: 2, D1: 1.5, AQ: 0.15, SW: 6000, TD: 2048, category: '2D',     description: 'Rotating frame NOE.' },
  'HSQC':        { name: 'HSQC',          pulprog: 'hsqcetgp', nucleus: '1H', NS: 8, DS: 4, D1: 1.5, AQ: 0.1, SW: 6000, TD: 2048, category: '2D',      description: '1-bond 1H-13C correlation.' },
  'HMQC':        { name: 'HMQC',          pulprog: 'hmqcgpqf', nucleus: '1H', NS: 8, DS: 4, D1: 1.5, AQ: 0.1, SW: 6000, TD: 2048, category: '2D',      description: '1H-13C via HMQC.' },
  'HMBC':        { name: 'HMBC',          pulprog: 'hmbcgplpndqf', nucleus: '1H', NS: 16, DS: 4, D1: 1.5, AQ: 0.1, SW: 6000, TD: 2048, category: '2D', description: 'Long-range 1H-13C (2-3 bonds).' },
  'DOSY':        { name: 'DOSY',          pulprog: 'ledbpgppr2s1d', nucleus: '1H', NS: 16, DS: 4, D1: 2.0, AQ: 0.5, SW: 6000, TD: 2048, category: 'DIFF', description: 'Diffusion-ordered spectroscopy.' },
  'JRES':        { name: 'J-RES',         pulprog: 'jresgpph', nucleus: '1H', NS: 8, DS: 2, D1: 1.5, AQ: 0.15, SW: 6000, TD: 2048, category: '2D',     description: 'J-resolved 2D.' },
  'T1_IR':       { name: 'T1 Inversion Recovery', pulprog: 'irT1', nucleus: '1H', NS: 8, DS: 2, D1: 10.0, AQ: 1.0, SW: 6000, TD: 4096, category: 'RELAX', description: 'Measure longitudinal T1.' },
  'T2_CPMG':     { name: 'T2 CPMG',       pulprog: 'cpmgt2', nucleus: '1H', NS: 8, DS: 2, D1: 3.0, AQ: 0.5, SW: 6000, TD: 4096, category: 'RELAX',    description: 'Measure transverse T2.' },
};
