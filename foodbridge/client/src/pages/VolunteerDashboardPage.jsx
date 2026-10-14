import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  QrCode,
  Truck,
  Users,
  X,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  RadioTower,
  Camera,
  Trophy,
  Award,
  Star,
  Globe,
  Printer,
  Eye,
  Download
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import NotificationDropdown from '../components/NotificationDropdown';
import DeliveryTrackingMap from '../components/DeliveryTrackingMap';
import FoodSafetyBadge from '../components/FoodSafetyBadge';
import { PhotoViewerModal, LeaderboardModal, CertificateModal } from '../components/VolunteerModals';

/* ─────────────────────── Delivery Status Config ─────────────────────── */
const STATUS_ALIASES = {
  assigned: 'volunteer_assigned',
  assignment_accepted: 'volunteer_accepted',
  arrived_recipient: 'arrived_destination',
  picked_up: 'food_collected',
  out_for_delivery: 'in_transit',
  confirmed: 'delivered',
};

export function normalizeStatus(st) {
  if (!st) return 'volunteer_assigned';
  return STATUS_ALIASES[st] || st;
}

const STAGES = [
  { key: 'donation_created',    label: 'Donation Created',        color: 'slate' },
  { key: 'accepted',            label: 'Accepted / Allocated',    color: 'sky'   },
  { key: 'allocated',           label: 'Allocated',               color: 'sky'   },
  { key: 'volunteer_assigned',  label: 'Volunteer Assigned',      color: 'blue'  },
  { key: 'assigned',            label: 'Volunteer Assigned',      color: 'blue'  },
  { key: 'volunteer_accepted',  label: 'Assignment Accepted',     color: 'violet'},
  { key: 'assignment_accepted', label: 'Assignment Accepted',     color: 'violet'},
  { key: 'arrived_pickup',      label: 'Arrived at Pickup',       color: 'amber' },
  { key: 'food_collected',      label: 'Food Collected',          color: 'orange'},
  { key: 'picked_up',           label: 'Food Collected',          color: 'orange'},
  { key: 'in_transit',          label: 'In Transit',              color: 'cyan'  },
  { key: 'out_for_delivery',    label: 'In Transit',              color: 'cyan'  },
  { key: 'arrived_destination', label: 'Arrived at Destination',  color: 'teal'  },
  { key: 'arrived_recipient',   label: 'Arrived at Destination',  color: 'teal'  },
  { key: 'delivered',           label: 'Delivered ✓',             color: 'emerald'},
  { key: 'confirmed',           label: 'Delivered ✓',             color: 'emerald'},
  { key: 'cancelled',           label: 'Cancelled',               color: 'rose'  },
  { key: 'failed',              label: 'Failed / Cancelled',      color: 'rose'  },
];

// Valid transitions a volunteer can make from each stage
const VALID_TRANSITIONS = {
  volunteer_assigned:  ['volunteer_accepted'],
  assigned:            ['volunteer_accepted'],
  volunteer_accepted:  ['arrived_pickup'],
  assignment_accepted: ['arrived_pickup'],
  arrived_pickup:      ['food_collected'],
  food_collected:      ['in_transit'],
  picked_up:           ['in_transit'],
  in_transit:          ['arrived_destination'],
  out_for_delivery:    ['arrived_destination'],
  arrived_destination: ['delivered', 'failed'],
  arrived_recipient:   ['delivered', 'failed'],
};

const TERMINAL = ['delivered', 'confirmed', 'failed', 'cancelled'];

function getStageMeta(key) {
  return STAGES.find(s => s.key === key) || { key, label: key.replace(/_/g, ' '), color: 'slate' };
}

function colorClass(color, type) {
  const map = {
    emerald: { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400', btn: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' },
    rose:    { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',           dot: 'bg-rose-400',    btn: 'bg-rose-500 hover:bg-rose-400 text-white' },
    amber:   { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',        dot: 'bg-amber-400',   btn: 'bg-amber-500 hover:bg-amber-400 text-slate-950' },
    sky:     { bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',              dot: 'bg-sky-400',     btn: 'bg-sky-500 hover:bg-sky-400 text-slate-950' },
    cyan:    { bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',           dot: 'bg-cyan-400',    btn: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950' },
    teal:    { bg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',           dot: 'bg-teal-400',    btn: 'bg-teal-500 hover:bg-teal-400 text-slate-950' },
    violet:  { bg: 'bg-violet-500/20 text-violet-300 border-violet-500/40',     dot: 'bg-violet-400',  btn: 'bg-violet-500 hover:bg-violet-400 text-white' },
    blue:    { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',           dot: 'bg-blue-400',    btn: 'bg-blue-500 hover:bg-blue-400 text-white' },
    orange:  { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40',     dot: 'bg-orange-400',  btn: 'bg-orange-500 hover:bg-orange-400 text-slate-950' },
    slate:   { bg: 'bg-slate-700/30 text-slate-300 border-slate-700',           dot: 'bg-slate-500',   btn: 'bg-slate-700 hover:bg-slate-600 text-white' },
  };
  return (map[color] || map.slate)[type];
}

/* ─────────────────────── Status Timeline (inline) ─────────────────────── */
function StatusTimeline({ history, currentStatus }) {
  if (!history?.length) {
    return (
      <p className="text-xs text-slate-500 py-2">No status history available.</p>
    );
  }
  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const meta = getStageMeta(entry.status);
        const isLast = idx === history.length - 1;
        return (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                entry.status === 'failed' ? 'bg-rose-400' :
                entry.status === 'delivered' ? 'bg-emerald-400' :
                isLast ? 'bg-emerald-400 ring-2 ring-emerald-400/40 animate-pulse' :
                'bg-slate-500'
              }`} />
              {!isLast && <div className="w-0.5 bg-slate-700 flex-1 my-1" />}
            </div>
            <div className="pb-4 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">{meta.label}</span>
                {isLast && !TERMINAL.includes(entry.status) && (
                  <span className="text-[10px] rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">CURRENT</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {new Date(entry.changed_at).toLocaleString()}
                {entry.changed_by_name && ` · by ${entry.changed_by_name}`}
              </p>
              {entry.notes && (
                <p className="text-[11px] text-slate-300 mt-0.5 italic">"{entry.notes}"</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────── GPS Location Sharing ─────────────────────── */
function useGPSTracking(deliveryId, isActive) {
  const watchRef = useRef(null);
  const [tracking, setTracking] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported by your browser.');
      return;
    }
    setGpsError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await api.post(`/api/deliveries/${deliveryId}/location`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        } catch (err) {
          console.error('Failed to send location:', err);
        }
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    setTracking(true);
  }, [deliveryId]);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    if (!isActive) stopTracking();
    return () => stopTracking();
  }, [isActive, stopTracking]);

  return { tracking, gpsError, startTracking, stopTracking };
}

/* ─────────────────────── Single Delivery Card ─────────────────────── */
function DeliveryCard({ delivery, onRefresh, onViewPhoto }) {
  const [timeline, setTimeline] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [qrModal, setQrModal] = useState(null); // 'pickup' | 'delivery' | null
  const [transitioning, setTransitioning] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [showFailInput, setShowFailInput] = useState(false);
  const [msg, setMsg] = useState(null);

  const currentStatus = normalizeStatus(delivery.delivery_status || delivery.status);
  const isActive = !TERMINAL.includes(currentStatus);
  const { tracking, gpsError, startTracking, stopTracking } = useGPSTracking(delivery.delivery_id, isActive);
  const meta = getStageMeta(currentStatus);
  const nextStages = VALID_TRANSITIONS[currentStatus] || [];

  const loadTimeline = async () => {
    try {
      const res = await api.get(`/api/deliveries/${delivery.delivery_id}`);
      setTimeline(res.data.timeline || res.data.delivery?.statusHistory || []);
    } catch {
      setTimeline([]);
    }
  };

  const handleToggleTimeline = async () => {
    if (!showTimeline && !timeline) await loadTimeline();
    setShowTimeline(v => !v);
  };

  const handleStatusUpdate = async (newStatus, notes = '') => {
    if (!window.confirm(`Update status to "${getStageMeta(newStatus).label}"?`)) return;
    setTransitioning(true);
    setMsg(null);
    try {
      const res = await api.patch(`/api/deliveries/${delivery.delivery_id}/status`, {
        status: newStatus,
        notes: notes || undefined
      });
      setMsg({ type: 'success', text: res.data.message || 'Status updated!' });
      setTimeline(null); // reset timeline
      setShowTimeline(false);
      setShowFailInput(false);
      await onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to update status.' });
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className={`rounded-2xl border bg-slate-950/70 p-5 shadow-lg transition ${
      isActive ? 'border-slate-700 hover:border-slate-600' : 'border-slate-800 opacity-80'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{delivery.food_type}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colorClass(meta.color, 'bg')}`}>
              {meta.label}
            </span>
            {tracking && (
              <span className="flex items-center gap-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 text-[10px] font-semibold">
                <RadioTower size={10} className="animate-pulse" /> GPS Live
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-emerald-400 font-semibold">
            {delivery.allocated_quantity} units · Run #{delivery.delivery_id}
          </p>
          <div className="mt-2">
            <FoodSafetyBadge donation={delivery} />
          </div>
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-xs flex items-center justify-between ${
          msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-200 border border-rose-500/30'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X size={12} /></button>
        </div>
      )}

      {/* Pickup & Dropoff */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 rounded-xl border border-slate-900 bg-slate-900/40 p-3 text-xs">
        <div>
          <p className="font-semibold text-slate-300 flex items-center gap-1">
            <MapPin size={12} className="text-amber-400" /> Pickup: {delivery.donor_name}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{delivery.pickup_address || 'Address on record'}</p>
          {delivery.donor_phone && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-300">
              <Phone size={10} className="text-emerald-400" /> {delivery.donor_phone}
            </p>
          )}
        </div>
        <div>
          <p className="font-semibold text-slate-300 flex items-center gap-1">
            <MapPin size={12} className="text-emerald-400" /> Dropoff: {delivery.recipient_name}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{delivery.delivery_address || 'Address on record'}</p>
          {delivery.recipient_phone && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-300">
              <Phone size={10} className="text-emerald-400" /> {delivery.recipient_phone}
            </p>
          )}
        </div>
      </div>

      {/* Next action buttons */}
      {isActive && nextStages.length > 0 && (
        <div className="mt-4 border-t border-slate-900 pt-3">
          <p className="mb-2 text-[11px] font-medium text-slate-400">Next Action:</p>
          <div className="flex flex-wrap gap-2">
            {nextStages.filter(s => s !== 'failed').map(s => {
              const sm = getStageMeta(s);
              // QR verification stages
              const isQrPickup = s === 'food_collected';
              const isQrDelivery = s === 'delivered';
              return (
                <button
                  key={s}
                  disabled={transitioning}
                  onClick={() => {
                    if (isQrPickup) setQrModal('pickup');
                    else if (isQrDelivery) setQrModal('delivery');
                    else handleStatusUpdate(s);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${colorClass(sm.color, 'btn')}`}
                >
                  {isQrPickup || isQrDelivery ? <QrCode size={13} /> : <ChevronRight size={13} />}
                  {sm.label}
                  {(isQrPickup || isQrDelivery) && ' (QR)'}
                  {transitioning && <Loader2 size={12} className="animate-spin" />}
                </button>
              );
            })}
            {/* Fail/cancel */}
            {nextStages.includes('failed') && (
              <button
                disabled={transitioning}
                onClick={() => setShowFailInput(v => !v)}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
              >
                <AlertTriangle size={13} /> Mark Failed
              </button>
            )}
          </div>
          {showFailInput && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={failReason}
                onChange={e => setFailReason(e.target.value)}
                placeholder="Reason for failure / cancellation..."
                className="flex-1 rounded-xl border border-rose-500/40 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
              />
              <button
                disabled={!failReason.trim() || transitioning}
                onClick={() => handleStatusUpdate('failed', failReason)}
                className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      )}

      {/* GPS Tracking toggle */}
      {isActive && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!tracking ? (
            <button
              onClick={startTracking}
              className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/10 transition"
            >
              <Navigation size={12} /> Share Live Location
            </button>
          ) : (
            <button
              onClick={stopTracking}
              className="flex items-center gap-1.5 rounded-xl border border-blue-400 bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-500/30 transition"
            >
              <RadioTower size={12} className="animate-pulse" /> Stop Sharing GPS
            </button>
          )}
          {gpsError && <span className="text-[11px] text-rose-400">{gpsError}</span>}
        </div>
      )}

      {/* Tools row */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-900 pt-3">
        <button
          onClick={handleToggleTimeline}
          className="flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 transition"
        >
          <Clock size={11} /> {showTimeline ? 'Hide' : 'View'} Timeline
        </button>
        <button
          onClick={() => setShowMap(v => !v)}
          className="flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 transition"
        >
          <MapPin size={11} /> {showMap ? 'Hide' : 'View'} Map
        </button>
        {(currentStatus === 'volunteer_assigned' || currentStatus === 'assigned') && (
          <>
            <button
              disabled={transitioning}
              onClick={() => handleStatusUpdate('volunteer_accepted')}
              className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              <CheckCircle2 size={11} /> Accept Assignment
            </button>
            <button
              disabled={transitioning}
              onClick={async () => {
                try {
                  await api.post(`/api/deliveries/${delivery.delivery_id}/respond`, { action: 'reject' });
                  await onRefresh();
                } catch (err) {
                  setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to reject.' });
                }
              }}
              className="flex items-center gap-1 rounded-xl border border-rose-500/40 px-3 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/10 transition"
            >
              <X size={11} /> Reject
            </button>
          </>
        )}
      </div>

      {/* Handover photo proof badges */}
      {(delivery.pickup_photo || delivery.delivery_photo) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-slate-900 pt-2.5">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            <Camera size={12} className="text-emerald-400" /> Photo Proof:
          </span>
          {delivery.pickup_photo && (
            <button
              onClick={() => onViewPhoto && onViewPhoto({ title: 'Pickup Handover Proof', url: delivery.pickup_photo })}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition"
            >
              <Eye size={11} /> Pickup Photo
            </button>
          )}
          {delivery.delivery_photo && (
            <button
              onClick={() => onViewPhoto && onViewPhoto({ title: 'Delivery Handover Proof', url: delivery.delivery_photo })}
              className="inline-flex items-center gap-1 rounded-lg border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] text-teal-300 hover:bg-teal-500/20 transition"
            >
              <Eye size={11} /> Delivery Photo
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      {showTimeline && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-1.5">
            <Activity size={13} className="text-emerald-400" /> Delivery Status Timeline
          </h4>
          {timeline === null ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : (
            <StatusTimeline history={timeline} currentStatus={delivery.delivery_status} />
          )}
        </div>
      )}

      {/* Live Map */}
      {showMap && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/50 p-2">
          <DeliveryTrackingMap delivery={delivery} />
        </div>
      )}

      {/* QR Modal */}
      {qrModal && (
        <QRModal
          deliveryId={delivery.delivery_id}
          mode={qrModal}
          onSuccess={async () => {
            setQrModal(null);
            await onRefresh();
          }}
          onClose={() => setQrModal(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────── Inline QR Modal ─────────────────────── */
function QRModal({ deliveryId, mode, onSuccess, onClose }) {
  const [qrData, setQrData] = useState(null);
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get(`/api/deliveries/${deliveryId}/qr/${mode}`)
      .then(res => setQrData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Could not load QR code.'));
  }, [deliveryId, mode]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhoto(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/api/deliveries/${deliveryId}/verify-${mode}`, {
        manualCode: code,
        photo: photo || undefined
      });
      setSuccess(true);
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <QrCode size={18} className="text-emerald-400" />
            {mode === 'pickup' ? 'Pickup Verification' : 'Delivery Verification'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
            <p className="font-bold text-emerald-300">Verified Successfully!</p>
            {photo && <p className="text-xs text-slate-400 mt-1">Photo proof recorded ✓</p>}
          </div>
        ) : error && !qrData ? (
          <p className="py-6 text-center text-rose-300 text-sm">{error}</p>
        ) : !qrData ? (
          <div className="py-8 flex justify-center"><Loader2 size={32} className="animate-spin text-emerald-400" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-slate-400">
              Ask the {mode === 'pickup' ? 'donor' : 'recipient'} to show their QR code or provide the 6-digit code.
            </p>

            {/* Manual code display */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
              <p className="text-[11px] text-slate-400 mb-1">6-Digit Verification Code</p>
              <p className="text-3xl font-mono font-extrabold tracking-[0.3em] text-emerald-300">
                {qrData.manualCode}
              </p>
              {qrData.expiresAt && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Expires: {new Date(qrData.expiresAt).toLocaleTimeString()}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Enter Code from Donor/Recipient:</label>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-center text-lg font-mono tracking-widest text-white outline-none focus:border-emerald-400"
              />
            </div>

            {/* Photo Proof Input */}
            <div>
              <label className="block text-xs text-slate-300 mb-1 flex items-center justify-between">
                <span>📸 {mode === 'pickup' ? 'Pickup Photo Proof' : 'Delivery Handover Photo'}:</span>
                {photo && <span className="text-[10px] text-emerald-400 font-semibold">Attached ✓</span>}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  id={`proof-photo-${mode}`}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <label
                  htmlFor={`proof-photo-${mode}`}
                  className="cursor-pointer flex-1 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-2 text-center text-xs text-slate-300 hover:border-emerald-500 hover:text-white transition flex items-center justify-center gap-1.5"
                >
                  <Camera size={14} className="text-emerald-400" />
                  {photo ? 'Change Photo' : 'Capture / Upload Photo'}
                </label>
                {photo && (
                  <img src={photo} alt="Preview" className="w-9 h-9 object-cover rounded-lg border border-emerald-500/50" />
                )}
              </div>
            </div>

            {error && <p className="text-xs text-rose-300">{error}</p>}

            <button
              onClick={handleVerify}
              disabled={code.length !== 6 || submitting}
              className="w-full rounded-xl bg-emerald-500 py-2.5 font-bold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Verify {mode === 'pickup' ? 'Pickup' : 'Delivery'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Main Dashboard ─────────────────────── */
export default function VolunteerDashboardPage() {
  const { user, logout } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [photoModal, setPhotoModal] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/deliveries/assigned');
      setDeliveries(res.data.deliveries || []);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Unable to load delivery assignments.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeDeliveries = deliveries.filter(d => !TERMINAL.includes(normalizeStatus(d.delivery_status || d.status)));
  const completedDeliveries = deliveries.filter(d => TERMINAL.includes(normalizeStatus(d.delivery_status || d.status)));
  const pendingAcceptance = deliveries.filter(d => normalizeStatus(d.delivery_status || d.status) === 'volunteer_assigned');

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
              <Truck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">{user?.name}</h1>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Delivery Volunteer
                </span>
              </div>
              <p className="text-xs text-slate-400">Real-Time Rescue Tracker & Delivery Coordination</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-emerald-500 transition"
            >
              <RefreshCw size={13} /> Refresh
            </button>
            <NotificationDropdown />
            <button
              onClick={() => setShowLeaderboard(true)}
              title="Leaderboard"
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 transition"
            >
              <Trophy size={13} /> Leaderboard
            </button>
            <button
              onClick={() => setShowCertificate(true)}
              title="Certificate"
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 transition"
            >
              <Award size={13} /> Certificate
            </button>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-300"
            >
              Log out
            </button>
          </div>
        </header>

        {/* Alert message */}
        {message.text && (
          <div className={`mb-6 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage({ type: '', text: '' })}><X size={16} /></button>
          </div>
        )}

        {/* Pending acceptance banner */}
        {pendingAcceptance.length > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            <span>
              <strong>{pendingAcceptance.length} new assignment{pendingAcceptance.length > 1 ? 's' : ''}</strong> waiting for your acceptance.
              Scroll down to accept or reject.
            </span>
          </div>
        )}

        {/* Metrics */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className="card-surface rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Active Runs</span>
              <PackageCheck size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">{activeDeliveries.length}</p>
            <p className="mt-1 text-xs text-slate-400">In pickup / delivery transit</p>
          </div>
          <div className="card-surface rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Completed</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">{completedDeliveries.length}</p>
            <p className="mt-1 text-xs text-slate-400">Successfully delivered</p>
          </div>
          <div className="card-surface rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Total Assigned</span>
              <Users size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">{deliveries.length}</p>
            <p className="mt-1 text-xs text-slate-400">All assigned deliveries</p>
          </div>
        </div>

        {/* Deliveries list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Truck size={18} className="text-emerald-400" />
              My Delivery Queue
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin text-emerald-400" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="card-surface rounded-3xl p-12 text-center shadow-xl">
              <Truck size={40} className="text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">No delivery assignments yet.</p>
              <p className="text-slate-500 text-xs mt-1">Check back when the admin assigns a delivery to you.</p>
            </div>
          ) : (
            <>
              {/* Active first */}
              {activeDeliveries.map(del => (
                <DeliveryCard key={del.delivery_id} delivery={del} onRefresh={loadData} onViewPhoto={(photo) => setPhotoModal(photo)} />
              ))}
              {/* Completed */}
              {completedDeliveries.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-xs text-slate-400 font-semibold py-2 hover:text-slate-200 transition list-none flex items-center gap-1">
                    <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
                    {completedDeliveries.length} completed / failed deliveries
                  </summary>
                  <div className="mt-3 space-y-3">
                    {completedDeliveries.map(del => (
                      <DeliveryCard key={del.delivery_id} delivery={del} onRefresh={loadData} onViewPhoto={(photo) => setPhotoModal(photo)} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        {/* ── Modals ── */}
        <LeaderboardModal
          isOpen={showLeaderboard}
          onClose={() => setShowLeaderboard(false)}
        />
        <CertificateModal
          isOpen={showCertificate}
          onClose={() => setShowCertificate(false)}
          volunteerName={user?.name}
          mealsRescued={completedDeliveries.reduce((sum, d) => sum + (d.allocated_quantity || 0), 0)}
          deliveriesCount={completedDeliveries.length}
          karmaPoints={deliveries.reduce((sum, d) => sum + (d.karma_points || 0), 0)}
        />
        {photoModal && (
          <PhotoViewerModal
            photo={photoModal}
            onClose={() => setPhotoModal(null)}
          />
        )}
      </div>
    </div>
  );
}
