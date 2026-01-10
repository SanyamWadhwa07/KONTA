import { buildKnowledgeGraph } from "~/lib/knowledge-graph"
import type { PageEvent } from "~/types/page-event"

// Generate vector with controlled variation
function generateEmbedding(
  base: number[],
  noise: number = 0.12,
  drift: number = 0.03
): number[] {
  return base.map(v => {
    const gaussian = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
    return Math.max(0, Math.min(1, v + gaussian * noise + (Math.random() - 0.5) * drift))
  })
}

// More distinct clusters with clear separation
const clusters = [
  {
    label: "Machine Learning Research",
    domains: ["arxiv.org", "openreview.net", "paperswithcode.com"],
    baseEmbedding: [0.90, 0.10, 0.05, 0.05, 0.05, 0.15, 0.05, 0.05, 0.80, 0.10],
    pages: [
      { title: "Attention Is All You Need", visits: 5 },
      { title: "BERT Pre-training Deep Bidirectional Transformers", visits: 4 },
      { title: "GPT-4 Technical Report System Card", visits: 6 },
      { title: "Constitutional AI Harmlessness from AI Feedback", visits: 3 },
      { title: "LLaMA Open Foundation Language Models", visits: 4 },
      { title: "Diffusion Models Beat GANs Image Synthesis", visits: 3 },
      { title: "Deep Residual Learning Image Recognition", visits: 5 },
      { title: "RLHF Reinforcement Learning Human Feedback", visits: 4 },
      { title: "Scaling Laws Neural Language Models", visits: 3 },
      { title: "Vision Transformers Image Recognition", visits: 3 }
    ]
  },
  {
    label: "Tech Industry News",
    domains: ["techcrunch.com", "theverge.com", "venturebeat.com", "wired.com"],
    baseEmbedding: [0.35, 0.10, 0.05, 0.75, 0.15, 0.20, 0.10, 0.10, 0.25, 0.05],
    pages: [
      { title: "OpenAI Releases GPT-5 Enhanced Reasoning", visits: 4 },
      { title: "Anthropic Unveils Claude 4 Model Family", visits: 3 },
      { title: "Google Bard Rebrands Gemini Ultra Launch", visits: 3 },
      { title: "Microsoft Copilot Reaches 100M Users", visits: 2 },
      { title: "Perplexity Raises $500M Series B Funding", visits: 2 },
      { title: "Meta Llama 4 Commercial Use Available", visits: 3 },
      { title: "Apple Vision Pro Sales Exceed Expectations", visits: 2 },
      { title: "Tesla Cybertruck Production Ramps Up 2026", visits: 2 },
      { title: "Semiconductor Export Restrictions Impact", visits: 2 }
    ]
  },
  {
    label: "Frontend Development",
    domains: ["css-tricks.com", "smashingmagazine.com", "web.dev"],
    baseEmbedding: [0.05, 0.85, 0.10, 0.10, 0.60, 0.05, 0.70, 0.15, 0.05, 0.05],
    pages: [
      { title: "Modern CSS Layout Flexbox Grid Guide", visits: 3 },
      { title: "React 19 Release New Features Explained", visits: 5 },
      { title: "TypeScript 5.5 Advanced Features Deep Dive", visits: 4 },
      { title: "Web Performance Optimization Guide 2026", visits: 3 },
      { title: "Next.js 15 App Router Best Practices", visits: 6 },
      { title: "Tailwind CSS v4 Alpha Features Preview", visits: 2 },
      { title: "Web Components 2026 Practical Guide", visits: 3 },
      { title: "Vue 3.5 Composition API Patterns", visits: 3 },
      { title: "Responsive Design Container Queries", visits: 2 }
    ]
  },
  {
    label: "Backend & DevOps",
    domains: ["aws.amazon.com", "kubernetes.io", "docker.com"],
    baseEmbedding: [0.05, 0.10, 0.05, 0.10, 0.90, 0.05, 0.20, 0.10, 0.05, 0.05],
    pages: [
      { title: "AWS Lambda Cold Start Optimization", visits: 3 },
      { title: "Kubernetes 1.30 Release Notes", visits: 2 },
      { title: "Serverless Architecture Patterns Guide", visits: 3 },
      { title: "Docker Production Best Practices Security", visits: 4 },
      { title: "Terraform vs CloudFormation Comparison", visits: 2 },
      { title: "Building Microservices with gRPC", visits: 3 },
      { title: "PostgreSQL Query Optimization Tuning", visits: 3 },
      { title: "Redis Caching Distributed Systems", visits: 2 },
      { title: "API Gateway Design Patterns", visits: 2 }
    ]
  },
  {
    label: "Data Science & Analytics",
    domains: ["kaggle.com", "towardsdatascience.com", "analyticsvidhya.com"],
    baseEmbedding: [0.60, 0.10, 0.85, 0.05, 0.15, 0.10, 0.05, 0.70, 0.40, 0.15],
    pages: [
      { title: "Time Series Forecasting Prophet ARIMA", visits: 3 },
      { title: "A/B Testing Statistical Significance", visits: 2 },
      { title: "Feature Engineering Machine Learning", visits: 4 },
      { title: "Pandas 2.0 Performance Improvements", visits: 3 },
      { title: "Exploratory Data Analysis Workflow", visits: 3 },
      { title: "Real-time Data Pipelines Apache Kafka", visits: 2 },
      { title: "SQL Window Functions Advanced Analytics", visits: 3 },
      { title: "Data Visualization Python Matplotlib", visits: 2 },
      { title: "ETL Pipeline Design Data Warehousing", visits: 2 }
    ]
  },
  {
    label: "Productivity & PKM",
    domains: ["notion.so", "obsidian.md", "roamresearch.com"],
    baseEmbedding: [0.05, 0.05, 0.05, 0.80, 0.05, 0.05, 0.05, 0.10, 0.05, 0.75],
    pages: [
      { title: "Second Brain Method Implementation", visits: 5 },
      { title: "Notion vs Airtable Feature Comparison", visits: 3 },
      { title: "Obsidian Plugin Development Tutorial", visits: 2 },
      { title: "GTD Workflow 2026 Getting Things Done", visits: 4 },
      { title: "Digital Note-Taking Systems Review", visits: 3 },
      { title: "Building Knowledge Management System", visits: 4 },
      { title: "Zettelkasten Method Note Linking", visits: 3 },
      { title: "PARA Method Organizing Information", visits: 2 }
    ]
  },
  {
    label: "Career & Compensation",
    domains: ["levels.fyi", "blind.app", "glassdoor.com"],
    baseEmbedding: [0.10, 0.05, 0.05, 0.85, 0.10, 0.05, 0.05, 0.05, 0.05, 0.20],
    pages: [
      { title: "Software Engineer Salary Guide 2026", visits: 4 },
      { title: "Tech Interview Coding Problems Prep", visits: 5 },
      { title: "Negotiating Job Offers Compensation", visits: 3 },
      { title: "Remote Work Compensation Trends", visits: 2 },
      { title: "Staff Engineer Career Path Promotion", visits: 3 },
      { title: "Engineering Manager Transition Guide", visits: 2 },
      { title: "Tech Layoffs 2026 Job Market Analysis", visits: 2 }
    ]
  },
  {
    label: "Cybersecurity",
    domains: ["krebsonsecurity.com", "schneier.com", "securityweek.com"],
    baseEmbedding: [0.05, 0.05, 0.05, 0.15, 0.75, 0.80, 0.10, 0.05, 0.05, 0.05],
    pages: [
      { title: "Zero Trust Architecture Implementation", visits: 2 },
      { title: "OAuth 2.0 Security Best Practices", visits: 3 },
      { title: "Penetration Testing OWASP Top 10", visits: 2 },
      { title: "Encryption Standards AES ChaCha20", visits: 2 },
      { title: "API Security Vulnerabilities Prevention", visits: 3 },
      { title: "Multi-Factor Authentication MFA Setup", visits: 2 },
      { title: "Security Incident Response Playbook", visits: 2 }
    ]
  }
]

// Harder ambiguous cases - truly borderline between clusters
const ambiguousPages = [
  { title: "MLOps Production Machine Learning Infrastructure", 
    embedding: [0.50, 0.15, 0.30, 0.10, 0.65, 0.10, 0.15, 0.35, 0.45, 0.10], 
    domain: "ml-ops.org", visits: 3 },
  { title: "AI Code Generation Tools Developer Productivity",
    embedding: [0.45, 0.50, 0.10, 0.35, 0.30, 0.10, 0.45, 0.15, 0.40, 0.25], 
    domain: "ai-dev-tools.com", visits: 4 },
  { title: "Data Engineering Career Comparison Guide",
    embedding: [0.35, 0.10, 0.55, 0.50, 0.40, 0.05, 0.10, 0.45, 0.25, 0.15], 
    domain: "data-careers.com", visits: 2 },
  { title: "Building Secure Cloud Infrastructure Guide",
    embedding: [0.05, 0.10, 0.05, 0.15, 0.75, 0.60, 0.15, 0.10, 0.05, 0.05], 
    domain: "cloud-security.io", visits: 3 },
  { title: "AI Research Paper Analysis Tools Review",
    embedding: [0.65, 0.15, 0.20, 0.30, 0.15, 0.10, 0.15, 0.25, 0.60, 0.20], 
    domain: "research-tools.ai", visits: 2 }
]

// Realistic noise
const noiseDomains = [
  "reddit.com", "youtube.com", "twitter.com", "netflix.com", 
  "spotify.com", "news.ycombinator.com", "medium.com"
]

const noiseTitles = [
  "Best Movies 2026 Must Watch List", "Workout Routine Beginners Guide", 
  "Homemade Pizza Recipe Italian Style", "Japan Travel Guide 2026 Complete",
  "Personal Finance Tips Saving Money", "Home Gardening Basics Vegetables",
  "Photography Composition Rules Beginner", "Book Review Dune Messiah Analysis",
  "Meditation Stress Relief Techniques", "Guitar Learning Resources Online",
  "Minimalist Home Design Ideas 2026", "Cryptocurrency Market Update Today",
  "Running Marathon Training Schedule", "Cooking Thai Food At Home"
]

function generateSyntheticPages(): Array<PageEvent & { trueCluster: number }> {
  const pages: Array<PageEvent & { trueCluster: number }> = []
  let now = Date.now()
  let id = 0

  // Generate main cluster pages
  clusters.forEach((cluster, cIdx) => {
    cluster.pages.forEach((page, pIdx) => {
      const domain = cluster.domains[Math.floor(Math.random() * cluster.domains.length)]
      pages.push({
        id: id++,
        title: page.title,
        url: `https://${domain}/article/${id}`,
        domain,
        timestamp: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
        visitCount: page.visits,
        titleEmbedding: generateEmbedding(cluster.baseEmbedding),
        trueCluster: cIdx
      } as any)
    })
  })

  // Add ambiguous pages
  ambiguousPages.forEach((page) => {
    pages.push({
      id: id++,
      title: page.title,
      url: `https://${page.domain}/article/${id}`,
      domain: page.domain,
      timestamp: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
      visitCount: page.visits,
      titleEmbedding: generateEmbedding(page.embedding, 0.08),
      trueCluster: -1
    } as any)
  })

  // Add noise pages
  noiseTitles.forEach((title, idx) => {
    const domain = noiseDomains[Math.floor(Math.random() * noiseDomains.length)]
    pages.push({
      id: id++,
      title,
      url: `https://${domain}/page/${id}`,
      domain,
      timestamp: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
      visitCount: 1 + Math.floor(Math.random() * 2),
      titleEmbedding: Array(10).fill(0).map(() => Math.random() * 0.3),
      trueCluster: -1
    } as any)
  })

  return pages
}

function evaluateClustering(predicted: number[], groundTruth: number[]) {
  const validIdx = groundTruth.map((c, i) => (c >= 0 ? i : -1)).filter(i => i >= 0)
  const pred = validIdx.map(i => predicted[i])
  const truth = validIdx.map(i => groundTruth[i])

  const n = pred.length
  if (n === 0) return { accuracy: 0, precision: 0, recall: 0, f1: 0, n, tp: 0, fp: 0, fn: 0, tn: 0, purity: 0, nmi: 0 }

  const labelSet = Array.from(new Set(truth))
  const clusterSet = Array.from(new Set(pred))
  const table: Record<string, number> = {}
  
  labelSet.forEach(l => clusterSet.forEach(c => { table[`${l},${c}`] = 0 }))
  for (let i = 0; i < n; ++i) table[`${truth[i]},${pred[i]}`]++

  // Best assignment: each cluster to most common true label
  const clusterToLabel: Record<number, number> = {}
  clusterSet.forEach(c => {
    let max = 0, best = -1
    labelSet.forEach(l => {
      if (table[`${l},${c}`] > max) {
        max = table[`${l},${c}`]
        best = l
      }
    })
    clusterToLabel[c] = best
  })

  // Pairwise metrics
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (let i = 0; i < n; ++i) {
    for (let j = i + 1; j < n; ++j) {
      const sameTrue = truth[i] === truth[j]
      const samePred = clusterToLabel[pred[i]] === clusterToLabel[pred[j]]
      if (sameTrue && samePred) tp++
      else if (!sameTrue && samePred) fp++
      else if (sameTrue && !samePred) fn++
      else tn++
    }
  }
  
  const precision = tp / (tp + fp) || 0
  const recall = tp / (tp + fn) || 0
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  const accuracy = (tp + tn) / (tp + fp + fn + tn) || 0
  
  // Purity: fraction of dominant true label in each predicted cluster
  let puritySum = 0
  clusterSet.forEach(c => {
    const clusterPoints = pred.map((p, i) => p === c ? i : -1).filter(i => i >= 0)
    const trueLabelCounts: Record<number, number> = {}
    clusterPoints.forEach(i => {
      trueLabelCounts[truth[i]] = (trueLabelCounts[truth[i]] || 0) + 1
    })
    const maxCount = Math.max(...Object.values(trueLabelCounts))
    puritySum += maxCount
  })
  const purity = puritySum / n
  
  return { accuracy, precision, recall, f1, n, tp, fp, fn, tn, purity }
}

function printDetailedAnalysis(pages: Array<PageEvent & { trueCluster: number }>, graph: any) {
  const titleToTrue = Object.fromEntries(pages.map(p => [p.title, p.trueCluster]))
  
  console.log("\n=== Detailed Cluster Analysis ===")
  const clusterGroups: Record<number, Array<{ title: string, trueCluster: number, domain: string }>> = {}
  
  graph.nodes.forEach((n: any) => {
    if (!clusterGroups[n.cluster]) clusterGroups[n.cluster] = []
    clusterGroups[n.cluster].push({ 
      title: n.title, 
      trueCluster: titleToTrue[n.title] ?? -1,
      domain: n.domain
    })
  })
  
  Object.entries(clusterGroups).sort((a, b) => b[1].length - a[1].length).forEach(([cId, nodes]) => {
    const trueCounts: Record<number, number> = {}
    nodes.forEach(n => {
      trueCounts[n.trueCluster] = (trueCounts[n.trueCluster] || 0) + 1
    })
    
    // Calculate purity for this cluster
    const maxTrueCount = Math.max(...Object.values(trueCounts))
    const clusterPurity = (maxTrueCount / nodes.length * 100).toFixed(1)
    
    // Find dominant true cluster
    const dominantTrue = Object.entries(trueCounts)
      .sort((a, b) => b[1] - a[1])[0]
    const dominantLabel = dominantTrue && dominantTrue[0] !== '-1' 
      ? clusters[parseInt(dominantTrue[0])].label 
      : 'Mixed/Noise'
    
    console.log(`\nPredicted Cluster ${cId}: ${nodes.length} nodes (${clusterPurity}% purity)`)
    console.log(`  Dominant: ${dominantLabel}`)
    console.log(`  Distribution: ${JSON.stringify(trueCounts)}`)
    console.log(`  Domains: ${[...new Set(nodes.map(n => n.domain))].slice(0, 3).join(', ')}`)
    console.log(`  Samples:`)
    nodes.slice(0, 4).forEach(n => {
      const trueLabel = n.trueCluster >= 0 ? clusters[n.trueCluster].label : 'Ambiguous/Noise'
      console.log(`    - [${trueLabel}] ${n.title.slice(0, 60)}`)
    })
  })
}

function analyzeEdgeQuality(graph: any, pages: Array<PageEvent & { trueCluster: number }>) {
  const titleToTrue = Object.fromEntries(pages.map(p => [p.title, p.trueCluster]))
  
  let sameClusterEdges = 0
  let crossClusterEdges = 0
  let noiseEdges = 0
  
  graph.edges.forEach((e: any) => {
    const sourceTrue = titleToTrue[e.source]
    const targetTrue = titleToTrue[e.target]
    
    if (sourceTrue < 0 || targetTrue < 0) {
      noiseEdges++
    } else if (sourceTrue === targetTrue) {
      sameClusterEdges++
    } else {
      crossClusterEdges++
    }
  })
  
  const total = sameClusterEdges + crossClusterEdges + noiseEdges
  console.log("\n=== Edge Quality Analysis ===")
  console.log(`Same-cluster edges: ${sameClusterEdges} (${(sameClusterEdges/total*100).toFixed(1)}%)`)
  console.log(`Cross-cluster edges: ${crossClusterEdges} (${(crossClusterEdges/total*100).toFixed(1)}%)`)
  console.log(`Noise edges: ${noiseEdges} (${(noiseEdges/total*100).toFixed(1)}%)`)
  console.log(`\n⚠️  High cross-cluster edges = too many weak connections`)
  console.log(`💡 Goal: >80% same-cluster, <15% cross-cluster`)
}

function suggestParameterTuning(metrics: any) {
  console.log("\n=== 🔧 Parameter Tuning Suggestions ===\n")
  
  if (metrics.precision < 0.70) {
    console.log("❌ LOW PRECISION (over-clustering - merging different topics)")
    console.log("   Solutions:")
    console.log("   1. INCREASE similarityThreshold: 0.55 → 0.65 or 0.70")
    console.log("   2. DECREASE maxEdgesPerNode: 8 → 5 or 6")
    console.log("   3. REDUCE domainAffinity boost: 1.3 → 1.1")
    console.log("   4. DECREASE temporal weight: 0.1 → 0.05")
    console.log("   5. Add resolution parameter to Louvain (favor more clusters)\n")
  }
  
  if (metrics.recall < 0.70) {
    console.log("❌ LOW RECALL (under-clustering - splitting same topics)")
    console.log("   Solutions:")
    console.log("   1. DECREASE similarityThreshold: 0.55 → 0.45")
    console.log("   2. INCREASE maxEdgesPerNode: 8 → 10")
    console.log("   3. INCREASE domainAffinity boost: 1.3 → 1.5")
    console.log("   4. INCREASE temporal weight: 0.1 → 0.15\n")
  }
  
  if (metrics.precision >= 0.70 && metrics.recall >= 0.70) {
    console.log("✅ GOOD BALANCE - Minor fine-tuning:")
    console.log(`   Current F1: ${(metrics.f1 * 100).toFixed(1)}%`)
    console.log("   Try small adjustments: ±0.02 to threshold")
    console.log("   Or adjust edge weights: embedding vs keyword vs temporal\n")
  }
  
  console.log("📊 Current suspected parameters:")
  console.log("   similarityThreshold: 0.55")
  console.log("   maxEdgesPerNode: 8")
  console.log("   domainAffinity: 1.3")
  console.log("   weights: [embedding: 0.7, keyword: 0.2, temporal: 0.1]")
}

async function main() {
  const pages = generateSyntheticPages()
  const graph = buildKnowledgeGraph(pages as any)
  
  const titleToTrue = Object.fromEntries(pages.map(p => [p.title, p.trueCluster]))
  const predicted = graph.nodes.map(n => n.cluster)
  const groundTruth = graph.nodes.map(n => titleToTrue[n.title] ?? -1)
  const metrics = evaluateClustering(predicted, groundTruth)
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("    KNOWLEDGE GRAPH EVALUATION REPORT    ")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
  
  console.log("=== Dataset Statistics ===")
  console.log(`Total pages: ${pages.length}`)
  console.log(`True clusters: ${clusters.length}`)
  console.log(`Ambiguous pages: ${ambiguousPages.length}`)
  console.log(`Noise pages: ${noiseTitles.length}`)
  
  console.log("\n=== Graph Statistics ===")
  console.log(`Nodes: ${graph.nodes.length}`)
  console.log(`Edges: ${graph.edges.length}`)
  console.log(`Predicted clusters: ${new Set(predicted).size}`)
  console.log(`Expected clusters: ${clusters.length}`)
  console.log(`Avg edges per node: ${(graph.edges.length * 2 / graph.nodes.length).toFixed(1)}`)
  
  console.log("\n=== Clustering Quality Metrics ===")
  console.log(`Accuracy:  ${(metrics.accuracy * 100).toFixed(2)}%`)
  console.log(`Precision: ${(metrics.precision * 100).toFixed(2)}% ${'█'.repeat(Math.floor(metrics.precision * 20))}`)
  console.log(`Recall:    ${(metrics.recall * 100).toFixed(2)}% ${'█'.repeat(Math.floor(metrics.recall * 20))}`)
  console.log(`F1 Score:  ${(metrics.f1 * 100).toFixed(2)}% ${'█'.repeat(Math.floor(metrics.f1 * 20))}`)
  console.log(`Purity:    ${(metrics.purity * 100).toFixed(2)}%`)
  console.log(`\nConfusion Matrix: TP=${metrics.tp}, FP=${metrics.fp}, FN=${metrics.fn}, TN=${metrics.tn}`)
  
  analyzeEdgeQuality(graph, pages)
  printDetailedAnalysis(pages, graph)
  suggestParameterTuning(metrics)
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

if (require.main === module) {
  main()
}