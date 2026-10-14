import { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  PlusCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  X,
  FileText,
  Sparkles,
  RadioTower,
  Navigation,
  QrCode,
  Leaf,
  Droplets,
  Calendar,
  TrendingUp,
  Loader2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import NotificationDropdown from '../components/NotificationDropdown';
import FoodSafetyBadge from '../components/FoodSafetyBadge';
import DeliveryStatusTimeline from '../components/DeliveryStatusTimeline';
import DeliveryTrackingMap from '../components/DeliveryTrackingMap';
import useSocket, { joinDeliveryRoom, leaveDeliveryRoom } from '../hooks/useSocket';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // overview, users, donations, deliveries, audit
  const [stats, setStats] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [donationsList, setDonationsList] = useState([]);
  const [requirementsList, setRequirementsList] = useState([]);
  const [allocationsList, setAllocationsList] = useState([]);
  const [deliveriesList, setDeliveriesList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');

  // Feature 6: Impact Analytics & Period Filter
  const [impactData, setImpactData] = useState(null);
  const [impactPeriod, setImpactPeriod] = useState('all');

  // Feature 1 & 3: Live Delivery Tracking Modal
  const [trackingModal, setTrackingModal] = useState({
    isOpen: false,
    deliveryId: null,
    delivery: null,
    timeline: [],
    loading: false
  });

  // Feature 2: Smart Volunteer Assignment Modal
  const [smartAssignModal, setSmartAssignModal] = useState({
    isOpen: false,
    delivery: null,
    recommendations: [],
    loading: false,
    assigning: false
  });

  // User Filter
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');

  // Add User Modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '1234',
    phone: '',
    role: 'donor',
    recipientType: 'ngo',
    organizationName: '',
    address: ''
  });

  // Allocation Modal
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [selectedDonationId, setSelectedDonationId] = useState('');
  const [selectedRequirementId, setSelectedRequirementId] = useState('');

  // Socket.io for live updates
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      loadAdminData();
    };
    socket.on('delivery:update', handleUpdate);
    socket.on('delivery:status', handleUpdate);
    socket.on('donation:created', handleUpdate);
    socket.on('allocation:created', handleUpdate);

    return () => {
      socket.off('delivery:update', handleUpdate);
      socket.off('delivery:status', handleUpdate);
      socket.off('donation:created', handleUpdate);
      socket.off('allocation:created', handleUpdate);
    };
  }, [socket]);

  const loadAdminData = async (targetPeriod = impactPeriod) => {
    try {
      setLoading(true);
      const [
        statsRes,
        usersRes,
        donationsRes,
        requirementsRes,
        allocationsRes,
        deliveriesRes,
        auditRes,
        impactRes
      ] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/users'),
        api.get('/api/admin/donations'),
        api.get('/api/admin/requirements'),
        api.get('/api/admin/allocations'),
        api.get('/api/admin/deliveries'),
        api.get('/api/admin/audit-log'),
        api.get(`/api/admin/impact?period=${targetPeriod}`).catch(() => ({ data: null }))
      ]);

      setStats(statsRes.data.stats || {});
      setUsersList(usersRes.data.users || []);
      setDonationsList(donationsRes.data.donations || []);
      setRequirementsList(requirementsRes.data.requirements || []);
      setAllocationsList(allocationsRes.data.allocations || []);
      setDeliveriesList(deliveriesRes.data.deliveries || []);
      setAuditLogs(auditRes.data.auditLog || []);
      setImpactData(impactRes?.data || null);
    } catch (error) {
      console.error('Failed to load admin platform data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = async (period) => {
    setImpactPeriod(period);
    try {
      const res = await api.get(`/api/admin/impact?period=${period}`);
      setImpactData(res.data);
    } catch (err) {
      console.error('Failed to fetch period impact:', err);
    }
  };

  const openTracking = async (deliveryId) => {
    setTrackingModal({ isOpen: true, deliveryId, delivery: null, timeline: [], loading: true });
    try {
      joinDeliveryRoom(deliveryId);
      const res = await api.get(`/api/deliveries/${deliveryId}`);
      setTrackingModal({
        isOpen: true,
        deliveryId,
        delivery: res.data.delivery,
        timeline: res.data.timeline || [],
        loading: false
      });
    } catch (err) {
      alert(err.response?.data?.message || 'Unable to load delivery tracking.');
      setTrackingModal({ isOpen: false, deliveryId: null, delivery: null, timeline: [], loading: false });
    }
  };

  const closeTracking = () => {
    if (trackingModal.deliveryId) {
      leaveDeliveryRoom(trackingModal.deliveryId);
    }
    setTrackingModal({ isOpen: false, deliveryId: null, delivery: null, timeline: [], loading: false });
  };

  const openSmartAssign = async (delivery) => {
    setSmartAssignModal({ isOpen: true, delivery, recommendations: [], loading: true, assigning: false });
    try {
      const res = await api.get(`/api/deliveries/${delivery.delivery_id}/recommend-volunteers`);
      setSmartAssignModal({
        isOpen: true,
        delivery,
        recommendations: res.data.recommendations || [],
        loading: false,
        assigning: false
      });
    } catch (err) {
      alert(err.response?.data?.message || 'Unable to calculate recommendations.');
      setSmartAssignModal({ isOpen: false, delivery: null, recommendations: [], loading: false, assigning: false });
    }
  };

  const handleAssignVolunteer = async (volunteerId) => {
    if (!smartAssignModal.delivery) return;
    setSmartAssignModal(prev => ({ ...prev, assigning: true }));
    try {
      await api.post(`/api/deliveries/${smartAssignModal.delivery.delivery_id}/assign-volunteer`, {
        volunteerId: Number(volunteerId)
      });
      setActionMessage('Volunteer successfully assigned!');
      setSmartAssignModal({ isOpen: false, delivery: null, recommendations: [], loading: false, assigning: false });
      await loadAdminData();
    } catch (err) {
      alert(err.response?.data?.message || 'Assignment failed.');
      setSmartAssignModal(prev => ({ ...prev, assigning: false }));
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const updateUserStatus = async (userId, action) => {
    try {
      await api.patch(`/api/admin/users/${userId}/status`, { action });
      setActionMessage(`User status updated: ${action}`);
      await loadAdminData();
    } catch (error) {
      setActionMessage(error.response?.data?.message || 'Unable to update user status.');
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user and their data?')) return;
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setActionMessage('User successfully deleted.');
      await loadAdminData();
    } catch (error) {
      setActionMessage(error.response?.data?.message || 'Unable to delete user.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/users', newUserForm);
      setActionMessage('New user created successfully!');
      setShowAddUserModal(false);
      setNewUserForm({
        name: '',
        email: '',
        password: '1234',
        phone: '',
        role: 'donor',
        recipientType: 'ngo',
        organizationName: '',
        address: ''
      });
      await loadAdminData();
    } catch (error) {
      setActionMessage(error.response?.data?.message || 'Failed to create user.');
    }
  };

  const handleCreateAllocation = async (e) => {
    e.preventDefault();
    if (!selectedDonationId || !selectedRequirementId) {
      alert('Please select both a donation and requirement.');
      return;
    }
    try {
      await api.post('/api/matches/allocate', {
        donationId: Number(selectedDonationId),
        requirementId: Number(selectedRequirementId)
      });
      setActionMessage('Allocation confirmed and volunteer assigned!');
      setShowAllocateModal(false);
      setSelectedDonationId('');
      setSelectedRequirementId('');
      await loadAdminData();
    } catch (error) {
      setActionMessage(error.response?.data?.message || 'Unable to complete allocation.');
    }
  };

  const downloadReport = async (type) => {
    try {
      const response = await api.get(`/api/admin/export?type=${type}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `foodbridge_${type}_report_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Unable to download export.');
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const roleMatch = userRoleFilter === 'all' || u.role === userRoleFilter;
      const searchMatch =
        !userSearch ||
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase());
      return roleMatch && searchMatch;
    });
  }, [usersList, userRoleFilter, userSearch]);

  const userDistributionData = useMemo(() => {
    if (!stats?.users) return [];
    return Object.entries(stats.users).map(([role, count]) => ({
      name: role.toUpperCase(),
      value: count
    }));
  }, [stats]);

  const summaryChartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Donations', count: stats.donations || 0 },
      { name: 'Needs', count: stats.requirements || 0 },
      { name: 'Allocations', count: stats.allocations || 0 },
      { name: 'Deliveries', count: stats.deliveries || 0 }
    ];
  }, [stats]);

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Top Header */}
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">FoodBridge System Admin</h1>
                <span className="rounded-full border border-purple-500/40 bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  Super Administrator
                </span>
              </div>
              <p className="text-xs text-slate-400">Total Platform Governance & Data Analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationDropdown />
            <button
              onClick={() => downloadReport('donations')}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500 hover:text-white"
            >
              <Download size={14} /> Quick CSV Export
            </button>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-300"
            >
              Log out
            </button>
          </div>
        </header>

        {/* Global Action Message */}
        {actionMessage && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage('')} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'overview', label: 'Platform Analytics', icon: Activity },
            { id: 'users', label: 'User Directory', icon: Users },
            { id: 'donations', label: 'Donations & Needs', icon: Boxes },
            { id: 'deliveries', label: 'Deliveries & Logistics', icon: Truck },
            { id: 'audit', label: 'Security Audit Logs', icon: ShieldAlert },
            { id: 'reports', label: 'Data Reports', icon: FileText }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeTab === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'border border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Overview & Analytics */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card-surface rounded-2xl p-5 shadow-lg">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Total Donations</span>
                <p className="mt-3 text-3xl font-extrabold text-white">{stats?.donations ?? 0}</p>
                <p className="mt-1 text-xs text-emerald-400">{stats?.activeDonations ?? 0} currently available</p>
              </div>

              <div className="card-surface rounded-2xl p-5 shadow-lg">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Open Requirements</span>
                <p className="mt-3 text-3xl font-extrabold text-white">{stats?.requirements ?? 0}</p>
                <p className="mt-1 text-xs text-amber-400">{stats?.openRequirements ?? 0} waiting for food</p>
              </div>

              <div className="card-surface rounded-2xl p-5 shadow-lg">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Allocations Made</span>
                <p className="mt-3 text-3xl font-extrabold text-white">{stats?.allocations ?? 0}</p>
                <p className="mt-1 text-xs text-sky-400">Matched meals</p>
              </div>

              <div className="card-surface rounded-2xl p-5 shadow-lg">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Registered Users</span>
                <p className="mt-3 text-3xl font-extrabold text-white">{usersList.length}</p>
                <p className="mt-1 text-xs text-purple-400">Across all platform roles</p>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card-surface rounded-3xl p-6 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-4">Platform Activity Overview</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summaryChartData}>
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      />
                      <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card-surface rounded-3xl p-6 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-4">User Role Distribution</h3>
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={userDistributionData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {userDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Feature 6: Real-Time Impact & Environmental Sustainability Metrics */}
            <div className="card-surface rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Leaf className="text-emerald-400" size={18} />
                    Real-Time Environmental & Food Waste Impact
                  </h3>
                  <p className="text-xs text-slate-400">Calculated dynamically from verified completed deliveries</p>
                </div>

                {/* Period Selector */}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  {[
                    { id: 'all', label: 'All Time' },
                    { id: 'month', label: '30 Days' },
                    { id: 'week', label: '7 Days' },
                    { id: 'today', label: 'Today' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePeriodChange(p.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        impactPeriod === p.id
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp size={14} /> Meals Rescued
                  </span>
                  <p className="mt-2 text-2xl font-extrabold text-white">
                    {impactData?.totalMealsRescued ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {impactData?.completedDeliveries ?? 0} completed dispatches
                  </p>
                </div>

                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Boxes size={14} /> Food Weight Saved
                  </span>
                  <p className="mt-2 text-2xl font-extrabold text-white">
                    {impactData?.totalWeightKg ?? 0} <span className="text-sm font-normal text-slate-400">kg</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {impactData?.inTransitMeals ?? 0} units active in-transit
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Leaf size={14} /> CO2e Emissions Avoided
                  </span>
                  <p className="mt-2 text-2xl font-extrabold text-white">
                    {impactData?.co2AvoidedKg ?? 0} <span className="text-sm font-normal text-slate-400">kg CO2e</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    2.5 kg CO2e / kg rescued food
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Droplets size={14} /> Water Conserved
                  </span>
                  <p className="mt-2 text-2xl font-extrabold text-white">
                    {(impactData?.waterSavedLiters ?? 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">L</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Embedded water footprint
                  </p>
                </div>
              </div>

              {/* Transparent Methodology Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Methodology & Estimation Assumptions:</span> Calculations use empirical standard food waste recovery models: 1 meal serving &asymp; 0.42 kg (global food loss estimate); 2.5 kg CO2e GHG avoided per 1 kg of food rescued from landfill degradation (EPA WARM & FAO Food Wastage Footprint methodology); 1,000 L embedded freshwater conserved per 1 kg food preserved. Estimates are computed strictly from stored completed dispatches without hardcoded figures.
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: User Directory */}
        {activeTab === 'users' && (
          <div className="card-surface rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Platform Users Directory</h2>
                <p className="text-xs text-slate-400">Manage status, verification, and credentials</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20"
                >
                  <PlusCircle size={14} /> Add New User
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user by name or email..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400 outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-white focus:border-emerald-400 outline-none"
                >
                  <option value="all">All Roles</option>
                  <option value="donor">Donors</option>
                  <option value="recipient">Recipients</option>
                  <option value="volunteer">Volunteers</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.user_id} className="hover:bg-slate-900/30">
                        <td className="px-4 py-3 font-medium text-white">
                          <div>{u.name}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                          {u.phone && <div className="text-[10px] text-slate-500">📞 {u.phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              u.role === 'admin'
                                ? 'bg-purple-500/20 text-purple-300'
                                : u.role === 'donor'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : u.role === 'recipient'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-[11px]">
                          {u.donor_org || u.recipient_org || u.volunteer_vehicle || '—'}
                          {u.recipient_type && ` (${u.recipient_type.toUpperCase()})`}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              u.is_verified
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {u.is_verified ? 'Verified' : 'Suspended / Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.is_verified ? (
                              <button
                                type="button"
                                onClick={() => updateUserStatus(u.user_id, 'suspend')}
                                className="rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/10"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateUserStatus(u.user_id, 'verify')}
                                className="rounded-lg border border-emerald-500/30 px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/10"
                              >
                                Verify
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteUser(u.user_id)}
                              className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                              title="Delete User"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Donations & Needs */}
        {activeTab === 'donations' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Platform Donations & Allocations</h2>
              <button
                type="button"
                onClick={() => setShowAllocateModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20"
              >
                <PlusCircle size={14} /> Create Manual Allocation
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* All Donations */}
              <div className="card-surface rounded-3xl p-6 shadow-xl space-y-3">
                <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">
                  All Donations ({donationsList.length})
                </h3>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                  {donationsList.map((d) => (
                    <div key={d.donation_id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-white">{d.food_type}</span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                          {d.status}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-400">
                        Donor: <strong>{d.donor_name}</strong> · Remaining: {d.remaining_quantity}/{d.quantity} units
                      </p>
                      <div className="mt-2">
                        <FoodSafetyBadge donation={d} />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Deadline: {new Date(d.safe_use_deadline).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* All Requirements */}
              <div className="card-surface rounded-3xl p-6 shadow-xl space-y-3">
                <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">
                  All Requirements ({requirementsList.length})
                </h3>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                  {requirementsList.map((r) => (
                    <div key={r.requirement_id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-white">{r.food_type}</span>
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase">
                          {r.status}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-400">
                        Recipient: <strong>{r.recipient_name}</strong> · Remaining: {r.remaining_quantity}/{r.quantity_required} units
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">Needed: {new Date(r.required_time).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Deliveries */}
        {activeTab === 'deliveries' && (
          <div className="card-surface rounded-3xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
              Delivery Logistics & Dispatch Tracking ({deliveriesList.length})
            </h2>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Run ID</th>
                    <th className="px-4 py-3">Food Item</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Donor</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Volunteer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                  {deliveriesList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No active deliveries recorded.
                      </td>
                    </tr>
                  ) : (
                    deliveriesList.map((del) => (
                      <tr key={del.delivery_id} className="hover:bg-slate-900/30">
                        <td className="px-4 py-3 font-mono text-emerald-400">#{del.delivery_id}</td>
                        <td className="px-4 py-3 font-semibold text-white">{del.food_type}</td>
                        <td className="px-4 py-3 text-slate-300">{del.allocated_quantity} units</td>
                        <td className="px-4 py-3 text-slate-400">{del.donor_name}</td>
                        <td className="px-4 py-3 text-slate-400">{del.recipient_name}</td>
                        <td className="px-4 py-3 font-medium text-slate-200">{del.volunteer_name || 'Unassigned'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              del.status === 'delivered' || del.status === 'confirmed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {del.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openTracking(del.delivery_id)}
                              className="flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20 transition"
                              title="Live GPS & Timeline Tracking"
                            >
                              <RadioTower size={12} className="animate-pulse" /> Track Live
                            </button>
                            {del.status !== 'delivered' && del.status !== 'cancelled' && del.status !== 'failed' && (
                              <button
                                type="button"
                                onClick={() => openSmartAssign(del)}
                                className="flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/20 transition"
                                title="Smart Volunteer Recommendations"
                              >
                                <Sparkles size={12} /> Assign Volunteer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Audit Log */}
        {activeTab === 'audit' && (
          <div className="card-surface rounded-3xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
              Real-Time Security & Action Audit Logs
            </h2>

            <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
              {auditLogs.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-500">No audit activity logged yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.audit_id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-emerald-400 font-semibold">{log.action}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {log.entity_type} #{log.entity_id}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-400">
                        Actor: {log.user_name || 'System'} ({log.user_email || 'internal'})
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Reports & Export */}
        {activeTab === 'reports' && (
          <div className="card-surface rounded-3xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
              Export Official System Reports (CSV)
            </h2>
            <p className="text-xs text-slate-400">
              Download certified data exports for audits, reporting, and external analysis.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4">
              {[
                { type: 'donations', title: 'Food Donations Log', desc: 'All surplus donations, statuses, and donors' },
                { type: 'requirements', title: 'Recipient Requirements', desc: 'Open and fulfilled food needs log' },
                { type: 'deliveries', title: 'Delivery Dispatches', desc: 'Volunteer transit times and completion records' },
                { type: 'users', title: 'Registered Users', desc: 'Complete user directory and verification statuses' },
                { type: 'audit', title: 'Security Audit Trail', desc: 'Full log of administrative and user actions' }
              ].map((r) => (
                <div key={r.type} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-sm">{r.title}</h3>
                    <p className="mt-1 text-xs text-slate-400">{r.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadReport(r.type)}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                  >
                    <Download size={14} /> Download CSV
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: Add User */}
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="card-surface w-full max-w-md rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Create New Platform User</h3>
                <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                  <input
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">4-Digit Password PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    required
                    placeholder="1234"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none tracking-widest focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Role</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  >
                    <option value="donor">Food Donor</option>
                    <option value="recipient">NGO / Recipient</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {newUserForm.role === 'recipient' && (
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Recipient Category</label>
                    <select
                      value={newUserForm.recipientType}
                      onChange={(e) => setNewUserForm({ ...newUserForm, recipientType: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                    >
                      <option value="ngo">Registered NGO / Shelter</option>
                      <option value="individual">Individual Recipient</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Organization / Shelter Name</label>
                  <input
                    value={newUserForm.organizationName}
                    onChange={(e) => setNewUserForm({ ...newUserForm, organizationName: e.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 rounded-xl bg-emerald-500 py-2.5 font-bold text-slate-950 hover:bg-emerald-400 transition"
                >
                  Create User
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Manual Allocation */}
        {showAllocateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="card-surface w-full max-w-md rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Create Food Allocation</h3>
                <button onClick={() => setShowAllocateModal(false)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateAllocation} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Select Available Donation</label>
                  <select
                    value={selectedDonationId}
                    onChange={(e) => setSelectedDonationId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  >
                    <option value="">-- Choose donation --</option>
                    {donationsList
                      .filter((d) => d.status === 'available' && d.remaining_quantity > 0)
                      .map((d) => (
                        <option key={d.donation_id} value={d.donation_id}>
                          #{d.donation_id} {d.food_type} ({d.remaining_quantity} units available)
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Select Open Requirement</label>
                  <select
                    value={selectedRequirementId}
                    onChange={(e) => setSelectedRequirementId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  >
                    <option value="">-- Choose requirement --</option>
                    {requirementsList
                      .filter((r) => r.status !== 'fulfilled' && r.status !== 'cancelled' && r.remaining_quantity > 0)
                      .map((r) => (
                        <option key={r.requirement_id} value={r.requirement_id}>
                          #{r.requirement_id} {r.food_type} ({r.remaining_quantity} needed - {r.recipient_name})
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 rounded-xl bg-emerald-500 py-2.5 font-bold text-slate-950 hover:bg-emerald-400 transition"
                >
                  Confirm Allocation
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Live Delivery Tracking Modal (Feature 1 & 3) */}
        {trackingModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={e => e.target === e.currentTarget && closeTracking()}>
            <div className="card-surface w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Truck className="text-emerald-400" size={20} />
                  <h3 className="text-base font-bold text-white">Admin Live Delivery Tracking (Run #{trackingModal.deliveryId})</h3>
                </div>
                <button onClick={closeTracking} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              {trackingModal.loading ? (
                <div className="py-12 flex justify-center"><Loader2 size={32} className="animate-spin text-emerald-400" /></div>
              ) : trackingModal.delivery ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/50 p-2">
                    <DeliveryTrackingMap delivery={trackingModal.delivery} />
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                      <Activity size={13} className="text-emerald-400" /> Status Progression Timeline
                    </h4>
                    <DeliveryStatusTimeline history={trackingModal.timeline} currentStatus={trackingModal.delivery.delivery_status} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Smart Volunteer Recommendation & Assignment Modal (Feature 2) */}
        {smartAssignModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={e => e.target === e.currentTarget && setSmartAssignModal(prev => ({ ...prev, isOpen: false }))}>
            <div className="card-surface w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-purple-400" size={20} />
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Smart Volunteer Assignment (Run #{smartAssignModal.delivery?.delivery_id})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Item: {smartAssignModal.delivery?.food_type} ({smartAssignModal.delivery?.allocated_quantity} units)
                    </p>
                  </div>
                </div>
                <button onClick={() => setSmartAssignModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {smartAssignModal.loading ? (
                <div className="py-12 flex justify-center"><Loader2 size={32} className="animate-spin text-purple-400" /></div>
              ) : smartAssignModal.recommendations.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No available volunteers currently active in the area.
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-300 font-semibold">
                    Recommended Candidates Ranked by Intelligent Distance, Workload & Urgency Scoring:
                  </p>
                  {smartAssignModal.recommendations.map((rec, idx) => (
                    <div
                      key={rec.volunteerId}
                      className={`rounded-2xl border p-4 transition ${
                        idx === 0
                          ? 'border-purple-500/50 bg-purple-500/10'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-sm">{rec.name}</h4>
                            {idx === 0 && (
                              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
                                #1 Recommended Match
                              </span>
                            )}
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                              Vehicle: {rec.vehicleType || 'Standard'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{rec.email} · {rec.phone || 'Phone on file'}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                            <span>Pickup Distance: <strong className="text-white">{rec.distanceToPickupKm != null ? `${rec.distanceToPickupKm} km` : 'Base station'}</strong></span>
                            <span>Active Workload: <strong className="text-white">{rec.currentWorkload} tasks</strong></span>
                            <span>Smart Score: <strong className="text-purple-300">{rec.totalScore}/100</strong></span>
                          </div>
                          {rec.recommendationReason && (
                            <p className="text-[11px] text-purple-200/80 mt-1 italic">
                              "{rec.recommendationReason}"
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={smartAssignModal.assigning}
                          onClick={() => handleAssignVolunteer(rec.volunteerId)}
                          className="rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400 transition disabled:opacity-50 whitespace-nowrap shadow-md shadow-purple-500/20"
                        >
                          {smartAssignModal.assigning ? 'Assigning...' : 'Assign to Run'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
