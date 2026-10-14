import React, { useState, useEffect } from 'react';
import { Trophy, Award, X, Star, Medal, CheckCircle2, Printer, Loader2, ExternalLink } from 'lucide-react';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

/* ─────────────────────── Photo Viewer Modal ─────────────────────── */
export function PhotoViewerModal({ photo, onClose }) {
  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card-surface max-w-lg w-full rounded-3xl p-5 shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            📸 {photo.title || 'Handover Photo Proof'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl bg-black flex items-center justify-center max-h-[70vh]">
          <img src={photo.url} alt="Proof" className="max-h-[70vh] w-auto object-contain" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Leaderboard Modal ─────────────────────── */
export function LeaderboardModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.get('/api/deliveries/leaderboard/top')
      .then((res) => setBoard(res.data.leaderboard || []))
      .catch(() => setBoard([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const getRankBadge = (idx) => {
    if (idx === 0) return <span className="text-xl">🥇</span>;
    if (idx === 1) return <span className="text-xl">🥈</span>;
    if (idx === 2) return <span className="text-xl">🥉</span>;
    return <span className="font-bold text-slate-400 text-sm">#{idx + 1}</span>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card-surface max-w-lg w-full rounded-3xl p-6 shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
              <Trophy size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('leaderboard')}</h3>
              <p className="text-xs text-slate-400">{t('topVolunteers')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={32} className="animate-spin text-amber-400" />
          </div>
        ) : board.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">No leaderboard records yet.</p>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {board.map((vol, idx) => (
              <div
                key={vol.volunteer_id}
                className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                  idx === 0
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 text-center">{getRankBadge(idx)}</div>
                  <div>
                    <p className="font-bold text-sm text-white">{vol.name}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>{vol.completed_deliveries} {t('runsCompleted')}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-semibold">{vol.total_meals_rescued} {t('mealsRescued')}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-full text-xs font-extrabold text-amber-300">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  {vol.karma_points} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Certificate Modal ─────────────────────── */
export function CertificateModal({ isOpen, onClose, volunteerName, mealsRescued, deliveriesCount, karmaPoints }) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const today = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card-surface max-w-2xl w-full rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700 my-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 print:hidden">
          <div className="flex items-center gap-2">
            <Award size={20} className="text-emerald-400" />
            <span className="text-sm font-bold text-white">{t('downloadCert')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              <Printer size={13} /> {t('printCert')}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* The Printable Certificate Container */}
        <div
          id="foodbridge-certificate"
          className="relative rounded-2xl border-4 border-amber-500/40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-10 text-center shadow-inner"
        >
          {/* Subtle watermark seal */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <Award size={240} className="text-amber-400" />
          </div>

          <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-emerald-400 mb-1">
            FoodBridge National Food Rescue Network
          </p>
          <h2 className="text-2xl sm:text-3xl font-serif font-black tracking-wide text-amber-300 uppercase mb-2">
            Certificate of Appreciation
          </h2>
          <p className="text-xs text-slate-400 mb-6 italic">
            This certifies that
          </p>

          <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 underline decoration-amber-400/60 underline-offset-8">
            {volunteerName || 'Honored Volunteer'}
          </h3>

          <p className="max-w-lg mx-auto text-xs text-slate-300 leading-relaxed mt-4 mb-6">
            has demonstrated exceptional civic dedication and humanitarian service by rescuing and redistributing surplus food to underserved communities, actively eliminating food waste and hunger.
          </p>

          {/* Impact Stats Grid */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto my-6 py-4 px-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div>
              <p className="text-lg sm:text-xl font-extrabold text-emerald-400">{mealsRescued || 0}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t('mealsRescued')}</p>
            </div>
            <div>
              <p className="text-lg sm:text-xl font-extrabold text-sky-400">{deliveriesCount || 0}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t('runsCompleted')}</p>
            </div>
            <div>
              <p className="text-lg sm:text-xl font-extrabold text-amber-300">{karmaPoints || 0}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t('karmaPoints')}</p>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-4 text-left text-xs text-slate-400">
            <div>
              <p className="text-[10px] text-slate-500">Date Issued</p>
              <p className="font-semibold text-slate-300">{today}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full border border-amber-400/60 bg-amber-400/10 flex items-center justify-center text-amber-300">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-300 uppercase">Verified</p>
                <p className="text-[10px] text-slate-400">FoodBridge Authority</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
