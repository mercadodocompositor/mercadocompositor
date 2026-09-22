import { useEffect, useRef } from 'react';

const focusableSelector = [
  'button:not([disabled])', 'a[href]', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

export const useModalFocus = <T extends HTMLElement>(open: boolean, onClose: () => void) => {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = ref.current;
    const initial = modal?.querySelector<HTMLElement>('[data-autofocus], ' + focusableSelector);
    window.requestAnimationFrame(() => (initial || modal)?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modal) return;
      const items = Array.from(modal.querySelectorAll(focusableSelector)) as HTMLElement[];
      if (!items.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => previous?.focus());
    };
  }, [open]);

  return ref;
};
