import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import ForceGraph2D from "react-force-graph-2d"
import { forceCollide } from "d3-force"
import { Search, X, ChevronDown, RotateCw, Sliders, ZoomIn, ZoomOut, Link, Info } from "lucide-react"
import type { KnowledgeGraph, GraphNode } from "~/lib/knowledge-graph"
import { getClusterColor, generateClusterLabel, generateProjectClusterLabel } from "~/lib/knowledge-graph"
import "~/style.css"
import { log, warn } from "~/lib/logger"

function sendMessage<T>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(err)
      } else {
        resolve(response as T)
      }
    })
  })
}

export default function GraphFullPage() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [minSimilarity, setMinSimilarity] = useState(0.50)
  const [selectedClusters, setSelectedClusters] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week">("all")
  const [showFilters, setShowFilters] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [manualLinkMode, setManualLinkMode] = useState(false)
  const [selectedNodesForLink, setSelectedNodesForLink] = useState<string[]>([])
  const [manualLinks, setManualLinks] = useState<Array<{source: string, target: string}>>([] )
  const [showExplanations, setShowExplanations] = useState(false)
  const [graphMode, setGraphMode] = useState<'semantic' | 'projects'>('semantic')
  const [hoveredNode, setHoveredNode] = useState<any>(null)
  const [hoveredNodePos, setHoveredNodePos] = useState<{x: number, y: number}>({x: 0, y: 0})
  const graphRef = useRef<any>()
  const containerRef = useRef<HTMLDivElement>(null)
  const hasUserInteractedRef = useRef(false)
  const lastGraphTimestampRef = useRef<number>(0)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 })
  const faviconCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const [focusedClusterId, setFocusedClusterId] = useState<number | null>(null)
  const [showAllClusters, setShowAllClusters] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'))
  const [refreshCount, setRefreshCount] = useState(0)
  const refreshCountRef = useRef(0)
  
  // Track clickable label areas for project mode
  const clickableLabelAreasRef = useRef<Array<{
    clusterId: number,
    projectId: string,
    projectName: string,
    bounds: { x: number, y: number, width: number, height: number }
  }>>([])
  const [hoveredLabel, setHoveredLabel] = useState<{ clusterId: number, projectName: string, x: number, y: number } | null>(null)

  // Load dark mode setting on mount
  useEffect(() => {
    chrome.storage.local.get(['aegis-settings'], (result) => {
      if (result['aegis-settings']?.ui?.darkMode) {
        document.documentElement.classList.add('dark')
        setIsDarkMode(true)
      } else {
        document.documentElement.classList.remove('dark')
        setIsDarkMode(false)
      }
    })
  }, [])

  // Monitor dark mode changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'))
        }
      })
    })
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    // Listen for storage changes (for dark mode updates)
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes['aegis-settings']) {
        const newSettings = changes['aegis-settings'].newValue
        if (newSettings?.ui?.darkMode) {
          document.documentElement.classList.add('dark')
          setIsDarkMode(true)
        } else {
          document.documentElement.classList.remove('dark')
          setIsDarkMode(false)
        }
      }
    }

    chrome.storage.onChanged.addListener(storageListener)
    
    return () => {
      observer.disconnect()
      chrome.storage.onChanged.removeListener(storageListener)
    }
  }, [])

  // Check URL parameters for focused cluster
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const clusterParam = urlParams.get('cluster')
    if (clusterParam) {
      const clusterId = parseInt(clusterParam, 10)
      if (!isNaN(clusterId)) {
        setFocusedClusterId(clusterId)
        setSelectedClusters(new Set([clusterId]))
        setShowFilters(true) // Show filters so user can see the cluster is selected
      }
    }
  }, [])

  // Load manual links from storage
  useEffect(() => {
    chrome.storage.local.get(['manualLinks'], (result) => {
      if (result.manualLinks) {
        setManualLinks(result.manualLinks)
      }
    })
  }, [])

  const saveManualLinks = (links: Array<{source: string, target: string}>) => {
    chrome.storage.local.set({ manualLinks: links })
    setManualLinks(links)
  }

  const loadGraph = useCallback(async () => {
    setLoading(true)
    try {
      // Execute refresh 5 times before showing the graph
      // for (let i = 0; i < 5; i++) {
      //   const messageType = graphMode === 'projects' ? 'GET_PROJECT_GRAPH' : 'GET_GRAPH'
      //   const response = await sendMessage<{ graph: KnowledgeGraph }>({ type: messageType })
      //   if (response?.graph) {
      //     log(`[GraphFullPage] Refresh ${i + 1}/5 - Graph data received`)
      //     setGraph(response.graph)
      //     lastGraphTimestampRef.current = response.graph.lastUpdated
      //     hasUserInteractedRef.current = false
      //     refreshCountRef.current = i + 1
      //     setRefreshCount(i + 1)
      //   }
        
      // // Add delay between refreshes (except after the last one)
      //   if (i < 4) {
      //     await new Promise(resolve => setTimeout(resolve, 300))
      //   }

      const messageType = graphMode === 'projects' ? 'GET_PROJECT_GRAPH' : 'GET_GRAPH'
      const response = await sendMessage<{ graph: KnowledgeGraph }>({ type: messageType })
      if (response?.graph) {
        setGraph(response.graph)
        lastGraphTimestampRef.current = response.graph.lastUpdated
        hasUserInteractedRef.current = false
    }
    } catch (err) {
      console.error("[GraphFullPage] Failed to load graph:", err)
    } finally {
      setLoading(false)
    }
  }, [graphMode])

  const handleRefresh = async () => {
    try {
      const messageType = graphMode === 'projects' ? 'GET_PROJECT_GRAPH' : 'REFRESH_GRAPH'
      const response = await sendMessage<{ graph: KnowledgeGraph }>({ type: messageType })
      if (response?.graph) {
        setGraph(response.graph)
        lastGraphTimestampRef.current = response.graph.lastUpdated
        
        if (graphRef.current) {
          setTimeout(() => {
            graphRef.current?.zoomToFit(400, 150)
          }, 800)
        }
      }
    } catch (err) {
      console.error("[GraphFullPage] Failed to refresh graph:", err)
    }
  }

  useEffect(() => {
    loadGraph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload graph when mode changes
  useEffect(() => {
    if (graph) {
      loadGraph()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode])

  // Preload favicons when graph updates
  useEffect(() => {
    if (!graph) return
    
    const clusters = new Set(graph.nodes.map(n => n.cluster))
    clusters.forEach(clusterId => {
      const topDomain = getClusterTopDomain(graph.nodes, clusterId)
      if (topDomain && !faviconCache.current.has(topDomain)) {
        loadFavicon(topDomain).catch(err => 
          log('[Graph] Failed to load favicon for', topDomain)
        )
      }
    })
  }, [graph])

  useEffect(() => {
    if (graph) {
      // Configure forces for a more compact layout
      if (graphRef.current) {
        // Use collision force for strict spacing without long-range repulsion
        // This keeps nodes apart (min distance) but allows clusters to be close
        graphRef.current.d3Force('collide', forceCollide((node: any) => {
          const baseSize = 6
          const sizeFactor = Math.log((node.visitCount || 0) + 1) * 4
          const size = Math.max(baseSize, Math.min(baseSize + sizeFactor, 24))
          return size * 1.5 + 4 // Radius + padding
        }).strength(0.7))

        // Reduce charge (repulsion) significantly so clusters can merge
        // Only keep enough to prevent total collapse
        graphRef.current.d3Force('charge').strength(-60).distanceMax(200)
        
        // Adjust link distance
        graphRef.current.d3Force('link').distance(55)
        
        // Stronger centering to pull clusters together
        graphRef.current.d3Force('center').strength(0.6)

        // Add "breathing" force for idle animation
        const breathingForce = () => {
          let nodes: any[] = []
          
          const force = () => {
            nodes.forEach((node: any) => {
              // Add random velocity for organic movement
              // Increased magnitude to make it visible
              if (node.vx !== undefined && node.vy !== undefined) {
                node.vx += (Math.random() - 0.5) * 0.3
                node.vy += (Math.random() - 0.5) * 0.3
              }
            })
          }
          
          (force as any).initialize = (_nodes: any[]) => {
            nodes = _nodes
          }
          
          return force
        }

        graphRef.current.d3Force('alive', breathingForce())
        
        // Restart simulation to ensure new forces take effect
        graphRef.current.d3ReheatSimulation()
      }

      // Auto-zoom to focused cluster if specified
      if (graphRef.current && !hasUserInteractedRef.current && focusedClusterId !== null) {
        setTimeout(() => {
          // Get nodes in the focused cluster
          const clusterNodes = graphData.nodes.filter(n => n.cluster === focusedClusterId)
          if (clusterNodes.length > 0) {
            // Calculate bounding box of cluster nodes
            const nodePositions = clusterNodes.map(n => {
              const graphNode = graphRef.current.graphData().nodes.find((gn: any) => gn.id === n.id)
              return graphNode ? { x: graphNode.x, y: graphNode.y } : null
            }).filter(pos => pos !== null)

            if (nodePositions.length > 0) {
              const xs = nodePositions.map(p => p!.x)
              const ys = nodePositions.map(p => p!.y)
              const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
              const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
              
              // Center on the cluster
              graphRef.current.centerAt(centerX, centerY, 1000)
              // Zoom to a reasonable level
              graphRef.current.zoom(2, 1000)
            }
          }
        }, 1000) // Wait for simulation to settle
      } else if (graphRef.current && !hasUserInteractedRef.current) {
        setTimeout(() => {
          // Zoom to fit with consistent padding to show all clusters
          graphRef.current?.zoomToFit(400, 150)
        }, 800)
      }
    }
  }, [graph])

  // Track container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Compute graph data before early returns to avoid hook order issues
  const clusters = graph ? Array.from(new Set(graph.nodes.map(n => n.cluster))) : []
  const allClustersSelected = selectedClusters.size === 0

  const { graphData, filteredNodes } = useMemo(() => {
    if (!graph) {
      return { graphData: { nodes: [], links: [] }, filteredNodes: [] }
    }

    let timeFilteredNodes = graph.nodes
    if (timeFilter !== "all") {
      const now = Date.now()
      const cutoff = timeFilter === "today" 
        ? now - 24 * 60 * 60 * 1000 
        : now - 7 * 24 * 60 * 60 * 1000
      
      timeFilteredNodes = graph.nodes.filter(n => {
        return (graph.lastUpdated - (n.visitCount * 1000)) >= cutoff
      })
    }

    const searchFilteredNodes = searchQuery.trim()
      ? timeFilteredNodes.filter(n => 
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.domain.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : timeFilteredNodes

    const filteredNodes = searchFilteredNodes.filter(n => {
      if (allClustersSelected) return true
      return selectedClusters.has(n.cluster)
    })

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id))

    // Use weight (composite) instead of similarity (embedding-only) for multi-factor filtering
    const filteredEdges = graph.edges.filter(e => 
      (e.weight || e.similarity) >= minSimilarity &&
      filteredNodeIds.has(e.source) &&
      filteredNodeIds.has(e.target)
    )

    const nodesByCluster = new Map<number, typeof filteredNodes>()
    filteredNodes.forEach(n => {
      if (!nodesByCluster.has(n.cluster)) {
        nodesByCluster.set(n.cluster, [])
      }
      nodesByCluster.get(n.cluster)!.push(n)
    })

    return {
      filteredNodes,
      graphData: {
        nodes: filteredNodes.map(n => {
          
          const displayLabel = n.title.length > 15 
          ? n.title.substring(0, 15) + '...' 
          : n.title
          
          return {
            id: n.id,
            name: n.title,
            url: n.url,
            domain: n.domain,
            cluster: n.cluster,
            visitCount: n.visitCount,
            searchQuery: n.searchQuery,
            projectName: n.projectName,
            description: n.description,
            keywords: n.keywords,
            projectId: n.projectId,
            color: getClusterColor(n.cluster),
            label: displayLabel
          }
        }),
        links: [
          ...filteredEdges.map(e => ({
            source: e.source,
            target: e.target,
            value: e.similarity,
            isManual: false
          })),
          ...manualLinks
            .filter(link => 
              filteredNodeIds.has(link.source) && 
              filteredNodeIds.has(link.target)
            )
            .map(link => ({
              source: link.source,
              target: link.target,
              value: 1,
              isManual: true
            }))
        ]
      }
    }
  }, [graph, searchQuery, timeFilter, selectedClusters, minSimilarity, manualLinks, graphMode, allClustersSelected])

  if (loading && !graph) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-white dark:bg-[#1C1C1E]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#0072de] dark:border-[#3e91ff] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>Loading knowledge graph...</p>
          <div className="mt-6 flex items-center justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-all ${
                  i < refreshCount ? 'bg-[#0072de] dark:bg-[#3e91ff]' : 'bg-gray-300 dark:bg-[#3A3A3C]'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-[#9A9FA6] mt-3" style={{ fontFamily: "'Breeze Sans'" }}>
            Refresh {refreshCount}/5
          </p>
        </div>
      </div>
    )
  }

  if ((!graph && graphMode == "projects") || (graphMode == "projects" && graph.nodes.length === 0)) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-white dark:bg-[#1C1C1E]">
        <div className="text-center">
          <p className="text-lg font-medium mb-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            No projects created yet
          </p>
          <p className="text-sm text-[#9A9FA6] dark:text-[#9A9FA6]">
            Create projects in the projects tab and add links to them and see them visualized here!
          </p>

          <div className="mt-6">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setGraphMode('semantic')
              }}
              className="mx-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                fontFamily: "'Breeze Sans'",
                border: '1px solid',
                borderColor: isDarkMode ? '#3e91ff' : '#0072de',
                backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
                color: isDarkMode ? '#3e91ff' : '#0072de'
              }}
            >
              Back to Clusters
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!graph && graphMode == "semantic" || graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-white dark:bg-[#1C1C1E]">
        <div className="text-center">
          <p className="text-lg font-medium mb-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            No browsing data yet
          </p>
          <p className="text-sm mb-2 text-[#9A9FA6] dark:text-[#9A9FA6]">
            Refresh the page after some browsing to see your knowledge graph here.
          </p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 text-xs rounded-full transition-colors"
            style={{
              backgroundColor: isDarkMode ? '#3e91ff' : '#0072de',
              color: '#FFFFFF',
              fontFamily: "'Breeze Sans'",
              fontWeight: 500
            }}>
            Refresh graph
          </button>
        </div>
      </div>
    )
  }

  const handleNodeClick = (node: any) => {
    if (manualLinkMode) {
      if (selectedNodesForLink.includes(node.id)) {
        setSelectedNodesForLink(prev => prev.filter(id => id !== node.id))
      } else if (selectedNodesForLink.length === 0) {
        setSelectedNodesForLink([node.id])
      } else if (selectedNodesForLink.length === 1) {
        const [firstNode] = selectedNodesForLink
        
        const existingLinkIndex = manualLinks.findIndex(
          link => 
            (link.source === firstNode && link.target === node.id) ||
            (link.source === node.id && link.target === firstNode)
        )
        
        if (existingLinkIndex !== -1) {
          const updatedLinks = manualLinks.filter((_, idx) => idx !== existingLinkIndex)
          saveManualLinks(updatedLinks)
        } else {
          const newLink = { source: firstNode, target: node.id }
          saveManualLinks([...manualLinks, newLink])
        }
        
        setSelectedNodesForLink([])
      }
    } else {
      if (node.url) {
        window.open(node.url, '_blank')
      }
    }
  }

  const handleZoomIn = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom * 1.5, 300)
      hasUserInteractedRef.current = true
    }
  }

  const handleZoomOut = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom / 1.5, 300)
      hasUserInteractedRef.current = true
    }
  }

  // Get top domain for a cluster
  const getClusterTopDomain = (nodes: any[], clusterId: number): string | null => {
    const clusterNodes = nodes.filter(n => n.cluster === clusterId)
    if (clusterNodes.length === 0) return null
    
    const domainCounts = new Map<string, number>()
    for (const node of clusterNodes) {
      const count = domainCounts.get(node.domain) || 0
      domainCounts.set(node.domain, count + node.visitCount)
    }
    
    const topDomain = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]
    
    return topDomain ? topDomain[0] : null
  }

  // Load favicon for domain
  const loadFavicon = (domain: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (faviconCache.current.has(domain)) {
        resolve(faviconCache.current.get(domain)!)
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      // Try Google's favicon service first, fallback to direct
      img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
      
      img.onload = () => {
        faviconCache.current.set(domain, img)
        resolve(img)
      }
      
      img.onerror = () => {
        // Create a placeholder circle with first letter
        const canvas = document.createElement('canvas')
        canvas.width = 16
        canvas.height = 16
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#e5e7eb'
        ctx.fillRect(0, 0, 16, 16)
        ctx.fillStyle = '#6b7280'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(domain[0].toUpperCase(), 8, 8)
        
        const placeholderImg = new Image()
        placeholderImg.src = canvas.toDataURL()
        placeholderImg.onload = () => {
          faviconCache.current.set(domain, placeholderImg)
          resolve(placeholderImg)
        }
      }
    })
  }

  // Draw cluster boundaries for clusters with 2+ nodes
  const drawClusterBoundaries = (ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Draw at all zoom levels
    
    // Clear clickable areas for this frame
    clickableLabelAreasRef.current = []
    
    // Find connected components within each Louvain cluster
    const getConnectedComponents = (nodes: any[], edges: any[]) => {
      const components: Array<Set<string>> = []
      const visited = new Set<string>()
      
      // Build adjacency list from edges
      const adjacency = new Map<string, Set<string>>()
      nodes.forEach(n => adjacency.set(n.id, new Set()))
      
      edges.forEach((edge: any) => {
        const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
        const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
        
        if (adjacency.has(sourceId) && adjacency.has(targetId)) {
          adjacency.get(sourceId)!.add(targetId)
          adjacency.get(targetId)!.add(sourceId)
        }
      })
      
      // BFS to find connected components
      const bfs = (startId: string): Set<string> => {
        const component = new Set<string>()
        const queue = [startId]
        visited.add(startId)
        component.add(startId)
        
        while (queue.length > 0) {
          const nodeId = queue.shift()!
          const neighbors = adjacency.get(nodeId) || new Set()
          
          for (const neighborId of neighbors) {
            if (!visited.has(neighborId)) {
              visited.add(neighborId)
              component.add(neighborId)
              queue.push(neighborId)
            }
          }
        }
        
        return component
      }
      
      // Find all components
      nodes.forEach(node => {
        if (!visited.has(node.id)) {
          const component = bfs(node.id)
          if (component.size >= 2) { // Only keep components with 2+ nodes
            components.push(component)
          }
        }
      })
      
      return components
    }
    
    // Group nodes by Louvain cluster first
    const louvainClusters = new Map<number, any[]>()
    graphData.nodes.forEach(n => {
      if (!louvainClusters.has(n.cluster)) {
        louvainClusters.set(n.cluster, [])
      }
      louvainClusters.get(n.cluster)!.push(n)
    })
    
    // For each Louvain cluster, find connected components
    const allComponents: Array<{nodes: any[], clusterId: number, componentId: number}> = []
    louvainClusters.forEach((clusterNodes, clusterId) => {
      if (clusterNodes.length < 2) return
      
      const components = getConnectedComponents(clusterNodes, graphData.links)
      components.forEach((componentNodeIds, idx) => {
        const componentNodes = clusterNodes.filter(n => componentNodeIds.has(n.id))
        if (componentNodes.length >= 2) {
          allComponents.push({
            nodes: componentNodes,
            clusterId,
            componentId: idx
          })
        }
      })
    })
    
    // Draw boundary for each connected component
    allComponents.forEach(({nodes: clusterNodes, clusterId}) => {
      
      // Calculate bounding box for cluster nodes
      const xs = clusterNodes.map((n: any) => n.x).filter(x => x !== undefined)
      const ys = clusterNodes.map((n: any) => n.y).filter(y => y !== undefined)
      
      if (xs.length === 0 || ys.length === 0) return
      
      const minX = Math.min(...xs) - 20
      const maxX = Math.max(...xs) + 20
      const minY = Math.min(...ys) - 20
      const maxY = Math.max(...ys) + 20
      
      const padding = 15 / globalScale
      
      // Draw rounded rectangle around cluster
      ctx.beginPath()
      const radius = 10 / globalScale
      ctx.moveTo(minX - padding + radius, minY - padding)
      ctx.lineTo(maxX + padding - radius, minY - padding)
      ctx.quadraticCurveTo(maxX + padding, minY - padding, maxX + padding, minY - padding + radius)
      ctx.lineTo(maxX + padding, maxY + padding - radius)
      ctx.quadraticCurveTo(maxX + padding, maxY + padding, maxX + padding - radius, maxY + padding)
      ctx.lineTo(minX - padding + radius, maxY + padding)
      ctx.quadraticCurveTo(minX - padding, maxY + padding, minX - padding, maxY + padding - radius)
      ctx.lineTo(minX - padding, minY - padding + radius)
      ctx.quadraticCurveTo(minX - padding, minY - padding, minX - padding + radius, minY - padding)
      ctx.closePath()
      
      const color = getClusterColor(clusterId)
      ctx.strokeStyle = color + '30' // 19% opacity
      ctx.lineWidth = 1.5 / globalScale
      ctx.setLineDash([4 / globalScale, 4 / globalScale])
      ctx.stroke()
      ctx.setLineDash([])
      
      ctx.fillStyle = color + '08' // 3% opacity
      ctx.fill()
      
      // Draw cluster label at the top
      const clusterLabel = graphMode === 'projects' 
        ? generateProjectClusterLabel(graphData.nodes, clusterId)
        : generateClusterLabel(graphData.nodes, clusterId)
      const centerX = (minX + maxX) / 2
      const labelY = minY - padding - (20 / globalScale)
      
      // Get favicon for cluster's top domain
      const topDomain = getClusterTopDomain(graphData.nodes, clusterId)
      const favicon = topDomain && faviconCache.current.has(topDomain) 
        ? faviconCache.current.get(topDomain)! 
        : null
      
      // Set font and measure text - Fixed size regardless of zoom
      const fontSize = 10
      ctx.font = `${fontSize}px 'Breeze Sans', sans-serif`
      const textWidth = ctx.measureText(clusterLabel).width
      const labelPadding = 6
      const iconSize = favicon ? 14 : 0
      const iconPadding = favicon ? 4 : 0
      
      // Draw label background with border
      ctx.fillStyle = 'white'
      ctx.strokeStyle = color + '60'
      ctx.lineWidth = 1
      ctx.setLineDash([])
      const totalWidth = iconSize + iconPadding + textWidth
      const labelRectX = centerX - totalWidth/2 - labelPadding
      const labelRectY = labelY - fontSize - labelPadding
      const labelRectW = totalWidth + labelPadding * 2
      const labelRectH = Math.max(fontSize, iconSize) + labelPadding * 2
      
      // Rounded rectangle for label background
      ctx.beginPath()
      const labelRadius = 4
      ctx.moveTo(labelRectX + labelRadius, labelRectY)
      ctx.lineTo(labelRectX + labelRectW - labelRadius, labelRectY)
      ctx.quadraticCurveTo(labelRectX + labelRectW, labelRectY, labelRectX + labelRectW, labelRectY + labelRadius)
      ctx.lineTo(labelRectX + labelRectW, labelRectY + labelRectH - labelRadius)
      ctx.quadraticCurveTo(labelRectX + labelRectW, labelRectY + labelRectH, labelRectX + labelRectW - labelRadius, labelRectY + labelRectH)
      ctx.lineTo(labelRectX + labelRadius, labelRectY + labelRectH)
      ctx.quadraticCurveTo(labelRectX, labelRectY + labelRectH, labelRectX, labelRectY + labelRectH - labelRadius)
      ctx.lineTo(labelRectX, labelRectY + labelRadius)
      ctx.quadraticCurveTo(labelRectX, labelRectY, labelRectX + labelRadius, labelRectY)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      
      // Draw favicon icon if available
      if (favicon) {
        const iconX = centerX - totalWidth/2
        const iconY = labelY - iconSize/2 - fontSize/2
        ctx.drawImage(favicon, iconX, iconY, iconSize, iconSize)
      }
      
      // Draw label text
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const textX = favicon ? centerX + iconSize/2 + iconPadding/2 : centerX
      ctx.fillText(clusterLabel, textX, labelY - fontSize/2)
      
      // Store clickable area for project mode labels
      if (graphMode === 'projects') {
        // Find a node from this cluster to get projectId
        const clusterNode = graphData.nodes.find(n => n.cluster === clusterId)
        if (clusterNode?.projectId) {
          clickableLabelAreasRef.current.push({
            clusterId,
            projectId: clusterNode.projectId,
            projectName: clusterLabel,
            bounds: {
              x: labelRectX,
              y: labelRectY,
              width: labelRectW,
              height: labelRectH
            }
          })
        }
        
        // Add hover effect if this label is hovered
        if (hoveredLabel && hoveredLabel.clusterId === clusterId) {
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }
    })
  }

  const handleZoomReset = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 150)
      hasUserInteractedRef.current = true
    }
  }

  const toggleCluster = (clusterId: number) => {
    setSelectedClusters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(clusterId)) {
        newSet.delete(clusterId)
      } else {
        newSet.add(clusterId)
      }
      return newSet
    })
  }

  const clearClusterFilter = () => {
    setSelectedClusters(new Set())
  }

  const calculateNodeSize = (node: any) => {
    // Check if node is connected (has any edges)
    const isConnected = graphData.links.some((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source
      const targetId = typeof link.target === 'object' ? link.target.id : link.target
      return sourceId === node.id || targetId === node.id
    })
    
    const baseSize = 6 // Increased base size from 4
    const sizeFactor = Math.log(node.visitCount + 1) * 4 // Increased factor
    const calculatedSize = Math.max(baseSize, Math.min(baseSize + sizeFactor, 24)) // Increased max size
    
    // Isolated nodes get modest boost for visibility, but cap at max threshold
    const maxNodeSize = 20 // Maximum size threshold for any node
    const finalSize = isConnected ? calculatedSize : calculatedSize * 1.8
    return Math.min(finalSize, maxNodeSize)
  }

  const activeFilterCount = 
    (timeFilter !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0) +
    (minSimilarity !== 0.50 ? 1 : 0) +
    (!allClustersSelected ? 1 : 0)

  return (
    <div className="flex flex-col w-screen h-screen bg-white dark:bg-[#1C1C1E] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white dark:bg-[#1C1C1E] border-[#E5E5E5] dark:border-[#3A3A3C]">
        <div>
          <h1 className="text-xl font-bold text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            Knowledge Graph - Full View
          </h1>
          <p className="text-sm text-[#9A9FA6] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
            {filteredNodes.length} nodes · {graphData.links.length} connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-gray-50 dark:hover:bg-[#3A3A3C]"
            style={{ 
              fontFamily: "'Breeze Sans'", 
              border: '1px solid',
              borderColor: showLabels ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#3A3A3C' : '#E5E5E5'),
              backgroundColor: showLabels ? (isDarkMode ? 'rgba(74, 159, 255, 0.15)' : 'rgba(0, 114, 222, 0.1)') : (isDarkMode ? '#2C2C2E' : '#FFFFFF'),
              color: showLabels ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#FFFFFF' : '#080A0B')
            }}
            title="Toggle node labels">
            <span>Labels</span>
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white dark:bg-[#2C2C2E] border-[#E5E5E5] dark:border-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF] hover:bg-gray-50 dark:hover:bg-[#3A3A3C]"
            style={{ fontFamily: "'Breeze Sans'", border: '1px solid' }}>
            <Sliders className="h-3.5 w-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span 
                className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-[#0072de] dark:bg-[#3e91ff]"
                style={{ color: 'white' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setManualLinkMode(!manualLinkMode)
              setSelectedNodesForLink([])
            }}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-gray-50 dark:hover:bg-[#3A3A3C]"
            style={{ 
              color: manualLinkMode ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
              fontFamily: "'Breeze Sans'", 
              border: '1px solid',
              borderColor: manualLinkMode ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#3A3A3C' : '#E5E5E5'),
              backgroundColor: manualLinkMode ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#2C2C2E' : 'transparent')
            }}
            title="Click two nodes to create a manual link">
            <Link className="h-3.5 w-3.5" />
            <span>Link</span>
          </button>
          <button
            onClick={() => setShowExplanations(!showExplanations)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-gray-50 dark:hover:bg-[#3A3A3C]"
            style={{ 
              color: showExplanations ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
              fontFamily: "'Breeze Sans'", 
              border: '1px solid',
              borderColor: showExplanations ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#3A3A3C' : '#E5E5E5'),
              backgroundColor: showExplanations ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#2C2C2E' : 'transparent')
            }}
            title="Explain how connections are made">
            <Info className="h-3.5 w-3.5" />
            <span>Explain</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg transition-colors bg-white dark:bg-[#2C2C2E] hover:bg-gray-50 dark:hover:bg-[#3A3A3C] text-[#9A9FA6] dark:text-[#9A9FA6]">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Manual Link Mode Banner */}
      {manualLinkMode && (
        <div className="px-6 py-2 bg-blue-50 dark:bg-[#2C2C2E] border-b border-[#E5E5E5] dark:border-[#3A3A3C]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-[#0072de] dark:text-[#3e91ff]" />
              <span className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                {selectedNodesForLink.length === 0 
                  ? 'Click two nodes to link them (or unlink if already connected)' 
                  : 'Click second node to toggle link'}
              </span>
            </div>
            {selectedNodesForLink.length > 0 && (
              <button
                onClick={() => setSelectedNodesForLink([])}
                className="text-xs px-2 py-1 rounded text-[#0072de] dark:text-[#3e91ff] hover:bg-blue-100 dark:hover:bg-[#3A3A3C]"
                style={{ fontFamily: "'Breeze Sans'" }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-6 py-3 border-b gap-2 flex justify-between bg-white dark:bg-[#1C1C1E] border-[#E5E5E5] dark:border-[#3A3A3C]">
        <div className="relative flex w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9A9FA6]" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 pl-10 pr-10 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-[#2C2C2E] border-[#E5E5E5] dark:border-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]"
            style={{ 
              border: '1px solid', 
              fontFamily: "'Breeze Sans'"
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] rounded">
              <X className="h-3.5 w-3.5 text-[#9A9FA6]" />
            </button>
          )}
        </div>
        <div
          className="relative inline-flex items-center rounded-full p-1"
          style={{
            width: 160,
            border: '1px solid',
            borderColor: isDarkMode ? '#3A3A3C' : '#E5E5E5',
            backgroundColor: isDarkMode ? '#111214' : 'transparent',
            fontFamily: "'Breeze Sans'"
          }}
        >
          {/* Sliding knob */}
          <div
            aria-hidden
            className="absolute top-0 bottom-0 left-0 w-1/2 rounded-full transition-transform duration-200"
            style={{
              transform: graphMode === 'projects' ? 'translateX(100%)' : 'translateX(0)',
              backgroundColor: (isDarkMode ? '#3e91ff' : '#0072de'),
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
            }}
          />

          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setGraphMode('semantic')
            }}
            className="relative z-10 flex-1 text-xs py-1.5 rounded-full transition-colors"
            aria-pressed={graphMode === 'semantic'}
            style={{
              background: 'transparent',
              border: '0',
              color: graphMode === 'semantic' ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
            }}
            title="Show clusters"
          >
            Clusters
          </button>

          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setGraphMode('projects')
            }}
            className="relative z-10 flex-1 text-xs py-1.5 rounded-full transition-colors"
            aria-pressed={graphMode === 'projects'}
            style={{
              background: 'transparent',
              border: '0',
              color: graphMode === 'projects' ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
            }}
            title="Show projects"
          >
            Projects
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="px-6 py-4 border-b bg-gray-50 dark:bg-[#2C2C2E] border-[#E5E5E5] dark:border-[#3A3A3C]">
          <div className="space-y-4">
            {/* Similarity Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                  Min Similarity:
                </label>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#E5E5E5] dark:bg-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]">
                  {minSimilarity.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Cluster Filter */}
            {clusters.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium pt-1 whitespace-nowrap text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                  Clusters:
                </span>
                <div className="flex-1 flex flex-wrap gap-1.5">
                  {(showAllClusters ? clusters : clusters.slice(0, 3)).map(clusterId => {
                    const isActive = allClustersSelected || selectedClusters.has(clusterId)
                    const clusterLabel = graphMode === 'projects'
                      ? generateProjectClusterLabel(graph.nodes, clusterId)
                      : generateClusterLabel(graph.nodes, clusterId)
                    return (
                      <button
                        key={clusterId}
                        onClick={() => toggleCluster(clusterId)}
                        className="px-2.5 py-1 text-xs font-medium rounded-full transition-all"
                        style={{
                          backgroundColor: isActive ? getClusterColor(clusterId) : (isDarkMode ? '#2C2C2E' : '#FFFFFF'),
                          color: isActive ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
                          border: `1px solid ${isActive ? getClusterColor(clusterId) : (isDarkMode ? '#3A3A3C' : '#E5E5E5')}`,
                          fontFamily: "'Breeze Sans'"
                        }}>
                        {clusterLabel}
                      </button>
                    )
                  })}
                  {clusters.length > 3 && (
                    <button
                      onClick={() => setShowAllClusters(!showAllClusters)}
                      className="px-2.5 py-1 text-xs font-medium rounded-full transition-all bg-white dark:bg-[#2C2C2E] border-[#E5E5E5] dark:border-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]"
                      style={{
                        border: '1px solid',
                        fontFamily: "'Breeze Sans'"
                      }}>
                      {showAllClusters ? 'Show Less' : `+${clusters.length - 3} More`}
                    </button>
                  )}
                  {!allClustersSelected && (
                    <button
                      onClick={clearClusterFilter}
                      className="px-2.5 py-1 text-xs font-medium rounded-full transition-all underline text-[#0072de] dark:text-[#3e91ff]"
                      style={{ fontFamily: "'Breeze Sans'" }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Graph Container */}
      <div ref={containerRef} className="flex-1 relative bg-white dark:bg-[#1C1C1E] overflow-hidden" style={{
        backgroundImage: isDarkMode
          ? 'radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.16) 1px, transparent 0)'
          : 'radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.16) 1px, transparent 0)',
        backgroundSize: '24px 24px'
      }}>
        {/* Zoom Controls */}
        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="p-3 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-md transition-all hover:bg-gray-50 dark:hover:bg-[#3A3A3C] active:scale-95 border-2 border-[#E5E5E5] dark:border-[#3A3A3C]"
            title="Zoom in">
            <ZoomIn className="h-5 w-5 text-[#080A0B] dark:text-[#FFFFFF]" />
          </button>
          <button
            onClick={handleZoomReset}
            className="p-3 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-md transition-all hover:bg-gray-50 dark:hover:bg-[#3A3A3C] active:scale-95 border-2 border-[#E5E5E5] dark:border-[#3A3A3C]"
            title="Reset zoom">
            <RotateCw className="h-5 w-5 text-[#080A0B] dark:text-[#FFFFFF]" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-3 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-md transition-all hover:bg-gray-50 dark:hover:bg-[#3A3A3C] active:scale-95 border-2 border-[#E5E5E5] dark:border-[#3A3A3C]"
            title="Zoom out">
            <ZoomOut className="h-5 w-5 text-[#080A0B] dark:text-[#FFFFFF]" />
          </button>
        </div>

        {filteredNodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            nodeLabel={null}
            nodeColor={(node: any) => node.color}
            nodeVal={calculateNodeSize}
            nodeRelSize={8}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.label
              
              // Check if node is connected
              const isConnected = graphData.links.some((link: any) => {
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source
                const targetId = typeof link.target === 'object' ? link.target.id : link.target
                return sourceId === node.id || targetId === node.id
              })
              
              // Dynamic font size: 11px for isolated nodes, 4px for clustered nodes
              const fontSize = isConnected ? 4 : 11
              ctx.font = `${fontSize}px 'Breeze Sans', Sans-Serif`
              
              const baseSize = calculateNodeSize(node) // Use the calculated value from nodeVal
              // Apply size boost for isolated nodes in rendering
              const size = isConnected ? baseSize : baseSize * 1.5
              const isSelected = selectedNodesForLink.includes(node.id)
              
              ctx.beginPath()
              ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false)
              ctx.fillStyle = isSelected ? '#0072de' : node.color
              ctx.fill()
              
              ctx.strokeStyle = isSelected ? '#FFFFFF' : '#ffffff'
              ctx.lineWidth = isSelected ? 3 : 2
              ctx.stroke()
              
              if (isSelected) {
                ctx.beginPath()
                ctx.arc(node.x, node.y, size * 1.3, 0, 2 * Math.PI, false)
                ctx.strokeStyle = '#0072de'
                ctx.lineWidth = 2
                ctx.setLineDash([5, 5])
                ctx.stroke()
                ctx.setLineDash([])
              }
              
              // Draw labels: always for isolated nodes, or when zoomed in and labels enabled
              const shouldShowLabel = !isConnected || (showLabels && globalScale > 1.2)
              if (shouldShowLabel) {
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                
                // Measure text for background
                const textWidth = ctx.measureText(label).width
                const padding = fontSize * 0.4
                const bckgDimensions = [textWidth + padding * 2, fontSize + padding * 1.5]
                const labelX = node.x
                const labelY = node.y + size + 8
                
                // Draw rounded background box with subtle border and shadow effect
                const radius = fontSize * 0.3
                ctx.beginPath()
                ctx.moveTo(labelX - bckgDimensions[0] / 2 + radius, labelY - bckgDimensions[1] / 2)
                ctx.lineTo(labelX + bckgDimensions[0] / 2 - radius, labelY - bckgDimensions[1] / 2)
                ctx.quadraticCurveTo(labelX + bckgDimensions[0] / 2, labelY - bckgDimensions[1] / 2, labelX + bckgDimensions[0] / 2, labelY - bckgDimensions[1] / 2 + radius)
                ctx.lineTo(labelX + bckgDimensions[0] / 2, labelY + bckgDimensions[1] / 2 - radius)
                ctx.quadraticCurveTo(labelX + bckgDimensions[0] / 2, labelY + bckgDimensions[1] / 2, labelX + bckgDimensions[0] / 2 - radius, labelY + bckgDimensions[1] / 2)
                ctx.lineTo(labelX - bckgDimensions[0] / 2 + radius, labelY + bckgDimensions[1] / 2)
                ctx.quadraticCurveTo(labelX - bckgDimensions[0] / 2, labelY + bckgDimensions[1] / 2, labelX - bckgDimensions[0] / 2, labelY + bckgDimensions[1] / 2 - radius)
                ctx.lineTo(labelX - bckgDimensions[0] / 2, labelY - bckgDimensions[1] / 2 + radius)
                ctx.quadraticCurveTo(labelX - bckgDimensions[0] / 2, labelY - bckgDimensions[1] / 2, labelX - bckgDimensions[0] / 2 + radius, labelY - bckgDimensions[1] / 2)
                ctx.closePath()
                
                // Fill with gradient-like effect using white background
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
                ctx.fill()
                
                // Add subtle border
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
                ctx.lineWidth = 1
                ctx.stroke()
                
                // Draw text with slightly darker color for better contrast
                ctx.fillStyle = '#1F2937'
                ctx.font = `${fontSize}px 'Breeze Sans', Sans-Serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(label, labelX, labelY)
              }
            }}
            nodeCanvasObjectMode={() => 'replace'}
            linkWidth={(link: any) => link.isManual ? 2 : Math.max(1, link.value * 2)}
            linkColor={(link: any) => link.isManual ? '#0072de' : '#cbd5e1'}
            linkLineDash={(link: any) => link.isManual ? [5, 5] : null}
            linkDirectionalParticles={0}
            onNodeClick={handleNodeClick}
            onNodeHover={(node: any) => {
              if (node?.id !== hoveredNode?.id) {
                setHoveredNode(node)
                if (node && graphRef.current) {
                  const screenPos = graphRef.current.graph2ScreenCoords(node.x || 0, node.y || 0)
                  setHoveredNodePos(screenPos)
                }
              }
            }}
            cooldownTicks={10000}
            dagMode={null}
            d3VelocityDecay={0.3}
            d3AlphaDecay={0.02}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              drawClusterBoundaries(ctx, globalScale)
            }}
            onEngineStop={() => {
              // Only auto-fit on initial load, not after user interactions
              if (graphRef.current && !hasUserInteractedRef.current) {
                graphRef.current.zoomToFit(400, 150)
              }
            }}
            onZoom={() => {
              hasUserInteractedRef.current = true
            }}
            onNodeDragEnd={(node: any) => {
              node.fx = node.x
              node.fy = node.y
              hasUserInteractedRef.current = true
            }}
            onBackgroundClick={(event) => {
              // Handle label clicks for project mode
              if (graphMode !== 'projects') return
              
              const canvas = event.target as HTMLCanvasElement
              const rect = canvas.getBoundingClientRect()
              const x = event.clientX - rect.left
              const y = event.clientY - rect.top
              
              // Convert screen coordinates to graph coordinates
              if (!graphRef.current) return
              const graphCoords = graphRef.current.screen2GraphCoords(x, y)
              
              // Check if click is within any label bounds
              for (const labelArea of clickableLabelAreasRef.current) {
                const { bounds, projectId, projectName } = labelArea
                if (graphCoords.x >= bounds.x && 
                    graphCoords.x <= bounds.x + bounds.width &&
                    graphCoords.y >= bounds.y && 
                    graphCoords.y <= bounds.y + bounds.height) {
                  // Open project in tab group
                  log('[GraphFullPage] Opening project in tab group:', projectName, projectId)
                  sendMessage({ 
                    type: 'OPEN_PROJECT_IN_TAB_GROUP', 
                    payload: { projectId } 
                  }).catch(err => {
                    console.error('[GraphFullPage] Failed to open project:', err)
                  })
                  return
                }
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
              No nodes match current filters
            </p>
          </div>
        )}
      </div>

      {/* Project Label Hover Tooltip */}
      {hoveredLabel && (
        <div
          className="absolute z-50 pointer-events-none transition-all duration-100"
          style={{
            left: `${hoveredLabel.x}px`,
            top: `${hoveredLabel.y}px`,
            transform: 'translate(-50%, -10%)'
          }}
        >
          {/* <div className="px-4 py-2 rounded-lg text-sm font-medium text-white backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(0, 114, 222, 0.95)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 0 20px rgba(0, 114, 222, 0.3)',
              fontFamily: "'Breeze Sans'"
            }}>
            Click to open!
          </div> */}
          {/* <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-0 h-0" style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid rgba(0, 114, 222, 0.95)',
          }} /> */}
        </div>
      )}

      {/* Beautiful Hover Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-50 pointer-events-none transition-all duration-100"
          style={{
            left: `${hoveredNodePos.x}px`,
            top: `${hoveredNodePos.y}px`,
            transform: 'translate(-50%, -10%)'
          }}
        >
          {/* Tooltip Card */}
          <div className="text-white rounded-lg px-3 py-2.5 backdrop-blur-sm mb-2" style={{
            backgroundColor: 'rgba(0, 114, 222, 0.95)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 0 20px rgba(0, 114, 222, 0.3)',
            minWidth: '210px',
            fontFamily: "'Breeze Sans', sans-serif"
          }}>
            {/* Title */}
            <div className="font-semibold text-sm mb-2 leading-tight line-clamp-2">
              {hoveredNode.name}
            </div>
            
            {/* Stats Grid */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="opacity-90">Visits</span>
                <span className="font-mono font-semibold" style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {hoveredNode.visitCount}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="opacity-90">Domain</span>
                <span className="font-mono text-[10px] truncate max-w-[110px] ml-2" title={hoveredNode.domain}>
                  {hoveredNode.domain}
                </span>
              </div>
              
              {hoveredNode.searchQuery && (
                <div className="flex items-start justify-between gap-1">
                  <span className="opacity-90 flex-shrink-0">🔍 Query</span>
                  <span className="text-right truncate max-w-[110px]" title={hoveredNode.searchQuery}>
                    {hoveredNode.searchQuery}
                  </span>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="mt-2.5 pt-2 border-t border-white border-opacity-20 text-[11px] opacity-75 text-center">
              Click to open • Drag to move
            </div>
          </div>
          
          {/* Arrow pointing down */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-0 h-0" style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid rgba(0, 114, 222, 0.95)',
          }} />
        </div>
      )}

      {/* Explanation Panel */}
      {showExplanations && graph && (
        <div className="absolute z-50 top-20 right-6 w-96 max-h-[calc(100vh-7rem)] bg-white dark:bg-[#1C1C1E] rounded-lg shadow-2xl border-2 border-[#E5E5E5] dark:border-[#3A3A3C] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5] dark:border-[#3A3A3C] bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-[#1C1C1E]">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-[#3e91ff]" />
              <h3 className="font-semibold text-sm text-[#080A0B] dark:text-white" style={{ fontFamily: "'Breeze Sans'" }}>
                Connection Explanations
              </h3>
            </div>
            <button 
              onClick={() => setShowExplanations(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="overflow-y-auto p-4 space-y-4 flex-1 text-[#080A0B] dark:text-white" style={{ fontFamily: "'Breeze Sans'" }}>
            {(() => {
              const allClusters = Array.from(new Set(graph.nodes.map(n => n.cluster)))
              const clusterResults = allClusters.map(clusterId => {
                const clusterNodes = graph.nodes.filter(n => n.cluster === clusterId)
                if (clusterNodes.length < 2) return null
                
                const clusterEdges = graph.edges.filter(e => {
                  const sourceNode = graph.nodes.find(n => n.id === e.source)
                  const targetNode = graph.nodes.find(n => n.id === e.target)
                  return sourceNode?.cluster === clusterId && targetNode?.cluster === clusterId
                })
                
                if (clusterEdges.length === 0) return null
                
                return { clusterId, clusterNodes, clusterEdges }
              }).filter(Boolean)
              
              if (clusterResults.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <Info className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-3" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No connections available</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Create more links to see connection explanations</p>
                  </div>
                )
              }
              
              return clusterResults.map(({ clusterId, clusterNodes, clusterEdges }) => {
              
              const clusterLabel = graphMode === 'projects'
                ? generateProjectClusterLabel(graph.nodes, clusterId)
                : generateClusterLabel(graph.nodes, clusterId)
              const clusterColor = getClusterColor(clusterId)
              
              return (
                <div key={clusterId} className="border rounded-lg overflow-hidden" style={{ borderColor: clusterColor + '40' }}>
                  <div className="px-3 py-2" style={{ backgroundColor: clusterColor + '10' }}>
                    <div className="font-semibold text-xs" style={{ color: clusterColor }}>
                      {clusterLabel}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {clusterNodes.length} pages · {clusterEdges.length} connections
                    </div>
                  </div>
                  
                  <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                    {clusterEdges.slice(0, 10).map((edge, idx) => {
                      const breakdown = edge.breakdown
                      if (!breakdown) return null
                      
                      const sourceNode = graph.nodes.find(n => n.id === edge.source)
                      const targetNode = graph.nodes.find(n => n.id === edge.target)
                      
                      return (
                        <div key={idx} className="text-[11px] space-y-1 pb-2 border-b last:border-0 border-gray-100 dark:border-gray-700">
                          <div className="font-medium text-gray-700 dark:text-gray-300 leading-tight">
                            {sourceNode?.title.substring(0, 40)}{sourceNode?.title.length! > 40 ? '...' : ''}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400 text-[10px]">↓ connected to</div>
                          <div className="font-medium text-gray-700 dark:text-gray-300 leading-tight">
                            {targetNode?.title.substring(0, 40)}{targetNode?.title.length! > 40 ? '...' : ''}
                          </div>
                          
                          <div className="mt-2 space-y-0.5 pl-2 border-l-2" style={{ borderColor: clusterColor + '40' }}>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 dark:text-gray-400">Semantic similarity</span>
                              <span className="font-mono font-semibold" style={{ color: clusterColor }}>
                                {(breakdown.embedding * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 dark:text-gray-400">Keyword overlap</span>
                              <span className="font-mono font-semibold" style={{ color: clusterColor }}>
                                {(breakdown.keyword * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600 dark:text-gray-400">Time proximity</span>
                              <span className="font-mono font-semibold" style={{ color: clusterColor }}>
                                {(breakdown.temporal * 100).toFixed(0)}%
                              </span>
                            </div>
                            {breakdown.sameDomain && (
                              <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                                <span>Same domain boost</span>
                                <span className="font-mono font-semibold">+{((breakdown.domainBoost - 1) * 100).toFixed(0)}%</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-1 mt-1 border-t border-gray-100 dark:border-gray-700">
                              <span className="font-semibold text-gray-700 dark:text-gray-300">Total Strength</span>
                              <span className="font-mono font-bold" style={{ color: clusterColor }}>
                                {(edge.weight! * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {clusterEdges.length > 10 && (
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center pt-1">
                        ... and {clusterEdges.length - 10} more connections
                      </div>
                    )}
                  </div>
                </div>
              )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
