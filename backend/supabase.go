package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type SupabaseClient struct {
	URL        string
	JWTSecret  string
	ServiceKey string
	HTTPClient *http.Client
}

func NewSupabaseClient() *SupabaseClient {
	return &SupabaseClient{
		URL:        os.Getenv("SUPABASE_URL"),
		JWTSecret:  os.Getenv("SUPABASE_JWT_SECRET"),
		ServiceKey: os.Getenv("SUPABASE_SERVICE_KEY"),
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// dbRequest makes an authenticated request to the Supabase PostgREST API.
func (s *SupabaseClient) dbRequest(method, table string, body interface{}, query string) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(b)
	}

	url := fmt.Sprintf("%s/rest/v1/%s", s.URL, table)
	if query != "" {
		url += "?" + query
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", s.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")

	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// dbRequestWithPrefer is like dbRequest but lets the caller override the Prefer header.
func (s *SupabaseClient) dbRequestWithPrefer(method, table string, body interface{}, query, prefer string) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(b)
	}

	u := fmt.Sprintf("%s/rest/v1/%s", s.URL, table)
	if query != "" {
		u += "?" + query
	}

	req, err := http.NewRequest(method, u, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", s.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", prefer)

	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// --- Shared DB types ---

type GameRecord struct {
	UserID string   `json:"user_id"`
	Moves  []string `json:"moves,omitempty"`
	Color  string   `json:"color"`
	Result string   `json:"result,omitempty"`
	PGN    string   `json:"pgn,omitempty"`
}

type MissedMove struct {
	UserID   string  `json:"user_id"`
	GameID   string  `json:"game_id"`
	FEN      string  `json:"fen"`
	UserMove string  `json:"user_move"`
	BestMove string  `json:"best_move"`
	EvalDrop float64 `json:"eval_drop"`
	Theme    string  `json:"theme"`
}

type Puzzle struct {
	ID         string   `json:"id"`
	FEN        string   `json:"fen"`
	Solution   []string `json:"solution"`
	Theme      string   `json:"theme"`
	Difficulty int      `json:"difficulty"`
}

// --- DB helpers ---

func (s *SupabaseClient) SaveGame(g GameRecord) (string, error) {
	data, err := s.dbRequest("POST", "games", g, "")
	if err != nil {
		return "", err
	}
	var result []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &result); err != nil || len(result) == 0 {
		return "", fmt.Errorf("save game failed: %s", string(data))
	}
	return result[0].ID, nil
}

func (s *SupabaseClient) UpdateGame(gameID string, updates map[string]interface{}) error {
	_, err := s.dbRequest("PATCH", "games", updates, "id=eq."+gameID)
	return err
}

func (s *SupabaseClient) SaveMissedMove(m MissedMove) error {
	_, err := s.dbRequest("POST", "missed_moves", m, "")
	return err
}

func (s *SupabaseClient) GetUserPersonality(userID string) (string, error) {
	data, err := s.dbRequest("GET", "profiles", nil, "user_id=eq."+userID+"&select=personality")
	if err != nil {
		return "mentor", err
	}
	var result []struct {
		Personality string `json:"personality"`
	}
	if err := json.Unmarshal(data, &result); err != nil || len(result) == 0 {
		return "mentor", nil
	}
	return result[0].Personality, nil
}
