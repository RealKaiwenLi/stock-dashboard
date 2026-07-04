const indicators = [
  ['vwap', 'VWAP'],
  ['bollinger', 'Bollinger Bands'],
  ['macd', 'MACD'],
  ['kdj', 'KDJ'],
]

const movingAverages = [
  ['ma20', 'MA20'],
  ['ma50', 'MA50'],
  ['ma100', 'MA100'],
  ['ma200', 'MA200'],
]

export function IndicatorToggleGroup({ copy, enabledIndicators, onToggle }) {
  return (
    <div className="indicator-control-panel">
      <div className="indicator-toggles" aria-label={copy.indicatorLabel}>
        {indicators.map(([key, label]) => (
          <label key={key}>
            <input type="checkbox" checked={enabledIndicators[key]} onChange={() => onToggle(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <fieldset className="ma-toggles">
        <legend>{copy.maGroup}</legend>
        <div>
          {movingAverages.map(([key, label]) => (
            <label key={key}>
              <input type="checkbox" checked={enabledIndicators.movingAverages[key]} onChange={() => onToggle(['movingAverages', key])} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
