import React, { useState, useEffect } from 'react';
import { MedixLogoIcon } from './Illustrations';
import { Calendar, Menu, X, Phone, HeartPulse, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  onOpenBooking: () => void;
  onOpenHelpCenter: () => void;
  onNavigate: (sectionId: string) => void;
  /** Optional auth controls rendered beside "Help Center" on desktop. */
  authSlot?: React.ReactNode;
  /** Optional auth controls rendered at the bottom of the mobile drawer. */
  mobileAuthSlot?: React.ReactNode;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenBooking,
  onOpenHelpCenter,
  onNavigate,
  authSlot,
  mobileAuthSlot,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLinkClick = (sectionId: string) => {
    onNavigate(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header
      id="main-navbar"
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled
          ? 'bg-[#fafafa]/90 backdrop-blur-md shadow-xs py-3 border-b border-slate-200/60'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo & Main Nav */}
        <div className="flex items-center gap-8 md:gap-12">
          {/* Logo */}
          <button
            id="brand-logo-btn"
            onClick={() => handleLinkClick('hero-section')}
            className="flex items-center gap-2 text-[#0f233a] hover:opacity-85 transition-opacity text-left group"
          >
            <div className="p-1 rounded-lg text-[#0f233a] transition-transform duration-300 group-hover:rotate-12">
              <MedixLogoIcon className="w-6 h-6 text-[#0f233a]" />
            </div>
            <span className="font-semibold text-xl tracking-tight text-[#0f233a]">medix</span>
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-[15px] font-normal text-[#1e293b]">
            <button
              id="nav-doctors"
              onClick={() => handleLinkClick('doctors-section')}
              className="text-[#1e293b] hover:text-[#0f233a] transition-colors cursor-pointer capitalize"
            >
              doctors
            </button>
            <button
              id="nav-practices"
              onClick={() => handleLinkClick('practices-section')}
              className="text-[#1e293b] hover:text-[#0f233a] transition-colors cursor-pointer"
            >
              Practices
            </button>
            <button
              id="nav-blog"
              onClick={() => handleLinkClick('education-section')}
              className="text-[#1e293b] hover:text-[#0f233a] transition-colors cursor-pointer"
            >
              Blog
            </button>
            <button
              id="nav-book-now"
              onClick={onOpenBooking}
              className="inline-flex items-center gap-1.5 text-[#1e293b] hover:text-[#0f233a] transition-colors cursor-pointer group"
            >
              <Calendar className="w-4 h-4 text-[#0f233a]/80 group-hover:scale-110 transition-transform" />
              <span>Book now</span>
            </button>
          </nav>
        </div>

        {/* Right Action Button */}
        <div className="hidden md:flex items-center gap-4">
          <button
            id="nav-help-center-btn"
            onClick={onOpenHelpCenter}
            className="px-5 py-2 rounded-full border border-[#0f233a]/30 text-[#0f233a] text-sm font-medium hover:bg-[#0f233a] hover:text-white transition-all duration-200 cursor-pointer shadow-2xs active:scale-95"
          >
            Help Center
          </button>
          {authSlot}
        </div>

        {/* Mobile Menu Trigger */}
        <div className="flex md:hidden items-center gap-2">
          <button
            id="mobile-quick-book"
            onClick={onOpenBooking}
            className="px-3.5 py-1.5 rounded-full bg-[#fcd7d3] text-[#0f233a] text-xs font-semibold"
          >
            Book
          </button>
          <button
            id="mobile-menu-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-full text-[#0f233a] hover:bg-slate-100 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-slate-200 px-6 py-6 shadow-xl overflow-hidden"
          >
            <div className="flex flex-col gap-4 text-base font-medium text-slate-800">
              <button
                onClick={() => handleLinkClick('doctors-section')}
                className="flex items-center justify-between py-2.5 border-b border-slate-100 text-left"
              >
                <span>Doctors</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={() => handleLinkClick('practices-section')}
                className="flex items-center justify-between py-2.5 border-b border-slate-100 text-left"
              >
                <span>Practices & Specialties</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={() => handleLinkClick('packages-section')}
                className="flex items-center justify-between py-2.5 border-b border-slate-100 text-left"
              >
                <span>Check-up Packages</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={() => handleLinkClick('education-section')}
                className="flex items-center justify-between py-2.5 border-b border-slate-100 text-left"
              >
                <span>Health Education & Blog</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <div className="pt-4 flex flex-col gap-3">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenBooking();
                  }}
                  className="w-full py-3 rounded-full bg-[#0f233a] text-white font-medium text-center shadow-sm flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Appointment</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenHelpCenter();
                  }}
                  className="w-full py-2.5 rounded-full border border-slate-300 text-slate-700 font-medium text-center hover:bg-slate-50"
                >
                  Help Center & Emergency
                </button>
              </div>

              {mobileAuthSlot && (
                <div
                  className="pt-4 mt-1 border-t border-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {mobileAuthSlot}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
