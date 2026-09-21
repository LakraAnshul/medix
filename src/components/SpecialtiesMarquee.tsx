import React from 'react';
import { SPECIALTIES } from '../data/mockData';

interface SpecialtiesMarqueeProps {
  onSelectSpecialty?: (specialty: string) => void;
}

export const SpecialtiesMarquee: React.FC<SpecialtiesMarqueeProps> = ({ onSelectSpecialty }) => {
  const row1 = [
    'Family Medicine',
    'Neurology',
    'Cardiology',
    'pathology',
    'Anesthesiology',
    'pathology',
    'Ophtalmology',
    'Pediatrics',
    'Dermatology',
    'Radiology',
  ];

  const row2 = [
    'Preventive Medicine',
    'Family Medicine',
    'Neurology',
    'Cardiology',
    'pathology',
    'Anesthesiology',
    'pathology',
    'Ophtalmology',
    'Orthopedics',
    'Immunology',
  ];

  // Duplicate arrays for seamless infinite looping
  const infiniteRow1 = [...row1, ...row1, ...row1];
  const infiniteRow2 = [...row2, ...row2, ...row2];

  return (
    <div
      id="practices-section"
      className="w-full py-8 overflow-hidden relative select-none border-y border-slate-200/40 bg-[#fafafa]"
    >
      {/* Left/Right soft gradient fade masks for smooth transition */}
      <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-r from-[#fafafa] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-l from-[#fafafa] to-transparent z-10 pointer-events-none" />

      {/* Row 1 (Moving Left) */}
      <div className="flex w-full mb-3.5">
        <div className="animate-marquee-left flex items-center gap-3">
          {infiniteRow1.map((item, idx) => (
            <button
              key={`row1-${idx}`}
              onClick={() => onSelectSpecialty?.(item)}
              className="px-5 py-2 rounded-full bg-[#d6f0fc] hover:bg-[#bde5f8] text-[#0f233a] text-xs sm:text-sm font-medium tracking-normal transition-all duration-200 hover:scale-105 active:scale-95 shadow-2xs whitespace-nowrap cursor-pointer"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2 (Moving Right or Offset Left) */}
      <div className="flex w-full">
        <div className="animate-marquee-right flex items-center gap-3">
          {infiniteRow2.map((item, idx) => (
            <button
              key={`row2-${idx}`}
              onClick={() => onSelectSpecialty?.(item)}
              className="px-5 py-2 rounded-full bg-[#d6f0fc] hover:bg-[#bde5f8] text-[#0f233a] text-xs sm:text-sm font-medium tracking-normal transition-all duration-200 hover:scale-105 active:scale-95 shadow-2xs whitespace-nowrap cursor-pointer"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
