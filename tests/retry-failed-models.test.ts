import { describe, it } from 'vitest'
import { HYBRID_SYSTEM, completeChat, parseHybridCells } from '~/lib/llm'
import { logTurn, requireClientForModel, toTurnRecord } from './helpers'

describe('retry previously failed models', () => {
  it('opus, fable, grok one hybrid edit', async () => {
    for (const id of ['anthropic-opus-5', 'anthropic-fable-5.1', 'openrouter-grok-4.6'] as const) {
      try {
        const client = requireClientForModel(id)
        const turn = await completeChat(client, HYBRID_SYSTEM, [{ role: 'user', content: '{"c":"A1","e":"10"}' }], 'hybrid')
        logTurn(toTurnRecord(id, turn))
        const cells = parseHybridCells(turn.text)
        console.log(id, 'parsed', cells)
      } catch (err) {
        console.log(id, 'ERR', err instanceof Error ? err.message.slice(0, 400) : err)
      }
    }
  }, 180_000)
})
