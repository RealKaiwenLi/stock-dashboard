import { GaugeCard, MiniSegmentBar } from './GaugeCard'

export function FearGreedCard({
  data,
  title,
  statusLabel,
  copy,
  explanation,
  explanationTrigger,
  segmentLabelMap,
  getComponentCopy,
}) {
  return (
    <section className={`dashboard-card fear-greed-card tone-${data.status.color}`} aria-label={title}>
      <div className="fear-greed-overview">
        <GaugeCard
          title={title}
          value={data.score}
          status={statusLabel}
          tone={data.status.color}
          variant="sentimentSegments"
          explanationTrigger={explanationTrigger}
          segmentLabelMap={segmentLabelMap}
          segmentAriaLabel={copy.labels.segmentedLabel(title)}
          explanation={explanation.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        />
      </div>
      <div className="component-breakdown">
        <div className="card-heading">
          <h2>{copy.labels.components}</h2>
          <span className="muted">
            {data.fromCache ? copy.labels.cachedAt(data.cacheUpdatedAt) : copy.labels.updatedAt(data.updatedAt)}
          </span>
        </div>
        <ul>
          {data.components.map((component) => {
            const componentCopy = getComponentCopy(component)

            return (
              <li key={component.name}>
                <div className="component-copy">
                  <strong>{componentCopy.label}</strong>
                  <span>{componentCopy.description}</span>
                </div>
                <div className="component-score">
                  <span>{component.value}</span>
                  <MiniSegmentBar value={component.value} label={componentCopy.label} scoreLabel={copy.labels.score} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
