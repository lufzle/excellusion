import { useState, useRef, useEffect, useCallback } from 'react'
import html2canvas from 'html2canvas'
import type Anthropic from '@anthropic-ai/sdk'
import { streamChat, FULL_SYSTEM } from '~/lib/llm'
import type { LogEntry } from '~/components/LogPane'

function stripFences(s: string): string {
  let r = s
  if (r.startsWith('```')) r = r.replace(/^```(?:html)?\n?/, '')
  if (r.endsWith('```')) r = r.replace(/\n?```$/, '')
  return r
}

async function captureIframe(
  iframe: HTMLIFrameElement,
  cursor?: { x: number; y: number },
): Promise<string> {
  const body = iframe.contentDocument?.body
  if (!body) throw new Error('no iframe body')

  const canvas = await html2canvas(body, {
    scale: 1,
    width: body.scrollWidth,
    height: body.scrollHeight,
  })

  if (cursor) {
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cursor.x - 12, cursor.y)
    ctx.lineTo(cursor.x + 12, cursor.y)
    ctx.moveTo(cursor.x, cursor.y - 12)
    ctx.lineTo(cursor.x, cursor.y + 12)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2)
    ctx.stroke()
  }

  return canvas.toDataURL('image/png').split(',')[1]
}

export function FullSheet({ client, onLog }: { client: Anthropic; onLog: (entry: LogEntry) => void }) {
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadingRef = useRef(false)
  const messagesRef = useRef<any[]>([])

  const streamIntoIframe = useCallback(
    async (messages: any[]): Promise<string> => {
      const iframe = iframeRef.current
      if (!iframe) throw new Error('no iframe')

      let full = ''
      let dirty = false

      const renderInterval = setInterval(() => {
        if (!dirty) return
        dirty = false
        iframe.srcdoc = stripFences(full)
      }, 150)

      try {
        for await (const chunk of streamChat(client, FULL_SYSTEM, messages)) {
          full += chunk
          dirty = true
        }
      } finally {
        clearInterval(renderInterval)
      }

      const final = stripFences(full.trim())
      iframe.srcdoc = final
      return final
    },
    [client],
  )

  const sendEvent = useCallback(
    async (event: object, screenshot?: string) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)

      const content: any[] = []
      if (screenshot) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: screenshot },
        })
      }
      content.push({ type: 'text', text: JSON.stringify(event) })

      const userMsg = { role: 'user', content }
      const newMessages = [...messagesRef.current, userMsg]

      const eventStr = JSON.stringify(event)
      onLog({ role: 'user', content: eventStr, timestamp: Date.now(), image: screenshot })

      try {
        const final = await streamIntoIframe(newMessages)
        const assistantMsg = { role: 'assistant', content: final }
        messagesRef.current = [...newMessages, assistantMsg]
        onLog({ role: 'assistant', content: final.length > 300 ? final.slice(0, 300) + '…' : final, timestamp: Date.now() })
      } catch (err) {
        console.error('LLM failed:', err)
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

    function serializeMouse(e: MouseEvent) {
      return {
        type: e.type, button: e.button, buttons: e.buttons, detail: e.detail,
        clientX: e.clientX, clientY: e.clientY, offsetX: e.offsetX, offsetY: e.offsetY,
        pageX: e.pageX, pageY: e.pageY, screenX: e.screenX, screenY: e.screenY,
        altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
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
      if (e.clientX > body.scrollWidth || e.clientY > body.scrollHeight) return
      e.preventDefault()
      const screenshot = await captureIframe(iframeRef.current!, { x: e.clientX, y: e.clientY })
      sendEventRef.current(serializeMouse(e), screenshot)
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
        const final = await streamIntoIframe([initMsg])
        messagesRef.current = [initMsg, { role: 'assistant', content: final }]
        onLog({ role: 'assistant', content: final.length > 300 ? final.slice(0, 300) + '…' : final, timestamp: Date.now() })
        setTimeout(attachListeners, 50)
      } catch (err) {
        console.error('Failed to load:', err)
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
          <div style={{ width: 52 }} />
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
