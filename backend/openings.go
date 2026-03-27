package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

type LearnResponse struct {
	Topic    string          `json:"topic"`
	Summary  string          `json:"summary"`
	KeyIdeas []string        `json:"key_ideas"`
	Videos   []YouTubeResult `json:"videos"`
	Source   string          `json:"source"` // "cache" or "live"
}

type YouTubeResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Channel string `json:"channel"`
}

// HandleLearn returns AI-generated learning content plus YouTube videos for a chess topic.
// Videos are served from the DB cache; on cache miss they are fetched live and stored.
func HandleLearn(c *gin.Context) {
	topic := c.Query("topic")
	topicType := c.DefaultQuery("type", "opening")

	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic is required"})
		return
	}

	// Normalize for both display and DB lookup.
	topicDisplay := strings.Title(strings.ReplaceAll(topic, "-", " "))
	topicKey := strings.ToLower(strings.ReplaceAll(topic, "-", " "))

	// 1. Try DB cache first.
	videos, source := getVideosForTopic(topicKey)
	if len(videos) == 0 {
		// 2. Cache miss — fetch from YouTube, store for next time.
		videos = searchYouTubeMultiple(topicKey+" chess tutorial", 3)
		if len(videos) > 0 {
			saveVideosToDB(topicKey, videos)
		}
		source = "live"
	}

	summary, keyIdeas := generateTopicContent(topicDisplay, topicType)

	c.JSON(http.StatusOK, LearnResponse{
		Topic:    topicDisplay,
		Summary:  summary,
		KeyIdeas: keyIdeas,
		Videos:   videos,
		Source:   source,
	})
}

// getVideosForTopic looks up cached videos in Supabase for the given normalized topic key.
// Returns ("cache", videos) on hit, ("", nil) on miss.
func getVideosForTopic(topicKey string) ([]YouTubeResult, string) {
	data, err := sb.dbRequest("GET", "videos", nil,
		"topic=eq."+url.QueryEscape(topicKey)+"&select=title,video_url,channel&limit=3")
	if err != nil {
		return nil, ""
	}

	var rows []struct {
		Title    string `json:"title"`
		VideoURL string `json:"video_url"`
		Channel  string `json:"channel"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, ""
	}

	results := make([]YouTubeResult, 0, len(rows))
	for _, r := range rows {
		results = append(results, YouTubeResult{
			Title:   r.Title,
			URL:     r.VideoURL,
			Channel: r.Channel,
		})
	}
	return results, "cache"
}

// saveVideosToDB inserts fetched YouTube results into the videos table for future cache hits.
// Duplicate video_url values are silently ignored (ON CONFLICT DO NOTHING via Prefer header).
func saveVideosToDB(topicKey string, videos []YouTubeResult) {
	for _, v := range videos {
		body := map[string]interface{}{
			"topic":     topicKey,
			"title":     v.Title,
			"video_url": v.URL,
			"channel":   v.Channel,
		}
		// Use resolution=ignore-duplicates so re-runs don't error on the UNIQUE(video_url) constraint.
		sb.dbRequestWithPrefer("POST", "videos", body, "", "resolution=ignore-duplicates")
	}
}

// searchYouTubeMultiple calls YouTube Data API v3 and returns up to maxResults videos.
func searchYouTubeMultiple(query string, maxResults int) []YouTubeResult {
	apiKey := os.Getenv("YOUTUBE_API_KEY")
	if apiKey == "" {
		return nil
	}

	ytURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video&maxResults=%d&key=%s",
		url.QueryEscape(query), maxResults, apiKey,
	)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(ytURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}

	videos := make([]YouTubeResult, 0, len(result.Items))
	for _, item := range result.Items {
		videos = append(videos, YouTubeResult{
			Title:   item.Snippet.Title,
			URL:     "https://www.youtube.com/watch?v=" + item.ID.VideoID,
			Channel: item.Snippet.ChannelTitle,
		})
	}
	return videos
}

func generateTopicContent(topic, topicType string) (summary string, keyIdeas []string) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return "Content unavailable.", nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	aiClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "Content unavailable.", nil
	}
	defer aiClient.Close()

	model := aiClient.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.2)

	prompt := fmt.Sprintf(
		`You are a chess expert. Write about the %s "%s" for a chess student.
Respond with valid JSON only, no markdown fences:
{"summary": "2-3 sentence overview", "key_ideas": ["idea 1", "idea 2", "idea 3"]}`,
		topicType, topic,
	)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil || len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return "Content unavailable.", nil
	}

	raw := ""
	for _, part := range resp.Candidates[0].Content.Parts {
		raw += fmt.Sprintf("%v", part)
	}

	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var out struct {
		Summary  string   `json:"summary"`
		KeyIdeas []string `json:"key_ideas"`
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return raw, nil
	}
	return out.Summary, out.KeyIdeas
}
