import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { token, logout, setToken } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to change password');
      }

      const { token: newToken, user } = json.data;
      setToken(newToken, user);
      addToast('success', 'Password changed successfully');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bryzos-card rounded-3xl shadow-sm p-6">
          <h1 className="text-lg font-semibold text-surface-900 mb-1">Change Password</h1>
          <p className="text-base text-surface-500 mb-5">
            You must change your password before continuing.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-9 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-9 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={8}
              />
            </div>

            {error && (
              <p className="text-base text-red-600">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading} disabled={loading}>
              Change Password
            </Button>

            <button
              type="button"
              onClick={logout}
              className="w-full text-center text-base text-surface-500 hover:text-surface-700 mt-2"
            >
              Log out instead
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
