import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Doctor } from '../types';
import { X, Calendar, Star, GraduationCap, Clock, Award, ShieldCheck, HeartPulse } from 'lucide-react';

interface DoctorDetailModalProps {
  doctor: Doctor | null;
  onClose: () => void;
  onBook: (doctor: Doctor) => void;
}

export const DoctorDetailModal: React.FC<DoctorDetailModalProps> = ({
  doctor,
  onClose,
  onBook,
}) => {
  if (!doctor) return null;

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
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 my-8"
        >
          {/* Header Banner */}
          <div
            className="p-6 sm:p-8 flex items-start justify-between relative"
            style={{ backgroundColor: doctor.avatarColor || '#e2f6fd' }}
          >
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-white/80 text-xs font-mono font-medium text-slate-800 mb-3 shadow-2xs">
                {doctor.department}
              </span>
              <h3 className="font-serif-display text-3xl text-[#0f233a] font-normal">
                {doctor.name}
              </h3>
              <p className="text-sm text-slate-700 font-sans mt-0.5">
                {doctor.role} • {doctor.specialty}
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/70 hover:bg-white text-slate-700 transition-colors shadow-2xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 py-3 px-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
              <div>
                <p className="text-xs text-slate-500">Rating</p>
                <div className="flex items-center justify-center gap-1 font-semibold text-slate-800 mt-0.5">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{doctor.rating}</span>
                </div>
              </div>
              <div className="border-x border-slate-200">
                <p className="text-xs text-slate-500">Experience</p>
                <p className="font-semibold text-slate-800 mt-0.5">{doctor.experienceYears}+ Years</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Consultation</p>
                <p className="font-semibold text-slate-800 mt-0.5">{doctor.consultationFee}</p>
              </div>
            </div>

            {/* Biography */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                About the Specialist
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed font-sans">
                {doctor.bio}
              </p>
            </div>

            {/* Education */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-50/60 border border-sky-100 text-xs text-slate-700">
              <GraduationCap className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sky-900">Academic Background</p>
                <p className="text-slate-600 mt-0.5">{doctor.education}</p>
              </div>
            </div>

            {/* Available Schedule Days */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Weekly Clinical Availability
              </h4>
              <div className="flex gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => {
                  const isAvailable = doctor.availableDays.includes(day);
                  return (
                    <span
                      key={day}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                        isAvailable
                          ? 'bg-[#0f233a] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-400 opacity-60'
                      }`}
                    >
                      {day}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => {
                  onClose();
                  onBook(doctor);
                }}
                className="flex-1 py-3.5 rounded-full bg-[#0f233a] hover:bg-[#1a365d] text-white text-sm font-medium transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Book with {doctor.name.split(' ')[0]}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
