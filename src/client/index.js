/**
 * Browser half of dsh-instruction-bubble.
 *
 * Registered into the shell.overlay slot (root scope, additive): a floating
 * bubble pinned to the top edge of the transcript scrollport
 * ([data-conversation-scroll]) showing the last user instruction whose
 * message row has scrolled out of view, switching backward as the user
 * scrolls up. Instruction rows are located through the stable chat-flow
 * attributes ([data-chat-flow-kind="user"|"steering"] + data-chat-flow-key).
 * The selection rule lives in rule.js; this file only wires it to the DOM.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import { collectInstructions, pickInstruction } from './rule.js'

/** Cordis services this entry needs before apply (client context). */
export const inject = ['slots', 'sessions']

const STYLE_ID = 'dsh-instruction-bubble-css'
const EPSILON_PX = 4
const POLL_MS = 500

/** Inject the bubble stylesheet once at module materialization (loader owns it). */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-instruction-bubble'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = `
#dsh-instruction-bubble {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease;
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform, rgba(24, 24, 27, 0.72));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  box-shadow: var(--dsw-shadow-lv2, 0 2px 10px rgba(0, 0, 0, 0.18));
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: var(--dsw-alias-label-secondary, #d4d4d8);
  font-family: var(--dsw-font-family, system-ui, -apple-system, sans-serif);
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}
`
  document.head.appendChild(style)
}
injectStyles()

/** uSES subscription to the current session's ConversationSnapshot. */
function useCurrentSessionSnapshot(sessions, sessionId) {
  const subscribe = useCallback((onStoreChange) => {
    if (!sessionId) return () => {}
    const binding = sessions.binding(sessionId)
    return binding ? binding.session.subscribe(onStoreChange) : () => {}
  }, [sessions, sessionId])
  const getSnapshot = useCallback(() => {
    if (!sessionId) return undefined
    const binding = sessions.binding(sessionId)
    return binding ? binding.session.getSnapshot() : undefined
  }, [sessions, sessionId])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** The floating bubble. Registered into the shell.overlay slot. */
function InstructionBubble(props) {
  const { useSessions, sessions } = props
  const sessionId = useSessions((s) => (s ? s.current : undefined))
  const snapshot = useCurrentSessionSnapshot(sessions, sessionId)

  const [text, setText] = useState(null)
  const [frame, setFrame] = useState(null)

  const snapshotRef = useRef(snapshot)
  const scheduleRef = useRef(null)
  const frameRef = useRef(null)

  // Keep the latest snapshot for the rAF/interval callbacks.
  useEffect(() => {
    snapshotRef.current = snapshot
  })

  // Recompute when the conversation snapshot publishes (new messages,
  // streaming, loadOlder, blank/removed flips). Coalesced by schedule().
  useEffect(() => {
    if (scheduleRef.current) scheduleRef.current()
  }, [snapshot])

  useEffect(() => {
    const hide = () => {
      frameRef.current = null
      setText(null)
      setFrame(null)
    }

    if (!sessionId) {
      scheduleRef.current = null
      hide()
      return undefined
    }

    /**
     * The conversation's *visible* right edge. The right-side panel overlays
     * the transcript and reflows it only after (or while) the panel slides;
     * during the slide the panel's left edge is the true visible boundary.
     * - panel left of the layout edge (opening / steady-open): the visible
     *   conversation ends at the panel edge → follow it leftward;
     * - panel right of the layout edge (closing): the conversation will widen
     *   to the panel edge → follow it rightward.
     * Both directions glide with the panel instead of snapping ~500ms late.
     */
    const visibleRightOf = (spRect) => {
      const panel = document.querySelector('[data-dsh-panel]:not([data-dsh-bottom-panel])')
      if (!panel || getComputedStyle(panel).visibility === 'hidden') return spRect.right
      const pl = panel.getBoundingClientRect().left
      if (pl <= spRect.left) return spRect.right
      return pl < spRect.right ? pl : Math.min(pl, window.innerWidth)
    }

    let raf = 0
    let timer = null
    let scrollport = null
    let disposed = false
    let ro = null
    let posRaf = 0
    let lastRect = null

    const schedule = (cause) => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!disposed) recompute(cause)
      })
    }
    scheduleRef.current = schedule

    const recompute = (cause) => {
      const snap = snapshotRef.current
      if (!snap || snap.removed || snap.blank) {
        hide()
        return
      }
      const sp = document.querySelector('[data-conversation-scroll]')
      if (!sp) {
        hide()
        return
      }
      const instructions = collectInstructions(snap)
      if (instructions.length === 0) {
        hide()
        return
      }
      const rects = new Map()
      for (const el of sp.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]')) {
        const key = el.dataset.chatFlowKey
        if (!key) continue
        const r = el.getBoundingClientRect()
        rects.set(key, { bottom: r.bottom })
      }
      const spRect = sp.getBoundingClientRect()
      const picked = pickInstruction(instructions, rects, spRect.top, EPSILON_PX)
      if (!picked || !picked.text) {
        hide()
        return
      }
      setText(picked.text)
      const vr = visibleRightOf(spRect)
      const avail = Math.max(0, vr - spRect.left)
      const w = Math.max(0, Math.min(avail - 32, 640))
      const tracking = vr !== spRect.right
      const next = {
        top: spRect.top + 8,
        left: spRect.left + (avail - w) / 2,
        width: w,
        ...(tracking ? { transition: 'none' } : {}),
      }
      const prev = frameRef.current
      if (!prev || prev.top !== next.top || prev.left !== next.left || prev.width !== next.width) {
        frameRef.current = next
        setFrame(next)
      }
    }

    const onWindowResize = () => schedule('window-resize')
    const onScrollportScroll = () => schedule('scroll')
    const onVisibilityChange = () => {
      if (!document.hidden) schedule('visibility')
    }
    window.addEventListener('resize', onWindowResize)
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Poll for scrollport presence/absence (view switches) and drift; all
    // other sources are rAF-throttled.
    const tick = () => {
      const found = document.querySelector('[data-conversation-scroll]')
      if (found !== scrollport) {
        if (scrollport) {
          scrollport.removeEventListener('scroll', onScrollportScroll)
          if (ro) { ro.disconnect(); ro = null }
        }
        scrollport = found
        if (scrollport) {
          scrollport.addEventListener('scroll', onScrollportScroll)
          ro = new ResizeObserver(() => schedule('ro'))
          ro.observe(scrollport)
        }
      }
      recompute('tick')
    }
    tick()
    timer = setInterval(tick, POLL_MS)

    // Position tracker: the layout reflows the scrollport only *after* the
    // side panel finishes sliding, so ResizeObserver fires ~500ms late. Poll
    // the scrollport rect every frame (one getBoundingClientRect()) AND the
    // panel's visible right edge (visibleRightOf), which glides during the
    // slide — this is what makes the bubble re-center in lockstep.
    const trackPosition = () => {
      if (disposed) return
      const sp = scrollport
      if (sp) {
        const r = sp.getBoundingClientRect()
        const vr = visibleRightOf(r)
        if (!lastRect || r.top !== lastRect.top || r.left !== lastRect.left || r.width !== lastRect.width || vr !== lastRect.vr) {
          lastRect = { top: r.top, left: r.left, width: r.width, vr }
          schedule('raf')
        }
      }
      posRaf = requestAnimationFrame(trackPosition)
    }
    posRaf = requestAnimationFrame(trackPosition)

    return () => {
      disposed = true
      scheduleRef.current = null
      frameRef.current = null
      window.removeEventListener('resize', onWindowResize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (scrollport) scrollport.removeEventListener('scroll', onScrollportScroll)
      if (timer) clearInterval(timer)
      if (raf !== 0) cancelAnimationFrame(raf)
      if (posRaf !== 0) cancelAnimationFrame(posRaf)
      if (ro) { ro.disconnect(); ro = null }
    }
  }, [sessionId])

  if (!text || !frame) return null
  return React.createElement(
    'div',
    { id: 'dsh-instruction-bubble', style: frame },
    text
  )
}

/** Register the bubble into the shell.overlay slot (root scope, additive). */
export function apply(ctx) {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-instruction-bubble', // list slot requires options.id (DSH >= 0.1.0-rc.6)
    priority: 10,
    registrant: 'dsh-instruction-bubble',
    inject: () => ({ sessions: ctx.sessions }),
  }, InstructionBubble))
}
