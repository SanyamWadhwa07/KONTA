// Automated test for REAL project detection algorithm
// Tests the actual calculateCandidateScore logic from candidateDetector.ts

import type { ProjectCandidate } from "~/types/project-candidate"

// Match your production thresholds
const THRESHOLDS = {
  MIN_VISITS: 3,
  MIN_SESSIONS: 2,
  MIN_SCORE: 50,
  MAX_AGE_DAYS: 7,
  MIN_DURATION_HOURS: 1,
}

// ============================================================================
// REAL ALGORITHM - Exact copy from candidateDetector.ts
// ============================================================================

/**
 * Calculate confidence score for a candidate (0-100)
 * Uses square root scaling to reward early visits more generously
 */
function calculateCandidateScore(candidate: ProjectCandidate): number {
  // Visit frequency (40 points max)
  // Uses sqrt scaling: 3 visits = 22pts, 5 visits = 28pts, 10 visits = 40pts
  const visitRatio = Math.min(1, candidate.visitCount / 10)
  const visitScore = Math.sqrt(visitRatio) * 40

  // Session consistency (30 points max)
  // Uses sqrt scaling: 2 sessions = 19pts, 3 sessions = 23pts, 5 sessions = 30pts
  const sessionRatio = Math.min(1, candidate.sessionIds.length / 5)
  const sessionScore = Math.sqrt(sessionRatio) * 30

  // Resource specificity (20 points max)
  // Uses sqrt scaling: 1 resource = 11.5pts, 2 resources = 16pts, 3 resources = 20pts
  const resourceRatio = Math.min(1, candidate.specificResources.length / 3)
  const resourceScore = Math.sqrt(resourceRatio) * 20

  // Time span (10 points max)
  // Linear: 1 hour = 0.4pts, 6 hours = 2.5pts, 24 hours = 10pts
  const duration = candidate.lastSeen - candidate.firstSeen
  const hoursDuration = duration / (1000 * 60 * 60)
  const timeScore = Math.min(10, (hoursDuration / 24) * 10)

  const totalScore = visitScore + sessionScore + resourceScore + timeScore
  
  // Store breakdown in candidate
  candidate.scoreBreakdown = {
    visits: Math.round(visitScore),
    sessions: Math.round(sessionScore),
    resources: Math.round(resourceScore),
    timeSpan: Math.round(timeScore),
    total: Math.round(totalScore)
  }
  
  return Math.round(totalScore)
}

// ============================================================================
// Test Data Generation
// ============================================================================

function generateCandidates(count: number): ProjectCandidate[] {
  const candidates: ProjectCandidate[] = []
  const now = Date.now()
  
  for (let i = 0; i < count; i++) {
    // First 35 are "real projects" with strong signals
    const isRealProject = i < 35
    
    // Real projects: 4-12 visits, Noise: 1-4 visits
    const visits = isRealProject 
      ? Math.floor(Math.random() * 9) + 4
      : Math.floor(Math.random() * 4) + 1
    
    // Real projects: 2-6 sessions, Noise: 1-2 sessions
    const sessions = isRealProject
      ? Math.floor(Math.random() * 5) + 2
      : Math.floor(Math.random() * 2) + 1
    
    // Real projects: 2-6 resources, Noise: 1-2 resources
    const resources = isRealProject
      ? Math.floor(Math.random() * 5) + 2
      : Math.floor(Math.random() * 2) + 1
    
    // Real projects: 3-72 hours, Noise: 0-6 hours
    const durationHours = isRealProject
      ? Math.floor(Math.random() * 70) + 3
      : Math.floor(Math.random() * 7)
    
    const firstSeen = now - (durationHours * 60 * 60 * 1000)
    const lastSeen = now - Math.floor(Math.random() * (durationHours * 0.3) * 60 * 60 * 1000)
    
    const candidate: ProjectCandidate = {
      id: `cand-${i}`,
      primaryDomain: `project${i % 10}.com`,
      specificResources: Array.from(
        { length: resources }, 
        (_, j) => `https://project${i % 10}.com/resource-${i}-${j}`
      ),
      sessionIds: Array.from(
        { length: sessions }, 
        (_, j) => `session-${i}-${j}`
      ),
      visitCount: visits,
      firstSeen,
      lastSeen,
      keywords: isRealProject 
        ? [`project`, `task`, `work-${i}`] 
        : [`page-${i}`],
      relatedDomains: isRealProject
        ? [`related-${i % 3}.com`]
        : [],
      score: 0, // Will be calculated
      scoreBreakdown: {
        visits: 0,
        sessions: 0,
        resources: 0,
        timeSpan: 0,
        total: 0
      },
      status: 'watching',
      notificationShown: false,
      notificationHistory: [],
      snoozeCount: 0
    }
    
    // Calculate score using REAL algorithm
    candidate.score = calculateCandidateScore(candidate)
    
    candidates.push(candidate)
  }
  
  return candidates
}

// Ground truth: First 35 are real projects
function assignLabels(candidates: ProjectCandidate[]): Record<string, boolean> {
  const labels: Record<string, boolean> = {}
  candidates.forEach((cand, idx) => {
    labels[cand.id] = idx < 35
  })
  return labels
}

// ============================================================================
// Classification Logic - Matches candidateDetector.ts
// ============================================================================

function classifyCandidates(candidates: ProjectCandidate[]): Record<string, boolean> {
  const predictions: Record<string, boolean> = {}
  const now = Date.now()
  
  candidates.forEach(cand => {
    // Calculate duration
    const durationMs = cand.lastSeen - cand.firstSeen
    const durationHours = durationMs / (1000 * 60 * 60)
    
    // Calculate age
    const ageMs = now - cand.lastSeen
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    
    // Check all thresholds (matching candidateDetector.ts logic)
    const meetsVisitThreshold = cand.visitCount >= THRESHOLDS.MIN_VISITS
    const meetsSessionThreshold = cand.sessionIds.length >= THRESHOLDS.MIN_SESSIONS
    const meetsScoreThreshold = cand.score >= THRESHOLDS.MIN_SCORE
    const meetsDurationThreshold = durationHours >= THRESHOLDS.MIN_DURATION_HOURS
    const isNotExpired = ageDays <= THRESHOLDS.MAX_AGE_DAYS
    
    // Candidate is classified as project if it meets ALL core thresholds
    const isProject = meetsVisitThreshold && 
                     meetsSessionThreshold && 
                     meetsScoreThreshold && 
                     meetsDurationThreshold &&
                     isNotExpired
    
    predictions[cand.id] = isProject
  })
  
  return predictions
}

// ============================================================================
// Metrics & Analysis
// ============================================================================

function calculateMetrics(
  labels: Record<string, boolean>, 
  predictions: Record<string, boolean>
) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  
  Object.keys(labels).forEach(id => {
    if (labels[id] && predictions[id]) tp++
    else if (!labels[id] && predictions[id]) fp++
    else if (labels[id] && !predictions[id]) fn++
    else tn++
  })
  
  const precision = tp / (tp + fp) || 0
  const recall = tp / (tp + fn) || 0
  const f1Score = 2 * (precision * recall) / (precision + recall) || 0
  const accuracy = (tp + tn) / (tp + fp + fn + tn)
  
  return { 
    precision, 
    recall, 
    f1Score,
    accuracy, 
    tp, 
    fp, 
    fn, 
    tn 
  }
}

function analyzeMisclassifications(
  candidates: ProjectCandidate[],
  labels: Record<string, boolean>,
  predictions: Record<string, boolean>
) {
  const falseNegatives: Array<{
    id: string
    visits: number
    sessions: number
    score: number
    scoreBreakdown: any
    durationHours: number
  }> = []
  
  const falsePositives: Array<{
    id: string
    visits: number
    sessions: number
    score: number
    scoreBreakdown: any
    durationHours: number
  }> = []
  
  candidates.forEach(cand => {
    const durationHours = (cand.lastSeen - cand.firstSeen) / (1000 * 60 * 60)
    
    if (labels[cand.id] && !predictions[cand.id]) {
      falseNegatives.push({
        id: cand.id,
        visits: cand.visitCount,
        sessions: cand.sessionIds.length,
        score: cand.score,
        scoreBreakdown: cand.scoreBreakdown,
        durationHours: Math.round(durationHours * 10) / 10
      })
    } else if (!labels[cand.id] && predictions[cand.id]) {
      falsePositives.push({
        id: cand.id,
        visits: cand.visitCount,
        sessions: cand.sessionIds.length,
        score: cand.score,
        scoreBreakdown: cand.scoreBreakdown,
        durationHours: Math.round(durationHours * 10) / 10
      })
    }
  })
  
  return { falseNegatives, falsePositives }
}

// ============================================================================
// Main Test Runner
// ============================================================================

function runTest() {
  console.log("🧪 Testing REAL Project Detection Algorithm")
  console.log("=" .repeat(50))
  console.log("\n📋 Thresholds:")
  console.log(`  MIN_VISITS: ${THRESHOLDS.MIN_VISITS}`)
  console.log(`  MIN_SESSIONS: ${THRESHOLDS.MIN_SESSIONS}`)
  console.log(`  MIN_SCORE: ${THRESHOLDS.MIN_SCORE}`)
  console.log(`  MIN_DURATION: ${THRESHOLDS.MIN_DURATION_HOURS} hours`)
  console.log(`  MAX_AGE: ${THRESHOLDS.MAX_AGE_DAYS} days`)
  console.log("\n")
  
  // Generate test data
  const candidates = generateCandidates(50)
  console.log(`📊 Generated ${candidates.length} candidates (35 real, 15 noise)`)
  
  // Get ground truth and predictions
  const labels = assignLabels(candidates)
  const predictions = classifyCandidates(candidates)
  
  // Calculate metrics
  const metrics = calculateMetrics(labels, predictions)
  const analysis = analyzeMisclassifications(candidates, labels, predictions)
  
  // Display results
  console.log("\n" + "=".repeat(50))
  console.log("📈 PERFORMANCE METRICS")
  console.log("=".repeat(50))
  console.log(`✨ Precision: ${(metrics.precision * 100).toFixed(1)}% (how many detections were correct)`)
  console.log(`🎯 Recall: ${(metrics.recall * 100).toFixed(1)}% (how many real projects found)`)
  console.log(`⚖️  F1 Score: ${(metrics.f1Score * 100).toFixed(1)}% (balanced measure)`)
  console.log(`✅ Accuracy: ${(metrics.accuracy * 100).toFixed(1)}% (overall correctness)`)
  console.log("\n📊 Confusion Matrix:")
  console.log(`  True Positives:  ${metrics.tp} (correct detections)`)
  console.log(`  False Positives: ${metrics.fp} (false alarms)`)
  console.log(`  False Negatives: ${metrics.fn} (missed projects)`)
  console.log(`  True Negatives:  ${metrics.tn} (correct rejections)`)
  
  // Show failure analysis
  if (analysis.falseNegatives.length > 0) {
    console.log("\n" + "=".repeat(50))
    console.log("❌ FALSE NEGATIVES (Missed Real Projects)")
    console.log("=".repeat(50))
    analysis.falseNegatives.forEach(fn => {
      console.log(`\n${fn.id}:`)
      console.log(`  Visits: ${fn.visits} | Sessions: ${fn.sessions} | Score: ${fn.score}`)
      console.log(`  Duration: ${fn.durationHours}h`)
      console.log(`  Score breakdown:`, fn.scoreBreakdown)
      
      // Identify bottleneck
      const bottlenecks = []
      if (fn.visits < THRESHOLDS.MIN_VISITS) bottlenecks.push(`visits (${fn.visits} < ${THRESHOLDS.MIN_VISITS})`)
      if (fn.sessions < THRESHOLDS.MIN_SESSIONS) bottlenecks.push(`sessions (${fn.sessions} < ${THRESHOLDS.MIN_SESSIONS})`)
      if (fn.score < THRESHOLDS.MIN_SCORE) bottlenecks.push(`score (${fn.score} < ${THRESHOLDS.MIN_SCORE})`)
      if (fn.durationHours < THRESHOLDS.MIN_DURATION_HOURS) bottlenecks.push(`duration (${fn.durationHours}h < ${THRESHOLDS.MIN_DURATION_HOURS}h)`)
      
      if (bottlenecks.length > 0) {
        console.log(`  ⚠️  Failed on: ${bottlenecks.join(', ')}`)
      }
    })
  }
  
  if (analysis.falsePositives.length > 0) {
    console.log("\n" + "=".repeat(50))
    console.log("⚠️  FALSE POSITIVES (False Alarms)")
    console.log("=".repeat(50))
    analysis.falsePositives.forEach(fp => {
      console.log(`\n${fp.id}:`)
      console.log(`  Visits: ${fp.visits} | Sessions: ${fp.sessions} | Score: ${fp.score}`)
      console.log(`  Duration: ${fp.durationHours}h`)
      console.log(`  Score breakdown:`, fp.scoreBreakdown)
    })
  }
  
  console.log("\n" + "=".repeat(50))
  
  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    thresholds: THRESHOLDS,
    metrics,
    analysis: {
      falseNegatives: analysis.falseNegatives,
      falsePositives: analysis.falsePositives
    },
    labels,
    predictions
  }
  
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ testResults: results }, () => {
      console.log("✅ Results saved to chrome.storage.local as 'testResults'")
    })
  } else {
    console.log("\n💾 Results ready (run in browser to save to chrome.storage.local)")
  }
  
  return results
}

// Run the test
runTest()