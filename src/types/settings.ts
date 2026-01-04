export interface AppSettings {
  // Project Detection Settings
  projectDetection: {
    enabled: boolean
    sensitivity: 'conservative' | 'balanced' | 'aggressive'
    showNotifications: boolean
    minVisits: number
    minSessions: number
    maxCandidateAgeDays: number
  }
  
  // Privacy & Data Settings
  privacy: {
    dataRetentionDays: number | null // null = forever
    excludedDomains: string[]
    trackIncognito: boolean
  }
  
  // Notification Settings
  notifications: {
    projectDetection: boolean
    reminders: boolean
    projectSuggestions: boolean
    position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
    durationSeconds: number
    autoDismiss: boolean
  }
  
  // Developer Settings
  developer: {
    debugMode: boolean
    devModeThresholds: boolean
    showCoiPanel: boolean
    showCoiNotifications: boolean
    coiThreshold: number // 0.0 - 1.0, trigger alert when exceeded
    coiNotificationCooldownMinutes: number
    showPerformanceMetrics: boolean
  }
  
  // UI Settings
  ui: {
    darkMode: boolean
    defaultTimelineView: 'sessions' | 'clusters'
    autoExpandFirstDay: boolean
    autoExpandSessions: boolean
    sessionsPerDayLimit: number
    compactView: boolean
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  projectDetection: {
    enabled: true,
    sensitivity: 'balanced',
    showNotifications: true,
    minVisits: 3,
    minSessions: 2,
    maxCandidateAgeDays: 7
  },
  privacy: {
    dataRetentionDays: null, // forever
    excludedDomains: [],
    trackIncognito: false
  },
  notifications: {
    projectDetection: true,
    reminders: true,
    projectSuggestions: true,
    position: 'top-right',
    durationSeconds: 15,
    autoDismiss: true
  },
  developer: {
    debugMode: false,
    devModeThresholds: false,
    showCoiPanel: false,
    showCoiNotifications: false,
    coiThreshold: 0.55,
    coiNotificationCooldownMinutes: 5,
    showPerformanceMetrics: false
  },
  ui: {
    darkMode: false,
    defaultTimelineView: 'sessions',
    autoExpandFirstDay: true,
    autoExpandSessions: true,
    sessionsPerDayLimit: 3,
    compactView: false
  }
}

// Helper to get sensitivity score threshold
export function getSensitivityThreshold(sensitivity: AppSettings['projectDetection']['sensitivity']): number {
  switch (sensitivity) {
    case 'conservative': return 80
    case 'balanced': return 60
    case 'aggressive': return 40
    default: return 60
  }
}
