import { Feather } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { Image, type ImageLoadEventData } from "expo-image";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Constants ──────────────────────────────────────────────────

const HANDLE = 32;
const MIN_DIM = 60;
const ARM = 18;
const THK = 3;
const OFF = 7;

// ── Corner bracket visual ──────────────────────────────────────

function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const isTop  = pos === "tl" || pos === "tr";
  const isLeft = pos === "tl" || pos === "bl";
  const vEdge = isTop  ? { top: OFF }    : { bottom: OFF };
  const hEdge = isLeft ? { left: OFF }   : { right: OFF };
  return (
    <>
      <View style={[styles.bracketArm, { width: ARM, height: THK }, vEdge, hEdge]} />
      <View style={[styles.bracketArm, { width: THK, height: ARM }, vEdge, hEdge]} />
    </>
  );
}

// ── Types ──────────────────────────────────────────────────────

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Props {
  uri: string;
  onCrop: (uri: string) => void;
  onCancel: () => void;
}

// ── CropEditor ─────────────────────────────────────────────────

export function CropEditor({ uri, onCrop, onCancel }: Props) {
  const [viewLayout, setViewLayout] = useState<{ w: number; h: number } | null>(null);
  // Set from expo-image's onLoad — gives visual dims after EXIF rotation, matching what's displayed
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewLayout((prev) =>
      prev?.w === width && prev?.h === height ? prev : { w: width, h: height }
    );
  }, []);

  const onImageLoad = useCallback((e: ImageLoadEventData) => {
    const { width, height } = e.source;
    setImageDims((prev) =>
      prev?.w === width && prev?.h === height ? prev : { w: width, h: height }
    );
  }, []);

  const SW = viewLayout?.w ?? 0;
  const SH = viewLayout?.h ?? 0;

  // Letterboxed image rect within the View — uses live dims from expo-image to stay consistent
  const disp = useMemo(() => {
    if (!SW || !SH || !imageDims) return { x: 0, y: 0, w: SW, h: SH };
    const ia = imageDims.w / imageDims.h;
    const sa = SW / SH;
    if (ia > sa) {
      const h = SW / ia;
      return { x: 0, y: (SH - h) / 2, w: SW, h };
    }
    const w = SH * ia;
    return { x: (SW - w) / 2, y: 0, w, h: SH };
  }, [imageDims, SW, SH]);

  // ── Phase state ───────────────────────────────────────────────
  // "draw"  — user is drawing the initial rectangle
  // "tune"  — rectangle is set; corner handles active
  const [phase, setPhase] = useState<"draw" | "tune">("draw");

  // rect is null until the user draws something
  const [rect, setRect] = useState<CropRect | null>(null);
  const rectRef  = useRef<CropRect | null>(rect);
  rectRef.current = rect;
  const startRef = useRef<CropRect>({ x: 0, y: 0, w: 0, h: 0 });

  const [processing, setProcessing] = useState(false);

  // ── Clamp (used in tune phase) ───────────────────────────────

  const clamp = useCallback(
    (r: CropRect): CropRect => {
      let { x, y, w, h } = r;
      const maxX = disp.x + disp.w;
      const maxY = disp.y + disp.h;
      w = Math.max(MIN_DIM, w);
      h = Math.max(MIN_DIM, h);
      x = Math.max(disp.x, Math.min(x, maxX - MIN_DIM));
      y = Math.max(disp.y, Math.min(y, maxY - MIN_DIM));
      if (x + w > maxX) w = maxX - x;
      if (y + h > maxY) h = maxY - y;
      return { x, y, w, h };
    },
    [disp]
  );

  const clampRef = useRef(clamp);
  clampRef.current = clamp;

  // ── Phase 1: draw pan ────────────────────────────────────────
  // Tracks a raw touch across the whole view to rubber-band the rect.

  const drawOriginRef = useRef({ x: 0, y: 0 });

  const drawPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        drawOriginRef.current = { x: locationX, y: locationY };
        setRect({ x: locationX, y: locationY, w: 0, h: 0 });
      },
      onPanResponderMove: (_, g) => {
        const ox = drawOriginRef.current.x;
        const oy = drawOriginRef.current.y;
        // Use cumulative g.dx/g.dy — reliable in all drag directions
        const currentX = ox + g.dx;
        const currentY = oy + g.dy;
        setRect({
          x: Math.min(ox, currentX),
          y: Math.min(oy, currentY),
          w: Math.abs(g.dx),
          h: Math.abs(g.dy),
        });
      },
      onPanResponderRelease: () => {
        const r = rectRef.current;
        if (r && r.w >= MIN_DIM && r.h >= MIN_DIM) {
          setRect(clampRef.current(r));
          setPhase("tune");
        } else {
          setRect(null);
        }
      },
    })
  ).current;

  // ── Phase 2: tune pans ───────────────────────────────────────

  type Mover = (start: CropRect, dx: number, dy: number) => CropRect;

  function makePan(mover: Mover) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startRef.current = rectRef.current ?? startRef.current; },
      onPanResponderMove: (_, g) =>
        setRect(clampRef.current(mover(startRef.current, g.dx, g.dy))),
    });
  }

  const centerPan = useRef(
    makePan((s, dx, dy) => ({ ...s, x: s.x + dx, y: s.y + dy }))
  ).current;
  const tlPan = useRef(
    makePan((s, dx, dy) => ({ x: s.x + dx, y: s.y + dy, w: s.w - dx, h: s.h - dy }))
  ).current;
  const trPan = useRef(
    makePan((s, dx, dy) => ({ ...s, y: s.y + dy, w: s.w + dx, h: s.h - dy }))
  ).current;
  const blPan = useRef(
    makePan((s, dx, dy) => ({ ...s, x: s.x + dx, w: s.w - dx, h: s.h + dy }))
  ).current;
  const brPan = useRef(
    makePan((s, dx, dy) => ({ ...s, w: s.w + dx, h: s.h + dy }))
  ).current;

  // ── Crop handler ─────────────────────────────────────────────

  const handleCrop = async () => {
    if (!rect || !imageDims) return;
    setProcessing(true);
    try {
      const r = rect;
      const scaleX = imageDims.w / disp.w;
      const scaleY = imageDims.h / disp.h;
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{
          crop: {
            originX: Math.max(0, Math.round((r.x - disp.x) * scaleX)),
            originY: Math.max(0, Math.round((r.y - disp.y) * scaleY)),
            width:   Math.min(imageDims.w, Math.round(r.w * scaleX)),
            height:  Math.min(imageDims.h, Math.round(r.h * scaleY)),
          },
        }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      );
      onCrop(result.uri);
    } catch (e) {
      console.error("[CropEditor]", e);
    } finally {
      setProcessing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Background image — always visible; onLoad gives us the real visual dims */}
      {/* @ts-ignore */}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        onLoad={onImageLoad}
      />

      {!viewLayout || !imageDims ? null : (
        <>
          {phase === "draw" ? (
            // ── Phase 1: full-view draw target ──────────────
            <View style={StyleSheet.absoluteFill} {...drawPan.panHandlers}>
              {/* Dark overlay covers everything while rect is being drawn */}
              {rect && rect.w > 0 && rect.h > 0 && (
                <>
                  <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: rect.y }]} />
                  <View style={[styles.overlay, { top: rect.y + rect.h, left: 0, right: 0, bottom: 0 }]} />
                  <View style={[styles.overlay, { top: rect.y, left: 0, width: rect.x, height: rect.h }]} />
                  <View style={[styles.overlay, { top: rect.y, left: rect.x + rect.w, right: 0, height: rect.h }]} />
                  {/* Live rect border */}
                  <View
                    style={[
                      styles.cropRect,
                      { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
                    ]}
                  />
                </>
              )}
            </View>
          ) : rect ? (
            // ── Phase 2: fine-tune handles ───────────────────
            <>
              {/* Dark overlay strips */}
              <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: rect.y }]} />
              <View style={[styles.overlay, { top: rect.y + rect.h, left: 0, right: 0, bottom: 0 }]} />
              <View style={[styles.overlay, { top: rect.y, left: 0, width: rect.x, height: rect.h }]} />
              <View style={[styles.overlay, { top: rect.y, left: rect.x + rect.w, right: 0, height: rect.h }]} />

              {/* Crop rectangle */}
              <View
                style={[
                  styles.cropRect,
                  { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
                ]}
              >
                {/* Center drag zone */}
                <View style={styles.centerZone} {...centerPan.panHandlers} />

                {/* Rule-of-thirds grid */}
                <View style={[styles.gridLine, styles.gridH, { top: rect.h / 3 }]} />
                <View style={[styles.gridLine, styles.gridH, { top: (rect.h * 2) / 3 }]} />
                <View style={[styles.gridLine, styles.gridV, { left: rect.w / 3 }]} />
                <View style={[styles.gridLine, styles.gridV, { left: (rect.w * 2) / 3 }]} />

                {/* Corner handles */}
                <View style={[styles.handle, styles.handleTL]} {...tlPan.panHandlers}>
                  <CornerBracket pos="tl" />
                </View>
                <View style={[styles.handle, styles.handleTR]} {...trPan.panHandlers}>
                  <CornerBracket pos="tr" />
                </View>
                <View style={[styles.handle, styles.handleBL]} {...blPan.panHandlers}>
                  <CornerBracket pos="bl" />
                </View>
                <View style={[styles.handle, styles.handleBR]} {...brPan.panHandlers}>
                  <CornerBracket pos="br" />
                </View>
              </View>

              {/* Redraw button */}
              <TouchableOpacity
                style={styles.redrawBtn}
                onPress={() => { setRect(null); setPhase("draw"); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="edit-2" size={14} color="#fff" />
                <Text style={styles.redrawText}>Redraw</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* Top bar — always visible */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.barBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.barBtnText}>Cancel</Text>
            </TouchableOpacity>

            <Text style={styles.barTitle}>
              {phase === "draw" ? "Draw crop area" : "Adjust crop"}
            </Text>

            <TouchableOpacity
              onPress={handleCrop}
              disabled={processing || phase === "draw" || !rect || !imageDims}
              style={styles.barBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {processing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.barBtnText,
                    { fontWeight: "700", opacity: phase === "draw" || !rect ? 0.4 : 1 },
                  ]}
                >
                  Done
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Phase hint */}
          {phase === "draw" && (
            <View style={styles.hintWrap}>
              <Text style={styles.hintText}>Drag to select an area</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  overlay: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  cropRect: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#fff",
  },

  centerZone: {
    position: "absolute",
    top: HANDLE / 2,
    left: HANDLE / 2,
    right: HANDLE / 2,
    bottom: HANDLE / 2,
  },

  gridLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.25)" },
  gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },

  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
  },
  handleTL: { top: -HANDLE / 2, left: -HANDLE / 2 },
  handleTR: { top: -HANDLE / 2, right: -HANDLE / 2 },
  handleBL: { bottom: -HANDLE / 2, left: -HANDLE / 2 },
  handleBR: { bottom: -HANDLE / 2, right: -HANDLE / 2 },

  bracketArm: {
    position: "absolute",
    backgroundColor: "#fff",
  },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  barTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  barBtn: { minWidth: 64, alignItems: "center" },
  barBtnText: { color: "#fff", fontSize: 16 },

  redrawBtn: {
    position: "absolute",
    bottom: 44,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  redrawText: { color: "#fff", fontSize: 13 },

  hintWrap: {
    position: "absolute",
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
  },
});
