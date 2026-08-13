# Margin

**Turn handwritten journals into a searchable digital archive.**

I built Margin to solve a problem I personally had: years of handwritten
journals that I couldn't search, carry, or easily revisit.
> **Capture → Transcribe → Review → Search**

[Demo] · [Screenshots] 

![Margin demo](...)

![Screenshots](...)

---

## Why Margin

I wanted to carry years of handwritten journals without carrying the physical notebooks. Margin keeps the original pages intact while adding a searchable digital layer on top.

Paper journals are:
- hard to search
- inconvenient to carry
- easy to forget in storage

Margin treats the physical journal as the source of truth and builds a searchable digital layer on top of it. The original page is never replaced by the transcription.

---
# What I Built
## A Transcription System That Learns

Handwriting recognition is imperfect — especially when the same person has idiosyncratic spelling, abbreviations, names, or handwriting patterns.

Margin turns those mistakes into feedback.

When Gemini is uncertain about a word, Margin flags it for the user rather than silently guessing. Once the user confirms or corrects the word, that feedback is added to a **personal handwriting glossary**. The glossary is then incorporated into subsequent transcription requests, allowing Margin to recognize the user's recurring patterns over time.

```text
New page
   ↓
Gemini transcription
   ↓
Low-confidence word detected
   ↓
User confirms / corrects it
   ↓
Correction saved to personal glossary
   ↓
Glossary included in future transcription
   ↓
More individual context for the AI vision in future transcriptions
```

This creates a human-in-the-loop feedback cycle: the model handles the initial recognition, the user resolves uncertainty, and the system carries that knowledge forward.

## Handwriting → Searchable Text

Users can capture pages individually or in bulk. Each page is sent to a vision model for transcription, with the original image preserved alongside the result.


## Search Across Years of Writing

Once processed, journals become fully searchable. Users can surface memories, ideas, or names across years of writing without remembering which notebook they came from.

## Original Pages Always Preserved

Transcriptions are derived data. The original images remain unchanged and accessible at all times.

Pages can also be cropped and reprocessed without modifying the source image.

## Data Portability

Journals can be exported as plain text or image sets, so users aren't locked into the application.

## Engineering Highlights

- **Adaptive AI feedback loop:** low-confidence outputs trigger human review; confirmed corrections are stored in a personal glossary and reused in future transcription requests.
- **Per-user specialization:** each user's glossary accumulates recurring names, spellings, abbreviations, and handwriting-specific patterns.
- **Server-side AI pipeline:** Gemini runs through a Supabase Edge Function, keeping the API key off the client.
- **Privacy:** private storage, signed URLs, and PostgreSQL RLS enforce per-user data isolation.
- **Secure mobile auth:** credentials/session data use the platform Keychain/Keystore through expo-secure-store.
- **Non-destructive processing:** cropping and reprocessing never mutate the original images.

## Architecture
```
┌──────────────────────────────┐
│      Expo / React Native     │
│                              │
│  Camera · Library · Reader   │
│  Search · Review · Export    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│           Supabase           │
│                              │
│  Auth · PostgreSQL · Storage │
│          + RLS               │
└──────────────┬───────────────┘
               │
       transcription request
               │
               ▼
┌──────────────────────────────┐
│    Edge Function (Deno)      │
│                              │
│  fetch image → Gemini Vision │
│  → process → store result    │
└──────────────────────────────┘
```
The mobile client never directly accesses the Gemini API. Transcription requests are handled server-side by the Edge Function, which retrieves the page from private storage, calls Gemini, and writes the result back to the database.

## AI Transcription Pipeline

Margin uses Gemini 2.5 Flash for handwriting recognition.

Instead of treating the model's output as final, Margin is built around a feedback loop:

```
Page image
    ↓
Edge Function
    ↓
Gemini Vision
    ↓
Transcription + confidence
    ↓
┌───────────────┬────────────────┐
│ High          │ Low            │
│ confidence    │ confidence     │
↓               ↓
Store           User review
text                ↓
              Confirm / correct
                    ↓
             Personal glossary
                    ↓
             Future requests
```

The important design choice is that model uncertainty is surfaced rather than hidden. User corrections become persistent, user-specific context instead of disappearing after a single transcription.

---

## Run Locally

### Requirements

* Node.js 22+
* pnpm
* Supabase project
* Gemini API key

```bash
pnpm install
cd artifacts/margin
pnpm exec expo start
```

Create `artifacts/margin/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

For full database + Edge Function setup, see `/docs`.

---

## Status

Margin is an actively developed personal project.

**Built and functional:** capture, transcription, confidence review,
personal glossary, search, storage, authentication, and export.

**Next:** improve transcription accuracy and processing speed, and make
large-scale journal imports faster.

---

## Built By

**Sunyoung (David) Song** | 
Minerva University (2029)

I build software around problems I actually have. 
Margin started with a simple frustration: wanting access to years of my journals without carrying the notebooks around.

[GitHub](https://github.com/DavidSong74) · [LinkedIn](https://www.linkedin.com/in/davidsong74/)
