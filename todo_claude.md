# Margin — Claude TODO

---

## 1. Merge FlatList branch + apply three fixes

**Branch:** `origin/bolt/replace-scrollview-with-flatlist-16574269409775915332`

### Step 1 — Merge the branch
```bash
git merge origin/bolt/replace-scrollview-with-flatlist-16574269409775915332
```

### Step 2 — Fix initialNumToRender (file: artifacts/margin/app/journal/[id].tsx)

After merging, find the FlatList props block. Change:
```tsx
initialNumToRender={1}
```
to:
```tsx
initialNumToRender={3}
```
Reason: `initial_page` param can land on any page. With `1`, pages 2+ are blank on arrival.
`3` pre-renders the target page plus one neighbor in each direction.

### Step 3 — Fix removeClippedSubviews flicker (file: artifacts/margin/app/journal/[id].tsx)

Find:
```tsx
removeClippedSubviews={Platform.OS !== "web"}
```
Change to:
```tsx
removeClippedSubviews={false}
```
Reason: On Android, unmounting off-screen pages causes a white flash when swiping back.
The memory savings from clipping are not worth the visual glitch at this page count.
Re-enable only after profiling confirms memory pressure on 100+ page journals.

### Step 4 — Fix scrollToOffset drift (file: artifacts/margin/app/journal/[id].tsx)

Find the `goToPage` useCallback (currently calls `scrollRef.current?.scrollTo`).
After the merge it calls `scrollRef.current?.scrollToOffset(...)`.
Wrap the call in `requestAnimationFrame` so it fires after any in-flight state update settles:

Current (post-merge):
```tsx
scrollRef.current?.scrollToOffset({ offset: clamped * effectiveW, animated: true });
```
Change to:
```tsx
requestAnimationFrame(() => {
  scrollRef.current?.scrollToOffset({ offset: clamped * effectiveW, animated: true });
});
```

Do the same for the initial scroll in `fetchPages` — find:
```tsx
requestAnimationFrame(() => {
  scrollRef.current?.scrollToOffset({ offset: initialPage * effectiveW, animated: false });
});
```
This one already has requestAnimationFrame, so no change needed there.

### Step 5 — Remove ScrollView from imports (file: artifacts/margin/app/journal/[id].tsx)

After the merge the outer horizontal ScrollView is gone but the import line still includes it
(it's still used for the inner vertical scrolls inside each page). Leave `ScrollView` in the
import — do NOT remove it.

---

## 2. Feature: Upload multiple photos from camera roll

**What it does:** User taps a "Choose photos" button on the capture screen, picks multiple
images from their library, and each one is uploaded + transcribed sequentially.

**File to modify:** `artifacts/margin/app/capture.tsx`

### Step 1 — Add import
At the top of capture.tsx, add:
```tsx
import * as ImagePicker from "expo-image-picker";
```

### Step 2 — Add new ScreenState value
Find:
```tsx
type ScreenState = "permission" | "viewfinder" | "preview" | "uploading";
```
Change to:
```tsx
type ScreenState = "permission" | "viewfinder" | "preview" | "uploading" | "batch_uploading";
```

### Step 3 — Add state for batch progress
Inside `CaptureScreen`, after the existing `useState` declarations, add:
```tsx
const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
```

### Step 4 — Add uploadSinglePhoto helper
Extract the upload logic from `usePhoto` into a standalone async function (inside the
component, below `usePhoto`):
```tsx
const uploadSinglePhoto = useCallback(async (
  uri: string,
  pageNumber: number,
  user: { id: string },
): Promise<void> => {
  const pageId = Crypto.randomUUID();
  const imagePath = `${user.id}/${journal_id}/${pageId}.jpg`;
  const thumbPath = `${user.id}/${journal_id}/${pageId}_thumb.jpg`;

  const thumbnail = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG },
  );

  const imageBase64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const { error: imageErr } = await supabase.storage
    .from("journal_pages")
    .upload(imagePath, decode(imageBase64), { contentType: "image/jpeg" });
  if (imageErr) throw imageErr;

  const thumbBase64 = await FileSystem.readAsStringAsync(thumbnail.uri, { encoding: "base64" });
  await supabase.storage
    .from("journal_pages")
    .upload(thumbPath, decode(thumbBase64), { contentType: "image/jpeg" });

  const { error: insertErr } = await supabase.from("pages").insert({
    id: pageId,
    journal_id,
    page_number: pageNumber,
    image_path: imagePath,
    thumbnail_path: thumbPath,
    transcription_status: "pending",
  });
  if (insertErr) throw insertErr;

  supabase.functions
    .invoke("transcribe", { body: { page_id: pageId, image_path: imagePath } })
    .catch((err) => console.warn("[transcribe] invoke failed:", err));
}, [journal_id]);
```

### Step 5 — Add pickAndUploadPhotos handler
Below `uploadSinglePhoto`, add:
```tsx
const pickAndUploadPhotos = useCallback(async () => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.9,
    orderedSelection: true,
  });
  if (result.canceled || result.assets.length === 0) return;

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;

  // Get current page count once before the loop so numbering is sequential
  const { count } = await supabase
    .from("pages")
    .select("*", { count: "exact", head: true })
    .eq("journal_id", journal_id);
  const startPageNumber = (count ?? 0) + 1;

  setScreen("batch_uploading");
  setBatchProgress({ current: 0, total: result.assets.length });

  for (let i = 0; i < result.assets.length; i++) {
    setBatchProgress({ current: i + 1, total: result.assets.length });
    await uploadSinglePhoto(result.assets[i].uri, startPageNumber + i, user);
  }

  router.replace({ pathname: "/journal/[id]", params: { id: journal_id } });
}, [journal_id, uploadSinglePhoto]);
```

### Step 6 — Add "Choose photos" button to the viewfinder UI
In the viewfinder JSX, find the shutter button row (the row containing the capture button).
Below the shutter button `TouchableOpacity`, add a second button:
```tsx
<TouchableOpacity onPress={pickAndUploadPhotos} style={styles.libraryBtn}>
  <Feather name="image" size={22} color="#fff" />
</TouchableOpacity>
```
Add to StyleSheet:
```tsx
libraryBtn: {
  position: "absolute",
  right: 40,
  bottom: 0,
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: "rgba(255,255,255,0.2)",
  alignItems: "center",
  justifyContent: "center",
},
```

### Step 7 — Add batch_uploading screen state UI
In the render block, find the `screen === "uploading"` JSX block.
Copy its structure and add a sibling block immediately after it:
```tsx
{screen === "batch_uploading" && (
  <View style={styles.uploadingOverlay}>
    <ActivityIndicator size="large" color="#fff" />
    <Text style={styles.uploadingText}>
      Uploading {batchProgress.current} of {batchProgress.total}...
    </Text>
  </View>
)}
```
`uploadingOverlay` and `uploadingText` styles already exist — reuse them.

---

## 3. Feature: Batch camera capture (shoot multiple pages in one session)

**What it does:** After tapping "Use this photo", instead of navigating to the journal reader,
the app uploads the photo in the background and returns to the viewfinder. A badge shows
how many pages have been shot. A "Done" button navigates to the reader.

**File to modify:** `artifacts/margin/app/capture.tsx`

### Step 1 — Add state for batch count
Inside `CaptureScreen`, add:
```tsx
const [batchCount, setBatchCount] = useState(0);
const [startPageNumber, setStartPageNumber] = useState<number | null>(null);
```

### Step 2 — Modify usePhoto to return to viewfinder instead of navigating
Find the `usePhoto` useCallback.

Replace:
```tsx
// 6. Navigate to reader, then kick off transcription in background
router.replace({ pathname: "/journal/[id]", params: { id: journal_id } });

// Fire-and-forget transcription call — errors are logged server-side
supabase.functions
  .invoke("transcribe", { body: { page_id: pageId, image_path: imagePath } })
  .catch((err) => console.warn("[transcribe] invoke failed:", err));
```
With:
```tsx
// 6. Fire transcription in background
supabase.functions
  .invoke("transcribe", { body: { page_id: pageId, image_path: imagePath } })
  .catch((err) => console.warn("[transcribe] invoke failed:", err));

// 7. Return to viewfinder for next shot
setBatchCount((n) => n + 1);
setCapturedUri(null);
setQualityIssue(null);
setUploadError(null);
setUploadProgress(0);
setScreen("viewfinder");
```

Also, in step 4 of the existing upload flow (the page count query):
```tsx
const { count } = await supabase
  .from("pages")
  .select("*", { count: "exact", head: true })
  .eq("journal_id", journal_id);

const pageNumber = (count ?? 0) + 1;
```
Change to:
```tsx
let pageNumber: number;
if (startPageNumber === null) {
  const { count } = await supabase
    .from("pages")
    .select("*", { count: "exact", head: true })
    .eq("journal_id", journal_id);
  const base = (count ?? 0) + 1;
  setStartPageNumber(base);
  pageNumber = base + batchCount;
} else {
  pageNumber = startPageNumber + batchCount;
}
```
This queries the DB only once (on first photo) and increments locally for subsequent shots,
avoiding race conditions when uploads are still in flight.

### Step 3 — Add Done button to viewfinder when batchCount > 0
In the viewfinder JSX, at the top of the viewfinder overlay (above the shutter row), add:
```tsx
{batchCount > 0 && (
  <TouchableOpacity
    style={styles.doneBtn}
    onPress={() => router.replace({ pathname: "/journal/[id]", params: { id: journal_id } })}
  >
    <Text style={styles.doneBtnText}>Done ({batchCount})</Text>
  </TouchableOpacity>
)}
```
Add to StyleSheet:
```tsx
doneBtn: {
  position: "absolute",
  top: 16,
  right: 16,
  backgroundColor: "rgba(255,255,255,0.9)",
  borderRadius: 20,
  paddingHorizontal: 16,
  paddingVertical: 8,
},
doneBtnText: {
  fontSize: 15,
  fontFamily: "Inter_600SemiBold",
  color: "#1a1a1a",
},
```

### Step 4 — Add page count badge to shutter area
Below the shutter button, show a small count when batchCount > 0:
```tsx
{batchCount > 0 && (
  <Text style={styles.batchBadge}>{batchCount} page{batchCount !== 1 ? "s" : ""} added</Text>
)}
```
Add to StyleSheet:
```tsx
batchBadge: {
  color: "rgba(255,255,255,0.8)",
  fontSize: 13,
  fontFamily: "Inter_400Regular",
  marginTop: 8,
  textAlign: "center",
},
```

### Step 5 — Reset batch state on unmount
Add a cleanup effect inside `CaptureScreen`:
```tsx
useEffect(() => {
  return () => {
    setBatchCount(0);
    setStartPageNumber(null);
  };
}, []);
```
Import `useEffect` from React if not already imported.
