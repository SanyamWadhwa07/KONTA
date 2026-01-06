import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import lottie from "lottie-web"
import { Button } from "@/components/ui/button"
import { log, warn } from "~/lib/logger"

interface OnboardingProgress {
  isModelLoading: boolean
  modelLoadPercent: number
  totalPages: number
  processedPages: number
  embeddingsGenerated: number
  isComplete: boolean
}

interface EmptyStateProps {
  onShowPopulated?: () => void
  isOnboarding?: boolean
}

export function EmptyState({ onShowPopulated, isOnboarding = false }: EmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgress | null>(null)

  // Listen for onboarding progress messages
  useEffect(() => {
    if (!isOnboarding) return

    const handleMessage = (message: any) => {
      if (message.type === "ONBOARDING_PROGRESS") {
        setOnboardingProgress(message.progress)
        
        // Auto-transition to graph view once we have 20+ embeddings
        if (message.progress.embeddingsGenerated >= 20 && onShowPopulated) {
          log("[EmptyState] 20+ embeddings ready, transitioning to graph view")
          onShowPopulated()
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [isOnboarding, onShowPopulated])

  // Check if embeddings are in progress on mount
  useEffect(() => {
    if (!isOnboarding) return

    chrome.storage.local.get(['onboarding-embeddings-in-progress', 'onboarding-embeddings-complete'], (result) => {
      if (result['onboarding-embeddings-in-progress'] && !result['onboarding-embeddings-complete']) {
        log("[EmptyState] Embeddings in progress on mount, showing progress UI")
        // Set initial progress state to trigger UI
        setOnboardingProgress({
          isModelLoading: false,
          modelLoadPercent: 100,
          totalPages: 0,
          processedPages: 0,
          embeddingsGenerated: 0,
          isComplete: false,
        })
      }
    })
  }, [isOnboarding])

  useEffect(() => {
    // Load and render Lottie animation
    const loadLottie = async () => {
      if (!containerRef.current) return

      try {
        const assetUrl = chrome.runtime.getURL("assets/Ambient-Motion.json")
        const response = await fetch(assetUrl)
        const animationData = await response.json()

        lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: animationData
        })
      } catch (error) {
        console.error("Failed to load Lottie animation:", error)
      }
    }

    loadLottie()
  }, [])

  const handleClose = () => {
    // Send message to content scripts before closing
    log("Sidepanel sending SIDEPANEL_CLOSED message")
    chrome.runtime.sendMessage({ type: "SIDEPANEL_CLOSED" })
    
    // If closing during onboarding, trigger the "Konta is live!" notification
    if (isOnboarding) {
      log("Closing during onboarding, triggering Konta is live notification")
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "SHOW_ONBOARDING_COMPLETE",
            title: "Konta is live!",
            message: "Your intelligent browsing assistant is now active and learning your context."
          })
        }
      })
    }
    
    // Also set localStorage as fallback
    localStorage.setItem("aegis-sidebar-closed", "true")
    window.close()
  }

  const handleReset = () => {
    chrome.storage.local.remove(["aegis-consent", "onboarding-complete"])
    alert("Onboarding state reset. Re-open popup to see Welcome & Consent.")
  }

  return (
    <div className="relative h-full flex flex-col bg-white dark:bg-[#1C1C1E]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b bg-white dark:bg-[#1C1C1E] border-[#E5E5E5] dark:border-[#3A3A3C]">
        <div className="flex items-center gap-3">
          <img src={chrome.runtime.getURL('assets/konta_logo.svg')} alt="Konta" className="w-8 h-8" />
          <h1 
            className="text-xl font text-[#080A0B] dark:text-[#FFFFFF]"
            style={{ fontFamily: "'Breeze Sans'" }}>
            Konta
          </h1>
        </div>
        
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none text-[#9A9FA6] dark:text-[#9A9FA6]">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-between p-6 pt-4">
        <div className="flex flex-col items-center max-w-sm text-center">
        {/* Ambient Motion */}
        <div
          ref={containerRef}
          className="w-64 h-64 mb-8"
        />

        {isOnboarding ? (
          // Onboarding completion message with embedding progress
          <>
            <h2
              className="text-2xl font mb-6 text-[#080A0B] dark:text-[#FFFFFF]"
              style={{ fontFamily: "'Breeze Sans'" }}>
              {onboardingProgress ? "Processing your history..." : "You're all set!"}
            </h2>

            {onboardingProgress && !onboardingProgress.isComplete ? (
              <>
                {/* Model loading phase */}
                {onboardingProgress.isModelLoading && (
                  <div className="w-full max-w-xs mb-6">
                    <p className="text-sm mb-2 text-[#666666] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Loading AI model... {onboardingProgress.modelLoadPercent}%
                    </p>
                    <div className="h-2 bg-[#F0F0F0] dark:bg-[#3A3A3C] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#0072de] dark:bg-[#3e91ff] transition-all duration-300"
                        style={{ width: `${onboardingProgress.modelLoadPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Embedding generation phase */}
                {!onboardingProgress.isModelLoading && onboardingProgress.totalPages > 0 && (
                  <div className="w-full max-w-xs mb-6">
                    <p className="text-sm mb-2 text-[#666666] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Building knowledge graph... {onboardingProgress.embeddingsGenerated}/{onboardingProgress.totalPages} pages
                    </p>
                    <div className="h-2 bg-[#F0F0F0] dark:bg-[#3A3A3C] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#0072de] dark:bg-[#3e91ff] transition-all duration-300"
                        style={{ 
                          width: `${(onboardingProgress.embeddingsGenerated / onboardingProgress.totalPages) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs leading-relaxed text-[#666666] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                  This may take a few moments. You can close this and continue browsing—we'll keep working in the background.
                </p>
              </>
            ) : (
              // Original "you're all set" message when no progress data
              <>
                <p
                  className="text-sm mb-4 text-[#080A0B] dark:text-[#FFFFFF]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Close the sidebar and continue browsing
                </p>

                <p
                  className="text-xs leading-relaxed mb-4 text-[#666666] dark:text-[#9A9FA6]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Konta will quietly learn from your browsing context. You can always come back here to view your sessions and projects.
                </p>
                <p
                  className="text-xs mb-2 text-[#666666] dark:text-[#9A9FA6]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  The first 7 days of your history have already been fetched, feel free to explore!
                </p>
              </>
            )}
          </>
        ) : null}
        </div>

        {/* Bottom section with demo button and dev buttons */}
        <div className="flex flex-col items-center gap-2 pb-4">
          {isOnboarding && (!onboardingProgress || onboardingProgress.isComplete) ? (
            // Onboarding completion button - only show when not actively processing
            <Button
              onClick={handleClose}
              className="h-[46px] px-8 font text-base rounded-full bg-[#0072de] dark:bg-[#3e91ff]"
              style={{
                color: 'white'
              }}>
              Let's go!
            </Button>
          ) : null}
        </div>
      </div>

      {/* Remove the auto-close progress bar since we're now showing embedding progress */}
    </div>
  )
}
