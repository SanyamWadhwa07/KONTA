import type { PageEvent } from "~/types/page-event"
import type { Session } from "~/types/session"
import { processPageEvent } from "./sessionManager"
import { OnboardingEncoder, type OnboardingProgress } from "./onboardingEncoder"
import { loadSessions, saveSessions } from "./sessionStore"
import { resetSessionInitialization, initializeSessions } from "./sessionManager"
import { log, warn, error} from "~/lib/logger"

/**
 * Import browser history and convert to sessions
 * Called after onboarding completion for fresh installs
 */
export async function importBrowserHistory(): Promise<void> {
  const IMPORT_DAYS = 7 // Last 7 days
  const startTime = Date.now() - (IMPORT_DAYS * 24 * 60 * 60 * 1000)
  
  log("[HistoryImport] 🚀 Starting import from last", IMPORT_DAYS, "days")
  log("[HistoryImport] Starting import from last", IMPORT_DAYS, "days")
  
  // Broadcast initial "loading" state immediately
  broadcastOnboardingProgress({
    isModelLoading: true,
    modelLoadPercent: 0,
    totalPages: 0,
    processedPages: 0,
    embeddingsGenerated: 0,
    isComplete: false,
  })
  log("[HistoryImport] 📢 Broadcasted initial loading state")
  
  try {
    // Query history
    const historyItems = await searchHistory(startTime)
    log("[HistoryImport] 📚 Found", historyItems.length, "history items")
    log("[HistoryImport] Found", historyItems.length, "history items")
    
    if (historyItems.length === 0) {
      log("[HistoryImport] No history to import")
      await chrome.storage.local.set({ 'history-imported': true })
      return
    }
    
    // Convert to PageEvents (newest first, then reverse for chronological processing)
    const pageEvents = await convertToPageEvents(historyItems)
    log("[HistoryImport] Converted to", pageEvents.length, "page events")
    
    // Reverse to process oldest first (chronological order for sessionization)
    pageEvents.reverse()
    
    // Check if this is a re-run (history-imported flag set but embeddings incomplete)
    const storageResult = await chrome.storage.local.get(['history-imported', 'onboarding-embeddings-complete'])
    const historyAlreadyImported = storageResult['history-imported'] === true
    const embeddingsAlreadyComplete = storageResult['onboarding-embeddings-complete'] === true
    
    log("[HistoryImport] 🔍 History already imported:", historyAlreadyImported)
    log("[HistoryImport] 🔍 Embeddings already complete:", embeddingsAlreadyComplete)
    
    if (historyAlreadyImported && !embeddingsAlreadyComplete) {
      log("[HistoryImport] ♻️ History imported but embeddings incomplete, checking sessions...")
      log("[HistoryImport] History imported but embeddings incomplete, checking sessions...")
      
      // Load existing sessions to check for missing embeddings
      const existingSessions = await loadSessions()
      log("[HistoryImport] 🔍 Existing sessions:", existingSessions.length)
      
      // Check if embeddings are missing
      let pagesWithoutEmbeddings = 0
      for (const session of existingSessions) {
        for (const page of session.pages) {
          if (!page.titleEmbedding) {
            pagesWithoutEmbeddings++
          }
        }
      }
      
      log(`[HistoryImport] 📊 Pages without embeddings: ${pagesWithoutEmbeddings}`)
      
      if (pagesWithoutEmbeddings > 0) {
        log(`[HistoryImport] 🔄 Found ${pagesWithoutEmbeddings} pages without embeddings, generating...`)
        log(`[HistoryImport] Found ${pagesWithoutEmbeddings} pages without embeddings, generating...`)
        
        // Extract page events from existing sessions
        const existingPageEvents: PageEvent[] = []
        for (const session of existingSessions) {
          for (const page of session.pages) {
            if (!page.titleEmbedding) {
              existingPageEvents.push({
                url: page.url,
                title: page.title,
                domain: page.domain,
                timestamp: page.timestamp,
                openedAt: page.timestamp,
                visitCount: 1,
                wasForeground: true
              })
            }
          }
        }
        
        await chrome.storage.local.set({ 
          'history-imported': true,
          'onboarding-embeddings-in-progress': true
        })
        log(`[HistoryImport] 🎯 Starting embedding generation for ${existingPageEvents.length} pages`)
        
        // Generate embeddings for existing pages
        generateEmbeddingsInBackground(existingPageEvents).catch(err => {
          error("[HistoryImport] Embedding generation failed:", err)
          chrome.storage.local.set({ 'onboarding-embeddings-in-progress': false })
        })
      } else {
        log("[HistoryImport] All pages already have embeddings")
        await chrome.storage.local.set({ 
          'history-imported': true,
          'onboarding-embeddings-complete': true
        })
      }
      return
    }
    
    // Process through sessionization algorithm first (don't block on embeddings)
    log("[HistoryImport] 🔨 Processing", pageEvents.length, "page events through sessionization...")
    log("[HistoryImport] Processing page events through sessionization...")
    
    // CRITICAL FIX: Don't use live processPageEvent during history import
    // It appends to the LAST session, but we're processing OLD history
    // Build sessions chronologically from scratch instead
    const historicalSessions: Session[] = []
    
    for (const pageEvent of pageEvents) {
      const lastSession = historicalSessions[historicalSessions.length - 1]
      
      if (!lastSession) {
        // First session - mark as imported
        historicalSessions.push({
          id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          startTime: pageEvent.timestamp,
          endTime: pageEvent.timestamp,
          pages: [pageEvent],
          inferredTitle: "",
          isImported: true
        })
      } else {
        // Check if we need a new session (30 min gap)
        const timeSinceLastPage = pageEvent.timestamp - lastSession.endTime
        const shouldCreateNew = timeSinceLastPage > 30 * 60 * 1000 // 30 minutes
        
        if (shouldCreateNew) {
          historicalSessions.push({
            id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            startTime: pageEvent.timestamp,
            endTime: pageEvent.timestamp,
            pages: [pageEvent],
            inferredTitle: "",
            isImported: true
          })
        } else {
          // Add to existing session
          lastSession.pages.push(pageEvent)
          lastSession.endTime = pageEvent.timestamp
        }
      }
    }
    
    log("[HistoryImport] ✅ Created", historicalSessions.length, "historical sessions")
    
    // Save historical sessions to storage
    await saveSessions(historicalSessions)
    log("[HistoryImport] ✅ Sessionization complete")
    
    // Mark as imported immediately so sidepanel can open
    await chrome.storage.local.set({ 
      'history-imported': true,
      'onboarding-embeddings-in-progress': true
    })
    log("[HistoryImport] Import complete! Starting background embedding generation...")
    
    // Generate embeddings in background (non-blocking)
    generateEmbeddingsInBackground(pageEvents).catch(err => {
      error("[HistoryImport] Embedding generation failed:", err)
      // Clear in-progress flag on error
      chrome.storage.local.set({ 'onboarding-embeddings-in-progress': false })
    })
    
  } catch (error) {
    error("[HistoryImport] Failed:", error)
    // Still mark as imported to avoid retry loops
    await chrome.storage.local.set({ 'history-imported': true })
  }
}

/**
 * Search browser history from a given start time
 */
async function searchHistory(startTime: number): Promise<chrome.history.HistoryItem[]> {
  return new Promise((resolve) => {
    chrome.history.search(
      {
        text: '',
        startTime: startTime,
        maxResults: 10000 // Get as many as possible
      },
      (results) => resolve(results || [])
    )
  })
}

/**
 * Convert Chrome HistoryItems to PageEvent format
 * Filters out chrome:// and extension:// URLs
 * Sorts by most recent first
 */
async function convertToPageEvents(
  historyItems: chrome.history.HistoryItem[]
): Promise<PageEvent[]> {
  const pageEvents: PageEvent[] = []
  
  for (const item of historyItems) {
    // Skip chrome:// and extension:// URLs
    if (!item.url || 
        item.url.startsWith('chrome://') || 
        item.url.startsWith('chrome-extension://') ||
        item.url.startsWith('edge://')) {
      continue
    }
    
    try {
      const url = new URL(item.url)
      
      // Use the historical timestamp from Chrome - don't modify it
      // Chrome's history API returns milliseconds since epoch, which is what we need
      const timestamp = item.lastVisitTime || Date.now()
      
      pageEvents.push({
        url: item.url,
        title: item.title || url.hostname,
        domain: url.hostname.replace('www.', ''),
        timestamp: timestamp,
        openedAt: timestamp,
        visitCount: item.visitCount || 1,
        wasForeground: true
      })
    } catch (error) {
      // Skip invalid URLs
      continue
    }
  }
  
  // Sort by timestamp (newest first)
  return pageEvents.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Generate embeddings in background using onboarding encoder
 * Updates sessions in IndexedDB as embeddings are generated
 * Broadcasts progress to UI components
 */
async function generateEmbeddingsInBackground(pageEvents: PageEvent[]): Promise<void> {
  log("[HistoryImport] 🤖 Starting onboarding embedding generation for", pageEvents.length, "pages")
  log("[HistoryImport] Starting onboarding embedding generation...")
  
  // Broadcast initial state
  log("[HistoryImport] 📢 Broadcasting initial embedding state")
  broadcastOnboardingProgress({
    isModelLoading: true,
    modelLoadPercent: 0,
    totalPages: pageEvents.length,
    processedPages: 0,
    embeddingsGenerated: 0,
    isComplete: false,
  })

  // Create onboarding encoder with progress callback
  const encoder = new OnboardingEncoder({
    batchSize: 10,
    batchDelay: 50,
    onProgress: (progress) => {
      broadcastOnboardingProgress(progress)
    },
  })

  try {
    let lastSaveTime = Date.now()
    let pendingUpdates = 0
    
    // Load sessions once at the start
    let sessions = await loadSessions()
    log("[HistoryImport] 📚 Loaded", sessions.length, "sessions for embedding updates")
    
    // Process pages and update sessions
    await encoder.processPagesInBatches(
      pageEvents.map((pe) => ({ url: pe.url, title: pe.title, timestamp: pe.timestamp })),
      async (pageWithEmbedding) => {
        // Find and update the page in sessions (use cached sessions, don't reload)
        let updated = false

        for (const session of sessions) {
          const page = session.pages.find(
            (p) => p.url === pageWithEmbedding.url && p.timestamp === pageWithEmbedding.timestamp
          )
          if (page) {
            if (!page.titleEmbedding) {
              page.titleEmbedding = pageWithEmbedding.embedding
              updated = true
              pendingUpdates++
            }
            break
          }
        }
        

        // Save in batches (every 25 updates or every 5 seconds)
        if (updated && (pendingUpdates >= 25 || Date.now() - lastSaveTime > 5000)) {
          log(`[HistoryImport] 💾 Saving batch: ${pendingUpdates} embeddings`)
          await saveSessions(sessions)
          lastSaveTime = Date.now()
          pendingUpdates = 0
          
          // CRITICAL: Force sessionManager to reload sessions after each batch save
          // This ensures in-memory sessions stay in sync with IndexedDB
          log(`[HistoryImport] 🔄 Forcing sessionManager to reload...`)
          try {
            resetSessionInitialization()
            await initializeSessions()
            log(`[HistoryImport] ✅ SessionManager reloaded successfully`)
          } catch (err) {
            error("[HistoryImport] ❌ Failed to reload sessions:", err)
          }
            // Reload local sessions from IndexedDB to stay in sync with sessionManager
            sessions = await loadSessions()
        }
      }
    )

    // Final save for any remaining updates
    if (pendingUpdates > 0) {
      log(`[HistoryImport] 💾 Final save: ${pendingUpdates} embeddings`)
      await saveSessions(sessions)
    }
    
    // Verify embeddings were saved correctly
    const verifyEmbeddings = sessions.flatMap(s => s.pages).filter(p => p.titleEmbedding && p.titleEmbedding.length > 0)
    log(`[HistoryImport] ✅ Verified: ${verifyEmbeddings.length} pages have embeddings in memory`)
    
    // Double-check by reloading from storage
    const reloadedSessions = await loadSessions()
    const reloadedWithEmbeddings = reloadedSessions.flatMap(s => s.pages).filter(p => p.titleEmbedding && p.titleEmbedding.length > 0)
    log(`[HistoryImport] ✅ After reload from storage: ${reloadedWithEmbeddings.length} pages have embeddings`)

    // Mark embedding generation as complete
    await chrome.storage.local.set({ 
      "onboarding-embeddings-complete": true,
      "onboarding-embeddings-in-progress": false
    })
    
    log("[HistoryImport] ✅ Onboarding embedding generation complete")
    log("[HistoryImport] ✅ Onboarding embedding generation complete")
    
    // Notify background script and sidepanel to refresh graph
    // The background script message handler will call markGraphForRebuild()
    log("[HistoryImport] � Broadcasting completion to refresh graph...")
    chrome.runtime.sendMessage({
      type: "EMBEDDINGS_COMPLETE",
      embeddingsGenerated: pageEvents.length
    }).catch(() => {
      log("[HistoryImport] No listeners (sidepanel may be closed)")
    })
  } catch (error) {
    error("[HistoryImport] Embedding generation failed:", error)
    
    // Broadcast error state
    broadcastOnboardingProgress({
      isModelLoading: false,
      modelLoadPercent: 100,
      totalPages: pageEvents.length,
      processedPages: pageEvents.length,
      embeddingsGenerated: 0,
      isComplete: true,
    })
    
    // Clear in-progress flag on error
    await chrome.storage.local.set({ "onboarding-embeddings-in-progress": false })
  } finally {
    // Always dispose encoder to free memory
    encoder.dispose()
  }
}

/**
 * Broadcast onboarding progress to all listeners
 */
function broadcastOnboardingProgress(progress: OnboardingProgress): void {
  log("[HistoryImport] 📢 Broadcasting progress:", {
    isModelLoading: progress.isModelLoading,
    modelLoadPercent: progress.modelLoadPercent,
    embeddingsGenerated: progress.embeddingsGenerated,
    totalPages: progress.totalPages,
    isComplete: progress.isComplete
  })
  chrome.runtime.sendMessage({
    type: "ONBOARDING_PROGRESS",
    progress,
  }).catch((err) => {
    log("[HistoryImport] ⚠️ No listeners for progress (sidepanel closed):", err?.message || 'no error')
  })
}
