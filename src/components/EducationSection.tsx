import React from 'react';
import { motion } from 'motion/react';
import { Article } from '../types';
import { Sun, Wind, Sparkles, BookOpen, Clock, ArrowRight } from 'lucide-react';

interface EducationSectionProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
}

export const EducationSection: React.FC<EducationSectionProps> = ({
  articles,
  onSelectArticle,
}) => {
  return (
    <section id="education-section" className="py-20 md:py-32 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header (Centered) */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="font-serif-display text-5xl sm:text-6xl md:text-7xl text-[#0f233a] leading-[1.08] mb-6 font-normal tracking-tight"
          >
            Health<br />education<br />for everyone
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-8"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, but I give to the labor of the labor and the pain of a great time to fall into some of hermod. For your pardon
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <button
              onClick={() => onSelectArticle(articles[0])}
              className="px-6 py-2.5 rounded-full border border-[#0f233a]/30 text-[#0f233a] text-xs sm:text-sm font-medium hover:bg-[#0f233a] hover:text-white transition-all duration-200 cursor-pointer shadow-2xs active:scale-95"
            >
              All education articles
            </button>
          </motion.div>
        </div>

        {/* Articles Grid */}
        <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
          {/* Top Row: 2 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {articles.slice(0, 2).map((article, index) => (
              <motion.article
                key={article.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                onClick={() => onSelectArticle(article)}
                className="bg-white/80 hover:bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/70 hover:border-slate-300 shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  {/* Date Badge */}
                  <div className="mb-4">
                    <span className="text-xs font-mono text-slate-500 font-medium">
                      {article.date}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-sans-body text-xl sm:text-2xl font-semibold text-[#0f233a] leading-snug mb-8 group-hover:text-sky-700 transition-colors">
                    {article.title}
                  </h3>

                  {/* Circular Image / Graphic Placeholder */}
                  <div className="w-full flex items-center justify-center py-6 sm:py-8">
                    <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-[#fde9e7] flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative overflow-hidden">
                      {index === 0 ? (
                        <div className="relative">
                          <Sun className="w-16 h-16 text-amber-500/80 animate-spin" style={{ animationDuration: '24s' }} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-amber-400/40 blur-xs" />
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <Wind className="w-16 h-16 text-emerald-500/80 transform -rotate-12" />
                          <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-cyan-300/60" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Explore Pill Button */}
                <div className="pt-4 flex items-center">
                  <div className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-medium text-slate-700 group-hover:text-[#0f233a] transition-colors">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#a7e5f2] group-hover:scale-125 transition-transform" />
                    <span>explore</span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          {/* Bottom Row: 1 Centered Card */}
          {articles[2] && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              <div className="hidden md:block" /> {/* Spacer */}
              <motion.article
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: 0.25 }}
                onClick={() => onSelectArticle(articles[2])}
                className="bg-white/80 hover:bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/70 hover:border-slate-300 shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  {/* Date Badge */}
                  <div className="mb-4">
                    <span className="text-xs font-mono text-slate-500 font-medium">
                      {articles[2].date}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-sans-body text-xl sm:text-2xl font-semibold text-[#0f233a] leading-snug mb-8 group-hover:text-sky-700 transition-colors">
                    {articles[2].title}
                  </h3>

                  {/* Circular Image / Graphic Placeholder */}
                  <div className="w-full flex items-center justify-center py-6 sm:py-8">
                    <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-[#fde9e7] flex items-center justify-center group-hover:scale-105 transition-transform duration-500 relative overflow-hidden">
                      <Sparkles className="w-16 h-16 text-rose-500/80" />
                    </div>
                  </div>
                </div>

                {/* Explore Pill Button */}
                <div className="pt-4 flex items-center">
                  <div className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-medium text-slate-700 group-hover:text-[#0f233a] transition-colors">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#a7e5f2] group-hover:scale-125 transition-transform" />
                    <span>explore</span>
                  </div>
                </div>
              </motion.article>
            </div>
          )}
        </div>

      </div>
    </section>
  );
};
