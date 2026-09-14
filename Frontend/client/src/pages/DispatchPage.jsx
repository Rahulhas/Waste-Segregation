import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import { calculateShortestRoadRoute } from '../lib/osrmRouting';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Initial Central Fleet Depot
const FLEET_DEPOT = {
  id: 'DEPOT-01',
  name: 'Central Fleet Operations Depot',
  zone: 'Central Ward',
  lat: 15.3625,
  lng: 75.1205,
  address: 'North District Fleet Operations Base',
};

// Initial scheduled bin route stops in the district
const INITIAL_BINS = [
  { id: 'BIN-204', zone: 'North Market', fill: 96, type: 'Mixed waste', eta: '08:20', status: 'Urgent', lat: 15.3647, lng: 75.1240, address: 'North Market Loop, Sector 4' },
  { id: 'BIN-118', zone: 'Lakeview Ward', fill: 91, type: 'Organic', eta: '08:35', status: 'Priority', lat: 15.3712, lng: 75.1190, address: 'Lakeview Promenade Gate 2' },
  { id: 'BIN-067', zone: 'Civic Centre', fill: 86, type: 'Recyclables', eta: '08:50', status: 'Priority', lat: 15.3670, lng: 75.1310, address: 'Civic Plaza East Stand' },
  { id: 'BIN-311', zone: 'East Campus', fill: 83, type: 'Paper', eta: '09:10', status: 'Queued', lat: 15.3750, lng: 75.1280, address: 'East Campus Academic Block 3' },
];

const AUDIT_ITEMS = [
  'Organic waste is separated',
  'Recyclables are free of food residue',
  'Bin area is clear and accessible',
];

const COMPLAINT_TYPE_CONFIG = {
  overflow: { label: 'Overflowing bin', icon: '🗑️' },
  missed_pickup: { label: 'Missed pickup', icon: '🚛' },
  damaged_bin: { label: 'Damaged bin', icon: '⚠️' },
  bulk_ewaste: { label: 'Bulk e-waste', icon: '🔋' },
};

function fileToDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Marker Icons
function createComplaintIcon(ticket, isSelected = false, stopIndex = null) {
  const isResolved = ticket.status === 'resolved';

  if (isResolved) {
    return L.divIcon({
      className: 'custom-dispatch-marker',
      html: `
        <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
          <div class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white font-black text-xs shadow-md border-2 border-white ${isSelected ? 'ring-4 ring-emerald-300 scale-125' : ''}">
            ✓
          </div>
          <span class="absolute -bottom-4 whitespace-nowrap rounded bg-emerald-900/90 px-1.5 py-0.2 text-[9px] font-bold text-white shadow">
            Collected
          </span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }

  // Active / Unresolved RED STOP MARKER
  return L.divIcon({
    className: 'custom-dispatch-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
        <span class="animate-ping absolute inline-flex h-9 w-9 rounded-full bg-red-500 opacity-75"></span>
        <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white font-bold text-xs shadow-xl border-2 border-white ${isSelected ? 'ring-4 ring-red-300 scale-125' : ''}">
          ${stopIndex !== null ? stopIndex : '🛑'}
        </div>
        <span class="absolute -top-2.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-slate-900 shadow">
          !
        </span>
        <span class="absolute -bottom-4 whitespace-nowrap rounded bg-red-950/95 px-1.5 py-0.5 text-[9px] font-black text-red-100 shadow border border-red-500/50 tracking-tight">
          RED STOP
        </span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function createBinIcon(bin, index, isSelected = false, isCollected = false) {
  if (isCollected) {
    return L.divIcon({
      className: 'custom-dispatch-marker',
      html: `
        <div class="flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-white font-bold text-[10px] shadow border-2 border-white opacity-80 cursor-pointer">
          ✓
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
    });
  }

  const isUrgent = bin.fill >= 90;
  return L.divIcon({
    className: 'custom-dispatch-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
        <div class="flex h-7 w-7 items-center justify-center rounded-full ${isUrgent ? 'bg-amber-600' : 'bg-sage-800'} text-white font-bold text-xs shadow-lg border-2 border-white ${isSelected ? 'ring-4 ring-sage-400 scale-125' : ''}">
          ${index + 1}
        </div>
        <span class="absolute -bottom-3.5 whitespace-nowrap rounded bg-sage-900/90 px-1 text-[9px] font-bold text-white shadow">
          ${bin.fill}%
        </span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function createDepotIcon(isGps = false) {
  return L.divIcon({
    className: 'custom-dispatch-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110">
        ${isGps ? '<span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-blue-500 opacity-60"></span>' : ''}
        <div class="relative flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-white text-base shadow-xl border-2 border-white ring-3 ring-blue-300">
          🚛
        </div>
        <span class="absolute -bottom-4 whitespace-nowrap rounded bg-blue-950/90 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow border border-blue-400/30">
          ${isGps ? 'Driver GPS' : 'Fleet Depot'}
        </span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// Auto-bounds adjuster component
function MapAutoBounds({ points }) {
  const map = useMap();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!points || points.length === 0) return;
    const valid = points.filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (valid.length === 0) return;

    if (!hasInitialized.current) {
      try {
        if (valid.length === 1) {
          map.setView(valid[0], 14);
        } else {
          const bounds = L.latLngBounds(valid);
          map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
        }
        hasInitialized.current = true;
      } catch (err) {
        console.warn('Map fitBounds error:', err);
      }
    }
  }, [points, map]);

  return null;
}

// Smooth fly-to controller
function MapFlyController({ targetCoords }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords && Number.isFinite(targetCoords[0]) && Number.isFinite(targetCoords[1])) {
      map.flyTo(targetCoords, 15, { duration: 0.8 });
    }
  }, [targetCoords, map]);
  return null;
}

export default function DispatchPage() {
  const [bins, setBins] = useState(INITIAL_BINS);
  const [collectedBinIds, setCollectedBinIds] = useState(() => {
    try {
      const saved = localStorage.getItem('ecocampus_collected_bins');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedBinId, setSelectedBinId] = useState(null);

  const [citizenTickets, setCitizenTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [proofPhoto, setProofPhoto] = useState(null);
  const [resolvingTicketId, setResolvingTicketId] = useState(null);

  // Mandatory photo proof states for collections
  const [binProofPhotos, setBinProofPhotos] = useState(() => {
    try {
      const saved = localStorage.getItem('ecocampus_bin_proof_photos');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [pendingBinPhotos, setPendingBinPhotos] = useState({});
  const [pendingTicketPhotos, setPendingTicketPhotos] = useState({});

  useEffect(() => {
    try {
      localStorage.setItem('ecocampus_collected_bins', JSON.stringify(collectedBinIds));
    } catch (e) {
      console.warn(e);
    }
  }, [collectedBinIds]);

  useEffect(() => {
    try {
      localStorage.setItem('ecocampus_bin_proof_photos', JSON.stringify(binProofPhotos));
    } catch (e) {
      console.warn(e);
    }
  }, [binProofPhotos]);

  // Fleet Depot / Driver Location State
  const [driverLocation, setDriverLocation] = useState(FLEET_DEPOT);
  const [isAcquiringGps, setIsAcquiringGps] = useState(false);

  // Real-Road Routing State (OSRM Engine)
  const [roadPath, setRoadPath] = useState([]);
  const [routeStats, setRouteStats] = useState({
    distanceKm: 0,
    durationMin: 0,
    isRealRoad: true,
    turnSteps: [],
    googleMapsUrl: '',
  });
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [showTurnSteps, setShowTurnSteps] = useState(false);
  const [zoneFilter, setZoneFilter] = useState('all');

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'complaints' | 'bins'
  const [showResolved, setShowResolved] = useState(false);
  const [notification, setNotification] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Audit state
  const [auditBinId, setAuditBinId] = useState(null);
  const [auditChecks, setAuditChecks] = useState([]);
  const [auditSaved, setAuditSaved] = useState(false);
  const [auditedBinIds, setAuditedBinIds] = useState([]);

  // Fetch live citizen complaints from backend DB
  async function fetchComplaints() {
    setLoadingTickets(true);
    try {
      const res = await api.citizenRequests();
      if (res && res.requests) {
        setCitizenTickets(res.requests);
      }
    } catch (err) {
      console.warn('Failed to load citizen complaints:', err);
    } finally {
      setLoadingTickets(false);
    }
  }

  useEffect(() => {
    fetchComplaints();
    const interval = setInterval(fetchComplaints, 20000);
    return () => clearInterval(interval);
  }, []);

  function showToast(msg, type = 'success') {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }

  // Active (uncollected) bins and active (unresolved) complaints
  const activeBins = useMemo(() => {
    return bins.filter(b => {
      if (collectedBinIds.includes(b.id)) return false;
      if (zoneFilter !== 'all' && b.zone !== zoneFilter) return false;
      return true;
    });
  }, [bins, collectedBinIds, zoneFilter]);

  const activeComplaints = useMemo(() => {
    return citizenTickets.filter(t => {
      if (t.status === 'resolved') return false;
      if (zoneFilter !== 'all' && t.zone !== zoneFilter) return false;
      return true;
    });
  }, [citizenTickets, zoneFilter]);

  const resolvedComplaints = useMemo(() => citizenTickets.filter(t => t.status === 'resolved'), [citizenTickets]);
  const collectedBins = useMemo(() => bins.filter(b => collectedBinIds.includes(b.id)), [bins, collectedBinIds]);

  const totalRemainingStops = activeBins.length + activeComplaints.length;

  // Selected stop data
  const selectedBin = bins.find(b => b.id === selectedBinId);
  const selectedTicket = citizenTickets.find(t => t.ticketId === selectedTicketId);
  const auditBin = bins.find(b => b.id === auditBinId);

  // Target coordinates for smooth pan
  const targetCoords = useMemo(() => {
    if (selectedTicket) {
      const lat = Number(selectedTicket.latitude ?? selectedTicket.location?.lat);
      const lng = Number(selectedTicket.longitude ?? selectedTicket.location?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    if (selectedBin) {
      return [selectedBin.lat, selectedBin.lng];
    }
    return null;
  }, [selectedTicket, selectedBin]);

  // Points array for map bounds (includes depot, bins, and complaints)
  const allMapPoints = useMemo(() => {
    const points = [[driverLocation.lat, driverLocation.lng]];
    activeBins.forEach(b => points.push([b.lat, b.lng]));
    activeComplaints.forEach(t => {
      const lat = Number(t.latitude ?? t.location?.lat);
      const lng = Number(t.longitude ?? t.location?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng]);
    });
    return points;
  }, [driverLocation, activeBins, activeComplaints]);

  const defaultCenter = useMemo(() => {
    return [driverLocation.lat, driverLocation.lng];
  }, [driverLocation]);

  // ---------------------------------------------------------------------------
  // REAL-ROAD SHORTEST PATH ROUTING (OSRM ENGINE)
  // Computes the genuine road geometry along actual streets and optimal TSP sequence
  // ---------------------------------------------------------------------------
  const calculateRealRoadRoute = useCallback(async () => {
    const stopsToRoute = [];

    // Collect active bins
    activeBins.forEach(b => {
      stopsToRoute.push({
        id: b.id,
        name: `${b.id} (${b.zone})`,
        lat: b.lat,
        lng: b.lng,
        type: 'bin',
      });
    });

    // Collect active citizen red stops
    activeComplaints.forEach(t => {
      const lat = Number(t.latitude ?? t.location?.lat);
      const lng = Number(t.longitude ?? t.location?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        stopsToRoute.push({
          id: t.ticketId,
          name: `RED STOP ${t.ticketId}`,
          lat,
          lng,
          type: 'complaint',
        });
      }
    });

    if (stopsToRoute.length === 0) {
      setRoadPath([]);
      setRouteStats({ distanceKm: 0, durationMin: 0, isRealRoad: true, turnSteps: [], googleMapsUrl: '' });
      return;
    }

    setIsCalculatingRoute(true);
    try {
      const result = await calculateShortestRoadRoute(stopsToRoute, {
        startPoint: driverLocation,
        optimizeOrder: true,
      });

      setRoadPath(result.roadPath);
      setRouteStats({
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
        isRealRoad: result.isRealRoad,
        turnSteps: result.turnSteps,
        googleMapsUrl: result.googleMapsUrl,
      });
    } catch (err) {
      console.warn('Real-road route calculation error:', err);
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [activeBins, activeComplaints, driverLocation]);

  // Automatically recalculate real-road path whenever active stops or driver location change
  useEffect(() => {
    calculateRealRoadRoute();
  }, [calculateRealRoadRoute]);

  // Acquire Driver live GPS Location
  function handleAcquireLiveGps() {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }
    setIsAcquiringGps(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setDriverLocation({
          id: 'DRIVER-GPS',
          name: 'Driver 04 (Live Vehicle GPS)',
          zone: 'Field',
          lat: latitude,
          lng: longitude,
          address: 'Current Live Position',
          isGps: true,
        });
        setIsAcquiringGps(false);
        showToast('Acquired live driver GPS coordinates!');
      },
      err => {
        console.warn('GPS error:', err);
        setIsAcquiringGps(false);
        showToast('Could not acquire GPS: using Central Depot base', 'error');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }

  // Reset to Fleet Depot
  function handleResetToDepot() {
    setDriverLocation(FLEET_DEPOT);
    showToast('Reset route start to Central Fleet Depot.');
  }

  // Photo handlers for bin and red-stop proof
  async function handleBinPhotoSelect(binId, file) {
    if (!file) return;
    try {
      const previewUrl = await fileToDataUrl(file);
      setPendingBinPhotos(prev => ({
        ...prev,
        [binId]: { file, previewUrl },
      }));
      showToast(`📸 Photo attached for Bin ${binId}! Click "Mark Collected" to confirm.`);
    } catch (err) {
      console.error('Error loading bin photo:', err);
      showToast('Failed to load image preview', 'error');
    }
  }

  function handleRemoveBinPhoto(binId) {
    setPendingBinPhotos(prev => {
      const next = { ...prev };
      delete next[binId];
      return next;
    });
  }

  async function handleTicketPhotoSelect(ticketId, file) {
    if (!file) return;
    try {
      const previewUrl = await fileToDataUrl(file);
      setPendingTicketPhotos(prev => ({
        ...prev,
        [ticketId]: { file, previewUrl },
      }));
      setProofPhoto(file);
      showToast(`📸 Photo attached for Stop ${ticketId}! Click "Collect" to proceed.`);
    } catch (err) {
      console.error('Error loading ticket photo:', err);
      showToast('Failed to load image preview', 'error');
    }
  }

  function handleRemoveTicketPhoto(ticketId) {
    setPendingTicketPhotos(prev => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
    setProofPhoto(null);
  }

  // Mark scheduled bin collected - strictly requires photo proof!
  function handleCollectBin(binId) {
    const pending = pendingBinPhotos[binId];
    if (!pending || !pending.previewUrl) {
      showToast(`⚠️ Photo proof required! Please take or upload a photo of bin ${binId} first.`, 'error');
      return;
    }

    setBinProofPhotos(prev => ({
      ...prev,
      [binId]: pending.previewUrl,
    }));
    handleRemoveBinPhoto(binId);

    setCollectedBinIds(prev => (prev.includes(binId) ? prev : [...prev, binId]));
    if (selectedBinId === binId) {
      setSelectedBinId(null);
    }
    showToast(`✓ Bin ${binId} collected with photo proof! Road route updated.`);
  }

  // Driver submits cleanup photo proof (transitions to pickup_done for Admin verification)
  async function handleResolveComplaint(ticketId, photoFile = null) {
    const file = photoFile || pendingTicketPhotos[ticketId]?.file || proofPhoto;
    const existingDataUrl = pendingTicketPhotos[ticketId]?.previewUrl;

    if (!file && !existingDataUrl) {
      showToast(`⚠️ Cleanup photo required! Please attach proof of cleaned stop ${ticketId}.`, 'error');
      return;
    }

    setResolvingTicketId(ticketId);
    try {
      const driverProofPhotoUrl = existingDataUrl || (await fileToDataUrl(file));

      await api.uploadPickupProof(ticketId, driverProofPhotoUrl).catch(() => {
        return api.updateCitizenRequestStatus(ticketId, {
          status: 'pickup_done',
          driverProofPhotoUrl,
        });
      });

      // Optimistically update local ticket status
      setCitizenTickets(prev =>
        prev.map(t => (t.ticketId === ticketId ? { ...t, status: 'pickup_done', driverProofPhotoUrl } : t))
      );

      handleRemoveTicketPhoto(ticketId);
      showToast(`📸 Cleanup photo uploaded! Ticket ${ticketId} sent to Admin for verification.`);
      setProofPhoto(null);
      if (selectedTicketId === ticketId) {
        setSelectedTicketId(null);
      }
    } catch (err) {
      console.error('Resolve error:', err);
      showToast(err.message || 'Failed to submit cleanup proof', 'error');
    } finally {
      setResolvingTicketId(null);
    }
  }

  // Audit handlers
  function openAudit(binId) {
    setAuditBinId(binId);
    setAuditChecks([]);
    setAuditSaved(false);
  }

  function toggleAuditItem(item) {
    setAuditChecks(current =>
      current.includes(item) ? current.filter(checked => checked !== item) : [...current, item]
    );
    setAuditSaved(false);
  }

  // Distinct Zones
  const availableZones = useMemo(() => {
    const zones = new Set();
    bins.forEach(b => zones.add(b.zone));
    citizenTickets.forEach(t => t.zone && zones.add(t.zone));
    return ['all', ...Array.from(zones)];
  }, [bins, citizenTickets]);

  return (
    <div className="mx-auto max-w-[1700px] p-4 sm:p-6">
      {/* Toast notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-xl backdrop-blur-md transition-all ${
            notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-700 text-white'
          }`}
        >
          <span>{notification.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-sage-900">Driver & Fleet Dispatch</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
              Real-Road Shortest Path (OSRM)
            </span>
          </div>
          <p className="mt-1 text-sm text-sage-800">
            Real street navigation routing · Traveling Salesperson shortest path optimization · Live emergency red stops
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Zone filter */}
          <select
            value={zoneFilter}
            onChange={e => setZoneFilter(e.target.value)}
            className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 text-xs font-bold text-sage-800 shadow-sm outline-none hover:border-sage-400"
          >
            {availableZones.map(z => (
              <option key={z} value={z}>
                {z === 'all' ? 'All District Zones' : `Zone: ${z}`}
              </option>
            ))}
          </select>

          {/* GPS start toggle */}
          <button
            type="button"
            onClick={driverLocation.isGps ? handleResetToDepot : handleAcquireLiveGps}
            disabled={isAcquiringGps}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm transition ${
              driverLocation.isGps
                ? 'border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-100'
                : 'border-sage-300 bg-white text-sage-800 hover:bg-sage-50'
            }`}
          >
            <span>{isAcquiringGps ? '⏳' : driverLocation.isGps ? '📍' : '📡'}</span>
            {isAcquiringGps ? 'Locating...' : driverLocation.isGps ? 'Using Live GPS (Reset)' : 'Use Live Driver GPS'}
          </button>

          {/* Refresh complaints button */}
          <button
            type="button"
            onClick={() => {
              fetchComplaints();
              calculateRealRoadRoute();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-sage-300 bg-white/80 px-3 py-1.5 text-xs font-bold text-sage-800 shadow-sm transition hover:bg-white"
            title="Refresh complaints & recalculate shortest route"
          >
            <span className={loadingTickets || isCalculatingRoute ? 'animate-spin' : ''}>🔄</span>
            Recalculate
          </button>

          {/* Total Stops Badge */}
          <div className="rounded-full border border-sage-300 bg-white/90 px-4 py-1.5 text-xs font-bold text-sage-900 shadow-sm backdrop-blur-sm">
            <span className="text-red-600 font-extrabold">{totalRemainingStops}</span> stops remaining
            <span className="ml-1 text-[11px] font-normal text-sage-600">
              ({activeBins.length} bins + {activeComplaints.length} red stops)
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left Column: Optimal Route Sequence Queue */}
        <section className="flex flex-col rounded-xl border border-sage-300/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm lg:col-span-4">
          {/* Header & Tabs */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sage-900">Optimal route sequence</h2>
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-900">
                  Shortest Path
                </span>
              </div>
              <p className="text-xs font-medium text-sage-700">Follow in sequence for lowest fuel & time</p>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-sage-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={e => setShowResolved(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[#145c43]"
              />
              History ({collectedBins.length + resolvedComplaints.length})
            </label>
          </div>

          {/* Filter Tabs */}
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-sage-300 bg-white/50 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-md py-1.5 transition ${
                activeTab === 'all' ? 'bg-sage-900 text-white shadow-sm' : 'text-sage-700 hover:bg-sage-100'
              }`}
            >
              All ({totalRemainingStops})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('complaints')}
              className={`flex items-center justify-center gap-1 rounded-md py-1.5 transition ${
                activeTab === 'complaints' ? 'bg-red-600 text-white shadow-sm' : 'text-red-700 hover:bg-red-50'
              }`}
            >
              <span>🛑</span> Red Stops ({activeComplaints.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bins')}
              className={`rounded-md py-1.5 transition ${
                activeTab === 'bins' ? 'bg-sage-700 text-white shadow-sm' : 'text-sage-700 hover:bg-sage-100'
              }`}
            >
              Bins ({activeBins.length})
            </button>
          </div>

          {/* Start Point Card */}
          <div className="mb-2.5 rounded-xl border border-blue-200 bg-blue-50/60 p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                  🚛
                </span>
                <div>
                  <div className="font-extrabold text-blue-950">
                    Route Origin: {driverLocation.name}
                  </div>
                  <div className="text-[11px] text-blue-800">{driverLocation.address}</div>
                </div>
              </div>
              <span className="rounded bg-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-900">
                Start Point
              </span>
            </div>
          </div>

          {/* Stops List */}
          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[520px] pr-1">
            {/* Citizen Complaints (Red Stops) */}
            {(activeTab === 'all' || activeTab === 'complaints') && (
              <>
                {activeComplaints.map((ticket, idx) => {
                  const isSelected = selectedTicketId === ticket.ticketId;
                  const config = COMPLAINT_TYPE_CONFIG[ticket.requestType] || { label: ticket.requestType, icon: '📍' };
                  return (
                    <div
                      key={ticket.ticketId}
                      className={`relative rounded-xl border p-3 transition-all ${
                        isSelected
                          ? 'border-red-600 bg-red-50/95 shadow-md ring-2 ring-red-400'
                          : 'border-red-200 bg-red-50/40 hover:border-red-400 hover:bg-red-50/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTicketId(ticket.ticketId);
                            setSelectedBinId(null);
                          }}
                          className="text-left flex-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] text-white font-bold shadow">
                              🛑
                            </span>
                            <span className="font-extrabold text-xs text-red-700 tracking-wide">
                              RED STOP · {ticket.ticketId}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-bold text-sage-900">
                            {config.icon} {config.label}
                          </div>
                          <div className="text-[11px] font-medium text-sage-700 line-clamp-1">
                            {ticket.addressString || ticket.location?.address_string}
                          </div>
                          <div className="mt-1 text-[11px] text-sage-600 font-medium">
                            Citizen: <span className="font-semibold text-sage-900">{ticket.citizenName}</span>
                            {ticket.contactNumber && ` · 📞 ${ticket.contactNumber}`}
                          </div>
                        </button>

                        <div className="flex flex-col items-end gap-1.5">
                          <span className="rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-extrabold uppercase text-red-900">
                            {ticket.status}
                          </span>
                        </div>
                      </div>

                      {ticket.photoUrl && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto(ticket.photoUrl)}
                            className="text-[11px] font-bold text-sage-800 underline hover:text-sage-950 flex items-center gap-1"
                          >
                            📷 View Citizen Photo
                          </button>
                        </div>
                      )}

                      {/* Photo verification requirement before collection */}
                      <div className="mt-2.5 pt-2 border-t border-red-200/80 flex flex-wrap items-center justify-between gap-2">
                        {pendingTicketPhotos[ticket.ticketId] ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={pendingTicketPhotos[ticket.ticketId].previewUrl}
                              alt={`Proof for ${ticket.ticketId}`}
                              className="h-8 w-8 rounded object-cover border border-emerald-400 shadow-sm cursor-pointer"
                              onClick={() => setPreviewPhoto(pendingTicketPhotos[ticket.ticketId].previewUrl)}
                              title="Click to view full preview"
                            />
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                                ✓ Photo ready
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTicketPhoto(ticket.ticketId)}
                                className="text-[10px] font-semibold text-red-600 hover:underline text-left"
                              >
                                ✕ Retake
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="inline-flex items-center gap-1 cursor-pointer rounded-lg border border-dashed border-red-400 bg-red-50 hover:bg-red-100/80 px-2.5 py-1 text-[11px] font-bold text-red-800 transition">
                            <span>📷</span>
                            <span>Upload Cleanup Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => handleTicketPhotoSelect(ticket.ticketId, e.target.files?.[0])}
                            />
                          </label>
                        )}

                        <button
                          type="button"
                          disabled={resolvingTicketId === ticket.ticketId || !pendingTicketPhotos[ticket.ticketId]}
                          onClick={() => handleResolveComplaint(ticket.ticketId)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition shadow-sm ${
                            pendingTicketPhotos[ticket.ticketId]
                              ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer ring-2 ring-emerald-400/50'
                              : 'bg-sage-200 text-sage-500 cursor-not-allowed border border-sage-300'
                          }`}
                          title={!pendingTicketPhotos[ticket.ticketId] ? 'Attach cleanup photo to enable collection' : 'Click to collect and submit proof'}
                        >
                          {resolvingTicketId === ticket.ticketId
                            ? 'Uploading...'
                            : pendingTicketPhotos[ticket.ticketId]
                            ? '✓ Collect'
                            : '🔒 Upload photo to collect'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Scheduled Bins */}
            {(activeTab === 'all' || activeTab === 'bins') && (
              <>
                {activeBins.map((bin, index) => {
                  const isSelected = selectedBinId === bin.id;
                  const isUrgent = bin.fill >= 90;
                  return (
                    <div
                      key={bin.id}
                      className={`rounded-xl border p-3 transition-all ${
                        isSelected
                          ? 'border-sage-700 bg-sage-100/90 shadow-md ring-2 ring-sage-400'
                          : 'border-sage-200 bg-white/60 hover:border-sage-400 hover:bg-sage-50/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBinId(bin.id);
                            setSelectedTicketId(null);
                          }}
                          className="text-left flex-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sage-800 text-[10px] text-white font-bold">
                              {index + 1}
                            </span>
                            <span className="font-bold text-xs text-sage-900">{bin.id}</span>
                            <span className="text-[11px] font-semibold text-sage-700">· {bin.zone}</span>
                          </div>
                          <div className="mt-1 text-xs font-semibold text-sage-800">
                            {bin.type} · ETA {bin.eta}
                          </div>
                          <div className="text-[11px] text-sage-600">{bin.address}</div>
                        </button>

                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              isUrgent ? 'bg-alert text-white' : 'bg-mint text-sage-900'
                            }`}
                          >
                            {bin.status}
                          </span>
                        </div>
                      </div>

                      {/* Capacity Bar */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sage-200">
                          <div
                            className={`h-full rounded-full ${isUrgent ? 'bg-alert' : 'bg-sage-600'}`}
                            style={{ width: `${bin.fill}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-sage-900">{bin.fill}%</span>
                      </div>

                      {/* Photo verification requirement before collection */}
                      <div className="mt-2.5 pt-2 border-t border-sage-200/80 flex flex-wrap items-center justify-between gap-2">
                        {pendingBinPhotos[bin.id] ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={pendingBinPhotos[bin.id].previewUrl}
                              alt={`Proof for ${bin.id}`}
                              className="h-8 w-8 rounded object-cover border border-emerald-400 shadow-sm cursor-pointer"
                              onClick={() => setPreviewPhoto(pendingBinPhotos[bin.id].previewUrl)}
                              title="Click to view full preview"
                            />
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                                ✓ Photo ready
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBinPhoto(bin.id)}
                                className="text-[10px] font-semibold text-red-600 hover:underline text-left"
                              >
                                ✕ Retake
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="inline-flex items-center gap-1 cursor-pointer rounded-lg border border-dashed border-sage-400 bg-white/80 hover:bg-sage-100/80 px-2.5 py-1 text-[11px] font-bold text-sage-800 transition">
                            <span>📷</span>
                            <span>Upload Proof Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => handleBinPhotoSelect(bin.id, e.target.files?.[0])}
                            />
                          </label>
                        )}

                        <button
                          type="button"
                          disabled={!pendingBinPhotos[bin.id]}
                          onClick={() => handleCollectBin(bin.id)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition shadow-sm ${
                            pendingBinPhotos[bin.id]
                              ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer ring-2 ring-emerald-400/50'
                              : 'bg-sage-200 text-sage-500 cursor-not-allowed border border-sage-300'
                          }`}
                          title={!pendingBinPhotos[bin.id] ? 'Upload photo proof first to collect' : 'Click to mark collected'}
                        >
                          {pendingBinPhotos[bin.id] ? '✓ Mark Collected' : '🔒 Upload photo to collect'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Resolved / Collected stops when toggled */}
            {showResolved && (
              <div className="mt-4 border-t border-sage-200 pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sage-600">
                  Collected Stops (History)
                </div>
                {resolvedComplaints.map(ticket => (
                  <div
                    key={`res-${ticket.ticketId}`}
                    className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs opacity-85"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900">✓ {ticket.ticketId}</span>
                      <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                        Resolved
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-800 mt-0.5">{ticket.addressString}</div>
                    {ticket.driverProofPhotoUrl && (
                      <div className="mt-2 flex items-center gap-2 border-t border-emerald-200/60 pt-1.5">
                        <img
                          src={ticket.driverProofPhotoUrl}
                          alt={`Proof ${ticket.ticketId}`}
                          className="h-7 w-7 rounded object-cover border border-emerald-300 cursor-pointer"
                          onClick={() => setPreviewPhoto(ticket.driverProofPhotoUrl)}
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(ticket.driverProofPhotoUrl)}
                          className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                        >
                          📷 View Cleanup Proof
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {collectedBins.map(bin => {
                  const proof = binProofPhotos[bin.id];
                  return (
                    <div
                      key={`res-bin-${bin.id}`}
                      className="mb-2 rounded-lg border border-sage-200 bg-sage-50/80 p-2.5 text-xs shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sage-900">✓ {bin.id}</span>
                        <span className="rounded bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                          Collected
                        </span>
                      </div>
                      <div className="text-[11px] text-sage-700 mt-0.5">{bin.zone} · {bin.type}</div>
                      {proof && (
                        <div className="mt-2 flex items-center gap-2 border-t border-sage-200/80 pt-1.5">
                          <img
                            src={proof}
                            alt={`Proof ${bin.id}`}
                            className="h-7 w-7 rounded object-cover border border-sage-300 cursor-pointer"
                            onClick={() => setPreviewPhoto(proof)}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto(proof)}
                            className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                          >
                            📷 View Collection Proof
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {totalRemainingStops === 0 && !showResolved && (
              <div className="rounded-xl border border-dashed border-emerald-400 bg-emerald-50/60 p-8 text-center">
                <div className="text-3xl">🎉</div>
                <div className="mt-2 text-sm font-bold text-emerald-900">All stops dispatched & collected!</div>
                <p className="mt-1 text-xs text-emerald-700">No pending bins or citizen complaints in this shift.</p>
              </div>
            )}
          </div>
        </section>

        {/* Center Column: Interactive Real-Road Leaflet Map */}
        <section className="flex flex-col rounded-xl border border-sage-300/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm lg:col-span-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sage-900">Live collection route</h2>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-800 border border-red-300">
                  {activeComplaints.length} Red Stops
                </span>
                {isCalculatingRoute && (
                  <span className="text-[11px] text-sage-600 animate-pulse font-medium">
                    Tracing real roads...
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs font-medium text-sage-700">
                Driver 04 · Real-time OpenStreetMap with genuine road network tracing
              </p>
            </div>
            <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-sage-900 border border-sage-400/40">
              On schedule
            </span>
          </div>

          {/* Leaflet Map Container */}
          <div className="relative h-[430px] overflow-hidden rounded-xl border border-sage-300 shadow-inner">
            {/* Top Navigation HUD Card */}
            <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/90 bg-white/95 p-2.5 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-black text-sage-900">
                  <span className="text-base">🚗</span>
                  <span>{routeStats.distanceKm} km</span>
                  <span className="text-[11px] text-sage-600 font-normal">road distance</span>
                </div>
                <span className="text-sage-300">|</span>
                <div className="flex items-center gap-1.5 text-xs font-black text-sage-900">
                  <span className="text-base">⏱️</span>
                  <span>~{routeStats.durationMin} min</span>
                  <span className="text-[11px] text-sage-600 font-normal">drive time</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {routeStats.turnSteps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTurnSteps(prev => !prev)}
                    className="flex items-center gap-1 rounded-lg border border-sage-300 bg-sage-50 px-2.5 py-1 text-xs font-bold text-sage-800 hover:bg-sage-100 transition"
                  >
                    <span>📋</span>
                    {showTurnSteps ? 'Hide Turns' : `${routeStats.turnSteps.length} Turns`}
                  </button>
                )}

                {routeStats.googleMapsUrl && (
                  <a
                    href={routeStats.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg bg-sage-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-sage-700 shadow-sm transition"
                    title="Launch turn-by-turn navigation in Google Maps"
                  >
                    <span>🧭</span> Google Maps
                  </a>
                )}
              </div>
            </div>

            <MapContainer
              center={defaultCenter}
              zoom={13}
              className="h-full w-full"
              zoomControl={true}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Fit bounds automatically */}
              <MapAutoBounds points={allMapPoints} />

              {/* Fly to selected stop */}
              <MapFlyController targetCoords={targetCoords} />

              {/* GENUINE REAL-ROAD PATH (OSRM Traced Streets) */}
              {roadPath.length > 1 && (
                <>
                  {/* Outer Road Casing (Dark Forest Road Bed) */}
                  <Polyline
                    positions={roadPath}
                    pathOptions={{
                      color: '#081c15',
                      weight: 7,
                      opacity: 0.85,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                  {/* Inner Vibrant Emerald Driving Line */}
                  <Polyline
                    positions={roadPath}
                    pathOptions={{
                      color: '#22c55e',
                      weight: 4,
                      opacity: 0.95,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                </>
              )}

              {/* Fleet Depot / Driver Location Marker */}
              <Marker
                position={[driverLocation.lat, driverLocation.lng]}
                icon={createDepotIcon(driverLocation.isGps)}
              >
                <Popup className="dispatch-leaflet-popup" minWidth={240}>
                  <div className="p-3 text-sage-900">
                    <div className="-mx-3 -mt-3 mb-2 px-3 py-2 bg-blue-900 text-white font-extrabold text-xs flex items-center justify-between">
                      <span>🚛 {driverLocation.name}</span>
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">ORIGIN</span>
                    </div>
                    <div className="text-xs font-semibold text-sage-800">{driverLocation.address}</div>
                    <div className="mt-2 text-[11px] text-sage-600">
                      All collection paths originate from here along genuine asphalt roads.
                    </div>
                  </div>
                </Popup>
              </Marker>

              {/* Citizen Complaint Stops (RED MARKERS) */}
              {citizenTickets
                .filter(ticket => (showResolved ? true : ticket.status !== 'resolved'))
                .map(ticket => {
                  const lat = Number(ticket.latitude ?? ticket.location?.lat);
                  const lng = Number(ticket.longitude ?? ticket.location?.lng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

                  const isSelected = selectedTicketId === ticket.ticketId;
                  const isResolved = ticket.status === 'resolved';
                  const config = COMPLAINT_TYPE_CONFIG[ticket.requestType] || { label: ticket.requestType, icon: '📍' };

                  return (
                    <Marker
                      key={`marker-${ticket.ticketId}`}
                      position={[lat, lng]}
                      icon={createComplaintIcon(ticket, isSelected)}
                      eventHandlers={{
                        click: () => {
                          setSelectedTicketId(ticket.ticketId);
                          setSelectedBinId(null);
                        },
                      }}
                    >
                      <Popup className="dispatch-leaflet-popup" minWidth={260} maxWidth={320}>
                        <div className="p-3 text-sage-900">
                          {/* Header */}
                          <div className={`-mx-3 -mt-3 mb-2 px-3 py-2 text-white font-extrabold text-xs flex items-center justify-between ${
                            isResolved ? 'bg-emerald-700' : 'bg-red-600'
                          }`}>
                            <span className="flex items-center gap-1">
                              <span>{isResolved ? '✓' : '🛑'}</span>
                              <span>{isResolved ? 'COLLECTED COMPLAINT' : 'EMERGENCY RED STOP'}</span>
                            </span>
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">{ticket.ticketId}</span>
                          </div>

                          <div className="text-xs font-bold text-sage-900 flex items-center gap-1.5">
                            <span>{config.icon}</span>
                            <span>{config.label}</span>
                          </div>

                          <div className="mt-1 text-[11px] font-medium text-sage-700">
                            {ticket.addressString || ticket.location?.address_string}
                          </div>

                          <div className="mt-2 rounded-md bg-sage-100/80 p-2 text-[11px] space-y-0.5">
                            <div><span className="font-semibold text-sage-900">Citizen:</span> {ticket.citizenName}</div>
                            {ticket.contactNumber && (
                              <div>
                                <span className="font-semibold text-sage-900">Phone:</span>{' '}
                                <a href={`tel:${ticket.contactNumber}`} className="text-forest underline font-bold">
                                  {ticket.contactNumber}
                                </a>
                              </div>
                            )}
                            <div><span className="font-semibold text-sage-900">Status:</span> <span className="uppercase font-bold">{ticket.status}</span></div>
                          </div>

                          {ticket.photoUrl && (
                            <div className="mt-2">
                              <img
                                src={ticket.photoUrl}
                                alt="Reported issue"
                                onClick={() => setPreviewPhoto(ticket.photoUrl)}
                                className="h-20 w-full rounded object-cover cursor-pointer hover:opacity-90 border border-sage-200"
                              />
                            </div>
                          )}

                          {/* Action Button inside Popup */}
                          <div className="mt-3 pt-2 border-t border-sage-200 flex flex-col gap-2">
                            {!isResolved ? (
                              <>
                                {pendingTicketPhotos[ticket.ticketId] ? (
                                  <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                                    <span className="flex items-center gap-1">✓ Photo attached</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTicketPhoto(ticket.ticketId)}
                                      className="text-red-600 hover:underline text-[10px]"
                                    >
                                      ✕ Retake
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex items-center justify-center gap-1 rounded border border-dashed border-red-300 bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-800 cursor-pointer hover:bg-red-100">
                                    <span>📷 Attach Cleanup Photo</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      className="hidden"
                                      onChange={e => handleTicketPhotoSelect(ticket.ticketId, e.target.files?.[0])}
                                    />
                                  </label>
                                )}
                                <button
                                  type="button"
                                  disabled={resolvingTicketId === ticket.ticketId || !pendingTicketPhotos[ticket.ticketId]}
                                  onClick={() => handleResolveComplaint(ticket.ticketId)}
                                  className={`w-full rounded-lg px-3 py-2 text-xs font-bold transition ${
                                    pendingTicketPhotos[ticket.ticketId]
                                      ? 'bg-emerald-700 text-white shadow hover:bg-emerald-800 cursor-pointer'
                                      : 'bg-sage-200 text-sage-500 cursor-not-allowed border border-sage-300'
                                  }`}
                                  title={!pendingTicketPhotos[ticket.ticketId] ? 'Upload cleanup photo first to collect' : 'Click to collect'}
                                >
                                  {resolvingTicketId === ticket.ticketId
                                    ? 'Updating...'
                                    : pendingTicketPhotos[ticket.ticketId]
                                    ? '✓ Collect Waste & Mark Resolved'
                                    : '🔒 Upload photo to collect'}
                                </button>
                              </>
                            ) : (
                              <div className="w-full text-center text-xs font-bold text-emerald-800 bg-emerald-100 py-1.5 rounded">
                                ✓ Resolved & Waste Collected
                              </div>
                            )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

              {/* Scheduled Bin Stops (GREEN/PINE MARKERS) */}
              {bins
                .filter(bin => (showResolved ? true : !collectedBinIds.includes(bin.id)))
                .map((bin, index) => {
                  const isSelected = selectedBinId === bin.id;
                  const isCollected = collectedBinIds.includes(bin.id);

                  return (
                    <Marker
                      key={`marker-${bin.id}`}
                      position={[bin.lat, bin.lng]}
                      icon={createBinIcon(bin, index, isSelected, isCollected)}
                      eventHandlers={{
                        click: () => {
                          setSelectedBinId(bin.id);
                          setSelectedTicketId(null);
                        },
                      }}
                    >
                      <Popup className="dispatch-leaflet-popup" minWidth={240}>
                        <div className="p-3 text-sage-900">
                          <div className="-mx-3 -mt-3 mb-2 px-3 py-2 bg-sage-900 text-white font-bold text-xs flex items-center justify-between">
                            <span>Stop #{index + 1} · {bin.id}</span>
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">{bin.status}</span>
                          </div>

                          <div className="text-xs font-bold text-sage-900">{bin.zone}</div>
                          <div className="text-[11px] text-sage-700">{bin.address}</div>
                          <div className="mt-2 text-xs font-semibold text-sage-800">
                            {bin.type} · ETA {bin.eta} · Fill: <span className="font-bold text-sage-900">{bin.fill}%</span>
                          </div>

                          <div className="mt-3 pt-2 border-t border-sage-200">
                            {!isCollected ? (
                              <div className="flex flex-col gap-2">
                                {pendingBinPhotos[bin.id] ? (
                                  <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                                    <span className="flex items-center gap-1">✓ Photo attached</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveBinPhoto(bin.id)}
                                      className="text-red-600 hover:underline text-[10px]"
                                    >
                                      ✕ Retake
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex items-center justify-center gap-1 rounded border border-dashed border-sage-400 bg-sage-50 px-2 py-1.5 text-[11px] font-bold text-sage-800 cursor-pointer hover:bg-sage-100">
                                    <span>📷 Attach Proof Photo</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      className="hidden"
                                      onChange={e => handleBinPhotoSelect(bin.id, e.target.files?.[0])}
                                    />
                                  </label>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={!pendingBinPhotos[bin.id]}
                                    onClick={() => handleCollectBin(bin.id)}
                                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                      pendingBinPhotos[bin.id]
                                        ? 'bg-emerald-700 text-white hover:bg-emerald-800 shadow cursor-pointer'
                                        : 'bg-sage-200 text-sage-500 cursor-not-allowed border border-sage-300'
                                    }`}
                                    title={!pendingBinPhotos[bin.id] ? 'Upload photo proof first to collect' : 'Click to mark collected'}
                                  >
                                    {pendingBinPhotos[bin.id] ? '✓ Mark Collected' : '🔒 Upload photo to collect'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openAudit(bin.id)}
                                    className="rounded-lg border border-sage-600 px-2.5 py-1.5 text-xs font-bold text-sage-900 hover:bg-sage-100"
                                  >
                                    Audit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-xs font-bold text-emerald-800 bg-emerald-100 py-1.5 px-2 rounded">
                                <span>✓ Collected</span>
                                {binProofPhotos[bin.id] && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewPhoto(binProofPhotos[bin.id])}
                                    className="text-[10px] text-emerald-900 underline font-bold"
                                  >
                                    View Proof
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
            </MapContainer>

            {/* Turn-by-Turn Real Road Driving Directions Drawer */}
            {showTurnSteps && (
              <div className="absolute inset-x-3 bottom-3 top-16 z-[1001] flex flex-col rounded-xl border border-sage-300 bg-white/95 p-4 shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-sage-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🚗</span>
                    <h3 className="font-bold text-sm text-sage-900">
                      Real-Road Turn-by-Turn Driving Directions
                    </h3>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {routeStats.distanceKm} km · {routeStats.durationMin} min
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTurnSteps(false)}
                    className="rounded p-1 text-sage-600 hover:bg-sage-100 text-xs font-bold"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="mt-2 flex-1 overflow-y-auto space-y-2 pr-1">
                  {routeStats.turnSteps.map((step, idx) => (
                    <div
                      key={`step-${idx}`}
                      className="flex items-start gap-2.5 rounded-lg border border-sage-100 bg-sage-50/70 p-2 text-xs"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage-800 text-[10px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <div className="font-bold text-sage-900">{step.instruction}</div>
                        <div className="text-[11px] text-sage-600">
                          {step.distanceM > 0 ? `${step.distanceM} meters` : 'Arrival waypoint'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Map Overlay Legend */}
            <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap items-center gap-2 rounded-lg border border-white/80 bg-white/90 px-3 py-1.5 text-[11px] font-bold text-sage-900 shadow-md backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-full bg-blue-600"></span> Start Point
              </span>
              <span className="text-sage-400">|</span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-full bg-red-600"></span> Citizen Red Stop
              </span>
              <span className="text-sage-400">|</span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-full bg-sage-800"></span> Scheduled Bin
              </span>
              <span className="text-sage-400">|</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-5 rounded bg-emerald-500"></span> Real Road Path
              </span>
            </div>
          </div>

          {/* Under-Map Active Stop Info Card */}
          {selectedTicket ? (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50/70 p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white uppercase tracking-wider">
                      Selected Red Stop
                    </span>
                    <span className="font-extrabold text-sm text-red-900">{selectedTicket.ticketId}</span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-sage-900">
                    {COMPLAINT_TYPE_CONFIG[selectedTicket.requestType]?.icon}{' '}
                    {COMPLAINT_TYPE_CONFIG[selectedTicket.requestType]?.label}
                  </div>
                  <div className="text-xs text-sage-700">
                    {selectedTicket.addressString || selectedTicket.location?.address_string}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedTicket.latitude && selectedTicket.longitude && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedTicket.latitude},${selectedTicket.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-sage-400 bg-white px-3 py-2 text-xs font-bold text-sage-900 shadow-sm hover:bg-sage-50 transition"
                    >
                      🧭 Open GPS
                    </a>
                  )}
                  {selectedTicket.status === 'resolved' ? (
                    <span className="rounded-lg bg-emerald-100 border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-900">
                      ✓ Collected & Verified Resolved
                    </span>
                  ) : selectedTicket.status === 'pickup_done' ? (
                    <span className="rounded-lg bg-purple-100 border border-purple-300 px-3 py-2 text-xs font-bold text-purple-900">
                      📸 Proof Uploaded · Awaiting Admin Verification
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={resolvingTicketId === selectedTicket.ticketId || !pendingTicketPhotos[selectedTicket.ticketId]}
                      onClick={() => handleResolveComplaint(selectedTicket.ticketId)}
                      className={`rounded-lg px-4 py-2 text-xs font-bold transition shadow ${
                        pendingTicketPhotos[selectedTicket.ticketId]
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer ring-2 ring-emerald-400/50'
                          : 'bg-sage-200 text-sage-500 cursor-not-allowed border border-sage-300'
                      }`}
                      title={!pendingTicketPhotos[selectedTicket.ticketId] ? 'Attach cleanup photo below to enable collection' : 'Submit photo proof'}
                    >
                      {resolvingTicketId === selectedTicket.ticketId
                        ? 'Uploading Proof...'
                        : pendingTicketPhotos[selectedTicket.ticketId]
                        ? '📸 Submit Cleanup Proof & Collect'
                        : '🔒 Upload photo to collect'}
                    </button>
                  )}
                </div>
              </div>

              {/* Driver Proof Photo Input */}
              {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'pickup_done' && (
                <div className="mt-3 border-t border-red-200/80 pt-2 flex flex-wrap items-center justify-between gap-2">
                  {pendingTicketPhotos[selectedTicket.ticketId] ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={pendingTicketPhotos[selectedTicket.ticketId].previewUrl}
                        alt={`Proof for ${selectedTicket.ticketId}`}
                        className="h-9 w-9 rounded object-cover border border-emerald-400 shadow-sm cursor-pointer"
                        onClick={() => setPreviewPhoto(pendingTicketPhotos[selectedTicket.ticketId].previewUrl)}
                        title="Click to view full preview"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                          ✓ Cleanup photo attached
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTicketPhoto(selectedTicket.ticketId)}
                          className="text-[11px] font-semibold text-red-600 hover:underline text-left"
                        >
                          ✕ Retake / Change Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-dashed border-red-400 bg-red-100/60 px-3 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100 transition">
                      <span>📷</span>
                      <span>* Mandatory: Take / Upload Cleanup Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => handleTicketPhotoSelect(selectedTicket.ticketId, e.target.files?.[0])}
                      />
                    </label>
                  )}

                  {!pendingTicketPhotos[selectedTicket.ticketId] && (
                    <span className="text-[11px] text-red-600 font-semibold">
                      Photo required before you can access the collect button
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : selectedBin ? (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-sage-300 bg-white/70 p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-sage-900 flex items-center gap-2">
                    <span>Next stop: {selectedBin.id}</span>
                    <span className="rounded-full bg-sage-200 px-2 py-0.5 text-[10px] font-bold text-sage-800">
                      {selectedBin.status}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-sage-800">
                    {selectedBin.zone} · {selectedBin.fill}% full · {selectedBin.type} · ETA {selectedBin.eta}
                  </div>
                  <div className="text-[11px] text-sage-600">{selectedBin.address}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAudit(selectedBin.id)}
                    className="rounded-lg border border-sage-600 px-3 py-2 text-xs font-bold text-sage-900 hover:bg-sage-100"
                  >
                    Audit
                  </button>
                </div>
              </div>

              {/* Photo Requirement for Bin */}
              <div className="border-t border-sage-200/80 pt-2 flex flex-wrap items-center justify-between gap-2">
                {pendingBinPhotos[selectedBin.id] ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={pendingBinPhotos[selectedBin.id].previewUrl}
                      alt={`Proof for ${selectedBin.id}`}
                      className="h-9 w-9 rounded object-cover border border-emerald-400 shadow-sm cursor-pointer"
                      onClick={() => setPreviewPhoto(pendingBinPhotos[selectedBin.id].previewUrl)}
                      title="Click to view full preview"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-emerald-800">✓ Proof photo attached</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBinPhoto(selectedBin.id)}
                        className="text-[11px] font-semibold text-red-600 hover:underline text-left"
                      >
                        ✕ Remove / Retake
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-dashed border-sage-400 bg-sage-50 px-3 py-1.5 text-xs font-bold text-sage-900 hover:bg-sage-100 transition">
                    <span>📷</span>
                    <span>* Mandatory: Take / Upload Bin Collection Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => handleBinPhotoSelect(selectedBin.id, e.target.files?.[0])}
                    />
                  </label>
                )}

                <button
                  type="button"
                  disabled={!pendingBinPhotos[selectedBin.id]}
                  onClick={() => handleCollectBin(selectedBin.id)}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition shadow ${
                    pendingBinPhotos[selectedBin.id]
                      ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer ring-2 ring-emerald-400/50'
                      : 'bg-sage-200 text-sage-500 cursor-not-allowed border border-sage-300'
                  }`}
                  title={!pendingBinPhotos[selectedBin.id] ? 'Upload photo proof first to collect' : 'Click to mark collected'}
                >
                  {pendingBinPhotos[selectedBin.id] ? '✓ Mark Collected' : '🔒 Upload photo to collect'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-mint/70 p-3 text-center text-xs font-bold text-sage-900">
              Select any stop on the map or queue to view details & collection actions.
            </div>
          )}
        </section>

        {/* Right Column: Segregation Audit & Shift Summary */}
        <section className="flex flex-col rounded-xl border border-sage-300/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm lg:col-span-3">
          <div className="mb-4">
            <h2 className="font-bold text-sage-900">Segregation audit</h2>
            <p className="mt-0.5 text-xs font-medium text-sage-700">Verify each collection before closeout</p>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[460px] pr-1">
            {bins.map(bin => {
              const isAudited = auditedBinIds.includes(bin.id);
              return (
                <div
                  key={`audit-${bin.id}`}
                  className="flex items-center justify-between gap-2 border-b border-sage-200 pb-2.5 pt-1 last:border-0"
                >
                  <div>
                    <div className="text-sm font-bold text-sage-900 flex items-center gap-1.5">
                      {bin.id}
                      {isAudited && <span className="text-emerald-700 text-xs font-bold">✓ Audited</span>}
                    </div>
                    <div className="text-xs font-medium text-sage-700">{bin.zone}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAudit(bin.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      isAudited
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'border border-sage-600 text-sage-900 hover:bg-sage-100'
                    }`}
                  >
                    {isAudited ? 'Edit' : 'Audit'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Shift Summary */}
          <div className="mt-4 rounded-xl bg-sage-100/90 p-4 border border-sage-200">
            <div className="text-xs font-extrabold uppercase tracking-wide text-sage-900">Shift Progress</div>
            <div className="mt-2 flex justify-between text-xs font-bold text-sage-900">
              <span>Audits Complete</span>
              <span>{auditedBinIds.length} / {bins.length}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-sage-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-sage-700 transition-all duration-300"
                style={{ width: `${(auditedBinIds.length / bins.length) * 100}%` }}
              />
            </div>

            <div className="mt-3 flex justify-between text-xs font-bold text-sage-900">
              <span>Citizen Red Stops Resolved</span>
              <span className="text-emerald-800">
                {resolvedComplaints.length} / {citizenTickets.length || 1}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-sage-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                style={{
                  width: `${citizenTickets.length ? (resolvedComplaints.length / citizenTickets.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Audit Slideover Modal */}
      {auditBin && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-sage-900/30 backdrop-blur-xs"
          role="presentation"
          onMouseDown={event => event.target === event.currentTarget && setAuditBinId(null)}
        >
          <aside
            className="h-full w-full max-w-md border-l border-sage-300 bg-[#f7faf6] p-6 shadow-2xl overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wide text-sage-700">Collection audit</div>
                <h2 id="audit-title" className="mt-1 text-xl font-bold text-sage-900">
                  {auditBin.id} · {auditBin.zone}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAuditBinId(null)}
                className="rounded-lg p-1.5 text-xl font-bold text-sage-800 hover:bg-sage-200"
                aria-label="Close audit"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm font-medium text-sage-800">
              Record the segregation and contamination condition at pickup.
            </p>

            <div className="mt-6 space-y-3">
              {AUDIT_ITEMS.map(item => (
                <label
                  key={item}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage-200 bg-white p-3.5 text-sm font-bold text-sage-900 shadow-sm transition hover:border-sage-400"
                >
                  <input
                    type="checkbox"
                    checked={auditChecks.includes(item)}
                    onChange={() => toggleAuditItem(item)}
                    className="mt-0.5 h-4 w-4 accent-[#145c43]"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>

            <button
              type="button"
              disabled={auditChecks.length !== AUDIT_ITEMS.length}
              onClick={() => {
                setAuditedBinIds(current =>
                  current.includes(auditBin.id) ? current : [...current, auditBin.id]
                );
                setAuditSaved(true);
                showToast(`Audit saved for ${auditBin.id}!`);
              }}
              className="mt-6 w-full rounded-xl bg-sage-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-sage-800 transition"
            >
              Save audit
            </button>

            {auditSaved && (
              <div className="mt-3 rounded-lg bg-emerald-100 border border-emerald-300 p-3 text-sm font-bold text-emerald-900 text-center">
                ✓ Audit successfully saved for {auditBin.id}.
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white font-bold hover:bg-black"
            >
              ✕
            </button>
            <img src={previewPhoto} alt="Preview" className="max-h-[80vh] w-auto rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
