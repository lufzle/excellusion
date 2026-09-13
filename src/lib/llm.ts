import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  getModel,
  type ModelChoiceId,
  type ModelSpec,
  type ProviderId,
} from '~/lib/models'

export type { ModelChoiceId, ModelSpec, ProviderId } from '~/lib/models'
export {
  DEFAULT_MODEL_ID,
  ENV_KEY,
  KEY_LABEL,
  KEY_PLACEHOLDER,
  KEY_STORAGE,
  MODEL_CATALOG,
  MODEL_GROUPS,
  getModel,
  isModelChoiceId,
  defaultModelForProvider,
} from '~/lib/models'

export type LlmClient = {
  provider: ProviderId
  spec: ModelSpec
  anthropic?: Anthropic
  openai?: OpenAI
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

export type CellData = { c: string; e?: string; v?: string }
export type ChatMode = 'hybrid' | 'full'

export type ChatUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export type ChatTurn = {
  text: string
  usage: ChatUsage
  ttftMs: number
  totalMs: number
}

export const GRID_COLS = ['A', 'B', 'C', 'D'] as const
export const GRID_ROWS = 8
export const GRID_CELL_COUNT = GRID_COLS.length * GRID_ROWS
export const FULL_GRID_COLS = ['A', 'B'] as const
export const FULL_GRID_ROWS = 4
export const FULL_GRID_CELL_COUNT = FULL_GRID_COLS.length * FULL_GRID_ROWS

export const MODEL = 'claude-haiku-4-5-20251001'
export const HYBRID_MAX_TOKENS = 2048
export const FULL_MAX_TOKENS = 4096
export const SYSTEM_CACHE_TTL = '5m' as const
export const TURN_CACHE_TTL = '5m' as const

export function createClient(modelId: ModelChoiceId, apiKey: string): LlmClient {
  const spec = getModel(modelId)
  if (spec.provider === 'chatjimmy') {
    return { provider: 'chatjimmy', spec }
  }
  if (spec.provider === 'openai') {
    return { provider: 'openai', spec, openai: new OpenAI({ apiKey, dangerouslyAllowBrowser: true }) }
  }
  if (spec.provider === 'openrouter') {
    return {
      provider: 'openrouter',
      spec,
      openai: new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
          'HTTP-Referer': 'https://lufzle.github.io/excellusion/',
          'X-Title': 'Excellusion',
        },
      }),
    }
  }
  return { provider: 'anthropic', spec, anthropic: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) }
}

export function chatJimmyBase(): string {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return '/chatjimmy-api'
  }
  return 'https://chatjimmy.ai'
}

export function toChatJimmyMessages(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content }
    const text = m.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => String(b.text))
      .join('\n')
    return { role: m.role, content: text }
  })
}

export function splitChatJimmyOutput(raw: string): { text: string; stats: Record<string, unknown> | null; pending: string } {
  const start = raw.indexOf('<|stats|>')
  if (start === -1) return { text: raw, stats: null, pending: '' }
  const visible = raw.slice(0, start)
  const end = raw.indexOf('<|/stats|>', start)
  if (end === -1) return { text: visible, stats: null, pending: raw.slice(start) }
  let stats: Record<string, unknown> | null = null
  try {
    stats = JSON.parse(raw.slice(start + 9, end)) as Record<string, unknown>
  } catch {
    stats = null
  }
  return { text: visible, stats, pending: '' }
}

export function modelLabel(spec: ModelSpec): string {
  return `${spec.label} · ${spec.apiModel}`
}

export function cacheLabel(spec: ModelSpec): string {
  return spec.cacheNote
}

export function effortLabel(spec: ModelSpec): string {
  return spec.effort
}

export function emptyUsage(): ChatUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
}

export function normalizeUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
} | null | undefined): ChatUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
  }
}

function normalizeOpenAIUsage(usage: {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null
} | null | undefined): ChatUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheCreationTokens: usage?.input_tokens_details?.cache_write_tokens ?? 0,
  }
}

export function stripFences(s: string): string {
  let r = s.trim()
  if (r.startsWith('```')) r = r.replace(/^```(?:json|html)?\n?/, '')
  if (r.endsWith('```')) r = r.replace(/\n?```$/, '')
  return r.trim()
}

export function sanitizeFullHtml(html: string): string {
  return stripFences(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
}

function extractJsonPayload(raw: string): string {
  const t = stripFences(raw)
  if (t.startsWith('[') || t.startsWith('{')) return t
  const arr = t.match(/\[[\s\S]*\]/)
  if (arr) return arr[0]
  const obj = t.match(/\{[\s\S]*\}/)
  if (obj) return obj[0]
  return t
}

function asCell(value: unknown): CellData | null {
  if (!value || typeof value !== 'object') return null
  const o = value as { c?: unknown; e?: unknown; v?: unknown }
  if (o.c == null) return null
  return {
    c: String(o.c).toUpperCase(),
    e: o.e == null ? '' : String(o.e),
    v: o.v == null ? '' : String(o.v),
  }
}

export function parseHybridCells(raw: string): CellData[] {
  const parsed: unknown = JSON.parse(extractJsonPayload(raw))
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { cells?: unknown }).cells)
      ? (parsed as { cells: unknown[] }).cells
      : parsed && typeof parsed === 'object' && (parsed as { c?: unknown }).c != null
        ? [parsed]
        : null
  if (!list) throw new Error('unexpected hybrid JSON shape')
  return list.map(asCell).filter((c): c is CellData => c != null)
}

export function applyCacheBreakpoints(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg, i) => {
    if (i !== messages.length - 2 || msg.role !== 'assistant') return msg
    const content = typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral', ttl: TURN_CACHE_TTL } }]
      : [
          ...msg.content.slice(0, -1),
          { ...msg.content.at(-1), cache_control: { type: 'ephemeral', ttl: TURN_CACHE_TTL } },
        ]
    return { ...msg, content }
  })
}

type StreamParams = {
  model: string
  max_tokens: number
  temperature?: number
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }>
  messages: ChatMessage[]
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' }
}

export function buildStreamParams(
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  spec: ModelSpec = getModel('anthropic-haiku-4.5'),
): StreamParams & Record<string, unknown> {
  const params: StreamParams & Record<string, unknown> = {
    model: spec.apiModel,
    max_tokens: mode === 'hybrid' ? HYBRID_MAX_TOKENS : FULL_MAX_TOKENS,
    cache_control: { type: 'ephemeral' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: SYSTEM_CACHE_TTL } }],
    messages: applyCacheBreakpoints(messages),
  }
  if (spec.sampling) params.temperature = 0
  if (spec.thinking === 'disabled') params.thinking = { type: 'disabled' }
  if (spec.thinking === 'always' && spec.effort === 'low') {
    params.output_config = { effort: 'low' }
  }
  return params
}

export type OpenAIContentPart =
  | { type: 'input_text'; text: string; prompt_cache_breakpoint?: { mode: 'explicit' } }
  | { type: 'output_text'; text: string; prompt_cache_breakpoint?: { mode: 'explicit' } }
  | { type: 'input_image'; image_url: string; detail?: 'low' | 'auto'; prompt_cache_breakpoint?: { mode: 'explicit' } }

export type OpenAIInputItem = {
  role: 'developer' | 'user' | 'assistant'
  content: string | OpenAIContentPart[]
}

function anthropicBlockToOpenAI(block: Record<string, unknown>, last: boolean): OpenAIContentPart {
  const breakpoint = last ? { prompt_cache_breakpoint: { mode: 'explicit' as const } } : {}
  if (block.type === 'image') {
    const source = block.source as { media_type?: string; data?: string } | undefined
    const mime = source?.media_type ?? 'image/png'
    const data = source?.data ?? ''
    return {
      type: 'input_image',
      image_url: `data:${mime};base64,${data}`,
      detail: 'low',
      ...breakpoint,
    }
  }
  const text = typeof block.text === 'string' ? block.text : JSON.stringify(block)
  return { type: 'input_text', text, ...breakpoint }
}

export function toOpenAIInput(system: string, messages: ChatMessage[]): OpenAIInputItem[] {
  const items: OpenAIInputItem[] = [
    {
      role: 'developer',
      content: [{
        type: 'input_text',
        text: system,
        prompt_cache_breakpoint: { mode: 'explicit' },
      }],
    },
  ]

  const assistantBreak = messages.length >= 2 ? messages.length - 2 : -1

  for (const [i, msg] of messages.entries()) {
    const mark = i === assistantBreak && msg.role === 'assistant'
    if (typeof msg.content === 'string') {
      if (msg.role === 'assistant' && mark) {
        items.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content, prompt_cache_breakpoint: { mode: 'explicit' } }],
        })
      } else {
        items.push({ role: msg.role, content: msg.content })
      }
      continue
    }
    const parts = msg.content.map((block, j) =>
      anthropicBlockToOpenAI(block, mark && j === msg.content.length - 1),
    )
    items.push({ role: msg.role, content: parts })
  }

  return items
}

async function completeAnthropic(
  anthropic: Anthropic,
  spec: ModelSpec,
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  onText?: (chunk: string) => void,
): Promise<ChatTurn> {
  const started = performance.now()
  let ttftMs = 0
  let text = ''

  const stream = anthropic.messages.stream(buildStreamParams(system, messages, mode, spec) as Parameters<typeof anthropic.messages.stream>[0])
  stream.on('text', (delta) => {
    if (!ttftMs) ttftMs = performance.now() - started
    text += delta
    onText?.(delta)
  })

  const final = await stream.finalMessage()
  if (!text) {
    text = final.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
  }
  return {
    text,
    usage: normalizeUsage(final.usage),
    ttftMs,
    totalMs: performance.now() - started,
  }
}

async function completeOpenAI(
  openai: OpenAI,
  spec: ModelSpec,
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  onText?: (chunk: string) => void,
): Promise<ChatTurn> {
  const started = performance.now()
  let ttftMs = 0
  let text = ''
  let usage = emptyUsage()

  const stream = await openai.responses.create({
    model: spec.apiModel,
    reasoning: { effort: spec.effort },
    text: { verbosity: 'low' },
    max_output_tokens: mode === 'hybrid' ? HYBRID_MAX_TOKENS : FULL_MAX_TOKENS,
    prompt_cache_key: `excellusion:${spec.id}:${mode}`,
    prompt_cache_options: { ttl: '30m' },
    store: false,
    stream: true,
    input: toOpenAIInput(system, messages) as never,
  })

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      if (!ttftMs) ttftMs = performance.now() - started
      text += event.delta
      onText?.(event.delta)
    } else if (event.type === 'response.completed') {
      usage = normalizeOpenAIUsage(event.response.usage)
      if (!text && event.response.output_text) text = event.response.output_text
    }
  }

  return {
    text,
    usage,
    ttftMs,
    totalMs: performance.now() - started,
  }
}

export function toOpenRouterMessages(system: string, messages: ChatMessage[]) {
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }> = [
    {
      role: 'system',
      content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    },
  ]
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content })
      continue
    }
    const parts = msg.content.map((block) => {
      if (block.type === 'image') {
        const source = block.source as { media_type?: string; data?: string } | undefined
        const mime = source?.media_type ?? 'image/png'
        const data = source?.data ?? ''
        return { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }
      }
      return { type: 'text', text: typeof block.text === 'string' ? block.text : JSON.stringify(block) }
    })
    out.push({ role: msg.role, content: parts })
  }
  return out
}

function normalizeOpenRouterUsage(usage: {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null
} | null | undefined): ChatUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheCreationTokens: usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
  }
}

async function completeOpenRouter(
  openai: OpenAI,
  spec: ModelSpec,
  system: string,
  messages: ChatMessage[],
  mode: ChatMode,
  onText?: (chunk: string) => void,
): Promise<ChatTurn> {
  const started = performance.now()
  let ttftMs = 0
  let text = ''
  let usage = emptyUsage()

  const stream = await openai.chat.completions.create({
    model: spec.apiModel,
    messages: toOpenRouterMessages(system, messages) as never,
    max_tokens: mode === 'hybrid' ? HYBRID_MAX_TOKENS : FULL_MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    ...(spec.sampling ? { temperature: 0 } : {}),
    ...({
      cache_control: { type: 'ephemeral' },
      reasoning: { effort: spec.effort, exclude: true },
    } as object),
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (typeof delta === 'string' && delta) {
      if (!ttftMs) ttftMs = performance.now() - started
      text += delta
      onText?.(delta)
    }
    if (chunk.usage) usage = normalizeOpenRouterUsage(chunk.usage)
  }

  return {
    text,
    usage,
    ttftMs,
    totalMs: performance.now() - started,
  }
}

async function completeChatJimmy(
  spec: ModelSpec,
  system: string,
  messages: ChatMessage[],
  onText?: (chunk: string) => void,
): Promise<ChatTurn> {
  const started = performance.now()
  let ttftMs = 0
  let visible = ''
  let pending = ''
  let stats: Record<string, unknown> | null = null

  const res = await fetch(`${chatJimmyBase()}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: toChatJimmyMessages(messages),
      chatOptions: {
        selectedModel: spec.apiModel,
        systemPrompt: system,
        topK: 8,
      },
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`ChatJimmy ${res.status}: ${errText.slice(0, 240)}`)
  }
  if (!res.body) throw new Error('ChatJimmy returned no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const split = splitChatJimmyOutput(visible + pending)
    const nextVisible = split.text
    if (nextVisible.length > visible.length) {
      const delta = nextVisible.slice(visible.length)
      if (!ttftMs) ttftMs = performance.now() - started
      onText?.(delta)
      visible = nextVisible
    }
    pending = split.pending
    if (split.stats) stats = split.stats
  }
  if (pending) {
    const split = splitChatJimmyOutput(visible + pending)
    if (split.text.length > visible.length) {
      const delta = split.text.slice(visible.length)
      if (!ttftMs) ttftMs = performance.now() - started
      onText?.(delta)
      visible = split.text
    }
    if (split.stats) stats = split.stats
  }

  return {
    text: visible.trim(),
    usage: {
      inputTokens: Number(stats?.prefill_tokens ?? 0),
      outputTokens: Number(stats?.decode_tokens ?? 0),
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    ttftMs,
    totalMs: performance.now() - started,
  }
}

export async function completeChat(
  client: LlmClient,
  system: string,
  messages: ChatMessage[],
  mode: ChatMode = 'hybrid',
  onText?: (chunk: string) => void,
): Promise<ChatTurn> {
  if (client.provider === 'chatjimmy') {
    return completeChatJimmy(client.spec, system, messages, onText)
  }
  if (client.provider === 'openai' && client.openai) {
    return completeOpenAI(client.openai, client.spec, system, messages, mode, onText)
  }
  if (client.provider === 'openrouter' && client.openai) {
    return completeOpenRouter(client.openai, client.spec, system, messages, mode, onText)
  }
  if (!client.anthropic) throw new Error('Anthropic client is missing')
  return completeAnthropic(client.anthropic, client.spec, system, messages, mode, onText)
}

export async function prewarmCache(client: LlmClient, system: string): Promise<ChatUsage> {
  if (client.provider === 'chatjimmy') {
    const res = await fetch(`${chatJimmyBase()}/api/health`, { cache: 'no-store' })
    if (!res.ok) throw new Error('ChatJimmy health check failed')
    return emptyUsage()
  }
  if (client.provider === 'openai' && client.openai) {
    const response = await client.openai.responses.create({
      model: client.spec.apiModel,
      reasoning: { effort: client.spec.effort },
      text: { verbosity: 'low' },
      max_output_tokens: 16,
      prompt_cache_key: `excellusion:${client.spec.id}:prewarm`,
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
      store: false,
      input: [
        {
          role: 'developer',
          content: [{ type: 'input_text', text: system, prompt_cache_breakpoint: { mode: 'explicit' } }],
        },
        { role: 'user', content: '.' },
      ],
    })
    return normalizeOpenAIUsage(response.usage)
  }

  if (client.provider === 'openrouter' && client.openai) {
    const response = await client.openai.chat.completions.create({
      model: client.spec.apiModel,
      max_tokens: 16,
      messages: toOpenRouterMessages(system, [{ role: 'user', content: '.' }]) as never,
      ...({
        cache_control: { type: 'ephemeral' },
        reasoning: { effort: client.spec.effort, exclude: true },
      } as object),
    })
    return normalizeOpenRouterUsage(response.usage)
  }

  if (!client.anthropic) throw new Error('Anthropic client is missing')
  const body = buildStreamParams(system, [{ role: 'user', content: '.' }], 'hybrid', client.spec)
  try {
    const response = await client.anthropic.messages.create({ ...body, max_tokens: 0 } as never)
    return normalizeUsage(response.usage)
  } catch {
    const response = await client.anthropic.messages.create({ ...body, max_tokens: 1 } as never)
    return normalizeUsage(response.usage)
  }
}

export const HYBRID_SYSTEM = `You are an Excel calculation engine for the grid A1:D8 only (columns A–D, rows 1–8).

Each user message is one cell edit: {"c":"A1","e":"10"} or {"c":"B1","e":"=A1*2"}.
- "c" is the address (accept any case; always emit uppercase).
- "e" is the new raw contents. If "e" is "" the cell is cleared.
- After every edit, recalculate the entire grid. Formulas that depend on the edited cell must update.
- Never invent values for cells the user has not filled. Omit empty cells.

Reply with ONLY the JSON array itself — never markdown, never code fences, never commentary, never extra keys.
Example (this is the entire reply):
[{"c":"A1","e":"10","v":"10"},{"c":"A2","e":"=A1*2","v":"20"}]
- "e" = raw contents (formulas still start with =).
- "v" = display value as a string. For non-formulas, v equals e.
- One object per filled cell; each "c" unique.
- Errors: #DIV/0!, #REF!, #VALUE!, #NAME?, #N/A. References outside A1:D8 (including column E+) are #REF!.
- Honor arithmetic plus SUM, AVERAGE, MIN, MAX, IF, COUNT, COUNTA.`

export const FULL_SYSTEM = `You simulate Excel on A1:B4 as static HTML (columns A–B, rows 1–4 only).

Each user turn is a raw DOM event as JSON. The latest turn may include a screenshot with a red crosshair. Older turns are events only; the last <body> you returned is the current UI. First message is {"type":"init"} with no screenshot.

Click targeting is decided by the event JSON, not by guessing pixels:
- If "dataCell" is present (e.g. "B1"), that is the cell that was clicked. Select THAT cell. Do not pick a neighbor.
- If "hit" is "formula" or "formula-bar", the click was on the formula box, not a grid cell.
- Use the screenshot only as backup when dataCell/hit are missing.

Do NOT draw the red crosshair (or any cursor mark) in the HTML you return.

Init: empty grid, A1 selected, formula bar address A1 and empty value.

Clicks:
- On a cell (td[data-cell]): select it; set #fx b to its address and #fxv to its raw contents.
- On the formula bar field (#fxv, the box after "fx"): begin editing the selected cell; keep the expression in #fxv.
- detail:2 (double-click) on a cell: same as in-cell edit.
- Right-click: Excel-like context menu only when needed.

Keys: printable characters write into the selected/editing cell (cell text and #fxv). Enter commits and moves down; Tab commits and moves right; Esc cancels; Delete clears; arrows move selection (commit first); F2 edits; Ctrl+C/V/X/Z/Y/B/I/U as in Excel.

Formulas start with =. Evaluate them. Errors: #VALUE! #REF! #DIV/0! #NAME? #N/A. References outside A1:B4 (C+, row 5+) are #REF!. Keep every previously filled cell.

Return ONLY a minified <body>…</body>. No markdown, doctype, html, head, scripts, event handlers, comments, or extra whitespace.

Required inside <body>, in this order:
1. This exact style: <style>body{margin:0;font:11px Calibri,sans-serif}#fx{display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid #c6c6c6;background:#f3f3f3}#fx b{width:48px;text-align:center;flex:none}#fx i{flex:none;font-style:italic;color:#666}#fxv{flex:1;min-width:160px;height:20px;border:1px solid #b5b5b5;background:#fff;padding:0 6px;font:11px Calibri,sans-serif}table{border-collapse:collapse;table-layout:fixed;width:100%}th,td{border:1px solid #e2e2e2;height:22px;padding:0 4px;font:11px Calibri,sans-serif}th,.r{background:#f3f3f3;color:#666;font-weight:500;text-align:center}td[data-selected]{border:2px solid #217346}</style>
2. Formula bar MUST include a visible value box, even when empty: <div id="fx"><b>A1</b><i>fx</i><input id="fxv" value=""></div> — b = selected address, #fxv = raw expression or edit buffer. Never omit #fxv. Do not use an empty span that collapses.
3. <table>: blank corner th, thead A–B, 4 body rows each starting with <th class="r">n</th>. All 8 cells always present (A1:B4). Every td has data-cell="A1" (uppercase). Selected td has data-selected.
4. Menus/overlays only when needed. Keep the body short.`
