import { describe, expect, it, vi } from 'vitest'
import {
  buildAggregateChannels,
  buildAuthMessage,
  buildSubscribeMessage,
  createMassiveMarketSocket,
} from './massiveWebSocket'

class MockWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.sent = []
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.()
    })
    this.readyState = MockWebSocket.CONNECTING
    MockWebSocket.instances.push(this)
  }

  send(message) {
    this.sent.push(message)
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  receive(data) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}
MockWebSocket.CONNECTING = 0
MockWebSocket.OPEN = 1
MockWebSocket.CLOSED = 3

describe('Massive WebSocket message builders', () => {
  it('builds auth and subscribe payloads for aggregate channels', () => {
    expect(buildAggregateChannels(['SPY', 'QQQ', 'DIA'])).toEqual([
      'AM.SPY',
      'AM.QQQ',
      'AM.DIA',
    ])
    expect(JSON.parse(buildAuthMessage('demo-key'))).toEqual({
      action: 'auth',
      params: 'demo-key',
    })
    expect(JSON.parse(buildSubscribeMessage(['SPY', 'QQQ']))).toEqual({
      action: 'subscribe',
      params: 'AM.SPY,AM.QQQ',
    })
  })
})

describe('createMassiveMarketSocket', () => {
  it('authenticates, subscribes, routes aggregate messages and cleans up', () => {
    const onUpdate = vi.fn()
    const onStatus = vi.fn()
    const client = createMassiveMarketSocket({
      apiKey: 'demo-key',
      WebSocketImpl: MockWebSocket,
      onUpdate,
      onStatus,
      maxReconnectAttempts: 0,
    })
    const socket = MockWebSocket.instances.at(-1)

    socket.open()
    socket.receive([{ ev: 'AM', sym: 'SPY', o: 100, c: 101, h: 102, l: 99, s: 1, e: 2 }])
    client.close()

    expect(socket.sent.map((item) => JSON.parse(item))).toEqual([
      { action: 'auth', params: 'demo-key' },
      { action: 'subscribe', params: 'AM.SPY,AM.QQQ,AM.DIA' },
    ])
    expect(onStatus).toHaveBeenCalledWith('connected')
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'SPY', price: 101 }))
    expect(socket.close).toHaveBeenCalled()
  })

  it('schedules a limited reconnect when the socket closes unexpectedly', () => {
    const setTimeoutFn = vi.fn((callback) => {
      callback()
      return 1
    })

    createMassiveMarketSocket({
      apiKey: 'demo-key',
      WebSocketImpl: MockWebSocket,
      setTimeoutFn,
      reconnectDelayMs: 50,
      maxReconnectAttempts: 1,
    })
    const firstSocket = MockWebSocket.instances.at(-1)

    firstSocket.onclose()

    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 50)
    expect(MockWebSocket.instances.length).toBeGreaterThan(1)
  })
})
