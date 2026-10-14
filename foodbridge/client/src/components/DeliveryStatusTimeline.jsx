import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Ordered list of all delivery stages (excluding 'failed', which is terminal
 * and may appear at any point).
 */
const STAGE_ORDER = [
  'donation_created',
  'accepted',
  'volunteer_assigned',
  'volunteer_accepted',
  'arrived_pickup',
  'food_collected',
  'in_transit',
  'arrived_destination',
  'delivered',
];

const STAGE_LABELS = {
  donation_created:   'Donation Created',
  accepted:           'Accepted by NGO',
  volunteer_assigned: 'Volunteer Assigned',
  volunteer_accepted: 'Volunteer Accepted',
  arrived_pickup:     'Arrived at Pickup',
  food_collected:     'Food Collected',
  in_transit:         'In Transit',
  arrived_destination:'Arrived at Destination',
  delivered:          'Delivered',
  failed:             'Delivery Failed',
};

/**
 * Format an ISO timestamp into a readable local string.
 * @param {string|Date} ts
 * @returns {string}
 */
function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month:  'short',
      day:    'numeric',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

/**
 * Build a merged stage list combining the fixed STAGE_ORDER with any
 * history entries, injecting 'failed' where it occurred if present.
 *
 * @param {Array<{status: string, timestamp: string, notes?: string}>} history
 * @param {string} currentStatus
 * @returns {Array<{stage, state, timestamp, notes}>}
 *   state: 'completed' | 'current' | 'pending' | 'failed'
 */
function buildTimeline(history, currentStatus) {
  const historyMap = {};
  if (Array.isArray(history)) {
    history.forEach((entry) => {
      if (entry && entry.status) {
        // Keep the earliest entry for each status
        if (!historyMap[entry.status]) {
          historyMap[entry.status] = entry;
        }
      }
    });
  }

  const isFailed = currentStatus === 'failed' || !!historyMap['failed'];

  // Build base stages from the ordered list
  const stages = STAGE_ORDER.map((stage) => {
    const entry = historyMap[stage];
    let state;

    if (isFailed) {
      // Everything recorded in history before 'failed' is completed
      state = entry ? 'completed' : 'pending';
    } else {
      if (entry) {
        state = stage === currentStatus ? 'current' : 'completed';
      } else {
        state = 'pending';
      }
    }

    return {
      stage,
      state,
      timestamp: entry ? entry.timestamp : null,
      notes:     entry ? entry.notes    : null,
    };
  });

  // Append the 'failed' terminal stage if applicable
  if (isFailed) {
    const failedEntry = historyMap['failed'];
    stages.push({
      stage:     'failed',
      state:     'failed',
      timestamp: failedEntry ? failedEntry.timestamp : null,
      notes:     failedEntry ? failedEntry.notes     : null,
    });
  }

  return stages;
}

/**
 * Icon for a given stage state.
 */
function StageIcon({ state }) {
  const base = 'w-4 h-4 flex-shrink-0';

  switch (state) {
    case 'completed':
      return <CheckCircle2 className={`${base} text-emerald-400`} />;
    case 'current':
      return <Loader2 className={`${base} text-emerald-400 animate-spin`} />;
    case 'failed':
      return <AlertTriangle className={`${base} text-rose-400`} />;
    case 'pending':
    default:
      return <Clock className={`${base} text-slate-500`} />;
  }
}

/**
 * The coloured dot displayed on the vertical timeline rail.
 */
function TimelineDot({ state, isLast }) {
  let dotClass;

  switch (state) {
    case 'completed':
      dotClass = 'bg-emerald-500 border-emerald-500';
      break;
    case 'current':
      dotClass =
        'bg-emerald-400 border-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)] animate-pulse';
      break;
    case 'failed':
      dotClass = 'bg-rose-500 border-rose-500';
      break;
    case 'pending':
    default:
      dotClass = 'bg-slate-700 border-slate-600';
      break;
  }

  const lineClass =
    state === 'completed'
      ? 'bg-emerald-700'
      : state === 'failed'
      ? 'bg-rose-800'
      : 'bg-slate-700';

  return (
    <div className="flex flex-col items-center">
      {/* Dot */}
      <div
        className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${dotClass}`}
      />
      {/* Connecting line (not rendered after the last item) */}
      {!isLast && (
        <div className={`w-0.5 flex-1 min-h-[2rem] mt-0.5 ${lineClass}`} />
      )}
    </div>
  );
}

/**
 * DeliveryStatusTimeline
 *
 * Props:
 *   history       – Array<{ status, timestamp, notes? }>  (may be null/empty)
 *   currentStatus – string  (current status of the delivery)
 */
export default function DeliveryStatusTimeline({ history, currentStatus }) {
  const timeline = buildTimeline(history, currentStatus);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-slate-500 text-sm py-4 text-center">
        No status history available.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {timeline.map(({ stage, state, timestamp, notes }, idx) => {
        const isLast = idx === timeline.length - 1;

        const labelClass =
          state === 'completed'
            ? 'text-emerald-400 font-medium'
            : state === 'current'
            ? 'text-emerald-300 font-semibold'
            : state === 'failed'
            ? 'text-rose-400 font-medium'
            : 'text-slate-500';

        return (
          <div key={`${stage}-${idx}`} className="flex gap-3">
            {/* Left rail */}
            <TimelineDot state={state} isLast={isLast} />

            {/* Right content */}
            <div className={`pb-5 flex-1 min-w-0 ${isLast ? 'pb-0' : ''}`}>
              {/* Stage header row */}
              <div className="flex items-center gap-2 flex-wrap">
                <StageIcon state={state} />
                <span className={`text-sm ${labelClass}`}>
                  {STAGE_LABELS[stage] ?? stage}
                </span>
                {state === 'current' && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full px-2 py-0.5 leading-none">
                    Current
                  </span>
                )}
              </div>

              {/* Timestamp */}
              {timestamp && (
                <p className="text-xs text-slate-500 mt-0.5 ml-6">
                  {formatTimestamp(timestamp)}
                </p>
              )}

              {/* Optional notes */}
              {notes && (
                <p className="text-xs text-slate-400 mt-1 ml-6 bg-slate-800/60 border border-slate-700 rounded-lg px-2.5 py-1.5 italic">
                  {notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
