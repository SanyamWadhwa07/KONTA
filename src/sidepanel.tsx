import "./style.css"
import { useState, useEffect } from "react"
import { EmptyState } from "@/components/sidepanel/EmptyState"
import { PopulatedState } from "@/components/sidepanel/PopulatedState"
import { log, warn } from "~/lib/logger"

function IndexSidePanel() {
  const [showPopulated, setShowPopulated] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("sessions") // Track active tab
  const [isOnboarding, setIsOnboarding] = useState(false) // Track if in onboarding mode

  useEffect(() => {
    // Check if there's a preferred tab stored
    chrome.storage.local.get(["sidepanel-active-tab", "sidepanel-onboarding", "aegis-settings"], (result) => {
      if (result["sidepanel-active-tab"]) {
        const tab = result["sidepanel-active-tab"]
        log("[Sidepanel] Setting active tab from storage:", tab)
        setShowPopulated(true)
        setActiveTab(tab as "sessions" | "graph" | "projects")
        // Clear the preference after using it
        chrome.storage.local.remove("sidepanel-active-tab")
      }
      
      // Check if opened during onboarding
      if (result["sidepanel-onboarding"] === true) {
        log("[Sidepanel] Opened in onboarding mode")
        setIsOnboarding(true)
        // Clear the flag after using it
        chrome.storage.local.remove("sidepanel-onboarding")
      }
      
      // Apply dark mode from settings
      if (result["aegis-settings"]?.ui?.darkMode) {
        log("[Sidepanel] Applying dark mode from settings")
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    })

    // Listen for messages from background script
    const messageListener = (
      message: { type: "SWITCH_TO_TAB"; payload: { tab: string } },
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === "SWITCH_TO_TAB") {
        setShowPopulated(true) // Ensure populated state is showing
        setActiveTab(message.payload.tab)
      }
      sendResponse()
    }

    chrome.runtime.onMessage.addListener(messageListener)

    // Listen for storage changes (for dark mode updates)
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes['aegis-settings']) {
        const newSettings = changes['aegis-settings'].newValue
        if (newSettings?.ui?.darkMode) {
          log("[Sidepanel] Dark mode enabled via storage change")
          document.documentElement.classList.add('dark')
        } else {
          log("[Sidepanel] Dark mode disabled via storage change")
          document.documentElement.classList.remove('dark')
        }
      }
    }

    chrome.storage.onChanged.addListener(storageListener)

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
      chrome.storage.onChanged.removeListener(storageListener)
    }
  }, [])

  return (
    <div className="h-screen w-full bg-white dark:bg-[#1C1C1E]">
      {showPopulated ? (
        <PopulatedState 
          onShowEmpty={() => setShowPopulated(false)} 
          initialTab={activeTab}
        />
      ) : (
        <EmptyState 
          onShowPopulated={() => setShowPopulated(true)}
          isOnboarding={isOnboarding}
        />
      )}
    </div>
  )
}

export default IndexSidePanel
