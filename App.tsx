import React, { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ShieldMark } from './components/motifs/Motifs';

// Route-level code splitting. Each page is fetched only when its route is
// visited, keeping the initial bundle to the landing page + shared chrome.
const LandingPage = lazy(() => import('./components/LandingPage'));
const Workspace = lazy(() => import('./pages/Workspace'));
const ScanDetail = lazy(() => import('./pages/ScanDetail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EntityIntel = lazy(() => import('./pages/EntityIntel'));
const About = lazy(() => import('./pages/About'));
const Pricing = lazy(() => import('./pages/Pricing'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Scrolls the viewport to the top on every route change (browser Back/Forward included). */
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `inline-flex items-center rounded-full px-3 py-2 min-h-[36px] text-sm font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 ${
    isActive ? 'bg-[#EFF6FF] text-[#1E40AF]' : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F5F8FF]'
  }`;

/** Shared chrome for every route except the landing page: top nav + footer. */
const AppLayout: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white font-body flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 group shrink-0 min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 rounded-lg"
            aria-label="DocsGuard home"
          >
            <ShieldMark className="w-8 h-8 shrink-0" />
            <span className="font-display font-extrabold tracking-tight text-lg text-[#0F172A] truncate hidden sm:inline">
              DocsGuard
            </span>
          </button>

          <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Primary">
            <NavLink to="/workspace" className={navLinkClass} end>
              Workspace
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/intel" className={navLinkClass}>
              Intel
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              About
            </NavLink>
            <NavLink to="/pricing" className={navLinkClass}>
              Pricing
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white py-6">
        <p className="text-center text-xs text-[#475569] px-4">
          DocsGuard • Powered by Claude • Documents are analyzed securely and not stored on our servers.
        </p>
      </footer>
    </div>
  );
};

/** Lightweight loading state shown while a lazy route chunk is fetched. */
const PageFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
    <span className="sr-only">Loading…</span>
    <div className="w-8 h-8 rounded-full border-2 border-[#E2E8F0] border-t-[#2563EB] animate-spin" />
  </div>
);

/** Full-viewport fallback for the very first chunk (landing page or a direct deep link). */
const RootFallback: React.FC = () => (
  <div className="min-h-screen bg-white flex items-center justify-center" role="status" aria-live="polite">
    <span className="sr-only">Loading…</span>
    <div className="w-8 h-8 rounded-full border-2 border-[#E2E8F0] border-t-[#2563EB] animate-spin" />
  </div>
);

const LandingRoute: React.FC = () => {
  const navigate = useNavigate();
  return <LandingPage onEnter={() => navigate('/workspace')} />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RootFallback />}>
        <Routes>
          <Route path="/" element={<LandingRoute />} />

          <Route element={<AppLayout />}>
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/scan/:id" element={<ScanDetail />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/intel" element={<EntityIntel />} />
            <Route path="/about" element={<About />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
