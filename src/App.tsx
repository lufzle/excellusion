import { useState, useCallback, useMemo } from 'react'
import { HybridSheet } from '~/components/HybridSheet'
import { FullSheet } from '~/components/FullSheet'
import { LogPane } from '~/components/LogPane'
import type { LogEntry } from '~/components/LogPane'
import { createClient } from '~/lib/llm'
import type Anthropic from '@anthropic-ai/sdk'

const HYBRID_EXPLANATION = `The spreadsheet UI is coded in React — but there is no data layer. No variables, no arrays, no maps hold cell values. When you edit a cell and press Enter, the edit is sent directly to Claude Haiku 4.5. The LLM returns a JSON array of all cell states, and the grid renders it. The LLM is the only source of truth — there is no formula parser, no evaluation engine, no storage.`

const FULL_EXPLANATION = `The LLM generates the entire UI as pure static HTML — no JavaScript, no event handlers, no client code beyond a thin event capture layer. When you click or type, the browser takes a screenshot of the spreadsheet (with a red crosshair on clicks), serializes the raw DOM event, and sends both to Claude Haiku 4.5. The LLM looks at the screenshot, interprets the event, and returns a complete HTML snapshot.`

type Tab = 'hybrid' | 'full'

export function App() {
  const [tab, setTab] = useState<Tab>('hybrid')
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('anthropic_api_key') ?? '')
  const [hybridLogs, setHybridLogs] = useState<LogEntry[]>([])
  const [fullLogs, setFullLogs] = useState<LogEntry[]>([])

  const client = useMemo<Anthropic | null>(
    () => apiKey ? createClient(apiKey) : null,
    [apiKey],
  )

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value)
    sessionStorage.setItem('anthropic_api_key', value)
  }, [])

  const addHybridLog = useCallback((entry: LogEntry) => { setHybridLogs((prev) => [...prev, entry]) }, [])
  const addFullLog = useCallback((entry: LogEntry) => { setFullLogs((prev) => [...prev, entry]) }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'hybrid', label: 'Hybrid' },
    { id: 'full', label: 'Full' },
  ]
  const explanations: Record<Tab, string> = { hybrid: HYBRID_EXPLANATION, full: FULL_EXPLANATION }
  const logs: Record<Tab, LogEntry[]> = { hybrid: hybridLogs, full: fullLogs }

  return (
    <div className="flex flex-col h-screen select-none"
      style={{ fontFamily: "'Aptos', 'Calibri', 'Segoe UI', system-ui, sans-serif" }}>
      <div className="h-8 flex items-center px-3 gap-2 shrink-0"
        style={{ background: 'linear-gradient(180deg, #227a4b 0%, #1a6b3f 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-90">
          <rect x="1" y="1" width="14" height="14" rx="2" fill="#fff" fillOpacity="0.2" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.5"/>
          <path d="M4 4h3v3H4zM9 4h3v3H9zM4 9h3v3H4zM9 9h3v3H9z" fill="#fff" fillOpacity="0.7"/>
        </svg>
        <span className="text-white/95 text-[11px] font-medium tracking-wide">Excellusion</span>
        <div className="ml-auto flex items-center gap-1.5">
          <label className="text-white/60 text-[10px]" htmlFor="api-key">Anthropic API Key</label>
          <input id="api-key" type="password" placeholder="sk-ant-..." value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ width: 180, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', outline: 'none' }} />
        </div>
      </div>
      <div className="flex items-end px-2 gap-0 shrink-0 border-b"
        style={{ background: 'linear-gradient(180deg, #f8f8f8 0%, #f0f0f0 100%)', borderColor: '#d1d1d1' }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="pb-1.5 pt-1.5 px-4 text-[11px] border-b-2 transition-colors cursor-pointer"
            style={{ color: tab === t.id ? '#217346' : '#616161', borderColor: tab === t.id ? '#217346' : 'transparent', fontWeight: tab === t.id ? 600 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="shrink-0 px-4 py-3 border-b"
        style={{ background: '#fafdf8', borderColor: '#d8e8d4', fontSize: 12, lineHeight: '1.5', color: '#4a5a46' }}>
        {explanations[tab]}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {!client ? (
            <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: '#888' }}>Enter your Anthropic API key above to start.</div>
          ) : (
            <>
              {tab === 'hybrid' && <HybridSheet client={client} onLog={addHybridLog} />}
              {tab === 'full' && <FullSheet client={client} onLog={addFullLog} />}
            </>
          )}
        </div>
        <div style={{ width: 360, borderLeft: '1px solid #ccc' }} className="shrink-0">
          <LogPane entries={logs[tab]} mode={tab === 'hybrid' ? 'hybrid' : 'full'} />
        </div>
      </div>
    </div>
  )
}
