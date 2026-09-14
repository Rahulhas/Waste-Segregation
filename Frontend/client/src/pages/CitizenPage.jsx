import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import CameraCapture from '../components/waste/CameraCapture';

// Default fallback if all detection fails (Bengaluru / India center)
const DEFAULT_FALLBACK_LOCATION = [12.9716, 77.5946];

const locationIcon = L.divIcon({
  className: 'current-location-marker',
  html: '<span class="relative flex h-5 w-5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-forest opacity-75"></span><span class="relative inline-flex rounded-full h-5 w-5 bg-forest border-2 border-white shadow-md"></span></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const TYPES = [
  ['overflow', 'Overflowing bin'],
  ['missed_pickup', 'Missed pickup'],
  ['damaged_bin', 'Damaged bin'],
  ['bulk_ewaste', 'Bulk e-waste'],
];

const STEPS = [
  ['submitted', 'Complaint filed'],
  ['verified', 'Admin verified'],
  ['dispatched', 'Driver assigned'],
  ['pickup_done', 'Pickup completed'],
  ['resolved', 'Verified resolved'],
];

function getStorageKey(user) {
  if (user?.id) return `ecocampus_user_tickets_${user.id}`;
  if (user?.email) return `ecocampus_user_tickets_${user.email}`;
  return 'ecocampus_guest_tickets';
}

function getStoredComplaintIds(user) {
  try {
    const key = getStorageKey(user);
    const raw = localStorage.getItem(key);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function saveComplaintId(ticketId, user) {
  try {
    const key = getStorageKey(user);
    const existing = getStoredComplaintIds(user);
    if (!existing.includes(ticketId)) {
      const updated = [ticketId, ...existing];
      localStorage.setItem(key, JSON.stringify(updated));
    }
  } catch {}
}

const TYPE_CONFIG = {
  overflow: { label: 'Overflowing bin', icon: '🗑️' },
  missed_pickup: { label: 'Missed pickup', icon: '🚛' },
  damaged_bin: { label: 'Damaged bin', icon: '⚠️' },
  bulk_ewaste: { label: 'Bulk e-waste', icon: '🔋' },
};

const STATUS_BADGES = {
  submitted: {
    label: '1. Complaint filed',
    bg: 'bg-mint/80 text-forest border-sage-400',
  },
  verified: {
    label: '2. Admin verified',
    bg: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  dispatched: {
    label: '3. Driver assigned',
    bg: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  pickup_done: {
    label: '4. Pickup proof uploaded',
    bg: 'bg-purple-100 text-purple-900 border-purple-300',
  },
  resolved: {
    label: '5. Resolved & verified',
    bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
};

function formatComplaintDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CitizenPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    contact: user?.phone || '',
    type: 'overflow',
    address: '',
    lat: DEFAULT_FALLBACK_LOCATION[0],
    lng: DEFAULT_FALLBACK_LOCATION[1],
    photo: null,
  });

  const [ticket, setTicket] = useState(null);
  const [trackingId, setTrackingId] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState('Detecting real location...');
  const [locationType, setLocationType] = useState('detecting'); // 'gps', 'ip', 'pinned', 'search'
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Complaints list state
  const [complaints, setComplaints] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const trackSectionRef = useRef(null);

  // Photo capture & upload state
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef(null);

  const markerRef = useRef(null);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function handlePhotoSelect(file) {
    if (!file) return;
    update('photo', file);
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);
  }

  function handleRemovePhoto() {
    update('photo', null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const activeRequest = trackingResult || ticket;
  const activeStep = activeRequest ? STEPS.findIndex(([id]) => id === activeRequest.status) : -1;

  // Reverse geocoding helper (coordinates -> human-readable address)
  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data && data.display_name) {
        const addr = data.address || {};
        const parts = [
          addr.building || addr.amenity || (addr.house_number ? `${addr.house_number} ${addr.road || ''}`.trim() : addr.road),
          addr.suburb || addr.neighbourhood || addr.residential,
          addr.city || addr.town || addr.village || addr.county,
          addr.state,
          addr.postcode,
        ].filter(Boolean);

        const formatted = parts.length >= 2 ? parts.join(', ') : data.display_name;
        setForm((prev) => ({ ...prev, address: formatted }));
      }
    } catch (err) {
      console.warn('Reverse geocoding error:', err);
    }
  }

  // Forward geocoding helper (address search -> coordinates)
  async function searchLocation(query) {
    const q = query || form.address;
    if (!q || !q.trim()) return;

    setIsSearchingAddress(true);
    setError('');

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q.trim())}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setForm((prev) => ({ ...prev, lat: newLat, lng: newLng }));
        setLocationStatus('Located via address search');
        setLocationType('search');
      } else {
        setError('Location address not found. You can click directly on the map to set your location.');
      }
    } catch (err) {
      console.warn('Search geocoding error:', err);
      setError('Could not search address. Please click on the map to set location.');
    } finally {
      setIsSearchingAddress(false);
    }
  }

  // Multi-tier real location detection: GPS -> IP Geolocation -> Map Default
  async function acquireRealLocation() {
    setIsLocating(true);
    setError('');
    setLocationStatus('Acquiring real location...');

    // 1. First try browser GPS / Wi-Fi Geolocation
    const gpsPosition = await new Promise((resolve) => {
      if (!navigator.geolocation) {
        return resolve(null);
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => {
          console.warn('Browser GPS unavailable/timed out:', err.message);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 30000 }
      );
    });

    if (gpsPosition?.coords) {
      const { latitude, longitude } = gpsPosition.coords;
      setForm((prev) => ({ ...prev, lat: latitude, lng: longitude }));
      setLocationStatus('Live GPS location');
      setLocationType('gps');
      setIsLocating(false);
      await reverseGeocode(latitude, longitude);
      return;
    }

    // 2. Browser GPS failed or unavailable on PC -> Query real IP Geolocation
    setLocationStatus('Locating via network IP...');
    try {
      const res = await fetch('https://ipwho.is/');
      const data = await res.json();
      if (data && data.success && data.latitude && data.longitude) {
        const lat = data.latitude;
        const lng = data.longitude;
        setForm((prev) => ({ ...prev, lat, lng }));
        const place = [data.city, data.region].filter(Boolean).join(', ');
        setLocationStatus(`Real location detected (${place})`);
        setLocationType('ip');
        setIsLocating(false);
        await reverseGeocode(lat, lng);
        return;
      }
    } catch (ipErr) {
      console.warn('ipwho.is failed, trying fallback:', ipErr);
    }

    // 3. Fallback IP service
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data && data.latitude && data.longitude) {
        const lat = data.latitude;
        const lng = data.longitude;
        setForm((prev) => ({ ...prev, lat, lng }));
        const place = [data.city, data.region].filter(Boolean).join(', ');
        setLocationStatus(`Real location detected (${place})`);
        setLocationType('ip');
        setIsLocating(false);
        await reverseGeocode(lat, lng);
        return;
      }
    } catch (ipErr2) {
      console.warn('Secondary IP lookup failed:', ipErr2);
    }

    // 4. Default fallback if all fail
    setLocationStatus('Click on map to pin location');
    setLocationType('pinned');
    setIsLocating(false);
  }

  // Auto-locate on mount
  useEffect(() => {
    acquireRealLocation();
  }, []);

  // Map Click / Pin Drop Handler
  function handleMapClick(lat, lng) {
    update('lat', lat);
    update('lng', lng);
    setLocationStatus('Pinned on map');
    setLocationType('pinned');
    reverseGeocode(lat, lng);
  }

  async function loadComplaints() {
    setLoadingComplaints(true);
    try {
      const storedIds = getStoredComplaintIds(user);
      const contactNumber = user?.phone || form.contact || '';
      const citizenName = user?.name || form.name || '';

      // If user hasn't filed any complaints and has no identity info, do not make empty queries
      if (!contactNumber.trim() && !citizenName.trim() && storedIds.length === 0) {
        setComplaints([]);
        setLoadingComplaints(false);
        return;
      }

      const params = new URLSearchParams();
      if (contactNumber.trim()) {
        params.append('contact', contactNumber.trim());
      }
      if (citizenName.trim()) {
        params.append('name', citizenName.trim());
      }
      if (storedIds.length > 0) {
        params.append('ticketIds', storedIds.join(','));
      }

      const res = await api.getCitizenComplaints(params.toString());
      if (res && res.requests) {
        setComplaints(res.requests);
      }
    } catch (err) {
      console.warn('Could not load complaints list:', err);
    } finally {
      setLoadingComplaints(false);
    }
  }

  // Load complaints on mount and whenever user identity changes
  useEffect(() => {
    loadComplaints();
  }, [user?.id, user?.phone, user?.name]);

  // Complaints filter logic - strictly only allow user's own complaints
  const myStoredIds = getStoredComplaintIds(user);
  const isMyComplaint = (item) => {
    if (!item) return false;

    // When logged in as a registered user:
    if (user?.name) {
      // Must strictly match the logged-in citizen's name
      if (item.citizenName?.trim().toLowerCase() !== user.name.trim().toLowerCase()) {
        return false;
      }
      // If user profile has phone, contact number must also match if present
      if (user?.phone && item.contactNumber?.trim()) {
        if (item.contactNumber.trim() !== user.phone.trim()) {
          return false;
        }
      }
      return true;
    }

    // When viewing as guest (not logged in):
    // Only complaints saved in this guest's browser storage
    if (myStoredIds.includes(item.ticketId)) {
      if (form.name?.trim() && item.citizenName?.trim().toLowerCase() !== form.name.trim().toLowerCase()) {
        return false;
      }
      return true;
    }

    // Or if guest entered name and contact in form, both must match
    if (form.name?.trim() && form.contact?.trim()) {
      return (
        item.citizenName?.trim().toLowerCase() === form.name.trim().toLowerCase() &&
        item.contactNumber?.trim() === form.contact.trim()
      );
    }

    return false;
  };

  const filteredComplaints = complaints.filter(isMyComplaint).filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTicket = item.ticketId?.toLowerCase().includes(q);
      const matchName = item.citizenName?.toLowerCase().includes(q);
      const matchAddress = item.addressString?.toLowerCase().includes(q);
      const matchZone = item.zone?.toLowerCase().includes(q);
      const matchType = TYPE_CONFIG[item.requestType]?.label.toLowerCase().includes(q);
      if (!matchTicket && !matchName && !matchAddress && !matchZone && !matchType) return false;
    }
    return true;
  });

  async function submitRequest(event) {
    event.preventDefault();
    setError('');

    if (!form.photo) {
      setError('A photo of the waste issue is mandatory. Please use the Camera or Upload Image button to attach a photo before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const { request } = await api.submitCitizenRequest({
        citizenName: form.name,
        contactNumber: form.contact,
        requestType: form.type,
        location: {
          lat: form.lat,
          lng: form.lng,
          address_string: form.address || `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`,
        },
        photoUrl: await fileToDataUrl(form.photo),
      });
      saveComplaintId(request.ticketId, user);
      setTicket(request);
      setTrackingId(request.ticketId);
      setTrackingResult(request);
      setComplaints((prev) => [request, ...prev.filter((c) => c.ticketId !== request.ticketId)]);
      handleRemovePhoto();
      setTimeout(() => {
        trackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function trackRequest(event) {
    if (event) event.preventDefault();
    setError('');
    const idToTrack = trackingId.trim();
    if (!idToTrack) return;
    try {
      const { request } = await api.trackCitizenRequest(idToTrack);
      setTrackingResult(request);
      setTicket(null);
      saveComplaintId(request.ticketId, user);
      setComplaints((prev) => [request, ...prev.filter((c) => c.ticketId !== request.ticketId)]);
    } catch (trackError) {
      setError(trackError.message);
    }
  }

  function handleSelectComplaint(item) {
    setTrackingId(item.ticketId);
    setTrackingResult(item);
    setTicket(null);
    trackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleCopyTicketId(ticketId) {
    try {
      navigator.clipboard.writeText(ticketId);
      setCopiedId(ticketId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <header className="mx-auto mb-8 flex max-w-6xl items-center justify-between">
        <div>
          <div className="text-lg font-bold text-sage-900">EcoCampus</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sage-700">Citizen services</div>
        </div>
        <a href="/login" className="text-sm font-bold text-sage-800 hover:text-sage-900">Staff sign in</a>
      </header>

      <main className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-sage-900">Keep your neighborhood clean.</h1>
          <p className="mt-2 max-w-xl text-sm font-medium text-sage-800">
            Report a waste service issue and follow every step until it is resolved.
          </p>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {/* Form */}
          <form onSubmit={submitRequest} className="rounded-xl border border-sage-300/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-sage-900">Submit a request</h2>
              <p className="mt-1 text-xs font-medium text-sage-800">It takes less than two minutes.</p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {TYPES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => update('type', id)}
                  className={`rounded-lg border p-2.5 text-left text-xs font-bold ${
                    form.type === id ? 'border-sage-900 bg-mint text-sage-900' : 'border-sage-300 bg-white/50 text-sage-800 hover:bg-sage-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-sage-900">
                Your name
                <input
                  required
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-sage-300 bg-white/70 px-3 py-2.5 text-sm text-sage-900"
                />
              </label>
              <label className="text-xs font-bold text-sage-900">
                Contact number
                <input
                  required
                  value={form.contact}
                  onChange={(event) => update('contact', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-sage-300 bg-white/70 px-3 py-2.5 text-sm text-sage-900"
                />
              </label>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-bold text-sage-900">
                Issue address / Landmark
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  required
                  value={form.address}
                  onChange={(event) => update('address', event.target.value)}
                  placeholder="Street, area, landmark, or click map to auto-fill"
                  className="w-full rounded-lg border border-sage-300 bg-white/70 px-3 py-2.5 text-sm text-sage-900"
                />
                <button
                  type="button"
                  onClick={() => searchLocation(form.address)}
                  disabled={isSearchingAddress || !form.address.trim()}
                  className="shrink-0 rounded-lg bg-sage-800 px-3 py-2 text-xs font-bold text-white hover:bg-sage-900 disabled:opacity-50"
                  title="Find address on map"
                >
                  {isSearchingAddress ? '...' : '🔍 Find'}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={acquireRealLocation}
                disabled={isLocating}
                className="flex items-center gap-1 font-bold text-forest hover:underline disabled:opacity-50"
              >
                <span>📍</span>
                {isLocating ? 'Detecting real location...' : `Use real location (${form.lat.toFixed(4)}, ${form.lng.toFixed(4)})`}
              </button>
              <span className="text-[11px] text-text-muted">Click map or drag pin to fine-tune</span>
            </div>

            {/* Photo Capture & Upload Section (MANDATORY) */}
            <div className={`mt-4 rounded-xl border p-4 shadow-sm transition-all ${
              !form.photo ? 'border-amber-400/80 bg-amber-50/40 ring-1 ring-amber-300/60' : 'border-emerald-300 bg-emerald-50/30'
            }`}>
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-sage-900 flex items-center gap-1.5">
                    <span>📸</span> Photo of the issue <span className="text-red-600 font-black text-base">*</span>
                  </span>
                  <p className="text-[11px] font-semibold text-sage-700">
                    Capture via camera or upload from device <span className="text-amber-800 font-bold">(Mandatory to register complaint)</span>
                  </p>
                </div>
                {form.photo ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800 border border-emerald-300">
                    ✓ Photo Attached
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-900 border border-amber-400 animate-pulse">
                    Photo Required
                  </span>
                )}
              </div>

              {photoPreview ? (
                <div className="relative mt-2 overflow-hidden rounded-xl border border-emerald-300 bg-white/90 p-2">
                  <div className="relative flex items-center justify-center bg-black/5 rounded-lg overflow-hidden max-h-48">
                    <img
                      src={photoPreview}
                      alt="Captured issue preview"
                      className="max-h-48 w-auto rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white font-bold text-xs shadow-lg hover:bg-red-700 transition"
                      title="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between px-1 text-xs">
                    <span className="font-semibold text-sage-900 truncate max-w-[200px]">
                      📎 {form.photo.name || 'issue-photo.jpg'}
                    </span>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-red-700 font-bold hover:underline"
                    >
                      Change photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg border border-amber-300/80 bg-amber-100/60 p-2 text-center text-xs font-semibold text-amber-900">
                    ⚠️ A photo is required to register this complaint. Please choose an option below:
                  </div>

                  {/* 2 Dedicated Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Button 1: Camera */}
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 px-3 py-3 text-xs font-extrabold text-emerald-900 shadow-sm transition hover:bg-emerald-100 active:scale-98"
                    >
                      <span className="text-base">📷</span>
                      <span>1. Camera</span>
                    </button>

                    {/* Button 2: Upload Image */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 rounded-xl border-2 border-sage-300 bg-white px-3 py-3 text-xs font-extrabold text-sage-800 shadow-sm transition hover:border-sage-400 hover:bg-sage-50 active:scale-98"
                    >
                      <span className="text-base">📁</span>
                      <span>2. Upload image</span>
                    </button>
                  </div>

                  {/* Hidden File Input for Button 2 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handlePhotoSelect(file);
                    }}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Camera Capture Modal */}
            {showCamera && (
              <CameraCapture
                onCapture={(file) => {
                  handlePhotoSelect(file);
                  setShowCamera(false);
                }}
                onClose={() => setShowCamera(false)}
              />
            )}

            {error && <div className="mt-3 rounded-lg bg-alert-muted p-3 text-xs font-bold text-alert">{error}</div>}

            <button
              disabled={submitting || !form.photo}
              className={`mt-5 w-full rounded-lg px-4 py-3 text-sm font-bold transition shadow-sm ${
                !form.photo
                  ? 'bg-sage-300 text-sage-600 cursor-not-allowed border border-sage-300'
                  : 'bg-sage-900 text-white hover:bg-sage-700 active:scale-98'
              }`}
              title={!form.photo ? 'Please attach a photo using Camera or Upload to register your complaint' : 'Submit complaint'}
            >
              {!form.photo
                ? '📸 Attach photo to register complaint'
                : submitting
                ? 'Submitting complaint...'
                : 'Submit complaint'}
            </button>
            {!form.photo && (
              <p className="mt-2 text-center text-xs font-semibold text-amber-800">
                * Complaints cannot be registered without attaching a photo of the waste issue.
              </p>
            )}
          </form>

          {/* Interactive Map */}
          <div className="rounded-xl border border-sage-300/80 bg-white/55 p-5 shadow-sm backdrop-blur-sm">
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-sage-900">Your Location</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                    locationType === 'gps'
                      ? 'bg-green-100 text-green-800'
                      : locationType === 'ip'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-sage-100 text-sage-800'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current"></span>
                  {locationStatus}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-sage-800">
                Click anywhere on the map or drag the pin to set the exact waste location.
              </p>
            </div>

            <div className="relative min-h-[390px] overflow-hidden rounded-lg border border-sage-300">
              <MapContainer
                center={[form.lat, form.lng]}
                zoom={14}
                scrollWheelZoom={true}
                className="h-[390px] w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapCenter position={[form.lat, form.lng]} />
                <MapClickHandler onMapClick={handleMapClick} />
                <Marker
                  ref={markerRef}
                  position={[form.lat, form.lng]}
                  icon={locationIcon}
                  draggable={true}
                  eventHandlers={{
                    dragend() {
                      const marker = markerRef.current;
                      if (marker != null) {
                        const { lat, lng } = marker.getLatLng();
                        handleMapClick(lat, lng);
                      }
                    },
                  }}
                >
                  <Popup>
                    <div className="p-1 text-xs">
                      <p className="font-bold text-sage-900">Selected Location</p>
                      <p className="mt-1 text-text-secondary">
                        {form.address || `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`}
                      </p>
                      <p className="mt-1 text-[10px] text-forest">💡 Drag pin or click map to move</p>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>

              {/* Coordinates overlay badge */}
              <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-md bg-white/95 px-3 py-1.5 text-xs font-semibold text-sage-900 shadow">
                <span>📍</span>
                <span>{form.lat.toFixed(5)}, {form.lng.toFixed(5)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={acquireRealLocation}
                disabled={isLocating}
                className="text-xs font-bold text-sage-700 hover:text-sage-900"
              >
                🔄 Refresh real location
              </button>
              <span className="text-[11px] text-text-muted">OpenStreetMap Live Tiles</span>
            </div>
          </div>
        </section>

        {/* Tracking */}
        <section ref={trackSectionRef} className="mt-4 rounded-xl border border-sage-300/80 bg-white/65 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-sage-900">Track a request</h2>
              <p className="mt-1 text-xs font-medium text-sage-800">
                Enter your ticket ID or choose from your complaints below to see the latest service update.
              </p>
            </div>
            <form onSubmit={trackRequest} className="flex w-full gap-2 sm:w-auto">
              <input
                required
                value={trackingId}
                onChange={(event) => setTrackingId(event.target.value)}
                placeholder="ECO-2026-XXXXXX"
                className="min-w-0 flex-1 rounded-lg border border-sage-300 bg-white/70 px-3 py-2 text-sm font-bold text-sage-900 sm:w-52"
              />
              <button className="rounded-lg bg-sage-900 px-3 py-2 text-xs font-bold text-white">Track</button>
            </form>
          </div>
          {activeRequest && (
            <>
              <Timeline activeStep={activeStep} />
              {/* Active Ticket Details Card */}
              <div className="mt-4 rounded-lg border border-sage-300 bg-white/90 p-4 text-xs shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sage-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sage-900">Tracking Ticket:</span>
                    <span className="font-mono font-bold text-forest text-sm">{activeRequest.ticketId}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGES[activeRequest.status]?.bg || 'bg-sage-100 text-sage-800'}`}>
                      {STATUS_BADGES[activeRequest.status]?.label || activeRequest.status}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${activeRequest.isSmartBin ? 'bg-mint text-forest border border-sage-400' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                      {activeRequest.isSmartBin ? '⚡ Smart Dustbin' : '📍 Non-Smart Dustbin'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-text-muted">{formatComplaintDate(activeRequest.timestamp)}</span>
                    <button
                      type="button"
                      onClick={() => { setTrackingResult(null); setTicket(null); setTrackingId(''); }}
                      className="rounded px-2 py-0.5 text-[11px] font-bold text-text-muted hover:bg-sage-100 hover:text-sage-900"
                      title="Clear tracked ticket"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted">Issue Type</div>
                    <div className="mt-0.5 font-bold text-sage-900">
                      {TYPE_CONFIG[activeRequest.requestType]?.icon} {TYPE_CONFIG[activeRequest.requestType]?.label || activeRequest.requestType}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted">Citizen Name</div>
                    <div className="mt-0.5 font-bold text-sage-900">
                      {activeRequest.citizenName} {activeRequest.contactNumber ? `(${activeRequest.contactNumber})` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted">Campus Zone</div>
                    <div className="mt-0.5 font-bold text-sage-900">📍 {activeRequest.zone}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-text-muted">Address / Landmark</div>
                    <div className="mt-0.5 truncate font-medium text-text-secondary" title={activeRequest.addressString}>
                      {activeRequest.addressString}
                    </div>
                  </div>
                </div>

                {activeRequest.photoUrl && (
                  <div className="mt-3 flex items-center gap-3 border-t border-sage-100 pt-3">
                    <span className="text-[11px] font-semibold text-text-muted">Attached Photo:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(activeRequest.photoUrl)}
                      className="group flex items-center gap-2 text-xs font-bold text-forest hover:underline"
                    >
                      <img src={activeRequest.photoUrl} alt="Complaint attachment" className="h-8 w-8 rounded object-cover border border-sage-300" />
                      <span>View photo</span>
                    </button>
                  </div>
                )}
                {activeRequest.status === 'resolved' && (
                  <div className="mt-3 rounded-xl border border-emerald-400 bg-emerald-50/95 p-4 shadow-sm animate-in fade-in zoom-in-95">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">🎉</span>
                      <div>
                        <div className="font-black text-emerald-950 text-sm">
                          Waste Cleanup Successfully Resolved & Verified!
                        </div>
                        <div className="mt-1 text-xs font-medium text-emerald-900 leading-relaxed">
                          Your municipal waste complaint has been addressed by the assigned collection team and officially verified by the Municipal Administrator. Thank you for reporting and keeping our city clean!
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Complaints List Section - My Complaints Only */}
        <section className="mt-6 rounded-xl border border-sage-300/80 bg-white/65 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-sage-900">My Complaints & Service Requests</h2>
                <span className="rounded-full bg-forest px-2.5 py-0.5 text-xs font-bold text-white">
                  {filteredComplaints.length}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-sage-800">
                Track status updates and resolution progress for issues submitted by you.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadComplaints}
                disabled={loadingComplaints}
                className="flex items-center gap-1 rounded-lg border border-sage-300 bg-white/80 px-3 py-1.5 text-xs font-bold text-sage-800 hover:bg-white hover:text-sage-900 disabled:opacity-50"
                title="Refresh complaints list"
              >
                <span>🔄</span>
                <span>{loadingComplaints ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search ticket ID, name, address, or zone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-sage-300 bg-white/80 pl-8 pr-8 py-2 text-xs font-medium text-sage-900 placeholder:text-sage-600 focus:border-sage-700 focus:outline-none"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-sage-600">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-sage-600 hover:text-sage-900"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-sage-300 bg-white/80 px-3 py-2 text-xs font-bold text-sage-900 focus:border-sage-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">1. Complaint filed</option>
              <option value="verified">2. Verified</option>
              <option value="dispatched">3. Assigned to fleet</option>
              <option value="resolved">4. Resolved</option>
            </select>
          </div>

          {/* Complaints Table/Cards */}
          {loadingComplaints ? (
            <div className="mt-6 flex flex-col items-center justify-center py-12 text-sage-800">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage-300 border-t-forest" />
              <p className="mt-2 text-xs font-semibold">Loading complaints list...</p>
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-sage-300 bg-sage-50/50 p-8 text-center">
              <span className="text-2xl">📋</span>
              <h3 className="mt-2 text-sm font-bold text-sage-900">
                No complaints filed yet by you
              </h3>
              <p className="mt-1 text-xs text-sage-700">
                Submit a complaint using the form above to track your issues here. Only your own complaints are displayed.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {filteredComplaints.map((item) => {
                const isCurrentlyActive = activeRequest?.ticketId === item.ticketId;
                const typeInfo = TYPE_CONFIG[item.requestType] || { label: item.requestType, icon: '📌' };
                const statusInfo = STATUS_BADGES[item.status] || { label: item.status, bg: 'bg-sage-100 text-sage-800 border-sage-300' };

                return (
                  <div
                    key={item.ticketId}
                    className={`rounded-xl border p-4 transition-all ${
                      isCurrentlyActive
                        ? 'border-forest bg-mint/30 shadow-md ring-1 ring-forest/30'
                        : 'border-sage-300/90 bg-white/80 hover:border-sage-500 hover:bg-white hover:shadow-xs'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left Header info */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-forest bg-sage-50 px-2 py-1 rounded border border-sage-200">
                          {item.ticketId}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyTicketId(item.ticketId)}
                          className="text-[11px] font-semibold text-text-muted hover:text-forest transition-colors"
                          title="Copy ticket ID"
                        >
                          {copiedId === item.ticketId ? '✓ Copied' : '📋 Copy'}
                        </button>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusInfo.bg}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {statusInfo.label}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${item.isSmartBin ? 'bg-mint text-forest border border-sage-400' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                          {item.isSmartBin ? '⚡ Smart Dustbin' : '📍 Non-Smart Dustbin'}
                        </span>
                        <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-bold text-forest border border-forest/20">
                          Your Request
                        </span>
                      </div>

                      {/* Right Date & Track button */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-medium text-text-muted">
                          {formatComplaintDate(item.timestamp)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSelectComplaint(item)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                            isCurrentlyActive
                              ? 'bg-forest text-white shadow-xs'
                              : 'bg-sage-900 text-white hover:bg-sage-700'
                          }`}
                        >
                          {isCurrentlyActive ? '✓ Tracking' : 'Track →'}
                        </button>
                      </div>
                    </div>

                    {/* Complaint Details Grid */}
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <span className="text-[11px] text-text-muted">Issue: </span>
                        <span className="font-bold text-sage-900">
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-text-muted">Citizen: </span>
                        <span className="font-semibold text-sage-900">{item.citizenName}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-text-muted">Zone: </span>
                        <span className="font-semibold text-sage-900">📍 {item.zone}</span>
                      </div>
                      <div className="truncate" title={item.addressString}>
                        <span className="text-[11px] text-text-muted">Location: </span>
                        <span className="font-medium text-text-secondary">{item.addressString}</span>
                      </div>
                    </div>

                    {/* Photo thumbnail if present */}
                    {item.photoUrl && (
                      <div className="mt-2.5 flex items-center gap-2 border-t border-sage-100 pt-2 text-xs">
                        <span className="text-[11px] text-text-muted">Attached image:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(item.photoUrl)}
                          className="flex items-center gap-1.5 font-bold text-forest hover:underline"
                        >
                          <img src={item.photoUrl} alt="Attached" className="h-6 w-6 rounded object-cover border border-sage-300" />
                          <span className="text-[11px]">View attached photo</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Modal for full photo preview */}
        {selectedPhoto && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
            onClick={() => setSelectedPhoto(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-xl bg-white p-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-sage-200">
                <span className="text-xs font-bold text-sage-900">Attached Photo</span>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="rounded px-2 py-1 text-xs font-bold text-text-muted hover:bg-sage-100"
                >
                  ✕ Close
                </button>
              </div>
              <img src={selectedPhoto} alt="Full preview" className="mt-2 max-h-[75vh] w-auto rounded object-contain" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Sub-component to re-center map when position changes
function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true });
  }, [map, position]);
  return null;
}

// Sub-component to capture clicks anywhere on the Leaflet map
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Timeline({ activeStep }) {
  return (
    <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-1.5">
      {STEPS.map(([id, label], index) => (
        <div
          key={id}
          className={`border-t-4 p-3 ${
            index <= activeStep ? 'border-sage-700 bg-mint/60' : 'border-amber-300 bg-warning-muted/55'
          }`}
        >
          <div className="text-xs font-bold text-sage-900">{index + 1}. {label}</div>
          <div className="mt-1 text-[11px] font-semibold text-sage-800">
            {index < activeStep ? 'Complete' : index === activeStep ? 'Current status' : 'Pending'}
          </div>
        </div>
      ))}
    </div>
  );
}

function fileToDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
