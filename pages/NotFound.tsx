import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';

/** Catch-all 404 page for any unmatched route. */
const NotFound: React.FC = () => {
  return (
    <div className="max-w-xl mx-auto text-center py-20">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-[#F5F8FF] border border-[#E2E8F0] flex items-center justify-center mb-6">
        <Compass className="w-7 h-7 text-[#2563EB]" aria-hidden="true" />
      </div>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB] mb-2">
        404
      </p>
      <h1 className="font-display font-extrabold text-2xl text-[#0F172A] mb-2">Page not found</h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        to="/workspace"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] text-white text-sm font-semibold px-5 py-2.5 min-h-[44px] shadow-[0_10px_24px_-8px_rgba(37,99,235,0.5)] hover:bg-[#1E40AF] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to workspace
      </Link>
    </div>
  );
};

export default NotFound;
