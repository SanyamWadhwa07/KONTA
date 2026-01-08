import { ChevronDown, Activity, Clock, Database, TrendingUp, Zap, Brain, Target } from "lucide-react"
import { useState, useEffect } from "react"

interface AnalyticsData {
  // Basic counts (already shown in modal)
  sessionsCount: number
  labelsCount: number
  pagesCount: number
  projectsCount: number
  candidatesCount: number
  
  // Performance metrics
  performance: {
    avgSearchLatency: number
    avgEmbeddingTime: number
    totalSearches: number
    totalEmbeddings: number
  }
  
  // Usage patterns
  usage: {
    topDomains: Array<{ domain: string; count: number }>
    avgSessionLength: number
    mostUsedLabels: Array<{ label: string; count: number }>
    totalTimeTracked: number
    activeProjects: number
  }
  
  // System health
  system: {
    modelLoaded: boolean
    storageUsedMB: number
    totalStorageMB: number
    indexedPagesCount: number
  }
  
  // COI metrics
  coi: {
    avgCoiScore: number
    highCoiEvents: number
    breaksSuggested: number
    breaksAccepted: number
  }
  
  // Project insights
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

interface AnalyticsProps {
  sessionsCount: number
  labelsCount: number
  pagesCount: number
  projectsCount: number
  candidatesCount: number
}

export function Analytics({ 
  sessionsCount, 
  labelsCount, 
  pagesCount, 
  projectsCount, 
  candidatesCount 
}: AnalyticsProps) {
  const [expanded, setExpanded] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Section expansion states
  const [performanceExpanded, setPerformanceExpanded] = useState(true)
  const [usageExpanded, setUsageExpanded] = useState(true)
  const [systemExpanded, setSystemExpanded] = useState(true)
  const [coiExpanded, setCoiExpanded] = useState(true)
  const [projectsExpanded, setProjectsExpanded] = useState(true)

  useEffect(() => {
    if (expanded && !analytics) {
      loadDetailedAnalytics()
    }
  }, [expanded])

  const loadDetailedAnalytics = async () => {
    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: "GET_DETAILED_ANALYTICS" 
      })
      
      if (response?.analytics) {
        setAnalytics(response.analytics)
      }
    } catch (error) {
      console.error("Failed to load analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}m`
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours}h ${mins}m`
  }

  const formatBytes = (mb: number): string => {
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    return `${(mb / 1024).toFixed(2)} GB`
  }

  const formatMs = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const StatCard = ({ 
    icon: Icon, 
    label, 
    value, 
    subtitle, 
    color = "#0072df" 
  }: { 
    icon: any
    label: string
    value: string | number
    subtitle?: string
    color?: string 
  }) => (
    <div className="px-3 py-2.5 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
          {label}
        </span>
      </div>
      <div className="text-lg font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-[#666666] dark:text-[#9A9FA6] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
          {subtitle}
        </div>
      )}
    </div>
  )

  const ProgressBar = ({ 
    value, 
    max, 
    color = "#0072df",
    label,
    showPercentage = true
  }: { 
    value: number
    max: number
    color?: string
    label: string
    showPercentage?: boolean
  }) => {
    const percentage = Math.min(100, (value / max) * 100)
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            {label}
          </span>
          {showPercentage && (
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="h-2 bg-[#E5E5E5] dark:bg-[#3A3A3C] rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-300"
            style={{ 
              width: `${percentage}%`,
              backgroundColor: color
            }}
          />
        </div>
      </div>
    )
  }

  const TopItem = ({ 
    label, 
    count, 
    maxCount 
  }: { 
    label: string
    count: number
    maxCount: number 
  }) => {
    const percentage = (count / maxCount) * 100
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[#080A0B] dark:text-[#FFFFFF] truncate" style={{ fontFamily: "'Breeze Sans'" }}>
            {label}
          </div>
          <div className="h-1.5 bg-[#E5E5E5] dark:bg-[#3A3A3C] rounded-full overflow-hidden mt-1">
            <div 
              className="h-full bg-[#0072df] dark:bg-[#3e91ff] rounded-full transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <span className="text-xs font-medium text-[#9A9FA6] dark:text-[#8E8E93] min-w-[30px] text-right" style={{ fontFamily: "'Breeze Sans'" }}>
          {count}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Basic Stats - Always Visible */}
      <div className="px-3 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-[#F5F5F5] dark:bg-[#2C2C2E]">
        <div className="text-xs text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Version:</span>
            <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">v0.1.0</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Sessions:</span>
            <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">{sessionsCount}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Labels:</span>
            <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">{labelsCount}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Pages:</span>
            <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">{pagesCount}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Projects:</span>
            <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">{projectsCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Candidates:</span>
            <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">{candidatesCount}</span>
          </div>
        </div>
      </div>

      {/* Detailed Analytics Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            Detailed Analytics
          </span>
          <Activity className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
        </div>
        <ChevronDown 
          className={`w-4 h-4 text-[#9A9FA6] transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded Detailed Analytics */}
      {expanded && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#0072df] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : analytics ? (
            <>
              {/* Performance Section */}
              <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] overflow-hidden">
                <button
                  onClick={() => setPerformanceExpanded(!performanceExpanded)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronDown 
                      className={`h-4 w-4 transition-transform text-[#080A0B] dark:text-[#FFFFFF] ${performanceExpanded ? 'rotate-0' : '-rotate-90'}`}
                    />
                    <Zap className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
                    <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Performance
                    </h4>
                  </div>
                </button>
                {performanceExpanded && (
                  <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <StatCard
                        icon={Clock}
                        label="Avg Search"
                        value={formatMs(analytics.performance.avgSearchLatency)}
                        subtitle={`${analytics.performance.totalSearches} searches`}
                        color="#10b981"
                      />
                      <StatCard
                        icon={Brain}
                        label="Embedding Time"
                        value={formatMs(analytics.performance.avgEmbeddingTime)}
                        subtitle={`${analytics.performance.totalEmbeddings} pages`}
                        color="#8b5cf6"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Usage Patterns Section */}
              <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
                <button
                  onClick={() => setUsageExpanded(!usageExpanded)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
                  <ChevronDown
                    className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                      usageExpanded ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <TrendingUp className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
                  <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                    Usage Patterns
                  </h4>
                </button>
                {usageExpanded && (
                  <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="space-y-3 mt-3">
                  <div className="px-3 py-2.5 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-1" style={{ fontFamily: "'Breeze Sans'" }}>
                          Avg Session
                        </div>
                        <div className="text-lg font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                          {formatTime(analytics.usage.avgSessionLength)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-1" style={{ fontFamily: "'Breeze Sans'" }}>
                          Total Tracked
                        </div>
                        <div className="text-lg font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                          {formatTime(analytics.usage.totalTimeTracked)}
                        </div>
                      </div>
                    </div>
                    
                    {analytics.usage.topDomains.length > 0 && (
                      <div className="border-t border-[#E5E5E5] dark:border-[#3A3A3C] pt-2">
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-2" style={{ fontFamily: "'Breeze Sans'" }}>
                          Top Domains
                        </div>
                        <div className="space-y-2">
                          {analytics.usage.topDomains.slice(0, 5).map((item, idx) => (
                            <TopItem
                              key={idx}
                              label={item.domain}
                              count={item.count}
                              maxCount={analytics.usage.topDomains[0].count}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {analytics.usage.mostUsedLabels.length > 0 && (
                      <div className="border-t border-[#E5E5E5] dark:border-[#3A3A3C] pt-2 mt-3">
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-2" style={{ fontFamily: "'Breeze Sans'" }}>
                          Top Labels
                        </div>
                        <div className="space-y-2">
                          {analytics.usage.mostUsedLabels.slice(0, 5).map((item, idx) => (
                            <TopItem
                              key={idx}
                              label={item.label}
                              count={item.count}
                              maxCount={analytics.usage.mostUsedLabels[0].count}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    </div>
                  </div>
                )}
              </div>

              {/* System Health Section */}
              <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
                <button
                  onClick={() => setSystemExpanded(!systemExpanded)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
                  <ChevronDown
                    className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                      systemExpanded ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <Database className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
                  <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                    System Health
                  </h4>
                </button>
                {systemExpanded && (
                  <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      ML Model Status
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      analytics.system.modelLoaded 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`} style={{ fontFamily: "'Breeze Sans'" }}>
                      {analytics.system.modelLoaded ? 'Loaded' : 'Not Loaded'}
                    </span>
                  </div>
                  
                  <ProgressBar
                    value={analytics.system.storageUsedMB}
                    max={analytics.system.totalStorageMB}
                    label={`Storage Used: ${formatBytes(analytics.system.storageUsedMB)} / ${formatBytes(analytics.system.totalStorageMB)}`}
                    color="#f59e0b"
                  />
                  
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Indexed Pages
                    </span>
                    <span className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      {analytics.system.indexedPagesCount.toLocaleString()}
                    </span>
                  </div>
                    </div>
                  </div>
                )}
              </div>

              {/* COI Metrics Section */}
              <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
                <button
                  onClick={() => setCoiExpanded(!coiExpanded)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
                  <ChevronDown
                    className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                      coiExpanded ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <Brain className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
                  <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                    Cognitive Overload
                  </h4>
                </button>
                {coiExpanded && (
                  <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="grid grid-cols-2 gap-2 mt-3">
                  <StatCard
                    icon={Activity}
                    label="Avg COI Score"
                    value={`${(analytics.coi.avgCoiScore * 100).toFixed(0)}%`}
                    color="#f59e0b"
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="High COI Events"
                    value={analytics.coi.highCoiEvents}
                    color="#ef4444"
                  />
                  <StatCard
                    icon={Clock}
                    label="Breaks Suggested"
                    value={analytics.coi.breaksSuggested}
                    color="#06b6d4"
                  />
                  <StatCard
                    icon={Target}
                    label="Breaks Taken"
                    value={analytics.coi.breaksAccepted}
                    subtitle={`${analytics.coi.breaksSuggested > 0 ? ((analytics.coi.breaksAccepted / analytics.coi.breaksSuggested) * 100).toFixed(0) : 0}% acceptance`}
                    color="#10b981"
                  />
                    </div>
                  </div>
                )}
              </div>

              {/* Project Insights Section */}
              <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
                <button
                  onClick={() => setProjectsExpanded(!projectsExpanded)}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
                  <ChevronDown
                    className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                      projectsExpanded ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <Target className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
                  <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                    Project Intelligence
                  </h4>
                </button>
                {projectsExpanded && (
                  <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="space-y-2 mt-3">
                      {/* Summary Stats */}
                      <div className="px-3 py-2.5 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-1" style={{ fontFamily: "'Breeze Sans'" }}>
                          Auto-Detected
                        </div>
                        <div className="text-lg font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                          {analytics.projects.autoDetected.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-1" style={{ fontFamily: "'Breeze Sans'" }}>
                          Accepted
                        </div>
                        <div className="text-lg font-medium text-[#10b981]" style={{ fontFamily: "'Breeze Sans'" }}>
                          {analytics.projects.autoDetected.length}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                      <div className="text-center">
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Snoozed
                        </div>
                        <div className="text-sm font-medium text-[#f59e0b]" style={{ fontFamily: "'Breeze Sans'" }}>
                          {analytics.projects.suggestionsSnoozed}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Dismissed
                        </div>
                        <div className="text-sm font-medium text-[#ef4444]" style={{ fontFamily: "'Breeze Sans'" }}>
                          {analytics.projects.suggestionsDismissed}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Project List */}
                  {analytics.projects.autoDetected.length > 0 ? (
                    <div className="px-3 py-2.5 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-2" style={{ fontFamily: "'Breeze Sans'" }}>
                        Auto-Detected Projects & Why
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {analytics.projects.autoDetected.map((project) => (
                          <div
                            key={project.id}
                            className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] truncate" style={{ fontFamily: "'Breeze Sans'" }}>
                                  {project.name}
                                </div>
                                <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                                  {project.topDomain} • {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''} • {project.siteCount} site{project.siteCount !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <span className="text-xs font-medium px-2 py-0.5 rounded ml-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" style={{ fontFamily: "'Breeze Sans'" }}>
                                Score: {project.score}
                              </span>
                            </div>
                            {project.scoreBreakdown && (
                              <div className="mt-2 pt-2 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                                <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mb-1.5" style={{ fontFamily: "'Breeze Sans'" }}>
                                  Detection Reasoning:
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      Visits:
                                    </span>
                                    <span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      {project.scoreBreakdown.visits}/40
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      Sessions:
                                    </span>
                                    <span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      {project.scoreBreakdown.sessions}/30
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      Resources:
                                    </span>
                                    <span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      {project.scoreBreakdown.resources}/20
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      Time Span:
                                    </span>
                                    <span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                                      {project.scoreBreakdown.timeSpan}/10
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-1.5" style={{ fontFamily: "'Breeze Sans'" }}>
                              Created {new Date(project.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] text-center">
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                        No auto-detected projects yet
                      </div>
                    </div>
                  )}
                    </div>
                  </div>
                )}
                </div>
            </>
          ) : (
            <div className="text-center py-4 text-sm text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
              No analytics data available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
