import { X } from "lucide-react"
import type { AppSettings } from "~/types/settings"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdateSettings: (settings: AppSettings) => void
  expandedSections: string[]
  onToggleSection: (section: string) => void
  // Data stats
  sessionsCount: number
  labelsCount: number
  pagesCount: number
  projectsCount: number
  candidatesCount: number
  // Handlers
  onClearAllSessions: () => void
  onClearAllProjects: () => void
  onExportData: () => void
  onImportData: () => void
  onClearAllData: () => void
  onResetAllSettings: () => void
  onReloadExtension: () => void
  // Excluded domains
  newExcludedDomain: string
  onNewExcludedDomainChange: (value: string) => void
  onAddExcludedDomain: () => void
  onRemoveExcludedDomain: (domain: string) => void
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  sessionsCount,
  labelsCount,
  pagesCount,
  projectsCount,
  candidatesCount,
  onClearAllSessions,
  onClearAllProjects,
  onExportData,
  onImportData,
  onClearAllData,
  onResetAllSettings,
  onReloadExtension
}: SettingsModalProps) {
  if (!isOpen) return null

  const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      style={{
        width: '40px',
        height: '20px',
        backgroundColor: enabled ? '#0072df' : '#E5E5E5',
        borderRadius: '10px',
        transition: 'background-color 0.3s',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: enabled ? '20px' : '2px',
        border: 'none',
        cursor: 'pointer'
      }}>
      <div
        style={{
          width: '16px',
          height: '16px',
          backgroundColor: 'white',
          borderRadius: '50%',
          transition: 'all 0.3s'
        }}
      />
    </button>
  )

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-30 dark:bg-opacity-60 z-40 transition-opacity" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 bg-white dark:bg-[#1C1C1E] w-full shadow-xl transition-transform duration-300 ease-in-out overflow-y-auto">
        <div className="bg-white dark:bg-[#1C1C1E] rounded-lg p-4 w-full h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pt-2">
            <h2 className="text-xl font text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
              Settings
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors text-[#0072df] dark:text-[#4A9FFF]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {/* Appearance Section */}
            <div className="pb-3 border-b border-[#E5E5E5] dark:border-[#2C2C2E]">
              <h3 className="text-sm font-normal mb-2 text-[#0072df] dark:text-[#4A9FFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Appearance
              </h3>
              <div className="flex flex-col gap-2">
                <div
                  onClick={() => onUpdateSettings({
                    ...settings,
                    ui: { ...settings.ui, darkMode: !settings.ui.darkMode }
                  })}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] flex items-center justify-between bg-white dark:bg-[#2C2C2E] cursor-pointer">
                  <div>
                    <div className="font-medium flex items-center gap-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      Dark Mode
                    </div>
                  </div>
                  <ToggleSwitch enabled={settings.ui.darkMode} onChange={() => {}} />
                </div>
              </div>
            </div>


            {/* Notifications Section */}
            <div className="pb-3 border-b border-[#E5E5E5] dark:border-[#2C2C2E]">
              <h3 className="text-sm font-normal mb-2 text-[#0072df] dark:text-[#4A9FFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Notifications
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onUpdateSettings({
                    ...settings,
                    notifications: { ...settings.notifications, projectDetection: !settings.notifications.projectDetection }
                  })}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] flex items-center justify-between bg-white dark:bg-[#2C2C2E]">
                  <div>
                    <div className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>Project Detection</div>
                  </div>
                  <ToggleSwitch enabled={settings.notifications.projectDetection} onChange={() => {}} />
                </button>

                <button
                  onClick={() => onUpdateSettings({
                    ...settings,
                    notifications: { ...settings.notifications, projectSuggestions: !settings.notifications.projectSuggestions }
                  })}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] flex items-center justify-between bg-white dark:bg-[#2C2C2E]">
                  <div>
                    <div className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>Project Suggestions</div>
                  </div>
                  <ToggleSwitch enabled={settings.notifications.projectSuggestions} onChange={() => {}} />
                </button>

                {/* <div className="px-3 py-2 rounded-lg border" style={{ borderColor: '#E5E5E5', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: '#080A0B', fontFamily: "'Breeze Sans'" }}>
                    Position: {settings.notifications.position} | Duration: {settings.notifications.durationSeconds}s
                  </div>
                </div> */}
              </div>
            </div>

            {/* Privacy & Data Section */}
            <div className="pb-3 border-b border-[#E5E5E5] dark:border-[#2C2C2E]">
              <h3 className="text-sm font-normal mb-2 text-[#0072df] dark:text-[#4A9FFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Privacy & Data
              </h3>
              <div className="flex flex-col gap-2">
                {settings.privacy.excludedDomains.length > 0 && (
                  <div className="px-3 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] text-xs bg-white dark:bg-[#2C2C2E]">
                    <div className="font-medium mb-1 text-[#080A0B] dark:text-[#FFFFFF]">Excluded: {settings.privacy.excludedDomains.join(', ')}</div>
                  </div>
                )}

                <button
                  onClick={onExportData}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium flex items-center gap-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export All Data
                  </div>
                </button>

                <button
                  onClick={onImportData}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium flex items-center gap-2 text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import Data
                  </div>
                </button>

                <button
                  onClick={onClearAllSessions}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium flex items-center gap-2 text-[#dc2626] dark:text-[#FF6B6B]" style={{ fontFamily: "'Breeze Sans'" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All Sessions
                  </div>
                </button>

                <button
                  onClick={onClearAllProjects}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium text-[#dc2626] dark:text-[#FF6B6B]" style={{ fontFamily: "'Breeze Sans'" }}>Clear All Projects</div>
                </button>

                <button
                  onClick={onClearAllData}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium text-[#dc2626] dark:text-[#FF6B6B]" style={{ fontFamily: "'Breeze Sans'" }}>Nuclear Reset</div>
                </button>
              </div>
            </div>

            {/* Developer Section */}
            <div className="pb-3 border-b border-[#E5E5E5] dark:border-[#2C2C2E]">
              <h3 className="text-sm font-normal mb-2 text-[#0072df] dark:text-[#4A9FFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Developer
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onUpdateSettings({
                    ...settings,
                    developer: { ...settings.developer, debugMode: !settings.developer.debugMode }
                  })}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] flex items-center justify-between bg-white dark:bg-[#2C2C2E]">
                  <div>
                    <div className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>Debug Mode</div>
                  </div>
                  <ToggleSwitch enabled={settings.developer.debugMode} onChange={() => {}} />
                </button>

                <button
                  onClick={() => onUpdateSettings({
                    ...settings,
                    developer: { ...settings.developer, showCoiPanel: !settings.developer.showCoiPanel }
                  })}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] flex items-center justify-between bg-white dark:bg-[#2C2C2E]">
                  <div>
                    <div className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>Show COI Panel</div>
                  </div>
                  <ToggleSwitch enabled={settings.developer.showCoiPanel} onChange={() => {}} />
                </button>

                <button
                  onClick={onResetAllSettings}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium text-[#dc2626] dark:text-[#FF6B6B]" style={{ fontFamily: "'Breeze Sans'" }}>Reset All Settings</div>
                </button>

                <button
                  onClick={onReloadExtension}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2C2C2E] border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]">
                  <div className="font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>Reload Extension</div>
                </button>
              </div>
            </div>

            {/* About Section */}
            <div className="mb-4">
              <h3 className="text-sm font-normal mb-2 text-[#0072df] dark:text-[#4A9FFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                About
              </h3>
              <div className="px-3 py-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-[#F5F5F5] dark:bg-[#2C2C2E]">
                <div className="text-xs text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#9A9FA6] dark:text-[#8E8E93]">Version:</span>
                    <span className="text-sm text-[#080A0B] dark:text-[#FFFFFF]">v0.0.1</span>
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
            </div>
          </div>

          {/* Close Button */}
          {/* <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-lg transition-all font-medium border"
              style={{
                backgroundColor: '#0072df',
                color: '#FFFFFF',
                fontFamily: "'Breeze Sans'",
                borderColor: '#0072df'
              }}>
              Close
            </button>
          </div> */}
        </div>
      </div>
    </>
  )
}
