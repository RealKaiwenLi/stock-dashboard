const ranges = ['1M', '6M', '1Y']

export function RangeControl({ copy, value, onChange }) {
  return (
    <div className="segmented-control" aria-label={copy.rangeLabel}>
      {ranges.map((range) => (
        <button type="button" key={range} aria-pressed={value === range} onClick={() => onChange(range)}>
          {range}
        </button>
      ))}
    </div>
  )
}
