import React from 'react';
import { motion } from 'motion/react';
import { GlobeDoctorBagArt, StaffClipboardArt, CheckupPackageArt } from './Illustrations';
import { ArrowUpRight } from 'lucide-react';

interface FeatureShowcaseProps {
  onExplorePackages: () => void;
  onExploreDoctors: () => void;
}

export const FeatureShowcase: React.FC<FeatureShowcaseProps> = ({
  onExplorePackages,
  onExploreDoctors,
}) => {
  return (
    <section id="features-showcase-section" className="py-16 md:py-24 space-y-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Card 1: Medicine for all the people around the globe */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full bg-[#d8effa] rounded-3xl p-8 sm:p-12 md:p-16 relative overflow-hidden transition-all duration-300 hover:shadow-lg"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-[56px] text-[#0f233a] leading-[1.12] mb-6 max-w-xl font-normal">
                Medicine for all the people around the globe
              </h2>
              <p className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed max-w-lg mb-8">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, but I give to the labor of the labor and the pain of a great time to fall into some of hermod. For your pardon
              </p>
              <div>
                <button
                  onClick={onExploreDoctors}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/80 hover:bg-white text-[#0f233a] text-sm font-medium transition-all duration-200 border border-slate-200/60 shadow-2xs group cursor-pointer"
                >
                  <span>Learn about our global network</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right Graphic Art */}
            <div className="lg:col-span-5 flex items-center justify-center lg:justify-end">
              <GlobeDoctorBagArt />
            </div>
          </div>
        </motion.div>

        {/* Card 2: Friendly staff and state facilities of the art */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full bg-[#fee9d7] rounded-3xl p-8 sm:p-12 md:p-16 relative overflow-hidden transition-all duration-300 hover:shadow-lg"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-[56px] text-[#0f233a] leading-[1.12] mb-6 max-w-xl font-normal">
                Friendly staff and state facilities of the art
              </h2>
              <p className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed max-w-lg mb-8">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, but I give to the labor of the labor and the pain of a great time to fall into some of hermod. For your pardon
              </p>
              <div>
                <button
                  onClick={onExploreDoctors}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/80 hover:bg-white text-[#0f233a] text-sm font-medium transition-all duration-200 border border-slate-200/60 shadow-2xs group cursor-pointer"
                >
                  <span>Tour our modern facilities</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right Graphic Art */}
            <div className="lg:col-span-5 flex items-center justify-center lg:justify-end">
              <StaffClipboardArt />
            </div>
          </div>
        </motion.div>

        {/* Card 3: Regular check-up package */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full bg-[#fddcdb] rounded-3xl p-8 sm:p-12 md:p-16 relative overflow-hidden transition-all duration-300 hover:shadow-lg"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              {/* Tag #medixthetemplate */}
              <div className="mb-4">
                <span className="inline-block px-3.5 py-1 rounded-full bg-white/70 backdrop-blur-xs text-[#0f233a] text-xs font-mono tracking-tight">
                  #medixthetemplate
                </span>
              </div>

              <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-[56px] text-[#0f233a] leading-[1.12] mb-6 max-w-xl font-normal">
                Regular check-up package
              </h2>
              <p className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed max-w-lg mb-8">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, but I give to the labor of the labor and the pain of a great time to fall into some of hermod. For your pardon
              </p>
              <div>
                <button
                  onClick={onExplorePackages}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/80 hover:bg-white text-[#0f233a] text-sm font-medium transition-all duration-200 border border-slate-200/60 shadow-2xs group cursor-pointer"
                >
                  <span>View check-up packages</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right Graphic Art */}
            <div className="lg:col-span-5 flex items-center justify-center lg:justify-end">
              <CheckupPackageArt />
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
};
