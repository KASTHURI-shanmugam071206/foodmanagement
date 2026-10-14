import { useEffect, useState, useRef } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import api from '../services/api';

export default function NotificationDropdown() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/api/notifications/mine');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // Ignore background errors
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-full border border-slate-700 bg-slate-900/80 p-2.5 text-slate-300 transition hover:border-emerald-500 hover:text-white"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl z-50">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-300"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto space-y-2.5 pr-1">
            {notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.notification_id}
                  className={`rounded-xl border p-3 transition ${
                    n.is_read
                      ? 'border-slate-800/80 bg-slate-900/30 text-slate-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold ${n.is_read ? 'text-slate-300' : 'text-white'}`}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(n.notification_id)}
                        className="text-emerald-400 hover:text-emerald-200"
                        title="Mark read"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{n.message}</p>
                  <span className="mt-2 block text-[10px] text-slate-500">
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
