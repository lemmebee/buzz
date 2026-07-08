import { Composition } from "remotion";
import { BuzzVideo } from "./BuzzVideo";
import { COMPOSITION_ID, DEFAULT_PROPS, type BuzzVideoProps } from "./types";
import { SpecVideo } from "./SpecVideo";
import { SPEC_COMPOSITION_ID, DEFAULT_SPEC_PROPS, type SpecVideoProps } from "./spec";
import { ImageComposition } from "./ImageComposition";
import { IMAGE_COMPOSITION_ID, DEFAULT_IMAGE_PROPS, type ImageCompositionProps } from "./image-spec";

// A single parametric composition serves every aspect ratio / duration: the
// real width/height/fps/durationInFrames come from inputProps via
// calculateMetadata, so the provider drives geometry per render.
export function RemotionRoot() {
  return (
    <>
    <Composition
      id={COMPOSITION_ID}
      component={BuzzVideo}
      durationInFrames={DEFAULT_PROPS.durationInFrames}
      fps={DEFAULT_PROPS.fps}
      width={DEFAULT_PROPS.width}
      height={DEFAULT_PROPS.height}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={({ props }: { props: BuzzVideoProps }) => ({
        width: props.width,
        height: props.height,
        fps: props.fps,
        durationInFrames: Math.max(1, props.durationInFrames),
      })}
    />
    <Composition
      id={SPEC_COMPOSITION_ID}
      component={SpecVideo}
      durationInFrames={DEFAULT_SPEC_PROPS.durationInFrames}
      fps={DEFAULT_SPEC_PROPS.fps}
      width={DEFAULT_SPEC_PROPS.width}
      height={DEFAULT_SPEC_PROPS.height}
      defaultProps={DEFAULT_SPEC_PROPS}
      calculateMetadata={({ props }: { props: SpecVideoProps }) => ({
        width: props.width,
        height: props.height,
        fps: props.fps,
        durationInFrames: Math.max(1, props.durationInFrames),
      })}
    />
    <Composition
      id={IMAGE_COMPOSITION_ID}
      component={ImageComposition}
      durationInFrames={DEFAULT_IMAGE_PROPS.durationInFrames}
      fps={DEFAULT_IMAGE_PROPS.fps}
      width={DEFAULT_IMAGE_PROPS.width}
      height={DEFAULT_IMAGE_PROPS.height}
      defaultProps={DEFAULT_IMAGE_PROPS}
      calculateMetadata={({ props }: { props: ImageCompositionProps }) => ({
        width: props.width,
        height: props.height,
        fps: props.fps,
        durationInFrames: 1,
      })}
    />
    </>
  );
}
