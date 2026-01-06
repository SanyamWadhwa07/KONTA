import type { PageEvent } from "~/types/page-event"
import { processPageEvent } from "./sessionManager"
import { log } from "~/lib/logger"
import { generateEmbedding, initializeModel } from "../background/embedding-engine"

/**
 * Import browser history and convert to sessions
 * Called after onboarding completion for fresh installs
 */
export async function importBrowserHistory(): Promise<void> {
  const IMPORT_DAYS = 7 // Last 7 days
  const startTime = Date.now() - (IMPORT_DAYS * 24 * 60 * 60 * 1000)
  
  log("[HistoryImport] Starting import from last", IMPORT_DAYS, "days")
  
  try {
    // Query history
    const historyItems = await searchHistory(startTime)
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
    
    // Process through sessionization algorithm first (don't block on embeddings)
    log("[HistoryImport] Processing page events through sessionization...")
    for (const pageEvent of pageEvents) {
      await processPageEvent(pageEvent)
    }
    
    // Mark as imported immediately so sidepanel can open
    await chrome.storage.local.set({ 'history-imported': true })
    log("[HistoryImport] Import complete! Starting background embedding generation...")
    
    // Generate embeddings in background (non-blocking)
    generateEmbeddingsInBackground(pageEvents).catch(err => {
      console.error("[HistoryImport] Embedding generation failed:", err)
    })
    
  } catch (error) {
    console.error("[HistoryImport] Failed:", error)
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
      
      // Ensure timestamp doesn't exceed current time (prevent future timestamps)
      // This can happen due to system clock changes, timezone issues, or Chrome's microsecond precision
      const now = Date.now()
      const timestamp = item.lastVisitTime || now
      const safeTimestamp = Math.min(timestamp, now)
      
      pageEvents.push({
        url: item.url,
        title: item.title || url.hostname,
        domain: url.hostname.replace('www.', ''),
        timestamp: safeTimestamp,
        openedAt: safeTimestamp,
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
 * Generate embeddings in background without blocking
 * Updates sessions in IndexedDB as embeddings are generated
 */
async function generateEmbeddingsInBackground(pageEvents: PageEvent[]): Promise<void> {
  log("[HistoryImport] Initializing embedding model...")
  
  // Initialize model first (download if needed)
  const model = await initializeModel()
  if (!model) {
    log("[HistoryImport] Model initialization failed, skipping embeddings")
    return
  }
  
  log("[HistoryImport] Generating embeddings for", pageEvents.length, "pages...")
  
  const { loadSessions, saveSessions } = await import("./sessionStore")
  let embeddingsGenerated = 0
  
  // Generate embeddings in batches to avoid blocking
  for (let i = 0; i < pageEvents.length; i++) {
    const pageEvent = pageEvents[i]
    
    try {
      const embedding = await generateEmbedding(pageEvent.title)
      if (embedding) {
        // Find and update the page in sessions
        const sessions = await loadSessions()
        let updated = false
        
        for (const session of sessions) {
          const page = session.pages.find(p => 
            p.url === pageEvent.url && p.timestamp === pageEvent.timestamp
          )
          if (page && !page.titleEmbedding) {
            page.titleEmbedding = embedding
            updated = true
            embeddingsGenerated++
            break
          }
        }
        
        if (updated) {
          await saveSessions(sessions)
        }
      }
    } catch (error) {
      // Skip failed embeddings, continue with others
    }
    
    // Log progress every 50 pages
    if ((i + 1) % 50 === 0) {
      log(`[HistoryImport] Progress: ${i + 1}/${pageEvents.length} (${embeddingsGenerated} embeddings)`)
    }
  }
  
  log("[HistoryImport] Embedding generation complete:", embeddingsGenerated, "generated")
}
