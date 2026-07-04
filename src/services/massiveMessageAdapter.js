export function normalizeMassiveAggregateMessage(message) {
  if (!message || message.ev !== 'AM' || !message.sym || typeof message.c !== 'number') {
    return null
  }

  const open = Number(message.o ?? message.c)
  const close = Number(message.c)
  const change = close - open
  const changePercent = open === 0 ? 0 : (change / open) * 100

  return {
    symbol: message.sym,
    open,
    close,
    price: close,
    high: message.h,
    low: message.l,
    change,
    changePercent,
    startTimestamp: message.s,
    endTimestamp: message.e,
    lastUpdated: message.e ? new Date(message.e).toISOString() : new Date().toISOString(),
  }
}
