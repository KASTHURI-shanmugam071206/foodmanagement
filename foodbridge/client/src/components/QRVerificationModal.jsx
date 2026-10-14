import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '../services/api';
import { X, QrCode, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * QRVerificationModal
 * Handles QR-based pickup and delivery verification.
 *
 * Props:
 *   deliveryId {string|number} - The delivery record ID
 *   mode       {'pickup'|'delivery'} - Which verification step
 *   onSuccess  {() => void} - Called after successful verification
 *   onClose    {() => void} - Called when the modal is dismissed
 */
export default function QRVerificationModal({ deliveryId, mode, onSuccess, onClose }) {
  // ── QR data from server ──────────────────────────────────────────────────
  const [qrToken, setQrToken]       = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [expiresAt, setExpiresAt]   = useState(null);

  // ── Countdown ────────────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState(null);
  const countdownRef = useRef(null);

  // ── Manual-code input ────────────────────────────────────────────────────
  const [enteredCode, setEnteredCode] = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [confirmed, setConfirmed]     = useState(false);
  const [fetchError, setFetchError]   = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const modeLabel = mode === 'pickup' ? 'Pickup' : 'Delivery';

  // ── Fetch QR token on mount ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchQR() {
      setLoading(true);
      setFetchError(null);
      try {
        const { data } = await api.get(`/api/deliveries/${deliveryId}/qr/${mode}`);
        if (cancelled) return;
        setQrToken(data.token);
        setManualCode(data.manualCode);
        setExpiresAt(new Date(data.expiresAt));
      } catch (err) {
        if (cancelled) return;
        setFetchError(
          err?.response?.data?.message ?? 'Failed to load QR code. Please try again.'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchQR();
    return () => { cancelled = true; };
  }, [deliveryId, mode]);

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!expiresAt) return;

    function tick() {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) clearInterval(countdownRef.current);
    }

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [expiresAt]);

  // ── Submit verification ───────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    const trimmed = enteredCode.trim();
    if (trimmed.length !== 6) {
      setSubmitError('Please enter the 6-digit code.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/deliveries/${deliveryId}/verify-${mode}`, {
        manualCode: trimmed,
      });
      setConfirmed(true);
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      setSubmitError(
        err?.response?.data?.message ?? 'Verification failed. Please check the code and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatCountdown(secs) {
    if (secs === null) return '--';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function formatExpiry(date) {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const expired = secondsLeft === 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div className="card-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl relative flex flex-col gap-5">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/15">
            <QrCode size={22} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {modeLabel} Verification
            </h2>
            <p className="text-xs text-slate-400">
              Scan the QR code or enter the backup code
            </p>
          </div>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Generating QR code…</p>
          </div>
        )}

        {/* ── Fetch error ── */}
        {!loading && fetchError && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
            <AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" />
            <p className="text-sm text-rose-300">{fetchError}</p>
          </div>
        )}

        {/* ── Success confirmation ── */}
        {confirmed && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 size={48} className="text-emerald-400" />
            <p className="text-base font-semibold text-emerald-300">
              {modeLabel} Confirmed!
            </p>
            <p className="text-xs text-slate-400">Closing…</p>
          </div>
        )}

        {/* ── Main content (QR + form) ── */}
        {!loading && !fetchError && !confirmed && (
          <>
            {/* QR code */}
            <div className="flex flex-col items-center gap-3">
              <div
                className={`p-3 rounded-2xl bg-white ${expired ? 'opacity-30 grayscale' : ''} transition-all`}
              >
                <QRCodeSVG value={qrToken ?? ''} size={200} />
              </div>

              {expired && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                  <AlertTriangle size={13} />
                  QR code expired — use the manual code below
                </div>
              )}

              {/* Expiry / countdown */}
              {!expired && expiresAt && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Expires at {formatExpiry(expiresAt)}</span>
                  <span className="text-slate-600">·</span>
                  <span
                    className={`font-mono font-semibold ${
                      secondsLeft !== null && secondsLeft < 30
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {formatCountdown(secondsLeft)}
                  </span>
                </div>
              )}
            </div>

            {/* Manual backup code */}
            <div className="rounded-2xl bg-slate-800/60 border border-slate-700 p-4 flex flex-col items-center gap-1">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Backup code</p>
              <p className="text-3xl font-mono font-bold tracking-[0.25em] text-emerald-300 select-all">
                {manualCode}
              </p>
              <p className="text-xs text-slate-500 text-center">
                Share this with the volunteer if scanning doesn't work
              </p>
            </div>

            {/* Manual entry form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="text-xs text-slate-400 font-medium" htmlFor="qr-manual-input">
                Volunteer enters code here
              </label>
              <input
                id="qr-manual-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={enteredCode}
                onChange={(e) => {
                  setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setSubmitError(null);
                }}
                className="
                  w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5
                  text-center text-xl font-mono tracking-[0.3em] text-slate-100
                  placeholder:text-slate-600 placeholder:tracking-normal
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
                  transition-all
                "
              />

              {submitError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
                  <AlertTriangle size={14} className="text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-300">{submitError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || enteredCode.length !== 6}
                className="
                  w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700
                  disabled:text-slate-500 text-white font-semibold text-sm py-2.5
                  flex items-center justify-center gap-2
                  transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50
                "
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Confirm {modeLabel}
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
