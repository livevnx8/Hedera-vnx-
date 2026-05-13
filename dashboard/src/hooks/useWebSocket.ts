import { useEffect, useRef, useState, useCallback } from 'react'

interface WSEvent {
  channel: string
  data: any
  timestamp: number
}

export function useWebSocket(url = 'ws://localhost:8000/ws/events') {
  const [events, setEvents] = useState<WSEvent[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 3000) // auto-reconnect
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as WSEvent
          setEvents((prev) => [...prev.slice(-99), event])
        } catch {}
      }
    } catch {}
  }, [url])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const subscribe = useCallback((channels: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', channels }))
    }
  }, [])

  return { events, connected, subscribe }
}
