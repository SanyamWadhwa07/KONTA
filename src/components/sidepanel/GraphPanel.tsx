import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import ForceGraph2D from "react-force-graph-2d"
import { forceCollide } from "d3-force"
import { Search, X, ChevronDown, RotateCw, Sliders, ZoomIn, ZoomOut, Link, Maximize2 } from "lucide-react"
import type { KnowledgeGraph, GraphNode } from "~/lib/knowledge-graph"
import { getClusterColor, generateClusterLabel } from "~/lib/knowledge-graph"
import { log, warn } from "~/lib/logger"

// Clean URL to remove chrome-extension prefix if present
function cleanUrl(url: string): string {
  const chromeExtPattern = /^chrome-extension:\/\/[a-z]{32}\/tabs\//
  if (chromeExtPattern.test(url)) {
    const cleanedUrl = url.replace(chromeExtPattern, '')
    return cleanedUrl.startsWith('http') ? cleanedUrl : 'https://' + cleanedUrl
  }
  // Ensure URL has protocol (not relative)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url
  }
  return url
}

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

export function GraphPanel() {
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
  const [manualLinks, setManualLinks] = useState<Array<{source: string, target: string}>>([])
  const [showExplanations, setShowExplanations] = useState(false)
  const graphRef = useRef<any>()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 500, height: 400 })
  const hasUserInteractedRef = useRef(false)
  const lastGraphTimestampRef = useRef<number>(0)
  const faviconCache = useRef<Map<string, HTMLImageElement>>(new Map())

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
      const response = await sendMessage<{ graph: KnowledgeGraph }>({ type: "GET_GRAPH" })
      if (response?.graph) {
        // Only update if graph has actually changed
        if (response.graph.lastUpdated !== lastGraphTimestampRef.current) {
          log("[GraphPanel] Graph data changed, updating UI")
          setGraph(response.graph)
          lastGraphTimestampRef.current = response.graph.lastUpdated
          hasUserInteractedRef.current = false // Reset on new graph load
        }
      }
    } catch (err) {
      console.error("[GraphPanel] Failed to load graph:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = async () => {
    try {
      // Get current active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentUrl = activeTab?.url
      const currentDomain = currentUrl ? new URL(currentUrl).hostname : null
      
      const response = await sendMessage<{ graph: KnowledgeGraph }>({ type: "REFRESH_GRAPH" })
      if (response?.graph) {
        setGraph(response.graph)
        lastGraphTimestampRef.current = response.graph.lastUpdated
        
        // Find node matching current tab
        if (currentDomain && graphRef.current) {
          setTimeout(() => {
            if (!graphRef.current) return
            
            const matchingNode = response.graph.nodes.find(node => 
              node.domain === currentDomain || node.url.includes(currentDomain)
            )
            
            if (matchingNode) {
              // Focus on the matching node's cluster
              const clusterNodes = response.graph.nodes.filter(n => n.cluster === matchingNode.cluster)
              
              // Calculate cluster center
              let sumX = 0, sumY = 0, count = 0
              clusterNodes.forEach(node => {
                const graphNode = graphRef.current.graphData().nodes.find((n: any) => n.id === node.id)
                if (graphNode && graphNode.x !== undefined && graphNode.y !== undefined) {
                  sumX += graphNode.x
                  sumY += graphNode.y
                  count++
                }
              })
              
              if (count > 0) {
                const centerX = sumX / count
                const centerY = sumY / count
                graphRef.current.centerAt(centerX, centerY, 400)
                graphRef.current.zoom(2, 400)
                log(`[GraphPanel] Focused on cluster ${matchingNode.cluster} for domain ${currentDomain}`)
              }
            } else {
              // No matching node, zoom to fit all
              graphRef.current.zoomToFit(400, 50)
            }
          }, 800)
        } else {
          hasUserInteractedRef.current = false // Allow auto-fit if no current tab
        }
      }
    } catch (err) {
      console.error("[GraphPanel] Failed to refresh graph:", err)
    }
  }

  useEffect(() => {
    loadGraph()
    // Only load once on mount, no polling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preload favicons when graph updates
  useEffect(() => {
    if (!graph) return
    
    const clusters = new Set(graph.nodes.map(n => n.cluster))
    clusters.forEach(clusterId => {
      const topDomain = getClusterTopDomain(graph.nodes, clusterId)
      if (topDomain && !faviconCache.current.has(topDomain)) {
        loadFavicon(topDomain).catch(err => 
          log('[GraphPanel] Failed to load favicon for', topDomain)
        )
      }
    })
  }, [graph])

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions(prev => {
          // Only update if dimensions changed significantly to prevent loops
          // And ensure dimensions are valid (> 10px) to avoid zero-width issues
          if ((width > 10 && Math.abs(prev.width - width) > 2) || 
              (height > 10 && Math.abs(prev.height - height) > 2)) {
            return { width, height }
          }
          return prev
        })
      }
    })
    
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (graph) {
      log("[GraphPanel] Graph loaded:", {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        nodesSample: graph.nodes.slice(0, 2),
        edgesSample: graph.edges.slice(0, 2)
      })

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
      
      // Auto-fit when new graph data loads
      if (!hasUserInteractedRef.current && graphRef.current) {
        setTimeout(() => {
          if (graphRef.current && !hasUserInteractedRef.current) {
            graphRef.current.zoomToFit(400, 80)
            // Apply additional zoom out for better initial view
            setTimeout(() => {
              if (graphRef.current && !hasUserInteractedRef.current) {
                const currentZoom = graphRef.current.zoom()
                graphRef.current.zoom(currentZoom * 0.7, 200)
              }
            }, 450)
          }
        }, 500)
      }
    }
  }, [graph])

  const { clusters, filteredNodes, graphData } = useMemo(() => {
    if (!graph) {
      return { 
        clusters: [], 
        filteredNodes: [], 
        graphData: { nodes: [], links: [] } 
      }
    }

    const clusters = Array.from(new Set(graph.nodes.map(n => n.cluster)))
    const allClustersSelected = selectedClusters.size === 0

    // Apply time filter
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

    // Apply search filter
    const searchFilteredNodes = searchQuery.trim()
      ? timeFilteredNodes.filter(n => 
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.domain.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : timeFilteredNodes

    // Apply cluster filter
    const filteredNodes = searchFilteredNodes.filter(n => {
      if (allClustersSelected) return true
      return selectedClusters.has(n.cluster)
    })

    // Create set of filtered node IDs
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id))

    // Filter edges based on cluster-filtered nodes
    const filteredEdges = graph.edges.filter(e => 
      (e.weight || e.similarity) >= minSimilarity &&
      filteredNodeIds.has(e.source) &&
      filteredNodeIds.has(e.target)
    )

    // Transform to react-force-graph format
    const graphData = {
      nodes: filteredNodes.map(n => {
        const displayLabel = n.domain
        return {
          id: n.id,
          name: n.title,
          url: n.url,
          domain: n.domain,
          cluster: n.cluster,
          visitCount: n.visitCount,
          searchQuery: n.searchQuery,
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

    return { clusters, filteredNodes, graphData }
  }, [graph, searchQuery, timeFilter, selectedClusters, minSimilarity, manualLinks])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin">
            <RotateCw className="h-6 w-6" style={{ color: '#0072de' }} />
          </div>
          <p className="text-xs" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
            Loading knowledge graph...
          </p>
        </div>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    // Check if we have pages but no embeddings yet (still generating)
    // If there are nodes but no edges, embeddings are likely still being generated
    const hasPagesButNoEmbeddings = graph && graph.nodes.length > 0 && graph.edges.length === 0
    
    if (hasPagesButNoEmbeddings) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin">
              <RotateCw className="h-8 w-8" style={{ color: '#0072de' }} />
            </div>
          </div>
          <div className="text-center max-w-sm">
            <p className="text-sm mb-2" style={{ color: '#080A0B', fontFamily: "'Breeze Sans'", fontWeight: 600 }}>
              Your knowledge graph is forming
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
              We're analyzing your browsing history and generating embeddings. This may take a few minutes. Come back shortly to explore your knowledge graph!
            </p>
          </div>
        </div>
      )
    }
    
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Search className="h-10 w-10 opacity-20" style={{ color: '#9A9FA6' }} />
        <div className="text-center max-w-xs mx-auto space-y-2">
          <p className="text-sm font-semibold" style={{ color: '#080A0B', fontFamily: "'Breeze Sans'" }}>
            No pages yet
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
            Browse a few pages to build your knowledge graph. Embeddings are generated locally and may take a moment to appear.
          </p>
        </div>
        <div className="text-center max-w-xs mx-auto space-y-2">
          <p className="text-xs leading-relaxed" style={{ color: '#0072DF', fontFamily: "'Breeze Sans'" }}>
            Imported history data is not part of the knowledge graph until you revisit those pages.
          </p>
        </div>
        {/* <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: '#0072de', color: 'white', fontFamily: "'Breeze Sans'" }}>
          Refresh Graph
        </button> */}
      </div>
    )
  }

  const allClustersSelected = selectedClusters.size === 0

  const handleNodeClick = (node: any) => {
    if (manualLinkMode) {
      // Manual linking mode
      if (selectedNodesForLink.includes(node.id)) {
        // Deselect node
        setSelectedNodesForLink(prev => prev.filter(id => id !== node.id))
      } else if (selectedNodesForLink.length === 0) {
        // Select first node
        setSelectedNodesForLink([node.id])
      } else if (selectedNodesForLink.length === 1) {
        // Select second node and check for existing link
        const [firstNode] = selectedNodesForLink
        
        // Check if manual link already exists
        const existingLinkIndex = manualLinks.findIndex(
          link => 
            (link.source === firstNode && link.target === node.id) ||
            (link.source === node.id && link.target === firstNode)
        )
        
        if (existingLinkIndex !== -1) {
          // Link exists - remove it
          const updatedLinks = manualLinks.filter((_, idx) => idx !== existingLinkIndex)
          saveManualLinks(updatedLinks)
          log('[GraphPanel] Removed manual link between', firstNode, 'and', node.id)
        } else {
          // Link doesn't exist - create it
          const newLink = { source: firstNode, target: node.id }
          saveManualLinks([...manualLinks, newLink])
          log('[GraphPanel] Created manual link between', firstNode, 'and', node.id)
        }
        
        // Clear selection
        setSelectedNodesForLink([])
      }
    } else {
      // Normal mode - open URL
      if (node.url) {
        const cleanedUrl = cleanUrl(node.url)
        chrome.tabs.create({ url: cleanedUrl })
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

  const handleZoomReset = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 80)
      setTimeout(() => {
        if (graphRef.current) {
          const currentZoom = graphRef.current.zoom()
          graphRef.current.zoom(currentZoom * 0.7, 200)
        }
      }, 450)
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
      
      // Try Google's favicon service first
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
    // Safety check for graphData
    if (!graphData || !graphData.nodes || !graphData.links) return

    // Only draw if zoomed out too much
    if (globalScale < 0.5) return
    
    // Helper: Find connected components within a set of nodes
    const getConnectedComponents = (nodes: any[], allEdges: any[]) => {
      const components: Array<Set<string>> = []
      const visited = new Set<string>()
      
      // Build adjacency list from edges
      const nodeIds = new Set(nodes.map(n => n.id))
      const adjacency = new Map<string, Set<string>>()
      nodes.forEach(n => adjacency.set(n.id, new Set()))
      
      allEdges.forEach((edge: any) => {
        const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source
        const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target
        
        if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
          adjacency.get(sourceId)?.add(targetId)
          adjacency.get(targetId)?.add(sourceId)
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
          if (component.size >= 2) { // Only boundaries for 2+ connected nodes
            components.push(component)
          }
        }
      })
      
      return components
    }
    
    // Group nodes by Louvain cluster
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
      const clusterLabel = generateClusterLabel(graphData.nodes, clusterId)
      const centerX = (minX + maxX) / 2
      const labelY = minY - padding - (20 / globalScale)
      
      // Get favicon for cluster's top domain
      const topDomain = getClusterTopDomain(graphData.nodes, clusterId)
      const favicon = topDomain && faviconCache.current.has(topDomain) 
        ? faviconCache.current.get(topDomain)! 
        : null
      
      // Set font and measure text
      const fontSize = 10 / globalScale
      ctx.font = `${fontSize}px 'Breeze Sans', sans-serif`
      const textWidth = ctx.measureText(clusterLabel).width
      const labelPadding = 6 / globalScale
      const iconSize = favicon ? 12 / globalScale : 0
      const iconPadding = favicon ? 4 / globalScale : 0
      
      // Draw label background with border
      ctx.fillStyle = 'white'
      ctx.strokeStyle = color + '60'
      ctx.lineWidth = 1 / globalScale
      ctx.setLineDash([])
      const totalWidth = iconSize + iconPadding + textWidth
      const labelRectX = centerX - totalWidth/2 - labelPadding
      const labelRectY = labelY - fontSize - labelPadding
      const labelRectW = totalWidth + labelPadding * 2
      const labelRectH = Math.max(fontSize, iconSize) + labelPadding * 2
      
      // Rounded rectangle for label background
      ctx.beginPath()
      const labelRadius = 4 / globalScale
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
    })
  }

  const toggleCluster = (clusterId: number) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(clusterId)) {
        next.delete(clusterId)
      } else {
        next.add(clusterId)
      }
      return next
    })
  }

  const clearClusterFilter = () => {
    setSelectedClusters(new Set())
  }

  // Count active filters
  const activeFilterCount = 
    (searchQuery.trim() ? 1 : 0) +
    (timeFilter !== "all" ? 1 : 0) +
    (selectedClusters.size > 0 ? 1 : 0) +
    (minSimilarity !== 0.50 ? 1 : 0)

  return (
    <div className="flex flex-col gap-0 w-full h-full">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 font-sans whitespace-nowrap">
            Knowledge Graph
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              chrome.tabs.create({ url: chrome.runtime.getURL('tabs/graph.html') })
            }}
            className="p-1.5 rounded-lg transition-colors hover:bg-gray-50 text-gray-400"
            title="Open in full page">
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-1.5 rounded-lg transition-all hover:bg-gray-50 border ${
              showLabels 
                ? 'text-blue-600 border-blue-600 bg-blue-50' 
                : 'text-gray-400 border-transparent'
            }`}
            title="Toggle node labels">
            <span className="text-xs font-bold">Aa</span>
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`relative p-1.5 rounded-lg transition-all hover:bg-gray-50 border ${
              showFilters
                ? 'text-blue-600 border-blue-600 bg-blue-50'
                : 'text-gray-400 border-transparent'
            }`}
            title="Filters">
            <Sliders className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span 
                className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 text-[9px] font-bold rounded-full bg-blue-600 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setManualLinkMode(!manualLinkMode)
              setSelectedNodesForLink([])
            }}
            className={`relative p-1.5 rounded-lg transition-all hover:bg-gray-50 border ${
              manualLinkMode
                ? 'text-white bg-blue-600 border-blue-600'
                : 'text-gray-400 border-transparent'
            }`}
            title="Link nodes">
            <Link className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowExplanations(!showExplanations)}
            className={`p-1.5 rounded-lg transition-all hover:bg-gray-50 border ${
              showExplanations
                ? 'text-white bg-blue-600 border-blue-600'
                : 'text-gray-400 border-transparent'
            }`}
            title="Explain connections">
            <span className="text-sm">📊</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg transition-colors hover:bg-gray-50 text-gray-400"
            title="Refresh graph">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Manual Link Mode Banner */}
      {manualLinkMode && (
        <div className="px-3 py-2 bg-blue-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-gray-900 font-sans">
                {selectedNodesForLink.length === 0 
                  ? 'Click two nodes to link them (or unlink if already connected)' 
                  : 'Click second node to toggle link'}
              </span>
            </div>
            {selectedNodesForLink.length > 0 && (
              <button
                onClick={() => setSelectedNodesForLink([])}
                className="text-xs px-2 py-1 rounded hover:bg-blue-100 text-blue-600 font-sans">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Always Visible Search Bar */}
      <div className="px-3 py-2 border-b bg-white border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-200 bg-white text-gray-900 font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 text-gray-400">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Filters Section */}
      {showFilters && (
        <div className="px-3 py-3 border-b bg-gray-50/50 flex flex-col gap-3 border-gray-200">
          {/* Time Filter Chips */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-900 font-sans">
              Time:
            </span>
            <div className="flex gap-1.5">
              {(["all", "today", "week"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-all font-sans border ${
                    timeFilter === filter
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black'
                  }`}>
                  {filter === "all" ? "All Time" : filter === "today" ? "Today" : "This Week"}
                </button>
              ))}
            </div>
          </div>

          {/* Similarity Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium whitespace-nowrap text-gray-900 font-sans">
              Similarity:
            </span>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0.2}
                max={0.6}
                step={0.05}
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                className="flex-1 h-1 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #0072de 0%, #0072de ${((minSimilarity - 0.2) / 0.4) * 100}%, #E5E5E5 ${((minSimilarity - 0.2) / 0.4) * 100}%, #E5E5E5 100%)`
                }}
              />
              <span className="text-xs font-mono w-10 text-right text-gray-900">
                {minSimilarity.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Cluster Filter Chips */}
          {clusters.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium pt-1 whitespace-nowrap text-gray-900 font-sans">
                Clusters:
              </span>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {clusters.map(clusterId => {
                  const isActive = allClustersSelected || selectedClusters.has(clusterId)
                  const clusterLabel = generateClusterLabel(graph.nodes, clusterId)
                  const clusterColor = getClusterColor(clusterId)
                  return (
                    <button
                      key={clusterId}
                      onClick={() => toggleCluster(clusterId)}
                      className="px-2.5 py-1 text-xs font-medium rounded-full transition-all font-sans"
                      style={{
                        backgroundColor: isActive ? clusterColor : '#FFFFFF',
                        color: isActive ? '#FFFFFF' : '#080A0B',
                        border: `1px solid ${isActive ? clusterColor : '#E5E5E5'}`,
                      }}>
                      {clusterLabel}
                    </button>
                  )
                })}
                {!allClustersSelected && (
                  <button
                    onClick={clearClusterFilter}
                    className="px-2.5 py-1 text-xs font-medium rounded-full transition-all underline text-blue-600 font-sans">
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Graph Container */}
      <div ref={containerRef} className="relative bg-white overflow-hidden w-full flex-1">
        {/* Navigation Controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="p-3 rounded-lg bg-white shadow-md transition-all hover:bg-gray-50 active:scale-95 border border-gray-200"
            title="Zoom in (scroll up)">
            <ZoomIn className="h-5 w-5 text-gray-900" />
          </button>
          <button
            onClick={handleZoomReset}
            className="p-3 rounded-lg bg-white shadow-md transition-all hover:bg-gray-50 active:scale-95 border border-gray-200"
            title="Reset zoom">
            <RotateCw className="h-5 w-5 text-gray-900" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-3 rounded-lg bg-white shadow-md transition-all hover:bg-gray-50 active:scale-95 border border-gray-200"
            title="Zoom out (scroll down)">
            <ZoomOut className="h-5 w-5 text-gray-900" />
          </button>
        </div>

        {filteredNodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            nodeLabel={(node: any) => {
              // Simplified tooltip: just title and visit count
              return `${node.name}\nVisits: ${node.visitCount}`
            }}
            nodeColor={(node: any) => node.color}
            nodeVal={(node: any) => {
              // Check if node is connected (has any edges)
              const isConnected = graphData.links.some((link: any) => {
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source
                const targetId = typeof link.target === 'object' ? link.target.id : link.target
                return sourceId === node.id || targetId === node.id
              })
              
              const baseSize = 6 // Increased base size from 4
              const sizeFactor = Math.log(node.visitCount + 1) * 4 // Increased factor
              const calculatedSize = Math.max(baseSize, Math.min(baseSize + sizeFactor, 24)) // Increased max size
              
              // Isolated nodes get 250% size boost for strong visibility
              return isConnected ? calculatedSize : calculatedSize * 3.5
            }}
            nodeRelSize={8}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.label
              const fontSize = 12 / globalScale // Increased font size
              ctx.font = `${fontSize}px 'Breeze Sans', Sans-Serif`
              
              // Check if node is connected
              const isConnected = graphData.links.some((link: any) => {
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source
                const targetId = typeof link.target === 'object' ? link.target.id : link.target
                return sourceId === node.id || targetId === node.id
              })
              
              const baseSize = node.__bckgDimensions ? node.__bckgDimensions[0] : 6
              // Apply size boost for isolated nodes in rendering
              const size = isConnected ? baseSize : baseSize * 1.5
              const isSelected = selectedNodesForLink.includes(node.id)
              
              // Draw node circle with larger size
              ctx.beginPath()
              ctx.arc(node.x, node.y, size * 1.5, 0, 2 * Math.PI, false)
              ctx.fillStyle = isSelected ? '#0072de' : node.color
              ctx.fill()
              
              // Draw border (thicker for selected nodes)
              ctx.strokeStyle = isSelected ? '#FFFFFF' : '#ffffff'
              ctx.lineWidth = isSelected ? 4 / globalScale : 2 / globalScale
              ctx.stroke()
              
              // Draw selection ring for selected nodes
              if (isSelected) {
                ctx.beginPath()
                ctx.arc(node.x, node.y, size * 2, 0, 2 * Math.PI, false)
                ctx.strokeStyle = '#0072de'
                ctx.lineWidth = 2 / globalScale
                ctx.setLineDash([5 / globalScale, 5 / globalScale])
                ctx.stroke()
                ctx.setLineDash([])
              }
              
              // Only draw labels when zoomed in enough (>1.5x) and labels are enabled
              if (showLabels && globalScale > 1.2) { // Show labels sooner (1.2x instead of 1.5x)
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillStyle = '#1f2937'
                ctx.fillText(label, node.x, node.y + (size * 1.5) + 5)
              }
            }}
            nodeCanvasObjectMode={() => 'replace'}
            linkWidth={(link: any) => link.isManual ? 2 : Math.max(0.5, link.value * 2)} // Thicker links
            linkColor={(link: any) => link.isManual ? '#0072de' : '#cbd5e1'}
            linkLineDash={(link: any) => link.isManual ? [5, 5] : null}
            linkDirectionalParticles={0}
            onNodeClick={handleNodeClick}
            onNodeHover={null}
            cooldownTicks={150}
            dagMode={null}
            d3VelocityDecay={0.3} // Increased decay for more stable layout
            d3AlphaDecay={0.02} // Slower cooling for better initial layout
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              drawClusterBoundaries(ctx, globalScale)
            }}
            onEngineStop={() => {
              // Only auto-fit on initial load, not after user interactions
              if (graphRef.current && !hasUserInteractedRef.current) {
                graphRef.current.zoomToFit(400, 50)
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
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400 font-sans">
              No nodes match current filters
            </p>
          </div>
        )}
      </div>

      {/* Explanation Panel - Compact for Sidepanel */}
      {showExplanations && graph && (
        <div className="absolute top-16 right-2 w-80 max-h-96 bg-white rounded-lg shadow-xl border overflow-hidden flex flex-col z-50"
             style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b bg-blue-50" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="font-semibold text-xs" style={{ fontFamily: "'Breeze Sans'", color: '#080A0B' }}>
              📊 Connection Explanations
            </h3>
            <button 
              onClick={() => setShowExplanations(false)}
              className="text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          
          <div className="overflow-y-auto p-2 space-y-2 text-[10px]" style={{ fontFamily: "'Breeze Sans'" }}>
            {Array.from(new Set(graph.nodes.map(n => n.cluster))).slice(0, 3).map(clusterId => {
              const clusterNodes = graph.nodes.filter(n => n.cluster === clusterId)
              if (clusterNodes.length < 2) return null
              
              const clusterEdges = graph.edges.filter(e => {
                const sourceNode = graph.nodes.find(n => n.id === e.source)
                const targetNode = graph.nodes.find(n => n.id === e.target)
                return sourceNode?.cluster === clusterId && targetNode?.cluster === clusterId
              }).slice(0, 3)
              
              if (clusterEdges.length === 0) return null
              
              const clusterLabel = generateClusterLabel(graph.nodes, clusterId)
              const clusterColor = getClusterColor(clusterId)
              
              return (
                <div key={clusterId} className="border rounded" style={{ borderColor: clusterColor + '40' }}>
                  <div className="px-2 py-1.5" style={{ backgroundColor: clusterColor + '10' }}>
                    <div className="font-semibold" style={{ color: clusterColor }}>
                      {clusterLabel}
                    </div>
                  </div>
                  
                  <div className="p-2 space-y-1.5">
                    {clusterEdges.map((edge, idx) => {
                      const breakdown = edge.breakdown
                      if (!breakdown) return null
                      
                      return (
                        <div key={idx} className="pb-1.5 border-b last:border-0" style={{ borderColor: '#f3f4f6' }}>
                          <div className="space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-gray-600">🧠 Semantic</span>
                              <span className="font-mono font-semibold" style={{ color: clusterColor }}>
                                {(breakdown.embedding * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">🔤 Keywords</span>
                              <span className="font-mono font-semibold" style={{ color: clusterColor }}>
                                {(breakdown.keyword * 100).toFixed(0)}%
                              </span>
                            </div>
                            {breakdown.sameDomain && (
                              <div className="flex justify-between text-blue-600">
                                <span>🌐 Same domain</span>
                                <span className="font-mono font-semibold">+{((breakdown.domainBoost - 1) * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="text-center text-gray-400 pt-1">
              Open full view for complete details
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
