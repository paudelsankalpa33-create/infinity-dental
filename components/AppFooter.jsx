import React, { useState } from 'react';
import AboutSystemModal from './AboutSystemModal';

/**
 * AppFooter Component
 * Reusable project footer with copyright, clickable System Info / version badge, and developer attribution.
 *
 * @param {Object} props
 * @param {string} [props.clientName="Infinity Dental Clinic"] - Client or clinic name
 * @param {string} [props.appName="Infinity Dental Management"] - Software name passed to AboutSystemModal
 * @param {string} [props.version="v1.2.0"] - Version tag
 * @param {Function} [props.onOpenSystemInfo] - Optional external handler for opening AboutSystemModal
 * @param {number} [props.currentYear] - Optional explicit year (defaults to current year)
 * @param {string} [props.className=""] - Optional extra CSS classes
 */
export default function AppFooter({
  clientName = "Infinity Dental Clinic",
  appName = "Infinity Dental Management",
  version = "v1.2.0",
  onOpenSystemInfo,
  currentYear = new Date().getFullYear(),
  className = "",
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    if (onOpenSystemInfo) {
      onOpenSystemInfo();
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <footer
        className={`w-full py-4 px-6 mt-auto border-t border-slate-800 bg-slate-900/60 backdrop-blur-sm text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl ${className}`}
      >
        {/* Left Side: Copyright */}
        <div className="flex items-center gap-1.5 font-normal text-slate-300">
          <span>&copy; {currentYear}</span>
          <span className="font-semibold text-slate-200">{clientName}</span>
        </div>

        {/* Center: System Info / Version Badge Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/25 hover:bg-sky-500/20 hover:border-sky-500/50 hover:text-sky-300 transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 cursor-pointer"
            title="View System Information & Licensing"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>System Info</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/20 font-bold tracking-tight">
              {version}
            </span>
          </button>
        </div>

        {/* Right Side: Developer Attribution */}
        <div className="flex items-center gap-1 text-slate-400 text-right">
          <span>Developed by</span>
          <a
            href="https://sankalpapaudel.com.np"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-slate-200 hover:text-sky-400 transition-colors"
          >
            3P
          </a>
          <span>• Built with ❤️ and legacy</span>
        </div>
      </footer>

      {/* Render modal if internally managed */}
      {!onOpenSystemInfo && (
        <AboutSystemModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          appName={appName}
          version={version}
          clientName={clientName}
        />
      )}
    </>
  );
}
