import { X, Folder, Edit2, ExternalLink, Bell, BellOff, Trash2, Clock, ChevronDown, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { Session } from "~/types/session"
import type { Project } from "~/types/project"
import { log, warn } from "~/lib/logger"

const isNewTabUrl = (url?: string) => {
  if (!url) return true
  const normalized = url.toLowerCase()
  return normalized.startsWith("chrome://newtab") || normalized.startsWith("edge://newtab") || normalized === "about:blank"
}

// Clean URL to remove chrome-extension prefix if present
const cleanUrl = (url: string): string => {
  // Remove chrome-extension://[extension-id]/tabs/ prefix
  const chromeExtPattern = /^chrome-extension:\/\/[a-z]{32}\/tabs\//
  if (chromeExtPattern.test(url)) {
    log("[ProjectPanel] Cleaning chrome-extension URL:", url)
    const cleanedUrl = url.replace(chromeExtPattern, '')
    const finalUrl = cleanedUrl.startsWith('http') ? cleanedUrl : 'https://' + cleanedUrl
    log("[ProjectPanel] Cleaned to:", finalUrl)
    return finalUrl
  }
  // Ensure URL has protocol (not relative)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url
  }
  return url
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

// Projects Panel Component
interface ProjectsPanelProps {
  projects: Project[]
  sessions: Session[]
  expandedProjects: string[]
  onToggleProject: (projectId: string) => void
  onDetectProjects: () => Promise<void>
  onUpdateProject: (projectId: string, updates: Partial<Project>) => Promise<void>
  onDeleteProject: (projectId: string) => Promise<void>
  onProjectsUpdate?: (projects: Project[]) => void
  currentPage: { url: string; title: string } | null
  quickAddRequest?: { url: string; title: string } | null
  onCompleteQuickAdd?: () => void
  onRefreshCurrentPage?: () => void
}

function ProjectsPanel({
  projects,
  sessions,
  expandedProjects,
  onToggleProject,
  onDetectProjects,
  onUpdateProject,
  onDeleteProject,
  onProjectsUpdate,
  currentPage,
  quickAddRequest,
  onCompleteQuickAdd,
  onRefreshCurrentPage
}: ProjectsPanelProps) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [adding, setAdding] = useState(false)
  const [addMessage, setAddMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDescription, setNewProjectDescription] = useState("")
  const [newProjectColor, setNewProjectColor] = useState<string>("#0072de")
  const [creating, setCreating] = useState(false)
  const [showCurrentPage, setShowCurrentPage] = useState(false)

  const fetchCurrentPageInPanel = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab?.url && !isNewTabUrl(tab.url)) {
        // Update current page through props or local state if needed
      }
    })
  }

  // Check if sidebar should auto-open the add current page panel
  useEffect(() => {
    chrome.storage.local.get("sidepanel-show-add-current-page", (result) => {
      if (result["sidepanel-show-add-current-page"]) {
        setShowCurrentPage(true)
        // Clear the flag after using it
        chrome.storage.local.remove("sidepanel-show-add-current-page")
      }
    })
  }, [])

  const targetPage = useMemo(() => quickAddRequest || currentPage, [quickAddRequest, currentPage])

  useEffect(() => {
    if (projects.length > 0 && (!selectedProjectId || !projects.find((p) => p.id === selectedProjectId))) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projects, selectedProjectId])

  useEffect(() => {
    if (quickAddRequest && projects.length > 0) {
      setSelectedProjectId(projects[0].id)
    }
  }, [quickAddRequest, projects])

  useEffect(() => {
    setAddMessage(null)
  }, [targetPage?.url, selectedProjectId])

  const handleStartEdit = (project: Project) => {
    setEditingProjectId(project.id)
    setEditName(project.name)
  }

  const handleSaveEdit = async (projectId: string) => {
    if (editName.trim()) {
      await onUpdateProject(projectId, { name: editName.trim() })
    }
    setEditingProjectId(null)
    setEditName("")
  }

  const handleCancelEdit = () => {
    setEditingProjectId(null)
    setEditName("")
  }

  const handleDelete = async (projectId: string) => {
    if (window.confirm("Delete this project? Sessions will not be deleted.")) {
      await onDeleteProject(projectId)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return

    setCreating(true)
    let created = false
    try {
      const response = await sendMessage<{ success: boolean; project?: Project }>({
        type: "ADD_PROJECT",
        payload: {
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || undefined,
          color: newProjectColor,
          sessionIds: [],
          sites: [],
          autoDetected: false
        }
      })

      if (response?.success) {
        created = true
        const projectsResponse = await sendMessage<{ projects: Project[] }>({
          type: "GET_PROJECTS"
        })

        if (projectsResponse?.projects) {
          onProjectsUpdate?.(projectsResponse.projects)
        }

        // Immediately close and reset the create card
        setShowCreateCard(false)
        setNewProjectName("")
        setNewProjectDescription("")
        setNewProjectColor("#0072de")
      }
    } catch (err) {
      console.error("Failed to create project:", err)
    } finally {
      if (created) {
        // Fallback: ensure card closes even if re-render timing is off
        setShowCreateCard(false)
      }
      setCreating(false)
    }
  }

  const handleAddCurrentPage = async () => {
    if (!targetPage || !selectedProjectId) return

    setAdding(true)
    setAddMessage(null)

    try {
      const response = await sendMessage<{ success: boolean; alreadyAdded?: boolean; error?: string }>({
        type: "ADD_SITE_TO_PROJECT",
        payload: {
          projectId: selectedProjectId,
          siteUrl: cleanUrl(targetPage.url),
          siteTitle: targetPage.title,
          addedBy: "user"
        }
      })

      if (response?.success || response?.alreadyAdded) {
        setAddMessage({ type: "success", text: response?.alreadyAdded ? "Already in this project" : "Added to project" })
        
        // Reload projects to show updated site list
        try {
          const projectsResponse = await sendMessage<{ projects: Project[] }>({ 
            type: "GET_PROJECTS" 
          })
          if (projectsResponse?.projects) {
            // Update the projects in the parent component
            const updatedProject = projectsResponse.projects.find(p => p.id === selectedProjectId)
            if (updatedProject) {
              await onUpdateProject(selectedProjectId, { sites: updatedProject.sites })
            }
          }
        } catch (refreshErr) {
          console.error("Failed to refresh projects after adding site:", refreshErr)
        }
        
        onCompleteQuickAdd?.()
      } else {
        setAddMessage({ type: "error", text: response?.error || "Unable to add page" })
      }
    } catch (err) {
      setAddMessage({ type: "error", text: "Unable to add page" })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-0">

      {/* Current Site Card */}
      {targetPage && (
        <div className="sticky top-0 z-10 p-3 pt-3 bg-white dark:bg-[#1C1C1E]">
          <div className="flex flex-col rounded-xl p-3 transition-all bg-[#FAFAFA] dark:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
            {/* Site Info */}
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium mb-0.5 truncate text-[#080A0B] dark:text-[#FFFFFF] flex-1" style={{ fontFamily: "'Breeze Sans'" }}>
                    {targetPage.title || targetPage.url}
                  </div>
                  {onRefreshCurrentPage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRefreshCurrentPage()
                      }}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#3A3A3C] transition-colors flex-shrink-0"
                      title="Refresh current page info">
                      <RefreshCw className="h-3.5 w-3.5 text-[#9A9FA6] dark:text-[#8E8E93]" />
                    </button>
                  )}
                </div>
                <div className="text-2xs truncate text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'", fontSize: '11px' }}>
                  {targetPage.url}
                </div>
              </div>
            </div>

            {/* Project Selection and Add Button */}
            {projects.length === 0 ? (
              <div className="text-2xs text-center py-2 dark:text-[#8E8E93]" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
                Create a project first to add this site
              </div>
            ) : projects.filter(p => !p.sites?.some(s => cleanUrl(s.url) === cleanUrl(targetPage.url))).length === 0 ? (
              <div className="text-2xs text-center py-2 dark:text-[#8E8E93]" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
                This site is already in all your projects
              </div>
            ) : (
              <div className="flex gap-1.5 items-center w-full">
                <select
                  value={selectedProjectId && projects.some(p => p.id === selectedProjectId) ? selectedProjectId : (projects.filter(p => !p.sites?.some(s => cleanUrl(s.url) === cleanUrl(targetPage.url)))[0]?.id || "")}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border border-[#DDD] dark:border-[#3A3A3C] outline-none focus:border-blue-500 truncate bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  {projects
                    .filter(p => !p.sites?.some(s => cleanUrl(s.url) === cleanUrl(targetPage.url)))
                    .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddCurrentPage}
                  disabled={!selectedProjectId || adding || projects.length === 0}
                  className="px-2.5 py-1.5 text-xs rounded-lg text-white transition-colors disabled:opacity-50 flex-shrink-0"
                  style={{ 
                    backgroundColor: (selectedProjectId && !adding && projects.length > 0) ? '#0072de' : '#CCC',
                    fontFamily: "'Breeze Sans'",
                  }}>
                  {adding ? 'Adding...' : 'Add'}
                </button>
              </div>
            )}

            {/* Status Messages */}
            {addMessage && (
              <div
                className="text-2xs text-center dark:text-opacity-100"
                style={{
                  color: addMessage.type === 'success' ? '#0f9d58' : '#b00020',
                  fontFamily: "'Breeze Sans'",
                  fontSize: '10px'
                }}>
                {addMessage.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Project Modal - Fixed Overlay */}
      {showCreateCard && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center dark:bg-black dark:bg-opacity-60"
          onClick={() => {
            setShowCreateCard(false)
            setNewProjectName("")
            setNewProjectDescription("")
            setNewProjectColor("#0072de")
          }}>
          <div
            className="rounded-lg p-5 w-72 shadow-lg bg-white dark:bg-[#2C2C2E] relative border border-[#DDD] dark:border-[#3A3A3C]"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <h3 className="text-base font-normal mb-4 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
              Create New Project
            </h3>
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-normal" style={{ color: '#666', fontFamily: "'Breeze Sans'" }}>
                  Project Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder=""
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[#DDD] dark:border-[#3A3A3C] outline-none focus:border-blue-500 bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                  style={{ fontFamily: "'Breeze Sans'" }}
                  autoFocus
                />
              </div>
              
              <div>
                <label className="text-xs font-normal" style={{ color: '#666', fontFamily: "'Breeze Sans'" }}>
                  Description (Optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder=""
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[#DDD] dark:border-[#3A3A3C] outline-none focus:border-blue-500 resize-none bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                  style={{ 
                    fontFamily: "'Breeze Sans'",
                    minHeight: '80px'
                  }}
                />
              </div>

              {/* Color Picker */}
              <div>
                <label className="text-xs font-normal block mb-2 dark:text-[#FFFFFF]" style={{ color: '#666', fontFamily: "'Breeze Sans'" }}>
                  Project Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {['#0072de', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewProjectColor(color)}
                      className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0"
                      style={{
                        backgroundColor: color,
                        borderColor: newProjectColor === color ? '#000' : '#DDD',
                        boxShadow: newProjectColor === color ? '0 0 0 2px #fff, 0 0 0 4px ' + color : 'none'
                      }}
                      title="Select color"
                    />
                  ))}
                </div>
              </div>
              
              <div className="flex gap-2 justify-end mt-2">
                <button
                  onClick={() => {
                    setShowCreateCard(false)
                    setNewProjectName("")
                    setNewProjectDescription("")
                    setNewProjectColor("#0072de")
                  }}
                  disabled={creating}
                  className="px-4 py-1.5 text-xs rounded-lg transition-colors bg-[#F5F5F5] dark:bg-[#1C1C1E] text-[#666] dark:text-[#FFFFFF] border border-[#E5E5E5] dark:border-[#3A3A3C] dark:hover:bg-[#3A3A3C]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || creating}
                  className="px-4 py-1.5 text-xs rounded-lg text-white transition-colors disabled:opacity-50 dark:disabled:bg-[#3A3A3C]"
                  style={{ 
                    backgroundColor: (newProjectName.trim() && !creating) ? '#0072de' : '#CCC',
                    fontFamily: "'Breeze Sans'",
                  }}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects List */}
      {projects.length === 0 && !showCreateCard ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Folder className="h-12 w-12 opacity-30" style={{ color: '#9A9FA6' }} />
          <div className="text-center">
            <p className="text-sm mb-1 dark:text-[#8E8E93]" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
              No projects found, create one?
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3 pt-0">
          {/* Projects Header */}
          <h2 className="text-base font-medium px-1 pt-1 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
            Your Projects
          </h2>
          
          {projects
            .sort((a, b) => b.startDate - a.startDate)
            .map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                sessions={sessions.filter(s => project.sessionIds.includes(s.id))}
                isExpanded={expandedProjects.includes(project.id)}
                onToggle={() => onToggleProject(project.id)}
                isEditing={editingProjectId === project.id}
                editName={editName}
                onEditNameChange={setEditName}
                onStartEdit={() => handleStartEdit(project)}
                onSaveEdit={() => handleSaveEdit(project.id)}
                onCancelEdit={handleCancelEdit}
                onDelete={() => handleDelete(project.id)}
                onRemoveSite={async (siteUrl) => {
                  const updatedSites = (project.sites || []).filter(s => s.url !== siteUrl)
                  await onUpdateProject(project.id, { sites: updatedSites })
                }}
              />
            ))}
        </div>
      )}

      {/* Floating Plus Button - Bottom Right */}
      <div className="group fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setShowCreateCard(!showCreateCard)
            setNewProjectName("")
            setNewProjectDescription("")
            setNewProjectColor("#0072de")
          }}
          className="w-12 h-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 flex items-center justify-center text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: 'var(--primary)',
            boxShadow: '0 4px 12px rgba(0, 114, 222, 0.3)'
          }}
          title="Add New Project">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        
        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{ fontFamily: "'Breeze Sans'" }}>
          Add New Project
        </div>
      </div>
    </div>
  )
}

// Project Card Component
interface ProjectCardProps {
  project: Project
  sessions: Session[]
  isExpanded: boolean
  onToggle: () => void
  isEditing: boolean
  editName: string
  onEditNameChange: (name: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onRemoveSite?: (siteUrl: string) => Promise<void>
}

function ProjectCard({
  project,
  sessions,
  isExpanded,
  onToggle,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRemoveSite
}: ProjectCardProps) {
  const [editingDescription, setEditingDescription] = useState(false)
  const [editDescriptionValue, setEditDescriptionValue] = useState(project.description || "")
  const [showReminderDialog, setShowReminderDialog] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [selectedColor, setSelectedColor] = useState(project.color || '#0072de')
  const [reminderForm, setReminderForm] = useState({
    enabled: project.reminder?.enabled || false,
    type: project.reminder?.type || 'daily' as 'daily' | 'once' | 'weekly',
    time: project.reminder?.time || '09:00',
    date: project.reminder?.date || new Date().toISOString().split('T')[0],
    daysOfWeek: project.reminder?.daysOfWeek || [1, 2, 3, 4, 5] // Mon-Fri by default
  })

  const duration = Math.ceil((project.endDate - project.startDate) / (1000 * 60 * 60 * 24))
  const startDateStr = new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endDateStr = new Date(project.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // Close color picker when clicking outside
  useEffect(() => {
    if (!showColorPicker) return

    const handleClickOutside = () => {
      setShowColorPicker(false)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showColorPicker])

  const handleSaveDescription = async () => {
    log("Save description:", editDescriptionValue)
    
    // Update project with new description
    const updatedProject = {
      ...project,
      description: editDescriptionValue
    }
    
    // Get all projects and replace the current one
    const projects = await chrome.storage.local.get("aegis-projects")
    const allProjects = projects["aegis-projects"] || []
    const updatedProjects = allProjects.map((p: any) => 
      p.id === project.id ? updatedProject : p
    )
    
    // Save back to storage
    await chrome.storage.local.set({ "aegis-projects": updatedProjects })
    
    setEditingDescription(false)
  }

  const handleCancelDescription = () => {
    setEditDescriptionValue(project.description || "")
    setEditingDescription(false)
  }

  const handleSaveReminder = async () => {
    // Validate reminder settings
    if (reminderForm.enabled) {
      const now = new Date()
      const [hours, minutes] = reminderForm.time.split(':').map(Number)
      
      // Validate for 'once' type
      if (reminderForm.type === 'once') {
        if (!reminderForm.date) {
          alert('Please select a date for one-time reminder')
          return
        }
        const targetDate = new Date(reminderForm.date)
        targetDate.setHours(hours, minutes, 0, 0)
        
        if (targetDate.getTime() <= now.getTime()) {
          alert('Reminder time must be in the future. Please select a later date or time.')
          return
        }
      }
      
      // Validate for 'daily' type
      if (reminderForm.type === 'daily') {
        const nextTrigger = new Date(now)
        nextTrigger.setHours(hours, minutes, 0, 0)
        
        // If time has passed today, it will trigger tomorrow (which is valid)
        // No validation error needed
      }
      
      // Validate for 'weekly' type
      if (reminderForm.type === 'weekly') {
        if (!reminderForm.daysOfWeek || reminderForm.daysOfWeek.length === 0) {
          alert('Please select at least one day for weekly reminder')
          return
        }
      }
    }
    
    const reminder = {
      enabled: reminderForm.enabled,
      type: reminderForm.type,
      time: reminderForm.time,
      date: reminderForm.type === 'once' ? reminderForm.date : undefined,
      daysOfWeek: reminderForm.type === 'weekly' ? reminderForm.daysOfWeek : undefined,
      snoozeCount: 0,
      snoozedUntil: undefined,
      lastTriggered: undefined
    }
    
    // Update project with reminder
    const updatedProject = {
      ...project,
      reminder
    }
    
    // Get all projects and replace the current one
    const projects = await chrome.storage.local.get("aegis-projects")
    const allProjects = projects["aegis-projects"] || []
    const updatedProjects = allProjects.map((p: any) => 
      p.id === project.id ? updatedProject : p
    )
    
    // Save back to storage
    await chrome.storage.local.set({ "aegis-projects": updatedProjects })
    
    // Schedule/cancel reminder in background
    try {
      const response = await chrome.runtime.sendMessage({
        type: reminder.enabled ? "SET_PROJECT_REMINDER" : "CANCEL_PROJECT_REMINDER",
        payload: {
          projectId: project.id,
          reminder
        }
      })
      
      if (response?.error) {
        alert(`Failed to set reminder: ${response.error}`)
        return
      }
    } catch (error) {
      console.error('Failed to set reminder:', error)
      alert('Failed to set reminder. Please try again.')
      return
    }
    
    setShowReminderDialog(false)
  }

  return (
    <div
      className="flex flex-col rounded-xl p-3 cursor-pointer transition-all hover:shadow-md bg-[#FAFAFA] dark:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C]"
      onClick={onToggle}>
      
      {/* Project Header - Compact Layout */}
      <div className="flex items-start gap-3 mb-2">
        {/* Project Color Icon */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowColorPicker(!showColorPicker)
            }}
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity shadow-sm"
            style={{
              backgroundColor: selectedColor
            }}
            title="Click to change color">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h1a1 1 0 001-1v-6a1 1 0 00-1-1h-1z" />
            </svg>
          </button>
          
          {/* Color Picker Dropdown */}
          {showColorPicker && (
            <div 
              className="absolute top-12 left-0 z-30 bg-white dark:bg-[#2C2C2E] rounded-lg p-3 shadow-xl border border-gray-200 dark:border-[#3A3A3C]"
              onClick={(e) => e.stopPropagation()}
              style={{ minWidth: '180px' }}>
              <div className="text-xs font-medium mb-2 text-[#666] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Choose Color
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['#0072de', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'].map((color) => (
                  <button
                    key={color}
                    onClick={async (e) => {
                      e.stopPropagation()
                      setSelectedColor(color)
                      // Update project color in storage
                      const projects = await chrome.storage.local.get('aegis-projects')
                      const allProjects = projects['aegis-projects'] || []
                      const updatedProjects = allProjects.map((p: any) =>
                        p.id === project.id ? { ...p, color } : p
                      )
                      await chrome.storage.local.set({ 'aegis-projects': updatedProjects })
                      setShowColorPicker(false)
                    }}
                    className="w-8 h-8 rounded-full border-2 hover:scale-110 transition-all"
                    style={{
                      backgroundColor: color,
                      borderColor: selectedColor === color ? '#000' : '#DDD',
                      boxShadow: selectedColor === color ? '0 0 0 2px #fff, 0 0 0 4px ' + color : 'none'
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-2 mb-1">
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => onEditNameChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 text-sm font-normal bg-transparent border-none outline-none text-[#080A0B] dark:text-[#FFFFFF]"
                style={{ 
                  fontFamily: "'Breeze Sans'",
                  padding: 0
                }}
                autoFocus
              />
            ) : (
              <>
                <h3 className="text-sm font-normal flex-1 min-w-0 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                  {project.name}
                </h3>
              </>
            )}
          </div>
          
          {/* Description - Always visible */}
          {editingDescription ? (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editDescriptionValue}
                onChange={(e) => setEditDescriptionValue(e.target.value)}
                placeholder="Add a description..."
                className="w-full px-2 py-1.5 text-xs border border-[#E5E5E5] dark:border-[#3A3A3C] rounded-lg outline-none focus:border-blue-500 resize-none bg-white dark:bg-[#1C1C1E] text-[#64748b] dark:text-[#FFFFFF]"
                style={{ 
                  fontFamily: "'Breeze Sans'",
                  minHeight: '60px'
                }}
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveDescription}
                  className="px-3 py-1 rounded text-xs font-medium text-white bg-[#0074FB]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Save
                </button>
                <button
                  onClick={handleCancelDescription}
                  className="px-3 py-1 rounded text-xs font-medium bg-[#E5E5E5] dark:bg-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 mt-1 group">
              {project.description ? (
                <>
                  <p className="text-2xs flex-1 text-[#64748b] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'", fontSize: '11px' }}>
                    {project.description}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingDescription(true)
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] rounded"
                    title="Edit description">
                    <Edit2 className="h-3 w-3" style={{ color: '#9A9FA6' }} />
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingDescription(true)
                  }}
                  className="text-2xs opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'", fontSize: '11px' }}>
                  + Add description
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions Row - Horizontal */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {isEditing ? (
            <>
              <button
                onClick={onSaveEdit}
                className="px-2 py-1 rounded text-xs font-medium bg-[#0074FB] text-white"
                style={{ fontFamily: "'Breeze Sans'" }}>
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="px-2 py-1 rounded text-xs font-medium bg-[#E5E5E5] dark:bg-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]"
                style={{ fontFamily: "'Breeze Sans'" }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEdit()
                }}
                className="hover:bg-white dark:hover:bg-[#3A3A3C] rounded p-1.5 transition-colors"
                title="Edit project">
                <Edit2 className="h-4 w-4" style={{ color: '#9A9FA6' }} />
              </button>
              
              {project.sites && project.sites.length > 0 && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    
                    // Get current window
                    const currentWindow = await chrome.windows.getCurrent()
                    
                    // Find and delete any existing tab group with this project name
                    const allGroups = await chrome.tabGroups.query({})
                    const existingGroup = allGroups.find(g => g.title === project.name && g.windowId === currentWindow.id)
                    
                    if (existingGroup) {
                      // Ungroup all tabs in the existing group
                      const tabs = await chrome.tabs.query({ windowId: currentWindow.id })
                      const groupTabs = tabs.filter(t => t.groupId === existingGroup.id)
                      for (const tab of groupTabs) {
                        if (tab.id) {
                          await chrome.tabs.ungroup(tab.id)
                        }
                      }
                    }
                    
                    // Create fresh new group
                    const tabIds: number[] = []
                    for (const site of project.sites) {
                      const url = site.url.startsWith('http') ? site.url : `https://${site.url}`
                      const tab = await chrome.tabs.create({ url })
                      if (tab.id) tabIds.push(tab.id)
                    }
                    
                    if (tabIds.length > 0) {
                      const groupId = await chrome.tabs.group({ tabIds })
                      chrome.tabGroups.update(groupId, {
                        title: project.name,
                        collapsed: false
                      }).catch((error) => {
                        console.error('Failed to update tab group:', error)
                      })
                    }
                  }}
                  className="hover:bg-white dark:hover:bg-[#3A3A3C] rounded p-1.5 transition-colors"
                  title="Open all sites">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#9A9FA6' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowReminderDialog(true)
                }}
                disabled={!!project.reminder?.snoozedUntil && Date.now() < project.reminder.snoozedUntil}
                className="hover:bg-white dark:hover:bg-[#3A3A3C] rounded p-1.5 transition-colors relative disabled:opacity-50 disabled:cursor-not-allowed"
                title={project.reminder?.enabled ? "Reminder active" : "Set reminder"}>
                {project.reminder?.enabled ? (
                  <Bell className="h-4 w-4" style={{ color: '#0074FB' }} />
                ) : (
                  <BellOff className="h-4 w-4" style={{ color: '#9A9FA6' }} />
                )}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="hover:bg-red-100 rounded p-1.5 transition-colors"
                title="Delete project">
                <Trash2 className="h-4 w-4" style={{ color: '#9A9FA6' }} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Site Logos + Count (always shown if sites exist) */}
      {project.sites && project.sites.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          {/* Up to 4 site logos */}
          <div className="flex gap-1.5">
            {project.sites.slice(0, 4).map((site, index) => {
                const domain = new URL(site.url.startsWith('http') ? site.url : `https://${site.url}`).hostname
                return (
                  <img
                    key={`${site.url}-${index}`}
                    src={`https://www.google.com/s2/favicons?sz=24&domain=${domain}`}
                    alt={site.title}
                    className="w-6 h-6 rounded flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                    title={site.title || domain}
                  />
                )
              })}
          </div>
          {/* Site count */}
          <div className="flex items-center gap-1 text-xs ml-auto" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>
            <span>{project.sites.length} site{project.sites.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}



      {/* Sites List (shown when expanded) */}
      {isExpanded && project.sites && project.sites.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3 pb-3" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <h4 className="text-xs font-normal m-0 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
              Sites
            </h4>
          </div>
          {project.sites
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, isExpanded ? project.sites.length : 3)
            .map((site, index) => {
              const domain = new URL(site.url.startsWith('http') ? site.url : `https://${site.url}`).hostname

              return (
                <div
                  key={`${site.url}-${index}`}
                  className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors group bg-[#FAFAFA] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]"
                  onClick={(e) => e.stopPropagation()}>
                  <img
                    src={`https://www.google.com/s2/favicons?sz=24&domain=${domain}`}
                    alt={site.title}
                    className="w-6 h-6 rounded flex-shrink-0 mt-0.5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      const fullUrl = site.url.startsWith('http') ? site.url : `https://${site.url}`
                      chrome.runtime.sendMessage({ type: 'SITE_OPENED_FROM_SIDEPANEL', payload: { url: fullUrl } })
                      chrome.tabs.create({ url: fullUrl })
                    }}
                    title={`Open ${site.url}`}>
                    <p className="text-xs truncate mb-0.5 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'", fontWeight: 500 }}>
                      {site.title}
                    </p>
                    <p className="text-2xs truncate text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
                      {domain}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onRemoveSite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`Remove ${site.title} from this project?`)) {
                            onRemoveSite(site.url)
                          }
                        }}
                        className="p-1 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove site">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#EF4444' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          {!isExpanded && project.sites.length > 3 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="text-2xs py-1 px-2 rounded text-left transition-colors hover:bg-gray-100"
              style={{ color: '#667eea', fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
              + {project.sites.length - 3} more site{project.sites.length - 3 === 1 ? '' : 's'}
            </button>
          )}    
        </div>
      )}

      {/* Expand Icon */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="flex items-center justify-center w-full pt-2 border-t border-[#E5E5E5] dark:border-[#3A3A3C] hover:bg-gray-50 dark:hover:bg-[#3A3A3C] transition-colors">
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          style={{ color: '#9A9FA6' }}
        />
      </button>

      {/* Snooze State Indicator - Right Side Below Delete */}
      {project.reminder?.snoozedUntil && Date.now() < project.reminder.snoozedUntil && (
        <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#3A3A3C]">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[#9A9FA6] dark:text-[#8E8E93]" />
            <span className="text-2xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'", fontSize: '10px' }}>
              Snoozed: {Math.ceil((project.reminder.snoozedUntil - Date.now()) / 1000 / 60)} min remaining
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              chrome.runtime.sendMessage({
                type: "DISMISS_SNOOZE",
                payload: { projectId: project.id }
              }).catch(err => console.error("Failed to dismiss snooze:", err))
            }}
            className="hover:bg-gray-300 dark:hover:bg-[#4A4A4C] rounded p-0.5 transition-colors flex-shrink-0"
            title="Dismiss snooze">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#9A9FA6' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Reminder Dialog */}
      {showReminderDialog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowReminderDialog(false)
            }
          }}>
          <div
            className="bg-white dark:bg-[#2C2C2E] rounded-xl p-4 max-w-sm w-full mx-4 border border-[#E5E5E5] dark:border-[#3A3A3C]"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div className="mb-3">
              <h3 className="text-base font-normal text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Set Reminder
              </h3>
            </div>

            <div className="space-y-3">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-normal text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                  Enable Reminder
                </span>
                <button
                  onClick={() => setReminderForm({ ...reminderForm, enabled: !reminderForm.enabled })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${reminderForm.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${reminderForm.enabled ? 'translate-x-7' : 'translate-x-1'}`}
                  />
                </button>
              </div>

              {reminderForm.enabled && (
                <>
                  {/* Schedule Type */}
                  <div>
                    <label className="block text-xs font-normal mb-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Schedule
                    </label>
                    <div className="flex gap-2">
                      {(['daily', 'once', 'weekly'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setReminderForm({ ...reminderForm, type })}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${reminderForm.type === type ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          style={{ fontFamily: "'Breeze Sans'" }}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Picker */}
                  <div>
                    <label className="block text-xs font-normal mb-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Time
                    </label>
                    <div className="flex gap-2 items-top">
                      {/* Hours */}
                      <div className="flex-1 text-center">
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={parseInt(reminderForm.time.split(':')[0]) % 12 === 0 ? 12 : parseInt(reminderForm.time.split(':')[0]) % 12}
                          onChange={(e) => {
                            let hours = Math.min(12, Math.max(1, parseInt(e.target.value) || 1))
                            const isPM = parseInt(reminderForm.time.split(':')[0]) >= 12
                            const militaryHours = (isPM && hours !== 12 ? hours + 12 : hours === 12 && !isPM ? 0 : hours).toString().padStart(2, '0')
                            const minutes = reminderForm.time.split(':')[1]
                            setReminderForm({ ...reminderForm, time: `${militaryHours}:${minutes}` })
                          }}
                          className="w-full px-2 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] text-center text-sm font-medium bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                          style={{ fontFamily: "'Breeze Sans'" }}
                        />
                        <p className="text-xs mt-1" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>Hours</p>
                      </div>

                      {/* Separator */}
                      <span className="text-lg font-normal" style={{ color: '#9A9FA6' }}>:</span>

                      {/* Minutes */}
                      <div className="flex-1 text-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={reminderForm.time.split(':')[1]}
                          onChange={(e) => {
                            const minutes = Math.min(59, Math.max(0, parseInt(e.target.value) || 0)).toString().padStart(2, '0')
                            const hours = reminderForm.time.split(':')[0]
                            setReminderForm({ ...reminderForm, time: `${hours}:${minutes}` })
                          }}
                          className="w-full px-2 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] text-center text-sm font-medium bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                          style={{ fontFamily: "'Breeze Sans'" }}
                        />
                        <p className="text-xs mt-1" style={{ color: '#9A9FA6', fontFamily: "'Breeze Sans'" }}>Minutes</p>
                      </div>

                      {/* AM/PM Toggle */}
                      <div className="flex-1 flex flex-col h-10 gap-0">
                        {['AM', 'PM'].map((period) => {
                          const isAM = parseInt(reminderForm.time.split(':')[0]) < 12
                          const isPeriodActive = (period === 'AM' && isAM) || (period === 'PM' && !isAM)
                          return (
                            <button
                              key={period}
                              onClick={() => {
                                const [hours, minutes] = reminderForm.time.split(':')
                                const currentHours = parseInt(hours)
                                let newHours = currentHours
                                if (period === 'AM' && currentHours >= 12) {
                                  newHours = currentHours === 12 ? 0 : currentHours - 12
                                } else if (period === 'PM' && currentHours < 12) {
                                  newHours = currentHours === 0 ? 12 : currentHours + 12
                                }
                                setReminderForm({ ...reminderForm, time: `${newHours.toString().padStart(2, '0')}:${minutes}` })
                              }}
                              className={`flex-1 px-2 rounded text-xs font-medium transition-colors w-full ${isPeriodActive ? 'text-white' : 'bg-gray-100 text-gray-700'}`}
                              style={{
                                backgroundColor: isPeriodActive ? '#0074FB' : '#F5F5F5',
                                fontFamily: "'Breeze Sans'"
                              }}>
                              {period}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Date Picker (for once) */}
                  {reminderForm.type === 'once' && (
                    <div>
                      <label className="block text-xs font-normal mb-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        Date
                      </label>
                      <input
                        type="date"
                        value={reminderForm.date}
                        onChange={(e) => setReminderForm({ ...reminderForm, date: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#1C1C1E] text-[#080A0B] dark:text-[#FFFFFF]"
                        style={{ fontFamily: "'Breeze Sans'" }}
                      />
                    </div>
                  )}

                  {/* Days of Week (for weekly) */}
                  {reminderForm.type === 'weekly' && (
                    <div>
                      <label className="block text-xs font-normal mb-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        Days of Week
                      </label>
                      <div className="flex gap-2">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => {
                          const isSelected = reminderForm.daysOfWeek.includes(index)
                          return (
                            <button
                              key={index}
                              onClick={() => {
                                const newDays = isSelected
                                  ? reminderForm.daysOfWeek.filter(d => d !== index)
                                  : [...reminderForm.daysOfWeek, index].sort((a, b) => a - b)
                                setReminderForm({ ...reminderForm, daysOfWeek: newDays })
                              }}
                              className={`flex-1 w-8 h-8 rounded-full text-xs font-medium transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                              style={{ fontFamily: "'Breeze Sans'" }}>
                              {day}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowReminderDialog(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#E5E5E5] dark:bg-[#3A3A3C] text-[#080A0B] dark:text-[#FFFFFF]"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Cancel
                </button>
                <button
                  onClick={handleSaveReminder}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#0074FB] text-white"
                  style={{ fontFamily: "'Breeze Sans'" }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { ProjectsPanel, ProjectCard }
