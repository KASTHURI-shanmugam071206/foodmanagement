import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';

const resetSchema = z.object({
  password: z
    .string()
    .regex(/^\d{4}$/, 'Password must contain exactly 4 numeric digits (0-9)')
});

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '' }
  });

  const onSubmit = async (values) => {
    setStatus('');
    setError('');

    if (!token) {
      setError('Reset token is missing. Please use the link or token sent to your email.');
      return;
    }

    try {
      const response = await resetPassword(token, values.password);
      setStatus(response.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reset your password.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="card-surface w-full max-w-md rounded-3xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
            <KeyRound size={24} />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 font-semibold">Secure update</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Set new 4-digit PIN</h1>
          <p className="mt-1 text-xs text-slate-400">Choose a 4-digit numerical password</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">New 4-Digit Password PIN</label>
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

          {error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {status && <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{status}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
          >
            Update password PIN
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          Return to <Link to="/login" className="font-medium text-emerald-300 hover:text-emerald-200 underline underline-offset-4">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
