import type { PageEvent } from "~/types/page-event"
import type { Session } from "~/types/session"
import { searchByKeywords } from "~/lib/layer1-keyword-search"
import { searchSemantic } from "~/lib/layer2-semantic-search"
import { searchWithML } from "./layer3-ml-ranker"
import { log, warn, error} from "~/lib/logger"
import { recordSearchLatency } from "./analytics"

export type SearchLayer = "ML" | "Semantic" | "Keyword"

export type SearchResult = {
  pageEvent: PageEvent
  score: number
  layer: SearchLayer
}

function flattenPages(sessions: Session[]): PageEvent[] {
  // Return the most recent unique page per URL to avoid duplicate results
  const byUrl = new Map<string, PageEvent>()
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i]
    for (let j = s.pages.length - 1; j >= 0; j--) {
      const p = s.pages[j]
      if (!byUrl.has(p.url)) {
        byUrl.set(p.url, p)
      }
    }
  }
  return Array.from(byUrl.values())
}

export async function executeSearch(query: string, sessions: Session[]): Promise<SearchResult[]> {
  const startTime = performance.now()
  const pages = flattenPages(sessions)
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  let results: SearchResult[] = []

  // Layer 3: ML
  try {
    const mlResults = await searchWithML(trimmedQuery, pages)
    if (mlResults && mlResults.length > 0) {
      results = mlResults.map((r) => ({ ...r, layer: "ML" as const }))
      recordSearchLatency(performance.now() - startTime)
      return results
    }
  } catch (error) {
    error("ML search failed:", error)
  }

  // Layer 2: Semantic
  try {
    const semanticResults = searchSemantic(trimmedQuery, pages)
    if (semanticResults.length > 0) {
      results = semanticResults.map((r) => ({ ...r, layer: "Semantic" as const }))
      recordSearchLatency(performance.now() - startTime)
      return results
    }
  } catch (error) {
    error("Semantic search failed:", error)
  }

  // Layer 1: Keyword
  const keywordResults = searchByKeywords(trimmedQuery, pages)
  results = keywordResults.map((r) => ({ ...r, layer: "Keyword" as const }))
  recordSearchLatency(performance.now() - startTime)
  return results
}
