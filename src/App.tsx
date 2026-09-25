import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { MaintenanceBanner } from './components/common/MaintenanceBanner';
import { SystemAnnouncementBanner } from './components/common/SystemAnnouncementBanner';
import { ScrollToTop } from './components/common/ScrollToTop';

const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then(m => ({ default: m.PublicProfilePage })));
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const InterestRequestPage = lazy(() => import('./pages/InterestRequestPage').then(m => ({ default: m.InterestRequestPage })));
const ValidarDocumentoPage = lazy(() => import('./pages/ValidarDocumentoPage').then(m => ({ default: m.ValidarDocumentoPage })));
const ReleaseDeliveryPage = lazy(() => import('./pages/ReleaseDeliveryPage').then(m => ({ default: m.ReleaseDeliveryPage })));
const ComposersPage = lazy(() => import('./pages/ComposersPage').then(m => ({ default: m.ComposersPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

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

const AppRoutes: React.FC = () => {
  const { platformSettings, isAdminAuthenticated } = useApp();
  const showMaintenance = platformSettings?.maintenanceMode && !isAdminAuthenticated;

  return (
    <Suspense fallback={<PageLoader />}>
      {showMaintenance && <MaintenanceBanner />}
      <SystemAnnouncementBanner message={platformSettings?.systemAnnouncement || ''} />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/autenticacao" element={<LoginPage />} />
        <Route path="/recuperar-senha" element={<Navigate to="/autenticacao?modo=forgot" replace />} />
        <Route path="/cadastro" element={<LoginPage />} />
        <Route path="/compositores" element={<ComposersPage />} />
        <Route path="/compositor/:username" element={<PublicProfilePage />} />
        <Route path="/compositor/:username/musica/:songRef/interesse" element={<InterestRequestPage />} />
        <Route path="/termos" element={<LegalPage />} />
        <Route path="/privacidade" element={<LegalPage />} />
        <Route path="/validar-documento" element={<ValidarDocumentoPage />} />
        <Route path="/validar-documento/:code" element={<ValidarDocumentoPage />} />
        <Route path="/validar/:code" element={<ValidarDocumentoPage />} />
        <Route path="/entrega/:token" element={<ReleaseDeliveryPage />} />
        <Route path="/dashboard/*" element={<ComposerRoute><DashboardLayout /></ComposerRoute>} />
        <Route path="/admin/*" element={<AdminRoute><AdminLayout /></AdminRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <ScrollToTop />
          <AppProvider>
            <AppRoutes />
          </AppProvider>
        </BrowserRouter>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}

