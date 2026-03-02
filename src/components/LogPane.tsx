import { useEffect, useRef } from 'react'

export type LogEntry = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  image?: string
}

export function LogPane({ entries, mode }: { entries: LogEntry[]; mode: 'hybrid' | 'full' }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{
      background: '#1e1e1e',
      fontFamily: "'Consolas', 'SF Mono', 'Fira Code', monospace",
      fontSize: 11,
      lineHeight: '1.6',
    }}>
      <div className="shrink-0 px-3 py-1.5" style={{
        background: '#2d2d2d',
        color: '#888',
        fontSize: 10,
        borderBottom: '1px solid #3a3a3a',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        LLM Messages
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
              <span style={{ color: entry.role === 'user' ? '#ce9178' : '#6a9955', wordBreak: 'break-all' }}>
                {entry.content.length > 200 ? entry.content.slice(0, 200) + '...' : entry.content}
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
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
