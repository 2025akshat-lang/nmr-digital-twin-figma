import type {
  AirState,
  NMRState,
  SampleState,
  SpinnerStatus,
} from './types';

/**
 * NMR Hardware Model
 * ------------------
 * Stage-2 hardware sequence/state-transition logic.
 *
 * This file does NOT own React state.
 * It calculates the next hardware state/actions that
 * NMRContext can dispatch.
 */

export interface HardwareTransition {
  sampleState?: SampleState;
  sampleYPct?: number;

  airState?: AirState;
  airFlow?: number;

  spinnerStatus?: SpinnerStatus;
  spinRate?: number;

  lockStatus?: NMRState['lockStatus'];
  lockLevel?: number;

  notification?: NMRState['notification'];
  eventMessage?: string;
  eventLevel?: 'INFO' | 'WARNING' | 'ERROR';
}

export interface SpinnerModelResult {
  status: SpinnerStatus;
  spinRate: number;
  airState: AirState;
  airFlow: number;
}

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */

const SAMPLE_MIN_Y = 0;
const SAMPLE_MAX_Y = 100;

const SPIN_ACCELERATION = 4;
const SPIN_DECELERATION = 5;

const MIN_DRIVE_AIR = 1.5;
const SUPPORT_AIR = 2.0;

/* ---------------------------------------------------------
   SAMPLE POSITION MODEL
--------------------------------------------------------- */

export function calculateSamplePosition(
  sampleYPct: number,
  sequence: 'LOADING' | 'EJECTING' = 'LOADING'
): HardwareTransition {
  const y = Math.max(
    SAMPLE_MIN_Y,
    Math.min(SAMPLE_MAX_Y, sampleYPct)
  );

  // -------------------------------------------------------
  // LOADING / INSERTION
  // -------------------------------------------------------
  if (sequence === 'LOADING') {
    if (y < 20) {
      return {
        sampleYPct: y,
        sampleState: 'LOADING',
        airState: 'EJECT',
        airFlow: 8.5,
      };
    }

    if (y < 50) {
      return {
        sampleYPct: y,
        sampleState: 'POSITIONING',
        airState: 'CUSHIONING',
        airFlow: 6.0,
      };
    }

    if (y < 85) {
      return {
        sampleYPct: y,
        sampleState: 'POSITIONING',
        airState: 'SUPPORT',
        airFlow: 3.0,
      };
    }

    return {
      sampleYPct: y,
      sampleState: 'POSITIONED',
      airState: 'SUPPORT',
      airFlow: 2.0,
    };
  }

  // -------------------------------------------------------
  // EJECTION
  // -------------------------------------------------------
  if (y > 20) {
    return {
      sampleYPct: y,
      sampleState: 'EJECTING',
      airState: 'EJECT',
      airFlow: 10.0,
    };
  }

  return {
    sampleYPct: 0,
    sampleState: 'EJECTED',
    airState: 'OFF',
    airFlow: 0,
  };
}
/* ---------------------------------------------------------
   SAMPLE LOAD SEQUENCE
--------------------------------------------------------- */

export function getSampleLoadSequence(
  state: Pick<NMRState, 'power' | 'sampleState'>
): HardwareTransition {
  if (state.power !== 'READY') {
    return {
      notification: {
        visible: true,
        level: 'ERROR',
        title: 'LOAD BLOCKED',
        message: 'NMR system must be READY before loading a sample.',
      },
      eventMessage: 'SAMPLE LOAD BLOCKED: system not ready',
      eventLevel: 'ERROR',
    };
  }

  if (
    state.sampleState !== 'NONE' &&
    state.sampleState !== 'EJECTED'
  ) {
    return {
      notification: {
        visible: true,
        level: 'WARNING',
        title: 'SAMPLE BAY BUSY',
        message: 'Complete the current sample sequence first.',
      },
      eventMessage: 'SAMPLE LOAD BLOCKED: sample bay busy',
      eventLevel: 'WARNING',
    };
  }

  return {
    sampleState: 'LOADING',
    sampleYPct: 0,
    airState: 'EJECT',
    airFlow: 8.5,
    eventMessage: 'Sample loading initiated',
    eventLevel: 'INFO',
    notification: {
      visible: true,
      level: 'INFO',
      title: 'SAMPLE LOADING',
      message: 'Sample loading sequence initiated.',
    },
  };
}

/* ---------------------------------------------------------
   SAMPLE EJECTION
--------------------------------------------------------- */

export function getSampleEjectSequence(
  state: Pick<NMRState, 'spinnerStatus' | 'sampleState'>
): HardwareTransition {
  if (state.spinnerStatus !== 'STOPPED') {
    return {
      notification: {
        visible: true,
        level: 'ERROR',
        title: 'EJECTION BLOCKED',
        message: 'Stop spinner before ejecting sample.',
      },
      eventMessage: 'EJECTION BLOCKED: spinner active',
      eventLevel: 'ERROR',
    };
  }

  if (state.sampleState !== 'POSITIONED') {
    return {
      notification: {
        visible: true,
        level: 'WARNING',
        title: 'NO SAMPLE',
        message: 'No positioned sample is available for ejection.',
      },
      eventMessage: 'EJECTION BLOCKED: no positioned sample',
      eventLevel: 'WARNING',
    };
  }

  return {
    sampleState: 'EJECTING',
    airState: 'EJECT',
    airFlow: 10.0,
    lockStatus: 'OFF',
    lockLevel: 0,
    spinnerStatus: 'STOPPED',
    spinRate: 0,
    eventMessage: 'Sample ejection initiated — eject air active',
    eventLevel: 'INFO',
    notification: {
      visible: true,
      level: 'INFO',
      title: 'SAMPLE EJECTING',
      message: 'Sample is being raised from the probe.',
    },
  };
}

/* ---------------------------------------------------------
   SPINNER INTERLOCK
--------------------------------------------------------- */

export function canStartSpinner(
  state: Pick<NMRState, 'power' | 'sampleState'>
): { allowed: boolean; reason?: string } {
  if (state.power !== 'READY') {
    return {
      allowed: false,
      reason: 'NMR system is not ready.',
    };
  }

  if (state.sampleState !== 'POSITIONED') {
    return {
      allowed: false,
      reason: 'Position the sample before starting the spinner.',
    };
  }

  return { allowed: true };
}

/* ---------------------------------------------------------
   SPINNER PHYSICS / MOTION MODEL
--------------------------------------------------------- */

export function updateSpinner(
  currentRate: number,
  targetRate: number,
  currentStatus: SpinnerStatus,
  dtSeconds: number
): SpinnerModelResult {
  const dt = Math.max(0, dtSeconds);

  /* ---------- STOPPED ---------- */

  if (currentStatus === 'STOPPED') {
    return {
      status: 'STOPPED',
      spinRate: 0,
      airState: 'SUPPORT',
      airFlow: SUPPORT_AIR,
    };
  }

  /* ---------- ACCELERATION ---------- */

  if (currentStatus === 'ACCELERATING') {
    const nextRate = Math.min(
      targetRate,
      currentRate + SPIN_ACCELERATION * dt
    );

    if (nextRate >= targetRate) {
      return {
        status: 'STABLE',
        spinRate: targetRate,
        airState: 'DRIVE',
        airFlow: Math.max(MIN_DRIVE_AIR, 1.5),
      };
    }

    return {
      status: 'ACCELERATING',
      spinRate: nextRate,
      airState: 'DRIVE',
      airFlow: Math.max(MIN_DRIVE_AIR, 1.5),
    };
  }

  /* ---------- STABLE ---------- */

  if (currentStatus === 'STABLE') {
    return {
      status: 'STABLE',
      spinRate: targetRate,
      airState: 'DRIVE',
      airFlow: Math.max(MIN_DRIVE_AIR, 1.5),
    };
  }

  /* ---------- DECELERATION ---------- */

  if (currentStatus === 'DECELERATING') {
    const nextRate = Math.max(
      0,
      currentRate - SPIN_DECELERATION * dt
    );

    if (nextRate <= 0) {
      return {
        status: 'STOPPED',
        spinRate: 0,
        airState: 'SUPPORT',
        airFlow: SUPPORT_AIR,
      };
    }

    return {
      status: 'DECELERATING',
      spinRate: nextRate,
      airState: 'DRIVE',
      airFlow: Math.max(MIN_DRIVE_AIR, 1.5),
    };
  }

  return {
    status: 'STOPPED',
    spinRate: 0,
    airState: 'SUPPORT',
    airFlow: SUPPORT_AIR,
  };
}

/* ---------------------------------------------------------
   AIR SYSTEM MODEL
--------------------------------------------------------- */

export function getAirFlowForState(
  airState: AirState
): number {
  switch (airState) {
    case 'OFF':
      return 0;

    case 'EJECT':
      return 10.0;

    case 'CUSHIONING':
      return 6.0;

    case 'SUPPORT':
      return 3.0;

    case 'DRIVE':
      return 1.5;

    default:
      return 0;
  }
}

/* ---------------------------------------------------------
   HARDWARE SAFETY CHECKS
--------------------------------------------------------- */

export function checkHardwareInterlocks(
  state: Pick<
    NMRState,
    'power' | 'sampleState' | 'spinnerStatus'
  >
): {
  safe: boolean;
  reason?: string;
} {
  if (state.power !== 'READY') {
    return {
      safe: false,
      reason: 'System power state is not READY.',
    };
  }

  if (
    state.spinnerStatus !== 'STOPPED' &&
    state.sampleState !== 'POSITIONED'
  ) {
    return {
      safe: false,
      reason: 'Spinner cannot operate without a positioned sample.',
    };
  }

  return { safe: true };
}

// ─────────────────────────────────────────────────────────────
// LOCK HARDWARE MODEL
// ─────────────────────────────────────────────────────────────

export interface LockModelResult {
  status: NMRState['lockStatus'];
  level: number;
}

const LOCK_SEARCH_STEP = 8;
const LOCK_DETECT_STEP = 10;
const LOCK_OPTIMIZE_STEP = 6;

export function updateLock(
  currentStatus: NMRState['lockStatus'],
  currentLevel: number,
  dtSeconds: number
): LockModelResult {
  const dt = Math.max(0, dtSeconds);

  const level = Math.max(
    0,
    Math.min(100, currentLevel)
  );

  switch (currentStatus) {

    case 'OFF':
      return {
        status: 'OFF',
        level: 0,
      };

    case 'SEARCHING': {
      const nextLevel = Math.min(
        35,
        level + LOCK_SEARCH_STEP * dt
      );

      if (nextLevel >= 30) {
        return {
          status: 'DETECTED',
          level: nextLevel,
        };
      }

      return {
        status: 'SEARCHING',
        level: nextLevel,
      };
    }

    case 'DETECTED': {
      const nextLevel = Math.min(
        65,
        level + LOCK_DETECT_STEP * dt
      );

      if (nextLevel >= 60) {
        return {
          status: 'OPTIMIZING',
          level: nextLevel,
        };
      }

      return {
        status: 'DETECTED',
        level: nextLevel,
      };
    }

    case 'OPTIMIZING': {
      const nextLevel = Math.min(
        100,
        level + LOCK_OPTIMIZE_STEP * dt
      );

      if (nextLevel >= 95) {
        return {
          status: 'LOCKED',
          level: 100,
        };
      }

      return {
        status: 'OPTIMIZING',
        level: nextLevel,
      };
    }

    case 'LOCKED':
      return {
        status: 'LOCKED',
        level: Math.max(95, level),
      };

    case 'LOST':
      return {
        status: 'LOST',
        level: Math.max(0, level - 20 * dt),
      };

    default:
      return {
        status: 'OFF',
        level: 0,
      };
  }
}

export function canStartLock(
  state: Pick<
    NMRState,
    'power' | 'sampleState' | 'solvent' | 'probeStatus'
  >
): {
  allowed: boolean;
  reason?: string;
} {

  if (state.power !== 'READY') {
    return {
      allowed: false,
      reason: 'NMR system must be READY before lock acquisition.',
    };
  }

  if (state.sampleState !== 'POSITIONED') {
    return {
      allowed: false,
      reason: 'Position the sample before acquiring lock.',
    };
  }

  if (state.solvent === 'None') {
    return {
      allowed: false,
      reason: 'Lock solvent is not configured.',
    };
  }

  if (state.probeStatus !== 'READY') {
    return {
      allowed: false,
      reason: 'Probe is not READY.',
    };
  }

  return {
    allowed: true,
  };
}
