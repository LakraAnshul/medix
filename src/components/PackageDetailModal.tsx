import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckupPackage } from '../types';
import { X, CheckCircle2, Shield, Calendar, Sparkles } from 'lucide-react';

interface PackageDetailModalProps {
  pkg: CheckupPackage | null;
  onClose: () => void;
  onSelectAndBook: (pkg: CheckupPackage) => void;
}

export const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  pkg,
  onClose,
  onSelectAndBook,
}) => {
  if (!pkg) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 my-8"
        >
          {/* Header Banner */}
          <div className="p-6 sm:p-8 bg-[#f2f7f3] border-b border-slate-100 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs text-white"
                style={{ backgroundColor: pkg.color || '#0f233a' }}
              >
                <Shield className="w-6 h-6 text-[#0f233a]" />
              </div>
              <div>
                <span className="text-xs font-mono font-medium text-emerald-800 uppercase tracking-wider">
                  Preventive Care Tier
                </span>
                <h3 className="font-serif-display text-3xl text-[#0f233a] font-normal">
                  {pkg.name}
                </h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-serif-display text-2xl font-semibold text-[#0f233a]">
                    ${pkg.price}
                  </span>
                  <span className="text-xs text-slate-500 font-sans">{pkg.period} (Annual billing)</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-600 transition-colors shadow-2xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Features */}
          <div className="p-6 sm:p-8 space-y-6">
            <p className="text-sm text-slate-600 leading-relaxed font-sans">
              {pkg.description}
            </p>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Everything Included In This Plan:
              </h4>

              <div className="space-y-2.5">
                {pkg.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm text-slate-700 font-sans">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action */}
            <div className="pt-2">
              <button
                onClick={() => {
                  onClose();
                  onSelectAndBook(pkg);
                }}
                className="w-full py-3.5 rounded-full bg-[#0f233a] hover:bg-[#1a365d] text-white text-sm font-medium transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Enroll in {pkg.name} — ${pkg.price}{pkg.period}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
