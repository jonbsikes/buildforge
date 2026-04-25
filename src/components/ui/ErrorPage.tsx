"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex-1 p-4 lg:p-6 overflow-auto">
      <div className="max-w-lg mx-auto mt-16 text-center">
        <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#4272EF] hover:bg-[#3461de] text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RotateCcw size={15} />
          Try again
        </button>
      </div>
    </main>
  );
}
