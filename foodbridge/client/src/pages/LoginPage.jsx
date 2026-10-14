import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, HeartHandshake } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z
    .string()
    .regex(/^\d{4}$/, 'Password must contain exactly 4 numeric digits (0-9)')
});

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const onSubmit = async (values) => {
    setLoading(true);
    setError('');

    try {
      const payload = await login(values);
      const role = payload.user?.role;
      const target = role === 'volunteer' ? '/volunteer' : role === 'admin' ? '/admin' : '/dashboard';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to log in right now.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (email, pwd = '1234') => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', pwd, { shouldValidate: true });
    setError('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="card-surface w-full max-w-md rounded-3xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
            <HeartHandshake size={24} />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 font-semibold">Welcome back</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Sign in to FoodBridge</h1>
          <p className="mt-1 text-xs text-slate-400">Use your email and 4-digit PIN password</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-200">4-Digit Password PIN</label>
              <Link to="/forgot-password" className="text-xs text-emerald-300 hover:text-emerald-200">
                Forgot password?
              </Link>
            </div>
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
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <p className="mt-1.5 text-xs text-rose-400">{errors.password.message}</p>}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-emerald-500/20"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            Quick Demo Accounts (PIN: 1234)
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => fillDemoAccount('admin@foodbridge.demo')}
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-slate-300 hover:border-emerald-500 hover:text-emerald-300 text-left transition"
            >
              👑 <span className="font-semibold">Admin</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('donor1@foodbridge.demo')}
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-slate-300 hover:border-emerald-500 hover:text-emerald-300 text-left transition"
            >
              🥗 <span className="font-semibold">Donor</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('recipient1@foodbridge.demo')}
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-slate-300 hover:border-emerald-500 hover:text-emerald-300 text-left transition"
            >
              🏢 <span className="font-semibold">Recipient</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('volunteer1@foodbridge.demo')}
              className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-slate-300 hover:border-emerald-500 hover:text-emerald-300 text-left transition"
            >
              🚚 <span className="font-semibold">Volunteer</span>
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-300">
          New to FoodBridge?{' '}
          <Link to="/register" className="font-medium text-emerald-300 hover:text-emerald-200 underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
