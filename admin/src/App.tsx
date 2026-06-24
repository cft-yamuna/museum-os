import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth';
import { MainLayout } from './layouts/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceListPage } from './pages/DeviceListPage';
import { DeviceCreatePage } from './pages/DeviceCreatePage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { ContentListPage } from './pages/ContentListPage';
import { ContentDetailPage } from './pages/ContentDetailPage';
import { PlaylistListPage } from './pages/PlaylistListPage';
import { PlaylistEditorPage } from './pages/PlaylistEditorPage';
import { ScheduleListPage } from './pages/ScheduleListPage';
import { ScheduleEditorPage } from './pages/ScheduleEditorPage';
import { AlertsPage } from './pages/AlertsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { EngagementPage } from './pages/EngagementPage';
import { PowerPage } from './pages/PowerPage';
import { LogsPage } from './pages/LogsPage';
import { UsersPage } from './pages/UsersPage';
import { GroupsPage } from './pages/GroupsPage';
import { AppListPage } from './pages/AppListPage';
import { AppEditorPage } from './pages/AppEditorPage';
import { RecycleBinPage } from './pages/RecycleBinPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { InstallationGuidePage } from './pages/InstallationGuidePage';
import { ReceptionEditorPage } from './pages/ReceptionEditorPage';
import { ToastContainer } from './components/ui/Toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const mustChangePassword = useAuthStore((s) => s.must_change_password);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route
            path="/reception/:deviceId"
            element={
              <ProtectedRoute>
                <ReceptionEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="devices" element={<DeviceListPage />} />
            <Route path="devices/new" element={<DeviceCreatePage />} />
            <Route path="devices/:id" element={<DeviceDetailPage />} />
            <Route path="apps" element={<AppListPage />} />
            <Route path="apps/new" element={<AppEditorPage />} />
            <Route path="apps/:id" element={<AppEditorPage />} />
            <Route path="recycle-bin" element={<RecycleBinPage />} />
            <Route path="content" element={<ContentListPage />} />
            <Route path="content/:id" element={<ContentDetailPage />} />
            <Route path="playlists" element={<PlaylistListPage />} />
            <Route path="playlists/:id" element={<PlaylistEditorPage />} />
            <Route path="schedules" element={<ScheduleListPage />} />
            <Route path="schedules/new" element={<ScheduleEditorPage />} />
            <Route path="schedules/:id/edit" element={<ScheduleEditorPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="power" element={<PowerPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="engagement" element={<EngagementPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="installation-guide" element={<InstallationGuidePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
