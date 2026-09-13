import { describe, expect, it } from 'vitest'
import { HYBRID_SYSTEM, completeChat, parseHybridCells } from '~/lib/llm'
import { MODEL_CATALOG } from '~/lib/models'
import { logTurn, requireClientForModel, summarize, toTurnRecord, writeResults } from './helpers'

const EDITS = [
  { c: 'A1', e: '10' },
  { c: 'A2', e: '=A1*2' },
  { c: 'B1', e: '=SUM(A1:A2)' },
]

describe('catalog comparison (live API)', () => {
  it('runs the same hybrid formula chain on every model', async () => {
    const rows: object[] = []

    for (const spec of MODEL_CATALOG) {
      console.log(`\n== ${spec.group} / ${spec.label} (${spec.apiModel}) effort=${spec.effort} ==`)
      try {
        const client = requireClientForModel(spec.id)
        const messages: { role: 'user' | 'assistant'; content: string }[] = []
        const turns = []
        let cells: ReturnType<typeof parseHybridCells> = []

        for (const [i, edit] of EDITS.entries()) {
          messages.push({ role: 'user', content: JSON.stringify(edit) })
          const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
          const rec = toTurnRecord(`${spec.id}-${i + 1}:${edit.c}`, turn)
          turns.push(rec)
          logTurn(rec)
          cells = parseHybridCells(turn.text)
          messages.push({ role: 'assistant', content: turn.text })
        }

        const map = new Map(cells.map((c) => [c.c, c]))
        const correct = map.get('A1')?.v === '10' && map.get('A2')?.v === '20' && map.get('B1')?.v === '30'
        const summary = summarize(turns)
        rows.push({
          id: spec.id,
          group: spec.group,
          label: spec.label,
          apiModel: spec.apiModel,
          effort: spec.effort,
          ok: true,
          correct,
          ...summary,
        })
        console.log(`  correct=${correct} meanTtft=${summary.meanTtftMs}ms meanTotal=${summary.meanTotalMs}ms`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`  FAILED: ${message.slice(0, 400)}`)
        rows.push({
          id: spec.id,
          group: spec.group,
          label: spec.label,
          apiModel: spec.apiModel,
          effort: spec.effort,
          ok: false,
          error: message.slice(0, 500),
        })
      }
    }

    writeResults('catalog-hybrid', { rows })
    console.log('\n--- catalog hybrid ---')
    console.table(rows.map((r) => {
      const row = r as Record<string, unknown>
      return {
        model: row.label,
        ok: row.ok,
        correct: row.correct ?? '',
        ttft: row.meanTtftMs ?? '',
        total: row.meanTotalMs ?? '',
        cacheHits: row.cacheHits ?? '',
      }
    }))
    expect(rows.some((r) => (r as { ok?: boolean }).ok)).toBe(true)
  }, 1_200_000)
})
