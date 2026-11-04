import { useState, useEffect, useCallback, useRef } from 'react';

// Modal Transition Hook
export function useModalTransition(
  isOpen: boolean,
  onClose?: () => void,
  duration = 180
) {
  // State
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  const isClosingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIsOpenRef = useRef(isOpen);

  // Effects
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen) {
      if (isClosingRef.current && wasOpen) {
        return;
      }

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isClosingRef.current = false;
      setIsClosing(false);
      setIsRendered(true);
    } else {
      if (isRendered && !isClosingRef.current) {
        isClosingRef.current = true;
        setIsClosing(true);
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
          setIsRendered(false);
          setIsClosing(false);
          isClosingRef.current = false;
          closeTimerRef.current = null;
        }, duration);
      } else if (!isRendered) {
        isClosingRef.current = false;
        setIsClosing(false);
      }
    }
  }, [isOpen, isRendered, duration]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Handlers
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setIsRendered(false);
      setIsClosing(false);
      isClosingRef.current = false;
      closeTimerRef.current = null;
      if (onClose) {
        onClose();
      }
    }, duration);
  }, [onClose, duration]);

  // Global ESC key listener for any active modal using this hook
  useEffect(() => {
    if (!isRendered || isClosing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRendered, isClosing, handleClose]);

  return {
    isRendered,
    isClosing,
    handleClose,
  };
}
