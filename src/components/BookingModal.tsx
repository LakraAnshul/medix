import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Clock, User, Phone, Mail, CheckCircle2, Stethoscope, Sparkles } from 'lucide-react';
import { DOCTORS } from '../data/mockData';
import { Doctor, Appointment } from '../types';
import confetti from 'canvas-confetti';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDoctor?: Doctor | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  initialDoctor,
}) => {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    initialDoctor ? initialDoctor.id : DOCTORS[0].id
  );
  const [selectedDate, setSelectedDate] = useState<string>('2026-08-25');
  const [selectedTime, setSelectedTime] = useState<string>('10:30 AM');
  const [patientName, setPatientName] = useState<string>('');
  const [patientEmail, setPatientEmail] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [confirmedData, setConfirmedData] = useState<Appointment | null>(null);

  const timeSlots = [
    '09:00 AM',
    '09:45 AM',
    '10:30 AM',
    '11:15 AM',
    '02:00 PM',
    '02:45 PM',
    '03:30 PM',
    '04:15 PM',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const doc = DOCTORS.find((d) => d.id === selectedDoctorId) || DOCTORS[0];
    const appointmentData: Appointment = {
      id: `APT-${Math.floor(100000 + Math.random() * 900000)}`,
      patientName: patientName || 'Alex Morgan',
      patientEmail: patientEmail || 'alex.m@example.com',
      patientPhone: patientPhone || '+1 (555) 234-5678',
      doctorName: doc.name,
      specialty: doc.specialty,
      date: selectedDate,
      time: selectedTime,
      notes: notes,
    };

    setConfirmedData(appointmentData);
    setIsSuccess(true);

    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#38bdf8', '#fbbf24', '#f43f5e', '#a78bfa', '#34d399'],
      });
    } catch {
      // ignore
    }
  };

  const handleReset = () => {
    setIsSuccess(false);
    setConfirmedData(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100 bg-[#fafafa]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#fcd7d3] flex items-center justify-center text-[#0f233a]">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif-display text-xl sm:text-2xl text-[#0f233a] font-normal">
                  Book an Appointment
                </h3>
                <p className="text-xs text-slate-500 font-sans">Free preliminary doctor consultation</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 sm:p-8">
            {!isSuccess ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Doctor Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Select Specialist / Doctor
                  </label>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] focus:ring-1 focus:ring-[#0f233a] text-sm bg-white text-[#0f233a]"
                  >
                    {DOCTORS.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} — {doc.department} ({doc.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Time Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Preferred Date
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] text-sm bg-white text-[#0f233a]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Select Time Slot
                    </label>
                    <select
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] text-sm bg-white text-[#0f233a]"
                    >
                      {timeSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Patient Information */}
                <div className="space-y-3 pt-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Patient Details
                  </label>
                  
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Full Name (e.g., Alex Morgan)"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] text-sm text-[#0f233a]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        placeholder="Email Address"
                        value={patientEmail}
                        onChange={(e) => setPatientEmail(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] text-sm text-[#0f233a]"
                      />
                    </div>

                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] text-sm text-[#0f233a]"
                      />
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Brief description of symptoms or reason for visit (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#0f233a] text-sm text-[#0f233a] resize-none"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-3">
                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-full bg-[#0f233a] hover:bg-[#1a365d] text-white font-medium text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Confirm Free Consultation</span>
                  </button>
                  <p className="text-center text-[11px] text-slate-400 mt-2.5">
                    Instant confirmation • 24h free cancellation • Confidential HIPAA privacy
                  </p>
                </div>
              </form>
            ) : (
              /* Success State */
              <div className="text-center py-4 space-y-6">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div>
                  <h4 className="font-serif-display text-2xl sm:text-3xl text-[#0f233a] mb-2 font-normal">
                    Appointment Confirmed!
                  </h4>
                  <p className="text-sm text-slate-600">
                    We have reserved your consultation slot and sent confirmation to{' '}
                    <span className="font-medium text-slate-900">{confirmedData?.patientEmail}</span>.
                  </p>
                </div>

                {/* Appointment Ticket Card */}
                <div className="bg-[#f0f7f4] border border-emerald-200/80 rounded-2xl p-5 text-left text-xs sm:text-sm space-y-2 text-slate-700">
                  <div className="flex justify-between border-b border-emerald-200/50 pb-2">
                    <span className="text-slate-500">Booking ID:</span>
                    <span className="font-mono font-semibold text-slate-900">{confirmedData?.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-200/50 pb-2">
                    <span className="text-slate-500">Doctor:</span>
                    <span className="font-medium text-slate-900">{confirmedData?.doctorName}</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-200/50 pb-2">
                    <span className="text-slate-500">Specialty:</span>
                    <span>{confirmedData?.specialty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scheduled Time:</span>
                    <span className="font-semibold text-slate-900">
                      {confirmedData?.date} at {confirmedData?.time}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleReset}
                  className="w-full py-3 rounded-full bg-[#0f233a] text-white text-sm font-medium hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
