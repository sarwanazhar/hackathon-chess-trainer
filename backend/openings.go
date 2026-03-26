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
	Topic    string         `json:"topic"`
	Summary  string         `json:"summary"`
	KeyIdeas []string       `json:"key_ideas"`
	YouTube  *YouTubeResult `json:"youtube,omitempty"`
}

type YouTubeResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Channel string `json:"channel"`
}

// HandleLearn returns AI-generated learning content and a YouTube video for a chess topic.
func HandleLearn(c *gin.Context) {
	topic := c.Query("topic")
	topicType := c.DefaultQuery("type", "opening")

	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic is required"})
		return
	}

	// Normalize: "sicilian-defense" → "Sicilian Defense"
	topicDisplay := strings.Title(strings.ReplaceAll(topic, "-", " "))

	summary, keyIdeas := generateTopicContent(topicDisplay, topicType)
	ytResult := searchYouTube(topic + " chess tutorial")

	c.JSON(http.StatusOK, LearnResponse{
		Topic:    topicDisplay,
		Summary:  summary,
		KeyIdeas: keyIdeas,
		YouTube:  ytResult,
	})
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

	// Strip any markdown fences Gemini might still add.
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var result struct {
		Summary  string   `json:"summary"`
		KeyIdeas []string `json:"key_ideas"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return raw, nil // return raw text as summary if JSON parsing fails
	}
	return result.Summary, result.KeyIdeas
}

func searchYouTube(query string) *YouTubeResult {
	apiKey := os.Getenv("YOUTUBE_API_KEY")
	if apiKey == "" {
		return nil
	}

	ytURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video&maxResults=1&key=%s",
		url.QueryEscape(query), apiKey,
	)

	client := &http.Client{Timeout: 5 * time.Second}
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
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Items) == 0 {
		return nil
	}

	item := result.Items[0]
	return &YouTubeResult{
		Title:   item.Snippet.Title,
		URL:     "https://www.youtube.com/watch?v=" + item.ID.VideoID,
		Channel: item.Snippet.ChannelTitle,
	}
}
