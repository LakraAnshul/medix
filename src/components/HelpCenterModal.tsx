import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Phone, Mail, MapPin, Clock, HelpCircle, ChevronDown, ChevronUp, ShieldAlert, Stethoscope } from 'lucide-react';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBooking: () => void;
}

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  onClose,
  onOpenBooking,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How do I book an appointment with a specific doctor?',
      a: 'You can choose any specialist from our "Meet our doctors" section or click the "Book now" button in the top menu to select your doctor, date, and preferred time slot.',
    },
    {
      q: 'Are telemedicine consultations covered by insurance?',
      a: 'Yes, Medix is partnered with major national and international health insurance providers. Virtual consultations are covered under standard outpatient telehealth policies.',
    },
    {
      q: 'What is included in the annual Check-up Packages?',
      a: 'All packages include comprehensive blood work (CBC, lipids, glucose), resting 12-lead ECG, physician consultation, and full diagnostic reporting. Higher tiers add ultrasound and MRI imaging.',
    },
    {
      q: 'What if I need urgent or emergency care?',
      a: 'For acute emergencies, call our 24/7 priority line directly at 032 9844 or dial emergency services (911/112) immediately.',
    },
  ];

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
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 my-8 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 bg-[#d8effa] border-b border-slate-100 flex items-start justify-between shrink-0">
            <div>
              <span className="text-xs font-mono font-medium text-sky-900 uppercase tracking-wider">
                Support & Patient Services
              </span>
              <h3 className="font-serif-display text-3xl text-[#0f233a] font-normal">
                Help Center
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 font-sans mt-0.5">
                We are available 24/7 to assist with appointments, queries, and emergency support.
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-600 transition-colors shadow-2xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
            {/* Quick Contact Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-100 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-200/60 text-rose-700 shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-rose-900 uppercase">Emergency Hotline</p>
                  <a href="tel:0329844" className="font-serif-display text-xl text-rose-950 font-normal hover:underline">
                    032 9844
                  </a>
                  <p className="text-[11px] text-rose-700">Toll-free 24/7 medical triage</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-sky-200/60 text-sky-700 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-sky-900 uppercase">Clinic Hours</p>
                  <p className="text-sm font-medium text-sky-950">Mon – Sat: 08:00 – 20:00</p>
                  <p className="text-[11px] text-sky-700">Sun: Emergency & Urgent Care only</p>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600">
              <MapPin className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800 text-sm">Medix Central Healthcare Campus</p>
                <p className="mt-0.5">450 Innovation Parkway, Medical District, Building B</p>
                <p className="text-slate-500 mt-1">Valet patient parking and accessible transit ramps available.</p>
              </div>
            </div>

            {/* FAQs Accordion */}
            <div>
              <h4 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-sky-700" />
                <span>Frequently Asked Questions</span>
              </h4>

              <div className="space-y-2">
                {faqs.map((faq, i) => {
                  const isOpenItem = openFaq === i;
                  return (
                    <div
                      key={i}
                      className="border border-slate-200/80 rounded-xl overflow-hidden transition-colors bg-white"
                    >
                      <button
                        onClick={() => setOpenFaq(isOpenItem ? null : i)}
                        className="w-full px-4 py-3 text-left font-medium text-xs sm:text-sm text-slate-800 flex justify-between items-center hover:bg-slate-50"
                      >
                        <span>{faq.q}</span>
                        {isOpenItem ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>
                      {isOpenItem && (
                        <div className="px-4 pb-3.5 pt-1 text-xs sm:text-sm text-slate-600 font-sans border-t border-slate-100 bg-slate-50/50">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
            <span className="text-xs text-slate-500">Need urgent appointment?</span>
            <button
              onClick={() => {
                onClose();
                onOpenBooking();
              }}
              className="px-6 py-2.5 rounded-full bg-[#0f233a] text-white text-xs sm:text-sm font-medium hover:bg-slate-800 transition-all cursor-pointer"
            >
              Book an Appointment
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
