import { describe, expect, it } from 'vitest'
import { HYBRID_SYSTEM, completeChat, parseHybridCells } from '~/lib/llm'
import { logTurn, requireClientForModel, summarize, toTurnRecord } from './helpers'

describe('grok 4.6 hybrid chain', () => {
  it('three edits', async () => {
    const client = requireClientForModel('openrouter-grok-4.6')
    const edits = [
      { c: 'A1', e: '10' },
      { c: 'A2', e: '=A1*2' },
      { c: 'B1', e: '=SUM(A1:A2)' },
    ]
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    const turns = []
    let cells: ReturnType<typeof parseHybridCells> = []
    for (const [i, edit] of edits.entries()) {
      messages.push({ role: 'user', content: JSON.stringify(edit) })
      const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
      const rec = toTurnRecord(`grok-${i + 1}`, turn)
      turns.push(rec)
      logTurn(rec)
      cells = parseHybridCells(turn.text)
      messages.push({ role: 'assistant', content: turn.text })
    }
    const map = new Map(cells.map((c) => [c.c, c]))
    expect(map.get('B1')?.v).toBe('30')
    console.log(summarize(turns))
  }, 180_000)
})
