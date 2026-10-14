import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, HeartHandshake, Building2, User, Truck, Utensils } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Use a valid email address'),
  phone: z.string().trim().optional().or(z.literal('')),
  password: z
    .string()
    .regex(/^\d{4}$/, 'Password must contain exactly 4 numeric digits (0-9)'),
  roleSelection: z.enum(['donor', 'recipient_ngo', 'recipient_individual', 'volunteer']),
  organizationName: z.string().trim().optional(),
  address: z.string().trim().optional(),
  vehicleType: z.enum(['bike', 'car', 'auto', 'none']).optional()
});

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register: createAccount } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      roleSelection: 'donor',
      organizationName: '',
      address: '',
      vehicleType: 'none'
    }
  });

  const selectedRole = watch('roleSelection');

  const onSubmit = async (values) => {
    setLoading(true);
    setError('');

    let role = 'donor';
    let recipientType = undefined;

    if (values.roleSelection === 'recipient_ngo') {
      role = 'recipient';
      recipientType = 'ngo';
    } else if (values.roleSelection === 'recipient_individual') {
      role = 'recipient';
      recipientType = 'individual';
    } else if (values.roleSelection === 'volunteer') {
      role = 'volunteer';
    } else {
      role = 'donor';
    }

    const payload = {
      name: values.name,
      email: values.email,
      phone: values.phone || undefined,
      password: values.password,
      role,
      recipientType,
      organizationName: values.organizationName || values.name,
      address: values.address || undefined
    };

    try {
      const res = await createAccount(payload);
      const userRole = res.user?.role;
      const target = userRole === 'volunteer' ? '/volunteer' : userRole === 'admin' ? '/admin' : '/dashboard';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="card-surface w-full max-w-lg rounded-3xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
            <HeartHandshake size={24} />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 font-semibold">Join FoodBridge</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Create your account</h1>
          <p className="mt-1 text-xs text-slate-400">Connect to rescue and share surplus food</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">Full Name / Contact Person</label>
            <input
              {...register('name')}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              placeholder="e.g. Priya Sharma"
            />
            {errors.name && <p className="mt-1.5 text-xs text-rose-400">{errors.name.message}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Email Address</label>
              <input
                {...register('email')}
                type="email"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1.5 text-xs text-rose-400">{errors.email.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Phone Number</label>
              <input
                {...register('phone')}
                type="tel"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                placeholder="9876543210"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">Account Role</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs transition ${selectedRole === 'donor' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'}`}>
                <input type="radio" value="donor" {...register('roleSelection')} className="hidden" />
                <Utensils size={16} />
                <span>Food Donor</span>
              </label>

              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs transition ${selectedRole === 'recipient_ngo' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'}`}>
                <input type="radio" value="recipient_ngo" {...register('roleSelection')} className="hidden" />
                <Building2 size={16} />
                <span>NGO / Shelter</span>
              </label>

              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs transition ${selectedRole === 'recipient_individual' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'}`}>
                <input type="radio" value="recipient_individual" {...register('roleSelection')} className="hidden" />
                <User size={16} />
                <span>Individual Need</span>
              </label>

              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs transition ${selectedRole === 'volunteer' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'}`}>
                <input type="radio" value="volunteer" {...register('roleSelection')} className="hidden" />
                <Truck size={16} />
                <span>Volunteer</span>
              </label>
            </div>
          </div>

          {(selectedRole === 'donor' || selectedRole === 'recipient_ngo') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">
                {selectedRole === 'donor' ? 'Restaurant / Business / Donor Organization' : 'NGO / Shelter Organization Name'}
              </label>
              <input
                {...register('organizationName')}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                placeholder={selectedRole === 'donor' ? 'e.g. Green Bakery or Home Kitchen' : 'e.g. Hope Shelter Foundation'}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">Address / Location Area</label>
            <input
              {...register('address')}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              placeholder="e.g. Gandhipuram, Coimbatore, Tamil Nadu"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">4-Digit Password PIN</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 pr-12 text-white outline-none tracking-widest placeholder:tracking-normal placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                placeholder="4 digits (e.g. 1234)"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                title={showPassword ? "Hide PIN" : "Show PIN"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Must be exactly 4 numeric digits (0–9 only).</p>
            {errors.password && <p className="mt-1 text-xs text-rose-400">{errors.password.message}</p>}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60 shadow-lg shadow-emerald-500/20"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-emerald-300 hover:text-emerald-200 underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
