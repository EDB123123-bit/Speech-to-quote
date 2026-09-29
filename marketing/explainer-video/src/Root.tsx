import { Composition, Still } from 'remotion';
import { Explainer, OgImage } from './Explainer';
import { FPS, TOTAL } from './timeline';

export function RemotionRoot() {
  return (
    <>
      <Composition id="Uitleg16x9" component={Explainer} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
      <Composition id="Uitleg9x16" component={Explainer} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
      <Still id="OgImage" component={OgImage} width={1200} height={630} />
    </>
  );
}
