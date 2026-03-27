package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/joho/godotenv"
)

func setupTestClient(t *testing.T) *SupabaseClient {
	t.Helper()
	godotenv.Load(".env")
	sb := NewSupabaseClient()
	if sb.URL == "" {
		t.Fatal("SUPABASE_URL not set in .env")
	}
	if sb.ServiceKey == "" {
		t.Fatal("SUPABASE_SERVICE_KEY not set in .env")
	}
	return sb
}

// TestSupabaseReachable checks that the Supabase project URL responds.
func TestSupabaseReachable(t *testing.T) {
	setupTestClient(t)
	url := os.Getenv("SUPABASE_URL") + "/rest/v1/"
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("apikey", os.Getenv("SUPABASE_SERVICE_KEY"))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("FAIL - cannot reach Supabase: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	t.Logf("REST API status: %d", resp.StatusCode)
	t.Logf("Body: %s", string(body))
	if resp.StatusCode >= 500 {
		t.Fatalf("FAIL - server error %d", resp.StatusCode)
	}
	t.Log("PASS - Supabase REST API reachable")
}

// TestAuthServiceReachable checks the Supabase auth service health endpoint.
func TestAuthServiceReachable(t *testing.T) {
	godotenv.Load(".env")
	url := os.Getenv("SUPABASE_URL") + "/auth/v1/health"
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("apikey", os.Getenv("SUPABASE_SERVICE_KEY"))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("FAIL - cannot reach auth service: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	t.Logf("Auth health status: %d", resp.StatusCode)
	t.Logf("Body: %s", string(body))
	if resp.StatusCode != 200 {
		t.Fatalf("FAIL - auth service returned %d", resp.StatusCode)
	}
	t.Log("PASS - Auth service healthy")
}

// TestTablesExist checks whether the required tables are present.
func TestTablesExist(t *testing.T) {
	sb := setupTestClient(t)
	tables := []string{"profiles", "games", "missed_moves", "puzzles"}
	allOK := true
	for _, table := range tables {
		data, err := sb.dbRequest("GET", table, nil, "limit=1")
		if err != nil {
			t.Errorf("FAIL - error querying %s: %v", table, err)
			allOK = false
			continue
		}
		// PostgREST returns a 404-style JSON error if the table doesn't exist
		if strings.Contains(string(data), "PGRST205") {
			t.Errorf("FAIL - table '%s' does not exist (run supabase_schema.sql)", table)
			allOK = false
		} else {
			t.Logf("PASS - table '%s' exists", table)
		}
	}
	if !allOK {
		t.Fatal("Some tables are missing. Run the SQL in supabase_schema.sql via the Supabase SQL editor.")
	}
}

// TestCRUDPuzzles inserts a test puzzle and deletes it to verify full CRUD.
func TestCRUDPuzzles(t *testing.T) {
	sb := setupTestClient(t)

	// Insert a test puzzle
	puzzle := map[string]interface{}{
		"fen":        "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
		"solution":   []string{"Ng5"},
		"theme":      "test",
		"difficulty": 1,
		"source":     "connectivity_test",
	}
	data, err := sb.dbRequest("POST", "puzzles", puzzle, "")
	if err != nil {
		t.Fatalf("FAIL - insert puzzle: %v", err)
	}
	if strings.Contains(string(data), "error") {
		t.Fatalf("FAIL - insert returned error: %s", string(data))
	}

	// Parse returned id
	var rows []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		t.Fatalf("FAIL - could not parse inserted puzzle: %s", string(data))
	}
	id := rows[0].ID
	t.Logf("PASS - inserted puzzle id=%s", id)

	// Read it back
	data, err = sb.dbRequest("GET", "puzzles", nil, fmt.Sprintf("id=eq.%s", id))
	if err != nil || strings.Contains(string(data), "error") {
		t.Fatalf("FAIL - read puzzle: %v / %s", err, string(data))
	}
	t.Log("PASS - read puzzle back OK")

	// Delete it
	_, err = sb.dbRequest("DELETE", "puzzles", nil, fmt.Sprintf("id=eq.%s", id))
	if err != nil {
		t.Fatalf("FAIL - delete puzzle: %v", err)
	}
	t.Log("PASS - deleted test puzzle OK")
	t.Log("PASS - full CRUD cycle complete")
}
