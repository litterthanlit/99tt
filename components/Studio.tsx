'use client'

import { useReducer, useRef, useState } from 'react'
import { createPainting, DocError, reduce, type Action } from '@/lib/doc/painting'
import type { Painting } from '@/lib/doc/types'
import type { Renderer } from '@/lib/renderer/renderer'
import PaintCanvas, { type BrushSettings } from './PaintCanvas'

const newId = () => crypto.randomUUID()

function safeReduce(p: Painting, a: Action): Painting {
  try {
    return reduce(p, a)
  } catch (e) {
    if (e instanceof DocError) {
      console.warn(e.message)
      return p
    }
    throw e
  }
}

export default function Studio() {
  const [painting, dispatch] = useReducer(safeReduce, null, () => createPainting(Date.now(), newId()))
  const [brush] = useState<BrushSettings>({ tool: 'paint', color: '#e2482d', size: 32, opacity: 1 })
  const [status, setStatus] = useState<string | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const active = painting.layers[painting.layers.length - 1]

  return (
    <main className="studio">
      <PaintCanvas
        painting={painting}
        activeLayer={active}
        brush={brush}
        rendererRef={rendererRef}
        onPlace={(layerId, place) => dispatch({ type: 'patchLayer', layerId, patch: { place } })}
        onStatus={setStatus}
      />
      {status && <div className="status">{status}</div>}
    </main>
  )
}
