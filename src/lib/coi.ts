import type { EphemeralBehaviorState } from "~/types/ephemeral-behavior"
import type { Session } from "~/types/session"
import type { DerivedPageMetrics, DerivedSessionMetrics } from "~/derived/types"
import { derivePageMetrics, deriveSessionMetrics } from "~/derived"
import { log, warn, error} from "~/lib/logger"

export type CoiWeights = {
  page: {
    tabSwitch: number
    idleTransitions: number
    scrollBurst: number
    shallowDepth: number
    dwell: number
    position: number
    revisit: number
  }
  session: {
    tabSwitch: number
    idleTransitions: number
    scrollBurst: number
    shallowDepth: number
    dwellVariance: number
    domainChurn: number
    revisit: number
    duration: number
    foregroundDrop: number
  }
}

export type CoiFeatureVector = Record<string, number>

export type CoiResult = {
  score: number
  features: CoiFeatureVector
}

const STORAGE_KEY = "coi-weights"
const DEFAULT_MAX_DWELL_MS = 10 * 60 * 1000 // 10 minutes

export function getDefaultWeights(): CoiWeights {
  return {
    page: {
      tabSwitch: 0.2,
      idleTransitions: 0.2,
      scrollBurst: 0.15,
      shallowDepth: 0.15,
      dwell: 0.2,
      position: 0.05,
      revisit: 0.05,
    },
    session: {
      tabSwitch: 0.2,
      idleTransitions: 0.2,
      scrollBurst: 0.1,
      shallowDepth: 0.1,
      dwellVariance: 0.15,
      domainChurn: 0.1,
      revisit: 0.05,
      duration: 0.05,
      foregroundDrop: 0.05,
    },
  }
}

export async function loadCoiWeights(): Promise<CoiWeights> {
  const defaults = getDefaultWeights()
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    if (result && result[STORAGE_KEY]) {
      const merged = mergeWeights(defaults, result[STORAGE_KEY] as CoiWeights)
      return normalizeWeights(merged)
    }
  } catch (err) {
    warn("Failed to load COI weights, using defaults", err)
  }
  return normalizeWeights(defaults)
}

export async function saveCoiWeights(weights: CoiWeights): Promise<void> {
  try {
    const normalized = normalizeWeights(weights)
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized })
  } catch (err) {
    warn("Failed to save COI weights", err)
  }
}

function mergeWeights(base: CoiWeights, incoming: Partial<CoiWeights>): CoiWeights {
  return {
    page: { ...base.page, ...(incoming.page ?? {}) },
    session: { ...base.session, ...(incoming.session ?? {}) },
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeScope<T extends Record<string, number>>(scope: T): T {
  const keys = Object.keys(scope)
  const sum = keys.reduce((s, k) => s + Math.max(0, scope[k]), 0)
  if (sum <= 0) {
    // If everything is zero, distribute uniformly
    const uniform = 1 / Math.max(keys.length, 1)
    const out: any = {}
    keys.forEach((k) => (out[k] = uniform))
    return out as T
  }
  const out: any = {}
  keys.forEach((k) => {
    const v = Math.max(0, scope[k])
    out[k] = v / sum
  })
  return out as T
}

export function normalizeWeights(w: CoiWeights): CoiWeights {
  return {
    page: normalizeScope(w.page),
    session: normalizeScope(w.session),
  }
}

// Improved depth score with better weighting for shallow scrolling
function depthScore(bucket: EphemeralBehaviorState["scroll"]["maxDepthBucket"] | undefined): number {
  if (bucket === "top") return 1.0     // Strong signal for shallow browsing
  if (bucket === "middle") return 0.3  // Reduced from 0.5 - middle scrolling is less concerning
  if (bucket === "bottom") return 0    // Deep scrolling indicates engagement
  return 0.5 // Unknown/undefined - neutral score
}

// Session dampening: reduce COI inflation during initial browsing session
function sessionDampeningFactor(durationMs: number): number {
  const MIN_SESSION_MS = 5 * 60 * 1000 // 5 minutes
  if (durationMs >= MIN_SESSION_MS) return 1.0
  // Gradual ramp-up from 0.5 to 1.0 over first 5 minutes
  return 0.5 + (durationMs / MIN_SESSION_MS) * 0.5
}

// Enhanced coefficient of variation with outlier handling
function coefOfVariation(values: number[]): number {
  if (!values.length) return 0
  if (values.length === 1) return 0 // Single value has no variance
  
  // Remove outliers using IQR method for better variance calculation
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr
  
  const filtered = values.filter(v => v >= lowerBound && v <= upperBound)
  if (!filtered.length) return coefOfVariation(values) // Fallback if all outliers
  
  const mean = filtered.reduce((s, v) => s + v, 0) / filtered.length
  if (mean === 0) return 0
  const variance = filtered.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / filtered.length
  const std = Math.sqrt(variance)
  return std / mean
}

export function computeSessionCoi(
  session: Session,
  behavior: EphemeralBehaviorState | undefined,
  weights: CoiWeights
): CoiResult {
  // Ensure weights sum to 1 per scope
  weights = normalizeWeights(weights)
  const derived: DerivedSessionMetrics = deriveSessionMetrics(session)
  const durationMs = Math.max(derived.sessionDurationMs, 1)
  const durationHours = durationMs / 3_600_000
  const pageCount = Math.max(derived.pageCount, 1)

  const tabSwitchCount = behavior?.tabSwitchCount ?? 0
  const idleTransitions = behavior?.idleTransitions ?? 0
  const scrollBurst = behavior?.scroll?.burstCount ?? 0
  const shallowDepth = depthScore(behavior?.scroll?.maxDepthBucket)

  // Dwell variance using page-level metrics with outlier handling
  const pageMetrics = derivePageMetrics(session)
  const dwellValues = pageMetrics
    .map((p) => p.dwellTimeMs)
    .filter((v): v is number => typeof v === "number" && v > 0)
  const dwellCV = coefOfVariation(dwellValues)

  const domainChurn = clamp01(derived.uniqueDomainCount / pageCount)
  const revisit = clamp01(pageMetrics.some((p) => p.revisitCount > 0) ? 1 : 0)
  const foregroundDrop = clamp01(
    derived.foregroundRatio !== undefined ? 1 - derived.foregroundRatio : 0
  )

  // Improved feature calculations with better normalization
  const features: CoiFeatureVector = {
    // Tab switching: normalize by expected rate (2-3 switches per 10 min is normal)
    tabSwitch: clamp01(Math.min(tabSwitchCount / Math.max(durationHours * 15, 1), 2) / 2),
    // Idle transitions: normalize by expected rate (4-5 transitions per hour is normal)
    idleTransitions: clamp01(Math.min(idleTransitions / Math.max(durationHours * 8, 1), 2) / 2),
    // Scroll burst: rapid scrolling normalized per page
    scrollBurst: clamp01(Math.min(scrollBurst / Math.max(pageCount * 2, 1), 2) / 2),
    shallowDepth,
    // Dwell variance: high variance indicates scattered attention
    dwellVariance: clamp01(Math.min(dwellCV, 3) / 3),
    domainChurn,
    revisit,
    // Duration: longer sessions slightly increase score (fatigue factor)
    duration: clamp01(Math.min(durationHours / 6, 1)),
    foregroundDrop,
  }

  const rawScore = Object.entries(weights.session).reduce((sum, [key, weight]) => {
    const feature = features[key] ?? 0
    return sum + weight * feature
  }, 0)

  // Apply session dampening to reduce false positives in early session
  const dampening = sessionDampeningFactor(durationMs)
  const score = clamp01(rawScore * dampening)

  return { score, features }
}

export function computePageCoi(
  session: Session,
  pageIndex: number,
  behavior: EphemeralBehaviorState | undefined,
  weights: CoiWeights
): CoiResult {
  // Ensure weights sum to 1 per scope
  weights = normalizeWeights(weights)
  const pageMetrics = derivePageMetrics(session)
  const derivedSession = deriveSessionMetrics(session)
  const page = pageMetrics[pageIndex]

  if (!page) {
    return { score: 0, features: {} }
  }

  const durationHours = Math.max((derivedSession.sessionDurationMs || 1) / 3_600_000, 0.1)
  const pageCount = Math.max(derivedSession.pageCount, 1)
  const tabSwitchCount = behavior?.tabSwitchCount ?? 0
  const idleTransitions = behavior?.idleTransitions ?? 0
  const scrollBurst = behavior?.scroll?.burstCount ?? 0
  const shallowDepth = depthScore(behavior?.scroll?.maxDepthBucket)

  // Improved dwell time scoring: very short dwell is concerning, optimal is 2-8 min
  const dwellMinutes = (page.dwellTimeMs ?? 0) / 60_000
  let dwellScore: number
  if (dwellMinutes < 0.5) {
    dwellScore = 1.0 // Very short dwell indicates distraction
  } else if (dwellMinutes < 2) {
    dwellScore = 0.7 // Short dwell, slightly concerning
  } else if (dwellMinutes < 8) {
    dwellScore = 0.2 // Optimal engagement range
  } else {
    dwellScore = 0.3 // Very long dwell could indicate stuck/idle
  }

  const revisit = clamp01(page.revisitCount > 0 ? 0.3 : 0) // Revisits less concerning than before
  const position = clamp01(page.positionInSession)

  const features: CoiFeatureVector = {
    // Tab switching: better normalization (15 switches per hour is concerning)
    tabSwitch: clamp01(Math.min(tabSwitchCount / Math.max(durationHours * 15, 1), 2) / 2),
    // Idle transitions: better normalization (8 transitions per hour is concerning)
    idleTransitions: clamp01(Math.min(idleTransitions / Math.max(durationHours * 8, 1), 2) / 2),
    scrollBurst: clamp01(Math.min(scrollBurst / Math.max(pageCount * 2, 1), 2) / 2),
    shallowDepth,
    dwell: dwellScore,
    position,
    revisit,
  }

  const score = Object.entries(weights.page).reduce((sum, [key, weight]) => {
    const feature = features[key] ?? 0
    return sum + weight * feature
  }, 0)

  return { score, features }
}
