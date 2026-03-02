import Anthropic from '@anthropic-ai/sdk'

export type CellData = { c: string; e?: string; v?: string }

export function createClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

function withCacheBreakpoints(messages: any[]): any[] {
  return messages.map((msg: any, i: number) => {
    if (i === messages.length - 2 && msg.role === 'assistant') {
      const content = typeof msg.content === 'string'
        ? [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
        : [...msg.content.slice(0, -1), { ...msg.content.at(-1), cache_control: { type: 'ephemeral' } }]
      return { ...msg, content }
    }
    return msg
  })
}

export async function* streamChat(
  client: Anthropic,
  system: string,
  messages: any[],
): AsyncGenerator<string> {
  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    temperature: 0,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: withCacheBreakpoints(messages),
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

export const HYBRID_SYSTEM = `You are simulating a spreadsheet. The grid range is A1:H8 (columns A-H, rows 1-8).

When the user sends cell edits, compute the current state of the entire grid. For every cell that has content, return it. Empty cells can be omitted.

Reply with ONLY a JSON array, no markdown, no explanation. Each element: {"c":"A1","e":"=A1+1","v":"2"} where "e" is the raw expression and "v" is the computed display value. For plain values (non-formula), "v" should equal "e". For formulas, "v" is the computed result. If a formula errors, use Excel error codes like #VALUE!, #REF!, #DIV/0! as the "v".

Example response:
[{"c":"A1","e":"10","v":"10"},{"c":"A2","e":"=A1*2","v":"20"}]`
