import React from 'react';

export const SkeletonCardGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-6 rounded-2xl bg-[#141414] border border-white/10 animate-pulse space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 bg-white/10 rounded-full" />
            <div className="h-8 w-8 bg-white/10 rounded-xl" />
          </div>
          <div className="h-8 w-32 bg-white/10 rounded-lg" />
          <div className="h-3 w-20 bg-white/5 rounded-full" />
        </div>
      ))}
    </div>
  );
};

export const SkeletonTableRows: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 w-full bg-[#141414] border border-white/5 rounded-xl flex items-center justify-between px-4"
        >
          <div className="h-4 w-40 bg-white/10 rounded" />
          <div className="h-4 w-20 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-6 w-16 bg-white/10 rounded-full" />
        </div>
      ))}
    </div>
  );
};
