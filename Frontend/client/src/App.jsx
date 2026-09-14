import AnalyzePage from './pages/waste/AnalyzePage';
import ResultPage from './pages/waste/ResultPage';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import EcoBackground from './components/EcoBackground';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import CitizenPage from './pages/CitizenPage';
import ProfilePage from './pages/ProfilePage';
import DispatchPage from './pages/DispatchPage';
import AdminPage from './pages/AdminPage';
import AlertsPage from './pages/AlertsPage';
import WorkersPage from './pages/WorkersPage';

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/unauthorized'];

function AppRoutes() {
  const { pathname } = useLocation();
  const isAuthPage = AUTH_PATHS.some((path) => pathname.startsWith(path));

  return (
    <>
      {!isAuthPage && <EcoBackground />}
      <div className="app-content">
        <AuthProvider>
          <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
  <Route element={<AppLayout />}>

    <Route element={<ProtectedRoute allowedRoles={['USER']} />}>
      <Route path="/citizen" element={<CitizenPage />} />
    </Route>

    <Route path="/profile" element={<ProfilePage />} />

{/* AI Smart Waste Segregation (Drivers and Municipal Admins) */}
<Route element={<ProtectedRoute allowedRoles={['DRIVER', 'MUNICIPAL_ADMIN', 'ADMIN']} />}>
  <Route path="/analyze" element={<AnalyzePage />} />
  <Route path="/result" element={<ResultPage />} />
</Route>

<Route element={<ProtectedRoute allowedRoles={['DRIVER', 'MUNICIPAL_ADMIN', 'ADMIN']} />}>
  <Route path="/dispatch" element={<DispatchPage />} />
</Route>

<Route element={<ProtectedRoute allowedRoles={['MUNICIPAL_ADMIN', 'ADMIN']} />}>
  <Route path="/admin" element={<AdminPage />} />
</Route>

<Route element={<ProtectedRoute allowedRoles={['SOFTWARE_ADMIN', 'MUNICIPAL_ADMIN', 'ADMIN']} />}>
  <Route path="/workers" element={<WorkersPage />} />
</Route>

<Route element={<ProtectedRoute allowedRoles={['DRIVER', 'MUNICIPAL_ADMIN', 'ADMIN']} />}>
  <Route path="/alerts" element={<AlertsPage />} />
</Route>

  </Route>
</Route>

          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
