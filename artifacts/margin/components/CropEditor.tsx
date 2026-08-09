import { Feather } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "expo-image";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

// ── Constants ──────────────────────────────────────────────────

const HANDLE = 32; // touch-target size (px) for each corner handle
const MIN_DIM = 60; // minimum crop dimension in display pixels
const ARM = 18; // L-bracket arm length
const THK = 3;  // L-bracket arm thickness
const OFF = 7;  // L-bracket offset from handle edge

// ── Corner bracket visual ──────────────────────────────────────

function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const isTop  = pos === "tl" || pos === "tr";
  const isLeft = pos === "tl" || pos === "bl";
  const vEdge = isTop  ? { top: OFF }    : { bottom: OFF };
  const hEdge = isLeft ? { left: OFF }   : { right: OFF };
  return (
    <>
      {/* Horizontal arm */}
      <View style={[styles.bracketArm, { width: ARM, height: THK }, vEdge, hEdge]} />
      {/* Vertical arm */}
      <View style={[styles.bracketArm, { width: THK, height: ARM }, vEdge, hEdge]} />
    </>
  );
}

// ── Types ──────────────────────────────────────────────────────

interface CropRect {
  x: number; // left edge in screen coords
  y: number; // top edge in screen coords
  w: number;
  h: number;
}

export interface Props {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  onCrop: (uri: string) => void;
  onCancel: () => void;
}

// ── CropEditor ─────────────────────────────────────────────────

export function CropEditor({ uri, imageWidth, imageHeight, onCrop, onCancel }: Props) {
  const { width: SW, height: SH } = useWindowDimensions();

  // Displayed image rect (letterboxed inside screen)
  const disp = useMemo(() => {
    const ia = imageWidth / imageHeight;
    const sa = SW / SH;
    if (ia > sa) {
      const h = SW / ia;
      return { x: 0, y: (SH - h) / 2, w: SW, h };
    }
    const w = SH * ia;
    return { x: (SW - w) / 2, y: 0, w, h: SH };
  }, [imageWidth, imageHeight, SW, SH]);

  const initRect: CropRect = { x: disp.x, y: disp.y, w: disp.w, h: disp.h };
  const [rect, setRect] = useState<CropRect>(initRect);
  const rectRef  = useRef(rect);
  rectRef.current = rect;
  const startRef = useRef<CropRect>(initRect);
  const [processing, setProcessing] = useState(false);

  // Clamp rect to displayed image bounds with a minimum size
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

  // Factory: creates a PanResponder that transforms the rect using `mover`
  type Mover = (start: CropRect, dx: number, dy: number) => CropRect;
  function makePan(mover: Mover) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startRef.current = rectRef.current; },
      onPanResponderMove: (_, g) => setRect(clamp(mover(startRef.current, g.dx, g.dy))),
    });
  }

  // Center: move the whole rect
  const centerPan = useRef(
    makePan((s, dx, dy) => ({ ...s, x: s.x + dx, y: s.y + dy }))
  ).current;
  // Corners: resize by dragging each corner
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

  const handleCrop = async () => {
    setProcessing(true);
    try {
      const r = rectRef.current;
      const scaleX = imageWidth  / disp.w;
      const scaleY = imageHeight / disp.h;
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{
          crop: {
            originX: Math.max(0, Math.round((r.x - disp.x) * scaleX)),
            originY: Math.max(0, Math.round((r.y - disp.y) * scaleY)),
            width:   Math.min(imageWidth,  Math.round(r.w * scaleX)),
            height:  Math.min(imageHeight, Math.round(r.h * scaleY)),
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

  return (
    <View style={styles.root}>
      {/* Background image */}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />

      {/* Dark overlay — 4 strips surrounding the crop rect */}
      <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: rect.y }]} />
      <View style={[styles.overlay, { top: rect.y + rect.h, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.overlay, { top: rect.y, left: 0, width: rect.x, height: rect.h }]} />
      <View style={[styles.overlay, { top: rect.y, left: rect.x + rect.w, right: 0, height: rect.h }]} />

      {/* Crop rectangle */}
      <View style={[styles.cropRect, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}>
        {/* Center drag zone (excludes handle areas) */}
        <View style={styles.centerZone} {...centerPan.panHandlers} />

        {/* Rule-of-thirds grid */}
        <View style={[styles.gridLine, styles.gridH, { top: rect.h / 3 }]} />
        <View style={[styles.gridLine, styles.gridH, { top: (rect.h * 2) / 3 }]} />
        <View style={[styles.gridLine, styles.gridV, { left: rect.w / 3 }]} />
        <View style={[styles.gridLine, styles.gridV, { left: (rect.w * 2) / 3 }]} />

        {/* Corner handles (touch targets) */}
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

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.barBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.barBtnText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.barTitle}>Crop</Text>

        <TouchableOpacity
          onPress={handleCrop}
          disabled={processing}
          style={styles.barBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.barBtnText, { fontWeight: "700" }]}>Done</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Reset to full image */}
      <TouchableOpacity
        style={styles.resetBtn}
        onPress={() => setRect(initRect)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="maximize-2" size={14} color="#fff" />
        <Text style={styles.resetText}>Reset</Text>
      </TouchableOpacity>
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

  resetBtn: {
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
  resetText: { color: "#fff", fontSize: 13 },
});
