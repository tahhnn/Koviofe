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

export function useWebSocket(roomId: string, pinCode?: string) {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState<Record<string, any>>({})
  const messageHandlers = useRef<Map<string, (data: any) => void>>(new Map())
  const pinRef = useRef(pinCode)

  useEffect(() => {
    pinRef.current = pinCode
  }, [pinCode])

  useEffect(() => {
    if (!roomId) return

    let active = true
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let pingInterval: ReturnType<typeof setInterval>

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

        console.log('[WS] setup', {
          roomId,
          resolvedPin,
          channelFromToken,
          subscribeChannel,
          tokenPrefix: token ? token.slice(0, 20) + '…' : 'missing',
        })

        if (!active || !token || !subscribeChannel) {
          console.warn('[WS] missing token or channel, retrying...', { token, subscribeChannel })
          reconnectTimeout = setTimeout(startConnection, 2500)
          return
        }

        if (ws.current) {
          try {
            ws.current.close()
          } catch {
            /* ignore */
          }
        }

        ws.current = new WebSocket(socketUrl)

        ws.current.onopen = () => {
          if (!active) return
          ws.current?.send(
            JSON.stringify({
              connect: { token },
              id: 1,
            })
          )
        }

        ws.current.onmessage = (event) => {
          if (!active) return
          try {
            if (event.data === '{}' || !event.data) {
              ws.current?.send('{}')
              return
            }

            const response = JSON.parse(event.data)

            if (Object.keys(response).length === 0) {
              ws.current?.send('{}')
              return
            }

            if (response.id === 1 && response.error) {
              console.error('[WS] Connect failed', response.error)
              // Drop bad cached token so next retry mints a fresh one
              sessionStorage.removeItem(`centrifugo_token_${roomId}`)
              setConnected(false)
              ws.current?.close()
              return
            }

            if (response.id === 1 && (response.result || response.connect)) {
              setConnected(true)
              ws.current?.send(
                JSON.stringify({
                  subscribe: { channel: subscribeChannel },
                  id: 2,
                })
              )
              // Keepalive empty frames (Centrifugo JSON protocol)
              clearInterval(pingInterval)
              pingInterval = setInterval(() => {
                if (ws.current?.readyState === WebSocket.OPEN) {
                  ws.current.send('{}')
                }
              }, 25000)
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

        ws.current.onerror = () => {
          setConnected(false)
        }

        ws.current.onclose = () => {
          setConnected(false)
          clearInterval(pingInterval)
          if (active) {
            reconnectTimeout = setTimeout(startConnection, 3000)
          }
        }
      } catch (err) {
        console.error('Centrifugo setup failed, retrying...', err)
        if (active) {
          reconnectTimeout = setTimeout(startConnection, 5000)
        }
      }
    }

    startConnection()

    return () => {
      active = false
      clearTimeout(reconnectTimeout)
      clearInterval(pingInterval)
      if (ws.current) {
        ws.current.close()
      }
    }
  }, [roomId, pinCode])

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
    send,
    on,
    data,
  }
}
