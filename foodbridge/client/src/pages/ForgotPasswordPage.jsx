import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';

const forgotPasswordSchema = z.object({
  email: z.string().email('Use a valid email address')
});

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' }
  });

  const onSubmit = async (values) => {
    setStatus('');
    setError('');

    try {
      const response = await requestPasswordReset(values.email);
      setStatus(response.message + (response.resetToken ? ` Token: ${response.resetToken}` : ''));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to send a reset link.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="card-surface w-full max-w-md rounded-3xl p-8">
        <div className="mb-6 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">Account recovery</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Reset your password</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm text-slate-200">Email</label>
            <input {...register('email')} type="email" className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white" placeholder="you@example.com" />
            {errors.email && <p className="mt-2 text-sm text-rose-400">{errors.email.message}</p>}
          </div>

          {error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {status && <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{status}</p>}

          <button type="submit" className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-400">
            Send reset link
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          Back to <Link to="/login" className="font-medium text-emerald-300">sign in</Link>
        </p>
      </div>
    </div>
  );
}
