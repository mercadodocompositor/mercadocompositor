import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import { DashboardLayout } from './pages/dashboard/DashboardLayout';
import { AdminLayout } from './pages/admin/AdminLayout';
import { LegalPage } from './pages/LegalPage';
import { InterestRequestPage } from './pages/InterestRequestPage';

const ComposerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authLoading } = useApp();
  const location = useLocation();

  if (authLoading) return <div className="min-h-screen bg-[#060B18]" />;

  return isAuthenticated
    ? children
    : <Navigate to="/login" replace state={{ from: location.pathname }} />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdminAuthenticated, authLoading } = useApp();

  if (authLoading) return <div className="min-h-screen bg-[#060B18]" />;

  return isAdminAuthenticated
    ? children
    : <Navigate to="/autenticacao?modo=admin" replace />;
};

const AppRoutes: React.FC = () => (
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
