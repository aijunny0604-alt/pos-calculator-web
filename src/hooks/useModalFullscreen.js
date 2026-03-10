import { useState } from 'react';

export default function useModalFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = () => setIsFullscreen(prev => !prev);

  return { isFullscreen, toggleFullscreen };
}
