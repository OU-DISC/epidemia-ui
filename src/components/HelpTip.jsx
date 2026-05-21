import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function HelpTip({ text, label = "Help", placement = "above" }) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 8;

    if (placement === "below") {
      setCoords({
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2,
      });
      return;
    }

    setCoords({
      top: rect.top - gap,
      left: rect.left + rect.width / 2,
    });
  }, [placement]);

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  const hide = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleReposition = () => updatePosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, updatePosition]);

  const stopBubble = (event) => {
    event.stopPropagation();
  };

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            className={`help-tip-portal${
              placement === "below" ? " help-tip-portal-below" : ""
            }`}
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
          >
            {text}
          </span>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="help-tip"
        tabIndex={0}
        aria-label={`${label}: ${text}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onMouseDown={stopBubble}
        onClick={stopBubble}
      >
        <span className="help-tip-icon" aria-hidden="true">
          i
        </span>
      </span>
      {tooltip}
    </>
  );
}

export default HelpTip;
