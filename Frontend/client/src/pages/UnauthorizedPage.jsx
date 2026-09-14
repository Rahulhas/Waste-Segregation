import { Link } from 'react-router-dom';
import { Card, Button } from '../components/ui';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { getDefaultRoute } from '../lib/roles';

export default function UnauthorizedPage() {
  const { user } = useAuth();
  const dashboardRoute = getDefaultRoute(user?.role);

  return (
    <AuthLayout
      heroImage="forest"
      heroTitle="Access Control"
      heroSubtitle=""
      heroDescription="Role-based permissions ensure drivers, admins, and operators only access the tools they need."
      heroFooter={null}
    >
      <Card className="w-full text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning-muted">
          <span className="text-2xl">403</span>
        </div>
        <h1 className="text-xl font-semibold text-text-primary">Access denied</h1>
        <p className="mt-2 text-sm text-text-secondary">
          You don&apos;t have permission to view this page with your current role.
        </p>
        <Link to={dashboardRoute} className="mt-6 inline-block">
          <Button>Go to dashboard</Button>
        </Link>
      </Card>
    </AuthLayout>
  );
}
