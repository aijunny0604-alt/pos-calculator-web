import { useState } from 'react';
import { animateModalFullscreen } from '@/lib/modalFullscreenMotion';

export default function useModalFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = (event) => animateModalFullscreen(event, () => setIsFullscreen(prev => !prev));

  return { isFullscreen, toggleFullscreen };
}
