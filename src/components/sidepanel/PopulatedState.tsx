import { X, Search, ChevronDown, Settings, ArrowLeft, ExternalLink, MoreVertical, ExternalLinkIcon, Copy, Trash2, EyeOff, Folder, Calendar, Tag, Edit2, Clock, Bell, BellOff, Check, Focus } from "lucide-react"
import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import type { PageEvent } from "~/types/page-event"
import type { Session } from "~/types/session"
import type { Label } from "~/background/labelsStore"
import type { Project } from "~/types/project"
import type { KnowledgeGraph, GraphNode } from "~/lib/knowledge-graph"
import { generateClusterLabel, getClusterColor } from "~/lib/knowledge-graph"
import { CoiPanel } from "./CoiPanel"
import { GraphPanel } from "./GraphPanel"
import { FocusPanel } from "./FocusPanel"
import { ProjectsPanel } from "./ProjectPanel"
import type { AppSettings } from "~/types/settings"
import { DEFAULT_SETTINGS, getSensitivityThreshold } from "~/types/settings"
import { SettingsModal } from "./SettingsModal"
import { log, warn } from "~/lib/logger"

// Mock filter data - will be fetched from API
const MOCK_FILTERS = [
  { id: 1, label: "Development" },
  { id: 2, label: "Research" },
  { id: 3, label: "Shoes" },
  { id: 4, label: "Humanities Co..." },
  { id: 5, label: "Technology" },
  { id: 6, label: "Design" },
  { id: 7, label: "Business" },
  { id: 8, label: "Marketing" },
]

type SearchResult = {
  pageEvent: PageEvent
  score: number
  layer: "ML" | "Semantic" | "Keyword"
}

async function sendMessage<T>(message: any): Promise<T> {
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

const isNewTabUrl = (url?: string) => {
  if (!url) return true
  const normalized = url.toLowerCase()
  return normalized.startsWith("chrome://newtab") || normalized.startsWith("edge://newtab") || normalized === "about:blank"
}

interface PopulatedStateProps {
  onShowEmpty?: () => void
  initialTab?: string
}

export function PopulatedState({ onShowEmpty, initialTab }: PopulatedStateProps) {
  const [activeTab, setActiveTab] = useState<"sessions" | "graph" | "projects" | "focus">(
    (initialTab as "sessions" | "graph" | "projects" | "focus") || "sessions"
  )
  const [sessions, setSessions] = useState<Session[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [currentPage, setCurrentPage] = useState<{ url: string; title: string } | null>(null)
  const [quickAddRequest, setQuickAddRequest] = useState<{ url: string; title: string } | null>(null)
  const [showCurrentPage, setShowCurrentPage] = useState(false)

  // Update activeTab when initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as "sessions" | "graph" | "projects" | "focus")
    }
  }, [initialTab])

  useEffect(() => {
    chrome.storage.local.get("sidepanel-add-current-page", (result) => {
      const pending = result["sidepanel-add-current-page"] as { url?: string; title?: string } | undefined
      if (pending?.url && !isNewTabUrl(pending.url)) {
        setQuickAddRequest({ url: pending.url, title: pending.title || pending.url })
        setActiveTab("projects")
      }
      if (pending) {
        chrome.storage.local.remove("sidepanel-add-current-page")
      }
      fetchCurrentTab()
    })
  }, [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandFilters, setExpandFilters] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<number | null>(null)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [timelineView, setTimelineView] = useState<"sessions" | "clusters">("sessions")
  const [clusters, setClusters] = useState<KnowledgeGraph | null>(null)
  const [expandedDays, setExpandedDays] = useState<string[]>(["today"])
  const [expandedSessions, setExpandedSessions] = useState<string[]>([])
  const [expandedProjects, setExpandedProjects] = useState<string[]>([])
  const [expandedClusterDays, setExpandedClusterDays] = useState<string[]>(["today"])
  const [expandedClusters, setExpandedClusters] = useState<number[]>([])
  const [showAddLabelModal, setShowAddLabelModal] = useState(false)
  const [newLabelName, setNewLabelName] = useState("")
  const [newLabelColor, setNewLabelColor] = useState("#3B82F6")
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [candidatesCount, setCandidatesCount] = useState(0)
  const [expandedSettingsSections, setExpandedSettingsSections] = useState<string[]>(['project-detection', 'privacy', 'notifications', 'developer', 'ui', 'about'])
  const [newExcludedDomain, setNewExcludedDomain] = useState("")
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const tabScrollRef = useRef<HTMLDivElement | null>(null)
  const labelsScrollRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [canScrollLabelsLeft, setCanScrollLabelsLeft] = useState(false)
  const [canScrollLabelsRight, setCanScrollLabelsRight] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  const fetchCurrentTab = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab?.url && !isNewTabUrl(tab.url)) {
        setCurrentPage({ url: tab.url, title: tab.title || tab.url })
      } else {
        setCurrentPage(null)
      }
    })
  }

  const checkTabScroll = () => {
    if (tabScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabScrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5)
    }
  }

  const checkLabelsScroll = useCallback(() => {
    if (labelsScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = labelsScrollRef.current
      setCanScrollLabelsLeft(scrollLeft > 0)
      setCanScrollLabelsRight(scrollLeft < scrollWidth - clientWidth - 5)
    }
  }, [])

  useEffect(() => {
    checkTabScroll()
    checkLabelsScroll()
    
    const tabScrollContainer = tabScrollRef.current
    const labelsScrollContainer = labelsScrollRef.current
    let rafId: number | null = null
    let scrollCheckRafId: number | null = null
    
    // Define handleResize before it's used
    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        checkTabScroll()
        checkLabelsScroll()
      })
    }
    
    // Tab scroll listener
    if (tabScrollContainer) {
      tabScrollContainer.addEventListener('scroll', checkTabScroll)
    }
    
    // Labels scroll listeners
    if (labelsScrollContainer) {
      const handleScroll = () => {
        if (scrollCheckRafId) cancelAnimationFrame(scrollCheckRafId)
        scrollCheckRafId = requestAnimationFrame(() => {
          checkLabelsScroll()
        })
      }
      
      labelsScrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      
      // Add resize listener
      window.addEventListener('resize', handleResize)
      
      // Cleanup for this effect
      return () => {
        if (tabScrollContainer) {
          tabScrollContainer.removeEventListener('scroll', checkTabScroll)
        }
        labelsScrollContainer.removeEventListener('scroll', handleScroll)
        if (rafId) cancelAnimationFrame(rafId)
        if (scrollCheckRafId) cancelAnimationFrame(scrollCheckRafId)
        window.removeEventListener('resize', handleResize)
      }
    }
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      if (tabScrollContainer) {
        tabScrollContainer.removeEventListener('scroll', checkTabScroll)
      }
      if (rafId) cancelAnimationFrame(rafId)
      if (scrollCheckRafId) cancelAnimationFrame(scrollCheckRafId)
      window.removeEventListener('resize', handleResize)
    }
  }, [checkLabelsScroll])

  const scroll = (direction: 'left' | 'right') => {
    if (tabScrollRef.current) {
      const scrollAmount = 150
      tabScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
      setTimeout(checkTabScroll, 300)
    }
  }

  const scrollLabels = (direction: 'left' | 'right') => {
    if (labelsScrollRef.current) {
      const scrollAmount = 200
      labelsScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
      // Check scroll state immediately and again after animation completes
      checkLabelsScroll()
      setTimeout(checkLabelsScroll, 350)
    }
  }

  const scrollTabToCenter = (tabName: string) => {
    if (tabScrollRef.current) {
      const buttons = tabScrollRef.current.querySelectorAll('button')
      let targetButton: Element | null = null
      
      buttons.forEach((btn) => {
        if (tabName === 'sessions' && btn.textContent?.includes('Timeline')) {
          targetButton = btn
        } else if (tabName === 'graph' && btn.textContent?.includes('Knowledge')) {
          targetButton = btn
        } else if (tabName === 'projects' && btn.textContent?.includes('Projects')) {
          targetButton = btn
        } else if (tabName === 'focus' && btn.textContent?.includes('Focus')) {
          targetButton = btn
        }
      })

      if (targetButton) {
        const container = tabScrollRef.current
        const containerWidth = container.clientWidth
        const buttonLeft = (targetButton as HTMLElement).offsetLeft
        const buttonWidth = (targetButton as HTMLElement).offsetWidth
        const scrollTarget = buttonLeft - (containerWidth / 2) + (buttonWidth / 2)

        container.scrollTo({
          left: Math.max(0, scrollTarget),
          behavior: 'smooth'
        })
        setTimeout(checkTabScroll, 300)
      }
    }
  }

  useEffect(() => {
    scrollTabToCenter(activeTab)
  }, [activeTab])

  useEffect(() => {
    if (activeTab === "projects") {
      fetchCurrentTab()
    }
  }, [activeTab])

  useEffect(() => {
    // Initial load of sessions
    let isInitialLoad = true
    const loadSessions = () => {
      sendMessage<{ sessions: Session[] }>({ type: "GET_SESSIONS" })
        .then((res) => {
          const loadedSessions = res?.sessions ?? []
          setSessions(loadedSessions)
          // Only expand all sessions on initial load, not on subsequent polls
          if (isInitialLoad) {
            setExpandedSessions(loadedSessions.map((s) => s.id))
            isInitialLoad = false
          }
        })
        .catch((err) => {
          console.error("Failed to load sessions:", err)
          setError("Failed to load sessions")
        })
    }

    // Load labels once
    const loadLabels = () => {
      sendMessage<{ labels: Label[] }>({ type: "GET_LABELS" })
        .then((res) => {
          setLabels(res?.labels ?? [])
        })
        .catch((err) => {
          console.error("Failed to load labels:", err)
        })
    }

    // Load clusters from knowledge graph
    const loadClusters = () => {
      sendMessage<{ graph: KnowledgeGraph }>({ type: "REFRESH_GRAPH" })
        .then((res) => {
          if (res?.graph) {
            setClusters(res.graph)
          }
        })
        .catch((err) => {
          console.error("Failed to load clusters:", err)
        })
    }

    loadLabels()

    // Load projects
    const loadProjects = () => {
      sendMessage<{ projects: Project[] }>({ type: "GET_PROJECTS" })
        .then((res) => {
          setProjects(res?.projects ?? [])
        })
        .catch((err) => {
          console.error("Failed to load projects:", err)
        })
    }

    loadSessions()
    loadProjects()
    loadLabels()
    if (timelineView === "clusters") {
      loadClusters()
    }

    // Poll for session, project, and label updates
    // Sessions/Clusters: 2 sec interval (fast), Projects/Labels: 2 sec interval
    const sessionsPollInterval = setInterval(() => {
        if (activeTab === "sessions") {
            if (timelineView === "sessions") {
              loadSessions()
            } else if (timelineView === "clusters") {
              loadClusters()
            }
        }
    }, 2000) // 2 seconds - fast updates when sidebar open

    const otherPollInterval = setInterval(() => {
        if (activeTab === "projects") {
            loadProjects()
        }
        // Load labels on every poll
        loadLabels()
    }, 2000)

    // Cleanup: stop polling on unmount
    return () => {
      clearInterval(sessionsPollInterval)
      clearInterval(otherPollInterval)
    }
  }, [activeTab, timelineView])

  // Reload clusters when switching to clusters view and expand all by default
  useEffect(() => {
    if (activeTab === "sessions" && timelineView === "clusters") {
      sendMessage<{ graph: KnowledgeGraph }>({ type: "REFRESH_GRAPH" })
        .then((res) => {
          if (res?.graph) {
            setClusters(res.graph)
            // Expand all clusters by default
            if (res.graph.nodes && res.graph.nodes.length > 0) {
              const clusterIds = Array.from(new Set(res.graph.nodes.map(n => n.cluster)))
              setExpandedClusters(clusterIds)
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load clusters:", err)
        })
    }
  }, [timelineView, activeTab])

  // Load settings on mount
  useEffect(() => {
    sendMessage<{ settings: AppSettings | null }>({ type: "GET_SETTINGS" })
      .then((res) => {
        console.log('[Settings] Loaded settings from storage:', res?.settings)
        if (res?.settings) {
          setSettings(res.settings)
        } else {
          // No settings found, use defaults and save them
          console.log('[Settings] No settings found, using defaults')
          const defaults = { ...DEFAULT_SETTINGS }
          setSettings(defaults)
          sendMessage({ type: "UPDATE_SETTINGS", payload: { settings: defaults } })
        }
      })
      .catch((err) => {
        console.error("Failed to load settings:", err)
      })

    // Load candidates count
    sendMessage<{ count: number }>({ type: "GET_CANDIDATES_COUNT" })
      .then((res) => {
        setCandidatesCount(res?.count || 0)
      })
      .catch((err) => {
        console.error("Failed to load candidates count:", err)
      })
  }, [])

  // Save settings whenever they change
  const updateSettings = useCallback((newSettings: AppSettings) => {
    console.log('[Settings] Updating settings:', newSettings)
    setSettings(newSettings)
    sendMessage({ type: "UPDATE_SETTINGS", payload: { settings: newSettings } })
      .catch((err) => {
        console.error("Failed to save settings:", err)
      })
  }, [])

  // Apply dark mode
  useEffect(() => {
    console.log('[Dark Mode] settings.ui.darkMode:', settings.ui.darkMode)
    if (settings.ui.darkMode) {
      console.log('[Dark Mode] Adding dark class')
      document.documentElement.classList.add('dark')
      setIsDarkMode(true)
    } else {
      console.log('[Dark Mode] Removing dark class')
      document.documentElement.classList.remove('dark')
      setIsDarkMode(false)
    }
  }, [settings.ui.darkMode])

  const pages = useMemo(() => {
    return sessions.flatMap((s) => s.pages)
  }, [sessions])

  // Group real sessions by date (infinite menu)
  const realSessionsByDay = useMemo(() => {
    const grouped: Map<string, { sessions: Session[]; date: Date; label: string }> = new Map()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Filter sessions by selected label if one is chosen
    const filteredSessions = selectedLabelId 
      ? sessions.filter((s) => s.labelId === selectedLabelId)
      : sessions

    filteredSessions.forEach((session) => {
      const sessionDate = new Date(session.startTime)
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate())
      const dateKey = sessionDay.toISOString().split('T')[0] // YYYY-MM-DD

      if (!grouped.has(dateKey)) {
        // Generate label: "Today - Monday, December 30" or "Yesterday - Sunday, December 29" or "Monday, December 28"
        let label = ''
        if (sessionDay.getTime() === today.getTime()) {
          const dayName = sessionDay.toLocaleString('en-US', { weekday: 'long' })
          const dateStr = sessionDay.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          label = `Today - ${dayName}, ${dateStr}`
        } else if (sessionDay.getTime() === yesterday.getTime()) {
          const dayName = sessionDay.toLocaleString('en-US', { weekday: 'long' })
          const dateStr = sessionDay.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          label = `Yesterday - ${dayName}, ${dateStr}`
        } else {
          const dayName = sessionDay.toLocaleString('en-US', { weekday: 'long' })
          const dateStr = sessionDay.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          label = `${dayName}, ${dateStr}`
        }

        grouped.set(dateKey, { sessions: [], date: sessionDay, label })
      }

      grouped.get(dateKey)!.sessions.push(session)
    })

    // Sort by date descending (newest first), and sort sessions within each day by startTime descending
    return Array.from(grouped.entries())
      .sort(([, a], [, b]) => b.date.getTime() - a.date.getTime())
      .map(([, data]) => ({
        ...data,
        sessions: data.sessions.sort((a, b) => b.startTime - a.startTime)
      }))
  }, [sessions, selectedLabelId])

  // Group clusters by date
  const clustersByDay = useMemo(() => {
    if (!clusters || !clusters.nodes || clusters.nodes.length === 0) {
      return []
    }

    const grouped: Map<string, { clusters: Map<number, { nodes: GraphNode[]; timestamp: number }>; date: Date; label: string }> = new Map()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Group nodes by cluster ID
    const clusterMap = new Map<number, GraphNode[]>()
    clusters.nodes.forEach((node) => {
      if (!clusterMap.has(node.cluster)) {
        clusterMap.set(node.cluster, [])
      }
      clusterMap.get(node.cluster)!.push(node)
    })

    // For each cluster, find the most recent timestamp and group by date
    clusterMap.forEach((nodes, clusterId) => {
      // Get the most recent timestamp from nodes in this cluster (with validation)
      const validTimestamps = nodes
        .map(n => {
          const ts = n.timestamp || Date.now()
          // Validate timestamp is a valid number
          return !isNaN(ts) && ts > 0 ? ts : Date.now()
        })
      const latestTimestamp = Math.max(...validTimestamps)
      const clusterDate = new Date(latestTimestamp)
      
      // Validate the date is valid before using it
      if (isNaN(clusterDate.getTime())) {
        console.warn("Invalid cluster date, using current time", latestTimestamp)
        clusterDate.setTime(Date.now())
      }
      
      const clusterDay = new Date(clusterDate.getFullYear(), clusterDate.getMonth(), clusterDate.getDate())
      const dateKey = clusterDay.toISOString().split('T')[0]

      if (!grouped.has(dateKey)) {
        let label = ''
        if (clusterDay.getTime() === today.getTime()) {
          const dayName = clusterDay.toLocaleString('en-US', { weekday: 'long' })
          const dateStr = clusterDay.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          label = `Today - ${dayName}, ${dateStr}`
        } else if (clusterDay.getTime() === yesterday.getTime()) {
          const dayName = clusterDay.toLocaleString('en-US', { weekday: 'long' })
          const dateStr = clusterDay.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          label = `Yesterday - ${dayName}, ${dateStr}`
        } else {
          const dayName = clusterDay.toLocaleString('en-US', { weekday: 'long' })
          const dateStr = clusterDay.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          label = `${dayName}, ${dateStr}`
        }

        grouped.set(dateKey, { clusters: new Map(), date: clusterDay, label })
      }

      grouped.get(dateKey)!.clusters.set(clusterId, { nodes, timestamp: latestTimestamp })
    })

    // Sort by date descending (newest first)
    return Array.from(grouped.entries())
      .sort(([, a], [, b]) => b.date.getTime() - a.date.getTime())
      .map(([, data]) => ({
        ...data,
        clusters: Array.from(data.clusters.entries())
          .sort(([, a], [, b]) => b.timestamp - a.timestamp)
          .map(([clusterId, clusterData]) => ({
            clusterId,
            nodes: clusterData.nodes,
            timestamp: clusterData.timestamp
          }))
      }))
  }, [clusters])

  const handleSearch = async (value: string) => {
    setSearchQuery(value)
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    if (!value.trim()) {
      setResults([])
      return
    }

    // Set loading state immediately
    setLoading(true)
    setError(null)
    
    // Debounce: wait 300ms before searching
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await sendMessage<{ results: SearchResult[] }>({
          type: "SEARCH_QUERY",
          payload: { query: value }
        })
        setResults(res?.results ?? [])
      } catch (err) {
        console.error("Search failed:", err)
        setError("Search failed")
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const handleClose = () => {
    // Send message to content scripts before closing
    log("Sidepanel sending SIDEPANEL_CLOSED message")
    chrome.runtime.sendMessage({ type: "SIDEPANEL_CLOSED" })
    // Also set localStorage as fallback
    localStorage.setItem("aegis-sidebar-closed", "true")
    window.close()
  }

  const handleAddLabel = async () => {
    if (!newLabelName.trim()) return
    try {
      const res = await sendMessage<{ label: Label }>({
        type: "ADD_LABEL",
        payload: { name: newLabelName, color: newLabelColor }
      })
      if (res?.label) {
        setLabels((prev) => [res.label, ...prev])
        setNewLabelName("")
        setNewLabelColor("#3B82F6")
        setShowAddLabelModal(false)
      }
    } catch (err) {
      console.error("Failed to add label:", err)
    }
  }

  const handleDeleteLabel = async (labelId: string) => {
    if (!window.confirm("Delete this label? Sessions with this label will no longer have it assigned.")) {
      return
    }
    try {
      await sendMessage<{ success: boolean }>({
        type: "DELETE_LABEL",
        payload: { labelId }
      })
      setLabels(labels.filter((l) => l.id !== labelId))
      // Clear filter if deleted label was selected
      if (selectedLabelId === labelId) {
        setSelectedLabelId(null)
      }
    } catch (err) {
      console.error("Failed to delete label:", err)
    }
  }

  const handleClearAllSessions = async () => {
    if (!window.confirm("Are you sure you want to delete all sessions? This action cannot be undone.")) {
      return
    }
    try {
      await sendMessage<{ success: boolean }>({
        type: "CLEAR_ALL_SESSIONS"
      })
      setSessions([])
      setSelectedLabelId(null)
      setExpandedDays([])
      setExpandedSessions([])
    } catch (err) {
      console.error("Failed to clear sessions:", err)
    }
  }



  const handleExportData = async () => {
    try {
      const res = await sendMessage<{ data: any }>({ type: "EXPORT_ALL_DATA" })
      if (res?.data) {
        const jsonString = JSON.stringify(res.data, null, 2)
        const blob = new Blob([jsonString], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `konta-export-${new Date().getTime()}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Failed to export data:", err)
    }
  }

  const handleImportData = async () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)
        
        if (!window.confirm("Import this data? This will merge with existing data.")) {
          return
        }

        await sendMessage({ type: "IMPORT_DATA", payload: { data } })
        
        // Reload everything
        window.location.reload()
      } catch (err) {
        console.error("Failed to import data:", err)
        alert("Failed to import data. Please check the file format.")
      }
    }
    input.click()
  }

  const handleClearAllProjects = async () => {
    if (!window.confirm("Are you sure you want to delete all projects? This action cannot be undone.")) {
      return
    }
    try {
      await sendMessage<{ success: boolean }>({ type: "CLEAR_ALL_PROJECTS" })
      setProjects([])
    } catch (err) {
      console.error("Failed to clear projects:", err)
    }
  }

  const handleClearAllData = async () => {
    if (!window.confirm("⚠️ WARNING: This will delete ALL data including sessions, projects, labels, and settings. This action cannot be undone. Are you absolutely sure?")) {
      return
    }
    try {
      await sendMessage<{ success: boolean }>({ type: "CLEAR_ALL_DATA" })
      // Reload to reset state
      window.location.reload()
    } catch (err) {
      console.error("Failed to clear all data:", err)
    }
  }

  const handleResetAllSettings = async () => {
    if (!window.confirm("Reset all settings to defaults? This will clear cache and restore default settings.")) {
      return
    }
    try {
      await sendMessage<{ success: boolean }>({ type: "RESET_ALL_SETTINGS" })
      setSettings(DEFAULT_SETTINGS)
      alert("Settings reset successfully. Extension may need to reload.")
    } catch (err) {
      console.error("Failed to reset settings:", err)
    }
  }

  const handleAddExcludedDomain = () => {
    if (!newExcludedDomain.trim()) return
    
    const domain = newExcludedDomain.trim().toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/.*$/, '')
    
    if (settings.privacy.excludedDomains.includes(domain)) {
      alert("Domain already excluded")
      return
    }

    updateSettings({
      ...settings,
      privacy: {
        ...settings.privacy,
        excludedDomains: [...settings.privacy.excludedDomains, domain]
      }
    })
    setNewExcludedDomain("")
  }

  const handleRemoveExcludedDomain = (domain: string) => {
    updateSettings({
      ...settings,
      privacy: {
        ...settings.privacy,
        excludedDomains: settings.privacy.excludedDomains.filter(d => d !== domain)
      }
    })
  }

  const toggleSettingsSection = (section: string) => {
    setExpandedSettingsSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    )
  }

  const handleReloadExtension = () => {
    if (window.confirm("Reload extension? This will close all extension pages.")) {
      chrome.runtime.reload()
    }
  }

  const MAX_OPEN_TABS = 10
  const openAllResults = () => {
    if (!results.length) return
    const count = results.length
    const toOpen = results.slice(0, MAX_OPEN_TABS)
    const needsConfirm = count > MAX_OPEN_TABS
    if (needsConfirm) {
      const ok = window.confirm(
        `Open ${count} tabs? For safety, only the first ${MAX_OPEN_TABS} will be opened.`
      )
      if (!ok) return
    }
    toOpen.forEach(({ pageEvent }) => {
      const raw = pageEvent.url || ""
      const url = raw.startsWith("http") ? raw : `https://${raw}`
      try {
        chrome.tabs.create({ url })
      } catch (e) {
        console.error("Failed to open tab:", url, e)
      }
    })
  }



  return (
    <div className="relative h-full flex flex-col bg-white dark:bg-[#1C1C1E]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b bg-white dark:bg-[#1C1C1E] border-[#E5E5E5] dark:border-[#3A3A3C]">
        <div className="flex items-center gap-3">
          <img src={chrome.runtime.getURL(isDarkMode ? 'assets/konta_logo_dark.svg' : 'assets/konta_logo.svg')} alt="Konta" className="w-8 h-8" />
          <h1 
            className="text-xl font text-[#080A0B] dark:text-[#FFFFFF]"
            style={{ fontFamily: "'Breeze Sans'" }}>
            Konta
          </h1>
        </div>
        
        {/* Dark Mode Toggle & Settings */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateSettings({
              ...settings,
              ui: { ...settings.ui, darkMode: !settings.ui.darkMode }
            })}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none text-[#9A9FA6] dark:text-[#9A9FA6]"
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}>
            {isDarkMode ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            <span className="sr-only">Toggle dark mode</span>
          </button>
          
          <button
            onClick={() => setShowSettingsModal(true)}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none text-[#9A9FA6] dark:text-[#9A9FA6]">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
          </button>
        </div>
      </div>

      {/* COI Panel - Show when developer setting is enabled */}
      {settings.developer.showCoiPanel && (
        <div className="px-3 pt-2">
          <CoiPanel sessions={sessions} isDarkMode={settings.ui.darkMode} />
        </div>
      )}

      {/* Tabs with Navigation Arrows */}
      <div className="flex items-center border-b gap-1 px-2 border-[#E5E5E5] dark:border-[#3A3A3C]">
        {/* Left Arrow */}
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className="flex-shrink-0 p-1.5 transition-colors rounded hover:bg-gray-100 dark:hover:bg-[#2C2C2E] disabled:opacity-30 disabled:cursor-not-allowed text-[#9A9FA6]">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Tabs Container */}
        <div 
          ref={tabScrollRef}
          className="overflow-x-hidden flex-1"
          style={{
            scrollBehavior: 'smooth'
          }}>
          <div className="flex gap-1 pt-3 pb-0 whitespace-nowrap">
            <button
              onClick={() => setActiveTab("sessions")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg flex-shrink-0 ${
                activeTab === "sessions" ? "" : "opacity-60"
              }`}
              style={{
                backgroundColor: activeTab === "sessions" ? (isDarkMode ? '#1C1C1E' : 'white') : "transparent",
                color: activeTab === "sessions" ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#FFFFFF' : '#64748b'),
                borderBottom: activeTab === "sessions" ? `2px solid ${isDarkMode ? '#3e91ff' : '#0072de'}` : "none",
                fontFamily: "'Breeze Sans'"
              }}>
              Timeline
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg flex-shrink-0 ${
                activeTab === "graph" ? "" : "opacity-60"
              }`}
              style={{
                backgroundColor: activeTab === "graph" ? (isDarkMode ? '#1C1C1E' : 'white') : "transparent",
                color: activeTab === "graph" ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#FFFFFF' : '#64748b'),
                borderBottom: activeTab === "graph" ? `2px solid ${isDarkMode ? '#3e91ff' : '#0072de'}` : "none",
                fontFamily: "'Breeze Sans'"
              }}>
              Knowledge Graph
            </button>
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg flex-shrink-0 ${
                activeTab === "projects" ? "" : "opacity-60"
              }`}
              style={{
                backgroundColor: activeTab === "projects" ? (isDarkMode ? '#1C1C1E' : 'white') : "transparent",
                color: activeTab === "projects" ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#FFFFFF' : '#64748b'),
                borderBottom: activeTab === "projects" ? `2px solid ${isDarkMode ? '#3e91ff' : '#0072de'}` : "none",
                fontFamily: "'Breeze Sans'"
              }}>
              Projects
            </button>
            <button
              onClick={() => setActiveTab("focus")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg flex-shrink-0 ${
                activeTab === "focus" ? "" : "opacity-60"
              }`}
              style={{
                backgroundColor: activeTab === "focus" ? (isDarkMode ? '#1C1C1E' : 'white') : "transparent",
                color: activeTab === "focus" ? (isDarkMode ? '#3e91ff' : '#0072de') : (isDarkMode ? '#FFFFFF' : '#64748b'),
                borderBottom: activeTab === "focus" ? `2px solid ${isDarkMode ? '#3e91ff' : '#0072de'}` : "none",
                fontFamily: "'Breeze Sans'"
              }}>
              Focus Mode
            </button>
          </div>
        </div>

        {/* Right Arrow */}
        <button
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className="flex-shrink-0 p-1.5 transition-colors rounded hover:bg-gray-100 dark:hover:bg-[#2C2C2E] disabled:opacity-30 disabled:cursor-not-allowed text-[#9A9FA6]">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className={`flex-1 flex flex-col gap-0 ${activeTab === "graph" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {activeTab === "graph" ? (
          <div className="w-full h-full">
            <GraphPanel />
          </div>
        ) : activeTab === "projects" ? (
            <ProjectsPanel 
              projects={projects} 
              sessions={sessions}
              expandedProjects={expandedProjects}
              onToggleProject={(projectId) => {
                setExpandedProjects((prev) =>
                  prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
                )
              }}
              onDetectProjects={async () => {
                try {
                  const response = await sendMessage<{ projects: Project[] }>({ 
                    type: "DETECT_PROJECTS" 
                  })
                  if (response?.projects) {
                    setProjects(response.projects)
                  }
                } catch (err) {
                  console.error("Failed to detect projects:", err)
                }
              }}
              onUpdateProject={async (projectId, updates) => {
                try {
                  await sendMessage({
                    type: "UPDATE_PROJECT",
                    payload: { projectId, updates }
                  })
                  // Reload projects
                  const response = await sendMessage<{ projects: Project[] }>({ 
                    type: "GET_PROJECTS" 
                  })
                  if (response?.projects) {
                    setProjects(response.projects)
                  }
                } catch (err) {
                  console.error("Failed to update project:", err)
                }
              }}
              onDeleteProject={async (projectId) => {
                try {
                  await sendMessage({
                    type: "DELETE_PROJECT",
                    payload: { projectId }
                  })  
                  // Reload projects
                  const response = await sendMessage<{ projects: Project[] }>({ 
                    type: "GET_PROJECTS" 
                  })
                  if (response?.projects) {
                    setProjects(response.projects)
                  }
                } catch (err) {
                  console.error("Failed to delete project:", err)
                }
              }}
              onProjectsUpdate={setProjects}
              currentPage={currentPage}
              quickAddRequest={quickAddRequest}
              onCompleteQuickAdd={() => setQuickAddRequest(null)}
              onRefreshCurrentPage={fetchCurrentTab}
            />
        ) : activeTab === "focus" ? (
          <FocusPanel />
        ) : (
          <>
        {/* Sticky Search Bar Only */}
        <div className="sticky top-0 z-20 bg-white dark:bg-[#1C1C1E] px-2 pt-4">
          {/* Back Button and Search Bar */}
          <div className="flex items-center gap-2 mb-5">
            {/* <button className="p-2" onClick={onShowEmpty} style={{ color: '#9A9FA6' }}>
              <ArrowLeft className="h-4 w-4" />
            </button> */}
            <div className="relative flex items-center gap-3 px-4 py-2.5 rounded-full flex-1 bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-transparent dark:border-[#3A3A3C]">
              <Search className="h-4 w-4 text-[#9A9FA6]" />
              <input
                type="text"
                placeholder="Search what you have seen before"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-[#080A0B] dark:text-[#FFFFFF]"
                style={{ fontFamily: "'Breeze Sans'" }}
              />
            </div>
          </div>
        </div>

        {/* Filters Section */}
        {!searchQuery.trim() && (
        <div className="sticky top-16 z-20 bg-white dark:bg-[#1C1C1E] px-2 pb-1">
          <div className="flex items-center gap-1.5">
            {/* Left Scroll Arrow */}
            <button
              onClick={() => scrollLabels('left')}
              disabled={!canScrollLabelsLeft}
              className="flex-shrink-0 p-1 transition-colors rounded hover:bg-gray-100 dark:hover:bg-[#2C2C2E] disabled:opacity-30 disabled:cursor-not-allowed text-[#9A9FA6]">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Labels Scroll Container */}
            <div 
              ref={labelsScrollRef}
              className="overflow-x-hidden flex-1"
              style={{ scrollBehavior: 'smooth' }}>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => {
                      setSelectedLabelId(selectedLabelId === label.id ? null : label.id)
                    }}
                    className="px-3 py-1.5 rounded-full text-2xs font-medium transition-all flex-shrink-0"
                    style={{
                      backgroundColor: selectedLabelId === label.id ? (label.color || '#000000') : (isDarkMode ? '#2C2C2E' : '#FFFFFF'),
                      color: selectedLabelId === label.id ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#000000'),
                      border: `1px solid ${label.color || (isDarkMode ? '#3A3A3C' : '#000000')}`,
                      fontFamily: "'Breeze Sans'",
                      fontSize: '10px'
                    }}>
                    {label.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Scroll Arrow */}
            <button
              onClick={() => scrollLabels('right')}
              className="flex-shrink-0 p-1 transition-colors rounded hover:bg-gray-100 dark:hover:bg-[#2C2C2E] text-[#9A9FA6]">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Add Label Button - Icon Only */}
            <button
              onClick={() => setShowAddLabelModal(true)}
              className="flex-shrink-0 p-2 transition-all rounded-lg hover:bg-blue-50 dark:hover:bg-[#2C2C2E] active:bg-blue-100 dark:active:bg-[#3A3A3C] text-[#0074FB] dark:text-[#3e91ff]"
              title="Add label">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
        )}
            {/* dev: number of pages indexed */}
          {/* <div className="flex items-center justify-between px-1 text-xs" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
            <span>{pages.length} pages indexed</span>
          </div> */}
          {error && (
            <div className="mt-1 px-2 text-xs" style={{ color: '#b00020', fontFamily: "'Breeze Sans'" }}>
              {error}
            </div>
          )}



        {/* Search Results or Timeline */}
        {searchQuery.trim() ? (
          <div className="flex flex-col gap-2 p-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 rounded-full animate-bounce bg-[#0074FB] dark:bg-[#3e91ff]"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full animate-bounce bg-[#0074FB] dark:bg-[#3e91ff]"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full animate-bounce bg-[#0074FB] dark:bg-[#3e91ff]"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
                <p className="text-xs text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                  Searching...
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Search className="h-8 w-8 opacity-30 mb-2 text-[#9A9FA6]" />
                <p className="text-sm text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                  No results found.
                </p>
              </div>
            ) : null}
            {results.map((item, idx) => {
              const { pageEvent, score, layer } = item
              const opened = pageEvent.openedAt || pageEvent.timestamp
              const openedDate = new Date(opened)
              const openedText = `${String(openedDate.getDate()).padStart(2, '0')}/${String(openedDate.getMonth() + 1).padStart(2, '0')}/${openedDate.getFullYear()} ${String(openedDate.getHours()).padStart(2, '0')}:${String(openedDate.getMinutes()).padStart(2, '0')}:${String(openedDate.getSeconds()).padStart(2, '0')}`
              const faviconUrl = `https://www.google.com/s2/favicons?sz=16&domain=${new URL(pageEvent.url).hostname}`
              return (
                <div
                  key={`${pageEvent.url}-${opened}-${idx}`}
                  onClick={() => chrome.tabs.create({ url: pageEvent.url })}
                  className="flex flex-col gap-1 p-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-colors bg-[#FAFAFA] dark:bg-[#2C2C2E]"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <img 
                        src={faviconUrl} 
                        alt="favicon" 
                        className="w-4 h-4 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <div className="text-sm font-normal truncate text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        {pageEvent.title || pageEvent.url}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-2xs truncate flex-1" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
                      {pageEvent.url}
                    </div>
                    <div className="text-2xs flex-shrink-0" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
                      {openedText}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col p-0.5">
            {timelineView === "sessions" ? (
              // Sessions View
              <>
                {realSessionsByDay.length === 0 && selectedLabelId ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Tag className="h-8 w-8 opacity-30" style={{ color: '#9A9FA6' }} />
                    <p className="text-sm text-center" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
                      No sessions found with the label<br />
                      <span style={{ fontWeight: '500' }}>"{labels.find(l => l.id === selectedLabelId)?.name}"</span>
                    </p>
                  </div>
                ) : realSessionsByDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Clock className="h-8 w-8 opacity-30" style={{ color: '#9A9FA6' }} />
                    <p className="text-sm text-center" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
                      No sessions yet<br />
                      <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Start browsing to track activity</span>
                    </p>
                  </div>
                ) : (
                  realSessionsByDay.map((dayGroup, dayIndex) => (
                    <DaySection
                      key={dayGroup.label}
                      dayKey={dayGroup.label}
                      dayLabel={dayGroup.label}
                      sessions={dayGroup.sessions}
                      isExpanded={expandedDays.includes(dayGroup.label)}
                      onToggleDay={(key) => {
                        setExpandedDays((prev) =>
                          prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
                        )
                      }}
                      expandedSessions={expandedSessions}
                      onToggleSession={(id) => {
                        setExpandedSessions((prev) =>
                          prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
                        )
                      }}
                      labels={labels}
                      onUpdateSessionLabel={async (sessionId, labelId) => {
                        try {
                          await sendMessage<{ success: boolean }>({
                            type: "UPDATE_SESSION_LABEL",
                            payload: { sessionId, labelId }
                          })
                          // Update local state immediately and force re-render
                          setSessions(prev => {
                            const updated = prev.map(s => 
                              s.id === sessionId ? { ...s, labelId } : s
                            )
                            return [...updated]
                          })
                        } catch (err) {
                          console.error("Failed to update session label:", err)
                        }
                      }}
                      onDeleteLabel={handleDeleteLabel}
                      onOpenCreateLabelModal={() => setShowAddLabelModal(true)}
                      timelineView={timelineView}
                      onTimelineViewChange={setTimelineView}
                      isFirstDay={dayIndex === 0}
                      searchQuery={searchQuery}
                    />
                  ))
                )}
              </>
            ) : (
              // Clusters View
              <>
                {!clusters || clusters.nodes?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Folder className="h-8 w-8 opacity-30" style={{ color: '#9A9FA6' }} />
                    <p className="text-sm text-center" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
                      No clusters yet<br />
                      <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Start browsing to see patterns</span>
                    </p>
                    <button
                      onClick={() => setTimelineView("sessions")}
                      className="px-4 py-2 text-xs rounded-full transition-colors"
                      style={{
                        backgroundColor: isDarkMode ? '#3e91ff' : '#0072de',
                        color: '#FFFFFF',
                        fontFamily: "'Breeze Sans'",
                        fontWeight: 500
                      }}>
                      Back to Sessions
                    </button>
                  </div>
                ) : clustersByDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Folder className="h-8 w-8 opacity-30" style={{ color: '#9A9FA6' }} />
                    <p className="text-sm text-center" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
                      No clusters on this day<br />
                      <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Check another date</span>
                    </p>
                    <button
                      onClick={() => setTimelineView("sessions")}
                      className="px-4 py-2 text-xs rounded-full transition-colors"
                      style={{
                        backgroundColor: isDarkMode ? '#3e91ff' : '#0072de',
                        color: '#FFFFFF',
                        fontFamily: "'Breeze Sans'",
                        fontWeight: 500
                      }}>
                      Back to Sessions
                    </button>
                  </div>
                ) : (
                  clustersByDay.map((dayGroup, dayIndex) => (
                    <ClusterDaySection
                      key={dayGroup.label}
                      dayKey={dayGroup.label}
                      dayLabel={dayGroup.label}
                      clusters={dayGroup.clusters}
                      isExpanded={expandedClusterDays.includes(dayGroup.label)}
                      onToggleDay={(key) => {
                        setExpandedClusterDays((prev) =>
                          prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
                        )
                      }}
                      expandedClusters={expandedClusters}
                      onToggleCluster={(id) => {
                        setExpandedClusters((prev) =>
                          prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
                        )
                      }}
                      timelineView={timelineView}
                      onTimelineViewChange={setTimelineView}
                      isFirstDay={dayIndex === 0}
                      searchQuery={searchQuery}
                    />
                  ))
                )}
              </>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {/* Footer */}
      {/* <div className="sticky bottom-0 border-t bg-white dark:bg-[#1C1C1E] px-4 py-3 border-[#E5E5E5] dark:border-[#3A3A3C]">
        <button
          onClick={onShowEmpty}
          className="w-full text-xs opacity-70 transition-opacity hover:opacity-100 text-[#9A9FA6] dark:text-[#9A9FA6]"
          style={{ fontFamily: "'Breeze Sans'" }}>
          ← Back to empty state
        </button>
      </div> */}
      {showAddLabelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowAddLabelModal(false)}>
          <div className="bg-white dark:bg-[#2C2C2E] rounded-lg shadow-xl" style={{ width: '280px' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#E5E5E5] dark:border-[#3A3A3C]">
              <h2 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Create Label
              </h2>
            </div>
            
            {/* Content */}
            <div className="px-4 py-3">
              <div className="flex flex-col gap-2.5">
                <div>
                  <label className="text-xs font-medium block mb-1 text-[#4B5563] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="e.g. Development"
                    autoFocus
                    className="w-full px-2.5 py-1.5 border border-[#D1D5DB] dark:border-[#3A3A3C] rounded text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                    style={{ fontFamily: "'Breeze Sans'" }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newLabelName.trim()) {
                        handleAddLabel()
                      } else if (e.key === 'Escape') {
                        setShowAddLabelModal(false)
                      }
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-[#4B5563] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    className="w-8 h-8 border border-[#D1D5DB] dark:border-[#3A3A3C] rounded cursor-pointer"
                  />
                  <div className="text-xs text-[#9CA3AF] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>{newLabelColor}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t flex gap-2 justify-end border-[#E5E5E5] dark:border-[#3A3A3C] bg-[#F9FAFB] dark:bg-[#2C2C2E]">
              <button
                onClick={() => {
                  setShowAddLabelModal(false)
                  setNewLabelName("")
                  setNewLabelColor("#3B82F6")
                }}
                className="px-3 py-1.5 text-xs rounded transition-colors bg-white dark:bg-[#2C2C2E] text-[#6B7280] dark:text-[#FFFFFF] border-[#D1D5DB] dark:border-[#3A3A3C]"
                style={{
                  border: '1px solid',
                  fontFamily: "'Breeze Sans'",
                }}>
                Cancel
              </button>
              <button
                onClick={handleAddLabel}
                disabled={!newLabelName.trim()}
                className="px-3 py-1.5 text-xs rounded text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: newLabelName.trim() ? (isDarkMode ? '#3e91ff' : '#0072df') : '#9CA3AF',
                  fontFamily: "'Breeze Sans'",
                  fontWeight: 500
                }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        expandedSections={expandedSettingsSections}
        onToggleSection={toggleSettingsSection}
        sessionsCount={sessions.length}
        labelsCount={labels.length}
        pagesCount={pages.length}
        projectsCount={projects.length}
        candidatesCount={candidatesCount}
        onClearAllSessions={handleClearAllSessions}
        onClearAllProjects={handleClearAllProjects}
        onExportData={handleExportData}
        onImportData={handleImportData}
        onClearAllData={handleClearAllData}
        onResetAllSettings={handleResetAllSettings}
        onReloadExtension={handleReloadExtension}
        newExcludedDomain={newExcludedDomain}
        onNewExcludedDomainChange={setNewExcludedDomain}
        onAddExcludedDomain={handleAddExcludedDomain}
        onRemoveExcludedDomain={handleRemoveExcludedDomain}
      />
    </div>
  )
}

// Day Section Component (for actual sessions from IndexedDB)
interface DaySectionProps {
  dayKey: string
  dayLabel: string
  sessions: Session[]
  isExpanded: boolean
  onToggleDay: (key: string) => void
  expandedSessions: string[]
  onToggleSession: (id: string) => void
  labels: Label[]
  onUpdateSessionLabel: (sessionId: string, labelId: string | undefined) => Promise<void>
  onDeleteLabel: (labelId: string) => Promise<void>
  onOpenCreateLabelModal?: () => void
  timelineView?: "sessions" | "clusters"
  onTimelineViewChange?: (view: "sessions" | "clusters") => void
  isFirstDay?: boolean
  searchQuery?: string
  isDarkMode?: boolean
}

function DaySection({
  dayKey,
  dayLabel,
  sessions,
  isExpanded,
  onToggleDay,
  expandedSessions,
  onToggleSession,
  labels,
  onUpdateSessionLabel,
  onDeleteLabel,
  onOpenCreateLabelModal,
  timelineView,
  onTimelineViewChange,
  isFirstDay,
  searchQuery
}: DaySectionProps) {
  const isDarkMode = document.documentElement.classList.contains('dark')
  const visibleCount = isExpanded ? sessions.length : 3

  return (
    <div className="flex flex-col gap-1 pb-0 pt-1 p-2">
      {/* Day Header with View Toggle */}
      <div className="flex items-center justify-between px-2 pr-0 mb-1 mt-4">
        <div className="text-sm font-normal text-[#0072DF] dark:text-[#3e91ff]" style={{ fontFamily: "'Breeze Sans'" }}>
          <span>{dayLabel}</span>
        </div>
        {isFirstDay && !searchQuery && timelineView && onTimelineViewChange && (
          <div
            className="relative inline-flex items-center rounded-full p-0.5"
            style={{
              width: 130,
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
                transform: timelineView === 'clusters' ? 'translateX(100%)' : 'translateX(0)',
                backgroundColor: isDarkMode ? '#3e91ff' : '#0072de',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
              }}
            />

            <button
              onClick={() => onTimelineViewChange("sessions")}
              className="relative z-10 flex-1 text-xs py-1 rounded-full transition-colors"
              aria-pressed={timelineView === 'sessions'}
              style={{
                background: 'transparent',
                border: '0',
                color: timelineView === 'sessions' ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
                fontFamily: "'Breeze Sans'"
              }}
              title="Show sessions"
            >
              Sessions
            </button>

            <button
              onClick={() => onTimelineViewChange("clusters")}
              className="relative z-10 flex-1 text-xs py-1 rounded-full transition-colors"
              aria-pressed={timelineView === 'clusters'}
              style={{
                background: 'transparent',
                border: '0',
                color: timelineView === 'clusters' ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
                fontFamily: "'Breeze Sans'"
              }}
              title="Show clusters"
            >
              Clusters
            </button>
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex flex-col gap-3 pt-0 pb-1">
        {sessions.slice(0, visibleCount).map((session, index) => (
          <div
            key={session.id}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${index * 50}ms` }}>
            <SessionItem
              session={session}
              isExpanded={expandedSessions.includes(session.id)}
              onToggle={() => onToggleSession(session.id)}
              labels={labels}
              onUpdateSessionLabel={onUpdateSessionLabel}
              onDeleteLabel={onDeleteLabel}
              onOpenCreateLabelModal={onOpenCreateLabelModal}
            />
          </div>
        ))}
        {sessions.length > 3 && (
          <button
            onClick={() => onToggleDay(dayKey)}
            className="text-xs font-medium self-end px-3 py-0.5 rounded-lg transition-all hover:opacity-70 hover:scale-105"
            style={{
              color: 'var(--primary)',
              fontFamily: "'Breeze Sans'",
              backgroundColor: 'transparent'
            }}>
            {isExpanded ? "Less" : "More"}
          </button>
        )}
      </div>
    </div>
  )
}

// Session Item Component (for actual sessions from IndexedDB)
interface SessionItemProps {
  session: Session
  isExpanded: boolean
  onToggle: () => void
  labels: Label[]
  onUpdateSessionLabel: (sessionId: string, labelId: string | undefined) => void
  onDeleteLabel?: (labelId: string) => Promise<void>
  onOpenCreateLabelModal?: () => void
}

function SessionItem({ session, isExpanded, onToggle, labels, onUpdateSessionLabel, onDeleteLabel, onOpenCreateLabelModal }: SessionItemProps) {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [suggestedLabel, setSuggestedLabel] = useState<{ labelName: string; confidence: number } | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)
  const timeStart = new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const timeEnd = new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const domains = [...new Set(session.pages.map((p) => new URL(p.url).hostname.replace('www.', '')))].slice(0, 3)
  
  // Fetch label suggestion if session has no label
  useEffect(() => {
    if (!session.labelId && !isDismissed) {
      sendMessage<{ suggestion: { labelName: string; confidence: number } | null }>({
        type: "GET_LABEL_SUGGESTION",
        payload: { sessionId: session.id }
      })
        .then((res) => {
          if (res?.suggestion) {
            setSuggestedLabel(res.suggestion)
          }
        })
        .catch((err) => {
          console.error("Failed to get label suggestion:", err)
        })
    }
  }, [session.id, session.labelId, isDismissed])
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuIndex !== null) {
        setOpenMenuIndex(null)
      }
      if (showLabelPicker) {
        setShowLabelPicker(false)
      }
    }
    
    if (openMenuIndex !== null || showLabelPicker) {
      document.addEventListener('click', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuIndex, showLabelPicker])
  
  // Generate a title from the most common domain or first page
  const sessionTitle = session.inferredTitle || (session.pages.length > 0 
    ? (session.pages[0]?.title || domains[0] || "Session")
    : "Session")

  return (
    <div 
      className="flex flex-col gap-1.5 p-3 rounded-xl transition-all relative bg-white dark:bg-[#2C2C2E] border border-[#BCBCBC] dark:border-[#3A3A3C]"
      style={{ 
        backgroundColor: isExpanded ? (document.documentElement.classList.contains('dark') ? '#2C2C2E' : '#F5F5F5') : undefined
      }}>
      {/* Session Header */}
      <div 
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="flex items-center gap-2 w-full cursor-pointer">
        <div className="flex items-center gap-3 flex-1">
          <p
            className="text-sm font-medium leading-tight text-[#080A0B] dark:text-[#FFFFFF]"
            style={{ fontFamily: "'Breeze Sans'" }}>
            {sessionTitle}
          </p>
        </div>
        {/* Label Badge */}
        {session.labelId && (
          <div
            className="px-2 py-1 text-xs rounded"
            style={{
              backgroundColor: labels.find(l => l.id === session.labelId)?.color || '#E8E8E8',
              color: '#FFFFFF',
              fontFamily: "'Breeze Sans'",
              maxWidth: '100px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
            {labels.find(l => l.id === session.labelId)?.name}
          </div>
        )}
        {/* Suggested Label Badge */}
        {!session.labelId && suggestedLabel && !isDismissed && (
          <div
            className="px-2 py-1 text-xs rounded flex items-center gap-1.5"
            style={{
              border: '1.5px dashed #9CA3AF',
              backgroundColor: document.documentElement.classList.contains('dark') ? '#2C2C2E' : '#F9FAFB',
              color: document.documentElement.classList.contains('dark') ? '#9A9FA6' : '#6B7280',
              fontFamily: "'Breeze Sans'"
            }}>
            <span>{labels.find(l => l.name === suggestedLabel.labelName)?.name || suggestedLabel.labelName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                const label = labels.find(l => l.name === suggestedLabel.labelName)
                if (label) {
                  onUpdateSessionLabel(session.id, label.id)
                  setSuggestedLabel(null)
                }
              }}
              className="hover:bg-green-100 rounded p-0.5 transition-colors"
              title="Apply suggestion"
              style={{ color: '#10B981' }}>
              <Check className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsDismissed(true)
                setSuggestedLabel(null)
              }}
              className="hover:bg-red-100 rounded p-0.5 transition-colors"
              title="Dismiss"
              style={{ color: '#EF4444' }}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {/* Label Icon Button with Dropdown */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowLabelPicker(!showLabelPicker)
            }}
            title="Change label"
            className="p-1 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] rounded transition-colors"
            style={{ color: session.labelId ? (labels.find(l => l.id === session.labelId)?.color || '#9A9FA6') : '#9A9FA6' }}>
            <Tag className="h-4 w-4" />
          </button>

          {/* Label Picker Dropdown */}
          {showLabelPicker && (
            <div
              className="absolute bg-white dark:bg-[#2C2C2E] rounded-lg py-1 min-w-fit z-50"
              style={{
                border: '1px solid ' + (document.documentElement.classList.contains('dark') ? '#3A3A3C' : '#E5E5E5'),
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                top: '100%',
                right: 0,
                marginTop: '4px'
              }}
              onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  onUpdateSessionLabel(session.id, undefined)
                  setShowLabelPicker(false)
                }}
                className="w-full text-left px-3 py-2 text-xs transition-colors text-[#666666] dark:text-[#9A9FA6]"
                style={{
                  fontFamily: "'Breeze Sans'",
                  backgroundColor: !session.labelId ? (document.documentElement.classList.contains('dark') ? '#3A3A3C' : '#F0F0F0') : 'transparent'
                }}>
                No label
              </button>
              {labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center justify-between px-3 py-2 text-xs transition-colors group"
                  style={{
                    backgroundColor: session.labelId === label.id ? (document.documentElement.classList.contains('dark') ? '#3A3A3C' : '#F0F0F0') : 'transparent'
                  }}>
                  <button
                    onClick={() => {
                      onUpdateSessionLabel(session.id, label.id)
                      setShowLabelPicker(false)
                    }}
                    className="flex-1 text-left flex items-center gap-2 text-[#080A0B] dark:text-[#FFFFFF]"
                    style={{ fontFamily: "'Breeze Sans'" }}>
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: label.color || '#000' }}
                    />
                    {label.name}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onDeleteLabel) {
                        onDeleteLabel(label.id)
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-100 dark:hover:bg-red-900 rounded ml-1"
                    title="Delete label"
                    style={{ color: '#9A9FA6' }}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="h-px mx-2 my-1 bg-[#E5E5E5] dark:bg-[#3A3A3C]" />
              <button
                onClick={() => {
                  onOpenCreateLabelModal?.()
                  setShowLabelPicker(false)
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-[#3A3A3C] transition-colors text-[#0072DF] dark:text-[#3e91ff]"
                style={{ fontFamily: "'Breeze Sans'", fontWeight: '500' }}>
                + Create new label
              </button>
            </div>
          )}
        </div>
        {/* Expand/Collapse Icon */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="p-1 hover:bg-gray-100 rounded transition-colors">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            style={{ color: '#9A9FA6' }}
          />
        </button>
      </div>

      {/* Links List */}
      {isExpanded && (
        <div className="flex flex-col gap-1 pt-2" onClick={(e) => e.stopPropagation()}>
          {/* Individual Links */}
          {session.pages
            .filter((page) => page.title && page.title.trim() !== "") // Skip pages without valid titles
            .slice()
            .sort((a, b) => (b.timestamp || b.openedAt) - (a.timestamp || a.openedAt))
            .map((page, index) => {
            // Generate a time for each page based on timestamp or index
            const pageTime = page.openedAt || page.timestamp
            const timeStr = new Date(pageTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

            return (
              <div key={index} className="relative flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuIndex(openMenuIndex === index ? null : index)
                    }}
                    className="hover:bg-gray-200 dark:hover:bg-[#3A3A3C] rounded p-0.5 transition-colors">
                    <MoreVertical className="h-3.5 w-3.5" style={{ color: '#9A9FA6' }} />
                  </button>
                  {/* Favicon for the page */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${new URL(page.url).hostname}&sz=16`}
                    alt=""
                    className="w-4 h-4 rounded flex-shrink-0"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      img.style.display = 'none'
                    }}
                  />
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs leading-tight truncate flex-1 text-[#080A0B] dark:text-[#FFFFFF]"
                    style={{ fontFamily: "'Breeze Sans'" }}>
                    {page.title}
                  </a>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
                  {timeStr}
                </span>

                {/* Dropdown Menu */}
                {openMenuIndex === index && (
                  <div
                    className="absolute left-6 top-6 z-30 bg-white dark:bg-[#2C2C2E] rounded-xl py-2 min-w-[200px]"
                    style={{ 
                      border: '1px solid ' + (document.documentElement.classList.contains('dark') ? '#3A3A3C' : '#E5E5E5'),
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
                    }}
                    onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        window.open(page.url, '_blank')
                        setOpenMenuIndex(null)
                      }}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors flex items-center gap-3 text-[#080A0B] dark:text-[#FFFFFF]"
                      style={{ fontFamily: "'Breeze Sans'" }}>
                      <ExternalLinkIcon className="h-3.5 w-3.5" style={{ color: '#9A9FA6' }} />
                      <span>Open in new tab</span>
                    </button>
                    <button
                      onClick={() => {
                        chrome.windows.create({ url: page.url })
                        setOpenMenuIndex(null)
                      }}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors flex items-center gap-3 text-[#080A0B] dark:text-[#FFFFFF]"
                      style={{ fontFamily: "'Breeze Sans'" }}>
                      <ExternalLinkIcon className="h-3.5 w-3.5" style={{ color: '#9A9FA6' }} />
                      <span>Open in new window</span>
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(page.url)
                        setOpenMenuIndex(null)
                      }}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors flex items-center gap-3 text-[#080A0B] dark:text-[#FFFFFF]"
                      style={{ fontFamily: "'Breeze Sans'" }}>
                      <Copy className="h-3.5 w-3.5" style={{ color: '#9A9FA6' }} />
                      <span>Copy link</span>
                    </button>
                    <div className="h-px mx-2 my-1 bg-[#E5E5E5] dark:bg-[#3A3A3C]" />
                    <button
                      onClick={async () => {
                        try {
                          await sendMessage<{ success: boolean }>({
                            type: "DELETE_PAGE_FROM_SESSION",
                            payload: { sessionId: session.id, pageUrl: page.url }
                          })
                          setOpenMenuIndex(null)
                        } catch (err) {
                          console.error("Failed to delete page from session:", err)
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900 transition-colors flex items-center gap-3 text-[#EF4444] dark:text-[#F87171]"
                      style={{ fontFamily: "'Breeze Sans'" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete from session</span>
                    </button>
                    <button
                      onClick={() => {
                        chrome.windows.create({ url: page.url, incognito: true })
                        setOpenMenuIndex(null)
                      }}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors flex items-center gap-3 text-[#080A0B] dark:text-[#FFFFFF]"
                      style={{ fontFamily: "'Breeze Sans'" }}>
                      <EyeOff className="h-3.5 w-3.5" style={{ color: '#9A9FA6' }} />
                      <span>Open in incognito</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Cluster Day Section Component
interface ClusterDaySectionProps {
  dayKey: string
  dayLabel: string
  clusters: Array<{ clusterId: number; nodes: GraphNode[]; timestamp: number }>
  isExpanded: boolean
  onToggleDay: (key: string) => void
  expandedClusters: number[]
  onToggleCluster: (id: number) => void
  timelineView?: "sessions" | "clusters"
  onTimelineViewChange?: (view: "sessions" | "clusters") => void
  isFirstDay?: boolean
  searchQuery?: string
}

function ClusterDaySection({
  dayKey,
  dayLabel,
  clusters,
  isExpanded,
  onToggleDay,
  expandedClusters,
  onToggleCluster,
  timelineView,
  onTimelineViewChange,
  isFirstDay,
  searchQuery,
}: ClusterDaySectionProps) {
  const isDarkMode = document.documentElement.classList.contains('dark')
  const visibleCount = isExpanded ? clusters.length : 3
  const hasNoClusters = clusters.length === 0

  return (
    <div className="flex flex-col gap-1 pb-0 pt-1 p-2">
      {/* Day Header with View Toggle */}
      <div className="flex items-center justify-between px-2 pr-0 mb-1 mt-4">
        <div className="text-sm font-normal text-[#0072DF] dark:text-[#3e91ff]" style={{ fontFamily: "'Breeze Sans'" }}>
          <span>{dayLabel}</span>
        </div>
        {hasNoClusters ? (
          <div className="text-xs text-[#9A9FA6] dark:text-[#9A9FA6]" style={{ fontFamily: "'Breeze Sans'" }}>
            No clusters
          </div>
        ) : (
          isFirstDay && !searchQuery && timelineView && onTimelineViewChange && (
            <div
              className="relative inline-flex items-center rounded-full p-0.5"
              style={{
                width: 130,
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
                  transform: timelineView === 'clusters' ? 'translateX(100%)' : 'translateX(0)',
                  backgroundColor: isDarkMode ? '#3e91ff' : '#0072de',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                }}
              />

              <button
                onClick={() => onTimelineViewChange("sessions")}
                className="relative z-10 flex-1 text-xs py-1 rounded-full transition-colors"
                aria-pressed={timelineView === 'sessions'}
                style={{
                  background: 'transparent',
                  border: '0',
                  color: timelineView === 'sessions' ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
                  fontFamily: "'Breeze Sans'"
                }}
                title="Show sessions"
              >
                Sessions
              </button>

              <button
                onClick={() => onTimelineViewChange("clusters")}
                className="relative z-10 flex-1 text-xs py-1 rounded-full transition-colors"
                aria-pressed={timelineView === 'clusters'}
                style={{
                  background: 'transparent',
                  border: '0',
                  color: timelineView === 'clusters' ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#080A0B'),
                  fontFamily: "'Breeze Sans'"
                }}
                title="Show clusters"
              >
                Clusters
              </button>
            </div>
          )
        )}
      </div>

      {/* Clusters List */}
      <div className="flex flex-col gap-3 pt-0 pb-1">
        {clusters.slice(0, visibleCount).map((cluster, index) => (
          <div
            key={cluster.clusterId}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${index * 50}ms` }}>
            <ClusterItem
              cluster={cluster}
              isExpanded={expandedClusters.includes(cluster.clusterId)}
              onToggle={() => onToggleCluster(cluster.clusterId)}
            />
          </div>
        ))}
      </div>

      {/* Show More / Show Less */}
      {clusters.length > 3 && (
        <button
          onClick={() => onToggleDay(dayKey)}
          className="text-xs font-normal mt-2 mx-2 py-1 hover:underline"
          style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
          {isExpanded ? `Show less` : `Show ${clusters.length - 3} more`}
        </button>
      )}
    </div>
  )
}

// Cluster Item Component
interface ClusterItemProps {
  cluster: { clusterId: number; nodes: GraphNode[]; timestamp: number }
  isExpanded: boolean
  onToggle: () => void
}

function ClusterItem({ cluster, isExpanded, onToggle }: ClusterItemProps) {
  const { clusterId, nodes, timestamp } = cluster
  const clusterColor = getClusterColor(clusterId)
  const clusterLabel = generateClusterLabel(nodes, clusterId)
  
  // Get valid timestamps only
  const validTimestamps = nodes
    .map(n => n.timestamp)
    .filter(ts => ts && !isNaN(ts) && ts > 0)
  
  if (validTimestamps.length === 0) {
    // No valid timestamps, use current time
    validTimestamps.push(Date.now())
  }
  
  const startTime = Math.min(...validTimestamps)
  const endTime = Math.max(...validTimestamps)
  
  const startDate = new Date(startTime)
  const endDate = new Date(endTime)
  
  // Validate dates
  if (isNaN(startDate.getTime())) {
    console.warn("Invalid start date in cluster", startTime)
    startDate.setTime(Date.now())
  }
  if (isNaN(endDate.getTime())) {
    console.warn("Invalid end date in cluster", endTime)
    endDate.setTime(Date.now())
  }
  
  const timeRange = startDate.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  }) + (startTime !== endTime ? ' - ' + endDate.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  }) : '')

  const handleNodeClick = (node: GraphNode) => {
    // Just open the page - clicking opens it in a new tab
    chrome.tabs.create({ url: node.url })
  }

  const handleFocusCluster = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Open the graph tab with the cluster focused
    chrome.tabs.create({
      url: chrome.runtime.getURL('tabs/graph.html') + `?cluster=${clusterId}`
    })
  }

  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-xl transition-all relative bg-white dark:bg-[#2C2C2E] border border-[#BCBCBC] dark:border-[#3A3A3C] cursor-pointer"
      style={{
        backgroundColor: isExpanded ? (document.documentElement.classList.contains('dark') ? '#2C2C2E' : '#F5F5F5') : undefined
      }}
      onClick={onToggle}>
      {/* Cluster Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Cluster Color Indicator */}
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: clusterColor }}
          />
          
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
              {clusterLabel}
            </div>
            <div className="text-2xs mt-0.5 flex items-center gap-2" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
              <span>{nodes.length} page{nodes.length !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{timeRange}</span>
            </div>
          </div>

          {/* Focus Cluster Button */}
          <button
            onClick={handleFocusCluster}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#3A3A3C] rounded transition-colors"
            title="Focus cluster in graph">
            <Focus className="h-4 w-4" style={{ color: '#9A9FA6' }} />
          </button>
        </div>

        {/* Expand/Collapse Icon */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="p-1 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] rounded transition-colors">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            style={{ color: '#9A9FA6' }}
          />
        </button>
      </div>

      {/* Nodes List */}
      {isExpanded && (
        <div className="flex flex-col gap-1 pt-2">
          {nodes
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((node, index) => {
              const nodeTimestamp = node.timestamp && !isNaN(node.timestamp) && node.timestamp > 0 
                ? node.timestamp 
                : Date.now()
              const nodeDate = new Date(nodeTimestamp)
              
              const timeStr = isNaN(nodeDate.getTime()) 
                ? 'Unknown time'
                : nodeDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: true 
                  })

              return (
                <div 
                  key={node.id} 
                  className="flex items-center justify-between gap-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-[#3A3A3C] transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleNodeClick(node)
                  }}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${node.domain}&sz=16`}
                      alt=""
                      className="w-4 h-4 rounded flex-shrink-0"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement
                        img.style.display = 'none'
                      }}
                    />
                    <span className="text-xs leading-tight truncate flex-1 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      {node.title}
                    </span>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
                    {timeStr}
                  </span>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

