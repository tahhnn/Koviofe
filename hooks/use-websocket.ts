'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface WebSocketMessage {
  type: string
  [key: string]: any
}

function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8082/api`
  }
  return 'http://localhost:8082/api'
}

function getCentrifugoWsUrl(): string {
  if (process.env.NEXT_PUBLIC_CENTRIFUGO_URL) {
    const raw = process.env.NEXT_PUBLIC_CENTRIFUGO_URL.replace(/\/$/, '')
    
    // Support relative paths (e.g. "/centrifugo" or "/centrifugo/connection/websocket")
    if (raw.startsWith('/')) {
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const path = raw.includes('/connection/websocket') ? raw : `${raw}/connection/websocket`
        return `${protocol}//${window.location.host}${path}`
      }
      return `ws://localhost${raw.includes('/connection/websocket') ? raw : `${raw}/connection/websocket`}`
    }

    if (raw.startsWith('ws:') || raw.startsWith('wss:')) {
      return raw.includes('/connection/websocket') ? raw : `${raw}/connection/websocket`
    }
    const wsProto = raw.startsWith('https') ? 'wss:' : 'ws:'
    const withoutProto = raw.replace(/^https?:/, '')
    return `${wsProto}${withoutProto}/connection/websocket`
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (window.location.port === '3000') {
      return `${protocol}//${window.location.hostname}:8000/connection/websocket`
    }
    return `${protocol}//${window.location.host}/centrifugo/connection/websocket`
  }
  return 'ws://localhost:8000/connection/websocket'
}

/** Read channel from Centrifugo connection JWT without verifying signature. */
function channelFromJwt(token: string): string {
  try {
    const part = token.split('.')[1]
    if (!part) return ''
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json)
    const channels = payload.channels
    if (Array.isArray(channels) && typeof channels[0] === 'string') {
      return channels[0]
    }
  } catch {
    // ignore malformed tokens
  }
  return ''
}

/** Delay before reconnect attempt `n` (0-based): base, doubled per failure,
 *  capped at 30s. A fixed 2.5s retry meant a phone whose session had ended
 *  asked for a token every 2.5s for as long as the tab stayed open. */
function backoff(base: number, n: number): number {
  return Math.min(30_000, base * 2 ** Math.min(n, 4))
}

export interface UseWebSocketOptions {
  /** Players mint their token from the player endpoint directly. Without
   *  this every player first asked the host endpoint and got a guaranteed
   *  401 (58 of them across the two B.FEST nights). */
  role?: 'host' | 'player'
  /** False tears the connection down and stops all retries. */
  enabled?: boolean
}

export function useWebSocket(roomId: string, pinCode?: string, options: UseWebSocketOptions = {}) {
  const { role = 'host', enabled = true } = options
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  /** The server refused this player's token for good (row gone, room over). */
  const [sessionEnded, setSessionEnded] = useState(false)
  const [data, setData] = useState<Record<string, any>>({})
  const messageHandlers = useRef<Map<string, (data: any) => void>>(new Map())
  const pinRef = useRef(pinCode)

  useEffect(() => {
    pinRef.current = pinCode
  }, [pinCode])

  useEffect(() => {
    if (!roomId || !enabled) return

    let active = true
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let failures = 0
    const retry = (base: number) => {
      if (!active) return
      reconnectTimeout = setTimeout(startConnection, backoff(base, failures))
      failures += 1
    }

    const fetchPlayerToken = async (): Promise<{ token: string; channel: string } | 'ended' | 'finished' | null> => {
      const playerToken = sessionStorage.getItem(`player_token_${roomId}`)
      if (!playerToken) return null
      const res = await fetch(`${getApiBase()}/realtime/player-token`, {
        headers: { 'X-Player-Token': playerToken },
      })
      // 401/403: the player row is gone or the token is for another room.
      // 404: the room has finished — the page's poll takes the player to the
      // results. Neither recovers by asking again.
      if (res.status === 401 || res.status === 403) return 'ended'
      if (res.status === 404) return 'finished'
      if (!res.ok) return null
      const data = await res.json()
      return { token: String(data.token || ''), channel: String(data.channel || '') }
    }

    const startConnection = async () => {
      try {
        const apiBase = getApiBase()
        const socketUrl = getCentrifugoWsUrl()

        let resolvedPin =
          pinRef.current ||
          (typeof window !== 'undefined'
            ? sessionStorage.getItem(`pin_code_${roomId}`) || ''
            : '')
        let channelFromToken = ''

        let token = ''
        const cachedToken =
          typeof window !== 'undefined'
            ? sessionStorage.getItem(`centrifugo_token_${roomId}`)
            : null

        if (cachedToken) {
          token = cachedToken
          channelFromToken = channelFromJwt(cachedToken)
        } else if (role === 'player') {
          const minted = await fetchPlayerToken()
          if (minted === 'ended') {
            setSessionEnded(true)
            return
          }
          if (minted === 'finished') return
          if (minted && minted.token) {
            token = minted.token
            sessionStorage.setItem(`centrifugo_token_${roomId}`, token)
            if (minted.channel) {
              channelFromToken = minted.channel
              const parts = minted.channel.split(':')
              if (parts[0] === 'rooms' && parts[1]) {
                resolvedPin = parts[1]
                sessionStorage.setItem(`pin_code_${roomId}`, resolvedPin)
              }
            }
          }
        } else {
          const tokenRes = await fetch(
            `/api/realtime/centrifugo?room_id=${encodeURIComponent(roomId)}`,
            { credentials: 'include' }
          )
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json()
            token = tokenData.token
            if (tokenData.channel && typeof tokenData.channel === 'string') {
              channelFromToken = tokenData.channel
              const parts = tokenData.channel.split(':')
              if (parts[0] === 'rooms' && parts[1]) {
                resolvedPin = parts[1]
                sessionStorage.setItem(`pin_code_${roomId}`, resolvedPin)
              }
            }
            // Hosts: cache so refresh is faster (still scoped to room)
            if (token) {
              sessionStorage.setItem(`centrifugo_token_${roomId}`, token)
            }
          } else {
            const playerToken = sessionStorage.getItem(`player_token_${roomId}`)
            if (playerToken) {
              const playerRes = await fetch(`${apiBase}/realtime/player-token`, {
                headers: { 'X-Player-Token': playerToken },
              })
              if (playerRes.ok) {
                const playerData = await playerRes.json()
                token = playerData.token
                sessionStorage.setItem(`centrifugo_token_${roomId}`, token)
                if (playerData.channel) {
                  channelFromToken = String(playerData.channel)
                  const parts = channelFromToken.split(':')
                  if (parts[0] === 'rooms' && parts[1]) {
                    resolvedPin = parts[1]
                    sessionStorage.setItem(`pin_code_${roomId}`, resolvedPin)
                  }
                }
              }
            }
          }
        }

        if (!channelFromToken && token) {
          channelFromToken = channelFromJwt(token)
        }
        if (channelFromToken.startsWith('rooms:')) {
          resolvedPin = channelFromToken.slice('rooms:'.length)
        }

        const subscribeChannel =
          channelFromToken || (resolvedPin ? `rooms:${resolvedPin}` : '')

        if (!active || !token || !subscribeChannel) {
          console.warn('[WS] missing token or channel, retrying...', { token, subscribeChannel })
          retry(2500)
          return
        }

        if (ws.current) {
          try {
            ws.current.close()
          } catch {
            /* ignore */
          }
        }

        const socket = new WebSocket(socketUrl)
        ws.current = socket

        // A socket that has already been replaced must not touch state. During a
        // reconnect the old socket is closed *before* the new one is assigned, so
        // its close event fires afterwards — and used to flip `connected` back to
        // false on top of a healthy new connection.
        const isCurrent = () => active && ws.current === socket

        socket.onopen = () => {
          if (!isCurrent()) return
          socket.send(
            JSON.stringify({
              connect: { token },
              id: 1,
            })
          )
        }

        socket.onmessage = (event) => {
          if (!isCurrent()) return
          try {
            // Centrifugo's JSON protocol pings with an empty object and wants the
            // same back. Answer it — but never send one unprompted, see below.
            if (event.data === '{}' || !event.data) {
              socket.send('{}')
              return
            }

            const response = JSON.parse(event.data)

            if (Object.keys(response).length === 0) {
              socket.send('{}')
              return
            }

            if (response.id === 1 && response.error) {
              console.error('[WS] Connect failed', response.error)
              // Drop bad cached token so next retry mints a fresh one
              sessionStorage.removeItem(`centrifugo_token_${roomId}`)
              setConnected(false)
              socket.close()
              return
            }

            if (response.id === 1 && (response.result || response.connect)) {
              setConnected(true)
              failures = 0

              // The connection token's `channels` claim subscribes us server
              // side, so the connect reply already lists the channel under
              // `subs`. Ask explicitly only if it does not: the `rooms`
              // namespace sets allow_subscribe_for_client=false, so a redundant
              // subscribe can only come back as error 105 or 103 — 259 of them
              // in one afternoon of server logs.
              const connectResult = response.connect || response.result || {}
              const subs = connectResult.subs || {}
              if (!subs[subscribeChannel]) {
                socket.send(
                  JSON.stringify({
                    subscribe: { channel: subscribeChannel },
                    id: 2,
                  })
                )
              }

              // Deliberately no client-side keepalive timer. Centrifugo pings on
              // its own schedule and the handler above answers those. An
              // unsolicited empty frame is NOT a pong to Centrifugo v5 — it is a
              // command with no method, which it rejects as "bad request" and
              // then closes the connection. A 25s setInterval sending exactly
              // that used to disconnect every client 25s after it connected, for
              // the entire game, each time flashing a "reconnecting" banner.
            }

            if (response.id === 2 && response.error) {
              const code = response.error?.code
              if (code === 105) {
                // Already subscribed — treat as success (can happen after reconnect)
                console.warn('[WS] Already subscribed to channel, treating as success', subscribeChannel)
                setConnected(true)
                return
              }
              console.error('[WS] Subscription failed', {
                channel: subscribeChannel,
                error: response.error,
                code,
                tokenPrefix: token ? token.slice(0, 20) + '…' : 'missing',
              })
              if (code === 103) {
                // JWT channels claim may already auto-subscribe
                console.warn('[WS] subscribe permission denied (auto-sub may still work)', subscribeChannel)
              }
            }

            if (response.push && response.push.pub) {
              const payload = response.push.pub.data
              if (!payload || typeof payload !== 'object') return

              const centrifugoEvent = payload.event
              const eventData = payload.payload || payload.data || {}

              let legacyType = centrifugoEvent
              let translatedData = { ...eventData }

              if (centrifugoEvent === 'question:active') {
                legacyType = 'next_question'
                translatedData = {
                  questionIndex: eventData.index,
                  activeUntil: eventData.active_until,
                  activeAt: eventData.active_at,
                  sequence: eventData.sequence,
                }
              } else if (centrifugoEvent === 'question:ended') {
                legacyType = 'reveal_answer'
              } else if (centrifugoEvent === 'game:ended') {
                legacyType = 'end_game'
              } else if (centrifugoEvent === 'player:answered') {
                legacyType = 'answer_submitted'
              } else if (centrifugoEvent === 'player:joined') {
                legacyType = 'player:joined'
              } else if (centrifugoEvent === 'player:left') {
                legacyType = 'player:left'
              } else if (centrifugoEvent === 'game:started') {
                legacyType = 'game:started'
              }

              const handler = messageHandlers.current.get(legacyType)
              if (handler) {
                handler(translatedData)
              }
              setData((prev) => ({ ...prev, [legacyType]: translatedData }))
            }
          } catch (err) {
            console.error('Failed to parse Centrifugo WebSocket payload:', err)
          }
        }

        socket.onerror = () => {
          if (!isCurrent()) return
          setConnected(false)
        }

        socket.onclose = () => {
          // Superseded socket finishing its teardown — its close says nothing
          // about the connection we are actually using now.
          if (ws.current !== socket) return
          ws.current = null
          setConnected(false)
          retry(3000)
        }
      } catch (err) {
        console.error('Centrifugo setup failed, retrying...', err)
        retry(5000)
      }
    }

    startConnection()

    return () => {
      active = false
      clearTimeout(reconnectTimeout)
      if (ws.current) {
        ws.current.close()
      }
    }
  }, [roomId, pinCode, role, enabled])

  const send = useCallback((_message: WebSocketMessage) => {
    // REST drives game state; Centrifugo is receive-only for clients
  }, [])

  const on = useCallback((type: string, handler: (data: any) => void) => {
    messageHandlers.current.set(type, handler)
    return () => {
      messageHandlers.current.delete(type)
    }
  }, [])

  return {
    connected,
    sessionEnded,
    send,
    on,
    data,
  }
}
