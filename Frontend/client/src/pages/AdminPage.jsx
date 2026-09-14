import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Input, Select, Alert, Spinner } from '../components/ui';

const DEFAULT_ZONES = [
  { id: 'north', name: 'North Market', shortName: 'North', fill: 94, collections: 38, contamination: 7, color: '#b83c2d' },
  { id: 'lake', name: 'Lakeview Ward', shortName: 'Lakeview', fill: 82, collections: 31, contamination: 11, color: '#d38631' },
  { id: 'civic', name: 'Civic Centre', shortName: 'Civic', fill: 68, collections: 27, contamination: 5, color: '#e8c958' },
  { id: 'east', name: 'East Campus', shortName: 'East', fill: 56, collections: 24, contamination: 3, color: '#70a96e' },
  { id: 'river', name: 'Riverside', shortName: 'River', fill: 76, collections: 29, contamination: 9, color: '#d38631' },
  { id: 'south', name: 'South Gate', shortName: 'South', fill: 47, collections: 19, contamination: 2, color: '#70a96e' },
];

const RANGE_DATA = {
  '7 days': { collections: '168', trend: [38, 44, 41, 53, 49, 61, 68], labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], change: '+21.3%' },
  '30 days': { collections: '724', trend: [92, 108, 116, 132, 144, 158, 174], labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'], change: '+16.8%' },
  '90 days': { collections: '2,146', trend: [288, 316, 352, 389, 421, 468, 512], labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'], change: '+28.5%' },
};

const STATUS_PILLS = {
  submitted: { label: '1. Submitted', bg: 'bg-mint/80 text-forest border-sage-400' },
  verified: { label: '2. Admin Verified', bg: 'bg-blue-100 text-blue-900 border-blue-300' },
  dispatched: { label: '3. Driver Dispatched', bg: 'bg-amber-100 text-amber-900 border-amber-300' },
  pickup_done: { label: '4. Pickup Done (Proof Uploaded)', bg: 'bg-purple-100 text-purple-900 border-purple-300' },
  resolved: { label: '5. Resolved', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
};

export default function AdminPage() {
  const [range, setRange] = useState('7 days');
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneBins, setZoneBins] = useState([]);
  const [loadingBins, setLoadingBins] = useState(false);

  // Complaints & workflow
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverForTicket, setSelectedDriverForTicket] = useState({});
  const [ticketFilter, setTicketFilter] = useState('all');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Comment thread modal / expanded view
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [comments, setComments] = useState({});
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Photo viewer modal
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const rangeData = RANGE_DATA[range];

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [zonesRes, ticketsRes, driversRes] = await Promise.all([
        api.getZones().catch(() => ({ zones: [] })),
        api.citizenRequests().catch(() => ({ requests: [] })),
        api.getDriversByZone().catch(() => ({ drivers: [] })),
      ]);

      const dbZones = zonesRes.zones?.length > 0 ? zonesRes.zones : DEFAULT_ZONES;
      setZones(dbZones);
      const initialZone = dbZones[0];
      setSelectedZone(initialZone);
      loadZoneBins(initialZone.id);

      setTickets(ticketsRes.requests || []);
      setDrivers(driversRes.drivers || []);
    } catch (err) {
      console.error('Failed to load initial admin data:', err);
    } finally {
      setLoadingTickets(false);
    }
  }

  async function loadZoneBins(zoneId) {
    if (!zoneId) return;
    setLoadingBins(true);
    try {
      const res = await api.getZoneBins(zoneId);
      setZoneBins(res.bins || []);
    } catch (err) {
      console.error('Failed to load bins for zone:', err);
      setZoneBins([]);
    } finally {
      setLoadingBins(false);
    }
  }

  function handleSelectZone(zone) {
    setSelectedZone(zone);
    loadZoneBins(zone.id);
  }

  // Workflow actions
  async function handleVerifyComplaint(ticketId) {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.updateCitizenRequestStatus(ticketId, { status: 'verified' });
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? res.request : t)));
      setActionSuccess(`Ticket ${ticketId} verified. Ready to assign driver.`);
    } catch (err) {
      setActionError(err.message || 'Failed to verify ticket');
    }
  }

  async function handleAssignDriver(ticketId) {
    setActionError('');
    setActionSuccess('');
    const driverId = selectedDriverForTicket[ticketId];
    if (!driverId) {
      setActionError('Please choose a driver from the dropdown to assign');
      return;
    }

    try {
      const res = await api.assignDriver(ticketId, driverId);
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? res.request : t)));
      setActionSuccess(`Driver assigned to ticket ${ticketId}. Driver notified!`);
    } catch (err) {
      setActionError(err.message || 'Failed to assign driver');
    }
  }

  async function handleApproveCleanup(ticketId) {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.verifyCleanup(ticketId);
      setTickets((prev) => prev.map((t) => (t.ticketId === ticketId ? res.request : t)));
      setActionSuccess(`Cleanup verified! Ticket ${ticketId} resolved and citizen notified.`);
    } catch (err) {
      setActionError(err.message || 'Failed to approve cleanup');
    }
  }

  // Comments
  async function toggleComments(ticketId) {
    if (expandedTicketId === ticketId) {
      setExpandedTicketId(null);
      return;
    }
    setExpandedTicketId(ticketId);
    if (!comments[ticketId]) {
      try {
        const res = await api.getTicketComments(ticketId);
        setComments((prev) => ({ ...prev, [ticketId]: res.comments || [] }));
      } catch (err) {
        console.error('Failed to load comments:', err);
      }
    }
  }

  async function handleAddComment(ticketId) {
    if (!newCommentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await api.addTicketComment(ticketId, newCommentText.trim());
      setComments((prev) => ({
        ...prev,
        [ticketId]: [...(prev[ticketId] || []), res.comment],
      }));
      setNewCommentText('');
    } catch (err) {
      setActionError(err.message || 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  }

  const activeTickets = tickets.filter((ticket) => ticket.status !== 'resolved');
  const filteredTickets = tickets.filter((t) => {
    if (ticketFilter === 'all') return true;
    if (ticketFilter === 'active') return t.status !== 'resolved';
    return t.status === ticketFilter;
  });

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      {/* Title */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sage-900">Municipal Admin Command Center</h1>
          <p className="mt-1 text-sm text-sage-800">
            GIS Zone Monitoring · Smart Bin Telemetry · Verified Cleanup Workflow
          </p>
        </div>
        <div className="flex rounded-lg border border-sage-300 bg-white/65 p-1 backdrop-blur-sm">
          {['7 days', '30 days', '90 days'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                range === option ? 'bg-sage-900 text-white' : 'text-sage-800 hover:bg-sage-100'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {actionSuccess && <div className="mb-4"><Alert variant="success">{actionSuccess}</Alert></div>}
      {actionError && <div className="mb-4"><Alert variant="error">{actionError}</Alert></div>}

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Completed Collections" value={rangeData.collections} detail={`${rangeData.change} vs last period`} positive />
        <Metric label="Active Monitored Bins" value="48 Smart Bins" detail="8 Bins across 6 City Zones" positive />
        <Metric label="Pending Verification" value={String(tickets.filter((t) => t.status === 'pickup_done').length)} detail="Drivers uploaded proof" warning />
        <Metric label="Active Citizen Complaints" value={String(activeTickets.length)} detail="Awaiting resolution" />
      </div>

      {/* Grid: Zone Heatmap + Bins */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        {/* Zone Heatmap */}
        <section className="rounded-xl border border-sage-300/80 bg-white/65 p-5 shadow-sm backdrop-blur-sm lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-sage-900 text-base">Zone Capacity Heatmap (Hubli-Dharwad)</h2>
              <p className="mt-0.5 text-xs font-medium text-sage-800">Select a zone to inspect its 8 connected Smart Bins</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-sage-800">
              <span className="h-3 w-3 rounded-sm bg-[#70a96e]" /> Normal
              <span className="h-3 w-3 rounded-sm bg-[#e8c958]" /> Warning
              <span className="h-3 w-3 rounded-sm bg-[#b83c2d]" /> Critical
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-sage-300 bg-[#dcebdd]/60 p-3 sm:grid-cols-3">
            {zones.map((zone) => {
              const isSelected = selectedZone?.id === zone.id || selectedZone?.name === zone.name;
              const fill = zone.fill ?? 65;
              const color = fill >= 80 ? '#b83c2d' : fill >= 60 ? '#e8c958' : '#70a96e';

              return (
                <button
                  key={zone.id || zone.name}
                  type="button"
                  onClick={() => handleSelectZone(zone)}
                  className={`relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 ${
                    isSelected ? 'border-sage-900 shadow-md ring-2 ring-forest/30' : 'border-white/80'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  <div className="absolute inset-0 bg-white/15" />
                  <div className="relative flex h-full min-h-[110px] flex-col justify-between">
                    <div>
                      <div className="text-sm font-black text-sage-900">{zone.name}</div>
                      <div className="text-[11px] font-bold text-sage-900/80">
                        {zone.workerCount !== undefined ? `${zone.workerCount} Drivers` : 'Active Route'}
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-sage-900">{fill}%</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-sage-900/80">
                        8 Connected Bins
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedZone && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-sage-100/80 p-3 text-xs font-bold text-sage-900">
              <span>Selected: <span className="text-forest font-black">{selectedZone.name}</span></span>
              <span>Latitude: {Number(selectedZone.centerLat || 15.36).toFixed(4)}, Longitude: {Number(selectedZone.centerLng || 75.12).toFixed(4)}</span>
            </div>
          )}
        </section>

        {/* 8 Smart Bins in Selected Zone */}
        <section className="rounded-xl border border-sage-300/80 bg-white/65 p-5 shadow-sm backdrop-blur-sm lg:col-span-6 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sage-900 text-base">
                Smart Bins in {selectedZone?.name || 'Selected Zone'}
              </h2>
              <p className="text-xs font-medium text-sage-800">Real-time fill levels from IoT ultrasonic sensors</p>
            </div>
            <span className="rounded-full bg-forest px-2.5 py-0.5 text-xs font-bold text-white">
              {zoneBins.length} Connected
            </span>
          </div>

          {loadingBins ? (
            <div className="flex flex-1 items-center justify-center py-12"><Spinner /></div>
          ) : zoneBins.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm font-semibold text-sage-800 py-12">
              Click on a zone to inspect its 8 Smart Bins.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 overflow-y-auto max-h-[380px] p-1">
              {zoneBins.map((bin) => {
                const fill = bin.fillLevel ?? 50;
                const isOver = fill >= 80;
                const barColor = isOver ? 'bg-red-500' : fill >= 60 ? 'bg-amber-500' : 'bg-forest';

                return (
                  <div
                    key={bin.id}
                    className="rounded-xl border border-sage-200 bg-white/90 p-3 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sage-900 text-xs">{bin.label}</span>
                        <span className={`h-2 w-2 rounded-full ${bin.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      </div>
                      <div className="text-[10px] text-sage-600 mt-0.5 truncate">
                        {bin.lat.toFixed(4)}, {bin.lng.toFixed(4)}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] font-bold text-sage-900 mb-1">
                        <span>Fill</span>
                        <span className={isOver ? 'text-alert font-black' : ''}>{fill}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-sage-200 overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${fill}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Section: Complaints Review & Full Verification Workflow */}
      <section className="rounded-xl border border-sage-300/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-sage-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-sage-900">Complaint Dispatch & Verification Workflow</h2>
            <p className="text-xs font-medium text-sage-800">
              Follows strict municipal protocol: Citizen Report → Admin Verify → Assign Worker → Driver Pickup Photo → Admin Manual Verify → Citizen Popup
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-sage-700 uppercase tracking-wider">Filter:</span>
            {['all', 'submitted', 'verified', 'dispatched', 'pickup_done', 'resolved'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setTicketFilter(st)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition-colors ${
                  ticketFilter === st
                    ? 'bg-sage-900 text-white border-sage-900'
                    : 'bg-white border-sage-300 text-sage-800 hover:bg-sage-100'
                }`}
              >
                {st.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {loadingTickets ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-12 text-center text-sm font-semibold text-sage-800">
            No complaints found for the selected filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const pill = STATUS_PILLS[ticket.status] || { label: ticket.status, bg: 'bg-sage-200 text-sage-900' };
              const isExpanded = expandedTicketId === ticket.ticketId;
              const ticketComments = comments[ticket.ticketId] || [];

              return (
                <div
                  key={ticket.ticketId}
                  className="rounded-xl border border-sage-300/90 bg-white/95 p-4 shadow-xs hover:border-forest/40 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-black text-sage-900 text-base">{ticket.ticketId}</span>
                        <span className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${pill.bg}`}>
                          {pill.label}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                            ticket.isSmartBin
                              ? 'bg-mint text-forest border border-sage-400'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {ticket.isSmartBin ? '⚡ Smart Dustbin' : '📍 Non-Smart Dustbin'}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs font-medium text-sage-800">
                        <span><strong>Zone:</strong> {ticket.zone}</span>
                        <span><strong>Type:</strong> {ticket.requestType?.replace('_', ' ')}</span>
                        <span><strong>Citizen:</strong> {ticket.citizenName} ({ticket.contactNumber})</span>
                        <span><strong>Location:</strong> {ticket.addressString}</span>
                      </div>
                    </div>

                    {/* Workflow Action Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Step 1: Verify */}
                      {ticket.status === 'submitted' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyComplaint(ticket.ticketId)}
                          className="rounded-lg bg-forest px-3.5 py-1.5 text-xs font-bold text-white hover:bg-pine shadow-xs"
                        >
                          Step 1: Verify Complaint
                        </button>
                      )}

                      {/* Step 2: Assign Driver */}
                      {ticket.status === 'verified' && (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedDriverForTicket[ticket.ticketId] || ''}
                            onChange={(e) =>
                              setSelectedDriverForTicket({
                                ...selectedDriverForTicket,
                                [ticket.ticketId]: e.target.value,
                              })
                            }
                            className="rounded-lg border border-sage-300 bg-white px-2.5 py-1.5 text-xs font-bold text-sage-900 focus:border-forest outline-none"
                          >
                            <option value="">Select Zone Driver...</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.phone || 'Driver'})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAssignDriver(ticket.ticketId)}
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 shadow-xs"
                          >
                            Step 2: Assign Driver
                          </button>
                        </div>
                      )}

                      {/* Step 4: Verify Driver Proof */}
                      {ticket.status === 'pickup_done' && (
                        <button
                          type="button"
                          onClick={() => handleApproveCleanup(ticket.ticketId)}
                          className="rounded-lg bg-purple-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-800 shadow-xs animate-pulse"
                        >
                          Step 4: Verify Proof & Resolve
                        </button>
                      )}

                      {ticket.status === 'resolved' && (
                        <span className="rounded-lg bg-emerald-50 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-800">
                          ✔ Fully Resolved
                        </span>
                      )}

                      {/* Comments toggle button */}
                      <button
                        type="button"
                        onClick={() => toggleComments(ticket.ticketId)}
                        className="rounded-lg border border-sage-300 bg-white px-2.5 py-1.5 text-xs font-bold text-sage-800 hover:bg-sage-100"
                      >
                        💬 Notes
                      </button>
                    </div>
                  </div>

                  {/* Photos Section: Before vs After (Driver Proof) */}
                  <div className="mt-3.5 flex flex-wrap gap-4 border-t border-sage-200/70 pt-3">
                    {ticket.photoUrl && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-sage-700 mb-1">
                          1. Citizen Complaint Photo
                        </div>
                        <img
                          src={ticket.photoUrl}
                          alt="Complaint proof"
                          onClick={() => setPreviewPhoto(ticket.photoUrl)}
                          className="h-20 w-28 object-cover rounded-lg border border-sage-300 cursor-pointer hover:opacity-90 shadow-2xs"
                        />
                      </div>
                    )}

                    {ticket.driverProofPhotoUrl && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800 mb-1 flex items-center gap-1">
                          <span>📸 2. Driver Cleanup Proof</span>
                          <span className="bg-purple-200 text-purple-900 rounded-sm px-1 text-[10px]">New</span>
                        </div>
                        <img
                          src={ticket.driverProofPhotoUrl}
                          alt="Driver cleanup verification"
                          onClick={() => setPreviewPhoto(ticket.driverProofPhotoUrl)}
                          className="h-20 w-28 object-cover rounded-lg border-2 border-purple-400 cursor-pointer hover:opacity-90 shadow-2xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* Comments Thread Accordion */}
                  {isExpanded && (
                    <div className="mt-3 rounded-lg border border-sage-200 bg-sage-50/70 p-3 text-xs">
                      <div className="font-bold text-sage-900 mb-2">Internal Notes & Operational Trail</div>
                      {ticketComments.length === 0 ? (
                        <div className="text-sage-600 mb-3">No comments logged for this complaint yet.</div>
                      ) : (
                        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto pr-1">
                          {ticketComments.map((c) => (
                            <div key={c.id} className="rounded-md bg-white p-2 border border-sage-200">
                              <div className="flex justify-between font-bold text-sage-900 text-[11px]">
                                <span>{c.authorName}</span>
                                <span className="text-sage-600 font-normal">
                                  {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="text-sage-800 mt-1 font-medium">{c.content}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          placeholder="Add internal verification note..."
                          className="flex-1 rounded-md border border-sage-300 bg-white px-2.5 py-1.5 text-xs text-sage-900 outline-none focus:border-forest"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(ticket.ticketId)}
                          disabled={submittingComment}
                          className="rounded-md bg-forest px-3 py-1.5 text-xs font-bold text-white hover:bg-pine"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Full Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
            <img src={previewPhoto} alt="Inspection" className="max-h-[80vh] w-auto rounded-xl object-contain" />
            <div className="p-2 text-right">
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="rounded-md bg-sage-800 px-3 py-1 text-xs font-bold text-white"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, detail, positive, warning }) {
  return (
    <div className="rounded-xl border border-sage-300/80 bg-white/65 p-4 shadow-sm backdrop-blur-sm">
      <div className="text-xs font-bold text-sage-800">{label}</div>
      <div className="mt-1 text-2xl font-bold text-sage-900">{value}</div>
      <div className={`mt-1 text-[11px] font-semibold ${warning ? 'text-alert' : positive ? 'text-sage-700' : 'text-sage-800'}`}>
        {detail}
      </div>
    </div>
  );
}
