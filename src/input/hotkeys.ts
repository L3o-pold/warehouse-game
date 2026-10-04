import { useEffect } from 'react';
import { useGame } from '../game/store';
import { isTyping } from './inputState';

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useGame.getState();
      if (s.screen !== 'game') return;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          s.togglePause();
          break;
        case '1':
          s.setSpeed(1);
          break;
        case '2':
          s.setSpeed(2);
          break;
        case '3':
          s.setSpeed(4);
          break;
        case 'b':
          s.toggleBuild();
          break;
        case 'c':
          s.toggleContracts();
          break;
        case 'r':
          s.toggleRoof();
          break;
        case 't':
          if (s.tool?.kind === 'rack') s.setTool({ kind: 'rack', orient: s.tool.orient === 'h' ? 'v' : 'h' });
          break;
        case 'h':
        case 'home':
          s.resetCamera();
          break;
        case 'escape':
          if (s.buildDragStart) s.setBuildDragStart(null);
          else if (s.tool) s.setTool(null);
          else if (s.contractsOpen) s.toggleContracts();
          else s.select(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
