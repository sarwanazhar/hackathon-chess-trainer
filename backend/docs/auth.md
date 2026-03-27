# JWT Authentication with Clerk

This document explains how to implement and use JWT authentication between your Next.js frontend and Go backend using Clerk.

## Overview

The authentication system uses standard JWT verification with your Clerk secret key to verify JWT tokens sent from the frontend. The middleware extracts user information and makes it available to your handlers through the Gin context.

## How It Works

1. **Frontend**: Uses Clerk's `getToken()` hook to get a JWT token
2. **Request**: Token is sent in the `Authorization: Bearer <token>` header
3. **Backend**: Middleware verifies the token using JWT library with Clerk secret key
4. **Context**: User ID and session claims are injected into the request context
5. **Handlers**: Access user information using helper functions

## Using the Authentication Middleware

### Apply to Routes

```go
// In your routes file
protected := r.Group("/api")
protected.Use(middleware.AuthMiddleware())
{
    protected.GET("/user", getUserHandler)
    protected.POST("/messages", createMessageHandler)
}
```

### Access User Information in Handlers

```go
func getUserHandler(c *gin.Context) {
    // Get user ID
    userID, exists := middleware.GetUserIDFromContext(c)
    if !exists {
        c.JSON(http.StatusInternalServerError, gin.H{
            "error": "User ID not found in context",
        })
        return
    }

    // Get full session claims
    sessionClaims, exists := middleware.GetSessionClaimsFromContext(c)
    if !exists {
        c.JSON(http.StatusInternalServerError, gin.H{
            "error": "Session claims not found in context",
        })
        return
    }

    // Use the user information
    c.JSON(http.StatusOK, gin.H{
        "userID": userID,
        "email": sessionClaims["email"],
        "name": sessionClaims["name"],
        "claims": sessionClaims,
    })
}
```

## Available Context Functions

### `GetUserIDFromContext(c *gin.Context) (string, bool)`
- **Returns**: User ID (subject) from the JWT token
- **Usage**: Primary way to identify the authenticated user
- **Example**: `userID, exists := middleware.GetUserIDFromContext(c)`

### `GetSessionClaimsFromContext(c *gin.Context) (jwt.MapClaims, bool)`
- **Returns**: Full session claims object with all available user data
- **Usage**: When you need additional user information beyond just the ID
- **Example**: `claims, exists := middleware.GetSessionClaimsFromContext(c)`

## Session Claims Structure

The `jwt.MapClaims` object contains standard JWT claims:

```go
// Standard JWT claims available in MapClaims
{
    "sub": "user_123456789",     // User ID (subject)
    "email": "user@example.com", // User email
    "name": "John Doe",          // User full name
    "iat": 1234567890,           // Issued at
    "exp": 1234567890,           // Expires at
    // ... other claims
}
```

## Error Handling

The middleware automatically handles authentication errors:

- **401 Unauthorized**: Missing or invalid token
- **401 Unauthorized**: Expired token
- **500 Internal Server Error**: Server-side verification failure

## Frontend Integration

### Using the API Utility

```typescript
import { get, post, createAuthenticatedWebSocket } from '@/lib/api';

// REST API calls
const userData = await get('/api/user');
const newMessage = await post('/api/messages', { content: 'Hello' });

// WebSocket connections
const ws = await createAuthenticatedWebSocket(
  '/chat',
  (event) => console.log('Connected'),
  (event) => console.log('Message:', event.data)
);
```

### Token Management

The frontend utility automatically:
- Gets fresh tokens from Clerk
- Handles token refresh on 401 errors
- Attaches tokens to all requests
- Provides fallback mechanisms

## Testing Authentication

### Test Protected Route

```bash
# Without token (should return 401)
curl http://localhost:8080/api/protected

# With valid token (should return 200)
curl -H "Authorization: Bearer <your-jwt-token>" http://localhost:8080/api/protected
```

### Test WebSocket Authentication

The WebSocket connection includes the token as a query parameter:
```
ws://localhost:8080/chat?token=<your-jwt-token>
```

## Security Considerations

1. **Always use HTTPS** in production
2. **Store tokens securely** - Clerk handles this automatically
3. **Validate tokens on every request** - Middleware does this automatically
4. **Set appropriate CORS headers** - Already configured in routes
5. **Handle token expiration** - Frontend utility handles automatic refresh

## Troubleshooting

### Common Issues

1. **401 errors**: Check that `CLERK_SECRET_KEY` is set in `.env` and matches your Clerk dashboard
2. **CORS errors**: Ensure frontend domain is allowed in CORS configuration
3. **Token refresh failures**: Verify Clerk publishable key is correct and getToken() is working
4. **WebSocket connection failures**: Check that token is being passed correctly as query parameter
5. **Compilation errors**: Ensure `github.com/golang-jwt/jwt/v5` is installed: `go get github.com/golang-jwt/jwt/v5`

### Debug Logging

Enable debug logging to troubleshoot authentication issues:

```go
// In your middleware, add more detailed logging
log.Printf("Authenticating request for user: %s", userID)
log.Printf("Token claims: %+v", sessionClaims)
```

## Best Practices

1. **Always check if user exists** before processing sensitive operations
2. **Use user ID for database queries** rather than email or other identifiers
3. **Implement proper error handling** for authentication failures
4. **Log authentication events** for security monitoring
5. **Keep tokens short-lived** and rely on automatic refresh