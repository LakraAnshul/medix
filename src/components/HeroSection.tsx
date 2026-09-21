import React from 'react';
import { motion } from 'motion/react';
import { HeroAbstractStar, HeroMaskedEmoji, ECGWaveform } from './Illustrations';
import { ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Heart } from 'lucide-react';

interface HeroSectionProps {
  onExploreDoctors: () => void;
  onReadMore: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreDoctors,
  onReadMore,
}) => {
  return (
    <section
      id="hero-section"
      className="relative pt-6 pb-16 md:pt-12 md:pb-24 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Heading, Description & CTAs */}
          <motion.div
            className="lg:col-span-6 flex flex-col items-start z-10"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Main Headline */}
            <h1 className="font-serif-display text-5xl sm:text-6xl lg:text-7xl text-[#0f233a] leading-[1.08] tracking-tight font-normal mb-6 max-w-xl">
              Meet the best doctors today
            </h1>

            {/* Subtext description matching original layout */}
            <p className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed max-w-lg mb-8 font-normal">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, but I give to the labor of the labor and the pain of a great time to fall into some of hermod. For your pardon.
            </p>

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center gap-3.5 mb-8">
              <button
                id="hero-our-doctors-btn"
                onClick={onExploreDoctors}
                className="px-7 py-3 rounded-full bg-[#fcd7d3] hover:bg-[#fabeb8] text-[#0f233a] text-sm font-medium transition-all duration-200 shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
              >
                Our Doctors
              </button>
              <button
                id="hero-read-more-btn"
                onClick={onReadMore}
                className="px-7 py-3 rounded-full bg-transparent hover:bg-slate-100/70 border border-[#0f233a]/30 text-[#0f233a] text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95"
              >
                read more
              </button>
            </div>

            {/* ECG Pulse sketch illustration below */}
            <div className="pt-2 pl-4">
              <ECGWaveform className="w-56 h-10 text-rose-300/80" />
            </div>
          </motion.div>

          {/* Right Column: Hero Visual Compositions (Pink star + Masked Emoji) */}
          <motion.div
            className="lg:col-span-6 relative flex items-center justify-center min-h-[380px] sm:min-h-[440px]"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Background subtle atmospheric aura */}
            <div className="absolute w-72 h-72 rounded-full bg-rose-100/40 filter blur-3xl -top-10 left-10 pointer-events-none" />
            <div className="absolute w-72 h-72 rounded-full bg-sky-100/40 filter blur-3xl -bottom-10 right-10 pointer-events-none" />

            {/* Graphic composition */}
            <div className="relative flex flex-row items-center justify-center gap-4 sm:gap-6">
              {/* Pink Abstract Star Circle */}
              <div className="transform -translate-y-4 sm:-translate-y-6">
                <HeroAbstractStar />
              </div>

              {/* Cyan Circle with Cute 3D Masked Emoji */}
              <div className="transform translate-y-4 sm:translate-y-6">
                <HeroMaskedEmoji />
              </div>
            </div>

            {/* Floating verification badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="absolute -bottom-4 left-4 sm:left-12 bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2.5 hidden sm:flex"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-800">Board Certified</p>
                <p className="text-slate-500">100% Verified Specialists</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
