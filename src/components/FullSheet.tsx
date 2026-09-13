import { useState, useRef, useEffect, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { completeChat, FULL_SYSTEM, sanitizeFullHtml, emptyUsage } from '~/lib/llm'
import type { ChatTurn, LlmClient } from '~/lib/llm'
import type { LogEntry } from '~/components/LogPane'
import { SheetHelp } from '~/components/SheetHelp'

const CAPTURE_SCALE = 0.5
const PAINT_MS = 400

function pointInElement(e: MouseEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return {
    x: e.clientX - rect.left + el.scrollLeft,
    y: e.clientY - rect.top + el.scrollTop,
  }
}

function hitFromEvent(e: MouseEvent, doc: Document) {
  const el = (e.target instanceof Element ? e.target : null)
    ?? doc.elementFromPoint(e.clientX, e.clientY)
  if (!el) return { hit: 'other' as const }
  const cell = el.closest('[data-cell]')
  if (cell) {
    return {
      hit: 'cell' as const,
      dataCell: (cell.getAttribute('data-cell') || '').toUpperCase(),
      targetTag: el.tagName.toLowerCase(),
      targetId: (el as HTMLElement).id || undefined,
    }
  }
  if (el.closest('#fxv') || el.id === 'fxv') {
    return { hit: 'formula' as const, targetId: 'fxv', targetTag: el.tagName.toLowerCase() }
  }
  if (el.closest('#fx')) {
    return { hit: 'formula-bar' as const, targetId: 'fx', targetTag: el.tagName.toLowerCase() }
  }
  const th = el.closest('th')
  if (th) {
    const text = (th.textContent || '').trim().toUpperCase()
    if (/^[A-B]$/.test(text)) return { hit: 'col-header' as const, dataCell: text, targetTag: 'th' }
    if (/^[1-4]$/.test(text)) return { hit: 'row-header' as const, dataCell: text, targetTag: 'th' }
  }
  return {
    hit: 'other' as const,
    targetTag: el.tagName.toLowerCase(),
    targetText: el.textContent?.trim().slice(0, 40) || undefined,
  }
}

function placeCrosshair(body: HTMLElement, x: number, y: number) {
  const prev = body.style.position
  if (!prev || prev === 'static') body.style.position = 'relative'
  const mark = body.ownerDocument.createElement('div')
  mark.setAttribute('data-cursor-mark', '1')
  mark.style.cssText = [
    'position:absolute',
    `left:${x}px`,
    `top:${y}px`,
    'width:0',
    'height:0',
    'pointer-events:none',
    'z-index:2147483647',
  ].join(';')
  mark.innerHTML = [
    '<span style="position:absolute;left:-12px;top:-1px;width:24px;height:2px;background:#ff0000"></span>',
    '<span style="position:absolute;left:-1px;top:-12px;width:2px;height:24px;background:#ff0000"></span>',
    '<span style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;border:2px solid #ff0000;border-radius:50%;box-sizing:border-box;background:transparent"></span>',
  ].join('')
  body.appendChild(mark)
  return () => {
    mark.remove()
    body.style.position = prev
  }
}

async function captureIframe(
  iframe: HTMLIFrameElement,
  cursor?: { x: number; y: number },
): Promise<{ data: string; mime: 'image/jpeg' }> {
  const body = iframe.contentDocument?.body
  if (!body) throw new Error('no iframe body')

  const cleanup = cursor ? placeCrosshair(body, cursor.x, cursor.y) : undefined
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  try {
    const win = iframe.contentWindow
    const viewW = win?.innerWidth ?? iframe.clientWidth
    const viewH = win?.innerHeight ?? iframe.clientHeight
    const canvas = await html2canvas(body, {
      scale: CAPTURE_SCALE,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: viewW,
      windowHeight: viewH,
      onclone(clonedDoc) {
        clonedDoc.documentElement.style.width = `${viewW}px`
        const b = clonedDoc.body
        if (b) {
          b.style.margin = '0'
          b.style.padding = '0'
          b.style.width = `${viewW}px`
        }
      },
    })
    return { data: canvas.toDataURL('image/jpeg', 0.65).split(',')[1], mime: 'image/jpeg' }
  } finally {
    cleanup?.()
  }
}

export function FullSheet({ client, onLog }: { client: LlmClient; onLog: (entry: LogEntry) => void }) {
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadingRef = useRef(false)
  const messagesRef = useRef<any[]>([])

  const streamIntoIframe = useCallback(
    async (messages: any[]): Promise<ChatTurn> => {
      const iframe = iframeRef.current
      if (!iframe) throw new Error('no iframe')

      let full = ''
      let lastPaint = 0
      let paintTimer: ReturnType<typeof setTimeout> | undefined

      const paint = (force = false) => {
        const now = Date.now()
        if (!force && now - lastPaint < PAINT_MS) {
          if (!paintTimer) {
            paintTimer = setTimeout(() => {
              paintTimer = undefined
              paint(true)
            }, PAINT_MS - (now - lastPaint))
          }
          return
        }
        lastPaint = now
        iframe.srcdoc = sanitizeFullHtml(full)
      }

      let turn: ChatTurn = { text: '', usage: emptyUsage(), ttftMs: 0, totalMs: 0 }
      try {
        turn = await completeChat(client, FULL_SYSTEM, messages, 'full', (chunk) => {
          full += chunk
          paint()
        })
      } finally {
        if (paintTimer) clearTimeout(paintTimer)
      }

      const final = sanitizeFullHtml(turn.text)
      iframe.srcdoc = final
      return { ...turn, text: final }
    },
    [client],
  )

  const sendEvent = useCallback(
    async (event: object, screenshot?: { data: string; mime: 'image/jpeg' }) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)

      const eventStr = JSON.stringify(event)
      const content: any[] = []
      if (screenshot) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: screenshot.mime, data: screenshot.data },
        })
      }
      content.push({ type: 'text', text: eventStr })

      const liveUser = { role: 'user', content }
      const historyUser = { role: 'user', content: eventStr }
      const newMessages = [...messagesRef.current, liveUser]

      onLog({
        role: 'user',
        content: eventStr,
        timestamp: Date.now(),
        image: screenshot?.data,
        imageMime: screenshot?.mime,
      })

      try {
        const turn = await streamIntoIframe(newMessages)
        const assistantMsg = { role: 'assistant', content: turn.text }
        messagesRef.current = [...messagesRef.current, historyUser, assistantMsg]
        onLog({
          role: 'assistant',
          content: turn.text.length > 300 ? turn.text.slice(0, 300) + '…' : turn.text,
          timestamp: Date.now(),
          usage: turn.usage,
          ttftMs: turn.ttftMs,
          totalMs: turn.totalMs,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('LLM failed:', err)
        onLog({ role: 'assistant', content: message, timestamp: Date.now() })
      } finally {
        setLoading(false)
        loadingRef.current = false
        setTimeout(attachListeners, 50)
      }
    },
    [streamIntoIframe],
  )

  const sendEventRef = useRef(sendEvent)
  useEffect(() => { sendEventRef.current = sendEvent }, [sendEvent])

  const attachListeners = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return

    doc.body?.setAttribute('tabindex', '0')
    doc.body?.focus()

    function serializeMouse(e: MouseEvent, point: { x: number; y: number }) {
      return {
        type: e.type, button: e.button, buttons: e.buttons, detail: e.detail,
        clientX: Math.round(point.x), clientY: Math.round(point.y),
        altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
        ...hitFromEvent(e, doc as Document),
      }
    }

    function serializeKey(e: KeyboardEvent) {
      return {
        type: e.type, key: e.key, code: e.code,
        altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
        repeat: e.repeat, location: e.location, isComposing: e.isComposing,
      }
    }

    const handleMouse = async (e: MouseEvent) => {
      if (loadingRef.current) return
      const body = doc.body
      if (!body) return
      const point = pointInElement(e, body)
      if (point.x < 0 || point.y < 0 || point.x > body.scrollWidth || point.y > body.scrollHeight) return
      e.preventDefault()
      const screenshot = await captureIframe(iframeRef.current!, point)
      sendEventRef.current(serializeMouse(e, point), screenshot)
    }

    doc.onmousedown = handleMouse
    doc.oncontextmenu = handleMouse

    doc.onkeydown = async (e) => {
      if (loadingRef.current) return
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) e.preventDefault()
      const screenshot = await captureIframe(iframeRef.current!)
      sendEventRef.current(serializeKey(e), screenshot)
    }
  }, [])

  // Initial load
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    ;(async () => {
      loadingRef.current = true
      setLoading(true)
      const initMsg = { role: 'user', content: '{"type":"init"}' }
      onLog({ role: 'user', content: '{"type":"init"}', timestamp: Date.now() })
      try {
        const turn = await streamIntoIframe([initMsg])
        messagesRef.current = [initMsg, { role: 'assistant', content: turn.text }]
        onLog({
          role: 'assistant',
          content: turn.text.length > 300 ? turn.text.slice(0, 300) + '…' : turn.text,
          timestamp: Date.now(),
          usage: turn.usage,
          ttftMs: turn.ttftMs,
          totalMs: turn.totalMs,
        })
        setTimeout(attachListeners, 50)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Failed to load:', err)
        onLog({ role: 'assistant', content: message, timestamp: Date.now() })
      } finally {
        setLoading(false)
        loadingRef.current = false
      }
    })()
  }, [streamIntoIframe, attachListeners])

  return (
    <div className="flex-1 overflow-hidden p-4" style={{ background: '#2a2a2a' }}>
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
          <div style={{ width: 52, display: 'flex', justifyContent: 'flex-end' }}>
            <SheetHelp />
          </div>
        </div>
        {/* Loading bar */}
        {loading && (
          <div style={{
            position: 'absolute', top: 36, left: 0, right: 0, height: 3,
            background: 'linear-gradient(90deg, transparent 0%, #217346 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'cell-shimmer 1s ease-in-out infinite',
            zIndex: 50,
          }} />
        )}
        <iframe
          ref={iframeRef}
          className="flex-1 border-none w-full"
          style={{ background: '#fff' }}
          title="Spreadsheet"
        />
      </div>
    </div>
  )
}
