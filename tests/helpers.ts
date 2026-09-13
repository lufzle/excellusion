import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type ChatTurn, type ChatUsage } from '~/lib/llm'
import { ENV_KEY, defaultModelForProvider, getModel, type ProviderId } from '~/lib/models'

export const PERF_LABEL = process.env.PERF_LABEL ?? 'run'
export const RESULTS_DIR = resolve(process.cwd(), 'tests/results')

export function requireClient(provider: ProviderId = 'anthropic') {
  const spec = defaultModelForProvider(provider)
  const envKey = ENV_KEY[provider]
  if (!envKey) return createClient(spec.id, '')
  const key = process.env[envKey]
  if (!key) {
    throw new Error(`${envKey} is missing. Put it in .env at the repo root.`)
  }
  return createClient(spec.id, key)
}

export function requireClientForModel(modelId: Parameters<typeof createClient>[0]) {
  const spec = getModel(modelId)
  const envKey = ENV_KEY[spec.provider]
  if (!envKey) return createClient(spec.id, '')
  const key = process.env[envKey]
  if (!key) {
    throw new Error(`${envKey} is missing. Put it in .env at the repo root.`)
  }
  return createClient(spec.id, key)
}

export const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export function cellMap(cells: { c: string; e?: string; v?: string }[]) {
  return new Map(cells.map((c) => [c.c, c]))
}

export function assertHtmlGrid(html: string) {
  const body = html.includes('<body')
  const table = html.includes('<table')
  const cells = [...html.matchAll(/data-cell="([A-Ba-b][1-4])"/g)].map((m) => m[1].toUpperCase())
  const unique = new Set(cells)
  return { body, table, cellCount: unique.size, hasSelected: /data-selected/.test(html) }
}

export type TurnRecord = ChatTurn & {
  label: string
  cacheHit: boolean
}

export function toTurnRecord(label: string, turn: ChatTurn): TurnRecord {
  return {
    label,
    ...turn,
    cacheHit: turn.usage.cacheReadTokens > 0,
  }
}

export function summarize(turns: TurnRecord[]) {
  const n = turns.length || 1
  const sum = (fn: (t: TurnRecord) => number) => turns.reduce((a, t) => a + fn(t), 0)
  return {
    turns: turns.length,
    meanTtftMs: Math.round(sum((t) => t.ttftMs) / n),
    meanTotalMs: Math.round(sum((t) => t.totalMs) / n),
    minTtftMs: Math.round(Math.min(...turns.map((t) => t.ttftMs))),
    maxTtftMs: Math.round(Math.max(...turns.map((t) => t.ttftMs))),
    minTotalMs: Math.round(Math.min(...turns.map((t) => t.totalMs))),
    maxTotalMs: Math.round(Math.max(...turns.map((t) => t.totalMs))),
    cacheHits: turns.filter((t) => t.cacheHit).length,
    totalCacheReadTokens: sum((t) => t.usage.cacheReadTokens),
    totalCacheCreationTokens: sum((t) => t.usage.cacheCreationTokens),
    totalInputTokens: sum((t) => t.usage.inputTokens),
    totalOutputTokens: sum((t) => t.usage.outputTokens),
  }
}

export function writeResults(suite: string, payload: unknown) {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const file = resolve(RESULTS_DIR, `${PERF_LABEL}-${suite}.json`)
  writeFileSync(file, JSON.stringify({ label: PERF_LABEL, recordedAt: new Date().toISOString(), ...payload as object }, null, 2))
  return file
}

export function readResults(label: string, suite: string): Record<string, unknown> | null {
  const file = resolve(RESULTS_DIR, `${label}-${suite}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

export function formatUsage(u: ChatUsage) {
  return `in=${u.inputTokens} out=${u.outputTokens} cache_read=${u.cacheReadTokens} cache_write=${u.cacheCreationTokens}`
}

export function logTurn(rec: TurnRecord) {
  console.log(
    `  [${rec.label}] ttft=${Math.round(rec.ttftMs)}ms total=${Math.round(rec.totalMs)}ms ${formatUsage(rec.usage)} hit=${rec.cacheHit}`,
  )
}
