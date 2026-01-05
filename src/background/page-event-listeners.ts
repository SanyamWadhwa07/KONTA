import { processPageEvent, getSessions, getCurrentSessionId } from "./sessionManager"
import { getBehaviorState } from "./ephemeralBehavior"
import { generateEmbedding } from "./embedding-engine"
import { markGraphForRebuild, broadcastSessionUpdate } from "./index"
import { checkPageForCandidate, markCandidateNotified } from "./candidateDetector"
import { checkForProjectSuggestion } from "./projectSuggestions"
import { loadProjects } from "./projectManager"
import type { AppSettings } from "~/types/settings"
import { DEFAULT_SETTINGS } from "~/types/settings"
import { log, warn } from "~/lib/logger"

// Helper to check if a domain is excluded
async function isDomainExcluded(url: string): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get("aegis-settings")
    const settings = result["aegis-settings"] as AppSettings | undefined
    const excludedDomains = settings?.privacy?.excludedDomains ?? []
    
    if (excludedDomains.length === 0) return false
    
    const urlObj = new URL(url)
    const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '')
    
    return excludedDomains.some(excluded => {
      const normalizedExcluded = excluded.toLowerCase().replace(/^www\./, '')
      return domain === normalizedExcluded || domain.endsWith('.' + normalizedExcluded)
    })
  } catch (error) {
    warn("[PageEvent] Failed to check excluded domains:", error)
    return false
  }
}

// Helper to load notification settings
async function loadNotificationSettings(): Promise<AppSettings["notifications"]> {
  try {
    const result = await chrome.storage.local.get("aegis-settings")
    log("[PageEventListeners] Raw storage result:", result)
    const settings = result["aegis-settings"] as AppSettings | undefined
    log("[PageEventListeners] Parsed settings object:", settings)
    const notifications = settings?.notifications ?? DEFAULT_SETTINGS.notifications
    log("[PageEventListeners] Loaded notification settings:", {
      projectDetection: notifications.projectDetection,
      reminders: notifications.reminders,
      projectSuggestions: notifications.projectSuggestions
    })
    return notifications
  } catch (error) {
    warn("[PageEventListeners] Failed to load settings, using defaults:", error)
    return DEFAULT_SETTINGS.notifications
  }
}

// Track recently shown project main site notifications to prevent loops
const recentMainSiteNotifications = new Map<string, number>()
const NOTIFICATION_COOLDOWN_MS = 30000 // 30 seconds

// Track manually opened sites from sidepanel to prevent notifications
const manuallyOpenedSites = new Map<string, number>()
const MANUAL_OPEN_COOLDOWN_MS = 5000 // 5 seconds

// Clean URL to remove chrome-extension prefix if present
function cleanUrl(url: string): string {
  // Remove chrome-extension://[extension-id]/tabs/ prefix
  // Extension IDs are 32 lowercase letters
  const chromeExtPattern = /^chrome-extension:\/\/[a-z]{32}\/tabs\//
  if (chromeExtPattern.test(url)) {
    log("[cleanUrl] Detected chrome-extension URL:", url)
    // Extract the actual URL after /tabs/
    const cleanedUrl = url.replace(chromeExtPattern, '')
    // Add https:// if it doesn't have a protocol
    const finalUrl = cleanedUrl.startsWith('http') ? cleanedUrl : 'https://' + cleanedUrl
    log("[cleanUrl] Cleaned URL:", finalUrl)
    return finalUrl
  }
  // Ensure URL has protocol (not relative)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url
  }
  return url
}

// Extract search query from search engine URLs
function extractSearchQuery(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    // Google Search
    if (hostname.includes('google.com') && urlObj.pathname.includes('/search')) {
      return urlObj.searchParams.get('q')
    }
    
    // Bing Search
    if (hostname.includes('bing.com') && urlObj.pathname.includes('/search')) {
      return urlObj.searchParams.get('q')
    }
    
    // DuckDuckGo
    if (hostname.includes('duckduckgo.com')) {
      return urlObj.searchParams.get('q')
    }
    
    return null
  } catch (e) {
    return null
  }
}

// Listen for PAGE_VISITED events from content script
export const setupPageVisitListener = () => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SITE_OPENED_FROM_SIDEPANEL") {
      // Track that this site was manually opened from the sidepanel
      const url = message.payload?.url
      if (url) {
        manuallyOpenedSites.set(url, Date.now())
        log('[ManualOpen] Tracking site opened from sidepanel:', url)
      }
      return
    }
    
    if (message.type === "PAGE_VISITED") {
      const baseEvent = {
        ...message.payload,
        openedAt: message.payload.openedAt ?? message.payload.timestamp
      }

      log("[PageEvent] PAGE_VISITED:", baseEvent)
      log("[PageEvent] Behavior State:", getBehaviorState())

      ;(async () => {
        try {
          // Check if domain is excluded before processing
          const isExcluded = await isDomainExcluded(baseEvent.url)
          if (isExcluded) {
            log("[PageEvent] Skipping excluded domain:", baseEvent.url)
            return
          }

          // Reuse existing embedding for this URL if already computed in past sessions
          const sessions = getSessions()
          const existingWithEmbedding = (() => {
            for (let i = sessions.length - 1; i >= 0; i--) {
              const s = sessions[i]
              for (let j = s.pages.length - 1; j >= 0; j--) {
                const p = s.pages[j]
                if (p.url === baseEvent.url && p.titleEmbedding) return p
              }
            }
            return null
          })()

          // Extract search query if this is a search engine result page
          const searchQuery = extractSearchQuery(baseEvent.url)
          if (searchQuery) {
            baseEvent.searchQuery = searchQuery
          }

          // For search URLs, skip cache and regenerate embedding with search query
          // For other URLs, reuse existing embedding if available
          if (searchQuery) {
            // Always generate fresh embedding for search queries
            const titleEmbedding = await generateEmbedding(searchQuery)
            if (titleEmbedding) {
              baseEvent.titleEmbedding = titleEmbedding
              log("[PageEvent] Embedding generated for search query:", searchQuery)
            }
          } else if (existingWithEmbedding?.titleEmbedding) {
            baseEvent.titleEmbedding = existingWithEmbedding.titleEmbedding
          } else {
            // Use search query for embedding if available, otherwise use title
            const textForEmbedding = searchQuery || baseEvent.title
            const titleEmbedding = await generateEmbedding(textForEmbedding)
            if (titleEmbedding) {
              baseEvent.titleEmbedding = titleEmbedding
              log("[PageEvent] Embedding generated for:", searchQuery ? `search query "${searchQuery}"` : `title "${baseEvent.title}"`)
            }
          }

          await processPageEvent(baseEvent)

          // Broadcast updated sessions to all registered sidepanel listeners
          broadcastSessionUpdate()

          // Mark graph for rebuild after page event is processed
          markGraphForRebuild()

          // Check if current URL is the main site (first site) of any project
          const tabId = sender.tab?.id
          const projects = await loadProjects()
          
          const matchingProject = projects.find(p => {
            if (!p.sites || p.sites.length === 0) return false
            
            // Find the earliest added site (main site) based on addedAt timestamp
            const mainSite = [...p.sites].sort((a, b) => a.addedAt - b.addedAt)[0]
            
            // Get the main site URL and normalize it
            let mainSiteUrl = mainSite.url.toLowerCase()
            const currentUrl = baseEvent.url.toLowerCase()
            
            // Ensure both have protocols for proper comparison
            if (!mainSiteUrl.startsWith('http')) {
              mainSiteUrl = 'https://' + mainSiteUrl
            }
            
            // Extract the base URLs without query params or fragments
            try {
              const firstUrl = new URL(mainSiteUrl)
              const currUrl = new URL(currentUrl)
              
              // Match if hostname and pathname match (ignoring query/hash)
              return firstUrl.hostname === currUrl.hostname && 
                     currUrl.pathname.startsWith(firstUrl.pathname)
            } catch {
              // Fallback to simple string matching if URL parsing fails
              return currentUrl.includes(mainSiteUrl) || mainSiteUrl.includes(currentUrl)
            }
          })

          if (matchingProject && tabId) {
            // Check if this site was manually opened from sidepanel
            const now = Date.now()
            const manuallyOpened = manuallyOpenedSites.get(baseEvent.url)
            if (manuallyOpened && (now - manuallyOpened) < MANUAL_OPEN_COOLDOWN_MS) {
              log('[MainSiteNotification] Skipping notification - site was manually opened from sidepanel')
              return
            }
            
            // Check cooldown to prevent notification loops
            const lastShown = recentMainSiteNotifications.get(matchingProject.id)
            
            if (!lastShown || (now - lastShown) > NOTIFICATION_COOLDOWN_MS) {
              log("[ProjectMainSite] ✅ Detected visit to main site of project:", matchingProject.name)
              recentMainSiteNotifications.set(matchingProject.id, now)
              
              // Check if project suggestion notifications are enabled
              const notificationSettings = await loadNotificationSettings()
              log("[ProjectMainSite] Settings check - projectSuggestions enabled:", notificationSettings.projectSuggestions)
              
              if (notificationSettings.projectSuggestions) {
                chrome.tabs.sendMessage(tabId, {
                  type: "PROJECT_MAIN_SITE_VISIT",
                  payload: {
                    projectId: matchingProject.id,
                    projectName: matchingProject.name,
                    currentUrl: cleanUrl(baseEvent.url)
                  }
                }).catch((err) => {
                  log("[ProjectMainSite] Could not send notification:", err)
                })
              } else {
                log("[ProjectMainSite] Notification disabled in settings, skipping")
              }
            } else {
              log("[ProjectMainSite] ⏸️ Skipping notification (cooldown active):", matchingProject.name)
            }
          } else {
            log("[ProjectMainSite] No matching project for:", baseEvent.url)
          }

          // Check if this page should create/update a project candidate
          const allSessions = getSessions()
          const currentSessionId = getCurrentSessionId()
          if (currentSessionId) {
            const candidate = await checkPageForCandidate(baseEvent, currentSessionId, allSessions)
            if (candidate) {
              log("[ProjectDetection] Candidate ready to notify:", candidate)
              
              // Mark as notified FIRST (to prevent returning same candidate repeatedly)
              await markCandidateNotified(candidate.id, currentSessionId)
              
              // Check if project detection notifications are enabled
              const notificationSettings = await loadNotificationSettings()
              log("[ProjectDetection] Settings check - projectDetection enabled:", notificationSettings.projectDetection)
              if (notificationSettings.projectDetection) {
                // Send notification to content script (will show subtle banner)
                if (tabId) {
                  chrome.tabs.sendMessage(tabId, {
                    type: "PROJECT_CANDIDATE_READY",
                    payload: {
                      candidateId: candidate.id,
                      primaryDomain: candidate.primaryDomain,
                      keywords: candidate.keywords,
                      visitCount: candidate.visitCount,
                      score: candidate.score,
                      scoreBreakdown: candidate.scoreBreakdown,
                      sessionId: currentSessionId
                    }
                  }).catch((err) => {
                    log("[CandidateDetector] Could not send notification to tab:", err)
                  })
                }
              } else {
                log("[ProjectDetection] Notification disabled in settings, skipping")
              }
            }
            
            // Also check for project suggestions (add to existing project)
            const suggestion = await checkForProjectSuggestion(baseEvent, baseEvent.url)
            if (suggestion) {
              // Check if project suggestion notifications are enabled
              const notificationSettings = await loadNotificationSettings()
              log("[ProjectSuggestion] Settings check - projectSuggestions enabled:", notificationSettings.projectSuggestions)
              if (notificationSettings.projectSuggestions) {
                log("[ProjectSuggestion] ✅ Suggestion valid, sending notification:", suggestion.project.name, "score:", suggestion.score)
                if (tabId) {
                  chrome.tabs.sendMessage(tabId, {
                    type: "PROJECT_SUGGESTION_READY",
                    payload: {
                      projectId: suggestion.project.id,
                      projectName: suggestion.project.name,
                      currentUrl: cleanUrl(baseEvent.url),
                      currentTitle: baseEvent.title,
                      score: suggestion.score
                    }
                  }).catch((err) => {
                    log("[ProjectSuggestion] Could not send notification:", err)
                  })
                }
              } else {
                log("[ProjectSuggestion] Notification disabled in settings, skipping")
              }
            } else {
              log("[ProjectSuggestion] ⚠️ No valid suggestion (already in project or dismissed)")
            }
          }
        } catch (error) {
          console.error("[PageEvent] Failed to process page event:", error)
        }
      })()

      // Keep the message channel open for async work to avoid back/forward cache warnings
      return true
    }
  })
}
