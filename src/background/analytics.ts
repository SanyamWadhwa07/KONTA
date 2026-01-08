import { getSessions } from "./sessionManager"
import { loadLabels } from "./labelsStore"
import { log } from "~lib/logger"
import type { ProjectCandidate } from "~/types/project-candidate"

interface DetailedAnalytics {
  performance: {
    avgSearchLatency: number
    avgEmbeddingTime: number
    totalSearches: number
    totalEmbeddings: number
  }
  usage: {
    topDomains: Array<{ domain: string; count: number }>
    avgSessionLength: number
    mostUsedLabels: Array<{ label: string; count: number }>
    totalTimeTracked: number
    activeProjects: number
  }
  system: {
    modelLoaded: boolean
    storageUsedMB: number
    totalStorageMB: number
    indexedPagesCount: number
  }
  coi: {
    avgCoiScore: number
    highCoiEvents: number
    breaksSuggested: number
    breaksAccepted: number
  }
  projects: {
    autoDetected: Array<{
      id: string
      name: string
      score: number
      scoreBreakdown?: {
        visits: number
        sessions: number
        resources: number
        timeSpan: number
        total: number
      }
      createdAt: number
      siteCount: number
      sessionCount: number
      topDomain: string
    }>
    suggestionsGenerated: number
    suggestionsAccepted: number
    suggestionsDismissed: number
    suggestionsSnoozed: number
  }
}

// Store performance metrics in memory
const performanceMetrics = {
  searchLatencies: [] as number[],
  embeddingTimes: [] as number[]
}

const coiMetrics = {
  scores: [] as number[],
  highCoiEvents: 0,
  breaksSuggested: 0,
  breaksAccepted: 0
}

const projectMetrics = {
  suggestionsGenerated: 0,
  suggestionsAccepted: 0,
  suggestionsDismissed: 0,
  suggestionsSnoozed: 0
}

export function recordSearchLatency(latencyMs: number) {
  performanceMetrics.searchLatencies.push(latencyMs)
  // Keep only last 1000 measurements
  if (performanceMetrics.searchLatencies.length > 1000) {
    performanceMetrics.searchLatencies.shift()
  }
}

export function recordEmbeddingTime(timeMs: number) {
  performanceMetrics.embeddingTimes.push(timeMs)
  if (performanceMetrics.embeddingTimes.length > 1000) {
    performanceMetrics.embeddingTimes.shift()
  }
}

export function recordCoiScore(score: number) {
  coiMetrics.scores.push(score)
  if (coiMetrics.scores.length > 1000) {
    coiMetrics.scores.shift()
  }
  if (score > 0.7) {
    coiMetrics.highCoiEvents++
  }
}

export function recordBreakSuggestion() {
  coiMetrics.breaksSuggested++
}

export function recordBreakAccepted() {
  coiMetrics.breaksAccepted++
}

export function recordProjectSuggestion() {
  projectMetrics.suggestionsGenerated++
}

export function recordProjectSuggestionAccepted() {
  projectMetrics.suggestionsAccepted++
}

export function recordProjectSuggestionDismissed() {
  projectMetrics.suggestionsDismissed++
}

export function recordProjectSuggestionSnoozed() {
  projectMetrics.suggestionsSnoozed++
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((sum, val) => sum + val, 0) / arr.length
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export async function getDetailedAnalytics(): Promise<DetailedAnalytics> {
  try {
    // Get all sessions and labels
    const sessions = getSessions()
    const labels = await loadLabels()
    const labelMap = new Map(labels.map(l => [l.id, l.name]))
    
    // Calculate domain statistics
    const domainCounts = new Map<string, number>()
    const labelCounts = new Map<string, number>()
    let totalPages = 0
    let totalTimeMinutes = 0
    
    for (const session of sessions) {
      // Count domains
      for (const page of session.pages) {
        const domain = extractDomain(page.url)
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1)
        totalPages++
      }
      
      // Count labels (if session has a labelId)
      if (session.labelId) {
        const labelName = labelMap.get(session.labelId) || session.labelId
        labelCounts.set(labelName, (labelCounts.get(labelName) || 0) + 1)
      }
      
      // Calculate session length
      if (session.endTime) {
        const durationMs = session.endTime - session.startTime
        totalTimeMinutes += durationMs / (1000 * 60)
      }
    }
    
    // Convert to sorted arrays
    const topDomains = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    
    const mostUsedLabels = Array.from(labelCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    
    // Get projects data
    const projectsData = await chrome.storage.local.get("aegis-projects")
    const projects = projectsData["aegis-projects"] || []
    const activeProjects = projects.filter((p: any) => !p.archived).length
    
    log('[Analytics] Total projects:', projects.length, 'Active:', activeProjects)
    log('[Analytics] Auto-detected projects:', projects.filter((p: any) => p.autoDetected).length)
    
    // Calculate average project size
    let totalProjectPages = 0
    for (const project of projects) {
      totalProjectPages += (project.urls || []).length
    }
    const avgProjectSize = projects.length > 0 ? totalProjectPages / projects.length : 0
    
    // Get storage usage estimate (includes chrome.storage.local + IndexedDB approximation)
    const allStorageData = await chrome.storage.local.get(null)
    const storageJSON = JSON.stringify(allStorageData)
    const chromeStorageMB = new Blob([storageJSON]).size / (1024 * 1024)
    
    // Estimate IndexedDB size (sessions data)
    const sessionsDataSize = new Blob([JSON.stringify(sessions)]).size / (1024 * 1024)
    const storageUsedMB = chromeStorageMB + sessionsDataSize
    
    // Check if model is loaded by checking if embedding generation has ever succeeded
    // If embeddingTimes has entries, model was loaded at least once
    const modelLoaded = performanceMetrics.embeddingTimes.length > 0
    
    // Load auto-detected projects with their detection reasoning
    const autoDetectedProjects = projects.filter((p: any) => p.autoDetected)
    const projectAnalytics = autoDetectedProjects.map((p: any) => {
      let topDomain = ''
      try {
        if (p.topDomains && p.topDomains[0]) {
          topDomain = p.topDomains[0]
        } else if (p.sites && p.sites[0] && p.sites[0].url) {
          topDomain = new URL(p.sites[0].url).hostname
        }
      } catch (err) {
        log('[Analytics] Failed to parse domain for project:', p.id, err)
      }
      
      return {
        id: p.id,
        name: p.name,
        score: p.score,
        scoreBreakdown: p.scoreBreakdown,
        createdAt: p.createdAt || p.startDate,
        siteCount: (p.sites || []).length,
        sessionCount: p.sessionIds.length,
        topDomain
      }
    })
    
    return {
      performance: {
        avgSearchLatency: average(performanceMetrics.searchLatencies),
        avgEmbeddingTime: average(performanceMetrics.embeddingTimes),
        totalSearches: performanceMetrics.searchLatencies.length,
        totalEmbeddings: performanceMetrics.embeddingTimes.length
      },
      usage: {
        topDomains,
        avgSessionLength: sessions.length > 0 ? totalTimeMinutes / sessions.length : 0,
        mostUsedLabels,
        totalTimeTracked: totalTimeMinutes,
        activeProjects
      },
      system: {
        modelLoaded,
        storageUsedMB,
        totalStorageMB: 50, // Chrome allows ~10MB local storage + unlimited IndexedDB (show 50MB total estimate)
        indexedPagesCount: totalPages
      },
      coi: {
        avgCoiScore: average(coiMetrics.scores),
        highCoiEvents: coiMetrics.highCoiEvents,
        breaksSuggested: coiMetrics.breaksSuggested,
        breaksAccepted: coiMetrics.breaksAccepted
      },
      projects: {
        autoDetected: projectAnalytics,
        suggestionsGenerated: projectMetrics.suggestionsGenerated,
        suggestionsAccepted: projectMetrics.suggestionsAccepted,
        suggestionsDismissed: projectMetrics.suggestionsDismissed,
        suggestionsSnoozed: projectMetrics.suggestionsSnoozed
      }
    }
  } catch (error) {
    log("[Analytics] Error getting detailed analytics:", error)
    throw error
  }
}
