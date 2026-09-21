import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Doctor } from '../types';
import { DOCTORS } from '../data/mockData';
import { Calendar, Star, ArrowUpRight, Award, Stethoscope, ChevronRight } from 'lucide-react';

interface DoctorsSectionProps {
  onSelectDoctor: (doctor: Doctor) => void;
  onBookDoctor: (doctor: Doctor) => void;
}

export const DoctorsSection: React.FC<DoctorsSectionProps> = ({
  onSelectDoctor,
  onBookDoctor,
}) => {
  const cardiologyDoctors = DOCTORS.filter((d) => d.department === 'Cardiology');
  const neurologyDoctors = DOCTORS.filter((d) => d.department === 'Neurology');
  const radiologyDoctors = DOCTORS.filter((d) => d.department === 'Radiology');

  const departments = [
    {
      name: 'Cardiology',
      tag: 'Cardiology',
      secondaryTag: '#atwwwtemplates',
      bgColor: 'bg-[#e2f6fd]',
      hoverBorder: 'hover:border-sky-300',
      doctors: cardiologyDoctors,
    },
    {
      name: 'Neurology',
      tag: 'Neurology',
      secondaryTag: '#atwwwtemplates',
      bgColor: 'bg-[#f9ede3]',
      hoverBorder: 'hover:border-amber-300',
      doctors: neurologyDoctors,
    },
    {
      name: 'Radiology',
      tag: 'Radiology',
      secondaryTag: '#atwwwtemplates',
      bgColor: 'bg-[#fcdad8]',
      hoverBorder: 'hover:border-rose-300',
      doctors: radiologyDoctors,
    },
  ];

  return (
    <section id="doctors-section" className="py-20 md:py-28 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="font-serif-display text-4xl sm:text-5xl md:text-6xl text-[#0f233a] font-normal leading-tight mb-5"
          >
            Meet our doctors
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed font-normal"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, but I give to the labor of the labor and the pain of a great time to fall into some of hermod. For your pardon
          </motion.p>
        </div>

        {/* Department Containers List */}
        <div className="space-y-8 max-w-5xl mx-auto">
          {departments.map((dept, deptIdx) => (
            <motion.div
              key={dept.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: deptIdx * 0.12 }}
              className={`${dept.bgColor} rounded-3xl p-6 sm:p-10 border border-transparent ${dept.hoverBorder} shadow-2xs hover:shadow-md transition-all duration-300`}
            >
              {/* Department Top Pills */}
              <div className="flex items-center justify-center gap-3 mb-8">
                <span className="px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-xs text-[#0f233a] text-xs sm:text-sm font-medium shadow-2xs">
                  {dept.tag}
                </span>
                <span className="px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-xs text-[#0f233a] text-xs sm:text-sm font-mono shadow-2xs">
                  {dept.secondaryTag}
                </span>
              </div>

              {/* Decorative vertical separator dot */}
              <div className="flex justify-around mb-4 opacity-40">
                <div className="w-1.5 h-4 rounded-full bg-[#0f233a]/30" />
                <div className="w-1.5 h-4 rounded-full bg-[#0f233a]/30" />
              </div>

              {/* Doctors Grid inside Department */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                {dept.doctors.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="flex flex-col items-center md:items-start text-center md:text-left group cursor-pointer"
                    onClick={() => onSelectDoctor(doctor)}
                  >
                    {/* Doctor Name & Role */}
                    <div className="w-full flex items-center justify-between pb-2 border-b border-black/5 group-hover:border-black/20 transition-colors">
                      <div>
                        <h3 className="font-serif-display text-2xl sm:text-3xl text-[#0f233a] group-hover:text-sky-900 transition-colors font-normal">
                          {doctor.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 font-sans mt-0.5">
                          {doctor.role} • <span className="text-slate-700">{doctor.specialty}</span>
                        </p>
                      </div>

                      {/* Circular icon / indicator button */}
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#0f233a] shadow-xs group-hover:scale-110 group-hover:bg-[#0f233a] group-hover:text-white transition-all">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Quick Doctor Details Preview */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-600 font-medium w-full justify-between">
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{doctor.rating}</span>
                        <span className="text-slate-400">({doctor.experienceYears}y exp)</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookDoctor(doctor);
                        }}
                        className="px-3 py-1 rounded-full bg-white/90 hover:bg-[#0f233a] text-[#0f233a] hover:text-white text-xs font-semibold shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Calendar className="w-3 h-3" />
                        <span>Book</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
};
