import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Input, Button, Alert } from '../components/ui';
import AuthLayout from '../components/AuthLayout';
import { useState } from 'react';
import { api } from '../lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid reset link');
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(token, password);
      navigate('/login', { state: { message: 'Password reset successful. Please sign in.' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      heroImage="earth"
      heroTitle="Set New Password"
      heroSubtitle=""
      heroDescription="Choose a strong password to secure your EcoCampus account and continue managing campus waste operations."
      heroFooter={null}
    >
      <Card className="w-full shadow-sm">
        <h2 className="text-xl font-semibold text-text-primary">Set new password</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Choose a strong password with at least 8 characters
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />

          <Button type="submit" disabled={loading || !token} className="w-full">
            {loading ? 'Resetting...' : 'Reset password'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          <Link to="/login" className="font-medium text-sage-700 hover:text-forest">
            Back to sign in
          </Link>
        </p>
      </Card>
    </AuthLayout>
  );
}
