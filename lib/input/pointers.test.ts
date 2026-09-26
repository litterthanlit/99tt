import { describe, expect, it } from 'vitest'
import { modeOnDown } from './pointers'

describe('modeOnDown', () => {
  it('pen and mouse start the tool', () => {
    expect(modeOnDown({ mode: 'idle', penSeen: true, touchCount: 0 }, 'pen')).toEqual({ mode: 'tool', cancelStroke: false })
    expect(modeOnDown({ mode: 'idle', penSeen: false, touchCount: 0 }, 'mouse')).toEqual({ mode: 'tool', cancelStroke: false })
  })
  it('a finger paints until a pencil has been seen', () => {
    expect(modeOnDown({ mode: 'idle', penSeen: false, touchCount: 1 }, 'touch').mode).toBe('tool')
    expect(modeOnDown({ mode: 'idle', penSeen: true, touchCount: 1 }, 'touch').mode).toBe('idle')
  })
  it('second finger turns a finger stroke into a gesture and cancels it', () => {
    expect(modeOnDown({ mode: 'tool', penSeen: false, touchCount: 2 }, 'touch')).toEqual({ mode: 'gesture', cancelStroke: true })
  })
  it('palm touches never interrupt a pencil stroke', () => {
    expect(modeOnDown({ mode: 'tool', penSeen: true, touchCount: 2 }, 'touch')).toEqual({ mode: 'tool', cancelStroke: false })
  })
  it('two fingers with no stroke is a gesture', () => {
    expect(modeOnDown({ mode: 'idle', penSeen: true, touchCount: 2 }, 'touch').mode).toBe('gesture')
  })
  it('pen during a gesture does not start painting', () => {
    expect(modeOnDown({ mode: 'gesture', penSeen: true, touchCount: 2 }, 'pen').mode).toBe('gesture')
  })
})
