import { Snowflake, Flame, Package, HelpCircle } from 'lucide-react';

/**
 * FoodSafetyBadge
 * Displays food safety information for a donation in a compact inline layout.
 *
 * @param {{ donation: {
 *   safety_status?: 'safe'|'unsafe'|'spoiled'|'unverified',
 *   storage_type?: 'refrigerated'|'frozen'|'dry'|'hot'|null,
 *   storage_temperature_c?: number|null,
 *   allergens?: string|null,
 *   food_condition?: string|null,
 *   safe_use_deadline?: string|null,
 * }}} props
 */
export default function FoodSafetyBadge({ donation = {} }) {
  const {
    safety_status = 'unverified',
    storage_type = null,
    storage_temperature_c = null,
    allergens = null,
    safe_use_deadline = null,
  } = donation;

  /* ── 1. Safety status badge ─────────────────────────────────────────── */
  const statusConfig = {
    safe: {
      label: 'Safe',
      cls: 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30',
    },
    unsafe: {
      label: 'Unsafe',
      cls: 'bg-rose-500/20 text-rose-400 ring-rose-500/30',
    },
    spoiled: {
      label: 'Spoiled',
      cls: 'bg-rose-500/20 text-rose-400 ring-rose-500/30',
    },
    unverified: {
      label: 'Unverified',
      cls: 'bg-amber-500/20 text-amber-400 ring-amber-500/30',
    },
  };
  const { label: statusLabel, cls: statusCls } =
    statusConfig[safety_status] ?? statusConfig.unverified;

  /* ── 2. Storage type icon ────────────────────────────────────────────── */
  const storageIconMap = {
    frozen: { Icon: Snowflake, title: 'Frozen', cls: 'text-sky-400' },
    refrigerated: { Icon: Snowflake, title: 'Refrigerated', cls: 'text-sky-300' },
    hot: { Icon: Flame, title: 'Hot-held', cls: 'text-orange-400' },
    hot_holding: { Icon: Flame, title: 'Hot-held', cls: 'text-orange-400' },
    dry: { Icon: Package, title: 'Dry storage', cls: 'text-slate-400' },
    ambient: { Icon: Package, title: 'Ambient', cls: 'text-slate-400' },
  };
  const storageInfo = storage_type
    ? storageIconMap[storage_type] ?? { Icon: HelpCircle, title: storage_type, cls: 'text-slate-400' }
    : { Icon: HelpCircle, title: 'Unknown storage', cls: 'text-slate-500' };
  const { Icon: StorageIcon, title: storageTitle, cls: storageCls } = storageInfo;

  /* Build temperature label */
  const tempLabel =
    storage_temperature_c !== null && storage_temperature_c !== undefined
      ? `${storage_temperature_c}°C`
      : null;

  /* ── 4. Expiry urgency ──────────────────────────────────────────────── */
  let expiryNode = null;
  if (safe_use_deadline) {
    const deadline = new Date(safe_use_deadline);
    const now = new Date();
    const diffMs = deadline - now;
    const diffH = diffMs / 3_600_000; // hours remaining

    const fmt = deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (diffMs <= 0) {
      expiryNode = (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full ring-1
          bg-rose-500/20 text-rose-400 ring-rose-500/30 font-semibold tracking-wide">
          EXPIRED
        </span>
      );
    } else if (diffH < 1) {
      expiryNode = (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full ring-1
          bg-rose-500/20 text-rose-400 ring-rose-500/30">
          Critical: {fmt}
        </span>
      );
    } else if (diffH <= 4) {
      expiryNode = (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full ring-1
          bg-amber-500/20 text-amber-400 ring-amber-500/30">
          Expires soon: {fmt}
        </span>
      );
    } else {
      expiryNode = (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full ring-1
          bg-emerald-500/20 text-emerald-400 ring-emerald-500/30">
          Safe until {fmt}
        </span>
      );
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] leading-none select-none">

      {/* 1 · Safety status badge */}
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-full ring-1 font-medium ${statusCls}`}
      >
        {statusLabel}
      </span>

      {/* 2 · Storage icon + optional temperature */}
      <span
        title={storageTitle}
        className={`inline-flex items-center gap-0.5 ${storageCls}`}
      >
        <StorageIcon size={11} strokeWidth={2} />
        {tempLabel && <span className="text-[10px]">{tempLabel}</span>}
      </span>

      {/* 3 · Allergens warning pill */}
      {allergens && allergens.trim() !== '' && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full ring-1
          bg-amber-500/20 text-amber-400 ring-amber-500/30 max-w-[180px] truncate"
          title={`Allergens: ${allergens}`}
        >
          ⚠ Allergens: {allergens}
        </span>
      )}

      {/* 4 · Expiry urgency */}
      {expiryNode}
    </div>
  );
}
