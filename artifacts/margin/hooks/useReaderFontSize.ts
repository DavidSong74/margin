import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const SIZES = {
  small: { fontSize: 15, lineHeight: 26 },
  normal: { fontSize: 18, lineHeight: 32 },
  large: { fontSize: 22, lineHeight: 38 },
} as const;

export function useReaderFontSize() {
  const [key, setKey] = useState<keyof typeof SIZES>("normal");

  useEffect(() => {
    AsyncStorage.getItem("margin:settings").then((raw) => {
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (stored.readerFontSize && stored.readerFontSize in SIZES) {
        setKey(stored.readerFontSize as keyof typeof SIZES);
      }
    });
  }, []);

  return SIZES[key];
}
