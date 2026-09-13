import { describe, expect, it } from 'vitest'
import {
  HYBRID_SYSTEM,
  applyCacheBreakpoints,
  buildStreamParams,
  completeChat,
  parseHybridCells,
  sanitizeFullHtml,
  toOpenAIInput,
  toOpenRouterMessages,
  splitChatJimmyOutput,
  MODEL_CATALOG,
} from '~/lib/llm'
import { cellMap, requireClient } from './helpers'

describe('hybrid spreadsheet (live API)', () => {
  it('parses both array and {cells} shapes', () => {
    expect(parseHybridCells('[{"c":"A1","e":"1","v":"1"}]')).toEqual([
      { c: 'A1', e: '1', v: '1' },
    ])
    expect(parseHybridCells('{"cells":[{"c":"B2","e":"=A1","v":"1"}]}')).toEqual([
      { c: 'B2', e: '=A1', v: '1' },
    ])
    expect(parseHybridCells('```json\n[{"c":"A1","e":"x","v":"x"}]\n```')).toEqual([
      { c: 'A1', e: 'x', v: 'x' },
    ])
    expect(parseHybridCells('{"c":"A1","e":"1","v":"1"}')).toEqual([
      { c: 'A1', e: '1', v: '1' },
    ])
    expect(parseHybridCells('Here you go:\n{"c":"B1","e":"2","v":"2"}\n')).toEqual([
      { c: 'B1', e: '2', v: '2' },
    ])
    expect(parseHybridCells('{"c":"A1","e":1,"v":1}')).toEqual([
      { c: 'A1', e: '1', v: '1' },
    ])
  })

  it('places a cache breakpoint on the previous assistant turn', () => {
    const messages = [
      { role: 'user' as const, content: '{"c":"A1","e":"1"}' },
      { role: 'assistant' as const, content: '[{"c":"A1","e":"1","v":"1"}]' },
      { role: 'user' as const, content: '{"c":"A2","e":"2"}' },
    ]
    const marked = applyCacheBreakpoints(messages)
    const assistant = marked[1].content
    expect(Array.isArray(assistant)).toBe(true)
    expect((assistant as { cache_control?: { type: string; ttl?: string } }[])[0].cache_control).toEqual({
      type: 'ephemeral',
      ttl: '5m',
    })
    expect(marked[2].content).toBe(messages[2].content)
  })

  it('strips scripts from full-mode HTML', () => {
    const dirty = '<body><table></table><script>alert(1)</script></body>'
    expect(sanitizeFullHtml(dirty)).toBe('<body><table></table></body>')
  })

  it('strips ChatJimmy stats trailers', () => {
    const raw = '[{"c":"A1","e":"10","v":"10"}]\n<|stats|>{"prefill_tokens":12,"decode_tokens":9}<|/stats|>'
    const split = splitChatJimmyOutput(raw)
    expect(split.text.trim()).toBe('[{"c":"A1","e":"10","v":"10"}]')
    expect(split.stats).toMatchObject({ prefill_tokens: 12, decode_tokens: 9 })
  })

  it('catalogs grouped models with low or none effort', () => {
    const groups = [...new Set(MODEL_CATALOG.map((m) => m.group))]
    expect(groups).toEqual(['Anthropic', 'OpenAI', 'OpenRouter', 'ChatJimmy'])
    expect(MODEL_CATALOG.every((m) => m.effort === 'none' || m.effort === 'low')).toBe(true)
    expect(MODEL_CATALOG.find((m) => m.id === 'openrouter-deepseek-v4.1-flash')?.apiModel).toBe('deepseek/deepseek-v4.1-flash')
    expect(MODEL_CATALOG.find((m) => m.id === 'openrouter-gemini-3.8-flash')?.apiModel).toBe('google/gemini-3.8-flash')
    expect(MODEL_CATALOG.find((m) => m.id === 'openrouter-grok-4.6')?.apiModel).toBe('x-ai/grok-4.6')
  })

  it('builds OpenRouter chat messages with a cached system block', () => {
    const msgs = toOpenRouterMessages(HYBRID_SYSTEM, [
      { role: 'user', content: '{"c":"A1","e":"1"}' },
    ])
    expect(msgs[0].role).toBe('system')
    const sys = msgs[0].content as { type: string; cache_control?: { type: string } }[]
    expect(sys[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('builds an OpenAI Responses prefix with an explicit system cache breakpoint', () => {
    const input = toOpenAIInput(HYBRID_SYSTEM, [
      { role: 'user', content: '{"c":"A1","e":"1"}' },
      { role: 'assistant', content: '[{"c":"A1","e":"1","v":"1"}]' },
      { role: 'user', content: '{"c":"A2","e":"2"}' },
    ])
    expect(input[0].role).toBe('developer')
    const sys = input[0].content as { type: string; prompt_cache_breakpoint?: { mode: string } }[]
    expect(sys[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit' })
    const asst = input[2].content as { type: string; prompt_cache_breakpoint?: { mode: string } }[]
    expect(asst[0].type).toBe('output_text')
    expect(asst[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit' })
    const imageInput = toOpenAIInput('sys', [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' } },
        { type: 'text', text: '{"type":"click"}' },
      ],
    }])
    const parts = imageInput[1].content as { type: string; image_url?: string; detail?: string }[]
    expect(parts[0]).toMatchObject({
      type: 'input_image',
      image_url: 'data:image/jpeg;base64,abc',
      detail: 'low',
    })
    expect(parts[1]).toMatchObject({ type: 'input_text', text: '{"type":"click"}' })
  })

  it('requests automatic caching and 5m system TTL without a JSON schema', () => {
    const params = buildStreamParams(HYBRID_SYSTEM, [{ role: 'user', content: '{"c":"A1","e":"1"}' }], 'hybrid')
    expect(params.cache_control).toEqual({ type: 'ephemeral' })
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '5m' })
    expect('output_config' in params).toBe(false)
    expect(params.max_tokens).toBe(2048)
  })

  it('evaluates a short formula chain', async () => {
    const client = requireClient()
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
})
