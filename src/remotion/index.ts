import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

// Entry point passed to @remotion/bundler's bundle(). This file is the root of
// the SEPARATE Remotion webpack bundle and is never imported by Next server code.
registerRoot(RemotionRoot);
