import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_LOCATION = { lat: 11.341, lng: 77.7172 };
const GOOGLE_MAPS_SCRIPT_ID = 'foodbridge-google-maps-script';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    }
  });

  return null;
}

function LeafletMap({ center, onSelect }) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} scrollWheelZoom className="h-64 w-full rounded-2xl">
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onSelect={onSelect} />
      <Marker position={[center.lat, center.lng]} icon={markerIcon} />
    </MapContainer>
  );
}

export default function LocationMapPicker({ label, value, onChange }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef(null);
  const [mapCenter, setMapCenter] = useState({
    lat: Number(value?.lat ?? DEFAULT_LOCATION.lat),
    lng: Number(value?.lng ?? DEFAULT_LOCATION.lng)
  });
  const [googleMapLoaded, setGoogleMapLoaded] = useState(Boolean(window.google?.maps));
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const updateLocation = (lat, lng) => {
    const nextCenter = {
      lat: Number(lat),
      lng: Number(lng)
    };

    setMapCenter(nextCenter);
    onChange?.(nextCenter.lat, nextCenter.lng);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.');
      return;
    }

    setLocationError('');
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateLocation(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
      },
      () => {
        setLocationError('Unable to access your current location. Please pick a location manually.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (value?.lat != null && value?.lng != null) {
      setMapCenter({ lat: Number(value.lat), lng: Number(value.lng) });
    }
  }, [value]);

  useEffect(() => {
    if (!navigator.geolocation || value?.lat != null || value?.lng != null) return;

    handleUseCurrentLocation();
  }, [value]);

  useEffect(() => {
    if (!apiKey) return;

    const loadGoogleMaps = () => {
      if (window.google?.maps) {
        setGoogleMapLoaded(true);
        return;
      }

      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      if (existingScript) {
        existingScript.addEventListener('load', () => setGoogleMapLoaded(true), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => setGoogleMapLoaded(true);
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !googleMapLoaded || !mapRef.current || !window.google?.maps) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: mapCenter.lat, lng: mapCenter.lng },
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    const marker = new window.google.maps.Marker({
      position: { lat: mapCenter.lat, lng: mapCenter.lng },
      map,
      draggable: true,
    });

    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      const lat = position.lat();
      const lng = position.lng();
      setMapCenter({ lat, lng });
      onChange?.(lat, lng);
    });

    map.addListener('click', (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      setMapCenter({ lat, lng });
      onChange?.(lat, lng);
      marker.setPosition({ lat, lng });
    });
  }, [apiKey, googleMapLoaded, mapCenter, onChange]);

  const handleCoordinateChange = (field, nextValue) => {
    const parsedValue = Number.parseFloat(nextValue);
    if (Number.isNaN(parsedValue)) return;

    const nextCenter = {
      ...mapCenter,
      [field]: parsedValue
    };

    setMapCenter(nextCenter);
    onChange?.(nextCenter.lat, nextCenter.lng);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isLocating}
          className="text-xs font-medium text-emerald-300 underline underline-offset-4 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {isLocating ? 'Tracking…' : 'Use my location'}
        </button>
      </div>

      {locationError ? (
        <p className="text-xs text-rose-300">{locationError}</p>
      ) : null}

      {apiKey && googleMapLoaded ? (
        <div ref={mapRef} className="h-64 w-full rounded-2xl border border-slate-700" />
      ) : (
        <LeafletMap center={mapCenter} onSelect={(lat, lng) => updateLocation(lat, lng)} />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">
          Latitude
          <input
            type="number"
            step="0.000001"
            value={mapCenter.lat}
            onChange={(event) => handleCoordinateChange('lat', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-emerald-400"
          />
        </label>

        <label className="text-xs text-slate-300">
          Longitude
          <input
            type="number"
            step="0.000001"
            value={mapCenter.lng}
            onChange={(event) => handleCoordinateChange('lng', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition focus:border-emerald-400"
          />
        </label>
      </div>
    </div>
  );
}
