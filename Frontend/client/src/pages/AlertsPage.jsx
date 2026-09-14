import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const INITIAL_ALERTS = [
  { id: 'sys-1', severity: 'Critical', title: 'North Market bin nearing overflow', message: 'BIN-204 reached 96% capacity and needs collection before the next route cycle.', zone: 'North Market', time: '2 min ago', category: 'Capacity', acknowledged: false },
  { id: 'sys-2', severity: 'Warning', title: 'Route delay detected', message: 'Driver 04 is 8 minutes behind schedule near Lakeview Ward.', zone: 'Lakeview Ward', time: '11 min ago', category: 'Operations', acknowledged: false },
  { id: 'sys-3', severity: 'Warning', title: 'Segregation quality below target', message: 'Contamination reached 11% across the last three Lakeview collections.', zone: 'Lakeview Ward', time: '24 min ago', category: 'Quality', acknowledged: false },
  { id: 'sys-4', severity: 'Info', title: 'Collection route completed', message: 'South Gate route completed with 19 stops and no missed collections.', zone: 'South Gate', time: '41 min ago', category: 'Operations', acknowledged: true },
  { id: 'sys-5', severity: 'Info', title: 'Bin connectivity restored', message: 'BIN-087 is reporting fill levels normally after a connectivity gap.', zone: 'Civic Centre', time: '1 hr ago', category: 'System', acknowledged: true },
];

const SEVERITIES = ['All', 'Complaints', 'Critical', 'Warning', 'Info'];

const TYPE_CONFIG = {
  overflow: { label: 'Overflowing bin', icon: '🗑️', severity: 'Critical' },
  damaged_bin: { label: 'Damaged bin', icon: '⚠️', severity: 'Critical' },
  missed_pickup: { label: 'Missed pickup', icon: '🚛', severity: 'Warning' },
  bulk_ewaste: { label: 'Bulk e-waste pickup', icon: '🔋', severity: 'Warning' },
};

const STATUS_LABELS = {
  submitted: '1. Complaint filed',
  verified: '2. Verified',
  dispatched: '3. Assigned to fleet',
  resolved: '4. Resolved',
};

function formatRelativeTime(isoString) {
  if (!isoString) return 'recently';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export default function AlertsPage() {
  const [systemAlerts, setSystemAlerts] = useState(INITIAL_ALERTS);
  const [citizenComplaints, setCitizenComplaints] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [severity, setSeverity] = useState('All');
  const [query, setQuery] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  async function loadComplaints() {
    setLoadingComplaints(true);
    try {
      const res = await api.citizenRequests();
      if (res && res.requests) {
        setCitizenComplaints(res.requests);
      }
    } catch (err) {
      console.warn('Could not load citizen complaints into alerts:', err);
    } finally {
      setLoadingComplaints(false);
    }
  }

  useEffect(() => {
    loadComplaints();
  }, []);

  // Convert citizen complaints to standard alert objects
  const complaintAlerts = citizenComplaints.map((req) => {
    const typeInfo = TYPE_CONFIG[req.requestType] || { label: req.requestType, icon: '📌', severity: 'Warning' };
    return {
      id: `complaint-${req.ticketId}`,
      ticketId: req.ticketId,
      isComplaint: true,
      severity: typeInfo.severity,
      title: `${typeInfo.icon} Citizen: ${typeInfo.label} (${req.ticketId})`,
      message: `${req.citizenName} reported ${typeInfo.label} at ${req.addressString || req.zone}. Contact: ${req.contactNumber || 'N/A'}. Status: ${STATUS_LABELS[req.status] || req.status}.`,
      zone: req.zone || 'East Campus',
      time: formatRelativeTime(req.timestamp),
      category: 'Citizen Complaint',
      acknowledged: req.status === 'resolved',
      status: req.status,
      citizenName: req.citizenName,
      contactNumber: req.contactNumber,
      addressString: req.addressString,
      photoUrl: req.photoUrl,
      driverProofPhotoUrl: req.driverProofPhotoUrl,
      timestamp: req.timestamp,
      raw: req,
    };
  });

  const alerts = [...complaintAlerts, ...systemAlerts];

  const visibleAlerts = alerts.filter((alert) => {
    let matchesSeverity = true;
    if (severity === 'Complaints') {
      matchesSeverity = !!alert.isComplaint;
    } else if (severity !== 'All') {
      matchesSeverity = alert.severity === severity;
    }

    const searchText = `${alert.title} ${alert.message} ${alert.zone} ${alert.category} ${alert.ticketId || ''}`.toLowerCase();
    return matchesSeverity && searchText.includes(query.toLowerCase());
  });

  const openCount = alerts.filter((alert) => !alert.acknowledged).length;
  const criticalCount = alerts.filter((alert) => alert.severity === 'Critical' && !alert.acknowledged).length;
  const warningCount = alerts.filter((alert) => alert.severity === 'Warning' && !alert.acknowledged).length;
  const complaintsCount = citizenComplaints.length;
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId);

  async function updateComplaintStatus(ticketId, newStatus) {
    try {
      await api.updateCitizenRequestStatus(ticketId, { status: newStatus });
      setCitizenComplaints((prev) =>
        prev.map((c) => (c.ticketId === ticketId ? { ...c, status: newStatus } : c))
      );
    } catch (err) {
      console.error('Failed to update complaint status:', err);
    }
  }

  function acknowledgeAlert(alert) {
    if (alert.isComplaint) {
      const nextStatus = alert.status === 'submitted' ? 'verified' : alert.status === 'verified' ? 'dispatched' : 'resolved';
      updateComplaintStatus(alert.ticketId, nextStatus);
    } else {
      setSystemAlerts((current) =>
        current.map((a) => (a.id === alert.id ? { ...a, acknowledged: true } : a))
      );
    }
  }

  function acknowledgeAll() {
    setSystemAlerts((current) => current.map((a) => ({ ...a, acknowledged: true })));
    citizenComplaints.forEach((c) => {
      if (c.status !== 'resolved') {
        updateComplaintStatus(c.ticketId, 'verified');
      }
    });
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-sage-900">Alert Monitoring Center</h1>
          <p className="mt-1 text-sm text-sage-800">
            Real-time event grid, citizen complaints, and notification engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadComplaints}
            disabled={loadingComplaints}
            className="rounded-lg border border-sage-300 bg-white/70 px-3 py-2 text-xs font-bold text-sage-800 hover:bg-white hover:text-sage-900 disabled:opacity-50"
          >
            🔄 {loadingComplaints ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={acknowledgeAll}
            disabled={openCount === 0}
            className="rounded-lg bg-sage-900 px-3 py-2 text-xs font-bold text-white hover:bg-sage-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Acknowledge all
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Open alerts" value={openCount} tone="alert" />
        <Summary label="Citizen complaints" value={complaintsCount} tone="complaint" />
        <Summary label="Critical" value={criticalCount} tone="critical" />
        <Summary label="Warnings" value={warningCount} tone="warning" />
      </div>

      <section className="rounded-xl border border-sage-300/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-sage-300 bg-white/55 p-1">
            {SEVERITIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSeverity(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  severity === option ? 'bg-sage-900 text-white' : 'text-sage-800 hover:bg-sage-100'
                }`}
              >
                {option}
                {option === 'Complaints' && complaintsCount > 0 && ` (${complaintsCount})`}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search alerts or ticket ID..."
            className="w-full rounded-lg border border-sage-300 bg-white/70 px-3 py-2 text-sm font-medium text-sage-900 outline-none placeholder:text-sage-700 focus:border-sage-700 sm:w-64"
            aria-label="Search alerts"
          />
        </div>

        <div className="space-y-2">
          {visibleAlerts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-sage-300 bg-white/40 p-10 text-center text-sm font-semibold text-sage-800">
              No alerts or complaints match the current filters.
            </div>
          ) : (
            visibleAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onOpen={() => setSelectedAlertId(alert.id)}
                onAcknowledge={() => acknowledgeAlert(alert)}
              />
            ))
          )}
        </div>
      </section>

      {/* Alert / Complaint Detail Drawer */}
      {selectedAlert && (
        <div
          className="fixed inset-0 z-20 flex justify-end bg-sage-900/25 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setSelectedAlertId(null)}
        >
          <aside
            className="h-full w-full max-w-md border-l border-sage-300 bg-[#f5faf4]/95 p-6 shadow-2xl backdrop-blur-md overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${severityClass(selectedAlert.severity)}`}>
                    {selectedAlert.severity}
                  </span>
                  {selectedAlert.isComplaint && (
                    <span className="rounded-full bg-forest/10 border border-forest/20 px-2 py-0.5 text-[11px] font-bold text-forest">
                      Citizen Complaint
                    </span>
                  )}
                </div>
                <h2 id="alert-title" className="mt-3 text-lg font-bold text-sage-900">
                  {selectedAlert.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlertId(null)}
                className="rounded-lg px-2.5 py-1 text-xl font-bold text-sage-800 hover:bg-sage-100"
                aria-label="Close alert"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              {selectedAlert.ticketId && (
                <Detail label="Ticket ID" value={selectedAlert.ticketId} />
              )}
              {selectedAlert.citizenName && (
                <Detail label="Citizen Name" value={selectedAlert.citizenName} />
              )}
              {selectedAlert.contactNumber && (
                <Detail
                  label="Contact Phone"
                  value={
                    <a href={`tel:${selectedAlert.contactNumber}`} className="text-forest hover:underline">
                      📞 {selectedAlert.contactNumber}
                    </a>
                  }
                />
              )}
              <Detail label="Campus Zone" value={`📍 ${selectedAlert.zone}`} />
              {selectedAlert.addressString && (
                <Detail label="Address / Location" value={selectedAlert.addressString} />
              )}
              <Detail label="Category" value={selectedAlert.category} />
              <Detail label="Reported Time" value={selectedAlert.time} />
              {selectedAlert.status && (
                <Detail label="Current Status" value={STATUS_LABELS[selectedAlert.status] || selectedAlert.status} />
              )}
            </div>

            {/* Photo preview if citizen uploaded an image */}
            {selectedAlert.photoUrl && (
              <div className="mt-4 rounded-lg border border-sage-200 bg-white/70 p-3">
                <div className="mb-2 text-xs font-bold text-sage-900">Citizen Photo Attachment:</div>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(selectedAlert.photoUrl)}
                  className="group relative block w-full overflow-hidden rounded-lg border border-sage-300"
                >
                  <img src={selectedAlert.photoUrl} alt="Complaint evidence" className="h-40 w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to enlarge
                  </span>
                </button>
              </div>
            )}

            <p className="mt-4 rounded-lg border border-sage-200 bg-white/70 p-4 font-medium leading-6 text-sage-900 text-xs">
              {selectedAlert.message}
            </p>

            {/* Complaint Workflow Actions */}
            {selectedAlert.isComplaint ? (
              <div className="mt-5 space-y-2">
                <div className="text-xs font-bold text-sage-900 mb-1">Update Complaint Status:</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateComplaintStatus(selectedAlert.ticketId, 'verified');
                      setSelectedAlertId(null);
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition-all border ${
                      selectedAlert.status === 'verified'
                        ? 'bg-amber-100 border-amber-400 text-amber-900'
                        : 'border-sage-300 bg-white hover:bg-sage-100 text-sage-900'
                    }`}
                  >
                    2. Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateComplaintStatus(selectedAlert.ticketId, 'dispatched');
                      setSelectedAlertId(null);
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition-all border ${
                      selectedAlert.status === 'dispatched'
                        ? 'bg-blue-100 border-blue-400 text-blue-900'
                        : 'border-sage-300 bg-white hover:bg-sage-100 text-sage-900'
                    }`}
                  >
                    3. Dispatch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateComplaintStatus(selectedAlert.ticketId, 'resolved');
                      setSelectedAlertId(null);
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition-all border ${
                      selectedAlert.status === 'resolved'
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                        : 'border-sage-300 bg-white hover:bg-sage-100 text-sage-900'
                    }`}
                  >
                    4. Resolve
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  acknowledgeAlert(selectedAlert);
                  setSelectedAlertId(null);
                }}
                disabled={selectedAlert.acknowledged}
                className="mt-6 w-full rounded-lg bg-sage-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-sage-700"
              >
                {selectedAlert.acknowledged ? 'Acknowledged' : 'Acknowledge alert'}
              </button>
            )}
          </aside>
        </div>
      )}

      {/* Modal for full photo enlargement */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-sage-200">
              <span className="text-xs font-bold text-sage-900">Complaint Photo</span>
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
    </div>
  );
}

function AlertRow({ alert, onOpen, onAcknowledge }) {
  const isResolved = alert.status === 'resolved' || alert.acknowledged;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-all ${
        isResolved
          ? 'border-sage-200 bg-white/35 opacity-75'
          : alert.isComplaint
          ? 'border-amber-300/80 bg-amber-50/30 hover:border-amber-500 hover:bg-white'
          : 'border-sage-300 bg-white/65 hover:border-sage-500 hover:bg-white'
      }`}
    >
      <div
        className={`h-2.5 w-2.5 rounded-full ${
          alert.severity === 'Critical' ? 'bg-alert' : alert.severity === 'Warning' ? 'bg-warning' : 'bg-sage-600'
        }`}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${severityClass(alert.severity)}`}>
            {alert.severity}
          </span>
          {alert.isComplaint && (
            <span className="rounded-full bg-forest/10 border border-forest/20 px-2 py-0.5 text-[10px] font-bold text-forest">
              Citizen Complaint
            </span>
          )}
          <span className="text-sm font-bold text-sage-900">{alert.title}</span>
        </div>
        <div className="mt-1 text-xs font-medium text-sage-800">
          {alert.zone} · {alert.category} · {alert.time}
          {alert.isComplaint && alert.status && (
            <span className="ml-2 font-bold text-forest">[{STATUS_LABELS[alert.status] || alert.status}]</span>
          )}
        </div>
      </button>

      {/* Action button */}
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={isResolved}
        className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
          isResolved
            ? 'border-sage-300 bg-sage-50 text-text-muted cursor-not-allowed'
            : alert.isComplaint && alert.status === 'submitted'
            ? 'border-amber-600 bg-amber-100 text-amber-900 hover:bg-amber-200'
            : alert.isComplaint && alert.status === 'verified'
            ? 'border-blue-600 bg-blue-100 text-blue-900 hover:bg-blue-200'
            : 'border-sage-600 text-sage-900 hover:bg-sage-100'
        }`}
      >
        {isResolved
          ? 'Done ✓'
          : alert.isComplaint && alert.status === 'submitted'
          ? 'Verify'
          : alert.isComplaint && alert.status === 'verified'
          ? 'Dispatch Fleet'
          : alert.isComplaint && alert.status === 'dispatched'
          ? 'Resolve'
          : 'Acknowledge'}
      </button>
    </div>
  );
}

function severityClass(severity) {
  return severity === 'Critical'
    ? 'bg-alert text-white'
    : severity === 'Warning'
    ? 'bg-warning-muted text-amber-900'
    : 'bg-mint text-sage-900';
}

function Summary({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-sage-300/80 bg-white/60 p-3 shadow-sm backdrop-blur-sm">
      <div className="text-xs font-bold text-sage-800">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === 'critical'
            ? 'text-alert'
            : tone === 'warning'
            ? 'text-amber-800'
            : tone === 'complaint'
            ? 'text-forest'
            : 'text-sage-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between items-center border-b border-sage-200 pb-2 text-xs">
      <span className="font-semibold text-sage-800">{label}</span>
      <span className="font-bold text-sage-900 text-right">{value}</span>
    </div>
  );
}
