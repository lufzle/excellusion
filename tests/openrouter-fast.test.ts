import OpenAI from 'openai'
import { describe, it } from 'vitest'
import { HYBRID_SYSTEM, parseHybridCells } from '~/lib/llm'

const EDITS = [
  { c: 'A1', e: '10' },
  { c: 'A2', e: '=A1*2' },
  { c: 'B1', e: '=SUM(A1:A2)' },
]

const CANDIDATES = [
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash-lite',
  'z-ai/glm-5.3-flash',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'deepseek/deepseek-v4-flash-0731',
]

describe('openrouter speed candidates vs haiku', () => {
  it('hybrid 3-edit chain', async () => {
    const key = process.env.OPENROUTER_API_KEY
    if (!key) throw new Error('OPENROUTER_API_KEY missing')
    const openai = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://lufzle.github.io/excellusion/', 'X-Title': 'Excellusion' },
    })

    for (const model of CANDIDATES) {
      const t0all = performance.now()
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: HYBRID_SYSTEM },
        ]
        let last = ''
        const turns: { ttft: number; total: number; out: number }[] = []
        for (const edit of EDITS) {
          messages.push({ role: 'user', content: JSON.stringify(edit) })
          const started = performance.now()
          let ttft = 0
          let text = ''
          const stream = await openai.chat.completions.create({
            model,
            messages,
            max_tokens: 2048,
            stream: true,
            stream_options: { include_usage: true },
            ...({ reasoning: { effort: 'low', exclude: true } } as object),
          })
          let out = 0
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content
            if (typeof delta === 'string' && delta) {
              if (!ttft) ttft = performance.now() - started
              text += delta
            }
            if (chunk.usage?.completion_tokens) out = chunk.usage.completion_tokens
          }
          last = text
          messages.push({ role: 'assistant', content: text })
          turns.push({ ttft, total: performance.now() - started, out })
        }
        const cells = parseHybridCells(last)
        const map = new Map(cells.map((c) => [c.c, c]))
        const correct = map.get('A1')?.v === '10' && map.get('A2')?.v === '20' && map.get('B1')?.v === '30'
        const meanTtft = Math.round(turns.reduce((a, t) => a + t.ttft, 0) / turns.length)
        const meanTotal = Math.round(turns.reduce((a, t) => a + t.total, 0) / turns.length)
        console.log(
          `${model} ok meanTtft=${meanTtft}ms meanTotal=${meanTotal}ms correct=${correct} wall=${Math.round(performance.now() - t0all)}ms`,
        )
        for (const [i, t] of turns.entries()) {
          console.log(`  turn${i + 1} ttft=${Math.round(t.ttft)} total=${Math.round(t.total)} out=${t.out}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`${model} FAILED ${msg.slice(0, 240)}`)
      }
    }
  }, 300_000)
})
