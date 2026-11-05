import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const A = "/feedback";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Forearm hinges at the sleeve end: 0deg = resting (hanging down), about -150deg = raised beside the head.
const WAVE = [
  { transform: "rotate(0deg)", offset: 0, easing: "ease-out" },
  { transform: "rotate(-150deg)", offset: 0.2 },
  { transform: "rotate(-132deg)", offset: 0.32 },
  { transform: "rotate(-166deg)", offset: 0.44 },
  { transform: "rotate(-132deg)", offset: 0.56 },
  { transform: "rotate(-166deg)", offset: 0.68 },
  { transform: "rotate(-150deg)", offset: 0.76, easing: "ease-in-out" },
  { transform: "rotate(0deg)", offset: 1 },
];

// Head dips toward the chest and tilts slightly, then returns.
const NOD = [
  { transform: "none", offset: 0 },
  { transform: "translateY(9%) rotate(3deg)", offset: 0.38 },
  { transform: "none", offset: 1 },
];

/**
 * The seated Feedback Desk character, split into body / head / forearm layers cut from the original
 * artwork so only the head and one forearm move. Exposes nod() for the rating buttons.
 */
const DeskCharacter = forwardRef(function DeskCharacter(_props, ref) {
  const headRef = useRef(null);
  const armRef = useRef(null);
  const nodAnim = useRef(null);

  useEffect(() => {
    const arm = armRef.current;
    if (!arm || prefersReducedMotion()) return undefined;
    let anim = null;
    let timer = null;
    const start = () => {
      timer = setTimeout(() => {
        anim = arm.animate(WAVE, { duration: 3000, easing: "linear" });
      }, 450);
    };
    if (arm.complete) start();
    else arm.addEventListener("load", start, { once: true });
    return () => {
      arm.removeEventListener("load", start);
      clearTimeout(timer);
      anim?.cancel();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    nod() {
      const head = headRef.current;
      if (!head || prefersReducedMotion()) return;
      nodAnim.current?.cancel(); // rapid clicks restart the nod from rest
      nodAnim.current = head.animate(NOD, { duration: 520, easing: "ease-in-out" });
    },
  }));

  return (
    <div className="fb-scene__person fb-char" aria-hidden="true">
      <img className="fb-char__body" src={`${A}/char-body.webp`} alt="" width="420" height="615" draggable="false" />
      <img className="fb-char__elbow" src={`${A}/char-elbow.png`} alt="" draggable="false" />
      <img ref={armRef} className="fb-char__arm" src={`${A}/char-arm.png`} alt="" draggable="false" />
      <img ref={headRef} className="fb-char__head" src={`${A}/char-head.webp`} alt="" draggable="false" />
    </div>
  );
});

export default DeskCharacter;
