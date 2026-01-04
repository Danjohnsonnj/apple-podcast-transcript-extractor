Here is a comprehensive project summary and status report designed for an agentic coding assistant hand-off.

# Project Hand-off: Podcast Transcript Extractor
1.  Project Goals
To create a lightweight, client-side Web App (HTML/CSS/JS) that allows users to extract and view transcripts from Apple Podcast cache files (.ttml) stored locally on their Mac. The app should parse the raw XML transcript and enrich it with metadata (Show Title, Episode Title, Artwork) fetched from the iTunes API.

1.  Requirements
Input: Drag-and-drop interface for .ttml files (e.g., transcript_1000672687584.ttml).
Parsing: Extract text content and timestamps from the TTML XML structure.
Metadata: Extract the ID from the filename (e.g., 1000672687584) and query the iTunes API to get the show/episode details.
Search: Allow users to search for a string across multiple loaded transcripts and highlight matches.
Tech Stack: Pure HTML, CSS, Vanilla JavaScript. No build steps or backend servers preferred.
1.  Implementation Strategy
File Ingestion: Use the HTML5 File API (FileReader) to read text content from dropped files.
XML Parsing: Use the browser's DOMParser to traverse the TTML structure (<p> and <span> tags with begin attributes).
Metadata Fetching:
Extract the numeric ID from the filename regex: transcript_(\d+).
Call https://itunes.apple.com/lookup?id={ID}.
CORS Handling: Since this is a client-side app, use a public CORS proxy (e.g., corsproxy.io or codetabs.com) to bypass browser restrictions.
UI/UX: Display a card for each episode containing the metadata header and the scrollable transcript.
1.  Issues & Troubleshooting History
Issue: Unable to retrieve metadata from the iTunes API.
Attempt 1 (Direct Fetch): Failed due to CORS (Cross-Origin Resource Sharing) restrictions in the browser.
Attempt 2 (Proxy - AllOrigins): Failed with Status 500 errors.
Attempt 3 (Proxy - CorsProxy.io): Failed with Status 403 Forbidden errors.
Attempt 4 (Proxy - CodeTabs):
Result: Request succeeds (Status 200), but returns resultCount: 0.
Diagnosis: The API is reachable, but the ID extracted from the filename (1000672687584) is not returning data from the standard iTunes lookup endpoint.
Attempt 5 (Fallback Strategy): Tried querying with &entity=podcast in case the ID referred to a Show rather than an Episode.
Result: Still returned resultCount: 0.
Hypothesis: The ID found in the cached filename (1000672687584) might be an internal Apple "Asset ID" or "Store ID" that is not publicly queryable via the standard iTunes Search API, or it requires a specific country code (e.g., &country=us).
1.   Current Status
File Parsing: ✅ Working. Text and timestamps are correctly extracted.
Search: ✅ Working. Users can search and highlight text across files.
Metadata: ❌ Blocked. The app currently displays "Unknown Show" / "Unknown Episode" because the API lookup returns no results for the IDs found in the cache files.
1.   Next Steps / Recommendations for the Agent
- Verify ID Type: We need to determine what 1000672687584 actually represents. Is it an adamId?
- Try Country Parameter: The iTunes API is geo-specific. Add &country=us (or the user's region) to the API call.
- Manual Metadata Entry: If the API continues to fail, implement a UI feature allowing the user to manually type the Show Name once, and apply it to the current batch.
- Alternative API Endpoint: Investigate if there is a different Apple endpoint for podcast assets, or if we can scrape the podcast page if we can construct a URL.

---

# Update: January 4, 2026

## 7. Major Pivot: Local SQLite Database Approach

After exhausting iTunes API options, we discovered that the numeric IDs in TTML filenames are **internal Apple asset IDs** that are not publicly queryable. 

### New Strategy
Instead of relying on external APIs, we now use Apple Podcasts' **local SQLite database** which contains all episode and podcast metadata:

**Database Location:**
```
~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents/MTLibrary.sqlite
```

**TTML Cache Location:**
```
~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML
```

### Implementation Changes

1. **Two-Step Flow:** User now loads the SQLite database first, then adds TTML files
2. **sql.js Integration:** Added browser-based SQLite parsing via CDN (`sql.js 1.10.3`)
3. **Schema Discovery:** Identified key tables and columns:
   - `ZMTEPISODE` (111 columns) - Episode data
   - `ZMTPODCAST` (95 columns) - Show data
   - Key columns: `ZSTORETRACKID`, `ZENTITLEDTRANSCRIPTIDENTIFIER`, `ZFREETRANSCRIPTIDENTIFIER`

### Database Query
```sql
SELECT 
    e.ZSTORETRACKID, e.ZTITLE, e.ZCLEANEDTITLE,
    e.ZENTITLEDTRANSCRIPTIDENTIFIER, e.ZFREETRANSCRIPTIDENTIFIER,
    p.ZTITLE as podcast_title, p.ZAUTHOR, p.ZIMAGEURL
FROM ZMTEPISODE e
LEFT JOIN ZMTPODCAST p ON e.ZPODCAST = p.Z_PK
```

### Bug Fixes Applied
- **Column Name Fix:** Changed `p.ZARTWORKURL` → `p.ZIMAGEURL` (column didn't exist, causing silent query failure)
- **Added Diagnostics:** Test queries, row counts, and fallback logic for debugging
- **Multiple ID Mapping:** Episodes are indexed by `ZSTORETRACKID`, `ZENTITLEDTRANSCRIPTIDENTIFIER`, and `ZFREETRANSCRIPTIDENTIFIER` to maximize lookup matches

## 8. Updated Status

| Feature | Status |
|---------|--------|
| TTML File Parsing | ✅ Working |
| Search & Highlight | ✅ Working |
| Database Loading | ✅ Working |
| Episode Map Population | ✅ Fixed (was returning 0 rows due to invalid column name) |
| Metadata Display | 🔄 Testing |

## 9. Current App Architecture

```
┌─────────────────────────────────────────────────────┐
│                    index.html                        │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ Step 1: SQLite  │ →  │ Step 2: TTML Files      │ │
│  │ Drop Zone       │    │ Drop Zone               │ │
│  └─────────────────┘    └─────────────────────────┘ │
│                    ↓                                 │
│  ┌─────────────────────────────────────────────────┐│
│  │ Search Bar + Results Container                  ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                     app.js                           │
│  • loadDatabase() → sql.js parses SQLite            │
│  • buildEpisodeMap() → Creates ID→metadata lookup   │
│  • processFile() → Extracts ID, parses TTML         │
│  • lookupMetadata() → Finds show/episode info       │
│  • performSearch() → Filters & highlights matches   │
└─────────────────────────────────────────────────────┘
```

## 10. Files in Project

| File | Purpose |
|------|---------|
| `index.html` | UI structure, step-by-step instructions, drop zones |
| `style.css` | Styling for cards, drop zones, search, highlights |
| `app.js` | Core logic: SQLite parsing, TTML parsing, search |
| `project-summary.md.md` | This documentation file |

## 11. Next Steps

1. **Verify Metadata Matching:** Confirm that TTML filename IDs match database entries
2. **Display Artwork:** Use `ZIMAGEURL` from database to show podcast artwork
3. **Clean Up Debug Logging:** Remove verbose console output once stable
4. **Error Handling:** Improve user feedback for edge cases
5. **Export Feature:** Consider adding ability to export transcripts as text/markdown

---

## 12. Metadata Lookup Results (January 4, 2026)

### Finding: Partial Match Success

Testing confirmed that metadata lookup is **working correctly** for episodes present in the database. However, some TTML cache files reference episodes that are no longer in the user's library.

**Root Cause:**
- The TTML cache persists transcript files even after episodes are removed from the library
- The SQLite database only contains metadata for episodes currently in the library
- This creates a mismatch where orphaned TTML files have no corresponding database entry

**Behavior:**
- ✅ Episodes in library: Full metadata displayed (show name, episode title, artwork)
- ⚠️ Orphaned episodes: Shows warning "Episode ID not found in database (may have been removed from library)"

**Diagnostic Improvements Added:**
- Console logs similar IDs with same prefix when lookup fails
- Visual warning banner in UI for unmatched episodes
- Episode cards remain editable so users can manually enter metadata if desired

### Status Update

| Feature | Status |
|---------|--------|
| TTML File Parsing | ✅ Working |
| Search & Highlight | ✅ Working |
| Database Loading | ✅ Working |
| Metadata Lookup | ✅ Working (for episodes in library) |
| Orphaned Episode Handling | ✅ Working (shows warning) |