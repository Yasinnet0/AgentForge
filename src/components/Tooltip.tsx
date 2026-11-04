import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  content: string;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement<any>;
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  position = 'top',
  children,
  delay: delayProp,
}) => {
  const getDelay = () => {
    if (delayProp !== undefined) return delayProp;
    try {
      const saved = localStorage.getItem('agentforge_tooltip_delay');
      return saved ? parseInt(saved, 10) : 50;
    } catch {
      return 50;
    }
  };
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [actualPosition, setActualPosition] = useState<'top' | 'bottom' | 'left' | 'right'>(position);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  const calculatePosition = useCallback((target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    let effectivePos = position;

    // Viewport collision checks:
    // If target is in top 48px of viewport (e.g. TopBar), 'top' position will clip offscreen!
    if (effectivePos === 'top' && rect.top < 45) {
      effectivePos = 'bottom';
    } else if (effectivePos === 'bottom' && rect.bottom > window.innerHeight - 45) {
      effectivePos = 'top';
    } else if (effectivePos === 'left' && rect.left < 80) {
      effectivePos = 'right';
    } else if (effectivePos === 'right' && rect.right > window.innerWidth - 80) {
      effectivePos = 'left';
    }

    setActualPosition(effectivePos);

    let top = 0;
    let left = 0;

    switch (effectivePos) {
      case 'bottom':
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
        break;
      case 'top':
      default:
        top = rect.top - 8;
        left = rect.left + rect.width / 2;
        break;
    }

    // Viewport boundary horizontal clamping to prevent off-screen overflow on left or right
    const horizontalMargin = 30;
    left = Math.max(horizontalMargin, Math.min(window.innerWidth - horizontalMargin, left));

    setCoords({ top, left });
  }, [position]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    targetRef.current = e.currentTarget;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (targetRef.current) {
        calculatePosition(targetRef.current);
        setIsVisible(true);
      }
    }, getDelay());
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  const handleClick = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isVisible) return;
    const dismiss = () => setIsVisible(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const child = React.cloneElement(children as React.ReactElement<any>, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseEnter?.(e);
      handleMouseEnter(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseLeave?.(e);
      handleMouseLeave();
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onClick?.(e);
      handleClick();
    },
  });

  return (
    <>
      {child}
      {isVisible && createPortal(
        <div
          className={`forge-custom-tooltip pos-${actualPosition}`}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
          }}
          role="tooltip"
        >
          <div className="tooltip-notch" />
          <span className="tooltip-content-text">{content}</span>
          {shortcut && (
            <kbd className="tooltip-content-shortcut font-mono">{shortcut}</kbd>
          )}
        </div>,
        document.body
      )}
    </>
  );
};
