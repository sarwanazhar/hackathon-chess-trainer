package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/gin-gonic/gin"
)

// Simplified keys
const (
	UserIDKey        = "userID"
	SessionClaimsKey = "sessionClaims"
)

// ClerkAuthMiddleware is the only function you actually need for your routes
func ClerkAuthMiddleware() gin.HandlerFunc {
	clerkSecretKey := os.Getenv("CLERK_SECRET_KEY")
	if clerkSecretKey == "" {
		panic("CLERK_SECRET_KEY is required in .env")
	}
	clerk.SetKey(clerkSecretKey)

	return func(c *gin.Context) {
		var tokenString string

		// 1. Get token from Header or Query
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No token provided"})
			return
		}

		// 2. Verify with SDK (This handles expiration and RS256 automatically)
		claims, err := jwt.Verify(c.Request.Context(), &jwt.VerifyParams{
			Token: tokenString,
		})

		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error":   "Unauthorized",
				"details": err.Error(),
			})
			return
		}

		// 3. Set standard Gin context values
		c.Set(UserIDKey, claims.Subject)
		c.Set(SessionClaimsKey, claims)

		c.Next()
	}
}

// GetUserIDFromContext helper for your controllers
func GetUserIDFromContext(c *gin.Context) (string, bool) {
	userID, exists := c.Get(UserIDKey)
	if !exists {
		return "", false
	}
	userIDStr, ok := userID.(string)
	return userIDStr, ok
}
