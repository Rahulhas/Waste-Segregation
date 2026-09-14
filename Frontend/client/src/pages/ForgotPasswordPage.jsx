import { Link } from 'react-router-dom';
import { Card, Input, Button, Alert } from '../components/ui';
import AuthLayout from '../components/AuthLayout';
import { useState } from 'react';
import { api } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResetUrl('');
    setLoading(true);

    try {
      const data = await api.forgotPassword(email);
      setSuccess(data.message);
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      heroImage="nature"
      heroTitle="Account Recovery"
      heroSubtitle=""
      heroDescription="Secure password reset for campus staff. We'll send a recovery link to your registered email."
      heroFooter={
        <>
          <div>
            <div className="font-semibold text-white">Secure</div>
            JWT + audit logs
          </div>
          <div>
            <div className="font-semibold text-white">Protected</div>
            Role-based access
          </div>
        </>
      }
    >
      <Card className="w-full shadow-sm">
        <h2 className="text-xl font-semibold text-text-primary">Reset password</h2>
        <p className="mt-1 text-sm text-text-secondary">
          We&apos;ll send a reset link to your email
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          {success && (
            <Alert variant="success">
              {success}
              {resetUrl && (
                <div className="mt-2">
                  <span className="font-medium">Demo reset link: </span>
                  <Link to={resetUrl.replace(/^https?:\/\/[^/]+/, '')} className="underline">
                    Click here
                  </Link>
                </div>
              )}
            </Alert>
          )}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="driver@campus.demo"
            required
          />

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Sending...' : 'Send reset link'}
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
