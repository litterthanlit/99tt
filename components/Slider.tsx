interface Props {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

export default function Slider({ label, min, max, step, value, onChange }: Props) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}
