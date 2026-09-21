import React from 'react';
import {Link} from 'react-router-dom';
import {MedixLogoIcon} from '../components/Illustrations';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0f233a] font-sans flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <MedixLogoIcon className="w-8 h-8 mx-auto text-[#0f233a]" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          The page you were looking for does not exist or has moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex px-5 py-2.5 rounded-full bg-[#0f233a] text-white text-sm font-medium hover:opacity-90 transition"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
