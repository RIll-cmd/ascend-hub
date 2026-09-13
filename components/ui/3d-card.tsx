"use client";

import { cn } from "@/lib/utils";
import React, {
  createContext,
  useState,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { dampedAxis, normalizedPointer } from "./parallax-motion";

interface MouseEnterContextType {
  isMouseEntered: boolean;
  setIsMouseEntered: React.Dispatch<React.SetStateAction<boolean>>;
  isReducedMotion: boolean;
}

const MouseEnterContext = createContext<MouseEnterContextType | undefined>(
  undefined
);

export const useMouseEnter = () => {
  const context = useContext(MouseEnterContext);
  if (!context) {
    throw new Error("useMouseEnter must be used within a CardContainer");
  }
  return context;
};

export interface CardContainerProps {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  perspective?: number;
  maxTiltX?: number;
  maxTiltY?: number;
  dampingFactor?: number;
}

/**
 * 3D Parallax Card Container (Vercel Web Interface & Impeccable Performance Standard)
 * - Zero React re-render loops on pointer movement
 * - GPU-accelerated requestAnimationFrame spring damping loop
 * - Automatic resting-position return on pointer exit
 * - Full prefers-reduced-motion accessibility compliance
 * - Preserves 3D context across child layers (overflow: visible)
 */
export const CardContainer = ({
  children,
  className,
  containerClassName,
  perspective = 1200,
  maxTiltX = 3,
  maxTiltY = 4,
  dampingFactor = 0.10,
}: CardContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isMouseEntered, setIsMouseEntered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafId = useRef<number | null>(null);
  const targetPosition = useRef({ x: 0, y: 0 });
  const currentPosition = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, []);

  // One damped frame loop drives both the camera and every depth-plane drift.
  const updateMotion = useCallback(
    function loop() {
      const stage = stageRef.current;
      if (!stage || reducedMotion) {
        rafId.current = null;
        return;
      }

      currentPosition.current.x = dampedAxis(currentPosition.current.x, targetPosition.current.x, dampingFactor);
      currentPosition.current.y = dampedAxis(currentPosition.current.y, targetPosition.current.y, dampingFactor);

      const x = currentPosition.current.x;
      const y = currentPosition.current.y;
      stage.style.setProperty("--mouse-x", x.toFixed(4));
      stage.style.setProperty("--mouse-y", y.toFixed(4));
      stage.style.transform = `rotateY(${(x * maxTiltY).toFixed(3)}deg) rotateX(${(-y * maxTiltX).toFixed(3)}deg)`;

      const diff = Math.abs(targetPosition.current.x - x) + Math.abs(targetPosition.current.y - y);
      if (diff > 0.001) {
        rafId.current = requestAnimationFrame(loop);
      } else {
        rafId.current = null;
      }
    },
    [reducedMotion, dampingFactor, maxTiltX, maxTiltY]
  );

  const scheduleMotion = useCallback(() => {
    if (!rafId.current && !reducedMotion) {
      rafId.current = requestAnimationFrame(updateMotion);
    }
  }, [reducedMotion, updateMotion]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") return;
      if (!containerRef.current || reducedMotion) return;
      const rect = containerRef.current.getBoundingClientRect();
      targetPosition.current = normalizedPointer(e.clientX, e.clientY, rect);
      scheduleMotion();
    },
    [reducedMotion, scheduleMotion]
  );

  const handleMouseEnter = useCallback(() => {
    setIsMouseEntered(true);
    scheduleMotion();
  }, [scheduleMotion]);

  const handleMouseLeave = useCallback(() => {
    setIsMouseEntered(false);
    targetPosition.current = { x: 0, y: 0 };
    scheduleMotion();
  }, [scheduleMotion]);

  useEffect(() => {
    if (!reducedMotion) return;
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    targetPosition.current = { x: 0, y: 0 };
    currentPosition.current = { x: 0, y: 0 };
    if (stageRef.current) {
      stageRef.current.style.transform = "none";
      stageRef.current.style.setProperty("--mouse-x", "0");
      stageRef.current.style.setProperty("--mouse-y", "0");
    }
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const contextValue = useMemo(
    () => ({ isMouseEntered, setIsMouseEntered, isReducedMotion: reducedMotion }),
    [isMouseEntered, reducedMotion]
  );

  return (
    <MouseEnterContext.Provider value={contextValue}>
      <div
        className={cn(
          "relative flex items-center justify-center w-full select-none",
          containerClassName
        )}
        ref={containerRef}
        style={{
          perspective: `${perspective}px`,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          ref={stageRef}
          onPointerEnter={handleMouseEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={handleMouseLeave}
          className={cn(
            "relative w-full will-change-transform [transform-style:preserve-3d]",
            className
          )}
          style={{ "--mouse-x": 0, "--mouse-y": 0 } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </MouseEnterContext.Provider>
  );
};

export interface CardBodyProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}

export const CardBody = ({
  children,
  className,
  style,
  ref,
}: CardBodyProps) => {
  return (
    <div
      ref={ref}
      className={cn(
        "relative w-full [transform-style:preserve-3d] [&>*]:[transform-style:preserve-3d]",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
};

export interface CardItemProps {
  as?: React.ElementType;
  children?: React.ReactNode;
  className?: string;
  translateX?: number | string;
  translateY?: number | string;
  translateZ?: number | string;
  parallaxX?: number;
  parallaxY?: number;
  rotateX?: number | string;
  rotateY?: number | string;
  rotateZ?: number | string;
  scale?: number | string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

/**
 * 3D Depth Plane Child Item
 * Uses direct CSS 3D translateZ in the parent perspective matrix for true spatial occlusion
 */
export const CardItem = ({
  as: Tag = "div",
  children,
  className,
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  parallaxX = 0,
  parallaxY = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  scale = 1,
  style,
  ...rest
}: CardItemProps) => {
  const { isReducedMotion } = useMouseEnter();

  const transformStyle = useMemo(() => {
    if (isReducedMotion) {
      return scale !== 1 ? `scale(${scale})` : undefined;
    }

    const tx = typeof translateX === "number" ? `${translateX}px` : translateX;
    const ty = typeof translateY === "number" ? `${translateY}px` : translateY;
    const tz = typeof translateZ === "number" ? `${translateZ}px` : translateZ;
    const s = scale !== 1 ? `scale(${scale}) ` : "";

    const px = parallaxX ? `translateX(calc(var(--mouse-x, 0) * ${parallaxX}px)) ` : "";
    const py = parallaxY ? `translateY(calc(var(--mouse-y, 0) * ${parallaxY}px)) ` : "";
    return `${s}${px}${py}translateX(${tx}) translateY(${ty}) translateZ(${tz}) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
  }, [translateX, translateY, translateZ, parallaxX, parallaxY, rotateX, rotateY, rotateZ, scale, isReducedMotion]);

  return (
    <Tag
      className={cn(
        "will-change-transform [transform-style:preserve-3d]",
        className
      )}
      style={{
        transform: transformStyle,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
};
