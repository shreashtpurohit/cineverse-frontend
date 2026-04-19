'use client'
import { createContext, useContext, useEffect, useRef, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { getAccessToken } from '@/lib/api'
import { useAuth } from './AuthContext'

interface SocketContextType {
  socket: Socket | null
}

const SocketContext = createContext<SocketContextType>({ socket: null })

export function SocketProvider({
  children,
  onNotification,
}: {
  children: ReactNode
  onNotification?: (msg: string) => void
}) {
  const { user } = useAuth()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect()
      socketRef.current = null
      return
    }

    const token = getAccessToken()
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => console.log('[Socket] Connected'))
    socket.on('disconnect', () => console.log('[Socket] Disconnected'))
    socket.on('notification', (notif: any) => {
      if (onNotification) onNotification(notif.message)
    })

    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [user])

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
