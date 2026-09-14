import { Link } from 'react-router-dom';
import { Card, Input, Button, Alert } from '../components/ui';
import AuthLayout from '../components/AuthLayout';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getDefaultRoute } from '../lib/roles';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      navigate(getDefaultRoute(user.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout heroImage="forest">
      <Card className="auth-glass w-full">
        <h2 className="text-xl font-semibold text-text-primary">Sign in</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Enter your campus credentials to continue
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="driver@campus.demo"
            required
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            showPasswordToggle={true}
          />

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-sage-700 hover:text-forest"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          No account?{' '}
          <Link to="/register" className="font-medium text-sage-700 hover:text-forest">
            Register
          </Link>
        </p>

        <div className="mt-6 rounded-lg bg-sage-50 p-4 text-xs text-text-muted">
          <div className="mb-1 font-medium text-text-secondary">Official Portals</div>
          <span>Citizen Portal · Collection Driver App · Municipal Administrator Command Center</span>
        </div>
      </Card>
    </AuthLayout>
  );
}
