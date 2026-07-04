import { MetricExplanation } from './MetricExplanation'

export function MarketStyleCard({ title, styleLabel, description, explanationTrigger, explanation }) {
  return (
    <article className="dashboard-card market-style-card" aria-label={title}>
      <div className="card-heading">
        <h2>{title}</h2>
        <span className="status-pill positive">{styleLabel}</span>
      </div>
      <p className="muted">{description}</p>
      <MetricExplanation title={title} triggerLabel={explanationTrigger}>
        {explanation.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </MetricExplanation>
    </article>
  )
}
