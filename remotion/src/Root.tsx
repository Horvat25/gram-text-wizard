import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { BrandedVideoTemplate } from "./BrandedVideoTemplate";

export const RemotionRoot = () => (
  <>
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={525}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="branded-video"
      component={BrandedVideoTemplate}
      durationInFrames={600} // 20s at 30fps (adjustable via inputProps)
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        videoUrl: "",
        headline: "HEADLINE AQUI",
        handle: "@neuralupdate",
        tagline: "IA • Tecnologia • Futuro",
        sourceCredit: "",
      }}
    />
  </>
);
