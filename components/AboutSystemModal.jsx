import React, { useEffect } from 'react';

/**
 * AboutSystemModal Component
 * Clean, centered modal card with backdrop blur displaying software info & licensing.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Close callback function
 * @param {string} [props.appName="Infinity Dental Management"] - Software Name
 * @param {string} [props.version="v1.0.26"] - Version tag
 * @param {string} [props.clientName="Infinity Dental Clinic"] - Licensed client name
 * @param {string} [props.website="sankalpapaudel.com.np"] - Website display text
 * @param {string} [props.websiteUrl="https://sankalpapaudel.com.np"] - Website URL
 * @param {string} [props.supportContact="9748421950"] - Support contact number
 */
export default function AboutSystemModal({
  isOpen,
  onClose,
  appName = "Infinity Dental Management",
  version = "v1.0.26",
  clientName = "Infinity Dental Clinic",
  website = "sankalpapaudel.com.np",
  websiteUrl = "https://sankalpapaudel.com.np",
  supportContact = "9748421950",
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md transition-opacity duration-200 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 transform transition-all duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <h3 id="about-modal-title" className="text-base font-bold text-slate-100 tracking-tight">
              {appName}
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
              {version}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            aria-label="Close modal"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body Details (clean key-value rows) */}
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Licensed To</span>
            <span className="text-sm font-semibold text-slate-100">{clientName}</span>
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Website</span>
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
            >
              <span>{website}</span>
              <svg className="w-3.5 h-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Support Contact</span>
            <a
              href={`tel:${supportContact}`}
              className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>{supportContact}</span>
            </a>
          </div>
        </div>

        {/* Footer of the Card */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-t border-slate-800 text-center text-xs text-slate-400">
          Developed by{' '}
          <a
            href="https://sankalpapaudel.com.np"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-slate-200 hover:text-sky-400 transition-colors"
          >
            3P
          </a>{' '}
          • Built with ❤️ and legacy
        </div>
      </div>
    </div>
  );
}
