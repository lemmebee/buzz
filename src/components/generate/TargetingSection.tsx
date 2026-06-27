"use client";

import type { TargetType } from "@/lib/brain/types";
import type { Suggestions } from "./types";

interface TargetingSectionProps {
  suggestions: Suggestions;
  hookMode: "auto" | "specific";
  setHookMode: (mode: "auto" | "specific") => void;
  selectedHook: string;
  setSelectedHook: (hook: string) => void;
  selectedPillar: string;
  setSelectedPillar: (pillar: string) => void;
  targetType: TargetType | "";
  setTargetType: (type: TargetType | "") => void;
  targetValue: string;
  setTargetValue: (value: string) => void;
}

export function TargetingSection({
  suggestions,
  hookMode,
  setHookMode,
  selectedHook,
  setSelectedHook,
  selectedPillar,
  setSelectedPillar,
  targetType,
  setTargetType,
  targetValue,
  setTargetValue,
}: TargetingSectionProps) {
  return (
    <div className="pt-4 border-t border-border">
      <h3 className="text-sm font-medium text-text-primary mb-3">Targeting</h3>
      <p className="text-xs text-text-tertiary mb-4">
        Control which hooks, pillars, and pain points to focus on. Leave on &quot;Auto&quot; for AI-optimized selection.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Hook */}
        <div>
          <label className="block text-sm text-text-tertiary mb-1">Hook</label>
          {suggestions.suggestedHook && hookMode === "auto" && (
            <div className="mb-2 text-xs text-success bg-success-bg border border-success/20 px-2 py-1.5 rounded">
              <span className="font-medium">Suggested:</span> {suggestions.suggestedHook}
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={hookMode}
              onChange={(e) => setHookMode(e.target.value as "auto" | "specific")}
              className="px-2 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
            >
              <option value="auto">Auto</option>
              <option value="specific">Pick</option>
            </select>
            {hookMode === "specific" && (
              <select
                value={selectedHook}
                onChange={(e) => setSelectedHook(e.target.value)}
                className="flex-1 px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
              >
                <option value="">Select hook...</option>
                {suggestions.available.hooks.map((h) => (
                  <option key={h} value={h} title={h}>
                    {h} ({suggestions.usageStats.hooks[h] || 0}x)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Pillar */}
        <div>
          <label className="block text-sm text-text-tertiary mb-1">Content Pillar</label>
          {suggestions.suggestedPillar && !selectedPillar && (
            <div className="mb-2 text-xs text-success bg-success-bg border border-success/20 px-2 py-1.5 rounded">
              <span className="font-medium">Suggested:</span> {suggestions.suggestedPillar}
            </div>
          )}
          <select
            value={selectedPillar}
            onChange={(e) => setSelectedPillar(e.target.value)}
            className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
          >
            <option value="">Auto</option>
            {suggestions.available.pillars.map((p) => (
              <option key={p} value={p}>
                {p} ({suggestions.usageStats.pillars[p] || 0}x)
              </option>
            ))}
          </select>
        </div>

        {/* Target Type */}
        <div>
          <label className="block text-sm text-text-tertiary mb-1">Focus On</label>
          <select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as TargetType | "");
              setTargetValue("");
            }}
            className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
          >
            <option value="">Auto</option>
            <option value="pain">Pain Point</option>
            <option value="desire">Desire</option>
            <option value="objection">Objection</option>
          </select>
        </div>

        {/* Target Value */}
        {targetType && (
          <div>
            <label className="block text-sm text-text-tertiary mb-1">
              {targetType === "pain" ? "Pain Point" : targetType === "desire" ? "Desire" : "Objection"}
            </label>
            {!targetValue &&
              ((targetType === "pain" && suggestions.suggestedPain) ||
                (targetType === "desire" && suggestions.suggestedDesire) ||
                (targetType === "objection" && suggestions.suggestedObjection)) && (
                <div className="mb-2 text-xs text-success bg-success-bg border border-success/20 px-2 py-1.5 rounded">
                  <span className="font-medium">Suggested:</span>{" "}
                  {targetType === "pain" && suggestions.suggestedPain}
                  {targetType === "desire" && suggestions.suggestedDesire}
                  {targetType === "objection" && suggestions.suggestedObjection}
                </div>
              )}
            <select
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm text-text-primary bg-surface"
            >
              <option value="">Select...</option>
              {targetType === "pain" &&
                suggestions.available.pains.map((p) => (
                  <option key={p} value={p} title={p}>
                    {p} ({suggestions.usageStats.pains[p] || 0}x)
                  </option>
                ))}
              {targetType === "desire" &&
                suggestions.available.desires.map((d) => (
                  <option key={d} value={d} title={d}>
                    {d} ({suggestions.usageStats.desires[d] || 0}x)
                  </option>
                ))}
              {targetType === "objection" &&
                suggestions.available.objections.map((o) => (
                  <option key={o.objection} value={o.objection} title={o.objection}>
                    {o.objection} ({suggestions.usageStats.objections[o.objection] || 0}x)
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
