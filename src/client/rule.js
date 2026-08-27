/**
 * Pure instruction-selection logic for the bubble. No DOM, no React.
 * These functions are unit-tested through test/rule.test.mjs and reused by
 * the browser entry (build.mjs splices this module into the factory scope).
 */

/** Map one chat node's payload to a display string for the bubble. */
export function instructionTextOf(nodeData) {
  if (!nodeData || typeof nodeData !== 'object') return ''
  const blocks = Array.isArray(nodeData.content) ? nodeData.content : []
  const parts = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text.trim() !== '') parts.push(block.text)
    } else if (block.type === 'image') {
      parts.push('[图片]')
    }
  }
  return parts.join('\n').replace(/\s+/g, ' ').trim()
}

/** Build the ordered instruction list (kind user/steering) from a ConversationSnapshot. */
export function collectInstructions(snapshot) {
  if (!snapshot || !snapshot.chat) return []
  const { order, nodes } = snapshot.chat
  if (!Array.isArray(order) || !nodes || typeof nodes.get !== 'function') return []
  const out = []
  for (const key of order) {
    const node = nodes.get(key)
    if (!node) continue
    if (node.kind !== 'user' && node.kind !== 'steering') continue
    const text = instructionTextOf(node.data)
    if (!text) continue
    out.push({ key, text })
  }
  return out
}

/**
 * Choose which instruction the bubble shows.
 * @param {{key: string, text: string}[]} instructions — chronological order
 * @param {Map<string, {bottom: number}>} rects — message-box bottom (viewport px) by key
 * @param {number} foldTop — transcript viewport top edge (viewport px)
 * @param {number} epsilon — tolerance (px); <= foldTop + epsilon counts as "scrolled out"
 * @returns {{key: string, text: string} | null}
 */
export function pickInstruction(instructions, rects, foldTop, epsilon) {
  if (!rects || typeof rects.get !== 'function') {
    return instructions.length > 0 ? instructions[0] : null
  }
  let passed = null
  let firstVisible = null
  for (const item of instructions) {
    const rect = rects.get(item.key)
    if (!rect) continue
    if (firstVisible === null) firstVisible = item
    if (rect.bottom <= foldTop + epsilon) passed = item
  }
  return passed || firstVisible
}
