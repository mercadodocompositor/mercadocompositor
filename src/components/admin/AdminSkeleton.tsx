import React from 'react';

export const AdminTableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 6
}) => {
  return (
    <div className="w-full space-y-3 animate-pulse">
      {/* Header skeleton */}
      <div className="h-10 bg-slate-950/80 rounded-xl w-full border border-slate-800" />
      {/* Rows skeleton */}
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div 
          key={rIdx} 
          className="h-16 bg-slate-950/50 rounded-2xl border border-slate-800/80 flex items-center justify-between px-4 gap-4"
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-slate-800 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 bg-slate-800 rounded w-1/3" />
              <div className="h-2.5 bg-slate-800/60 rounded w-1/4" />
            </div>
          </div>
          <div className="h-4 bg-slate-800 rounded w-24 hidden sm:block" />
          <div className="h-6 bg-slate-800 rounded-full w-20 hidden md:block" />
          <div className="h-8 bg-slate-800 rounded-xl w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const AdminCardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-3 bg-slate-800 rounded w-24" />
            <div className="w-8 h-8 rounded-xl bg-slate-800" />
          </div>
          <div className="h-7 bg-slate-800 rounded w-32" />
          <div className="h-3 bg-slate-800/60 rounded w-20" />
        </div>
      ))}
    </div>
  );
};
