import React from 'react';
import { Phone, ArrowUp } from 'lucide-react';

interface FooterProps {
  onNavigate: (sectionId: string) => void;
  onOpenBooking: () => void;
  onOpenHelpCenter: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigate,
  onOpenBooking,
  onOpenHelpCenter,
}) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer id="main-footer" className="bg-[#fafafa] border-t border-slate-200/70 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Footer Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-16 border-b border-slate-200/70">
          
          {/* Left Column: Phone & Socials */}
          <div className="lg:col-span-6 flex flex-col items-start">
            <div className="mb-2">
              <a
                href="tel:0329844"
                className="font-serif-display text-5xl sm:text-6xl text-[#0f233a] hover:text-sky-800 transition-colors tracking-tight font-normal"
              >
                032 9844
              </a>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-sans mb-8">
              (callable from any national network, fixed or mobile)
            </p>

            {/* Social Buttons */}
            <div className="flex flex-wrap gap-2.5">
              {['Facebook', 'Instagram', 'Linkedin', 'Twitter'].map((social) => (
                <button
                  key={social}
                  onClick={() => window.open(`https://${social.toLowerCase()}.com`, '_blank')}
                  className="px-5 py-2 rounded-full border border-slate-300/80 bg-white hover:bg-slate-100 text-[#0f233a] text-xs sm:text-sm font-medium transition-all shadow-2xs cursor-pointer active:scale-95"
                >
                  {social}
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Links Columns */}
          <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
            
            {/* Clinic Column */}
            <div>
              <h4 className="font-semibold text-[#0f233a] mb-4">Clinic</h4>
              <ul className="space-y-3 text-sky-700">
                <li>
                  <button
                    onClick={() => onNavigate('doctors-section')}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    Doctors
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('education-section')}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    Education
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('practices-section')}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    Practices
                  </button>
                </li>
              </ul>
            </div>

            {/* Resources Column */}
            <div>
              <h4 className="font-semibold text-[#0f233a] mb-4">Resources</h4>
              <ul className="space-y-3 text-sky-700">
                <li>
                  <button
                    onClick={onOpenHelpCenter}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    onClick={onOpenHelpCenter}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    Terms and Conditions
                  </button>
                </li>
                <li>
                  <button
                    onClick={onOpenHelpCenter}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    legal Notice
                  </button>
                </li>
              </ul>
            </div>

            {/* About Column */}
            <div>
              <h4 className="font-semibold text-[#0f233a] mb-4">About</h4>
              <ul className="space-y-3 text-sky-700">
                <li>
                  <button
                    onClick={onOpenBooking}
                    className="hover:underline hover:text-sky-900 transition-colors text-left"
                  >
                    appointment
                  </button>
                </li>
              </ul>
            </div>

          </div>

        </div>

        {/* Bottom Credits & Back to Top */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>Template by <span className="text-slate-600 font-medium">atwww.studio</span></p>
          <div className="flex items-center gap-4">
            <p>Powered by <span className="text-slate-600 font-medium">Webflow</span></p>
            <button
              onClick={scrollToTop}
              className="p-1.5 rounded-full hover:bg-slate-200/60 text-slate-600 transition-colors"
              title="Scroll to top"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
