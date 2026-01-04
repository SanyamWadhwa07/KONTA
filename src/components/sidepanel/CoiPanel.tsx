import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { EphemeralBehaviorState } from "~/types/ephemeral-behavior"
import type { Session } from "~/types/session"
import {
  type CoiWeights,
  computePageCoi,
  computeSessionCoi,
  getDefaultWeights,
  loadCoiWeights,
  saveCoiWeights,
  normalizeWeights,
} from "~/lib/coi"

interface CoiPanelProps {
  sessions: Session[]
}

function sendMessage<T>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(err)
      } else {
        resolve(response as T)
      }
    })
  })
}

export function CoiPanel({ sessions }: CoiPanelProps) {
  const [weights, setWeights] = useState<CoiWeights>(getDefaultWeights())
  const [behavior, setBehavior] = useState<EphemeralBehaviorState | undefined>(undefined)
  const [liveScores, setLiveScores] = useState<{ page?: number; session?: number } | null>(null)

  useEffect(() => {
    loadCoiWeights().then(setWeights).catch((err) => {
      console.warn("Failed to load COI weights, using defaults", err)
    })
  }, [])

  useEffect(() => {
    sendMessage<{ state?: EphemeralBehaviorState }>({ type: "GET_BEHAVIOR_STATE" })
      .then((res) => setBehavior(res?.state))
      .catch((err) => console.warn("Failed to get behavior state", err))
  }, [])

  // Persist weights whenever they change
  useEffect(() => {
    saveCoiWeights(weights)
  }, [weights])

  const latestSession = useMemo(() => {
    if (!sessions.length) return undefined
    return sessions[sessions.length - 1]
  }, [sessions])

  const latestPageIndex = useMemo(() => {
    if (!latestSession || !latestSession.pages.length) return -1
    return latestSession.pages.length - 1
  }, [latestSession])

  const sessionResult = useMemo(() => {
    if (!latestSession) return null
    return computeSessionCoi(latestSession, behavior, weights)
  }, [latestSession, behavior, weights])

  const pageResult = useMemo(() => {
    if (!latestSession || latestPageIndex < 0) return null
    return computePageCoi(latestSession, latestPageIndex, behavior, weights)
  }, [latestSession, latestPageIndex, behavior, weights])

  const handleReset = () => {
    const defaults = getDefaultWeights()
    setWeights(defaults)
  }

  const updateWeight = (scope: "page" | "session", key: string, value: number) => {
    setWeights((prev) => {
      const next = {
        ...prev,
        [scope]: {
          ...prev[scope],
          [key]: value,
        },
      }
      return normalizeWeights(next)
    })
  }

  const formatScore = (val: number | undefined | null) =>
    val === undefined || val === null ? "—" : val.toFixed(2)

  // Tooltip descriptions for each parameter
  const parameterInfo: Record<string, string> = {
    // Page parameters
    tabSwitch: "How often you switch tabs - higher indicates scattered attention",
    idleTransitions: "Frequency of idle/active state changes - may indicate distraction",
    scrollBurst: "Rapid scrolling events - often indicates skimming rather than reading",
    shallowDepth: "Staying at top of pages without scrolling - suggests lack of engagement",
    dwell: "Time spent on page - very short or very long can indicate issues",
    position: "Position of page in browsing session - earlier pages may be more scattered",
    revisit: "Returning to previously visited pages - can indicate indecision",
    
    // Session parameters
    domainChurn: "Rate of switching between different domains - high indicates scattered focus",
    dwellVariance: "Variation in time spent across pages - inconsistent engagement",
    duration: "Total session length - very long sessions can cause mental fatigue",
    foregroundDrop: "Time spent with browser in background - indicates multi-tasking"
  }

  const renderWeights = (scope: "page" | "session") => {
    const entries = Object.entries(weights[scope])
    return (
      <div className="flex flex-col gap-4">
        {entries.map(([key, value]) => (
          <label key={`${scope}-${key}`} className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm font-medium text-slate-700">
              <div className="flex items-center gap-1.5">
                <span>{key}</span>
                {parameterInfo[key] && (
                  <div className="group relative">
                    <svg 
                      className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" 
                      fill="currentColor" 
                      viewBox="0 0 20 20"
                    >
                      <path 
                        fillRule="evenodd" 
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" 
                        clipRule="evenodd" 
                      />
                    </svg>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-50">
                      {parameterInfo[key]}
                      <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
                    </div>
                  </div>
                )}
              </div>
              <span>{value.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={value}
              onChange={(e) => updateWeight(scope, key, parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
          </label>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border bg-white p-3 shadow-sm" style={{ borderColor: "#E5E5E5" }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Cognitive Overload Index</p>
          <div className="flex items-center gap-3 mt-1">
            <div className="text-sm text-slate-700">Page</div>
            <div className="text-lg font-semibold" style={{ color: "#0072de" }}>
              {formatScore(liveScores?.page ?? pageResult?.score)}
            </div>
            <div className="text-sm text-slate-700">Session</div>
            <div className="text-lg font-semibold" style={{ color: "#0072de" }}>
              {formatScore(liveScores?.session ?? sessionResult?.score)}
            </div>
          </div>
        </div>
      </div>
      {/* Live updates listener */}
      <LiveCoiListener setBehavior={setBehavior} setWeights={setWeights} setScores={setLiveScores} />
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <span>Last page: {latestSession?.pages[latestPageIndex]?.title ?? "—"}</span>
        <span>Session pages: {latestSession?.pages.length ?? 0}</span>
      </div>
    </div>
  )
}

// Component to listen for COI_UPDATE and storage changes
function LiveCoiListener({ setBehavior, setWeights, setScores }: { setBehavior: (b: EphemeralBehaviorState | undefined) => void; setWeights: (w: CoiWeights) => void; setScores: (s: { page?: number; session?: number } | null) => void }) {
  useEffect(() => {
    const onMessage = (message: any) => {
      if (message?.type === "COI_UPDATE" && message?.payload) {
        const pageScore = message.payload.page?.score as number | undefined
        const sessionScore = message.payload.session?.score as number | undefined
        setScores({ page: pageScore, session: sessionScore })
      }
      if (message?.type === "GET_BEHAVIOR_STATE_RESPONSE" && message.state) {
        setBehavior(message.state as EphemeralBehaviorState)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)

    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes["coi-weights"]) {
        const newVal = changes["coi-weights"].newValue as CoiWeights
        if (newVal) setWeights(normalizeWeights(newVal))
      }
    }
    chrome.storage.onChanged.addListener(onStorageChange)

    // Poll behavior state every 5s as fallback
    const timer = setInterval(() => {
      chrome.runtime.sendMessage({ type: "GET_BEHAVIOR_STATE" }, (res) => {
        if (!chrome.runtime.lastError && res?.state) {
          setBehavior(res.state as EphemeralBehaviorState)
        }
      })
    }, 5000)

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      chrome.storage.onChanged.removeListener(onStorageChange)
      clearInterval(timer)
    }
  }, [setBehavior, setWeights])
  return null
}
