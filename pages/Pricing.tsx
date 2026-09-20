import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

/**
 * Simple, honest "Pricing" page — no invented tiers, prices, or fake
 * discounts. DocsGuard does not currently charge for scans; this page says so
 * plainly instead of fabricating a pricing table.
 */
const Pricing: React.FC = () => {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563EB] mb-2">
        Pricing
      </p>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#0F172A] mb-4">
        Free to use, for now
      </h1>
      <p className="text-sm sm:text-base text-[#475569] leading-relaxed mb-8">
        DocsGuard does not currently charge for document scans. There is no paid tier, trial period,
        or usage limit being enforced today. If that changes, this page will say so plainly — we
        won't publish invented pricing tiers or discounts in the meantime.
      </p>

      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 sm:p-8 mb-8">
        <h2 className="font-display font-bold text-lg text-[#0F172A] mb-4">What's included today</h2>
        <ul className="space-y-3">
          {[
            'Unlimited document scans in the current version',
            'Full forensic report for every scan, viewable and printable',
            'Local scan history, kept in your own browser',
            'Two sample reports to try the product without uploading a file',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-[#475569]">
              <Check className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-[#475569] leading-relaxed">
        Questions about future pricing or enterprise use? Reach out through{' '}
        <Link to="/about" className="text-[#2563EB] font-medium hover:underline">
          the About page
        </Link>{' '}
        for what DocsGuard does, or head to{' '}
        <Link to="/workspace" className="text-[#2563EB] font-medium hover:underline">
          the workspace
        </Link>{' '}
        to try a scan.
      </p>
    </div>
  );
};

export default Pricing;
