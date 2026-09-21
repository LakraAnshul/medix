import React from 'react';
import { motion } from 'motion/react';
import { Calendar, ArrowRight, ShieldCheck, HeartHandshake } from 'lucide-react';

interface ConsultationCTAProps {
  onBookAppointment: () => void;
  onReadMore: () => void;
}

export const ConsultationCTA: React.FC<ConsultationCTAProps> = ({
  onBookAppointment,
  onReadMore,
}) => {
  return (
    <section id="consultation-cta-section" className="py-24 md:py-36 bg-[#fafafa] relative overflow-hidden">
      {/* Subtle ambient light gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-rose-100/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        
        {/* Main Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="font-serif-display text-4xl sm:text-5xl md:text-6xl text-[#0f233a] leading-tight mb-6 font-normal tracking-tight"
        >
          Book now a free<br />consultation
        </motion.h2>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-10 font-normal"
        >
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <button
            id="cta-book-appointment-btn"
            onClick={onBookAppointment}
            className="px-8 py-3.5 rounded-full bg-[#0f233a] hover:bg-[#1a365d] text-white text-sm sm:text-base font-medium transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 cursor-pointer inline-flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Book an appointment</span>
          </button>

          <button
            id="cta-read-more-btn"
            onClick={onReadMore}
            className="px-8 py-3.5 rounded-full bg-[#fee9d7] hover:bg-[#fedbc2] text-[#0f233a] text-sm sm:text-base font-medium transition-all duration-200 cursor-pointer active:scale-95"
          >
            Read more
          </button>
        </motion.div>

        {/* Trust Badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>No credit card required for consultation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HeartHandshake className="w-4 h-4 text-rose-500" />
            <span>Same-day online or in-clinic slots</span>
          </div>
        </div>

      </div>
    </section>
  );
};
