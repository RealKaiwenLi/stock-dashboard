import { normalizeMassiveAggregateMessage } from './massiveMessageAdapter'

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'DIA']
const DEFAULT_ENDPOINT = 'wss://socket.massive.com/stocks'

export function buildAggregateChannels(symbols = DEFAULT_SYMBOLS) {
  return symbols.map((symbol) => `AM.${symbol}`)
}

export function buildAuthMessage(apiKey) {
  return JSON.stringify({ action: 'auth', params: apiKey })
}

export function buildSubscribeMessage(symbols = DEFAULT_SYMBOLS) {
  return JSON.stringify({
    action: 'subscribe',
    params: buildAggregateChannels(symbols).join(','),
  })
}

export function createMassiveMarketSocket({
  apiKey,
  symbols = DEFAULT_SYMBOLS,
  endpoint = DEFAULT_ENDPOINT,
  WebSocketImpl = globalThis.WebSocket,
  onUpdate = () => {},
  onStatus = () => {},
  reconnectDelayMs = 2_000,
  maxReconnectAttempts = 3,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  let socket
  let reconnectTimer
  let reconnectAttempts = 0
  let manuallyClosed = false

  function connect() {
    if (!WebSocketImpl || !apiKey) {
      onStatus(apiKey ? 'unavailable' : 'missing-api-key')
      return
    }

    onStatus('connecting')
    socket = new WebSocketImpl(endpoint)

    socket.onopen = () => {
      reconnectAttempts = 0
      socket.send(buildAuthMessage(apiKey))
      socket.send(buildSubscribeMessage(symbols))
      onStatus('connected')
    }

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      const messages = Array.isArray(payload) ? payload : [payload]

      messages
        .map((message) => normalizeMassiveAggregateMessage(message))
        .filter(Boolean)
        .forEach((update) => onUpdate(update))
    }

    socket.onerror = () => {
      onStatus('error')
    }

    socket.onclose = () => {
      onStatus('disconnected')
      if (manuallyClosed || reconnectAttempts >= maxReconnectAttempts) {
        return
      }

      reconnectAttempts += 1
      reconnectTimer = setTimeoutFn(connect, reconnectDelayMs)
    }
  }

  connect()

  return {
    close() {
      manuallyClosed = true
      if (reconnectTimer) {
        clearTimeoutFn(reconnectTimer)
      }
      socket?.close()
    },
  }
}
