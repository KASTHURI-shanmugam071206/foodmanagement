import { ArrowRight, HeartHandshake, MapPinned, ShieldCheck, Users, UtensilsCrossed } from 'lucide-react';
import { Link } from 'react-router-dom';

const stats = [
  { label: 'Meals redirected', value: '12k+' },
  { label: 'Partner NGOs', value: '240' },
  { label: 'Volunteers active', value: '860' },
  { label: 'Waste prevented', value: '48%' }
];

const features = [
  { icon: UtensilsCrossed, title: 'Smart donation matching', text: 'Match surplus food with nearby recipients based on quantity, urgency, and location.' },
  { icon: MapPinned, title: 'Pickup coordination', text: 'Coordinate donors, recipients, and volunteers with a clear dispatch workflow.' },
  { icon: ShieldCheck, title: 'Secure and trusted', text: 'Role-based access, verification, audit logging, and protected data handling.' },
  { icon: Users, title: 'Community impact', text: 'Bring donors, NGOs, and volunteers together to reduce waste and improve food access.' }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-slate-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3 font-bold text-lg">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <HeartHandshake size={20} />
          </div>
          FoodBridge
        </div>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#about" className="hover:text-white">About</a>
          <a href="#how-it-works" className="hover:text-white">How it works</a>
          <a href="#impact" className="hover:text-white">Impact</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/login" className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-emerald-500 hover:text-white">
            Login
          </Link>
          <Link to="/register" className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400">
            Join now
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-10 md:grid-cols-2 md:items-center md:pt-20">
          <div>
            <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
              Smart food donation platform
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight text-white md:text-6xl">
              Turning surplus food into shared impact.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              FoodBridge helps donors, NGOs, recipients, and volunteers reduce waste, coordinate logistics, and deliver food where it is needed most.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-semibold text-slate-950 hover:bg-emerald-400">
                Start helping <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="rounded-full border border-slate-700 px-6 py-3 font-semibold text-slate-100 hover:border-emerald-400">
                Sign in
              </Link>
            </div>
          </div>

          <div className="card-surface rounded-3xl p-6">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <div className="flex items-center justify-between text-sm text-emerald-200">
                <span>Live donor feed</span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs">17 active</span>
              </div>
              <div className="mt-5 space-y-4">
                {['Rice & meals', 'Fresh produce', 'Bread bundles', 'Vegetable packs'].map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                    <div>
                      <p className="font-medium text-white">{item}</p>
                      <p className="text-xs text-slate-400">{index + 1} pickup window open</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">Ready</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="impact" className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-4 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="card-surface rounded-2xl p-5 text-center">
                <div className="text-3xl font-black text-emerald-300">{stat.value}</div>
                <div className="mt-2 text-sm text-slate-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="mx-auto max-w-6xl px-6 pb-20 pt-8">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Why FoodBridge</p>
            <h2 className="mt-3 text-3xl font-bold text-white">A connected ecosystem for food rescue</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card-surface rounded-2xl p-5">
                <div className="mb-4 inline-flex rounded-xl bg-emerald-500/10 p-3 text-emerald-300">
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
