import { describe, expect, it } from 'vitest'
import {
  FULL_SYSTEM,
  HYBRID_SYSTEM,
  completeChat,
  parseHybridCells,
  prewarmCache,
  sanitizeFullHtml,
} from '~/lib/llm'
import {
  TINY_PNG_B64,
  assertHtmlGrid,
  cellMap,
  logTurn,
  requireClient,
  summarize,
  toTurnRecord,
  writeResults,
  type TurnRecord,
} from './helpers'

describe('openai gpt-5.6-luna (live API)', () => {
  it('evaluates a short hybrid formula chain', async () => {
    const client = requireClient('openai')
    const edits = [
      { c: 'A1', e: '10' },
      { c: 'A2', e: '=A1*2' },
      { c: 'B1', e: '=SUM(A1:A2)' },
    ]
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    let cells: ReturnType<typeof parseHybridCells> = []

    for (const edit of edits) {
      messages.push({ role: 'user', content: JSON.stringify(edit) })
      const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
      cells = parseHybridCells(turn.text)
      messages.push({ role: 'assistant', content: turn.text })
    }

    const map = cellMap(cells)
    expect(map.get('A1')?.v).toBe('10')
    expect(map.get('A2')?.v).toBe('20')
    expect(map.get('B1')?.v).toBe('30')
  }, 180_000)

  it('returns an A1:B4 HTML grid on init', async () => {
    const client = requireClient('openai')
    const init = await completeChat(client, FULL_SYSTEM, [{ role: 'user', content: '{"type":"init"}' }], 'full')
    const html = sanitizeFullHtml(init.text)
    const grid = assertHtmlGrid(html)
    expect(grid.body, html.slice(0, 400)).toBe(true)
    expect(grid.table, html.slice(0, 400)).toBe(true)
    expect(grid.cellCount, html.slice(0, 800)).toBe(8)
  }, 180_000)

  it('hybrid multi-turn latency and cache stats', async () => {
    const client = requireClient('openai')
    const prewarm = await prewarmCache(client, HYBRID_SYSTEM)
    console.log(`  [prewarm openai hybrid] cache_read=${prewarm.cacheReadTokens} cache_write=${prewarm.cacheCreationTokens} in=${prewarm.inputTokens}`)

    const edits = [
      { c: 'A1', e: '10' },
      { c: 'A2', e: '20' },
      { c: 'A3', e: '=A1+A2' },
      { c: 'B1', e: '=A3*2' },
    ]
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    const turns: TurnRecord[] = []
    let cells: ReturnType<typeof parseHybridCells> = []

    for (const [i, edit] of edits.entries()) {
      messages.push({ role: 'user', content: JSON.stringify(edit) })
      const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
      const rec = toTurnRecord(`openai-hybrid-${i + 1}:${edit.c}`, turn)
      turns.push(rec)
      logTurn(rec)
      cells = parseHybridCells(turn.text)
      messages.push({ role: 'assistant', content: turn.text })
    }

    const map = cellMap(cells)
    expect(map.get('A3')?.v).toBe('30')
    expect(map.get('B1')?.v).toBe('60')

    writeResults('openai-hybrid', { prewarm, turns, summary: summarize(turns) })
  }, 300_000)

  it('full init then a click, with current-turn screenshot only', async () => {
    const client = requireClient('openai')
    const messages: object[] = [{ role: 'user', content: '{"type":"init"}' }]
    const init = await completeChat(client, FULL_SYSTEM, messages as never, 'full')
    const initRec = toTurnRecord('openai-full-1:init', init)
    logTurn(initRec)
    expect(assertHtmlGrid(sanitizeFullHtml(init.text)).cellCount).toBe(8)
    messages.push({ role: 'assistant', content: init.text })

    const event = { type: 'mousedown', button: 0, clientX: 90, clientY: 70, detail: 1 }
    const live = [
      ...messages,
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: TINY_PNG_B64 },
          },
          { type: 'text', text: JSON.stringify(event) },
        ],
      },
    ]
    const click = await completeChat(client, FULL_SYSTEM, live as never, 'full')
    const clickRec = toTurnRecord('openai-full-2:mousedown', click)
    logTurn(clickRec)
    expect(assertHtmlGrid(sanitizeFullHtml(click.text)).cellCount).toBe(8)

    writeResults('openai-full', { turns: [initRec, clickRec], summary: summarize([initRec, clickRec]) })
  }, 300_000)
})
