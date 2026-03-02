import { useEffect, useRef, useState } from 'react'
import { HYBRID_SYSTEM, FULL_SYSTEM } from '~/lib/llm'

export type LogEntry = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  image?: string // base64 PNG
}

export function LogPane({ entries, mode }: { entries: LogEntry[]; mode: 'hybrid' | 'full' }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  const systemPrompt = mode === 'hybrid' ? HYBRID_SYSTEM : FULL_SYSTEM

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{
      background: '#1e1e1e',
      fontFamily: "'Consolas', 'SF Mono', 'Fira Code', monospace",
      fontSize: 11,
      lineHeight: '1.6',
    }}>
      <div className="shrink-0 px-3 py-1.5 flex items-center" style={{
        background: '#2d2d2d',
        color: '#888',
        fontSize: 10,
        borderBottom: '1px solid #3a3a3a',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        <span>LLM Messages</span>
        <button
          onClick={() => setShowPrompt(true)}
          className="ml-auto cursor-pointer"
          style={{
            background: 'none', border: '1px solid #555', borderRadius: 3,
            color: '#aaa', fontSize: 9, padding: '1px 6px',
            textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          }}
        >
          System prompt
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2">
        {entries.map((entry, i) => (
          <div key={i} className="mb-2">
            <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
              {entry.role === 'user' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 10L6 2M6 2L2 6M6 2L10 6" stroke="#569cd6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2L6 10M6 10L2 6M6 10L10 6" stroke="#4ec9b0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            {mode === 'hybrid' && entry.role === 'user' ? (
              <HybridUserContent content={entry.content} />
            ) : mode === 'hybrid' && entry.role === 'assistant' ? (
              <HybridAssistantContent content={entry.content} />
            ) : (
              <span>
                {entry.image && (
                  <img
                    src={`data:image/png;base64,${entry.image}`}
                    style={{ maxWidth: '100%', borderRadius: 3, marginBottom: 4, display: 'block' }}
                  />
                )}
                <span style={{ color: entry.role === 'user' ? '#ce9178' : '#6a9955', wordBreak: 'break-all' }}>
                  {entry.content.length > 200 ? entry.content.slice(0, 200) + '...' : entry.content}
                </span>
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showPrompt && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowPrompt(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 8,
              width: '80vw', maxWidth: 700, maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid #3a3a3a',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ color: '#888', fontSize: 10 }}>
                Model: <span style={{ color: '#4ec9b0' }}>claude-haiku-4-5-20251001</span>
                {' | '}temp: <span style={{ color: '#b5cea8' }}>0</span>
                {' | '}max_tokens: <span style={{ color: '#b5cea8' }}>8192</span>
                {' | '}cache: <span style={{ color: '#569cd6' }}>ephemeral</span>
              </div>
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', padding: 16, margin: 0,
              color: '#d4d4d4', fontSize: 11, lineHeight: '1.6',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {systemPrompt}
            </pre>
            <div style={{
              padding: '8px 16px', borderTop: '1px solid #3a3a3a',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setShowPrompt(false)}
                style={{
                  background: '#333', border: '1px solid #555', borderRadius: 4,
                  color: '#ccc', fontSize: 11, padding: '4px 16px', cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HybridUserContent({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content)
    return (
      <span>
        <Punct>{'{'}</Punct>
        <Key>c</Key><Punct>:</Punct> <Str>{parsed.c}</Str>
        <Punct>, </Punct>
        <Key>e</Key><Punct>:</Punct> <Str>{parsed.e}</Str>
        <Punct>{'}'}</Punct>
      </span>
    )
  } catch {
    return <span style={{ color: '#ce9178' }}>{content}</span>
  }
}

function HybridAssistantContent({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) throw new Error()
    return (
      <span>
        <Punct>[</Punct>
        {parsed.map((cell: { c: string; e?: string; v?: string }, i: number) => (
          <span key={i}>
            {i > 0 && <Punct>, </Punct>}
            <Punct>{'{'}</Punct>
            <Key>c</Key><Punct>:</Punct><Str>{cell.c}</Str>
            {cell.e && <><Punct>,</Punct><Key>e</Key><Punct>:</Punct><Str>{cell.e}</Str></>}
            {cell.v && <><Punct>,</Punct><Key>v</Key><Punct>:</Punct><Num>{cell.v}</Num></>}
            <Punct>{'}'}</Punct>
          </span>
        ))}
        <Punct>]</Punct>
      </span>
    )
  } catch {
    return <span style={{ color: '#6a9955' }}>{content.length > 200 ? content.slice(0, 200) + '...' : content}</span>
  }
}

function Punct({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#808080' }}>{children}</span>
}
function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#9cdcfe' }}>{children}</span>
}
function Str({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#ce9178' }}>"{children}"</span>
}
function Num({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#b5cea8' }}>"{children}"</span>
}
