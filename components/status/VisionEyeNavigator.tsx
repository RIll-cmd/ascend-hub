"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import type { TvSignalTransitionState, VisionEyeServiceId, VisionEyeTarget } from "./vision-eye-navigation";

export interface VisionEyeNavigatorProps {
  sceneElement: HTMLElement | null;
  transition: TvSignalTransitionState;
  hidden: boolean;
  reduceMotion: boolean;
  layoutVersion: string;
  onTargetsChange: (targets: readonly VisionEyeTarget[]) => void;
}

function readTargets(sceneElement: HTMLElement): VisionEyeTarget[] {
  const sceneRect = sceneElement.getBoundingClientRect();
  const triggers = sceneElement.querySelectorAll<HTMLElement>("[data-status-service-id]");

  return Array.from(triggers).flatMap(trigger => {
    const screen = trigger.querySelector<HTMLElement>(".shelf-status-tv__screen");
    const serviceId = trigger.dataset.statusServiceId as VisionEyeServiceId | undefined;
    const channel = trigger.dataset.statusChannel as VisionEyeTarget["channel"] | undefined;
    if (!screen || !serviceId || !channel) return [];

    const rect = screen.getBoundingClientRect();
    return [{
      serviceId,
      channel,
      x: rect.left - sceneRect.left + rect.width / 2,
      y: rect.top - sceneRect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    }];
  });
}

export function VisionEyeNavigator({
  sceneElement,
  transition,
  hidden,
  reduceMotion,
  layoutVersion,
  onTargetsChange,
}: VisionEyeNavigatorProps) {
  const [targets, setTargets] = useState<readonly VisionEyeTarget[]>([]);

  const measure = useCallback(() => {
    if (!sceneElement || hidden) return;
    const nextTargets = readTargets(sceneElement);
    setTargets(nextTargets);
    onTargetsChange(nextTargets);
  }, [hidden, onTargetsChange, sceneElement]);

  useLayoutEffect(() => {
    if (!sceneElement) return;

    let frame = requestAnimationFrame(measure);
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(sceneElement);
    sceneElement.querySelectorAll<HTMLElement>("[data-status-service-id]").forEach(element => observer.observe(element));
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [layoutVersion, measure, sceneElement]);

  const pulse = useMemo(() => {
    if (transition.phase !== "traveling" || !transition.sourceTvId || !transition.targetTvId || reduceMotion) return null;

    const source = targets.find(target => target.serviceId === transition.sourceTvId);
    const target = targets.find(target => target.serviceId === transition.targetTvId);
    if (!source || !target) return null;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    return {
      x: source.x,
      y: source.y,
      distance: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
    };
  }, [reduceMotion, targets, transition]);

  if (!pulse || hidden) return null;

  return (
    <div className="vision-eye-layer" aria-hidden="true">
      <div
        className="vision-eye-signal-pulse"
        style={{
          left: pulse.x,
          top: pulse.y,
          width: pulse.distance,
          transform: `translateY(-50%) rotate(${pulse.angle}deg)`,
        }}
      >
        <span />
      </div>
    </div>
  );
}
