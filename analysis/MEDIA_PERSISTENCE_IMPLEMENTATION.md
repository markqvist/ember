# Media File Persistence Implementation

## Summary

This implementation solves the critical issue where media files (TTS audio, generated images/videos) were only stored in the browser's IndexedDB, making classrooms non-portable between devices.

## Architecture

### Before (Broken)
```
Client Generation → IndexedDB only
                    ↓
           POST /api/classroom (JSON only)
                    ↓
           Server disk (data/classrooms/{id}.json)
                    ↓
           Different Computer: Media Missing!
```

### After (Fixed)
```
Client Generation → IndexedDB (local cache)
                    ↓
           Collect media from IndexedDB
                    ↓
           POST /api/classroom (JSON + base64 media)
                    ↓
           Server disk (data/classrooms/{id}/)
           ├── {id}.json (scenes with audioUrl/src)
           ├── audio/tts_*.mp3
           └── media/gen_*.png/mp4
                    ↓
           Different Computer: Load + Restore to IndexedDB
```

## Files Changed

### New Files
1. **`lib/utils/base64.ts`** - Base64 encoding/decoding utilities
2. **`lib/utils/media-extractor.ts`** - Media extraction from IndexedDB and restoration

### Modified Files
1. **`lib/server/classroom-storage.ts`**
   - Added `AudioFileData` and `MediaFileData` interfaces
   - Added `saveClassroomAudioFiles()` - saves base64 audio to disk
   - Added `saveClassroomMediaFiles()` - saves base64 images/videos to disk
   - Added `readClassroomAudioFiles()` - reads audio from disk as base64
   - Added `readClassroomMediaFiles()` - reads media from disk as base64
   - Added `updateScenesWithAudioUrls()` - adds audioUrl to speech actions
   - Added `updateScenesWithMediaUrls()` - replaces placeholders with URLs
   - Updated `persistClassroom()` to accept and process media files

2. **`app/api/classroom/route.ts`**
   - POST: Accepts `audioFiles` and `mediaFiles` arrays in request body
   - GET: Added `includeMedia` query parameter to return media as base64

3. **`lib/hooks/use-scene-generator.ts`**
   - Updated persistence logic to collect media from IndexedDB before saving
   - Sends media files alongside classroom data

4. **`app/classroom/[id]/page.tsx`**
   - Updated loading logic to request media with `includeMedia=true`
   - Restores media files to IndexedDB after loading from server

5. **`lib/store/media-generation.ts`**
   - Added `addRestoredTasks()` method to register restored media in the store

6. **`app/page.tsx`** (CRITICAL FIX)
   - Updated `handlePersist()` to collect and send media files from IndexedDB
   - Manual Save button now fully persists media alongside classroom data

## Data Flow

### Saving a Classroom (with Media)

1. **Client** collects all `audioId`s from speech actions in scenes
2. **Client** collects all media placeholder IDs (`gen_img_*`, `gen_vid_*`) from slide elements
3. **Client** fetches corresponding blobs from IndexedDB (`audioFiles`, `mediaFiles` tables)
4. **Client** converts blobs to base64
5. **Client** POSTs to `/api/classroom` with `{stage, scenes, audioFiles, mediaFiles}`
6. **Server** saves audio files to `data/classrooms/{id}/audio/{audioId}.{format}`
7. **Server** saves media files to `data/classrooms/{id}/media/{elementId}.{ext}`
8. **Server** updates scenes to add `audioUrl` and update `src` attributes
9. **Server** saves JSON to `data/classrooms/{id}.json`

### Loading a Classroom (with Media Restoration)

1. **Client** GETs `/api/classroom?id={id}&includeMedia=true`
2. **Server** returns `{classroom, audioFiles, mediaFiles}`
3. **Client** loads stage and scenes into store
4. **Client** converts base64 audio back to blobs and stores in IndexedDB
5. **Client** converts base64 media back to blobs and stores in IndexedDB
6. **Client** registers restored media in `MediaGenerationStore` for immediate UI use
7. **Playback** works immediately - AudioPlayer finds audio in IndexedDB or uses audioUrl

## API Changes

### POST /api/classroom

**Request Body (extended):**
```typescript
{
  stage: Stage;
  scenes: Scene[];
  audioFiles?: AudioFileData[];  // NEW
  mediaFiles?: MediaFileData[];  // NEW
}

interface AudioFileData {
  id: string;        // e.g., "tts_action_abc123"
  base64: string;    // Base64-encoded audio
  format: string;    // e.g., "mp3", "wav"
  mimeType: string;  // e.g., "audio/mpeg"
}

interface MediaFileData {
  id: string;           // e.g., "gen_img_1"
  type: 'image' | 'video';
  base64: string;       // Base64-encoded media
  mimeType: string;     // e.g., "image/png", "video/mp4"
  posterBase64?: string; // For videos
  prompt: string;       // Generation prompt
  params: string;       // JSON-serialized params
}
```

### GET /api/classroom?id={id}&includeMedia=true

**Response (when includeMedia=true):**
```typescript
{
  success: true;
  classroom: PersistedClassroomData;
  audioFiles?: AudioFileData[];  // Included when includeMedia=true
  mediaFiles?: MediaFileData[];  // Included when includeMedia=true
}
```

## File Storage Layout

```
data/classrooms/
├── {classroomId}.json              # Stage + scenes metadata
└── {classroomId}/
    ├── audio/
    │   ├── tts_action_001.mp3
    │   ├── tts_action_002.mp3
    │   └── ...
    └── media/
        ├── gen_img_1.png
        ├── gen_img_2.png
        ├── gen_vid_1.mp4
        ├── gen_vid_1.poster.jpg
        └── ...
```

## Backward Compatibility

- **Old classrooms without media**: Continue to work normally. Media simply won't be available on other computers (same as before).
- **New classrooms with media**: Work seamlessly across devices.
- **Mixed environments**: Client gracefully handles missing media by falling back to existing behavior (TTS disabled, missing images show placeholders).

## Performance Considerations

1. **Base64 overhead**: ~33% size increase for binary data in JSON payload
2. **Lazy loading**: Media is only transferred when `includeMedia=true`
3. **IndexedDB caching**: Once restored, media is available locally (no repeated downloads)
4. **Streaming**: The `/api/classroom-media/*` endpoint supports streaming for large files

## Security Considerations

1. **Path traversal**: All file paths are validated to stay within `data/classrooms/{id}/`
2. **File type restrictions**: Only allowed extensions are served (png, jpg, mp4, mp3, etc.)
3. **Classroom ID validation**: IDs must match `/^[a-zA-Z0-9_-]+$/`
4. **No SSRF**: Media serving endpoint doesn't fetch external URLs

## Future Enhancements

Potential improvements for future iterations:

1. **Incremental sync**: Only transfer missing media files (compare timestamps/IDs)
2. **Compression**: Use gzip/brotli for base64 payloads
3. **Direct upload**: Use multipart/form-data for large files instead of base64 JSON
4. **CDN integration**: Populate `ossKey` fields for external CDN storage
5. **Background sync**: Restore media in a service worker for offline availability

## Testing Checklist

- [ ] Generate classroom with TTS → Verify audio files saved to disk
- [ ] Generate classroom with images → Verify images saved to disk
- [ ] Open classroom on different computer → Verify media loads and plays
- [ ] Check offline playback after initial load → Should work from IndexedDB
- [ ] Verify existing classrooms still load correctly
- [ ] Test with large media files (10+ MB videos)
- [ ] Test concurrent saves (race condition safety)
- [ ] **Manual Save button** → Verify media is included in save
