import React from 'react';
import { motion } from 'motion/react';

// Brand Medix Logo Icon
export const MedixLogoIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M14 6C17.3137 6 20 8.68629 20 12C20 8.68629 22.6863 6 26 6C29.3137 6 32 8.68629 32 12C32 15.3137 29.3137 18 26 18C22.6863 18 20 20.6863 20 24C20 20.6863 17.3137 18 14 18C10.6863 18 8 15.3137 8 12C8 8.68629 10.6863 6 14 6Z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="20" cy="20" r="2.5" fill="currentColor" />
    <path
      d="M26 34C22.6863 34 20 31.3137 20 28C20 31.3137 17.3137 34 14 34C10.6863 34 8 31.3137 8 28C8 24.6863 10.6863 22 14 22C17.3137 22 20 19.3137 20 16C20 19.3137 22.6863 22 26 22C29.3137 22 32 24.6863 32 28C32 31.3137 29.3137 34 26 34Z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ECG Waveform animation
export const ECGWaveform: React.FC<{ className?: string }> = ({ className = 'w-48 h-12 text-rose-300' }) => (
  <svg viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <motion.path
      d="M0 20 H40 L50 20 L58 10 L68 32 L78 2 L88 38 L96 16 L104 24 L110 20 H200"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{
        duration: 2.5,
        repeat: Infinity,
        ease: "easeInOut",
        repeatDelay: 0.5
      }}
    />
  </svg>
);

// Hero Pink Organic Cross / Constellation art
export const HeroAbstractStar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <motion.div
    className={`relative w-40 h-40 md:w-56 md:h-56 rounded-full bg-[#fedada] flex items-center justify-center ${className}`}
    animate={{ y: [0, -6, 0], rotate: [0, 1.5, 0] }}
    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
  >
    <svg viewBox="0 0 160 160" className="w-28 h-28 md:w-36 md:h-36" fill="none">
      {/* Curved 4-pointed organic black star */}
      <path
        d="M80 15 C80 55 55 80 15 80 C55 80 80 105 80 145 C80 105 105 80 145 80 C105 80 80 55 80 15 Z"
        stroke="#111827"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="80" cy="80" r="3" fill="#111827" />
    </svg>
  </motion.div>
);

// Hero Masked 3D Smiley Avatar Art
export const HeroMaskedEmoji: React.FC<{ className?: string }> = ({ className = '' }) => (
  <motion.div
    className={`relative w-44 h-44 md:w-60 md:h-60 rounded-full bg-[#d6f0fc] flex items-center justify-center overflow-visible ${className}`}
    animate={{ y: [0, 8, 0], scale: [1, 1.02, 1] }}
    transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
  >
    {/* Glow shadow */}
    <div className="absolute inset-4 rounded-full bg-cyan-200/50 blur-xl -z-10" />

    {/* The 3D emoji head */}
    <div className="relative w-32 h-32 md:w-44 md:h-44 rounded-full bg-gradient-to-b from-[#ff85c0] via-[#ff69b4] to-[#f43f5e] shadow-2xl flex flex-col items-center justify-center">
      {/* Top highlight for 3D sphere look */}
      <div className="absolute top-2 left-6 w-16 h-8 rounded-full bg-white/40 blur-[2px] transform -rotate-12" />
      
      {/* Cute happy eyes (crescents) */}
      <div className="flex items-center justify-between w-20 md:w-28 -mt-4 mb-2 z-10">
        <motion.div
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2 }}
          className="w-4 h-3 border-t-4 border-slate-900 rounded-t-full"
        />
        <motion.div
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2 }}
          className="w-4 h-3 border-t-4 border-slate-900 rounded-t-full"
        />
      </div>

      {/* Cyan surgical mask */}
      <motion.div
        className="relative w-24 md:w-32 h-14 md:h-18 bg-[#6ee7b7] rounded-xl border-2 border-cyan-400 shadow-md flex flex-col justify-center items-center overflow-hidden z-20"
        style={{ background: 'linear-gradient(135deg, #a7f3d0 0%, #67e8f9 100%)' }}
      >
        {/* Mask pleats */}
        <div className="w-full h-[1.5px] bg-cyan-700/20 my-[2px]" />
        <div className="w-full h-[1.5px] bg-cyan-700/20 my-[2px]" />
        <div className="w-full h-[1.5px] bg-cyan-700/20 my-[2px]" />

        {/* Mask ear loops */}
        <div className="absolute -left-3 top-2 w-4 h-10 border-2 border-white/80 rounded-l-full -z-10" />
        <div className="absolute -right-3 top-2 w-4 h-10 border-2 border-white/80 rounded-r-full -z-10" />
      </motion.div>

      {/* Blush dots */}
      <div className="absolute left-3 top-16 w-3.5 h-2 bg-pink-700/30 rounded-full blur-[1px]" />
      <div className="absolute right-3 top-16 w-3.5 h-2 bg-pink-700/30 rounded-full blur-[1px]" />
    </div>

    {/* Floating sparkle badge */}
    <motion.div
      className="absolute -top-2 -right-2 bg-white/90 backdrop-blur-md p-2 rounded-full shadow-lg border border-cyan-100"
      animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
      transition={{ duration: 4, repeat: Infinity }}
    >
      <svg className="w-5 h-5 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
      </svg>
    </motion.div>
  </motion.div>
);

// Card 1 Art: Globe & Doctor Medical Kit
export const GlobeDoctorBagArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    {/* Warm beige organic background blob */}
    <div className="w-60 h-60 md:w-72 md:h-72 rounded-full bg-[#fde9d2] flex items-center justify-center relative overflow-hidden transition-transform duration-500 hover:scale-105">
      <svg viewBox="0 0 240 240" className="w-48 h-48 md:w-56 md:h-56" fill="none">
        {/* Abstract teal & yellow doctor bag with cross */}
        <motion.g
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Medical Bag handle */}
          <path
            d="M95 90 C95 72 145 72 145 90"
            stroke="#0f233a"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Bag Body */}
          <rect
            x="60"
            y="90"
            width="120"
            height="85"
            rx="16"
            fill="#38bdf8"
            stroke="#0f233a"
            strokeWidth="5"
          />

          {/* Bag front highlight flap */}
          <path
            d="M60 115 H180"
            stroke="#0f233a"
            strokeWidth="4"
          />

          {/* Yellow pill / buckle */}
          <rect
            x="105"
            y="105"
            width="30"
            height="20"
            rx="5"
            fill="#fbbf24"
            stroke="#0f233a"
            strokeWidth="3.5"
          />

          {/* Red/White Medical Cross on bag */}
          <path
            d="M120 135 V155 M110 145 H130"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Stethoscope tube winding */}
          <path
            d="M50 120 C35 150 45 190 85 190 C125 190 135 210 160 205 C185 200 195 170 185 145"
            stroke="#0284c7"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
          <circle cx="50" cy="120" r="7" fill="#0f233a" />
          <circle cx="185" cy="145" r="9" fill="#38bdf8" stroke="#0f233a" strokeWidth="3" />

          {/* Ruler / thermometer floating */}
          <rect
            x="40"
            y="70"
            width="55"
            height="14"
            rx="7"
            transform="rotate(-30 40 70)"
            fill="#0ea5e9"
            stroke="#0f233a"
            strokeWidth="3.5"
          />
          
          {/* Sparkle star */}
          <path
            d="M175 60 L180 75 L195 80 L180 85 L175 100 L170 85 L155 80 L170 75 Z"
            fill="#f59e0b"
          />
        </motion.g>
      </svg>
    </div>
  </div>
);

// Card 2 Art: Friendly Staff & State Facilities (Clipboard + Sticky notes)
export const StaffClipboardArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    {/* Soft cyan circular backdrop blob */}
    <div className="w-60 h-60 md:w-72 md:h-72 rounded-full bg-[#d6f0fc] flex items-center justify-center relative overflow-hidden transition-transform duration-500 hover:scale-105">
      <svg viewBox="0 0 240 240" className="w-48 h-48 md:w-56 md:h-56" fill="none">
        <motion.g
          animate={{ y: [0, -5, 0], rotate: [0, -1, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Orange prominent Sticky note card */}
          <g transform="rotate(-6 100 110)">
            <rect
              x="50"
              y="70"
              width="105"
              height="80"
              rx="8"
              fill="#ea580c"
              stroke="#0f233a"
              strokeWidth="4"
            />
            {/* Blue adhesive tape on top */}
            <rect
              x="85"
              y="58"
              width="35"
              height="20"
              fill="#2563eb"
              stroke="#0f233a"
              strokeWidth="3"
            />
            {/* White lines on sticky note */}
            <rect x="65" y="92" width="75" height="5" rx="2.5" fill="#ffffff" />
            <rect x="65" y="106" width="60" height="5" rx="2.5" fill="#ffffff" />
            <rect x="65" y="120" width="45" height="5" rx="2.5" fill="#ffffff" />
          </g>

          {/* White checklist prescription card in background */}
          <g transform="rotate(8 140 140)">
            <rect
              x="110"
              y="95"
              width="85"
              height="95"
              rx="8"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="4"
            />
            {/* Checklist items */}
            <circle cx="125" cy="115" r="4" fill="#ea580c" />
            <rect x="135" y="113" width="45" height="4" rx="2" fill="#ea580c" />

            <circle cx="125" cy="135" r="4" fill="#ea580c" />
            <rect x="135" y="133" width="40" height="4" rx="2" fill="#ea580c" />

            <circle cx="125" cy="155" r="4" fill="#ea580c" />
            <rect x="135" y="153" width="48" height="4" rx="2" fill="#ea580c" />

            {/* Blue bottom clip badge */}
            <rect x="140" y="185" width="25" height="15" fill="#2563eb" rx="2" />
          </g>
        </motion.g>
      </svg>
    </div>
  </div>
);

// Card 3 Art: Regular Check-up Package (Document + Heart Shield + Medical Box)
export const CheckupPackageArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    {/* Soft light cyan backdrop blob */}
    <div className="w-60 h-60 md:w-72 md:h-72 rounded-full bg-[#d6f0fc] flex items-center justify-center relative overflow-hidden transition-transform duration-500 hover:scale-105">
      <svg viewBox="0 0 240 240" className="w-48 h-48 md:w-56 md:h-56" fill="none">
        <motion.g
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Medical Record Document */}
          <rect
            x="65"
            y="55"
            width="100"
            height="115"
            rx="8"
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="4"
          />
          {/* Checkboxes & lines */}
          <rect x="78" y="72" width="10" height="10" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          <path d="M80 77 L83 80 L87 74" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
          <rect x="95" y="75" width="55" height="4" rx="2" fill="#93c5fd" />

          <rect x="78" y="92" width="10" height="10" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          <path d="M80 97 L83 100 L87 94" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
          <rect x="95" y="95" width="45" height="4" rx="2" fill="#93c5fd" />

          <rect x="78" y="112" width="10" height="10" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          <path d="M80 117 L83 120 L87 114" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
          <rect x="95" y="115" width="50" height="4" rx="2" fill="#93c5fd" />

          {/* Red Heart Shield Badge */}
          <g transform="translate(145, 65)">
            <path
              d="M18 5 C30 5 35 15 35 25 C35 40 18 50 18 50 C18 50 1 40 1 25 C1 15 6 5 18 5 Z"
              fill="#ef4444"
              stroke="#0f233a"
              strokeWidth="3.5"
            />
            {/* Heart ECG line in shield */}
            <path
              d="M7 26 H13 L16 20 L20 32 L23 24 L25 28 H30"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* Blue Medical Kit Box in foreground */}
          <g transform="translate(100, 115)">
            <rect
              x="0"
              y="15"
              width="80"
              height="55"
              rx="12"
              fill="#2563eb"
              stroke="#0f233a"
              strokeWidth="4"
            />
            {/* Yellow Top Handle */}
            <path
              d="M25 15 V8 C25 4 55 4 55 8 V15"
              stroke="#fbbf24"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Yellow medical cross */}
            <path
              d="M40 30 V55 M27 42.5 H53"
              stroke="#fbbf24"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
          </g>
        </motion.g>
      </svg>
    </div>
  </div>
);
