import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input, Select, Alert, Spinner } from '../components/ui';

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_PATTERN = /^(?:\+91[\s-]?)?[6-9]\d{9}$/;

export default function WorkersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state & field-level errors
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterZone, setFilterZone] = useState('ALL');
  const [formErrors, setFormErrors] = useState({});
  const [modalError, setModalError] = useState('');

  // Password editing state
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  const isSoftwareAdmin = user?.role === 'SOFTWARE_ADMIN';

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: isSoftwareAdmin ? 'MUNICIPAL_ADMIN' : 'DRIVER',
    assignedZoneId: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [usersRes, zonesRes] = await Promise.all([
        api.getAdminUsers(),
        api.getZones(),
      ]);
      setUsers(usersRes.users || []);
      setZones(zonesRes.zones || []);
      if (zonesRes.zones?.length > 0 && !form.assignedZoneId) {
        setForm((prev) => ({ ...prev, assignedZoneId: zonesRes.zones[0].id }));
      }
    } catch (err) {
      setError(err.message || 'Failed to load directory data');
    } finally {
      setLoading(false);
    }
  }

  function validateForm() {
    const errors = {};
    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();
    const trimmedPhone = form.phone.trim();

    if (!trimmedName) {
      errors.name = 'Full name is required.';
    } else if (trimmedName.length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    }

    if (!trimmedEmail) {
      errors.email = 'Official email address is required.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Invalid email address (e.g. admin@ecocampus.org or user@gmail.com).';
    }

    if (!trimmedPhone) {
      errors.phone = 'Phone number is required.';
    } else if (!PHONE_PATTERN.test(trimmedPhone)) {
      errors.phone = 'Invalid phone number. Enter a 10-digit mobile number (e.g. 9876543210 or +91 9876543210).';
    }

    if (!form.password) {
      errors.password = 'Initial password is required.';
    } else if (form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }

    if (!isSoftwareAdmin && !form.assignedZoneId) {
      errors.assignedZoneId = 'Please select an assigned zone.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setModalError('');

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    const targetRole = isSoftwareAdmin ? 'MUNICIPAL_ADMIN' : 'DRIVER';
    try {
      await api.createAdminUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        role: targetRole,
        assignedZoneId: targetRole === 'DRIVER' ? form.assignedZoneId : null,
      });

      setSuccess(`Successfully onboarded ${form.name.trim()} as ${isSoftwareAdmin ? 'Municipal Administrator' : 'Collection Driver'}`);
      setShowAddModal(false);
      setModalError('');
      setFormErrors({});
      setForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: targetRole,
        assignedZoneId: zones[0]?.id || '',
      });
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to create member');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(targetUser) {
    try {
      await api.updateAdminUser(targetUser.id, { isActive: !targetUser.isActive });
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isActive: !u.isActive } : u))
      );
      setSuccess(`Updated status for ${targetUser.name}`);
    } catch (err) {
      setError(err.message || 'Failed to update status');
    }
  }

  async function handleZoneChange(userId, newZoneId) {
    try {
      await api.updateAdminUser(userId, { assignedZoneId: newZoneId || null });
      const selectedZone = zones.find((z) => z.id === newZoneId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, assignedZoneId: newZoneId, assignedZone: selectedZone ? { name: selectedZone.name } : null }
            : u
        )
      );
      setSuccess('Zone assignment updated successfully');
    } catch (err) {
      setError(err.message || 'Failed to change zone');
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    setPasswordUpdating(true);
    setError('');
    setSuccess('');
    try {
      await api.updateAdminUser(passwordModalUser.id, { password: newPassword });
      setSuccess(`Password for ${passwordModalUser.name} updated successfully!`);
      setPasswordModalUser(null);
      setNewPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setPasswordUpdating(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    if (!isSoftwareAdmin && filterZone !== 'ALL' && u.assignedZoneId !== filterZone) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-sage-900">
              {isSoftwareAdmin ? 'Municipal Administrators Directory' : 'City Workforce & Driver Operations'}
            </h1>
            <span className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
              {isSoftwareAdmin ? 'Software Admin Mode' : 'Municipal Control Mode'}
            </span>
          </div>
          <p className="mt-1 text-sm text-sage-800">
            {isSoftwareAdmin
              ? 'Onboard and manage Municipal Administrators who govern municipal waste operations across the city.'
              : 'Deploy collection drivers, manage active crew assignments, and balance zone routes across Hubli-Dharwad.'}
          </p>
        </div>

        <Button
          onClick={() => {
            setFormErrors({});
            setForm({
              name: '',
              email: '',
              phone: '',
              password: '',
              role: isSoftwareAdmin ? 'MUNICIPAL_ADMIN' : 'DRIVER',
              assignedZoneId: zones[0]?.id || '',
            });
            setShowAddModal(true);
          }}
          className="bg-forest text-white hover:bg-pine shadow-sm font-semibold"
        >
          {isSoftwareAdmin ? '+ Onboard Municipal Admin' : '+ Add Collection Driver'}
        </Button>
      </div>

      {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}
      {success && <div className="mb-4"><Alert variant="success">{success}</Alert></div>}

      {/* Overview Cards */}
      {isSoftwareAdmin ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-sage-300/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-sage-700">Platform Admins</div>
            <div className="mt-1 text-2xl font-black text-sage-900">{users.length} Active Admin{users.length !== 1 ? 's' : ''}</div>
            <div className="mt-1 text-xs text-sage-800 font-semibold">Authorized to manage wards & drivers</div>
          </div>
          <div className="rounded-xl border border-sage-300/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-sage-700">City Monitored Zones</div>
            <div className="mt-1 text-2xl font-black text-forest">6 Urban Zones</div>
            <div className="mt-1 text-xs text-sage-800 font-semibold">Hubli-Dharwad Municipal Region</div>
          </div>
          <div className="rounded-xl border border-sage-300/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-sage-700">Smart Dustbin Network</div>
            <div className="mt-1 text-2xl font-black text-sage-900">48 Connected Bins</div>
            <div className="mt-1 text-xs text-sage-800 font-semibold">8 IoT sensors deployed per zone</div>
          </div>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {zones.map((zone) => {
            const workerCount = users.filter((u) => u.assignedZoneId === zone.id && u.isActive).length;
            return (
              <div
                key={zone.id}
                className="rounded-xl border border-sage-300/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-sm"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-sage-700">
                  {zone.shortName}
                </div>
                <div className="mt-1 text-sm font-bold text-sage-900 truncate">{zone.name}</div>
                <div className="mt-3 flex items-center justify-between text-xs font-semibold text-sage-800 border-t border-sage-200 pt-2">
                  <span>{workerCount} Driver{workerCount !== 1 ? 's' : ''}</span>
                  <span className="text-forest font-bold">8 Bins</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Table Card */}
      <Card className="border-sage-300/80 bg-white/75 backdrop-blur-md">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-sage-200 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-sage-700">
              {isSoftwareAdmin ? 'Municipal Administrators' : 'Filter by Zone:'}
            </span>

            {!isSoftwareAdmin && (
              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 text-xs font-semibold text-sage-900 outline-none focus:border-forest"
              >
                <option value="ALL">All City Zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="text-xs font-bold text-sage-800">
            Total {isSoftwareAdmin ? 'Administrators' : 'Drivers'}: {filteredUsers.length}
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm font-semibold text-sage-800">
            {isSoftwareAdmin
              ? 'No Municipal Administrators registered yet. Click "+ Onboard Municipal Admin" above.'
              : 'No drivers or collectors found for the selected zone.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-sage-200 text-xs font-bold uppercase tracking-wider text-sage-700">
                  <th className="pb-3">{isSoftwareAdmin ? 'Administrator' : 'Driver / Worker'}</th>
                  <th className="pb-3">Contact</th>
                  <th className="pb-3">Role</th>
                  {!isSoftwareAdmin && <th className="pb-3">Assigned Zone</th>}
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-200/80">
                {filteredUsers.map((u) => {
                  return (
                    <tr key={u.id} className="hover:bg-sage-50/50 transition-colors">
                      <td className="py-3.5 pr-4">
                        <div className="font-bold text-sage-900">{u.name}</div>
                        <div className="text-xs text-sage-700">{u.email}</div>
                      </td>
                      <td className="py-3.5 pr-4 text-xs font-medium text-sage-900">
                        {u.phone || '—'}
                      </td>
                      <td className="py-3.5 pr-4">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                            u.role === 'MUNICIPAL_ADMIN'
                              ? 'bg-blue-100 text-blue-900 border-blue-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {u.role === 'MUNICIPAL_ADMIN' ? 'Municipal Admin' : 'Driver & Collector'}
                        </span>
                      </td>

                      {!isSoftwareAdmin && (
                        <td className="py-3.5 pr-4">
                          <select
                            value={u.assignedZoneId || ''}
                            onChange={(e) => handleZoneChange(u.id, e.target.value)}
                            className="rounded-md border border-sage-300 bg-white px-2 py-1 text-xs font-bold text-sage-900 focus:border-forest outline-none"
                          >
                            <option value="">Unassigned</option>
                            {zones.map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}

                      <td className="py-3.5 pr-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            u.isActive ? 'bg-mint text-forest' : 'bg-sage-200 text-sage-700'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-forest' : 'bg-sage-500'}`} />
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordModalUser(u);
                              setNewPassword('');
                            }}
                            className="rounded-lg border border-sage-300 bg-white px-2.5 py-1 text-xs font-bold text-sage-800 hover:border-forest hover:text-forest hover:bg-sage-50 transition-colors shadow-2xs"
                            title="Change or reset password"
                          >
                            🔑 Edit Password
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition-colors ${
                              u.isActive
                                ? 'border-amber-300 text-amber-800 hover:bg-amber-50'
                                : 'border-sage-400 text-forest hover:bg-mint/40'
                            }`}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-sage-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-sage-200 pb-3">
              <h2 className="text-lg font-bold text-sage-900">
                {isSoftwareAdmin ? 'Onboard Municipal Administrator' : 'Add Collection Driver'}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-sage-600 hover:bg-sage-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 flex flex-col gap-3.5">
              {modalError && <Alert variant="error">{modalError}</Alert>}

              <Input
                label="Full Name"
                value={form.name}
                error={formErrors.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }));
                }}
                placeholder={isSoftwareAdmin ? 'e.g. Anand Hegde' : 'e.g. Ramesh Kumar'}
                required
              />

              <Input
                label="Official Email Address"
                type="email"
                value={form.email}
                error={formErrors.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                  if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: '' }));
                }}
                placeholder={isSoftwareAdmin ? 'admin.hubli@ecocampus.org' : 'driver@ecocampus.org'}
                required
              />

              <Input
                label="Phone Number"
                type="tel"
                value={form.phone}
                error={formErrors.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value });
                  if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: '' }));
                }}
                placeholder="+91 98765 43210"
                required
              />

              <Input
                label="Initial Password"
                type="password"
                value={form.password}
                error={formErrors.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: '' }));
                }}
                placeholder="Min. 8 characters"
                required
                minLength={8}
              />

              <div className="rounded-lg bg-sage-50 border border-sage-200 p-2.5 text-xs text-sage-800">
                <span className="font-bold">Role: </span>
                <span>{isSoftwareAdmin ? 'Municipal Administrator (Full City & Driver Control)' : 'Collection Driver'}</span>
              </div>

              {!isSoftwareAdmin && (
                <Select
                  label="Initial Assigned Zone"
                  value={form.assignedZoneId}
                  error={formErrors.assignedZoneId}
                  onChange={(e) => {
                    setForm({ ...form, assignedZoneId: e.target.value });
                    if (formErrors.assignedZoneId) setFormErrors((prev) => ({ ...prev, assignedZoneId: '' }));
                  }}
                  required
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.shortName})
                    </option>
                  ))}
                </Select>
              )}

              <div className="mt-3 flex items-center justify-end gap-2 pt-3 border-t border-sage-200">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-forest text-white hover:bg-pine font-semibold"
                >
                  {submitting
                    ? 'Creating...'
                    : isSoftwareAdmin
                    ? 'Onboard Municipal Admin'
                    : 'Create Driver'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-sage-300 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sage-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-sage-900">
                  Edit Password
                </h3>
                <p className="text-xs text-sage-600">
                  Update credentials for <span className="font-semibold text-sage-900">{passwordModalUser.name}</span> ({passwordModalUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="rounded-lg p-1 text-sage-600 hover:bg-sage-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="mt-4 flex flex-col gap-4">
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter at least 8 characters"
                required
                minLength={8}
                autoFocus
              />

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                ⚠️ The user will immediately be able to log in with this new password.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-sage-200">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPasswordModalUser(null)}
                  disabled={passwordUpdating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={passwordUpdating}
                  className="bg-forest text-white hover:bg-pine font-semibold"
                >
                  {passwordUpdating ? 'Updating...' : 'Save New Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
