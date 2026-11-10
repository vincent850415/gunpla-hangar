import React, { useEffect, useRef } from 'react';

// Use the native top layer plus an explicit Tab loop: some browsers otherwise
// allow Tab to reach browser chrome at the boundary of a modal.
export function Dialog({ onClose, children, ...props }) {
  const ref = useRef(), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  function trapFocus(event) {
    const dialog = ref.current;
    if (event.key !== 'Tab' || event.target.closest('dialog') !== dialog) return;
    const elements = [...dialog.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]')]
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length && element.closest('dialog') === dialog);
    const first = elements[0], last = elements.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog {...props} ref={ref} onKeyDown={trapFocus} onCancel={event => { event.preventDefault(); event.stopPropagation(); close.current?.(); }}>{children}</dialog>;
}
