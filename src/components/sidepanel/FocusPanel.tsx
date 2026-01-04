import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Plus, Trash2, Download, Upload, Power, PowerOff, Edit2, X, Check } from "lucide-react"
import type { Blocklist, BlocklistEntry, BlocklistCategory, FocusModeState, CategoryStates } from "~/types/focus-mode"
import { CATEGORY_INFO } from "~/types/focus-mode"
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

export function FocusPanel() {
  const [focusState, setFocusState] = useState<FocusModeState>({
    isActive: false,
    enabledCategories: []
  })
  const [blocklist, setBlocklist] = useState<Blocklist | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<BlocklistCategory>>(new Set())
  const [editingEntry, setEditingEntry] = useState<{ index: number; entry: BlocklistEntry } | null>(null)
  const [addingEntry, setAddingEntry] = useState<BlocklistCategory | null>(null)
  const [newEntryForm, setNewEntryForm] = useState({ pattern: "", reason: "" })

  // Load focus state and blocklist on mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [stateResponse, blocklistResponse] = await Promise.all([
        sendMessage<{ state: FocusModeState }>({ type: "GET_FOCUS_STATE" }),
        sendMessage<{ blocklist: Blocklist }>({ type: "GET_BLOCKLIST" })
      ])
      
      log("[FocusPanel] State response:", stateResponse)
      log("[FocusPanel] Blocklist response:", blocklistResponse)
      
      if (stateResponse?.state) {
        setFocusState(stateResponse.state)
      }
      
      if (blocklistResponse?.blocklist) {
        log("[FocusPanel] Blocklist entries:", blocklistResponse.blocklist.entries.length)
        setBlocklist(blocklistResponse.blocklist)
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to load data:", err)
    } finally {
      setLoading(false)
    }
  }

  const toggleFocusMode = async () => {
    try {
      log("[FocusPanel] Toggling focus mode, current state:", focusState.isActive)
      const response = await sendMessage<{ state: FocusModeState }>({ 
        type: "TOGGLE_FOCUS_MODE" 
      })
      log("[FocusPanel] Toggle response:", response)
      if (response?.state) {
        setFocusState(response.state)
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to toggle focus mode:", err)
    }
  }

  const toggleCategory = async (category: BlocklistCategory) => {
    try {
      const response = await sendMessage<{ state: FocusModeState }>({
        type: "TOGGLE_CATEGORY",
        payload: { category }
      })
      if (response?.state) {
        setFocusState(response.state)
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to toggle category:", err)
    }
  }

  const toggleCategoryExpanded = (category: BlocklistCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const addEntry = async (category: BlocklistCategory) => {
    if (!newEntryForm.pattern.trim()) return

    try {
      const entry: BlocklistEntry = {
        pattern: newEntryForm.pattern.trim(),
        type: "domain",
        addedAt: Date.now(),
        reason: newEntryForm.reason.trim() || undefined,
        category
      }

      const response = await sendMessage<{ success: boolean; blocklist: Blocklist }>({
        type: "ADD_BLOCKLIST_ENTRY",
        payload: { entry }
      })

      if (response?.success && response?.blocklist) {
        setBlocklist(response.blocklist)
        setAddingEntry(null)
        setNewEntryForm({ pattern: "", reason: "" })
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to add entry:", err)
    }
  }

  const deleteEntry = async (index: number) => {
    try {
      const response = await sendMessage<{ success: boolean; blocklist: Blocklist }>({
        type: "DELETE_BLOCKLIST_ENTRY",
        payload: { index }
      })

      if (response?.success && response?.blocklist) {
        setBlocklist(response.blocklist)
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to delete entry:", err)
    }
  }

  const exportBlocklist = async () => {
    try {
      const response = await sendMessage<{ blocklist: Blocklist }>({
        type: "EXPORT_BLOCKLIST"
      })

      if (response?.blocklist) {
        const dataStr = JSON.stringify(response.blocklist, null, 2)
        const blob = new Blob([dataStr], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `aegis-blocklist-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to export blocklist:", err)
    }
  }

  const importBlocklist = async (file: File) => {
    try {
      const text = await file.text()
      const importedBlocklist = JSON.parse(text) as Blocklist

      const response = await sendMessage<{ success: boolean; blocklist: Blocklist }>({
        type: "IMPORT_BLOCKLIST",
        payload: { blocklist: importedBlocklist, mergeStrategy: "skip" }
      })

      if (response?.success && response?.blocklist) {
        setBlocklist(response.blocklist)
      }
    } catch (err) {
      console.error("[FocusPanel] Failed to import blocklist:", err)
    }
  }

  const handleFileImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        importBlocklist(file)
      }
    }
    input.click()
  }

  const getCategoryEntries = (category: BlocklistCategory) => {
    if (!blocklist) return []
    return blocklist.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.category === category)
  }

  const isCategoryEnabled = (category: BlocklistCategory) => {
    return focusState.enabledCategories.includes(category)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-xs dark:text-[#8E8E93]" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
          Loading focus mode...
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#1C1C1E]" style={{ fontFamily: "'Breeze Sans'" }}>
      {/* Header with Focus Mode Toggle */}
      <div className="p-4" style={{ borderColor: '#E5E7EB' }}>
        {/* <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: '#1F2937' }}>
      <div className="p-4 bg-white border-b dark:bg-[#1C1C1E] dark:border-[#3A3A3C]" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-[#FFFFFF]" style={{ color: '#080A0B' }}>
            Focus Mode
          </h2>
          <div className="flex gap-2">
            <button
              onClick={exportBlocklist}
              className="p-2 rounded-lg hover:bg-blue-50 transition-all"
              title="Export blocklist"
              style={{ color: '#0072de' }}
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={handleFileImport}
              className="p-2 rounded-lg hover:bg-blue-50 transition-all"
              title="Import blocklist"
              style={{ color: '#0072de' }}
            >
              <Upload className="h-4 w-4" />
            </button>
          </div>
        </div> */}

        {/* Large Focus Mode Toggle Button */}
        <button
          onClick={toggleFocusMode}
          className={`w-full p-5 rounded-xl transition-all flex items-center justify-between shadow-sm hover:shadow-md dark:hover:shadow-lg ${
            focusState.isActive 
              ? 'bg-[#0072de] dark:bg-[#4A9FFF] text-white' 
              : 'bg-white dark:bg-[#2C2C2E] text-[#080A0B] dark:text-[#FFFFFF] border-2 border-[#E5E5E5] dark:border-[#3A3A3C]'
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-lg ${
                focusState.isActive 
                  ? 'bg-white/20' 
                  : 'bg-[#F3F4F6] dark:bg-[#3A3A3C]'
              }`}
            >
              {focusState.isActive ? (
                <Power className="h-6 w-6" />
              ) : (
                <PowerOff className="h-6 w-6 text-[#9A9FA6] dark:text-[#8E8E93]" />
              )}
            </div>
            <div className="text-left">
              <div className="font-normal text-base">
                {focusState.isActive ? "Focus Mode Active" : "Focus Mode Inactive"}
              </div>
              <div className={`text-xs mt-0.5 ${
                focusState.isActive 
                  ? 'text-white/80' 
                  : 'text-[#9A9FA6] dark:text-[#8E8E93]'
              }`}>
                {focusState.isActive 
                  ? `${focusState.enabledCategories.length} ${focusState.enabledCategories.length === 1 ? 'category' : 'categories'} blocking sites`
                  : "Activate to block distracting websites"
                }
              </div>
            </div>
          </div>
          <div
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              focusState.isActive 
                ? 'bg-white/20 text-white' 
                : 'bg-[#F3F4F6] dark:bg-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]'
            }`}
          >
            {focusState.isActive ? 'ON' : 'OFF'}
          </div>
        </button>
      </div>

      {/* Categories List */}
      <div className="flex-1 overflow-y-auto dark:bg-[#1C1C1E]">
        <div className="p-4 space-y-3">
          {Object.values(CATEGORY_INFO).map((categoryInfo) => {
            const entries = getCategoryEntries(categoryInfo.id)
            const isExpanded = expandedCategories.has(categoryInfo.id)
            const isEnabled = isCategoryEnabled(categoryInfo.id)
            const isCategoryBlocklistEnabled = blocklist?.categoryStates[categoryInfo.id] ?? false

            return (
              <div
                key={categoryInfo.id}
                className="bg-white dark:bg-[#2C2C2E] rounded-xl shadow-sm overflow-hidden border border-[#E5E5E5] dark:border-[#3A3A3C] hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => toggleCategoryExpanded(categoryInfo.id)}
              >
                {/* Category Header */}
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCategoryExpanded(categoryInfo.id)
                    }}
                    className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex-1">
                      <div className="font-normal text-sm text-[#080A0B] dark:text-[#FFFFFF]">
                        {categoryInfo.name}
                      </div>
                      <div className="text-xs mt-0.5 text-[#9A9FA6] dark:text-[#8E8E93]">
                        {entries.length} {entries.length === 1 ? 'site' : 'sites'}
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform text-[#9A9FA6] dark:text-[#8E8E93] ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  
                  {/* Category Enable/Disable Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCategory(categoryInfo.id)
                    }}
                    className={`ml-3 px-4 py-2 rounded-lg text-xs font-normal transition-all ${
                      isEnabled 
                        ? 'bg-[#0072de] dark:bg-[#4A9FFF] text-white shadow-sm' 
                        : 'bg-[#F3F4F6] dark:bg-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]'
                    }`}
                  >
                    {isEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Category Entries (Expanded) */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-[#F3F4F6] dark:border-[#3A3A3C]">
                    <div className="pt-3 space-y-2">
                      {entries.length === 0 ? (
                        <p className="text-xs text-center py-6 text-[#9A9FA6] dark:text-[#8E8E93]">
                          No sites blocked yet
                        </p>
                      ) : (
                        entries.map(({ entry, index }) => {
                          // Extract domain for favicon
                          const pattern = entry.pattern
                          let domain = pattern.replace(/^\*\./, '').replace(/\/.*$/, '').replace(/\*$/, '')
                          const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
                          
                          return (
                            <div
                              key={index}
                              className="flex items-start justify-between p-3 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-[#FAFAFA] dark:bg-[#1C1C1E] hover:border-blue-200 dark:hover:border-blue-500 transition-all"
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <img 
                                  src={faviconUrl} 
                                  alt=""
                                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-mono truncate font-medium text-[#080A0B] dark:text-[#FFFFFF]">
                                    {entry.pattern}
                                  </div>
                                  {entry.reason && (
                                    <div className="text-xs truncate mt-1 text-[#9A9FA6] dark:text-[#8E8E93]">
                                      {entry.reason}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => deleteEntry(index)}
                                className="ml-3 p-2 rounded-lg hover:bg-red-50 transition-colors dark:hover:bg-red-900/20"
                                title="Delete entry"
                              >
                                <Trash2 className="h-4 w-4" style={{ color: '#EF4444' }} />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Add Entry Form */}
                    {addingEntry === categoryInfo.id ? (
                      <div className="p-4 border border-[#E5E5E5] dark:border-[#3A3A3C] rounded-xl bg-[#FAFAFA] dark:bg-[#1C1C1E]">
                        <input
                          type="text"
                          placeholder="*.example.com or example.com/path/*"
                          value={newEntryForm.pattern}
                          onChange={(e) => setNewEntryForm({ ...newEntryForm, pattern: e.target.value })}
                          className="w-full px-4 py-3 text-sm border border-[#E5E5E5] dark:border-[#3A3A3C] rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#2C2C2E] text-[#080A0B] dark:text-[#FFFFFF]"
                          style={{ fontFamily: "'Breeze Sans'" }}
                        />
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={newEntryForm.reason}
                          onChange={(e) => setNewEntryForm({ ...newEntryForm, reason: e.target.value })}
                          className="w-full px-4 py-3 text-sm border border-[#E5E5E5] dark:border-[#3A3A3C] rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#2C2C2E] text-[#080A0B] dark:text-[#FFFFFF]"
                          style={{ fontFamily: "'Breeze Sans'" }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => addEntry(categoryInfo.id)}
                            className="flex-1 px-4 py-3 rounded-lg text-sm font-normal transition-all shadow-sm hover:shadow bg-[#0072de] dark:bg-[#4A9FFF] text-white"
                          >
                            <Check className="h-4 w-4 inline mr-2" />
                            Add Site
                          </button>
                          <button
                            onClick={() => {
                              setAddingEntry(null)
                              setNewEntryForm({ pattern: "", reason: "" })
                            }}
                            className="px-4 py-3 rounded-lg text-sm font-normal transition-all bg-[#F3F4F6] dark:bg-[#2C2C2E] text-[#080A0B] dark:text-[#FFFFFF] border border-[#E5E5E5] dark:border-[#3A3A3C]"
                          >
                            <X className="h-4 w-4 inline" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingEntry(categoryInfo.id)}
                        className="w-full p-3 border-2 border-dashed border-[#E5E5E5] dark:border-[#3A3A3C] rounded-lg text-sm font-medium transition-all hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-500 dark:hover:bg-blue-900/20 text-[#0072de] dark:text-[#4A9FFF]"
                      >
                        <Plus className="h-4 w-4 inline mr-1" />
                        Add Site to {categoryInfo.name}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info Footer
      <div className="p-3 border-t" style={{ borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }}>
        <p className="text-xs" style={{ color: '#6B7280' }}>
          💡 <strong>Tip:</strong> Use <code className="px-1 py-0.5 bg-gray-200 rounded">*.example.com</code> to block all subdomains
        </p>
      </div> */}
    </div>
  )
}