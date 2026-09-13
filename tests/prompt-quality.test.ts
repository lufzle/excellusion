import { describe, expect, it } from 'vitest'
import {
  FULL_SYSTEM,
  HYBRID_SYSTEM,
  completeChat,
  parseHybridCells,
  sanitizeFullHtml,
} from '~/lib/llm'
import {
  PERF_LABEL,
  TINY_PNG_B64,
  assertHtmlGrid,
  cellMap,
  readResults,
  requireClient,
  writeResults,
} from './helpers'

type Check = { name: string; pass: boolean; detail?: string }

function check(name: string, pass: boolean, detail?: string): Check {
  if (!pass) console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  else console.log(`  ok   ${name}`)
  return { name, pass, detail }
}

function score(checks: Check[]) {
  const passed = checks.filter((c) => c.pass).length
  return { passed, total: checks.length, rate: passed / checks.length, checks }
}

async function hybridTurns(
  edits: object[],
) {
  const client = requireClient()
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  const turns: { text: string; cells: ReturnType<typeof parseHybridCells>; parseOk: boolean; raw: string }[] = []
  for (const edit of edits) {
    messages.push({ role: 'user', content: JSON.stringify(edit) })
    const turn = await completeChat(client, HYBRID_SYSTEM, messages, 'hybrid')
    let cells: ReturnType<typeof parseHybridCells> = []
    let parseOk = true
    try {
      cells = parseHybridCells(turn.text)
    } catch {
      parseOk = false
    }
    turns.push({ text: turn.text, cells, parseOk, raw: turn.text })
    messages.push({ role: 'assistant', content: turn.text })
  }
  return turns
}

describe('prompt quality (live API, Haiku)', () => {
  it('hybrid: format, overwrite, recompute, IF, and errors', async () => {
    const turns = await hybridTurns([
      { c: 'A1', e: '10' },
      { c: 'A2', e: '=A1*2' },
      { c: 'B1', e: '=SUM(A1:A2)' },
      { c: 'A1', e: '7' },
      { c: 'C1', e: '=1/0' },
      { c: 'D1', e: '=IF(A2>10,"yes","no")' },
    ])

    const t0 = turns[0]
    const t3 = turns[3]
    const t4 = turns[4]
    const t5 = turns[5]
    const map3 = cellMap(t3.cells)
    const map5 = cellMap(t5.cells)

    const checks: Check[] = [
      check('t0 parses', t0.parseOk, t0.raw.slice(0, 120)),
      check('t0 no fences', !t0.raw.trim().startsWith('```'), t0.raw.slice(0, 40)),
      check('t0 only A1', t0.parseOk && t0.cells.length === 1 && t0.cells[0].c.toUpperCase() === 'A1'),
      check('t0 value 10', t0.cells[0]?.v === '10'),
      check('t0 e is raw', t0.cells[0]?.e === '10'),
      check('t3 parses', t3.parseOk),
      check('t3 A1 overwritten to 7', map3.get('A1')?.v === '7', map3.get('A1')?.v),
      check('t3 A2 recomputed to 14', map3.get('A2')?.v === '14', map3.get('A2')?.v),
      check('t3 B1 recomputed to 21', map3.get('B1')?.v === '21', map3.get('B1')?.v),
      check('t3 A2 keeps formula', map3.get('A2')?.e === '=A1*2', map3.get('A2')?.e),
      check('t4 parses', t4.parseOk),
      check('t4 DIV/0', /#DIV\/0!?/i.test(cellMap(t4.cells).get('C1')?.v ?? ''), cellMap(t4.cells).get('C1')?.v),
      check('t5 IF yes', map5.get('D1')?.v?.toLowerCase() === 'yes', map5.get('D1')?.v),
      check('t5 unique addresses', t5.parseOk && new Set(t5.cells.map((c) => c.c.toUpperCase())).size === t5.cells.length),
    ]

    const summary = score(checks)
    writeResults('prompt-hybrid', { summary, raw: turns.map((t) => t.raw) })
    printVsBaseline('prompt-hybrid', summary)
    expect(summary.passed, failNames(checks)).toBe(summary.total)
  }, 300_000)

  it('hybrid: text value then overwrite; no invented cells', async () => {
    const turns = await hybridTurns([
      { c: 'B2', e: 'hello' },
      { c: 'B2', e: '99' },
    ])
    const map0 = cellMap(turns[0].cells)
    const map1 = cellMap(turns[1].cells)
    const checks: Check[] = [
      check('text parses', turns[0].parseOk),
      check('text v=hello', map0.get('B2')?.v === 'hello', map0.get('B2')?.v),
      check('text only B2', turns[0].cells.length === 1),
      check('overwrite 99', map1.get('B2')?.v === '99', map1.get('B2')?.v),
      check('still one B2', turns[1].cells.filter((c) => c.c.toUpperCase() === 'B2').length === 1),
    ]
    const summary = score(checks)
    writeResults('prompt-hybrid-text', { summary, raw: turns.map((t) => t.raw) })
    printVsBaseline('prompt-hybrid-text', summary)
    expect(summary.passed, failNames(checks)).toBe(summary.total)
  }, 180_000)

  it('full: init chrome and a follow-up click stay a static A1:B4 grid', async () => {
    const client = requireClient()
    const messages: object[] = [{ role: 'user', content: '{"type":"init"}' }]
    const init = await completeChat(client, FULL_SYSTEM, messages as never, 'full')
    const initHtml = sanitizeFullHtml(init.text)
    const initGrid = assertHtmlGrid(initHtml)
    const lower = initHtml.toLowerCase()

    messages.push({ role: 'assistant', content: init.text })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: TINY_PNG_B64 },
        },
        {
          type: 'text',
          text: JSON.stringify({
            type: 'mousedown',
            button: 0,
            clientX: 90,
            clientY: 48,
            detail: 1,
            targetTag: 'td',
            targetText: '',
          }),
        },
      ],
    })
    const click = await completeChat(client, FULL_SYSTEM, messages as never, 'full')
    const clickHtml = sanitizeFullHtml(click.text)
    const clickGrid = assertHtmlGrid(clickHtml)
    const clickLower = clickHtml.toLowerCase()

    const checks: Check[] = [
      check('init <body>', initGrid.body, initHtml.slice(0, 120)),
      check('init <table>', initGrid.table),
      check('init 8 cells', initGrid.cellCount === 8, String(initGrid.cellCount)),
      check('init selected', initGrid.hasSelected),
      check('init #fx', /id=["']fx["']/.test(initHtml)),
      check('init formula field', /id=["']fxv["']/.test(initHtml) || /<div id=["']fx["'][\s\S]*<input/i.test(initHtml), initHtml.slice(0, 280)),
      check('init no script', !lower.includes('<script')),
      check('init no onclick', !/\son\w+\s*=/.test(initHtml)),
      check('init no doctype', !lower.includes('<!doctype')),
      check('init no <html', !/<html\b/.test(lower)),
      check('init style tag', /<style[\s>]/.test(lower)),
      check('init uppercase A1', /data-cell="A1"/.test(initHtml) || initGrid.cellCount === 8),
      check('init thead A-B', /[>"]A[<"]/.test(initHtml) && /[>"]B[<"]/.test(initHtml)),
      check('click 8 cells', clickGrid.cellCount === 8, String(clickGrid.cellCount)),
      check('click selected', clickGrid.hasSelected),
      check('click no script', !clickLower.includes('<script')),
      check('click still #fx', /id=["']fx["']/.test(clickHtml)),
      check('click formula field', /id=["']fxv["']/.test(clickHtml) || /<div id=["']fx["'][\s\S]*<input/i.test(clickHtml)),
    ]

    const summary = score(checks)
    writeResults('prompt-full', {
      summary,
      initLen: initHtml.length,
      clickLen: clickHtml.length,
      initTokens: init.usage.outputTokens,
      clickTokens: click.usage.outputTokens,
    })
    printVsBaseline('prompt-full', summary)
    expect(summary.passed, failNames(checks)).toBe(summary.total)
  }, 300_000)
})

function failNames(checks: Check[]) {
  return checks.filter((c) => !c.pass).map((c) => c.name).join('; ') || 'all passed'
}

function printVsBaseline(suite: string, current: ReturnType<typeof score>) {
  if (PERF_LABEL === 'baseline') return
  const prev = readResults('baseline', suite)
  if (!prev) return
  const old = prev.summary as { passed: number; total: number }
  console.log(`  vs baseline ${suite}: ${old.passed}/${old.total} → ${current.passed}/${current.total}`)
}
