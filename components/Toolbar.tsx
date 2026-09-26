'use client'

import type { Dispatch } from 'react'
import type { Action } from '@/lib/doc/painting'
import type { Painting } from '@/lib/doc/types'
import type { BrushSettings, Tool } from './PaintCanvas'
import Slider from './Slider'

interface Props {
  brush: BrushSettings
  onBrush: (b: BrushSettings) => void
  painting: Painting
  dispatch: Dispatch<Action>
  onUndo: () => void
  onImport: (files: File[]) => void
  layersOpen: boolean
  onToggleLayers: () => void
}

const TOOLS: Tool[] = ['paint', 'erase', 'move']

export default function Toolbar({ brush, onBrush, painting, dispatch, onUndo, onImport, layersOpen, onToggleLayers }: Props) {
  return (
    <header className="toolbar">
      <div className="group">
        {TOOLS.map(t => (
          <button key={t} className={brush.tool === t ? 'on' : ''} onClick={() => onBrush({ ...brush, tool: t })}>{t}</button>
        ))}
      </div>
      <input type="color" aria-label="Brush color" value={brush.color} onChange={e => onBrush({ ...brush, color: e.target.value })} />
      <Slider label="Size" min={1} max={300} step={1} value={brush.size} onChange={size => onBrush({ ...brush, size })} />
      <Slider label="Opacity" min={0.05} max={1} step={0.05} value={brush.opacity} onChange={opacity => onBrush({ ...brush, opacity })} />
      <button onClick={onUndo}>Undo</button>
      <label className="button">
        Image
        <input type="file" accept="image/*" multiple hidden onChange={e => { onImport(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </label>
      <span className="spacer" />
      <Slider label="Grain" min={0} max={1} step={0.05} value={painting.grain} onChange={grain => dispatch({ type: 'setGrain', grain })} />
      <input type="color" aria-label="Background" title="Background" value={painting.background} onChange={e => dispatch({ type: 'setBackground', color: e.target.value })} />
      <button onClick={() => dispatch({ type: 'setPlayback', playing: !painting.playing, now: Date.now() })}>{painting.playing ? 'Pause' : 'Play'}</button>
      <button className={layersOpen ? 'on' : ''} onClick={onToggleLayers}>Layers</button>
    </header>
  )
}
