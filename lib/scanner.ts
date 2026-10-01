export interface ScannerState {
  value: string;
  inFlight: boolean;
  lastSubmitted?: string;
  lastSubmittedAt?: number;
  feedback?: { tone: "success" | "error"; message: string };
}

export function beginScanSubmission(
  state: ScannerState,
  now = Date.now(),
  duplicateWindowMs = 800,
) {
  const normalized = state.value.trim().toUpperCase();
  if (!normalized || state.inFlight) return { accepted: false as const, state };
  if (state.lastSubmitted === normalized && now - (state.lastSubmittedAt ?? 0) < duplicateWindowMs)
    return {
      accepted: false as const,
      state: {
        ...state,
        feedback: { tone: "error" as const, message: "DUPLICATE_SCAN" },
      },
    };
  return {
    accepted: true as const,
    value: normalized,
    state: {
      ...state,
      inFlight: true,
      lastSubmitted: normalized,
      lastSubmittedAt: now,
    },
  };
}

export function completeScanSubmission(
  state: ScannerState,
  result: { accepted: boolean; message: string },
) {
  return {
    ...state,
    value: result.accepted ? "" : state.value,
    inFlight: false,
    feedback: { tone: result.accepted ? ("success" as const) : ("error" as const), message: result.message },
  };
}

export function restoreScannerFocus(input: { focus: () => void } | null) {
  input?.focus();
}
