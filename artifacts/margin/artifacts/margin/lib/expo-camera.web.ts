// Web stub — expo-camera is native-only. Metro resolves this file
// instead of the real package when building for web.
export const CameraView: null = null;
export const useCameraPermissions = () =>
  [null, async () => ({ granted: false })] as const;
export type CameraType = "back" | "front";
export type FlashMode = "off" | "on" | "auto" | "torch";
