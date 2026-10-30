import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/layout/ProtectedRoute';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { LoadingState } from '@/components/ui/States';

// Route-level code splitting keeps the first load small; the heavy voice/Gemini code only loads on /practice/live.
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Practice = lazy(() => import('@/pages/Practice'));
const PracticeLive = lazy(() => import('@/pages/PracticeLive'));
const Lessons = lazy(() => import('@/pages/Lessons'));
const LessonDetail = lazy(() => import('@/pages/LessonDetail'));
const Conversations = lazy(() => import('@/pages/Conversations'));
const ConversationDetail = lazy(() => import('@/pages/ConversationDetail'));
const Vocabulary = lazy(() => import('@/pages/Vocabulary'));
const Progress = lazy(() => import('@/pages/Progress'));
const Settings = lazy(() => import('@/pages/Settings'));
const Subscription = lazy(() => import('@/pages/Subscription'));
const Admin = lazy(() => import('@/pages/Admin'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        </Route>
        {/* The recovery link signs the user in temporarily, so this page must stay reachable while signed in. */}
        <Route path="/auth/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute requireOnboarding={false} />}>
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/practice/live" element={<PracticeLive />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/lessons/:id" element={<LessonDetail />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/conversations/:id" element={<ConversationDetail />} />
            <Route path="/vocabulary" element={<Vocabulary />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/subscription" element={<Subscription />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute requireAdmin />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
