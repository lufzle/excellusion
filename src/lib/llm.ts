import Anthropic from '@anthropic-ai/sdk'

// Cell in the LLM response
export type CellData = { c: string; e?: string; v?: string }

export function createClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

// Add cache breakpoint on the second-to-last message (previous assistant turn)
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

export const FULL_SYSTEM = `You are simulating a Microsoft Excel spreadsheet interface. Replicate Excel's behavior as accurately as possible for all mouse and keyboard interactions on an 8-column (A–H) by 8-row (1–8) grid.

Each user message includes a screenshot of the current spreadsheet state and a raw DOM event as JSON. For mouse events, a red crosshair on the screenshot marks the click position. Use the screenshot to read the current state and determine what was interacted with. The first message has no screenshot — just {"type":"init"}.

<interaction>
Handle all interactions exactly as Excel does, including but not limited to:

Mouse:
- Left click: cell selection, formula bar click-to-edit, column/row header selection.
- Right click (button:2): show a context menu with Excel options (Cut, Copy, Paste, Insert, Delete, Format Cells, etc.) appropriate to what was right-clicked.
- Double click (detail:2): enter in-cell editing mode, placing cursor in the cell's content.

Keyboard:
- Printable characters: begin editing the selected cell (replace mode). Show typed text in cell and formula bar.
- Enter: commit edit, move selection down. Shift+Enter: commit, move up.
- Tab: commit edit, move selection right. Shift+Tab: commit, move left.
- Escape: cancel edit, revert.
- Backspace: delete last character while editing.
- Delete: clear cell contents.
- Arrow keys: navigate selection (commit pending edit first). Shift+Arrow: extend selection range.
- F2: toggle edit mode on selected cell.
- Ctrl+C/Ctrl+V/Ctrl+X: show visual feedback (dashed border for cut/copy source).
- Ctrl+Z/Ctrl+Y: undo/redo.
- Ctrl+B/Ctrl+I/Ctrl+U: toggle bold/italic/underline.

Formulas:
- Formulas start with "=". Evaluate them (=A1+B1, =SUM(A1:A5), =IF(A1>0,"yes","no"), etc.).
- Show computed value in the cell, raw formula in the formula bar.
- Use Excel error codes (#VALUE!, #REF!, #DIV/0!, #NAME?, #N/A) for errors.
</interaction>

<output_format>
Return ONLY a <body> tag. No markdown fences. No explanation. No doctype, html, or head tags.

Pure static HTML only. NO script tags. NO JavaScript. NO event handlers.

Inside the <body>:
1. A <style> tag with all CSS.
2. A formula bar with the selected cell address, an "fx" label, and the cell's raw expression or editing buffer.
3. A <table> with column headers A–H in thead, and 8 body rows each with a row number and 8 cells. Every cell td must have a data-cell attribute (e.g. data-cell="A1"). All 64 cells must always be present. The selected cell gets a data-selected attribute.
4. Any context menus, selection ranges, or other UI overlays as needed.

Style it to look like Excel: 11px Calibri/sans-serif font, light gray (#f3f3f3) headers, thin #e2e2e2 grid lines. Use a 2px solid #217346 border (not outline) on the selected cell.
</output_format>`
