import { io } from 'socket.io-client';
import { useEffect, useRef } from 'react';

// Module-level singleton — only one connection is ever created.
let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    const token = localStorage.getItem('foodbridge:token');
    const url = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    socketInstance = io(url, {
      auth: { token },
      // Reconnect automatically; let the server push auth errors if token is stale.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
  }

  return socketInstance;
}

/**
 * useSocket – returns the singleton Socket.IO instance.
 * Intentionally does NOT disconnect on unmount; the connection is shared
 * across the entire app lifetime.
 */
export default function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = getSocket();
    // No cleanup disconnect — singleton stays alive.
  }, []);

  return getSocket();
}

/**
 * Join a delivery-specific room so the client receives live updates for that
 * delivery.
 * @param {string|number} deliveryId
 */
export function joinDeliveryRoom(deliveryId) {
  const socket = getSocket();
  socket.emit('join:delivery', deliveryId);
}

/**
 * Leave a delivery-specific room.
 * @param {string|number} deliveryId
 */
export function leaveDeliveryRoom(deliveryId) {
  const socket = getSocket();
  socket.emit('leave:delivery', deliveryId);
}

/**
 * Cleanly disconnect the socket and clear the singleton reference.
 * Call this on logout so the next login creates a fresh, authenticated
 * connection.
 */
export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    console.log('Socket disconnected (logout cleanup).');
  }
}
