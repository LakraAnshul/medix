import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Article } from '../types';
import { X, Clock, Calendar, Bookmark, Share2, Sparkles, Check } from 'lucide-react';

interface ArticleModalProps {
  article: Article | null;
  onClose: () => void;
  onOpenBooking: () => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({
  article,
  onClose,
  onOpenBooking,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!article) return null;

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <div className="p-6 sm:p-8 bg-[#fdf2f0] border-b border-slate-100 relative shrink-0">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-white/80 text-xs font-mono text-slate-700">
                  {article.date}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {article.category}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleShare}
                  className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-600 transition-colors"
                  title="Share article"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <h2 className="font-serif-display text-3xl sm:text-4xl text-[#0f233a] font-normal leading-tight">
              {article.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
              <Clock className="w-3.5 h-3.5" />
              <span>{article.readTime}</span>
              <span>• Medix Health Editorial Board</span>
            </div>
          </div>

          {/* Body Content (Scrollable) */}
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-700 font-sans text-base leading-relaxed">
            <p className="text-lg text-slate-800 font-medium border-l-4 border-rose-300 pl-4 py-1 italic bg-rose-50/40 rounded-r-xl">
              {article.summary}
            </p>

            {article.content.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}

            {/* Medical disclaimer */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Medical Review Notice</p>
              <p>
                This health education article is for informational purposes and is reviewed by certified physicians. Always consult a qualified specialist for personal diagnostic assessments.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
            <p className="text-xs text-slate-500 hidden sm:block">Have questions regarding these symptoms?</p>
            <button
              onClick={() => {
                onClose();
                onOpenBooking();
              }}
              className="px-6 py-2.5 rounded-full bg-[#0f233a] text-white text-xs sm:text-sm font-medium hover:bg-slate-800 transition-all shadow-xs cursor-pointer ml-auto"
            >
              Consult a Specialist
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
