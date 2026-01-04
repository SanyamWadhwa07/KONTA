/**
 * Project Reminder Manager
 * Handles scheduling, triggering, and managing project reminders using chrome.alarms API
 */

import type { Project, ProjectReminder } from "~/types/project"
import type { AppSettings } from "../types/settings"
import { DEFAULT_SETTINGS } from "../types/settings"
import { log, warn } from "~/lib/logger"

const REMINDER_ALARM_PREFIX = "project-reminder-"
const MAX_SNOOZE_COUNT = 3
const SNOOZE_DURATION_MS = 10 * 60 * 1000 // 10 minutes

// Helper to load notification settings
async function loadNotificationSettings(): Promise<AppSettings["notifications"]> {
  try {
    const result = await chrome.storage.local.get("aegis-settings")
    const settings = result["aegis-settings"] as AppSettings | undefined
    return settings?.notifications ?? DEFAULT_SETTINGS.notifications
  } catch (error) {
    console.warn("[ReminderManager] Failed to load settings, using defaults:", error)
    return DEFAULT_SETTINGS.notifications
  }
}

/**
 * Schedule or update a reminder alarm for a project
 */
export async function scheduleReminder(projectId: string, reminder: ProjectReminder): Promise<void> {
  const alarmName = `${REMINDER_ALARM_PREFIX}${projectId}`
  
  // Cancel existing alarm
  await chrome.alarms.clear(alarmName)
  
  if (!reminder.enabled) {
    log(`[ReminderManager] Reminder disabled for project ${projectId}`)
    return
  }
  
  const now = new Date()
  const nextTrigger = calculateNextTrigger(reminder, now)
  
  if (!nextTrigger) {
    log(`[ReminderManager] No valid next trigger for project ${projectId}`)
    return
  }
  
  // Create alarm
  await chrome.alarms.create(alarmName, {
    when: nextTrigger.getTime()
  })
  
  log(`[ReminderManager] Scheduled reminder for project ${projectId} at ${nextTrigger.toLocaleString()}`)
}

/**
 * Cancel a reminder for a project
 */
export async function cancelReminder(projectId: string): Promise<void> {
  const alarmName = `${REMINDER_ALARM_PREFIX}${projectId}`
  await chrome.alarms.clear(alarmName)
  log(`[ReminderManager] Cancelled reminder for project ${projectId}`)
}

/**
 * Calculate the next trigger time based on reminder settings
 */
function calculateNextTrigger(reminder: ProjectReminder, fromDate: Date): Date | null {
  // Validate time format
  if (!reminder.time || !reminder.time.includes(':')) {
    warn(`[ReminderManager] Invalid time format: ${reminder.time}`)
    return null
  }
  
  const timeParts = reminder.time.split(':')
  if (timeParts.length !== 2) {
    warn(`[ReminderManager] Invalid time format: ${reminder.time}`)
    return null
  }
  
  const hours = parseInt(timeParts[0], 10)
  const minutes = parseInt(timeParts[1], 10)
  
  // Validate hours and minutes
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    warn(`[ReminderManager] Invalid time values: ${hours}:${minutes}`)
    return null
  }
  
  if (reminder.type === 'once') {
    if (!reminder.date) {
      warn('[ReminderManager] One-time reminder missing date')
      return null
    }
    
    // Parse date in local timezone (not UTC) by splitting the YYYY-MM-DD format
    const [year, month, day] = reminder.date.split('-').map(Number)
    const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
    
    // Validate date
    if (isNaN(targetDate.getTime())) {
      warn(`[ReminderManager] Invalid date: ${reminder.date}`)
      return null
    }
    
    // Only schedule if in the future (allow current minute to account for user interaction time)
    if (targetDate.getTime() > fromDate.getTime()) {
      return targetDate
    }
    
    warn(`[ReminderManager] One-time reminder date ${targetDate.toLocaleString()} (${targetDate.toISOString()}) is in the past or too close to current time`)
    return null
  }
  
  if (reminder.type === 'daily') {
    const nextTrigger = new Date(fromDate)
    nextTrigger.setHours(hours, minutes, 0, 0)
    
    // If time has passed today, schedule for tomorrow
    if (nextTrigger.getTime() <= fromDate.getTime()) {
      nextTrigger.setDate(nextTrigger.getDate() + 1)
    }
    
    return nextTrigger
  }
  
  if (reminder.type === 'weekly') {
    if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
      warn('[ReminderManager] Weekly reminder missing days of week')
      return null
    }
    
    // Validate days of week (0-6 for Sunday-Saturday)
    const validDays = reminder.daysOfWeek.filter(day => day >= 0 && day <= 6)
    if (validDays.length === 0) {
      warn(`[ReminderManager] No valid days of week: ${reminder.daysOfWeek}`)
      return null
    }
    
    const nextTrigger = new Date(fromDate)
    nextTrigger.setHours(hours, minutes, 0, 0)
    
    // Find next matching day of week
    for (let i = 0; i < 8; i++) { // Check up to 7 days ahead (including today)
      const checkDate = new Date(nextTrigger)
      checkDate.setDate(checkDate.getDate() + i)
      
      const dayOfWeek = checkDate.getDay()
      
      // Check if this day is in the selected days AND is in the future
      if (validDays.includes(dayOfWeek) && checkDate.getTime() > fromDate.getTime()) {
        return checkDate
      }
    }
    
    warn(`[ReminderManager] Could not find next trigger for weekly reminder with days ${validDays}`)
    return null
  }
  
  warn(`[ReminderManager] Unknown reminder type: ${reminder.type}`)
  return null
}

/**
 * Handle alarm trigger for project reminders
 */
export async function handleReminderAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (!alarm.name.startsWith(REMINDER_ALARM_PREFIX)) return
  
  const projectId = alarm.name.replace(REMINDER_ALARM_PREFIX, '')
  log(`[ReminderManager] Alarm triggered for project ${projectId}`)
  
  // Load project
  const result = await chrome.storage.local.get("aegis-projects")
  const projects: Project[] = result["aegis-projects"] || []
  const project = projects.find(p => p.id === projectId)
  
  if (!project || !project.reminder?.enabled) {
    log(`[ReminderManager] Project not found or reminder disabled: ${projectId}`)
    return
  }
  
  // Check if snoozed
  if (project.reminder.snoozedUntil && Date.now() < project.reminder.snoozedUntil) {
    log(`[ReminderManager] Reminder snoozed until ${new Date(project.reminder.snoozedUntil).toLocaleString()}`)
    
    // Reschedule for snooze end time
    await chrome.alarms.create(alarm.name, {
      when: project.reminder.snoozedUntil
    })
    return
  }
  
  // Reset snooze count on natural trigger
  project.reminder.snoozeCount = 0
  project.reminder.snoozedUntil = undefined
  project.reminder.lastTriggered = Date.now()
  
  // Save updated project
  await chrome.storage.local.set({ "aegis-projects": projects })
  
  // Send notification to indicator
  await sendReminderNotification(projectId, project)
  
  // Reschedule for next occurrence (for daily/weekly reminders)
  if (project.reminder.type !== 'once') {
    await scheduleReminder(projectId, project.reminder)
  } else {
    // Disable one-time reminder after it fires
    project.reminder.enabled = false
    await chrome.storage.local.set({ "aegis-projects": projects })
  }
}

/**
 * Send reminder notification to the indicator content script
 */
async function sendReminderNotification(projectId: string, project: Project): Promise<void> {
  try {
    // Find all tabs to inject indicator if not present
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    

    for (const tab of tabs) {
      if (!tab.id) continue
      
      // Send message to indicator
      await chrome.tabs.sendMessage(tab.id, {
        type: "show-project-reminder",
        payload: {
          projectId: projectId,
          projectName: project.name,
          projectDescription: project.description || "",
          snoozeCount: project.reminder?.snoozeCount || 0
        }
      }).catch(err => {
        log(`[ReminderManager] Could not send to tab ${tab.id}:`, err.message)
      })
    }
  } catch (err) {
    console.error("[ReminderManager] Failed to send notification:", err)
  }
}

/**
 * Snooze a project reminder
 */
export async function snoozeReminder(projectId: string): Promise<boolean> {
  const result = await chrome.storage.local.get("aegis-projects")
  const projects: Project[] = result["aegis-projects"] || []
  const project = projects.find(p => p.id === projectId)
  
  if (!project || !project.reminder) {
    return false
  }
  
  // Check snooze limit
  if (project.reminder.snoozeCount >= MAX_SNOOZE_COUNT) {
    log(`[ReminderManager] Max snooze count reached for project ${projectId}`)
    return false
  }
  
  // Set snooze
  project.reminder.snoozeCount++
  project.reminder.snoozedUntil = Date.now() + SNOOZE_DURATION_MS
  
  await chrome.storage.local.set({ "aegis-projects": projects })
  
  // Reschedule alarm for snooze end
  const alarmName = `${REMINDER_ALARM_PREFIX}${projectId}`
  await chrome.alarms.create(alarmName, {
    when: project.reminder.snoozedUntil
  })
  
  log(`[ReminderManager] Snoozed project ${projectId} until ${new Date(project.reminder.snoozedUntil).toLocaleString()} (count: ${project.reminder.snoozeCount})`)
  
  return true
}

/**
 * Dismiss a project reminder entirely
 */
export async function dismissReminder(projectId: string): Promise<void> {
  const result = await chrome.storage.local.get("aegis-projects")
  const projects: Project[] = result["aegis-projects"] || []
  const project = projects.find(p => p.id === projectId)
  
  if (!project || !project.reminder) {
    return
  }
  
  // Disable reminder
  project.reminder.enabled = false
  project.reminder.snoozeCount = 0
  project.reminder.snoozedUntil = undefined
  
  await chrome.storage.local.set({ "aegis-projects": projects })
  
  // Cancel alarm
  await cancelReminder(projectId)
  
  log(`[ReminderManager] Dismissed reminder for project ${projectId}`)
}

/**
 * Re-register all active reminders (call on extension startup)
 */
export async function reregisterAllReminders(): Promise<void> {
  log("[ReminderManager] Re-registering all active reminders...")
  
  const result = await chrome.storage.local.get("aegis-projects")
  const projects: Project[] = result["aegis-projects"] || []
  
  let count = 0
  for (const project of projects) {
    if (project.reminder?.enabled) {
      await scheduleReminder(project.id, project.reminder)
      count++
    }
  }
  
  log(`[ReminderManager] Re-registered ${count} active reminders`)
}

/**
 * Open project sites in a tab group, reusing existing group if available
 */
export async function openProjectInTabGroup(projectId: string): Promise<void> {
  try {
    // Load project
    const result = await chrome.storage.local.get("aegis-projects")
    const projects: Project[] = result["aegis-projects"] || []
    const project = projects.find(p => p.id === projectId)
    
    if (!project) {
      console.error(`[ReminderManager] Project not found: ${projectId}`)
      return
    }
    
    // Get current window
    const currentWindow = await chrome.windows.getCurrent()
    
    // Get all tab groups (including closed ones)
    const allGroups = await chrome.tabGroups.query({})
    
    // Find existing group with project name in current window
    let targetGroup = allGroups.find(g => g.title === project.name && g.windowId === currentWindow.id)
    
    // Get all tabs in current window
    const allTabs = await chrome.tabs.query({ windowId: currentWindow.id })
    
    if (targetGroup) {
      // Group exists - check which sites are already open in this group
      const groupTabs = allTabs.filter(t => t.groupId === targetGroup!.id)
      const openUrls = new Set(groupTabs.map(t => t.url).filter(Boolean))
      
      log(`[ReminderManager] Found existing group "${project.name}" with ${groupTabs.length} tabs`)
      
      // Open missing sites
      const tabsToAdd: number[] = []
      for (const site of project.sites) {
        const siteUrl = site.url.startsWith('http') ? site.url : `https://${site.url}`
        if (!openUrls.has(site.url) && !openUrls.has(siteUrl)) {
          const newTab = await chrome.tabs.create({
            url: siteUrl,
            active: false,
            windowId: currentWindow.id
          })
          if (newTab.id) {
            tabsToAdd.push(newTab.id)
          }
        }
      }
      
      // Add new tabs to existing group
      if (tabsToAdd.length > 0) {
        await chrome.tabs.group({
          groupId: targetGroup.id,
          tabIds: tabsToAdd
        })
        log(`[ReminderManager] Added ${tabsToAdd.length} missing sites to group`)
      }
      
      // Expand and activate the group
      await chrome.tabGroups.update(targetGroup.id, { collapsed: false })
      
      // Activate the first tab in the group
      const firstTab = allTabs.find(t => t.groupId === targetGroup!.id)
      if (firstTab?.id) {
        await chrome.tabs.update(firstTab.id, { active: true })
      }
    } else {
      // Create new group with all project sites
      log(`[ReminderManager] Creating new group "${project.name}" with ${project.sites.length} sites`)
      
      const tabIds: number[] = []
      for (const site of project.sites) {
        const siteUrl = site.url.startsWith('http') ? site.url : `https://${site.url}`
        const newTab = await chrome.tabs.create({
          url: siteUrl,
          active: false,
          windowId: currentWindow.id
        })
        if (newTab.id) {
          tabIds.push(newTab.id)
        }
      }
      
      if (tabIds.length > 0) {
        const groupId = await chrome.tabs.group({ tabIds })
        await chrome.tabGroups.update(groupId, {
          title: project.name,
          color: 'blue',
          collapsed: false
        })
        
        // Activate first tab
        await chrome.tabs.update(tabIds[0], { active: true })
      }
    }
  } catch (err) {
    console.error("[ReminderManager] Failed to open project in tab group:", err)
  }
}
