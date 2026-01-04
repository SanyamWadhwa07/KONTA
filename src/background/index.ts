import {
  setupPageVisitListener,
} from "./page-event-listeners"
import {
  setupSidepanelClosedListener,
  setupOpenSidepanelListener
} from "./sidepanel-listeners"
import { setupConsentListener } from "./consent-listener"
import { getSessions, initializeSessions, updateSessionLabel, deletePageFromSession, deleteSession } from "./sessionManager"
import { executeSearch } from "./search-coordinator"
import { loadLabels, addLabel, deleteLabel, getLabelById } from "./labelsStore"
import { loadLearnedAssociations, learnFromSession, predictLabelForSession } from "./contextLearning"
import { 
  detectProjects, 
  loadProjects, 
  addProject, 
  updateProject, 
  deleteProject 
} from "./projectManager"
import { 
  getReadyCandidates,
  dismissCandidate,
  promoteCandidateToProject,
  createTestCandidate,
  clearAllCandidates,
  loadCandidates,
  saveCandidates
} from "./candidateDetector"
import { logSearchResults } from "~/lib/search-explainer"
import {
  incrementTabSwitch,
  updateScrollDepth,
  incrementScrollBurst,
  getBehaviorState
} from "./ephemeralBehavior"
import { computePageCoi, computeSessionCoi, loadCoiWeights } from "~/lib/coi"
import { buildKnowledgeGraph, buildProjectGraph, type KnowledgeGraph } from "~/lib/knowledge-graph"
import type { PageEvent } from "~/types/page-event"
import {
  initializeFocusMode,
  toggleFocusMode,
  toggleCategory,
  setEnabledCategories,
  getFocusModeState,
  refreshBlockingRules
} from "./focusModeManager"
import {
  loadBlocklist,
  saveBlocklist,
  addBlocklistEntry,
  updateBlocklistEntry,
  deleteBlocklistEntry,
  updateCategoryStates,
  importBlocklist,
  exportBlocklist
} from "./blocklistStore"
import type { BlocklistEntry, BlocklistCategory } from "~/types/focus-mode"
import {
  scheduleReminder,
  cancelReminder,
  snoozeReminder,
  dismissReminder,
  reregisterAllReminders,
  openProjectInTabGroup,
  handleReminderAlarm
} from "./reminderManager"
import { log, warn } from "~/lib/logger"
import { DEFAULT_SETTINGS } from "~/types/settings"
import { saveSessions } from "./sessionStore"
import { importBrowserHistory } from "./historyImporter"

// Track registered session listeners (sidepanel tabs)
const sessionListeners = new Set<number>()

// Utility function to clean URLs (remove chrome-extension prefix)
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

// Graph state
let knowledgeGraph: KnowledgeGraph | null = null
let graphNeedsRebuild = true

// Initialize sessions from IndexedDB on startup
initializeSessions().then(() => {
  console.log("Welcome to Konta! we hope you like it :)")
  log("[Background] Sessions initialized from IndexedDB")
  rebuildGraphIfNeeded()
})

// Initialize learned context associations
loadLearnedAssociations().then(() => {
  log("[Background] Context learning initialized")
})

// Initialize focus mode on startup
initializeFocusMode().then(() => {
  log("[Background] Focus mode initialized")
})

// Initialize reminder alarms on startup
reregisterAllReminders().then(() => {
  log("[Background] Reminder alarms reregistered")
}).catch((error) => {
  console.error("[Background] Failed to reregister reminders:", error)
})

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("project-reminder-")) {
    log("[Background] Alarm triggered:", alarm.name)
    handleReminderAlarm(alarm)
  }
})

// Initialize all listeners
setupPageVisitListener()
setupConsentListener()
setupSidepanelClosedListener()
setupOpenSidepanelListener()

// Track tab switches
chrome.tabs.onActivated.addListener(() => {
  incrementTabSwitch()
  broadcastCoiUpdate()
})

// Track window focus changes (also counts as tab switch)
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    incrementTabSwitch()
    broadcastCoiUpdate()
  }
})

// Listen for GET_SESSIONS requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SESSIONS") {
    const sessions = getSessions()
    sendResponse({ sessions })
    return true
  }

  if (message.type === "LISTEN_FOR_SESSIONS") {
    // Store the sender tab ID to broadcast updates
    const tabId = sender.tab?.id
    if (tabId && !sessionListeners.has(tabId)) {
      sessionListeners.add(tabId)
      log("[Background] Session listener registered for tab", tabId)
    }
    sendResponse({ success: true })
    return true
  }

  if (message.type === "GET_GRAPH") {
    rebuildGraphIfNeeded()
    sendResponse({ graph: knowledgeGraph })
    return true
  }

  if (message.type === "GET_PROJECT_GRAPH") {
    // Build project-based graph (async)
    ;(async () => {
      try {
        const projects = await loadProjects()
        const sessions = getSessions()
        const allPages: PageEvent[] = []
        
        for (const session of sessions) {
          allPages.push(...session.pages)
        }

        const projectGraph = await buildProjectGraph(projects, allPages, 500)
        sendResponse({ graph: projectGraph })
      } catch (error) {
        console.error("[Background] Error building project graph:", error)
        sendResponse({ graph: { nodes: [], links: [] } })
      }
    })()
    return true // Keep message channel open for async response
  }

  if (message.type === "REFRESH_GRAPH") {
    graphNeedsRebuild = true
    rebuildGraphIfNeeded()
    sendResponse({ graph: knowledgeGraph })
    return true
  }

  if (message.type === "IMPORT_HISTORY") {
    ;(async () => {
      try {
        log("[Background] IMPORT_HISTORY requested")
        
        // Check if already imported
        const result = await chrome.storage.local.get(['history-imported'])
        if (result['history-imported']) {
          log("[Background] History already imported, skipping")
          sendResponse({ success: true, alreadyImported: true })
          return
        }
        
        // Import history (no session check - onboarding creates minimal sessions)
        await importBrowserHistory()
        
        // Force graph rebuild after import
        graphNeedsRebuild = true
        rebuildGraphIfNeeded()
        log("[Background] Graph rebuilt after history import")
        
        sendResponse({ success: true })
      } catch (error) {
        console.error("[Background] IMPORT_HISTORY failed:", error)
        sendResponse({ success: false, error: error.message })
      }
    })()
    return true
  }

  if (message.type === "SEARCH_QUERY") {
    const query = message.payload?.query ?? ""
    const sessions = getSessions()
    const start = performance.now()

    executeSearch(query, sessions)
      .then((results) => {
        const elapsed = performance.now() - start
        logSearchResults(query, results, elapsed)
        sendResponse({ results })
      })
      .catch((error) => {
        console.error("SEARCH_QUERY failed:", error)
        sendResponse({ results: [] })
      })

    return true
  }

  if (message.type === "GET_BEHAVIOR_STATE") {
    const state = getBehaviorState()
    sendResponse({ state })
    return true
  }

  if (message.type === "GET_LABELS") {
    loadLabels()
      .then((labels) => {
        sendResponse({ labels })
      })
      .catch((error) => {
        console.error("GET_LABELS failed:", error)
        sendResponse({ labels: [] })
      })
    return true
  }

  if (message.type === "GET_LABEL_SUGGESTION") {
    const { sessionId } = message.payload
    const session = getSessions().find(s => s.id === sessionId)
    
    if (!session || session.labelId) {
      sendResponse({ suggestion: null })
      return true
    }

    // Get all domains from session pages
    const domains = new Set(
      session.pages
        .map(page => {
          try {
            return new URL(page.url).hostname.replace(/^www\./, '')
          } catch {
            return null
          }
        })
        .filter(Boolean)
    )

    // Get predictions for each domain and pick the most confident one
    let bestPrediction: { labelName: string; confidence: number } | null = null
    
    for (const domain of domains) {
      const prediction = predictLabelForSession({ pages: session.pages } as any)
      if (prediction && (!bestPrediction || prediction.confidence > bestPrediction.confidence)) {
        bestPrediction = prediction
      }
    }

    sendResponse({ suggestion: bestPrediction })
    return true
  }

  if (message.type === "UPDATE_SESSION_LABEL") {
    const { sessionId, labelId } = message.payload
    updateSessionLabel(sessionId, labelId)
      .then(async () => {
        // Learn from this labeling behavior if a label was assigned
        if (labelId) {
          const session = getSessions().find(s => s.id === sessionId)
          const label = await getLabelById(labelId)
          if (session && label) {
            await learnFromSession(session, label.name)
          }
        }
        sendResponse({ success: true })
        broadcastSessionUpdate()
      })
      .catch((error) => {
        console.error("UPDATE_SESSION_LABEL failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "ADD_LABEL") {
    const { name, color } = message.payload
    addLabel({ name, color })
      .then((newLabel) => {
        sendResponse({ label: newLabel })
        broadcastLabelUpdate()
      })
      .catch((error) => {
        console.error("ADD_LABEL failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  if (message.type === "DELETE_LABEL") {
    const { labelId } = message.payload
    deleteLabel(labelId)
      .then(() => {
        sendResponse({ success: true })
        broadcastLabelUpdate()
      })
      .catch((error) => {
        console.error("DELETE_LABEL failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "DELETE_PAGE_FROM_SESSION") {
    const { sessionId, pageUrl } = message.payload
    deletePageFromSession(sessionId, pageUrl)
      .then(() => {
        sendResponse({ success: true })
        broadcastSessionUpdate()
      })
      .catch((error) => {
        console.error("DELETE_PAGE_FROM_SESSION failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "DELETE_SESSION") {
    const { sessionId } = message.payload
    deleteSession(sessionId)
      .then(() => {
        sendResponse({ success: true })
        broadcastSessionUpdate()
      })
      .catch((error) => {
        console.error("DELETE_SESSION failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "GET_PROJECTS") {
    loadProjects()
      .then((projects) => {
        sendResponse({ projects })
      })
      .catch((error) => {
        console.error("GET_PROJECTS failed:", error)
        sendResponse({ projects: [] })
      })
    return true
  }

  if (message.type === "DETECT_PROJECTS") {
    try {
      const sessions = getSessions()
      const projects = detectProjects(sessions)
      sendResponse({ projects })
    } catch (error) {
      console.error("DETECT_PROJECTS failed:", error)
      sendResponse({ projects: [] })
    }
    return true
  }

  if (message.type === "CREATE_PROJECT") {
    const { name, description, sessionIds } = message.payload
    const sessions = getSessions()
    const projectSessions = sessions.filter(s => sessionIds.includes(s.id))
    
    addProject({
      name,
      description,
      startDate: Math.min(...projectSessions.map(s => s.startTime)),
      endDate: Math.max(...projectSessions.map(s => s.endTime)),
      sessionIds,
      keywords: [],
      topDomains: [],
      sites: [], // Manual projects start with no sites
      status: 'active',
      autoDetected: false,
      score: 100 // Manual projects get perfect score
    })
      .then((newProject) => {
        sendResponse({ project: newProject })
      })
      .catch((error) => {
        console.error("CREATE_PROJECT failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  if (message.type === "ADD_PROJECT") {
    const { name, description, color, sessionIds = [], sites = [], autoDetected = false } = message.payload
    const now = Date.now()
    
    console.log("[ADD_PROJECT] Received payload:", { name, description, color, sessionIds, sites, autoDetected })
    
    addProject({
      name,
      description,
      color,
      startDate: now,
      endDate: now,
      sessionIds,
      keywords: [],
      topDomains: [],
      sites,
      status: 'active',
      autoDetected,
      score: autoDetected ? 0 : 100
    })
      .then((newProject) => {
        log("[ADD_PROJECT] Created new project:", newProject.name)
        sendResponse({ success: true, project: newProject })
      })
      .catch((error) => {
        console.error("ADD_PROJECT failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "UPDATE_PROJECT") {
    const { projectId, updates } = message.payload
    updateProject(projectId, updates)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("UPDATE_PROJECT failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "DELETE_PROJECT") {
    const { projectId } = message.payload
    deleteProject(projectId)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("DELETE_PROJECT failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "ADD_SITE_TO_PROJECT") {
    const { projectId, siteUrl: rawSiteUrl, siteTitle, addedBy = 'user' } = message.payload
    
    // Clean the URL to remove any chrome-extension prefix
    const siteUrl = cleanUrl(rawSiteUrl)
    
    log("[ADD_SITE_TO_PROJECT]", { projectId, rawSiteUrl, cleanedSiteUrl: siteUrl, siteTitle })
    
    loadProjects()
      .then(async (projects) => {
        const project = projects.find(p => p.id === projectId)
        if (!project) {
          sendResponse({ success: false, error: "Project not found" })
          return
        }
        
        // Check if site already exists IN THIS PROJECT
        // Note: Sites CAN belong to multiple projects, so we only check this project
        if (project.sites.some(s => s.url === siteUrl)) {
          sendResponse({ success: false, error: "Site already in this project", alreadyAdded: true })
          return
        }
        
        // Add new site
        const newSite = {
          url: siteUrl,
          title: siteTitle,
          addedAt: Date.now(),
          addedBy: addedBy as 'auto' | 'user',
          visitCount: 0 // Will be calculated from sessions
        }
        project.sites.push(newSite)
        
        // Save updated projects
        const otherProjects = projects.filter(p => p.id !== projectId)
        await chrome.storage.local.set({ "aegis-projects": [...otherProjects, project] })
        
        log("[ADD_SITE_TO_PROJECT] Site added successfully to project:", project.name)
        log(`  → Site can now belong to multiple projects`)
        sendResponse({ success: true, project })
      })
      .catch((error) => {
        console.error("ADD_SITE_TO_PROJECT failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "DISMISS_PROJECT_SUGGESTION") {
    const { projectId, url } = message.payload
    log("[DISMISS_PROJECT_SUGGESTION]", { projectId, url })
    
    loadProjects()
      .then(async (projects) => {
        const project = projects.find(p => p.id === projectId)
        if (!project) {
          sendResponse({ success: false, error: "Project not found" })
          return
        }
        
        // Initialize dismissedSuggestions if not present
        if (!project.dismissedSuggestions) {
          project.dismissedSuggestions = []
        }
        
        // Add dismissal record
        project.dismissedSuggestions.push({
          url,
          timestamp: Date.now()
        })
        
        // Save updated projects
        const otherProjects = projects.filter(p => p.id !== projectId)
        await chrome.storage.local.set({ "aegis-projects": [...otherProjects, project] })
        
        log("[DISMISS_PROJECT_SUGGESTION] Dismissal recorded, will not suggest again for 24 hours")
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("DISMISS_PROJECT_SUGGESTION failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // Project candidate operations
  if (message.type === "GET_READY_CANDIDATES") {
    getReadyCandidates()
      .then((candidates) => {
        sendResponse({ candidates })
      })
      .catch((error) => {
        console.error("GET_READY_CANDIDATES failed:", error)
        sendResponse({ candidates: [] })
      })
    return true
  }

  if (message.type === "DISMISS_CANDIDATE") {
    const { candidateId } = message.payload
    dismissCandidate(candidateId)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("DISMISS_CANDIDATE failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "SNOOZE_CANDIDATE") {
    const { candidateId } = message.payload
    // Snooze = increase snoozeCount and reset status to 'watching'
    // This requires 2 more visits per snooze to trigger notification again
    loadCandidates()
      .then(async (candidates) => {
        const candidate = candidates.find(c => c.id === candidateId)
        if (candidate) {
          candidate.snoozeCount = (candidate.snoozeCount || 0) + 1
          candidate.status = 'watching'
          candidate.notificationShown = false
          log(`[Snooze] Candidate snoozed. Will need ${2 * candidate.snoozeCount} more visits`)
          await saveCandidates(candidates)
          sendResponse({ success: true })
        } else {
          sendResponse({ success: false, error: "Candidate not found" })
        }
      })
      .catch((error) => {
        console.error("SNOOZE_CANDIDATE failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "PROMOTE_CANDIDATE") {
    const { candidateId } = message.payload
    log("[PROMOTE_CANDIDATE] Processing candidateId:", candidateId)
    
    // Get all candidates (not just ready ones) to find the one to promote
    loadCandidates()
      .then(async (candidates) => {
        log("[PROMOTE_CANDIDATE] Found", candidates.length, "total candidates")
        const candidate = candidates.find(c => c.id === candidateId)
        log("[PROMOTE_CANDIDATE] Target candidate found:", !!candidate)
        if (!candidate) {
          console.error("[PROMOTE_CANDIDATE] Candidate not found:", candidateId)
          sendResponse({ success: false, error: "Candidate not found" })
          return
        }

        const sessions = getSessions()
        const projectSessions = sessions.filter(s => candidate.sessionIds.includes(s.id))
        
        // Create initial site from the most visited specific resource
        const primarySite = candidate.specificResources[0] // The resource that triggered detection
        const initialSites = [{
          url: primarySite,
          title: candidate.keywords.length > 0 
            ? candidate.keywords.slice(0, 3).join(' ')
            : candidate.primaryDomain,
          addedAt: Date.now(),
          addedBy: 'auto' as const,
          visitCount: candidate.visitCount
        }]
        
        // Create project from candidate
        const newProject = await addProject({
          name: candidate.keywords.length > 0 
            ? candidate.keywords.slice(0, 3).join(' ') 
            : candidate.primaryDomain,
          description: `Auto-detected project on ${candidate.primaryDomain}`,
          startDate: candidate.firstSeen,
          endDate: candidate.lastSeen,
          sessionIds: candidate.sessionIds,
          keywords: candidate.keywords,
          topDomains: [candidate.primaryDomain, ...candidate.relatedDomains.slice(1, 3)],
          sites: initialSites,
          status: 'active',
          autoDetected: true,
          score: candidate.score
        })

        // Remove candidate from storage
        await promoteCandidateToProject(candidateId)

        sendResponse({ success: true, project: newProject })
      })
      .catch((error) => {
        console.error("PROMOTE_CANDIDATE failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // Dev testing helpers
  if (message.type === "CREATE_TEST_CANDIDATE") {
    const { domain, keywords, score } = message.payload
    createTestCandidate(domain, keywords, score)
      .then((candidate) => {
        sendResponse({ success: true, candidate })
      })
      .catch((error) => {
        console.error("CREATE_TEST_CANDIDATE failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "CLEAR_ALL_CANDIDATES") {
    clearAllCandidates()
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("CLEAR_ALL_CANDIDATES failed:", error)
        sendResponse({ success: false })
      })
    return true
  }

  if (message.type === "OPEN_SIDEPANEL_TO_PROJECTS") {
    // Open sidepanel and notify it to switch to projects tab
    log("[Background] Opening sidepanel to projects tab")
    
    // Store the preferred tab in chrome storage so sidepanel can read it
    chrome.storage.local.set({ "sidepanel-active-tab": "projects" }, () => {
      log("[Background] Set sidepanel tab preference to 'projects'")
    })
    
    // Get the active tab and open sidepanel for it
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id }, () => {
          if (chrome.runtime.lastError) {
            console.error("[Background] Failed to open sidepanel:", chrome.runtime.lastError)
            sendResponse({ success: false, error: chrome.runtime.lastError.message })
          } else {
            log("[Background] Sidepanel opened successfully")
            sendResponse({ success: true })
          }
        })
      } else {
        console.error("[Background] No active tab found")
        sendResponse({ success: false, error: "No active tab" })
      }
    })
    return true
  }

  if (message.type === "SCROLL_DEPTH_UPDATE") {
    updateScrollDepth(message.payload.bucket)
    broadcastCoiUpdate()
  }

  if (message.type === "SCROLL_BURST_DETECTED") {
    incrementScrollBurst()
    broadcastCoiUpdate()
  }

  // Focus Mode message handlers
  if (message.type === "TOGGLE_FOCUS_MODE") {
    toggleFocusMode()
      .then((state) => {
        sendResponse({ state })
      })
      .catch((error) => {
        console.error("TOGGLE_FOCUS_MODE failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  if (message.type === "GET_FOCUS_STATE") {
    const state = getFocusModeState()
    sendResponse({ state })
    return true
  }

  if (message.type === "TOGGLE_CATEGORY") {
    const { category } = message.payload
    toggleCategory(category as BlocklistCategory)
      .then((state) => {
        sendResponse({ state })
      })
      .catch((error) => {
        console.error("TOGGLE_CATEGORY failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  if (message.type === "SET_ENABLED_CATEGORIES") {
    const { categories } = message.payload
    setEnabledCategories(categories as BlocklistCategory[])
      .then((state) => {
        sendResponse({ state })
      })
      .catch((error) => {
        console.error("SET_ENABLED_CATEGORIES failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  if (message.type === "GET_BLOCKLIST") {
    log("[Background] GET_BLOCKLIST request received")
    loadBlocklist()
      .then((blocklist) => {
        log("[Background] Sending blocklist with", blocklist.entries.length, "entries")
        sendResponse({ blocklist })
      })
      .catch((error) => {
        console.error("GET_BLOCKLIST failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  if (message.type === "ADD_BLOCKLIST_ENTRY") {
    const { entry } = message.payload
    addBlocklistEntry(entry as BlocklistEntry)
      .then(async () => {
        await refreshBlockingRules()
        const blocklist = await loadBlocklist()
        sendResponse({ success: true, blocklist })
      })
      .catch((error) => {
        console.error("ADD_BLOCKLIST_ENTRY failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "UPDATE_BLOCKLIST_ENTRY") {
    const { index, entry } = message.payload
    updateBlocklistEntry(index, entry as BlocklistEntry)
      .then(async () => {
        await refreshBlockingRules()
        const blocklist = await loadBlocklist()
        sendResponse({ success: true, blocklist })
      })
      .catch((error) => {
        console.error("UPDATE_BLOCKLIST_ENTRY failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "DELETE_BLOCKLIST_ENTRY") {
    const { index } = message.payload
    deleteBlocklistEntry(index)
      .then(async () => {
        await refreshBlockingRules()
        const blocklist = await loadBlocklist()
        sendResponse({ success: true, blocklist })
      })
      .catch((error) => {
        console.error("DELETE_BLOCKLIST_ENTRY failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "UPDATE_CATEGORY_STATES") {
    const { categoryStates } = message.payload
    updateCategoryStates(categoryStates)
      .then(async () => {
        await refreshBlockingRules()
        const blocklist = await loadBlocklist()
        sendResponse({ success: true, blocklist })
      })
      .catch((error) => {
        console.error("UPDATE_CATEGORY_STATES failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "IMPORT_BLOCKLIST") {
    const { blocklist, mergeStrategy } = message.payload
    importBlocklist(blocklist, mergeStrategy)
      .then(async () => {
        await refreshBlockingRules()
        const updatedBlocklist = await loadBlocklist()
        sendResponse({ success: true, blocklist: updatedBlocklist })
      })
      .catch((error) => {
        console.error("IMPORT_BLOCKLIST failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "EXPORT_BLOCKLIST") {
    exportBlocklist()
      .then((blocklist) => {
        sendResponse({ blocklist })
      })
      .catch((error) => {
        console.error("EXPORT_BLOCKLIST failed:", error)
        sendResponse({ error: error.message })
      })
    return true
  }

  // Project reminder operations
  if (message.type === "SET_PROJECT_REMINDER") {
    const { projectId, reminder } = message.payload
    log("[SET_PROJECT_REMINDER]", { projectId, reminder })
    
    scheduleReminder(projectId, reminder)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("SET_PROJECT_REMINDER failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "CANCEL_PROJECT_REMINDER") {
    const { projectId } = message.payload
    log("[CANCEL_PROJECT_REMINDER]", { projectId })
    
    cancelReminder(projectId)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("CANCEL_PROJECT_REMINDER failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "SNOOZE_REMINDER") {
    const { projectId } = message.payload
    log("[SNOOZE_REMINDER]", { projectId })
    
    snoozeReminder(projectId)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("SNOOZE_REMINDER failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "DISMISS_REMINDER") {
    const { projectId } = message.payload
    log("[DISMISS_REMINDER]", { projectId })
    
    dismissReminder(projectId)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("DISMISS_REMINDER failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "DISMISS_SNOOZE") {
    const { projectId } = message.payload
    log("[DISMISS_SNOOZE]", { projectId })
    
    loadProjects()
      .then(async (projects) => {
        const project = projects.find(p => p.id === projectId)
        if (!project || !project.reminder) {
          sendResponse({ success: false, error: "Project or reminder not found" })
          return
        }
        
        // Clear snooze state
        project.reminder.snoozeCount = 0
        project.reminder.snoozedUntil = undefined
        
        // Save updated project
        const otherProjects = projects.filter(p => p.id !== projectId)
        await chrome.storage.local.set({ "aegis-projects": [...otherProjects, project] })
        
        // Reschedule alarm immediately
        await scheduleReminder(projectId, project.reminder)
        
        log("[DISMISS_SNOOZE] Snooze dismissed, reminder rescheduled for project:", projectId)
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("DISMISS_SNOOZE failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  if (message.type === "OPEN_PROJECT_IN_TAB_GROUP") {
    const { projectId } = message.payload
    log("[OPEN_PROJECT_IN_TAB_GROUP]", { projectId })
    
    openProjectInTabGroup(projectId)
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error("OPEN_PROJECT_IN_TAB_GROUP failed:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // Settings Handlers
  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get(["aegis-settings"], (result) => {
      sendResponse({ settings: result["aegis-settings"] || null })
    })
    return true
  }

  if (message.type === "UPDATE_SETTINGS") {
    const { settings } = message.payload
    chrome.storage.local.set({ "aegis-settings": settings }, () => {
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === "RESET_ALL_SETTINGS") {
    // Clear all settings and cache
    chrome.storage.local.remove(["aegis-settings"], () => {
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === "CLEAR_ALL_DATA") {
    // Nuclear option: clear everything
    ;(async () => {
      try {
        await chrome.storage.local.clear()
        sendResponse({ success: true })
      } catch (error) {
        console.error("CLEAR_ALL_DATA failed:", error)
        sendResponse({ success: false })
      }
    })()
    return true
  }

  if (message.type === "CLEAR_ALL_PROJECTS") {
    chrome.storage.local.set({ "aegis-projects": [] }, () => {
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === "CLEAR_ALL_SESSIONS") {
    chrome.storage.local.set({ "aegis-sessions": [] }, () => {
      broadcastSessionUpdate()
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === "EXPORT_ALL_DATA") {
    ;(async () => {
      try {
        const sessions = getSessions()
        const labels = await loadLabels()
        const projects = await loadProjects()
        const settings = await new Promise((resolve) => {
          chrome.storage.local.get(["aegis-settings"], (result) => {
            resolve(result["aegis-settings"])
          })
        })
        
        const exportData = {
          version: "1.0",
          exportedAt: new Date().toISOString(),
          data: {
            sessions,
            labels,
            projects,
            settings
          }
        }
        
        sendResponse({ data: exportData })
      } catch (error) {
        console.error("EXPORT_ALL_DATA failed:", error)
        sendResponse({ data: null })
      }
    })()
    return true
  }

  if (message.type === "IMPORT_DATA") {
    const { data } = message.payload
    ;(async () => {
      try {
        // Import sessions, labels, projects, settings
        if (data.data?.sessions) {
          // Sessions are handled by sessionManager
          // We'd need to implement an import function there
        }
        if (data.data?.labels) {
          await chrome.storage.local.set({ "aegis-labels": data.data.labels })
        }
        if (data.data?.projects) {
          await chrome.storage.local.set({ "aegis-projects": data.data.projects })
        }
        if (data.data?.settings) {
          await chrome.storage.local.set({ "aegis-settings": data.data.settings })
        }
        
        sendResponse({ success: true })
      } catch (error) {
        console.error("IMPORT_DATA failed:", error)
        sendResponse({ success: false })
      }
    })()
    return true
  }

  if (message.type === "GET_CANDIDATES_COUNT") {
    loadCandidates()
      .then((candidates) => {
        const active = candidates.filter(c => c.status !== 'dismissed').length
        sendResponse({ count: active })
      })
      .catch((error) => {
        console.error("GET_CANDIDATES_COUNT failed:", error)
        sendResponse({ count: 0 })
      })
    return true
  }
})

// Periodic broadcaster to capture dwell/idle changes
setInterval(() => {
  broadcastCoiUpdate()
}, 5000)

// Track last COI alert timestamp to implement cooldown
let lastCoiAlertTimestamp = 0

async function broadcastCoiUpdate() {
  try {
    const sessions = getSessions()
    const latest = sessions[sessions.length - 1]
    const behavior = getBehaviorState()
    if (!latest) return

    const weights = await loadCoiWeights()
    const sessionCoi = computeSessionCoi(latest, behavior, weights)
    const pageIndex = Math.max(0, latest.pages.length - 1)
    const pageCoi = computePageCoi(latest, pageIndex, behavior, weights)

    const message = {
      type: "COI_UPDATE",
      payload: {
        session: sessionCoi,
        page: pageCoi,
        pageTitle: latest.pages[pageIndex]?.title,
        pageIndex,
      },
    }

    // Broadcast to all registered listeners
    for (const tabId of sessionListeners) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {
        // Tab closed or not responding, remove from listeners
        sessionListeners.delete(tabId)
      })
    }

    // Check if COI notifications are enabled and threshold exceeded
    await checkCoiThresholdAndNotify(sessionCoi.score)
  } catch (err) {
    console.warn("[Background] Failed to broadcast COI update", err)
  }
}

async function checkCoiThresholdAndNotify(sessionCoiScore: number) {
  try {
    // Load settings to check if notifications are enabled
    const result = await chrome.storage.local.get("aegis-settings")
    const settings = result["aegis-settings"]
    
    console.log("[COI Alert] Checking threshold, score:", sessionCoiScore.toFixed(2), "| Notifications enabled:", settings?.developer?.showCoiNotifications)
    
    if (!settings?.developer?.showCoiNotifications) {
      return
    }

    const threshold = settings.developer.coiThreshold ?? 0.7
    const cooldownMinutes = settings.developer.coiNotificationCooldownMinutes ?? 5
    const cooldownMs = cooldownMinutes * 60 * 1000

    // Check if COI exceeds threshold
    if (sessionCoiScore < threshold) {
      return
    }

    // Check cooldown to prevent notification spam
    const now = Date.now()
    const timeSinceLastAlert = now - lastCoiAlertTimestamp
    if (timeSinceLastAlert < cooldownMs) {
      console.log(`[COI Alert] In cooldown, ${Math.round((cooldownMs - timeSinceLastAlert) / 1000)}s remaining`)
      return
    }

    console.log(`[COI Alert] 🚨 Threshold exceeded! Score: ${sessionCoiScore.toFixed(2)}, Threshold: ${threshold}`)
    
    // Update last alert timestamp
    lastCoiAlertTimestamp = now

    // Get active tab to send notification
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    console.log("[COI Alert] Active tabs found:", tabs.length)
    if (tabs.length === 0) return

    const activeTab = tabs[0]
    if (!activeTab.id) {
      console.log("[COI Alert] No active tab ID")
      return
    }

    console.log(`[COI Alert] Sending notification to tab ${activeTab.id} (${activeTab.url})`)
    
    // Send COI_ALERT notification to content script
    chrome.tabs.sendMessage(activeTab.id, {
      type: "COI_ALERT",
      payload: {
        score: sessionCoiScore,
        threshold,
        message: `You've been switching between tasks frequently. Taking a short break might help you refocus.`
      }
    }).then(() => {
      console.log("[COI Alert] ✅ Notification sent successfully!")
    }).catch((err) => {
      // Content script may not be injected yet, that's okay
      console.warn(`[COI Alert] ❌ Could not send alert to tab ${activeTab.id}:`, err.message)
    })
  } catch (err) {
    console.warn("[Background] Failed to check COI threshold", err)
  }
}

export function broadcastSessionUpdate() {
  // Sessions are already persisted to IndexedDB by sessionManager
  // PopulatedState will poll for updates
  log("[Background] Session updated, count:", getSessions().length)
}

export function broadcastLabelUpdate() {
  // Labels are persisted by labelsStore
  // PopulatedState will poll for updates
  log("[Background] Labels updated")
}

function rebuildGraphIfNeeded() {
  if (!graphNeedsRebuild && knowledgeGraph !== null) {
    return
  }

  try {
    const sessions = getSessions()
    const allPages: PageEvent[] = []
    
    for (const session of sessions) {
      allPages.push(...session.pages)
    }

    log("[Background] Rebuilding knowledge graph from pages:", allPages.length)
    
    knowledgeGraph = buildKnowledgeGraph(allPages, {
      similarityThreshold: 0.35,
      maxEdgesPerNode: 8,
      maxNodes: 500
    })
    
    graphNeedsRebuild = false
    
    log("[Background] Graph rebuilt with nodes:", knowledgeGraph.nodes.length, "edges:", knowledgeGraph.edges.length)
  } catch (err) {
    console.error("[Background] Failed to rebuild knowledge graph:", err)
    knowledgeGraph = { nodes: [], edges: [], lastUpdated: Date.now() }
  }
}

// Mark graph for rebuild when new page visits occur
export function markGraphForRebuild() {
  graphNeedsRebuild = true
}

// Test function to manually trigger COI alert
async function testCoiAlert() {
  console.log("[Test] Manually triggering COI alert...")
  
  // Check if COI notifications are enabled
  const result = await chrome.storage.local.get("aegis-settings")
  const settings = result["aegis-settings"]
  
  if (!settings?.developer?.showCoiNotifications) {
    console.log("[Test] ⚠️ COI Notifications are disabled in settings. Enable them first.")
    console.log("[Test] To enable: Open sidepanel → Settings → Enable 'COI Notifications'")
    return
  }
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tabs.length === 0) {
    console.log("[Test] No active tab found")
    return
  }
  
  const activeTab = tabs[0]
  if (!activeTab.id) {
    console.log("[Test] No active tab ID")
    return
  }
  
  console.log(`[Test] Sending test COI alert to tab ${activeTab.id}`)
  
  chrome.tabs.sendMessage(activeTab.id, {
    type: "COI_ALERT",
    payload: {
      score: 0.85,
      threshold: 0.7,
      message: "Test Alert: Your distraction level is high (85%). This is a test notification."
    }
  }).then(() => {
    console.log("[Test] ✅ Test COI alert sent successfully!")
  }).catch((err) => {
    console.error("[Test] ❌ Failed to send test alert:", err)
  })
}

// DEV ONLY: Export test helpers to window for console access
if (typeof globalThis !== 'undefined') {
  import("./testHelpers").then((module) => {
    (globalThis as any).testHelpers = {
      testNewProjectDetection: module.testNewProjectDetection,
      testMultiProjectPerDomain: module.testMultiProjectPerDomain,
      testSmartSuggestions: module.testSmartSuggestions,
      testIdempotentNotifications: module.testIdempotentNotifications,
      testSnooze: module.testSnooze,
      testFullWorkflow: module.testFullWorkflow,
      runAllTests: module.runAllTests,
      interactiveTest: module.interactiveTest,
      // COI test helper
      testCoiAlert,
      // Also expose direct utilities
      createTestCandidate,
      clearAllCandidates,
      loadCandidates,
      loadProjects
    }
    log("%c🧪 Test helpers loaded!", "background: #4CAF50; color: white; padding: 4px 8px; font-weight: bold")
    log("%cQuick start: testHelpers.runAllTests()", "color: #2196F3; font-weight: bold")
    log("%cTest COI alert: testHelpers.testCoiAlert()", "color: #f59e0b; font-weight: bold")
    log("%cInteractive: testHelpers.interactiveTest()", "color: #FF9800; font-weight: bold")
  })
}
