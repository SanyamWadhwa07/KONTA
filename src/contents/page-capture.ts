import type { PlasmoCSConfig } from "plasmo"
import type { PageEvent } from "~/types/page-event"
import type { AppSettings } from "~/types/settings"
import { log, warn, error} from "~/lib/logger"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start"
}

// Helper to check if current domain is excluded
const isDomainExcluded = async (): Promise<boolean> => {
  try {
    const result = await chrome.storage.local.get("aegis-settings")
    const settings = result["aegis-settings"] as AppSettings | undefined
    const excludedDomains = settings?.privacy?.excludedDomains ?? []
    
    if (excludedDomains.length === 0) return false
    
    const currentDomain = location.hostname.toLowerCase().replace(/^www\./, '')
    
    // Check if current domain matches any excluded domain
    return excludedDomains.some(excluded => {
      const normalizedExcluded = excluded.toLowerCase().replace(/^www\./, '')
      return currentDomain === normalizedExcluded || currentDomain.endsWith('.' + normalizedExcluded)
    })
  } catch (error) {
    error("[PageCapture] Failed to check excluded domains:", error)
    return false
  }
}

// Capture page visit data and send to background script
const capturePageVisit = async () => {
  // Check if domain is excluded before capturing
  const isExcluded = await isDomainExcluded()
  if (isExcluded) {
    log("[PageCapture] Skipping excluded domain:", location.hostname)
    return
  }

  const pageEvent: PageEvent = {
    url: location.href,
    title: document.title,
    domain: location.hostname,
    timestamp: Date.now(),
    openedAt: Date.now(),
    wasForeground: document.visibilityState === "visible",
    referrer: document.referrer || undefined
  }

  chrome.runtime.sendMessage({
    type: "PAGE_VISITED",
    payload: pageEvent
  })
}

// Capture on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", capturePageVisit)
} else {
  capturePageVisit()
}

export {}
