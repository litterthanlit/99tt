'use client'

import type { Dispatch } from 'react'
import type { Action, LayerPatch } from '@/lib/doc/painting'
import { BLEND_IN_PRESET, NO_HARMONIZE, makeFlow, makeHarmonize, makeTransform } from '@/lib/doc/recipes'
import { BLEND_MODES, FLOW_RECIPES, TRANSFORM_RECIPES, type BlendMode, type Layer, type Painting } from '@/lib/doc/types'
import Slider from './Slider'

interface Props {
  painting: Painting
  activeId: string
  onActivate: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  dispatch: Dispatch<Action>
}

export default function LayerPanel({ painting, activeId, onActivate, onAdd, onRemove, dispatch }: Props) {
  const patch = (layerId: string, p: LayerPatch) => dispatch({ type: 'patchLayer', layerId, patch: p })
  const active = painting.layers.find(l => l.id === activeId)
  const last = painting.layers.length - 1

  return (
    <aside className="layers">
      <div className="layers-head">
        <strong>Layers</strong>
        <button onClick={onAdd}>+ Layer</button>
      </div>
      <ol>
        {[...painting.layers].reverse().map(layer => {
          const index = painting.layers.indexOf(layer)
          return (
            <li key={layer.id} className={layer.id === activeId ? 'active' : ''}>
              <button className="icon" aria-label="Toggle visibility" onClick={() => patch(layer.id, { visible: !layer.visible })}>{layer.visible ? '●' : '○'}</button>
              <button
                className="name"
                onClick={() => onActivate(layer.id)}
                onDoubleClick={() => {
                  const name = prompt('Layer name', layer.name)
                  if (name) patch(layer.id, { name })
                }}
              >
                {layer.name}
                {layer.flow.recipe !== 'none' ? ` · ${layer.flow.recipe}` : ''}
              </button>
              <button className={`icon ${painting.focusedLayerId === layer.id ? 'on' : ''}`} title="Focus for the agent" onClick={() => dispatch({ type: 'focus', layerId: layer.id })}>◎</button>
              <button className="icon" aria-label="Move up" disabled={index === last} onClick={() => dispatch({ type: 'moveLayer', layerId: layer.id, toIndex: index + 1 })}>↑</button>
              <button className="icon" aria-label="Move down" disabled={index === 0} onClick={() => dispatch({ type: 'moveLayer', layerId: layer.id, toIndex: index - 1 })}>↓</button>
            </li>
          )
        })}
      </ol>
      {active && <Inspector layer={active} canRemove={painting.layers.length > 1} onRemove={() => onRemove(active.id)} patch={p => patch(active.id, p)} />}
    </aside>
  )
}

function Inspector({ layer, canRemove, onRemove, patch }: { layer: Layer; canRemove: boolean; onRemove: () => void; patch: (p: LayerPatch) => void }) {
  const f = layer.flow
  const t = layer.transform
  const h = layer.harmonize
  return (
    <section className="inspector">
      <h3>Layer</h3>
      <Slider label="Opacity" min={0} max={1} step={0.01} value={layer.opacity} onChange={opacity => patch({ opacity })} />
      <label className="field">
        <span>Blend</span>
        <select value={layer.blend} onChange={e => patch({ blend: e.target.value as BlendMode })}>
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <Slider label="Scale" min={0.1} max={3} step={0.01} value={layer.place.scale} onChange={scale => patch({ place: { ...layer.place, scale } })} />
      <div className="row"><button onClick={() => patch({ place: { x: 0, y: 0, scale: 1 } })}>Reset place</button></div>

      <h3>Flow</h3>
      <select value={f.recipe} onChange={e => patch({ flow: makeFlow(e.target.value, { speed: f.speed, intensity: f.intensity, originX: f.originX, originY: f.originY }) })}>
        {FLOW_RECIPES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {f.recipe !== 'none' && (
        <>
          <Slider label="Speed" min={0} max={4} step={0.05} value={f.speed} onChange={speed => patch({ flow: makeFlow(f.recipe, { ...f, speed }) })} />
          <Slider label="Intensity" min={0} max={1} step={0.01} value={f.intensity} onChange={intensity => patch({ flow: makeFlow(f.recipe, { ...f, intensity }) })} />
          <Slider label="Direction" min={0} max={359} step={1} value={f.direction} onChange={direction => patch({ flow: makeFlow(f.recipe, { ...f, direction }) })} />
          {f.recipe === 'rush' && (
            <>
              <Slider label="Origin X" min={0} max={1} step={0.01} value={f.originX} onChange={originX => patch({ flow: makeFlow(f.recipe, { ...f, originX }) })} />
              <Slider label="Origin Y" min={0} max={1} step={0.01} value={f.originY} onChange={originY => patch({ flow: makeFlow(f.recipe, { ...f, originY }) })} />
            </>
          )}
        </>
      )}

      <h3>Transform</h3>
      <select value={t.recipe} onChange={e => patch({ transform: makeTransform(e.target.value, { speed: t.speed, intensity: t.intensity, direction: t.direction }) })}>
        {TRANSFORM_RECIPES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {t.recipe !== 'none' && (
        <>
          <Slider label="Speed" min={0} max={4} step={0.05} value={t.speed} onChange={speed => patch({ transform: makeTransform(t.recipe, { ...t, speed }) })} />
          <Slider label="Intensity" min={0} max={1} step={0.01} value={t.intensity} onChange={intensity => patch({ transform: makeTransform(t.recipe, { ...t, intensity }) })} />
          {t.recipe === 'drift' && (
            <Slider label="Direction" min={0} max={359} step={1} value={t.direction} onChange={direction => patch({ transform: makeTransform(t.recipe, { ...t, direction }) })} />
          )}
        </>
      )}

      <h3>Blend in</h3>
      <div className="row">
        <button onClick={() => patch({ harmonize: BLEND_IN_PRESET })}>Blend in</button>
        <button onClick={() => patch({ harmonize: NO_HARMONIZE })}>Reset</button>
      </div>
      <Slider label="Feather" min={0} max={64} step={1} value={h.feather} onChange={feather => patch({ harmonize: makeHarmonize({ ...h, feather }) })} />
      <Slider label="Color" min={0} max={1} step={0.01} value={h.colorMatch} onChange={colorMatch => patch({ harmonize: makeHarmonize({ ...h, colorMatch }) })} />
      <Slider label="Bleed" min={0} max={1} step={0.01} value={h.bleed} onChange={bleed => patch({ harmonize: makeHarmonize({ ...h, bleed }) })} />

      <div className="row"><button className="danger" disabled={!canRemove} onClick={onRemove}>Delete layer</button></div>
    </section>
  )
}
