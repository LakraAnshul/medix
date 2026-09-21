/**
 * The public landing page.
 *
 * This is the original App.tsx body, moved here unchanged so that App.tsx can
 * become the router shell. The section order, props, modals, toast and styling
 * are exactly as they were — the only additions are the import depth (`../`) and
 * the auth buttons handed to the Navbar through its new optional `authSlot`.
 */
import React, {useState} from 'react';
import {Navbar} from '../components/Navbar';
import {HeroSection} from '../components/HeroSection';
import {SpecialtiesMarquee} from '../components/SpecialtiesMarquee';
import {FeatureShowcase} from '../components/FeatureShowcase';
import {EducationSection} from '../components/EducationSection';
import {DoctorsSection} from '../components/DoctorsSection';
import {PackagesSection} from '../components/PackagesSection';
import {ConsultationCTA} from '../components/ConsultationCTA';
import {Footer} from '../components/Footer';

import {BookingModal} from '../components/BookingModal';
import {DoctorDetailModal} from '../components/DoctorDetailModal';
import {ArticleModal} from '../components/ArticleModal';
import {PackageDetailModal} from '../components/PackageDetailModal';
import {HelpCenterModal} from '../components/HelpCenterModal';
import {NavbarAuthButtons} from '../components/NavbarAuthButtons';

import {ARTICLES} from '../data/mockData';
import {Doctor, Article, CheckupPackage} from '../types';
import {motion, AnimatePresence} from 'motion/react';
import {CheckCircle2} from 'lucide-react';

export default function LandingPage() {
  // Modal states
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] = useState<Doctor | null>(null);

  const [doctorDetailModalDoctor, setDoctorDetailModalDoctor] = useState<Doctor | null>(null);
  const [articleModalArticle, setArticleModalArticle] = useState<Article | null>(null);
  const [packageModalPackage, setPackageModalPackage] = useState<CheckupPackage | null>(null);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleNavigate = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({behavior: 'smooth'});
    }
  };

  const handleOpenBookingWithDoctor = (doc: Doctor) => {
    setSelectedDoctorForBooking(doc);
    setBookingModalOpen(true);
  };

  const handleOpenBookingGeneral = () => {
    setSelectedDoctorForBooking(null);
    setBookingModalOpen(true);
  };

  const handleSelectSpecialty = (specialty: string) => {
    handleNavigate('doctors-section');
    showToast(`Showing doctors & clinics for ${specialty}`);
  };

  const handleSelectPackageAndBook = (pkg: CheckupPackage) => {
    setBookingModalOpen(true);
    showToast(`Selected ${pkg.name} package. Complete booking below.`);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0f233a] font-sans flex flex-col selection:bg-[#fcd7d3] selection:text-[#0f233a]">
      {/* Navigation */}
      <Navbar
        onOpenBooking={handleOpenBookingGeneral}
        onOpenHelpCenter={() => setHelpCenterOpen(true)}
        onNavigate={handleNavigate}
        authSlot={<NavbarAuthButtons />}
        mobileAuthSlot={<NavbarAuthButtons variant="mobile" />}
      />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* 1. Hero Section */}
        <HeroSection
          onExploreDoctors={() => handleNavigate('doctors-section')}
          onReadMore={() => handleNavigate('features-showcase-section')}
        />

        {/* 2. Specialties Marquee Ticker */}
        <SpecialtiesMarquee onSelectSpecialty={handleSelectSpecialty} />

        {/* 3. Feature Showcase Cards */}
        <FeatureShowcase
          onExplorePackages={() => handleNavigate('packages-section')}
          onExploreDoctors={() => handleNavigate('doctors-section')}
        />

        {/* 4. Health Education / Articles */}
        <EducationSection
          articles={ARTICLES}
          onSelectArticle={(article) => setArticleModalArticle(article)}
        />

        {/* 5. Meet Our Doctors */}
        <DoctorsSection
          onSelectDoctor={(doc) => setDoctorDetailModalDoctor(doc)}
          onBookDoctor={handleOpenBookingWithDoctor}
        />

        {/* 6. Check-up Packages */}
        <PackagesSection
          onSelectPackage={(pkg) => setPackageModalPackage(pkg)}
          onBookPackage={handleSelectPackageAndBook}
        />

        {/* 7. Free Consultation CTA */}
        <ConsultationCTA
          onBookAppointment={handleOpenBookingGeneral}
          onReadMore={() => handleNavigate('education-section')}
        />
      </main>

      {/* Footer */}
      <Footer
        onNavigate={handleNavigate}
        onOpenBooking={handleOpenBookingGeneral}
        onOpenHelpCenter={() => setHelpCenterOpen(true)}
      />

      {/* Interactive Modals */}
      {/* Appointment Booking Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        initialDoctor={selectedDoctorForBooking}
      />

      {/* Doctor Detail Modal */}
      <DoctorDetailModal
        doctor={doctorDetailModalDoctor}
        onClose={() => setDoctorDetailModalDoctor(null)}
        onBook={handleOpenBookingWithDoctor}
      />

      {/* Article Reader Modal */}
      <ArticleModal
        article={articleModalArticle}
        onClose={() => setArticleModalArticle(null)}
        onOpenBooking={handleOpenBookingGeneral}
      />

      {/* Package Detail Modal */}
      <PackageDetailModal
        pkg={packageModalPackage}
        onClose={() => setPackageModalPackage(null)}
        onSelectAndBook={handleSelectPackageAndBook}
      />

      {/* Help Center Modal */}
      <HelpCenterModal
        isOpen={helpCenterOpen}
        onClose={() => setHelpCenterOpen(false)}
        onOpenBooking={handleOpenBookingGeneral}
      />

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{opacity: 0, y: 30}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 20}}
            className="fixed bottom-6 right-6 z-50 bg-[#0f233a] text-white px-5 py-3 rounded-2xl shadow-xl border border-slate-700/50 flex items-center gap-3 text-xs sm:text-sm font-medium"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
