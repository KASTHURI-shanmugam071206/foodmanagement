import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Clock, AlertTriangle, Navigation, ExternalLink } from 'lucide-react';

// ─── Fix Leaflet default icon broken by bundlers ────────────────────────────
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// ─── Coloured div-icon factory ───────────────────────────────────────────────
function makeDotIcon(color, blinking = false) {
  const blinkStyle = blinking
    ? 'animation:blink 1.2s step-start infinite;'
    : '';
  return L.divIcon({
    className: '',
    html: `
      <style>
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
      </style>
      <div style="
        width:18px;height:18px;
        background:${color};
        border:3px solid rgba(255,255,255,0.85);
        border-radius:50%;
        box-shadow:0 0 6px ${color}99;
        ${blinkStyle}
      "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

const PICKUP_COLOR      = '#f59e0b'; // amber-400
const DESTINATION_COLOR = '#10b981'; // emerald-500
const VOLUNTEER_COLOR   = '#3b82f6'; // blue-500

// ─── Inner component: fits map bounds whenever relevant coords change ─────────
function BoundsFitter({ positions }) {
  const map = useMap();

  useEffect(() => {
    const valid = (positions || []).filter(
      (p) => Array.isArray(p) && p.length === 2 && !isNaN(Number(p[0])) && !isNaN(Number(p[1])) && p[0] != null && p[1] != null
    );
    if (valid.length === 0) return;

    if (valid.length === 1) {
      map.setView([Number(valid[0][0]), Number(valid[0][1])], 14);
    } else {
      map.fitBounds(L.latLngBounds(valid.map(pt => [Number(pt[0]), Number(pt[1])])), { padding: [40, 40] });
    }
  }, [map, positions]);

  return null;
}

// ─── Stale-location helpers ───────────────────────────────────────────────────
function minutesAgo(isoTimestamp) {
  if (!isoTimestamp) return null;
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  return Math.floor(diff / 60000);
}

function formatMinutesAgo(mins) {
  if (mins === null) return '';
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DeliveryTrackingMap({ delivery }) {
  const {
    pickup_lat,
    pickup_lng,
    delivery_lat,
    delivery_lng,
    recipient_lat,
    recipient_lng,
    volunteer_lat,
    volunteer_lng,
    last_location_update,
    estimated_eta_minutes,
    donor_name,
    recipient_name,
    delivery_status,
    status,
  } = delivery || {};

  const currentStatus = delivery_status || status;
  const isTerminal =
    currentStatus === 'delivered' || currentStatus === 'confirmed' || currentStatus === 'failed' || currentStatus === 'cancelled';

  const pLat = pickup_lat != null && !isNaN(parseFloat(pickup_lat)) ? parseFloat(pickup_lat) : null;
  const pLng = pickup_lng != null && !isNaN(parseFloat(pickup_lng)) ? parseFloat(pickup_lng) : null;
  const rawDLat = delivery_lat ?? recipient_lat;
  const rawDLng = delivery_lng ?? recipient_lng;
  const dLat = rawDLat != null && !isNaN(parseFloat(rawDLat)) ? parseFloat(rawDLat) : null;
  const dLng = rawDLng != null && !isNaN(parseFloat(rawDLng)) ? parseFloat(rawDLng) : null;
  const vLat = volunteer_lat != null && !isNaN(parseFloat(volunteer_lat)) ? parseFloat(volunteer_lat) : null;
  const vLng = volunteer_lng != null && !isNaN(parseFloat(volunteer_lng)) ? parseFloat(volunteer_lng) : null;

  const hasPickup = pLat !== null && pLng !== null;
  const hasDelivery = dLat !== null && dLng !== null;
  const hasVolunteer = vLat !== null && vLng !== null;

  const staleMinutes = minutesAgo(last_location_update);
  const isStale = staleMinutes !== null && staleMinutes > 5;

  // Real road route polyline from OSRM
  const [routeCoords, setRouteCoords] = useState([]);

  useEffect(() => {
    if (!hasPickup || !hasDelivery) return;
    let isCancelled = false;

    const url = `https://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!isCancelled && data.routes && data.routes[0]?.geometry?.coordinates) {
          const latLngs = data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
          setRouteCoords(latLngs);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setRouteCoords([[pLat, pLng], [dLat, dLng]]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [hasPickup, hasDelivery, pLat, pLng, dLat, dLng]);

  // Google Maps navigation URL
  const isCollected = currentStatus === 'food_collected' || currentStatus === 'in_transit' || currentStatus === 'arrived_destination';
  const navTargetLat = isCollected ? dLat : pLat;
  const navTargetLng = isCollected ? dLng : pLng;
  const navOriginLat = hasVolunteer ? vLat : (isCollected ? pLat : null);
  const navOriginLng = hasVolunteer ? vLng : (isCollected ? pLng : null);

  const gmapsUrl = navTargetLat && navTargetLng
    ? (navOriginLat && navOriginLng
        ? `https://www.google.com/maps/dir/?api=1&origin=${navOriginLat},${navOriginLng}&destination=${navTargetLat},${navTargetLng}`
        : `https://www.google.com/maps/search/?api=1&query=${navTargetLat},${navTargetLng}`)
    : null;

  // Positions to fit bounds: always include pickup + destination, plus volunteer
  const boundPositions = useMemo(() => {
    const pts = [];
    if (hasPickup)   pts.push([pLat, pLng]);
    if (hasDelivery) pts.push([dLat, dLng]);
    if (hasVolunteer) pts.push([vLat, vLng]);
    return pts;
  }, [hasPickup, pLat, pLng, hasDelivery, dLat, dLng, hasVolunteer, vLat, vLng]);

  // Fallback centre if no coordinates at all
  const defaultCenter = hasPickup ? [pLat, pLng] : (hasDelivery ? [dLat, dLng] : [20.5937, 78.9629]);

  return (
    <div className="relative">
      {/* ── Status / Info strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
        {/* ETA badge */}
        {typeof estimated_eta_minutes === 'number' && !isTerminal && (
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-500/30">
            <Clock className="w-3.5 h-3.5" />
            ETA&nbsp;{estimated_eta_minutes}&nbsp;min
          </span>
        )}

        {/* Stale location warning */}
        {hasVolunteer && isStale && !isTerminal && (
          <span className="inline-flex items-center gap-1.5 bg-amber-500/15 text-amber-400 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            Location last updated&nbsp;{formatMinutesAgo(staleMinutes)}
          </span>
        )}

        {/* Live indicator */}
        {hasVolunteer && !isStale && !isTerminal && (
          <span className="inline-flex items-center gap-1.5 bg-blue-500/15 text-blue-400 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-500/30">
            <Navigation className="w-3.5 h-3.5" />
            Live tracking
          </span>
        )}

        {/* Google Maps Turn-by-Turn button */}
        {gmapsUrl && (
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full transition shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Navigate in Google Maps
          </a>
        )}

        {/* Terminal status */}
        {isTerminal && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
              delivery_status === 'delivered'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/15 text-red-400 border-red-500/30'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            {delivery_status === 'delivered' ? 'Delivered' : 'Failed'}
          </span>
        )}
      </div>

      {/* ── No-volunteer banner ──────────────────────────────────────────── */}
      {!hasVolunteer && !isTerminal && (
        <div className="flex items-center gap-2 mb-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-400">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          Live location not available. Last known position unavailable.
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div className="h-72 rounded-2xl overflow-hidden border border-slate-700">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />

          {/* Fit bounds whenever positions change */}
          <BoundsFitter positions={boundPositions} />

          {/* Driving route polyline */}
          {routeCoords.length > 0 && (
            <Polyline
              positions={routeCoords}
              color="#38bdf8"
              weight={4}
              opacity={0.85}
              dashArray="6, 8"
            />
          )}

          {/* Pickup marker */}
          {hasPickup && (
            <Marker
              position={[pLat, pLng]}
              icon={makeDotIcon(PICKUP_COLOR)}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold text-amber-600">Pickup</p>
                  {donor_name && <p>{donor_name}</p>}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Destination marker */}
          {hasDelivery && (
            <Marker
              position={[dLat, dLng]}
              icon={makeDotIcon(DESTINATION_COLOR)}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold text-emerald-600">Destination</p>
                  {recipient_name && <p>{recipient_name}</p>}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Volunteer marker — blinking when live, static when terminal */}
          {hasVolunteer && (
            <Marker
              position={[vLat, vLng]}
              icon={makeDotIcon(VOLUNTEER_COLOR, !isTerminal && !isStale)}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold text-blue-600">Volunteer</p>
                  {last_location_update && (
                    <p className="text-gray-500">
                      Updated&nbsp;{formatMinutesAgo(staleMinutes)}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mt-2 px-1">
        <LegendDot color={PICKUP_COLOR}      label="Pickup" />
        <LegendDot color={DESTINATION_COLOR} label="Destination" />
        {hasVolunteer && (
          <LegendDot color={VOLUNTEER_COLOR} label="Volunteer" />
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span
        style={{ background: color }}
        className="inline-block w-2.5 h-2.5 rounded-full"
      />
      {label}
    </span>
  );
}
