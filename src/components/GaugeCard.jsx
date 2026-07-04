import { MetricExplanation } from './MetricExplanation'

const segmentConfigs = {
  vix: {
    max: 50,
    className: 'vix-segments',
    segments: [
      { label: '平静', max: 15, tone: 'green' },
      { label: '正常', max: 20, tone: 'lime' },
      { label: '警惕', max: 30, tone: 'yellow' },
      { label: '紧张', max: 40, tone: 'orange' },
      { label: '恐慌', max: 50, tone: 'red' },
    ],
  },
  sentiment: {
    max: 100,
    className: 'five-segments',
    segments: [
      { label: '极度恐惧', max: 20, tone: 'red' },
      { label: '恐惧', max: 40, tone: 'orange' },
      { label: '中性', max: 60, tone: 'yellow' },
      { label: '贪婪', max: 80, tone: 'green' },
      { label: '极度贪婪', max: 100, tone: 'dark-green' },
    ],
  },
  pulse: {
    max: 100,
    className: 'three-segments',
    segments: [
      { label: '偏弱', max: 30, tone: 'red' },
      { label: '中性', max: 60, tone: 'yellow' },
      { label: '偏强', max: 100, tone: 'green' },
    ],
  },
}

const variantConfig = {
  segments: segmentConfigs.vix,
  vixSegments: segmentConfigs.vix,
  sentimentSegments: segmentConfigs.sentiment,
  pulseSegments: segmentConfigs.pulse,
}

function SegmentGauge({ title, value, config, segmentLabelMap = {}, segmentAriaLabel }) {
  const segments = config.segments.map((segment) => ({
    ...segment,
    displayLabel: segmentLabelMap[segment.label] ?? segment.label,
  }))
  const markerPosition = Math.max(0, Math.min(100, (Number(value) / config.max) * 100))

  return (
    <div className={`segmented-gauge ${config.className}`} aria-label={segmentAriaLabel ?? `${title}分段`}>
      <div className="segment-track">
        {segments.map((segment) => (
          <span aria-hidden="true" className={`segment segment-${segment.tone}`} key={segment.label}>
            {segment.displayLabel}
          </span>
        ))}
        <span className="segment-marker" style={{ left: `${markerPosition}%` }} />
      </div>
      <div className="segment-labels">
        {segments.map((segment) => (
          <span key={segment.max}>
            <strong>{segment.displayLabel}</strong>
            <span>{segment.max}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function MiniSegmentBar({ value, label, scoreLabel = '分数' }) {
  const boundedValue = Math.max(0, Math.min(100, Number(value)))

  return (
    <span aria-label={`${label} ${scoreLabel} ${value}`} className="component-score-bar segmented-score-bar">
      <span className="component-score-marker" style={{ left: `${boundedValue}%` }} />
    </span>
  )
}

export function GaugeCard({
  title,
  value,
  max = 100,
  status,
  tone = 'neutral',
  suffix = '',
  explanation,
  explanationTrigger,
  variant = 'linear',
  segmentLabelMap,
  segmentAriaLabel,
}) {
  const percentage = Math.max(0, Math.min(100, (Number(value) / max) * 100))
  const segmentConfig = variantConfig[variant]

  return (
    <article className={`dashboard-card gauge-card tone-${tone}`} aria-label={title}>
      <div className="card-heading">
        <h2>{title}</h2>
        <span className="status-pill">{status}</span>
      </div>
      {segmentConfig ? (
        <SegmentGauge
          title={title}
          value={value}
          config={segmentConfig}
          segmentLabelMap={segmentLabelMap}
          segmentAriaLabel={segmentAriaLabel}
        />
      ) : (
        <div
          className="gauge-track"
          role="meter"
          aria-label={`${title} ${value}${suffix} ${status}`}
          aria-valuemin="0"
          aria-valuemax={max}
          aria-valuenow={Number(value)}
        >
          <span className="gauge-fill" style={{ width: `${percentage}%` }} />
        </div>
      )}
      <p className="gauge-value">
        {value}
        {suffix}
      </p>
      {explanation ? (
        <MetricExplanation title={title} triggerLabel={explanationTrigger}>
          {explanation}
        </MetricExplanation>
      ) : null}
    </article>
  )
}
