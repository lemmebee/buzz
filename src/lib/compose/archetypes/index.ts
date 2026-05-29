import type { ArchetypeBuilder, ArchetypeId } from "./types";
import { editorial } from "./editorial";
import { displayImage } from "./displayImage";
import { photoCaption } from "./photoCaption";
import { iconCard } from "./iconCard";
import { quote } from "./quote";
import { stat } from "./stat";
import { steps } from "./steps";
import { feature } from "./feature";
import { announce } from "./announce";
import { article } from "./article";

export type { ArchetypeId, Brief, ArchetypeBuilder } from "./types";
export { ARCHETYPE_IDS } from "./types";

export const ARCHETYPES: Record<ArchetypeId, ArchetypeBuilder> = {
  editorial,
  displayImage,
  photoCaption,
  iconCard,
  quote,
  stat,
  steps,
  feature,
  announce,
  article,
};
