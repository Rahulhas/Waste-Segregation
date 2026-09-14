import { Link, useNavigate } from 'react-router-dom';
import { Card, Input, Button, Select, Alert } from '../components/ui';
import AuthLayout from '../components/AuthLayout';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDefaultRoute } from '../lib/roles';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.email.trim()) {
      setError('Email is required. Please enter your email address.');
      return;
    }

    if (!EMAIL_PATTERN.test(form.email.trim())) {
      setError('Invalid email format. Use an address such as you@example.com.');
      return;
    }

    setLoading(true);

    try {
      const user = await register({
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
      });
      navigate(getDefaultRoute(user.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      heroImage="leaves"
      heroTitle="Join EcoCampus"
      heroSubtitle="Citizen Waste Portal"
      heroDescription="Create your citizen account to report waste issues, track municipal collection in real-time, and help keep the city clean."
      heroFooter={
        <>
          <div>
            <div className="font-semibold text-white">Citizen Reporting</div>
            Photo verified · Real-time status
          </div>
          <div>
            <div className="font-semibold text-white">Smart Bins</div>
            Live sensor alerts across 6 zones
          </div>
        </>
      }
    >
      <Card className="auth-glass w-full">
        <h2 className="text-xl font-semibold text-text-primary">Create citizen account</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Register to report waste issues and track cleanups
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="Full name"
            value={form.name}
            onChange={update('name')}
            placeholder="Enter your name"
            required
          />
          <Input
            label="Phone number"
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            placeholder="+91 98765 43210"
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={update('email')}
            placeholder="you@example.com"
            pattern="^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$"
            title="Enter an email with a provider and domain extension, such as you@example.com"
            inputMode="email"
            required
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={update('password')}
            placeholder="Min. 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />

          <Button type="submit" disabled={loading} className="w-full bg-forest text-white hover:bg-pine">
            {loading ? 'Creating citizen account...' : 'Create Citizen Account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-sage-700 hover:text-forest">
            Sign in
          </Link>
        </p>
      </Card>
    </AuthLayout>
  );
}
