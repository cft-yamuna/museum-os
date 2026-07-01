import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BRAND_CMS_NAME, BRAND_MONOGRAM, BRAND_NAME, BRAND_TAGLINE } from '../lib/brand';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--page-bg)' }}>
      <div
        className="hidden lg:flex lg:w-[46%] relative items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)' }}
      >
        <motion.div
          className="relative z-10 flex flex-col items-start w-full max-w-md px-10"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-4 mb-12">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-xl"
              style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}
            >
              <span className="text-white text-lg font-bold tracking-tight">{BRAND_MONOGRAM}</span>
            </div>
            <div>
              <div className="text-white text-3xl font-bold tracking-tight">{BRAND_NAME}</div>
              <div className="text-blue-200/80 text-sm font-medium">{BRAND_TAGLINE}</div>
            </div>
          </div>

          <p className="text-white/85 max-w-sm text-[28px] leading-tight font-semibold">
            Control room clarity for every connected display.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3 w-full">
            {['Media', 'Devices', 'Schedules'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="text-white/90 text-sm font-semibold">{item}</div>
                <div className="mt-1 h-1 w-8 rounded-full bg-cyan-400/70" />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <motion.div
          className="w-full max-w-md px-6 sm:px-8 relative z-10"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}
            >
              <span className="text-white text-sm font-bold">{BRAND_MONOGRAM}</span>
            </div>
            <div>
              <div className="text-surface-900 font-bold">{BRAND_NAME}</div>
              <div className="text-xs text-surface-500">{BRAND_TAGLINE}</div>
            </div>
          </div>

          <h2 className="font-bold mb-2 text-surface-950 text-[34px] leading-tight">Sign in</h2>
          <p className="mb-9 text-surface-500 text-[17px]">Continue to {BRAND_CMS_NAME}</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block font-semibold mb-2 text-surface-700 text-sm">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border px-4 py-3.5 card-bg text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all text-base"
                style={{ borderColor: 'var(--glass-border)' }}
                placeholder="admin@curato.local"
              />
            </div>

            <div>
              <label className="block font-semibold mb-2 text-surface-700 text-sm">Password</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border px-4 py-3.5 pr-12 card-bg text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all text-base"
                  style={{ borderColor: 'var(--glass-border)' }}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors text-surface-400 hover:text-surface-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 rounded-lg px-4 py-3 bg-red-50 border border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300 text-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:opacity-50 cursor-pointer group text-base"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #0891b2)',
                boxShadow: '0 12px 28px rgba(37, 99, 235, 0.20)',
                padding: '15px',
              }}
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in to {BRAND_CMS_NAME}
                  <ArrowRight size={20} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="text-center mt-10 text-surface-400 text-[13px]">
            {BRAND_CMS_NAME} &middot; Secure Access
          </p>
        </motion.div>
      </div>
    </div>
  );
}
