import { useState, useRef, useEffect, useCallback } from 'react'
import type Anthropic from '@anthropic-ai/sdk'
import { streamChat, HYBRID_SYSTEM } from '~/lib/llm'
import type { CellData } from '~/lib/llm'
import type { LogEntry } from '~/components/LogPane'

const COLS = 8 // A-H
const ROWS = 8

function colLabel(i: number) {
  return String.fromCharCode(65 + i)
}

function cellId(col: number, row: number) {
  return `${colLabel(col)}${row + 1}`
}

function parseCellId(id: string): [number, number] | null {
  const m = id.match(/^([A-H])(\d+)$/)
  if (!m) return null
  return [m[1].charCodeAt(0) - 65, parseInt(m[2]) - 1]
}

type MessageParam = { role: string; content: string }

export function HybridSheet({ client, onLog }: { client: Anthropic; onLog: (entry: LogEntry) => void }) {
  const [cells, setCells] = useState<CellData[]>([])
  const [selectedCell, setSelectedCell] = useState('A1')
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editBuffer, setEditBuffer] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<MessageParam[]>([])
  const submittedRef = useRef(false)

  const cellMap = new Map(cells.map((c) => [c.c, c]))
  const getExpression = (id: string) => cellMap.get(id)?.e ?? ''
  const getDisplay = (id: string) => cellMap.get(id)?.v ?? ''

  const submitEdit = useCallback(
    async (cell: string, expression: string) => {
      const userContent = JSON.stringify({ c: cell, e: expression })
      const userMsg: MessageParam = { role: 'user', content: userContent }
      const newMessages = [...messagesRef.current, userMsg]
      messagesRef.current = newMessages
      setEditingCell(null)
      setLoading(true)
      onLog({ role: 'user', content: userContent, timestamp: Date.now() })

      try {
        let full = ''
        for await (const chunk of streamChat(client, HYBRID_SYSTEM, newMessages)) {
          full += chunk
          // Try to parse incrementally
          let raw = full.trim()
          if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
          }
          try {
            const parsed = JSON.parse(raw) as CellData[]
            setCells(parsed)
          } catch {
            // not valid JSON yet, keep accumulating
          }
        }

        // Final parse
        let raw = full.trim()
        if (raw.startsWith('```')) {
          raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }
        try {
          setCells(JSON.parse(raw) as CellData[])
        } catch {
          console.error('Final JSON parse failed:', raw)
        }

        messagesRef.current = [...newMessages, { role: 'assistant', content: raw }]
        onLog({ role: 'assistant', content: raw, timestamp: Date.now() })
      } catch (err) {
        console.error('LLM evaluation failed:', err)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const startEditing = useCallback(
    (cell: string) => {
      setEditingCell(cell)
      setEditBuffer(getExpression(cell))
      setSelectedCell(cell)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells],
  )

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  // Focus grid on mount so arrow keys work immediately
  useEffect(() => {
    gridRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingCell) return
      const parsed = parseCellId(selectedCell)
      if (!parsed) return
      let [col, row] = parsed

      if (e.key === 'ArrowUp') { e.preventDefault(); row = Math.max(0, row - 1) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); row = Math.min(ROWS - 1, row + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); col = Math.max(0, col - 1) }
      else if (e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); col = Math.min(COLS - 1, col + 1) }
      else if (e.key === 'Enter') { e.preventDefault(); startEditing(selectedCell); return }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        submitEdit(selectedCell, '')
        return
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        startEditing(selectedCell)
        setEditBuffer(e.key)
        return
      } else return

      setSelectedCell(cellId(col, row))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editingCell, selectedCell, startEditing, submitEdit])

  const selectedParsed = parseCellId(selectedCell)
  const selectedCol = selectedParsed?.[0] ?? -1
  const selectedRow = selectedParsed?.[1] ?? -1

  return (
    <div className="flex-1 overflow-hidden p-4" style={{ background: '#2a2a2a', fontFamily: "'Aptos', 'Calibri', 'Segoe UI', system-ui, sans-serif" }}>
      <div className="flex flex-col h-full relative" style={{
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
      }}>
        {/* macOS title bar */}
        <div className="shrink-0 flex items-center px-3" style={{
          height: 36,
          background: 'linear-gradient(180deg, #3a3a3a 0%, #2e2e2e 100%)',
          borderBottom: '1px solid #222',
        }}>
          <div className="flex gap-2">
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', border: '1px solid #e14640' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', border: '1px solid #d9a620' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', border: '1px solid #1aab29' }} />
          </div>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#999', fontWeight: 500 }}>
            Excellusion
          </span>
          <div style={{ width: 52 }} />
        </div>

        {/* Dim overlay during LLM request */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, top: 36, zIndex: 20,
            background: 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(1px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#217346',
                  animation: `status-dot 1s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Formula bar */}
        <div className="flex items-stretch shrink-0 border-b"
        style={{ borderColor: '#c6c6c6', background: '#fff' }}>
        <div className="w-[72px] flex items-center justify-center border-r text-[11px] font-semibold shrink-0"
          style={{ background: '#fafafa', borderColor: '#c6c6c6', color: '#333' }}>
          {selectedCell}
        </div>
        <div className="w-8 flex items-center justify-center border-r shrink-0"
          style={{ borderColor: '#e0e0e0' }}>
          <span className="text-[12px] italic" style={{ color: '#888', fontFamily: 'Georgia, serif' }}>
            f<sub>x</sub>
          </span>
        </div>
        <input
          className="flex-1 py-1 px-2 text-[12px] outline-none border-none"
          style={{ fontFamily: "'Consolas', 'SF Mono', monospace", color: '#333', background: '#fff' }}
          value={editingCell ? editBuffer : getExpression(selectedCell)}
          onChange={(e) => {
            if (editingCell) setEditBuffer(e.target.value)
            else {
              startEditing(selectedCell)
              setEditBuffer(e.target.value)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const cell = editingCell ?? selectedCell
              submitEdit(cell, editingCell ? editBuffer : e.currentTarget.value)
              e.currentTarget.blur()
              gridRef.current?.focus()
            } else if (e.key === 'Escape') {
              setEditingCell(null)
              gridRef.current?.focus()
            }
          }}
        />
      </div>

      {/* Grid */}
      <div ref={gridRef} tabIndex={0} className="flex-1 overflow-auto outline-none" style={{ background: '#fff' }}>
        <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {Array.from({ length: COLS }, (_, i) => (
              <col key={i} style={{ width: 42 }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th style={{
                background: 'linear-gradient(180deg, #f6f6f6 0%, #ebebeb 100%)',
                border: '1px solid #c6c6c6',
              }} />
              {Array.from({ length: COLS }, (_, i) => {
                const hl = i === selectedCol
                return (
                  <th key={i} style={{
                    background: hl
                      ? 'linear-gradient(180deg, #d4e8da 0%, #b8d8c4 100%)'
                      : 'linear-gradient(180deg, #f6f6f6 0%, #ebebeb 100%)',
                    border: '1px solid #c6c6c6',
                    color: hl ? '#14532d' : '#666',
                    fontSize: 11, fontWeight: hl ? 700 : 500, padding: '3px 0',
                  }}>
                    {colLabel(i)}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row}>
                <td style={{
                  background: row === selectedRow
                    ? 'linear-gradient(90deg, #d4e8da 0%, #b8d8c4 100%)'
                    : 'linear-gradient(180deg, #f6f6f6 0%, #ebebeb 100%)',
                  border: '1px solid #c6c6c6',
                  textAlign: 'center', fontSize: 11,
                  fontWeight: row === selectedRow ? 700 : 500,
                  color: row === selectedRow ? '#14532d' : '#666',
                  padding: '1px 0', position: 'sticky', left: 0, zIndex: 5,
                }}>
                  {row + 1}
                </td>
                {Array.from({ length: COLS }, (_, col) => {
                  const id = cellId(col, row)
                  const isSelected = selectedCell === id
                  const isEditing = editingCell === id
                  const display = getDisplay(id)
                  const isNumber = display !== '' && !isNaN(Number(display))
                  const isError = display.startsWith('#')

                  return (
                    <td key={col} className="relative"
                      style={{
                        border: isSelected ? 'none' : '1px solid #e2e2e2',
                        padding: 0, height: 28, cursor: 'cell',
                        background: loading && getExpression(id)?.startsWith('=')
                          ? 'linear-gradient(90deg, #f0faf3 25%, #e0f5e8 50%, #f0faf3 75%)'
                          : '#fff',
                        backgroundSize: loading ? '200% 100%' : undefined,
                        animation: loading && getExpression(id)?.startsWith('=')
                          ? 'cell-shimmer 1.5s ease-in-out infinite' : undefined,
                      }}
                      onClick={() => {
                        if (editingCell && editingCell !== id) {
                          submitEdit(editingCell, editBuffer)
                        }
                        setSelectedCell(id)
                        gridRef.current?.focus()
                      }}
                      onDoubleClick={() => startEditing(id)}
                    >
                      {isSelected && !isEditing && (
                        <>
                          <div style={{
                            position: 'absolute', inset: -1,
                            border: '2px solid #217346',
                            pointerEvents: 'none', zIndex: 3,
                          }} />
                          <div style={{
                            position: 'absolute', bottom: -3, right: -3,
                            width: 6, height: 6, background: '#217346',
                            border: '1px solid #fff', zIndex: 4, cursor: 'crosshair',
                          }} />
                        </>
                      )}

                      {isEditing ? (
                        <input ref={inputRef}
                          style={{
                            position: 'absolute', inset: -1, padding: '0 4px',
                            fontSize: 12, fontFamily: "'Consolas', 'SF Mono', monospace",
                            outline: 'none', border: '2px solid #217346',
                            background: '#fff', zIndex: 5,
                            animation: 'pulse-border 2s ease-in-out infinite',
                            boxShadow: '0 0 0 1px rgba(33,115,70,0.15)',
                          }}
                          value={editBuffer}
                          onChange={(e) => setEditBuffer(e.target.value)}
                          onBlur={() => {
                            if (!submittedRef.current) submitEdit(id, editBuffer)
                            submittedRef.current = false
                          }}
                          onKeyDown={(e) => {
                            const submit = () => {
                              e.preventDefault()
                              e.stopPropagation()
                              e.nativeEvent.stopImmediatePropagation()
                              submittedRef.current = true
                              submitEdit(id, editBuffer)
                            }
                            if (e.key === 'Enter') {
                              submit()
                              setSelectedCell(cellId(col, Math.min(row + 1, ROWS - 1)))
                            } else if (e.key === 'Escape') {
                              e.stopPropagation()
                              e.nativeEvent.stopImmediatePropagation()
                              submittedRef.current = true
                              setEditingCell(null)
                            } else if (e.key === 'Tab') {
                              submit()
                              setSelectedCell(cellId(Math.min(col + 1, COLS - 1), row))
                            } else if (e.key === 'ArrowUp') {
                              submit()
                              setSelectedCell(cellId(col, Math.max(0, row - 1)))
                            } else if (e.key === 'ArrowDown') {
                              submit()
                              setSelectedCell(cellId(col, Math.min(ROWS - 1, row + 1)))
                            } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                              submit()
                              setSelectedCell(cellId(Math.max(0, col - 1), row))
                            } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === editBuffer.length) {
                              submit()
                              setSelectedCell(cellId(Math.min(COLS - 1, col + 1), row))
                            }
                          }}
                        />
                      ) : (
                        <span style={{
                          display: 'block', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontSize: 12, lineHeight: '28px', padding: '0 4px',
                          textAlign: isNumber ? 'right' : 'left',
                          color: isError ? '#c00' : '#111',
                          fontWeight: isError ? 500 : 400,
                        }}>
                          {display}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
