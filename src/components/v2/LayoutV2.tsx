import { Outlet, useLocation } from 'react-router-dom';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import ProfilesScreen from '../../pages/v2/ProfilesScreen';

export default function LayoutV2() {
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const isOnChat = location.pathname.startsWith('/chat/');

  // ─── Desktop: permanent side-by-side split ────────────────
  if (isDesktop) {
    return (
      <div className="split-layout safe-top relative z-10">
        {/* Ambient Glow Blobs (behind everything) */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="blur-blob blur-blob-indigo top-[-8%] right-[10%] w-[400px] h-[400px] opacity-[0.06]" />
          <div className="blur-blob blur-blob-cyan bottom-[-8%] left-[-5%] w-[400px] h-[400px] opacity-[0.06]" />
          <div className="blur-blob blur-blob-purple top-[35%] left-[45%] w-[300px] h-[300px] opacity-[0.03]" />
        </div>

        {/* LEFT PANE — Profiles/Devices (always visible) */}
        <aside className="split-sidebar bg-surface-default/80 backdrop-blur-sm z-10">
          <ProfilesScreen isDesktop />
        </aside>

        {/* RIGHT PANE — Radar (default) or Chat (selected) */}
        <main className="split-main bg-bg z-10">
          <Outlet />
        </main>
      </div>
    );
  }

  // ─── Mobile: single-pane with route navigation ────────────
  return (
    <div className="flex min-h-dvh flex-col safe-top relative z-10 overflow-x-hidden transition-colors duration-300">
      {/* Ambient Glow Blobs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="blur-blob blur-blob-indigo top-[-10%] right-[-10%] w-[280px] h-[280px] opacity-[0.08]" />
        <div className="blur-blob blur-blob-cyan bottom-[-10%] left-[-10%] w-[280px] h-[280px] opacity-[0.08]" />
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full mx-auto z-10 relative">
        <Outlet />
      </main>
    </div>
  );
}
