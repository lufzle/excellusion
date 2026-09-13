import { describe, expect, it } from 'vitest'
import { FULL_SYSTEM, completeChat, sanitizeFullHtml } from '~/lib/llm'
import { TINY_PNG_B64, assertHtmlGrid, requireClient } from './helpers'

describe('full spreadsheet (live API)', () => {
  it('returns an A1:B4 HTML grid on init and keeps it after a click', async () => {
    const client = requireClient()
    const messages: object[] = [{ role: 'user', content: '{"type":"init"}' }]

    const init = await completeChat(client, FULL_SYSTEM, messages as never, 'full')
    const initHtml = sanitizeFullHtml(init.text)
    const initGrid = assertHtmlGrid(initHtml)
    expect(initGrid.body, `init missing <body>: ${initHtml.slice(0, 400)}`).toBe(true)
    expect(initGrid.table, `init missing <table>: ${initHtml.slice(0, 400)}`).toBe(true)
    expect(initGrid.cellCount, `cells=${initGrid.cellCount} html=${initHtml.slice(0, 800)}`).toBe(8)
    expect(initHtml.toLowerCase()).not.toContain('<script')

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
            clientX: 80,
            clientY: 80,
            detail: 1,
          }),
        },
      ],
    })

    const click = await completeChat(client, FULL_SYSTEM, messages as never, 'full')
    const clickHtml = sanitizeFullHtml(click.text)
    const clickGrid = assertHtmlGrid(clickHtml)
    expect(clickGrid.body).toBe(true)
    expect(clickGrid.table).toBe(true)
    expect(clickGrid.cellCount).toBe(8)
  }, 180_000)
})
