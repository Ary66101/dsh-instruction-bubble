/** Host half of dsh-instruction-bubble: client-only plugin, nothing runs here. */
export const name = 'dsh-instruction-bubble'

/** Host-side service deps (none). */
export const inject = []

/** Loader entry body: intentionally empty; all behavior lives in lib/client.js. */
export function apply() {}
