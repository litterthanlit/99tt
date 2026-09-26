export type Mode = 'idle' | 'tool' | 'gesture'

/**
 * Decide the interaction mode when a pointer goes down.
 * touchCount includes the new pointer. Once a pencil has been seen, lone
 * touches are treated as palms and ignored; two fingers still pinch/pan.
 */
export function modeOnDown(s: { mode: Mode; penSeen: boolean; touchCount: number }, pointerType: string): { mode: Mode; cancelStroke: boolean } {
  if (pointerType !== 'touch') return { mode: s.mode === 'idle' ? 'tool' : s.mode, cancelStroke: false }
  if (s.touchCount >= 2) {
    if (s.penSeen && s.mode === 'tool') return { mode: 'tool', cancelStroke: false }
    return { mode: 'gesture', cancelStroke: s.mode === 'tool' }
  }
  if (s.penSeen) return { mode: s.mode, cancelStroke: false }
  return { mode: s.mode === 'idle' ? 'tool' : s.mode, cancelStroke: false }
}
