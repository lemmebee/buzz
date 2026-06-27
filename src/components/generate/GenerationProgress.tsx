"use client";

import { useEffect, useState } from "react";

interface GenerationProgressProps {
  isGenerating: boolean;
}

const stages = [
  { label: "Analyzing product profile...", duration: 5000 },
  { label: "Crafting hooks and angles...", duration: 8000 },
  { label: "Generating media...", duration: 15000 },
  { label: "Adding finishing touches...", duration: 5000 },
];

export function GenerationProgress({ isGenerating }: GenerationProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0);
      setCurrentStage(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1000);
    }, 1000);

    return () => clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!isGenerating) return;

    let accumulated = 0;
    for (let i = 0; i < stages.length; i++) {
      accumulated += stages[i].duration;
      if (elapsed < accumulated) {
        setCurrentStage(i);
        return;
      }
    }
    setCurrentStage(stages.length - 1);
  }, [elapsed, isGenerating]);

  if (!isGenerating) return null;

  const totalDuration = stages.reduce((sum, s) => sum + s.duration, 0);
  const progress = Math.min((elapsed / totalDuration) * 100, 95);

  return (
    <div className="mt-4 p-4 border border-primary/20 bg-primary/5 rounded-lg">
      <div className="flex items-center gap-3 mb-3">
        <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm font-medium text-text-primary">
          {stages[currentStage].label}
        </span>
        <span className="text-xs text-text-tertiary ml-auto">
          {Math.floor(elapsed / 1000)}s
        </span>
      </div>
      <div className="w-full h-2 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-1000 ease-out rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-text-tertiary mt-2">
        This usually takes 30-60 seconds. Don&apos;t close this page.
      </p>
    </div>
  );
}
