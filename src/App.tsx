/**
 * Router shell.
 *
 * The landing page moved verbatim to pages/LandingPage.tsx and still renders at
 * `/`, so the public site is unchanged. Everything added here sits alongside it.
 *
 * Route guards here are navigation only. Authorization lives in the database —
 * see auth/ProtectedRoute.tsx for why that distinction matters.
 */
import React from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {AuthProvider} from './auth/AuthProvider';
import {ProtectedRoute, PublicOnlyRoute} from './auth/ProtectedRoute';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import PatientPage from './pages/PatientPage';
import PatientProfilePage from './pages/PatientProfilePage';
import DoctorPage from './pages/DoctorPage';
import DoctorProfilePage from './pages/DoctorProfilePage';
import DoctorCredentialsPage from './pages/DoctorCredentialsPage';
import DoctorAvailabilityPage from './pages/DoctorAvailabilityPage';
import AdminPage from './pages/AdminPage';
import AdminDoctorReviewPage from './pages/AdminDoctorReviewPage';
import DoctorDiscoveryPage from './pages/DoctorDiscoveryPage';
import DoctorDetailsPage from './pages/DoctorDetailsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />

          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnlyRoute>
                <SignupPage />
              </PublicOnlyRoute>
            }
          />

          {/* Any authenticated user */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Public doctor discovery — reads only the narrow verified_doctors view */}
          <Route path="/doctors" element={<DoctorDiscoveryPage />} />
          <Route path="/doctors/:doctorId" element={<DoctorDetailsPage />} />

          {/* Role-scoped */}
          <Route
            path="/patient"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PatientPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patient/profile"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PatientProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor/profile"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor/credentials"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorCredentialsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor/availability"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorAvailabilityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/doctors/:doctorId"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDoctorReviewPage />
              </ProtectedRoute>
            }
          />

          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
