package main

import (
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"
)

// chessTopics is the canonical list of topics pre-seeded into the videos table.
// Each entry is the normalized lowercase key used for DB lookups.
var chessTopics = []string{
	"sicilian defense",
	"kings gambit",
	"queens gambit",
	"ruy lopez",
	"french defense",
	"caro-kann defense",
	"italian game",
	"english opening",
	"kings indian defense",
	"nimzo-indian defense",
	"london system",
	"dutch defense",
	"pirc defense",
	"endgame basics",
	"rook endgame",
	"pawn structure",
	"chess forks tactics",
	"chess pins tactics",
	"chess skewers tactics",
	"checkmate patterns",
}

// TestSeedVideos bulk-fetches YouTube videos for common chess topics and caches them
// in the videos table. Subsequent /api/learn requests are served from DB — no live
// YouTube API quota used per request.
//
// Run once:
//
//	go test -v -run TestSeedVideos -timeout 300s
//
// Safe to re-run — skips topics that already have 3+ cached videos.
func TestSeedVideos(t *testing.T) {
	// Load .env only if running locally (PORT not set)
	loadEnvIfLocal()

	sbClient := NewSupabaseClient()
	inserted := 0
	skipped := 0
	failed := 0

	for _, topic := range chessTopics {
		// Check how many videos are already cached for this topic.
		existing, err := sbClient.dbRequest("GET", "videos", nil,
			"topic=eq."+url.QueryEscape(topic)+"&select=id")
		if err != nil {
			t.Logf("[WARN] DB check failed for %q: %v", topic, err)
		} else if strings.Count(string(existing), `"id"`) >= 3 {
			t.Logf("[SKIP] %q — already has 3+ videos", topic)
			skipped++
			continue
		}

		// Fetch up to 3 videos from YouTube.
		videos := searchYouTubeMultiple(topic+" chess tutorial", 3)
		if len(videos) == 0 {
			t.Logf("[FAIL] No YouTube results for %q", topic)
			failed++
			continue
		}

		for _, v := range videos {
			body := map[string]interface{}{
				"topic":     topic,
				"title":     v.Title,
				"video_url": v.URL,
				"channel":   v.Channel,
			}
			data, err := sbClient.dbRequestWithPrefer("POST", "videos", body, "",
				"resolution=ignore-duplicates,return=representation")
			if err != nil {
				t.Logf("  [FAIL] insert for %q (%s): %v", topic, v.URL, err)
				failed++
				continue
			}
			if strings.Contains(string(data), `"code"`) {
				t.Logf("  [FAIL] DB error for %q: %s", topic, string(data))
				failed++
				continue
			}
			inserted++
			t.Logf("  [OK] %q → %s (%s)", topic, v.Title, v.Channel)
		}

		time.Sleep(250 * time.Millisecond) // stay within YouTube quota
	}

	t.Logf("\n══════════════════════════════════════════")
	t.Logf("Video seed complete: %d inserted | %d topics skipped | %d failed", inserted, skipped, failed)
	fmt.Printf("\nVideo seed: %d videos cached across %d topics.\n", inserted, len(chessTopics)-skipped)
}
