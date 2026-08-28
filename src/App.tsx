import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';

const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })));
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const InterestRequestPage = lazy(() => import('./pages/InterestRequestPage').then(m => ({ default: m.InterestRequestPage })));

const PageLoader = () => <div className="min-h-screen bg-[#060B18]" />;

const ComposerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authLoading } = useApp();
  const location = useLocation();

  if (authLoading) return <PageLoader />;

  return isAuthenticated
    ? children
    : <Navigate to="/login" replace state={{ from: location.pathname }} />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdminAuthenticated, authLoading } = useApp();

  if (authLoading) return <PageLoader />;

  return isAdminAuthenticated
    ? children
    : <Navigate to="/autenticacao?modo=admin" replace />;
};

const AppRoutes: React.FC = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/autenticacao" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<LoginPage />} />
      <Route path="/cadastro" element={<Navigate to="/autenticacao?modo=register" replace />} />
      <Route path="/compositor/:username" element={<PublicProfilePage />} />
      <Route path="/compositor/:username/musica/:songRef/interesse" element={<InterestRequestPage />} />
      <Route path="/termos" element={<LegalPage />} />
      <Route path="/privacidade" element={<LegalPage />} />
      <Route path="/dashboard/*" element={<ComposerRoute><DashboardLayout /></ComposerRoute>} />
      <Route path="/admin/*" element={<AdminRoute><AdminLayout /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
