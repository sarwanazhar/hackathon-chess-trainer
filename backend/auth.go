package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// RegisterUser creates a user via Supabase Admin API (no email verification).
func (s *SupabaseClient) RegisterUser(email, password, name string) (string, string, error) {
	body := map[string]interface{}{
		"email":         email,
		"password":      password,
		"email_confirm": true,
		"user_metadata": map[string]string{"name": name},
	}
	data, err := s.authAdminRequest("POST", "/auth/v1/admin/users", body)
	if err != nil {
		return "", "", err
	}
	var result struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", "", err
	}
	if result.ID == "" {
		return "", "", fmt.Errorf("registration failed: %s", result.Message)
	}

	token, err := s.SignIn(email, password)
	if err != nil {
		return "", "", err
	}
	return result.ID, token, nil
}

// SignIn exchanges email+password for a Supabase JWT.
func (s *SupabaseClient) SignIn(email, password string) (string, error) {
	body := map[string]string{"email": email, "password": password}
	data, err := s.authAdminRequest("POST", "/auth/v1/token?grant_type=password", body)
	if err != nil {
		return "", err
	}
	var result struct {
		AccessToken string `json:"access_token"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("sign in failed: %s", result.ErrorDesc)
	}
	return result.AccessToken, nil
}

// authAdminRequest hits Supabase auth endpoints with the service key.
func (s *SupabaseClient) authAdminRequest(method, path string, body interface{}) ([]byte, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(method, s.URL+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", s.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// HandleRegister — POST /auth/register
func HandleRegister(c *gin.Context) {
	var req struct {
		Name     string `json:"name" binding:"required"`
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, token, err := sb.RegisterUser(req.Email, req.Password, req.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create profile row.
	sb.dbRequest("POST", "profiles", map[string]interface{}{
		"user_id":     userID,
		"username":    req.Name,
		"personality": "mentor",
	}, "")

	c.JSON(http.StatusCreated, gin.H{"token": token, "user_id": userID})
}

// HandleLogin — POST /auth/login
func HandleLogin(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := sb.SignIn(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	userID, _ := sb.VerifyJWT(token)
	c.JSON(http.StatusOK, gin.H{"token": token, "user_id": userID})
}
