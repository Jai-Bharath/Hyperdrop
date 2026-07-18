import { Outlet } from 'react-router-dom';

export default function LayoutV2() {
  return (
    <div className="flex min-h-dvh flex-col safe-top relative z-10 overflow-x-hidden transition-colors duration-300">
      {/* Ambient Glow Mesh Backdrop & Digital Grid */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,var(--border-light)_1px,transparent_1px),linear-gradient(to_bottom,var(--border-light)_1px,transparent_1px)] bg-[size:32px_32px] opacity-70" />
      <div className="blur-blob blur-blob-indigo top-[-10%] right-[-10%] w-[320px] h-[320px] sm:w-[500px] sm:h-[500px] opacity-10" />
      <div className="blur-blob blur-blob-cyan bottom-[-10%] left-[-10%] w-[320px] h-[320px] sm:w-[500px] sm:h-[500px] opacity-10" />
      <div className="blur-blob blur-blob-purple top-[40%] left-[20%] w-[250px] h-[250px] opacity-5" />

      {/* Main Content wrapper */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-4 pb-8 z-10 relative">
        <Outlet />
      </main>
    </div>
  );
}
