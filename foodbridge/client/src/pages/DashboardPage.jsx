import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Boxes,
  HeartHandshake,
  ShieldCheck,
  Truck,
  PlusCircle,
  Package,
  MapPin,
  Clock,
  Search,
  Filter,
  Trash2,
  Edit3,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  QrCode,
  RadioTower,
  Eye,
  Loader2,
  Phone,
  ShieldAlert
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LocationMapPicker from '../components/LocationMapPicker';
import NotificationDropdown from '../components/NotificationDropdown';
import FoodSafetyBadge from '../components/FoodSafetyBadge';
import DeliveryStatusTimeline from '../components/DeliveryStatusTimeline';
import DeliveryTrackingMap from '../components/DeliveryTrackingMap';
import { QRCodeSVG } from 'qrcode.react';
import useSocket, { joinDeliveryRoom, leaveDeliveryRoom } from '../hooks/useSocket';

const FOOD_CATEGORIES = [
  'Cooked Meals',
  'Rice & Grains',
  'Fresh Vegetables',
  'Fresh Fruits',
  'Bread & Bakery',
  'Dairy Products',
  'Packaged Food',
  'Beverages'
];

const donationDefaults = {
  foodType: 'Cooked Meals',
  customFoodType: '',
  quantity: '',
  unit: 'servings',
  storageType: 'ambient',
  storageTemperatureC: '',
  allergens: 'None',
  foodCondition: 'fresh_hot',
  preparationTime: '',
  safeUseDeadline: new Date().toISOString().slice(0,16),
  locationLat: 11.341,
  locationLng: 77.7172,
  status: 'available'
};

const requirementDefaults = {
  foodType: 'Cooked Meals',
  customFoodType: '',
  quantityRequired: '',
  requiredTime: '',
  locationLat: 11.341,
  locationLng: 77.7172,
  priority: 'medium',
  status: 'pending'
};

function formatDateTime(value) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [donationForm, setDonationForm] = useState(donationDefaults);
  const [requirementForm, setRequirementForm] = useState(requirementDefaults);
  const [showMapModal, setShowMapModal] = useState(false);
  const [activeMapTarget, setActiveMapTarget] = useState('donation');

  const [myDonations, setMyDonations] = useState([]);
  const [myRequirements, setMyRequirements] = useState([]);
  const [openNeeds, setOpenNeeds] = useState([]);
  const [forecastSummary, setForecastSummary] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Edit modal
  const [editingItem, setEditingItem] = useState(null);
  const [claimDonationTarget, setClaimDonationTarget] = useState(null);

  // Feature 4: Safety Alerts
  const [safetyAlerts, setSafetyAlerts] = useState([]);

  // Feature 1 & 3: Live Delivery Tracking Modal
  const [trackingModal, setTrackingModal] = useState({
    isOpen: false,
    deliveryId: null,
    delivery: null,
    timeline: [],
    loading: false
  });

  // Feature 7: QR Code Display Modal
  const [qrModal, setQrModal] = useState({
    isOpen: false,
    mode: 'pickup',
    deliveryId: null,
    data: null,
    loading: false,
    error: ''
  });

  // Feature 4: Report Food Safety Issue Modal
  const [safetyReportModal, setSafetyReportModal] = useState({
    isOpen: false,
    donationId: null,
    reason: 'expired',
    notes: '',
    submitting: false,
    success: false
  });

  // Feature 1: Real-time Socket.io updates
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      loadDashboardData();
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

  useEffect(() => {
    if (user?.role === 'volunteer') {
      navigate('/volunteer', { replace: true });
      return;
    }
    if (user?.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  const loadDashboardData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      if (user.role === 'donor') {
        const [donationsRes, needsRes, forecastRes, safetyRes] = await Promise.all([
          api.get('/api/donations/mine'),
          api.get('/api/requirements/open'),
          api.get('/api/forecast/summary'),
          api.get('/api/donations/safety/alerts').catch(() => ({ data: { alerts: [] } }))
        ]);
        setMyDonations(donationsRes.data.donations || []);
        setOpenNeeds(needsRes.data.requirements || []);
        setForecastSummary(forecastRes.data.summary || []);
        setSafetyAlerts(safetyRes.data.alerts || []);
      } else if (user.role === 'recipient') {
        const [reqsRes, donationsRes, forecastRes, safetyRes] = await Promise.all([
          api.get('/api/requirements/mine'),
          api.get('/api/donations/available'),
          api.get('/api/forecast/summary'),
          api.get('/api/donations/safety/alerts').catch(() => ({ data: { alerts: [] } }))
        ]);
        setMyRequirements(reqsRes.data.requirements || []);
        setOpenNeeds(donationsRes.data.donations || []);
        setForecastSummary(forecastRes.data.summary || []);
        setSafetyAlerts(safetyRes.data.alerts || []);
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Unable to load dashboard data.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [user]);

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

  const openQr = async (deliveryId, mode) => {
    setQrModal({ isOpen: true, mode, deliveryId, data: null, loading: true, error: '' });
    try {
      const res = await api.get(`/api/deliveries/${deliveryId}/qr/${mode}`);
      setQrModal({ isOpen: true, mode, deliveryId, data: res.data, loading: false, error: '' });
    } catch (err) {
      setQrModal({
        isOpen: true,
        mode,
        deliveryId,
        data: null,
        loading: false,
        error: err.response?.data?.message || 'Failed to load QR code.'
      });
    }
  };

  const submitSafetyReport = async (e) => {
    e.preventDefault();
    setSafetyReportModal(prev => ({ ...prev, submitting: true }));
    try {
      await api.post(`/api/donations/${safetyReportModal.donationId}/report-safety`, {
        reason: safetyReportModal.reason,
        notes: safetyReportModal.notes
      });
      setSafetyReportModal(prev => ({ ...prev, submitting: false, success: true }));
      setTimeout(() => {
        setSafetyReportModal({ isOpen: false, donationId: null, reason: 'expired', notes: '', submitting: false, success: false });
        loadDashboardData();
      }, 1500);
    } catch (err) {
      alert(err.response?.data?.message || 'Unable to submit report.');
      setSafetyReportModal(prev => ({ ...prev, submitting: false }));
    }
  };

  const handleDonationSubmit = async (e) => {
    e.preventDefault();
    const finalFoodType =
      donationForm.foodType === 'Other'
        ? donationForm.customFoodType
        : donationForm.foodType;

    if (!finalFoodType) {
      setMessage({ type: 'error', text: 'Please specify the food type.' });
      return;
    }

    try {
      await api.post('/api/donations/create', {
        foodType: finalFoodType,
        quantity: Number(donationForm.quantity),
        unit: donationForm.unit || 'servings',
        storageType: donationForm.storageType || 'ambient',
        storageTemperatureC: donationForm.storageTemperatureC !== '' ? Number(donationForm.storageTemperatureC) : undefined,
        allergens: donationForm.allergens || 'None',
        foodCondition: donationForm.foodCondition || 'fresh_hot',
        preparationTime: donationForm.preparationTime || new Date().toISOString(),
        safeUseDeadline: donationForm.safeUseDeadline,
        locationLat: Number(donationForm.locationLat),
        locationLng: Number(donationForm.locationLng),
        status: 'available'
      });

      setDonationForm(donationDefaults);
      setMessage({ type: 'success', text: 'Donation created successfully and open for allocation!' });
      await loadDashboardData();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Could not create this donation.'
      });
    }
  };

  const handleRequirementSubmit = async (e) => {
    e.preventDefault();
    const finalFoodType =
      requirementForm.foodType === 'Other'
        ? requirementForm.customFoodType
        : requirementForm.foodType;

    if (!finalFoodType) {
      setMessage({ type: 'error', text: 'Please specify the food requirement.' });
      return;
    }

    try {
      await api.post('/api/requirements/create', {
        foodType: finalFoodType,
        quantityRequired: Number(requirementForm.quantityRequired),
        requiredTime: requirementForm.requiredTime,
        locationLat: Number(requirementForm.locationLat),
        locationLng: Number(requirementForm.locationLng),
        priority: requirementForm.priority,
        status: 'pending'
      });

      setRequirementForm(requirementDefaults);
      setMessage({ type: 'success', text: 'Food requirement posted successfully!' });
      await loadDashboardData();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Could not create this requirement.'
      });
    }
  };

  const handleCancelDonation = async (donationId) => {
    if (!window.confirm('Are you sure you want to cancel this donation?')) return;
    try {
      await api.delete(`/api/donations/${donationId}`);
      setMessage({ type: 'success', text: 'Donation cancelled.' });
      await loadDashboardData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Unable to cancel donation.' });
    }
  };

  const handleCancelRequirement = async (requirementId) => {
    if (!window.confirm('Are you sure you want to cancel this food request?')) return;
    try {
      await api.delete(`/api/requirements/${requirementId}`);
      setMessage({ type: 'success', text: 'Requirement cancelled.' });
      await loadDashboardData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Unable to cancel requirement.' });
    }
  };

  // Claim available donation for recipient
  const handleClaimDonation = async (donation) => {
    try {
      let requirementId = null;
      const activeReq = myRequirements.find(
        (r) => r.status !== 'cancelled' && r.status !== 'fulfilled' && r.remaining_quantity > 0
      );

      if (activeReq) {
        requirementId = activeReq.requirement_id;
      } else {
        const createRes = await api.post('/api/requirements/create', {
          foodType: donation.food_type,
          quantityRequired: donation.remaining_quantity,
          requiredTime: donation.safe_use_deadline || new Date(Date.now() + 4 * 3600000).toISOString(),
          priority: 'high',
          status: 'pending'
        });
        requirementId = createRes.data.requirement.requirement_id;
      }

      await api.post('/api/matches/allocate', {
        donationId: donation.donation_id,
        requirementId
      });

      setMessage({
        type: 'success',
        text: `Successfully claimed ${donation.remaining_quantity} units of ${donation.food_type}! Delivery scheduled.`
      });
      setClaimDonationTarget(null);
      await loadDashboardData();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Unable to claim donation.'
      });
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const list = user?.role === 'donor' ? myDonations : myRequirements;
    if (!list.length) {
      alert('No data to export.');
      return;
    }
    const headers = Object.keys(list[0]);
    const lines = [headers.join(',')];
    for (const item of list) {
      const line = headers.map((k) => `"${String(item[k] ?? '').replace(/"/g, '""')}"`).join(',');
      lines.push(line);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foodbridge_${user?.role}_activity.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMyList = useMemo(() => {
    const list = user?.role === 'donor' ? myDonations : myRequirements;
    return list.filter((item) => {
      const fType = (item.food_type || '').toLowerCase();
      const s = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || fType.includes(s);
      const matchCat = categoryFilter === 'all' || fType.includes(categoryFilter.toLowerCase());
      return matchSearch && matchCat;
    });
  }, [myDonations, myRequirements, user?.role, searchTerm, categoryFilter]);

  const filteredOpenNeeds = useMemo(() => {
    return openNeeds.filter((item) => {
      const fType = (item.food_type || '').toLowerCase();
      const s = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || fType.includes(s);
      const matchCat = categoryFilter === 'all' || fType.includes(categoryFilter.toLowerCase());
      return matchSearch && matchCat;
    });
  }, [openNeeds, searchTerm, categoryFilter]);

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Top Navbar */}
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
              <HeartHandshake size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">{user?.name || 'User'}</h1>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  {user?.role === 'donor'
                    ? 'Food Donor'
                    : user?.recipientType === 'individual'
                    ? 'Individual Recipient'
                    : 'NGO / Recipient'}
                </span>
              </div>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationDropdown />
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500 hover:text-white"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-300"
            >
              Log out
            </button>
          </div>
        </header>

        {/* Global Alert Message */}
        {message.text && (
          <div
            className={`mb-6 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage({ type: '', text: '' })} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Food Safety & Expiry Alert Banner (Feature 4) */}
        {safetyAlerts.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-bold text-amber-300 mb-2">
              <ShieldAlert size={16} /> Food Safety & Expiry Action Items ({safetyAlerts.length})
            </div>
            <div className="space-y-1.5 pl-6">
              {safetyAlerts.map((alert, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span>
                    <strong>{alert.foodType}</strong> ({alert.quantity} {alert.unit || 'units'}): {alert.message}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                    alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Active Posts</span>
              <Boxes size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">
              {user?.role === 'donor' ? myDonations.length : myRequirements.length}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {user?.role === 'donor' ? 'Food donations created' : 'Support requests raised'}
            </p>
          </div>

          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Remaining Units</span>
              <Package size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">
              {user?.role === 'donor'
                ? myDonations.reduce((acc, d) => acc + (Number(d.remaining_quantity) || 0), 0)
                : myRequirements.reduce((acc, r) => acc + (Number(r.remaining_quantity) || 0), 0)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Available / Needed quantity</p>
          </div>

          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Community Feed</span>
              <ShieldCheck size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">{openNeeds.length}</p>
            <p className="mt-1 text-xs text-slate-400">
              {user?.role === 'donor' ? 'Open NGO requirements' : 'Surplus donations available'}
            </p>
          </div>

          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Forecast Trends</span>
              <Activity size={18} className="text-emerald-400" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-white">{forecastSummary.length} categories</p>
            <p className="mt-1 text-xs text-slate-400">AI surplus & demand balance</p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by food category or name..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-9 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
            >
              <option value="all">All Food Types</option>
              {FOOD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Grid: Forms & Records */}
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left Column: Form + My Records */}
          <div className="space-y-6">
            {/* Action Form */}
            {user?.role === 'donor' ? (
              <form
                onSubmit={handleDonationSubmit}
                className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="text-emerald-400" size={20} />
                    <h2 className="text-lg font-bold text-white">Create Food Donation</h2>
                  </div>
                  <span className="text-xs text-slate-400">Rescue Surplus Food</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Food Category</label>
                    <select
                      value={donationForm.foodType}
                      onChange={(e) => setDonationForm({ ...donationForm, foodType: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    >
                      {FOOD_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="Other">Other Category...</option>
                    </select>
                  </div>

                  {donationForm.foodType === 'Other' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Specify Food Name</label>
                      <input
                        value={donationForm.customFoodType}
                        onChange={(e) => setDonationForm({ ...donationForm, customFoodType: e.target.value })}
                        placeholder="e.g. Biryani, Chapati, Dal"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Quantity (Meals / Units)</label>
                    <input
                      type="number"
                      min="1"
                      value={donationForm.quantity}
                      onChange={(e) => setDonationForm({ ...donationForm, quantity: e.target.value })}
                      placeholder="e.g. 50"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Safe Use Expiry Deadline</label>
                    <input
                      type="datetime-local"
                      value={donationForm.safeUseDeadline}
                      onChange={(e) => setDonationForm({ ...donationForm, safeUseDeadline: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Prepared Time (Optional)</label>
                    <input
                      type="datetime-local"
                      value={donationForm.preparationTime}
                      onChange={(e) => setDonationForm({ ...donationForm, preparationTime: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Storage Requirement</label>
                    <select
                      value={donationForm.storageType}
                      onChange={(e) => setDonationForm({ ...donationForm, storageType: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    >
                      <option value="ambient">Ambient / Dry Storage</option>
                      <option value="refrigerated">Refrigerated (0 - 4°C)</option>
                      <option value="frozen">Frozen (&le; -18°C)</option>
                      <option value="hot_holding">Hot Holding (&ge; 60°C)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Storage Temp (°C, Optional)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={donationForm.storageTemperatureC}
                      onChange={(e) => setDonationForm({ ...donationForm, storageTemperatureC: e.target.value })}
                      placeholder="e.g. 4"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Food Condition</label>
                    <select
                      value={donationForm.foodCondition}
                      onChange={(e) => setDonationForm({ ...donationForm, foodCondition: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    >
                      <option value="fresh_hot">Freshly Prepared Hot Food</option>
                      <option value="fresh_chilled">Fresh Chilled / Cooked Cold</option>
                      <option value="packaged_ambient">Packaged Dry / Bakery</option>
                      <option value="sealed">Factory Sealed / Unopened</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Allergen Notice</label>
                    <input
                      type="text"
                      value={donationForm.allergens}
                      onChange={(e) => setDonationForm({ ...donationForm, allergens: e.target.value })}
                      placeholder="e.g. None or Contains Dairy, Peanuts"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    />
                  </div>
                </div>

                {/* Location Picker */}
                <div className="pt-2">
                  <LocationMapPicker
                    label="Pickup Location Coordinates"
                    value={{ lat: donationForm.locationLat, lng: donationForm.locationLng }}
                    onChange={(lat, lng) => setDonationForm({ ...donationForm, locationLat: lat, locationLng: lng })}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                >
                  Post Food Donation
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleRequirementSubmit}
                className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="text-emerald-400" size={20} />
                    <h2 className="text-lg font-bold text-white">Raise Food Requirement</h2>
                  </div>
                  <span className="text-xs text-slate-400">Request Meal Support</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Required Food Category</label>
                    <select
                      value={requirementForm.foodType}
                      onChange={(e) => setRequirementForm({ ...requirementForm, foodType: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    >
                      {FOOD_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="Other">Other Category...</option>
                    </select>
                  </div>

                  {requirementForm.foodType === 'Other' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Specify Food Need</label>
                      <input
                        value={requirementForm.customFoodType}
                        onChange={(e) => setRequirementForm({ ...requirementForm, customFoodType: e.target.value })}
                        placeholder="e.g. Cooked Rice, Milk"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Required Quantity (Units)</label>
                    <input
                      type="number"
                      min="1"
                      value={requirementForm.quantityRequired}
                      onChange={(e) => setRequirementForm({ ...requirementForm, quantityRequired: e.target.value })}
                      placeholder="e.g. 40"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Needed By Date & Time</label>
                    <input
                      type="datetime-local"
                      value={requirementForm.requiredTime}
                      onChange={(e) => setRequirementForm({ ...requirementForm, requiredTime: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Urgency Priority</label>
                    <select
                      value={requirementForm.priority}
                      onChange={(e) => setRequirementForm({ ...requirementForm, priority: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-emerald-400 outline-none"
                    >
                      <option value="high">High Priority (Immediate Need)</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                  </div>
                </div>

                {/* Location Picker */}
                <div className="pt-2">
                  <LocationMapPicker
                    label="Delivery Location Coordinates"
                    value={{ lat: requirementForm.locationLat, lng: requirementForm.locationLng }}
                    onChange={(lat, lng) => setRequirementForm({ ...requirementForm, locationLat: lat, locationLng: lng })}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                >
                  Submit Food Request
                </button>
              </form>
            )}

            {/* My History Cards */}
            <div className="card-surface rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Package className="text-emerald-400" size={18} />
                  <h2 className="text-lg font-bold text-white">
                    {user?.role === 'donor' ? 'My Food Donations' : 'My Support Requirements'}
                  </h2>
                </div>
                <span className="text-xs text-slate-400">{filteredMyList.length} total</span>
              </div>

              <div className="mt-4 space-y-3">
                {filteredMyList.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    {loading ? 'Loading your listings...' : 'No listings matching your search.'}
                  </p>
                ) : (
                  filteredMyList.map((item) => (
                    <div
                      key={item.donation_id || item.requirement_id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">{item.food_type}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                item.status === 'delivered' || item.status === 'fulfilled'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : item.status === 'cancelled'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            Units: <strong className="text-emerald-300">{item.remaining_quantity}</strong> /{' '}
                            {item.quantity || item.quantity_required}
                          </p>
                          <div className="mt-2">
                            <FoodSafetyBadge donation={item} />
                          </div>
                        </div>

                        {item.status !== 'cancelled' && item.status !== 'delivered' && (
                          <button
                            type="button"
                            onClick={() =>
                              user?.role === 'donor'
                                ? handleCancelDonation(item.donation_id)
                                : handleCancelRequirement(item.requirement_id)
                            }
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                            title="Cancel listing"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-900 pt-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-emerald-400" />
                          {formatDateTime(item.safe_use_deadline || item.required_time)}
                        </span>

                        {item.delivery_status && (
                          <span className="flex items-center gap-1 text-emerald-300 font-medium">
                            <Truck size={12} /> {item.delivery_status.replace('_', ' ')}
                            {item.volunteer_name && ` (${item.volunteer_name})`}
                          </span>
                        )}

                        {item.delivery_id && (
                          <button
                            type="button"
                            onClick={() => openTracking(item.delivery_id)}
                            className="flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/20 transition"
                          >
                            <RadioTower size={10} className="animate-pulse" /> Live Tracker
                          </button>
                        )}

                        {item.delivery_id && user?.role === 'donor' && (
                          <button
                            type="button"
                            onClick={() => openQr(item.delivery_id, 'pickup')}
                            className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                          >
                            <QrCode size={10} /> Pickup QR
                          </button>
                        )}

                        {item.delivery_id && user?.role === 'recipient' && (
                          <button
                            type="button"
                            onClick={() => openQr(item.delivery_id, 'delivery')}
                            className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                          >
                            <QrCode size={10} /> Delivery QR
                          </button>
                        )}

                        {item.donation_id && item.status === 'available' && (
                          <button
                            type="button"
                            onClick={() => setSafetyReportModal({ isOpen: true, donationId: item.donation_id, reason: 'expired', notes: '', submitting: false, success: false })}
                            className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 ml-auto"
                          >
                            <ShieldAlert size={10} /> Report Unsafe
                          </button>
                        )}

                        {item.recipient_name && user?.role === 'donor' && (
                          <span className="text-slate-300">
                            Recipient: <strong>{item.recipient_name}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Community Feed + Predictive Analytics */}
          <div className="space-y-6">
            {/* Community Feed / Matching Opportunities */}
            <div className="card-surface rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-emerald-400" size={18} />
                  <h2 className="text-lg font-bold text-white">
                    {user?.role === 'donor' ? 'Open NGO Requirements' : 'Available Food Donations'}
                  </h2>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  {filteredOpenNeeds.length} active
                </span>
              </div>

              <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {filteredOpenNeeds.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    No matching opportunities currently available.
                  </p>
                ) : (
                  filteredOpenNeeds.map((need) => (
                    <div
                      key={need.donation_id || need.requirement_id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-white">{need.food_type}</h4>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                              {need.quantity || need.quantity_required} units
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-300 font-medium">
                            {need.organization_name || need.donor_name || need.recipient_name || 'Community Member'}
                          </p>
                          {need.pickup_address && (
                            <p className="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1">
                              <MapPin size={10} className="text-emerald-400" />
                              {need.pickup_address}
                            </p>
                          )}
                        </div>

                        {user?.role === 'recipient' && (
                          <button
                            type="button"
                            onClick={() => handleClaimDonation(need)}
                            className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20"
                          >
                            Claim Food
                          </button>
                        )}
                      </div>

                      <div className="mt-2">
                        <FoodSafetyBadge donation={need} />
                      </div>

                      <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock size={10} />
                        Deadline: {formatDateTime(need.safe_use_deadline || need.required_time)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* AI Demand Forecasting */}
            {forecastSummary.length > 0 && (
              <div className="card-surface rounded-3xl p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="text-emerald-400" size={18} />
                    <h2 className="text-lg font-bold text-white">Demand & Surplus Forecast</h2>
                  </div>
                  <span className="text-xs text-slate-400">Regional trends</span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {forecastSummary.slice(0, 5).map((f) => (
                    <div
                      key={f.foodType}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-white">{f.foodType}</p>
                        <p className="text-[11px] text-slate-400">
                          {f.predictedSurplus > 0
                            ? `+${f.predictedSurplus} surplus units`
                            : `-${f.predictedShortage} deficit units`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            f.riskLevel === 'shortage'
                              ? 'bg-rose-500/20 text-rose-300'
                              : f.riskLevel === 'surplus'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {f.riskLevel}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-500">{f.confidence}% accuracy</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Delivery Tracking Modal (Feature 1 & 3) */}
        {trackingModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={e => e.target === e.currentTarget && closeTracking()}>
            <div className="card-surface w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Truck className="text-emerald-400" size={20} />
                  <h3 className="text-base font-bold text-white">Live Delivery Tracking (Run #{trackingModal.deliveryId})</h3>
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
                      <Activity size={13} className="text-emerald-400" /> Real-Time Status Timeline
                    </h4>
                    <DeliveryStatusTimeline history={trackingModal.timeline} currentStatus={trackingModal.delivery.delivery_status} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* QR Code Display Modal (Feature 7) */}
        {qrModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={e => e.target === e.currentTarget && setQrModal({ isOpen: false, mode: 'pickup', deliveryId: null, data: null, loading: false, error: '' })}>
            <div className="card-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <QrCode size={18} className="text-emerald-400" />
                  {qrModal.mode === 'pickup' ? 'Pickup Verification QR' : 'Delivery Verification QR'}
                </h3>
                <button onClick={() => setQrModal({ isOpen: false, mode: 'pickup', deliveryId: null, data: null, loading: false, error: '' })} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              {qrModal.loading ? (
                <div className="py-10 flex justify-center"><Loader2 size={32} className="animate-spin text-emerald-400" /></div>
              ) : qrModal.error ? (
                <p className="py-8 text-center text-rose-300 text-xs">{qrModal.error}</p>
              ) : qrModal.data ? (
                <div className="mt-4 text-center space-y-4">
                  <p className="text-xs text-slate-300">
                    Present this QR code or 6-digit PIN to the delivery volunteer upon arrival.
                  </p>
                  <div className="flex justify-center p-4 bg-white rounded-2xl w-fit mx-auto shadow-inner">
                    <QRCodeSVG value={qrModal.data.token || qrModal.data.manualCode} size={180} level="M" />
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-[11px] text-slate-400">Manual 6-Digit Verification PIN</p>
                    <p className="text-2xl font-mono font-extrabold tracking-widest text-emerald-300 mt-0.5">
                      {qrModal.data.manualCode}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Food Safety Issue Report Modal (Feature 4) */}
        {safetyReportModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={e => e.target === e.currentTarget && setSafetyReportModal(prev => ({ ...prev, isOpen: false }))}>
            <div className="card-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert size={18} className="text-rose-400" /> Report Food Safety Issue
                </h3>
                <button onClick={() => setSafetyReportModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              {safetyReportModal.success ? (
                <div className="py-8 text-center">
                  <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold text-emerald-300">Safety Report Submitted</p>
                  <p className="text-xs text-slate-400 mt-1">Listing marked and audit log updated.</p>
                </div>
              ) : (
                <form onSubmit={submitSafetyReport} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Reason for Concern</label>
                    <select
                      value={safetyReportModal.reason}
                      onChange={e => setSafetyReportModal(prev => ({ ...prev, reason: e.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
                    >
                      <option value="expired">Passed Expiry Deadline</option>
                      <option value="temperature_abuse">Temperature Abuse / Spoiled</option>
                      <option value="packaging_damaged">Packaging Damaged / Broken Seal</option>
                      <option value="foul_odor_color">Foul Odor / Abnormal Appearance</option>
                      <option value="contamination">Foreign Contamination Detected</option>
                      <option value="other">Other Unsafe Condition</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Notes / Description (Optional)</label>
                    <textarea
                      rows={3}
                      value={safetyReportModal.notes}
                      onChange={e => setSafetyReportModal(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Details about the inspection or issue..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-white outline-none focus:border-rose-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={safetyReportModal.submitting}
                    className="w-full rounded-xl bg-rose-500 py-2.5 text-xs font-bold text-white hover:bg-rose-400 transition disabled:opacity-50"
                  >
                    {safetyReportModal.submitting ? 'Submitting...' : 'Confirm Unsafe Report'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
