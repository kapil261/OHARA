import { Navigate, Route, Routes } from 'react-router-dom';
import { AppGate } from './AppGate';
import { LoginPage } from '../features/auth/LoginPage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { PatientLayout } from '../features/patient/PatientLayout';
import { PatientHome } from '../features/patient/PatientHome';
import { PlayPage } from '../features/patient/PlayPage';
import { FamilyPage } from '../features/patient/FamilyPage';
import { RemindersPage } from '../features/patient/RemindersPage';
import { SosPage } from '../features/patient/SosPage';
import { PatientSettingsPage } from '../features/patient/SettingsPage';
import { GamePage } from '../features/games/Games';
import { CaregiverFamily, CaregiverReport, CaregiverSchedule, CaregiverSettings } from '../features/caregiver/CaregiverTools';
import { CaregiverLayout } from '../features/caregiver/CaregiverLayout';
import { CaregiverAlerts, CaregiverOverview, CaregiverTeam } from '../features/caregiver/CaregiverPages';
import { HealthWorkerLayout, HealthWorkerPatients } from '../features/healthworker/HealthWorkerView';

/** Opt into React Router v7 behaviour now, so the upgrade is a no-op. */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/onboarding" element={<OnboardingPage />} />

    <Route element={<AppGate />}>
      {/* Patient mode: elder-sized, voice-first, high contrast */}
      <Route element={<PatientLayout />}>
        <Route path="/patient" element={<PatientHome />} />
        <Route path="/patient/play" element={<PlayPage />} />
        <Route path="/patient/play/:gameId" element={<GamePage />} />
        <Route path="/patient/family" element={<FamilyPage />} />
        <Route path="/patient/reminders" element={<RemindersPage />} />
        <Route path="/patient/sos" element={<SosPage />} />
        <Route path="/patient/settings" element={<PatientSettingsPage />} />
      </Route>

      {/* Caregiver dashboard */}
      <Route element={<CaregiverLayout />}>
        <Route path="/caregiver" element={<CaregiverOverview />} />
        <Route path="/caregiver/schedule" element={<CaregiverSchedule />} />
        <Route path="/caregiver/family" element={<CaregiverFamily />} />
        <Route path="/caregiver/alerts" element={<CaregiverAlerts />} />
        <Route path="/caregiver/report" element={<CaregiverReport />} />
        <Route path="/caregiver/settings" element={<CaregiverSettings />} />
        <Route path="/caregiver/team" element={<CaregiverTeam />} />
      </Route>

      {/* Health worker view */}
      <Route element={<HealthWorkerLayout />}>
        <Route path="/healthworker" element={<HealthWorkerPatients />} />
      </Route>
    </Route>

    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
);
