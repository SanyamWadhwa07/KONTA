import { ChevronDown, ShieldCheck, Database, Lock, Eye, Server, Globe, CheckCircle2 } from "lucide-react"
import { useState } from "react"

export function PrivacyStatement() {
  const [expanded, setExpanded] = useState(false)
  const [dataCollectionExpanded, setDataCollectionExpanded] = useState(true)
  const [storageExpanded, setStorageExpanded] = useState(true)
  const [usageExpanded, setUsageExpanded] = useState(true)
  const [permissionsExpanded, setPermissionsExpanded] = useState(true)
  const [guaranteesExpanded, setGuaranteesExpanded] = useState(true)

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors">
        <ChevronDown
          className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`}
        />
        <span className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
          See Privacy Details
        </span>
        <ShieldCheck className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
      </button>

      {expanded && (
        <div className="space-y-3 pt-2">
          {/* Data Collection Section */}
          <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
            <button
              onClick={() => setDataCollectionExpanded(!dataCollectionExpanded)}
              className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
              <ChevronDown
                className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                  dataCollectionExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <Eye className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
              <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                What We Capture
              </h4>
            </button>
            {dataCollectionExpanded && (
              <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                <div className="space-y-3 mt-3">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Browsing Activity
                    </div>
                    <ul className="space-y-1 text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Page URLs, titles, and timestamps</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Page content (text, metadata) for semantic search</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Scroll depth and time spent per page</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Tab switches and focus events</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      User Actions
                    </div>
                    <ul className="space-y-1 text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Sessions (grouped page visits)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Labels you create and assign</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Projects (manual and auto-detected)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Search queries within the extension</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Settings and preferences</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Analytics Metrics
                    </div>
                    <ul className="space-y-1 text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Search latency and embedding generation time</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Cognitive Overload Index (COI) scores</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Break suggestions and acceptance rates</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#0072df] dark:text-[#3e91ff] mt-0.5">•</span>
                        <span>Session durations and usage patterns</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Storage Section */}
          <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
            <button
              onClick={() => setStorageExpanded(!storageExpanded)}
              className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
              <ChevronDown
                className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                  storageExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <Database className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
              <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Where Data is Stored
              </h4>
            </button>
            {storageExpanded && (
              <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                <div className="space-y-2 mt-3">
                  <div className="px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-3 h-3 text-[#10b981]" />
                      <span className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        Chrome Local Storage
                      </span>
                    </div>
                    <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Settings, labels, projects, candidates, blocklist
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-3 h-3 text-[#10b981]" />
                      <span className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        IndexedDB (Browser Database)
                      </span>
                    </div>
                    <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Sessions, page content, embeddings, page events
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-3 h-3 text-[#f59e0b]" />
                      <span className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        In-Memory (Temporary)
                      </span>
                    </div>
                    <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      Performance metrics, COI calculations (cleared on restart)
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-3 h-3 text-[#10b981]" />
                      <span className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        ML Model Cache
                      </span>
                    </div>
                    <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      On-device transformer.js model (all-MiniLM-L6-v2)
                    </div>
                  </div>

                  <div className="mt-2 px-2 py-1.5 rounded bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-700 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-700 dark:text-green-400" style={{ fontFamily: "'Breeze Sans'" }}>
                        All storage is local to your device
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Usage Section */}
          <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
            <button
              onClick={() => setUsageExpanded(!usageExpanded)}
              className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
              <ChevronDown
                className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                  usageExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <Server className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
              <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                How We Use Data
              </h4>
            </button>
            {usageExpanded && (
              <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                <ul className="space-y-2 mt-3 text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0072df] dark:text-[#3e91ff] font-bold">→</span>
                    <span><span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]">Page content</span> → ML embeddings (on-device) → Semantic search</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0072df] dark:text-[#3e91ff] font-bold">→</span>
                    <span><span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]">Visit patterns</span> → Automatic project detection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0072df] dark:text-[#3e91ff] font-bold">→</span>
                    <span><span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]">Time spent + context switches</span> → COI calculation → Break suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0072df] dark:text-[#3e91ff] font-bold">→</span>
                    <span><span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]">Search queries</span> → Find relevant pages from your history</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0072df] dark:text-[#3e91ff] font-bold">→</span>
                    <span><span className="font-medium text-[#080A0B] dark:text-[#FFFFFF]">Labels</span> → Organize and filter sessions</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Permissions Section */}
          <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
            <button
              onClick={() => setPermissionsExpanded(!permissionsExpanded)}
              className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
              <ChevronDown
                className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                  permissionsExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <Globe className="w-4 h-4 text-[#0072df] dark:text-[#3e91ff]" />
              <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Permissions & Why We Need Them
              </h4>
            </button>
            {permissionsExpanded && (
              <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                <div className="space-y-2 mt-3 max-h-80 overflow-y-auto">
                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          Access all websites
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Read page content for semantic indexing and search
                        </div>
                      </div>
                      <code className="text-xs px-2 py-0.5 rounded bg-[#E5E5E5] dark:bg-[#3A3A3C] text-[#9A9FA6] dark:text-[#8E8E93] shrink-0">
                        host_permissions
                      </code>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          tabs
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Monitor active tabs and detect context switches for COI
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          tabGroups
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Manage and organize tabs into project groups
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          sidePanel
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Display the extension interface in Chrome's side panel
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          storage
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Save your sessions, projects, settings locally on device
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          notifications
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Show break suggestions when cognitive overload is high
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          alarms
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Schedule periodic tasks (COI checks, reminders, cleanups)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          declarativeNetRequest
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Block tracking scripts and apply site-specific rules
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          history
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Import past browsing history to build your knowledge base
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1C1C1E] border border-[#E5E5E5] dark:border-[#3A3A3C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                          scripting
                        </div>
                        <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                          Inject content scripts to monitor page interactions
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Privacy Guarantees Section */}
          <div className="rounded-lg border border-[#E5E5E5] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E] hover:border-[#0072df] dark:hover:border-[#3e91ff] transition-colors">
            <button
              onClick={() => setGuaranteesExpanded(!guaranteesExpanded)}
              className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[#F5F5F5] dark:hover:bg-[#1C1C1E] transition-colors rounded-t-lg">
              <ChevronDown
                className={`w-4 h-4 text-[#9A9FA6] dark:text-[#8E8E93] transition-transform ${
                  guaranteesExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <ShieldCheck className="w-4 h-4 text-[#10b981]" />
              <h4 className="text-sm font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                Privacy Guarantees
              </h4>
            </button>
            {guaranteesExpanded && (
              <div className="px-3 pb-3 border-t border-[#E5E5E5] dark:border-[#3A3A3C]">
                <div className="space-y-2 mt-3">
                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        100% Local Processing
                      </div>
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                        All data stays on your device. Nothing leaves your computer.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        On-Device Machine Learning
                      </div>
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                        Embeddings generated locally using transformer.js. No cloud AI services.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        No External Servers
                      </div>
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                        Zero network requests for data processing or analytics.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        No Telemetry or Tracking
                      </div>
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                        We don't collect usage statistics or track your behavior.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        Full User Control
                      </div>
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                        Delete all data anytime from settings. Exclude domains from tracking.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF]" style={{ fontFamily: "'Breeze Sans'" }}>
                        No Sensitive Data Collection
                      </div>
                      <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93] mt-0.5" style={{ fontFamily: "'Breeze Sans'" }}>
                        We don't capture passwords, form inputs, payment info, or incognito activity.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border border-green-200 dark:border-green-800">
                    <div className="text-xs font-medium text-[#080A0B] dark:text-[#FFFFFF] mb-1" style={{ fontFamily: "'Breeze Sans'" }}>
                      Your privacy is our foundation
                    </div>
                    <div className="text-xs text-[#9A9FA6] dark:text-[#8E8E93]" style={{ fontFamily: "'Breeze Sans'" }}>
                      This extension was built with privacy-first principles. Every feature is designed to work entirely offline, with all processing happening on your device.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
