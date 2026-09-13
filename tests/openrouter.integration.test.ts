import { describe, expect, it } from 'vitest'
import { HYBRID_SYSTEM, completeChat, parseHybridCells } from '~/lib/llm'
import { cellMap, logTurn, requireClient, toTurnRecord } from './helpers'

describe('openrouter (live API)', () => {
  it('evaluates a hybrid formula chain on Gemini 3.8 Flash', async () => {
    const client = requireClient('openrouter')
    expect(client.spec.apiModel).toBe('google/gemini-3.8-flash')
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
      logTurn(toTurnRecord(`or-${edit.c}`, turn))
      cells = parseHybridCells(turn.text)
      messages.push({ role: 'assistant', content: turn.text })
    }

    const map = cellMap(cells)
    expect(map.get('A1')?.v).toBe('10')
    expect(map.get('A2')?.v).toBe('20')
    expect(map.get('B1')?.v).toBe('30')
  }, 180_000)
})
