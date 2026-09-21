import React from 'react';
import { motion } from 'motion/react';
import { CheckupPackage } from '../types';
import { CHECKUP_PACKAGES } from '../data/mockData';
import { ChevronRight, CheckCircle2, Sparkles, Shield } from 'lucide-react';

interface PackagesSectionProps {
  onSelectPackage: (pkg: CheckupPackage) => void;
  onBookPackage: (pkg: CheckupPackage) => void;
}

export const PackagesSection: React.FC<PackagesSectionProps> = ({
  onSelectPackage,
  onBookPackage,
}) => {
  return (
    <section id="packages-section" className="py-20 md:py-28 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column: Heading & Description */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-5 flex flex-col items-start"
          >
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-[#0f233a] leading-[1.12] mb-6 font-normal tracking-tight">
              Check-up<br className="hidden sm:inline" /> packages
            </h2>

            <p className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed mb-8 max-w-md font-normal">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
            </p>

            <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100/80 text-emerald-900 text-xs sm:text-sm font-medium">
              <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>All packages include certified lab diagnostic reports and online consultation.</span>
            </div>
          </motion.div>

          {/* Right Column: 3 Horizontal Price Capsules */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="lg:col-span-7 flex flex-col gap-4 sm:gap-5"
          >
            {CHECKUP_PACKAGES.map((pkg, idx) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                onClick={() => onSelectPackage(pkg)}
                className="w-full bg-[#f1f6f1] hover:bg-[#e9f2ea] rounded-full px-6 sm:px-8 py-5 flex items-center justify-between transition-all duration-200 border border-slate-200/50 hover:border-slate-300 shadow-2xs hover:shadow-xs cursor-pointer group"
              >
                {/* Left Part: Lilac Circle Dot + Package Name + Subtext */}
                <div className="flex items-center gap-4 sm:gap-5">
                  {/* Lilac circular icon dot */}
                  <div
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 shadow-2xs transition-transform group-hover:scale-110"
                    style={{ backgroundColor: pkg.color }}
                  >
                    <div className="w-3 h-3 rounded-full bg-white/70" />
                  </div>

                  <div>
                    <h3 className="font-sans-body text-base sm:text-lg font-semibold text-[#0f233a] leading-tight group-hover:text-emerald-900 transition-colors">
                      {pkg.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-sans mt-0.5 group-hover:text-slate-700 transition-colors">
                      Read what's included
                    </p>
                  </div>
                </div>

                {/* Right Part: Price ($/y) & Chevron */}
                <div className="flex items-center gap-3">
                  <span className="font-sans-body text-base sm:text-lg font-medium text-[#0f233a] whitespace-nowrap">
                    {pkg.price}{pkg.period}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-white/80 group-hover:bg-[#0f233a] group-hover:text-white flex items-center justify-center text-slate-500 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

        </div>
      </div>
    </section>
  );
};
