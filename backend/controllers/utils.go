package controllers

import (
	"net/http"

	"github.com/gorilla/websocket"
)

// WebSocket upgrader for handling WebSocket connections
var Upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}
