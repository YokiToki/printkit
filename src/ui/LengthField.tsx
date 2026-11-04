import { NumberField, type NumberFieldProps } from './NumberField'
import { fromDisplay, toDisplay, useUnit } from './units'

/** Поле длины: значение хранится в мм, показывается и вводится в выбранной единице. */
export function LengthField({ value, onChange, min = -100000, max = 100000, step = 1, ...rest }: NumberFieldProps) {
  const { unit } = useUnit()
  const digits = unit === 'in' ? 3 : 2
  return (
    <NumberField
      {...rest}
      digits={digits}
      unit={unit === 'in' ? 'in' : 'mm'}
      value={toDisplay(value, unit)}
      min={toDisplay(min, unit)}
      max={toDisplay(max, unit)}
      step={unit === 'in' ? step / 25.4 : step}
      onChange={(v) => onChange(Number(fromDisplay(v, unit).toFixed(6)))}
    />
  )
}
