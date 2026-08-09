// Offline capture queue — photos taken when connectivity was lost are stored
// here and replayed when the app comes back online (AppState "active").

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";

import { supabase } from "@/lib/supabase";

const QUEUE_KEY = "margin:captureQueue";

export interface CaptureQueueItem {
  uri: string;        // persistent local file URI (copied from camera temp)
  journalId: string;
  pageNumber: number;
  enqueuedAt: string;
}

export async function enqueueCapture(
  item: Omit<CaptureQueueItem, "enqueuedAt">,
): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: CaptureQueueItem[] = raw ? JSON.parse(raw) : [];
  queue.push({ ...item, enqueuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getCaptureQueue(): Promise<CaptureQueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function removeFromQueue(uri: string): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: CaptureQueueItem[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(
    QUEUE_KEY,
    JSON.stringify(queue.filter((item) => item.uri !== uri)),
  );
}

// Upload one queued item to Supabase and fire transcription.
// Throws on failure so the caller can stop processing and leave item in queue.
async function uploadQueuedItem(
  item: CaptureQueueItem,
  userId: string,
): Promise<void> {
  const pageId = Crypto.randomUUID();
  const imagePath = `${userId}/${item.journalId}/${pageId}.jpg`;
  const thumbPath = `${userId}/${item.journalId}/${pageId}_thumb.jpg`;

  const thumbnail = await ImageManipulator.manipulateAsync(
    item.uri,
    [{ resize: { width: 800 } }],
    { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG },
  );

  const imageBase64 = await FileSystem.readAsStringAsync(item.uri, {
    encoding: "base64",
  });
  const { error: imageErr } = await supabase.storage
    .from("journal_pages")
    .upload(imagePath, decode(imageBase64), { contentType: "image/jpeg" });
  if (imageErr) throw imageErr;

  const thumbBase64 = await FileSystem.readAsStringAsync(thumbnail.uri, {
    encoding: "base64",
  });
  await supabase.storage
    .from("journal_pages")
    .upload(thumbPath, decode(thumbBase64), { contentType: "image/jpeg" });

  const { error: insertErr } = await supabase.from("pages").insert({
    id: pageId,
    journal_id: item.journalId,
    page_number: item.pageNumber,
    image_path: imagePath,
    thumbnail_path: thumbPath,
    transcription_status: "pending",
  });
  if (insertErr) throw insertErr;

  // Fire transcription using saved quality preference
  const settingsRaw = await AsyncStorage.getItem("margin:settings");
  const quality = settingsRaw
    ? (JSON.parse(settingsRaw).transcriptionQuality ?? "balanced")
    : "balanced";
  supabase.functions
    .invoke("transcribe", { body: { page_id: pageId, quality } })
    .catch(() => {});
}

// Process all queued captures. Called from _layout.tsx on AppState "active".
// Stops on first failure and leaves remaining items in queue for next attempt.
export async function processCaptureQueue(): Promise<void> {
  const queue = await getCaptureQueue();
  if (queue.length === 0) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  for (const item of queue) {
    try {
      await uploadQueuedItem(item, session.user.id);
      await removeFromQueue(item.uri);
      await FileSystem.deleteAsync(item.uri, { idempotent: true });
    } catch {
      // Network or server error — leave in queue, try again next time
      break;
    }
  }
}
