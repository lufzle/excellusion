import { describe, expect, it } from 'vitest'
import { HYBRID_SYSTEM, completeChat, parseHybridCells } from '~/lib/llm'
import { cellMap, logTurn, requireClient, toTurnRecord } from './helpers'

describe('chatjimmy llama3.1-8B (live API, no key)', () => {
  it('evaluates a short hybrid formula chain', async () => {
    const client = requireClient('chatjimmy')
    expect(client.spec.apiModel).toBe('llama3.1-8B')
    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: JSON.stringify({ c: 'A1', e: '10' }) },
    ]
    const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
    logTurn(toTurnRecord('jimmy-A1', turn))
    expect(turn.text.trim().length).toBeGreaterThan(0)
    expect(turn.usage.inputTokens).toBeGreaterThan(0)
    const cells = parseHybridCells(turn.text)
    const map = cellMap(cells)
    expect(map.get('A1')?.c).toBeTruthy()
  }, 120_000)
})
