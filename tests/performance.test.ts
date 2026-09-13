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
  PERF_LABEL,
  TINY_PNG_B64,
  assertHtmlGrid,
  cellMap,
  logTurn,
  readResults,
  requireClient,
  summarize,
  toTurnRecord,
  writeResults,
  type TurnRecord,
} from './helpers'

function printComparison(suite: string, current: ReturnType<typeof summarize>) {
  const baseline = readResults('baseline', suite)
  if (!baseline || PERF_LABEL === 'baseline') return
  const prev = baseline.summary as ReturnType<typeof summarize>
  const delta = (a: number, b: number) => {
    if (!b) return 'n/a'
    const pct = ((a - b) / b) * 100
    const sign = pct > 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
  }
  console.log(`\n  vs baseline (${suite}):`)
  console.log(`    mean TTFT  ${current.meanTtftMs}ms  (${delta(current.meanTtftMs, prev.meanTtftMs)})`)
  console.log(`    mean total ${current.meanTotalMs}ms  (${delta(current.meanTotalMs, prev.meanTotalMs)})`)
  console.log(`    cache hits ${current.cacheHits}/${current.turns}  (was ${prev.cacheHits}/${prev.turns})`)
  console.log(`    cache read tokens ${current.totalCacheReadTokens}  (was ${prev.totalCacheReadTokens})`)
}

describe('performance (live API)', () => {
  it('hybrid multi-turn latency and cache stats', async () => {
    const client = requireClient()
    const prewarm = await prewarmCache(client, HYBRID_SYSTEM)
    console.log(`  [prewarm hybrid] cache_read=${prewarm.cacheReadTokens} cache_write=${prewarm.cacheCreationTokens}`)

    const edits = [
      { c: 'A1', e: '10' },
      { c: 'A2', e: '20' },
      { c: 'A3', e: '=A1+A2' },
      { c: 'B1', e: '=A3*2' },
      { c: 'C1', e: '=SUM(A1:A3)' },
      { c: 'C2', e: '=IF(B1>50,"yes","no")' },
    ]

    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    const turns: TurnRecord[] = []
    let cells: ReturnType<typeof parseHybridCells> = []

    for (const [i, edit] of edits.entries()) {
      messages.push({ role: 'user', content: JSON.stringify(edit) })
      const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
      const rec = toTurnRecord(`hybrid-${i + 1}:${edit.c}`, turn)
      turns.push(rec)
      logTurn(rec)
      cells = parseHybridCells(turn.text)
      messages.push({ role: 'assistant', content: turn.text })
    }

    const map = cellMap(cells)
    expect(map.get('A3')?.v).toBe('30')
    expect(map.get('B1')?.v).toBe('60')
    expect(map.get('C1')?.v).toBe('60')
    expect(map.get('C2')?.v?.toLowerCase()).toBe('yes')

    const summary = summarize(turns)
    writeResults('hybrid', { prewarm, turns, summary })
    printComparison('hybrid', summary)
    expect(turns).toHaveLength(edits.length)
  }, 300_000)

  it('full multi-turn latency and cache stats', async () => {
    const client = requireClient()
    const prewarm = await prewarmCache(client, FULL_SYSTEM)
    console.log(`  [prewarm full] cache_read=${prewarm.cacheReadTokens} cache_write=${prewarm.cacheCreationTokens}`)

    const messages: object[] = []
    const turns: TurnRecord[] = []

    messages.push({ role: 'user', content: '{"type":"init"}' })
    const init = await completeChat(client, FULL_SYSTEM, messages as never, 'full')
    const initRec = toTurnRecord('full-1:init', init)
    turns.push(initRec)
    logTurn(initRec)
    const initHtml = sanitizeFullHtml(init.text)
    expect(assertHtmlGrid(initHtml).cellCount, initHtml.slice(0, 800)).toBe(8)
    messages.push({ role: 'assistant', content: init.text })

    const events = [
      { type: 'mousedown', button: 0, clientX: 90, clientY: 70, detail: 1 },
      { type: 'keydown', key: '5', code: 'Digit5' },
      { type: 'keydown', key: 'Enter', code: 'Enter' },
    ]

    for (const [i, event] of events.entries()) {
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
      const turn = await completeChat(client, FULL_SYSTEM, live as never, 'full')
      const rec = toTurnRecord(`full-${i + 2}:${event.type}`, turn)
      turns.push(rec)
      logTurn(rec)
      expect(assertHtmlGrid(sanitizeFullHtml(turn.text)).cellCount).toBe(8)
      messages.push({ role: 'user', content: JSON.stringify(event) })
      messages.push({ role: 'assistant', content: turn.text })
    }

    const summary = summarize(turns)
    writeResults('full', { prewarm, turns, summary })
    printComparison('full', summary)
    expect(turns).toHaveLength(1 + events.length)
  }, 300_000)
})
