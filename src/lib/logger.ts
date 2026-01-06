import type { AppSettings } from "~/types/settings"
import { DEFAULT_SETTINGS } from "~/types/settings"

let debugMode = false

// Load debug mode setting
async function loadDebugMode() {
  try {
    const result = await chrome.storage.local.get("aegis-settings")
    const settings = result["aegis-settings"] as AppSettings | undefined
    debugMode = settings?.developer?.debugMode ?? DEFAULT_SETTINGS.developer.debugMode
  } catch (error) {
    debugMode = false
  }
}

// Initialize on load
loadDebugMode()

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["aegis-settings"]) {
    const newSettings = changes["aegis-settings"].newValue as AppSettings | undefined
    debugMode = newSettings?.developer?.debugMode ?? DEFAULT_SETTINGS.developer.debugMode
  }
})

// Debug logger that only logs when debug mode is enabled
export const log = (...args: any[]) => {
  if (debugMode) {
    console.log(...args)
  }
}

export const warn = (...args: any[]) => {
  if (debugMode) {
    console.warn(...args)
  }
}

export const error = (...args: any[]) => {
  // Always log errors
  console.error(...args)
}

// Force log (always logs regardless of debug mode)
export const forceLog = (...args: any[]) => {
  console.log(...args)
}
