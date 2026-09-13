import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const EXAMPLES: { fn: string; formula: string; expect: string }[] = [
  { fn: 'Arithmetic', formula: '=A1+2', expect: '3 (A1 starts at 1)' },
  { fn: 'Chain', formula: 'A2 =A1*10, then B1 =A2+A1', expect: '11' },
  { fn: 'SUM', formula: '=SUM(A1:A3)', expect: 'total of A1–A3' },
  { fn: 'AVERAGE', formula: '=AVERAGE(A1:A3)', expect: 'mean' },
  { fn: 'MIN / MAX', formula: '=MIN(A1:A3) / =MAX(A1:A3)', expect: 'extremes' },
  { fn: 'IF', formula: '=IF(A1>0,"yes","no")', expect: 'yes' },
  { fn: 'COUNT', formula: '=COUNT(A1:A4)', expect: 'how many numbers' },
  { fn: 'COUNTA', formula: '=COUNTA(A1:A4)', expect: 'how many non-blank' },
  { fn: 'DIV/0', formula: '=1/0', expect: '#DIV/0!' },
  { fn: 'Off-grid', formula: '=E1 or =A9', expect: '#REF!' },
]

export function SheetHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label="Formula help"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center cursor-pointer"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '1px solid #666',
          background: 'transparent',
          color: '#bbb',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: 10,
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
              color: '#ddd',
              fontFamily: "'Aptos', 'Calibri', 'Segoe UI', system-ui, sans-serif",
            }}
          >
            <div className="flex items-center px-4 py-3" style={{ borderBottom: '1px solid #3a3a3a' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#eee' }}>Formulas to try</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="ml-auto cursor-pointer"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '12px 16px 16px', fontSize: 12, lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 12px', color: '#aaa' }}>
                Hybrid grid is A1:D8 (A1 starts at 1, selection on B1). Full grid is A1:B4.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: '#888', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px 6px 0', fontWeight: 600 }}>Function</th>
                    <th style={{ padding: '4px 8px 6px', fontWeight: 600 }}>Example</th>
                    <th style={{ padding: '4px 0 6px', fontWeight: 600 }}>Expect</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLES.map((row) => (
                    <tr key={row.fn} style={{ borderTop: '1px solid #3a3a3a' }}>
                      <td style={{ padding: '7px 8px 7px 0', color: '#4ec9b0', whiteSpace: 'nowrap' }}>{row.fn}</td>
                      <td style={{
                        padding: '7px 8px',
                        fontFamily: "'Consolas', 'SF Mono', monospace",
                        color: '#ce9178',
                      }}>
                        {row.formula}
                      </td>
                      <td style={{ padding: '7px 0', color: '#ccc' }}>{row.expect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{
                margin: '14px 0 0',
                padding: '10px 12px',
                background: '#1e1e1e',
                borderRadius: 6,
                color: '#c9a227',
                fontSize: 11,
              }}>
                Dumber or smaller models (ChatJimmy / Llama 3.1 8B, and sometimes Flash-class) often get formulas wrong, invent cells, or skip errors. Prefer Haiku or Luna for this.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
