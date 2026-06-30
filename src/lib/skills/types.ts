// Engines that can be augmented with curated knowledge packs.
// "profile-strategy" and "content" augment existing prompt builders;
// "brainstorming" and "plan-generation" are reserved for the new engines (later phases).
export type EngineId =
  | "profile-strategy"
  | "content"
  | "brainstorming"
  | "plan-generation"
  | "video-direction" // the creative director authoring a video spec
  | "video-judge"; // the director judging best-of-N video specs

// A knowledge pack: the body is injected into a prompt; tokenEstimate drives budget math.
export interface Pack {
  id: string;
  tokenEstimate: number;
  body: string;
}
