# --- STAGE 1: Build the Go Backend ---
FROM golang:1.21-bullseye AS builder
WORKDIR /app

# Copy dependency files first to leverage Docker caching
COPY go.mod go.sum ./
RUN go mod download

# Copy your source code (main.go, stockfish.go, etc.)
COPY . .

# Build the binary
RUN go build -o backend-app .

# --- STAGE 2: Runtime Stage (The actual server) ---
FROM debian:bullseye-slim

# Install wget and xz-utils to download/extract Stockfish
RUN apt-get update && apt-get install -y wget xz-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Download and install Stockfish 18 (Linux POPCNT version)
RUN wget https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    tar -xf stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    mv stockfish/stockfish-ubuntu-x86-64-sse41-popcnt /usr/bin/stockfish && \
    chmod +x /usr/bin/stockfish && \
    rm -rf stockfish*

# Copy the compiled Go binary from the builder stage
COPY --from=builder /app/backend-app .

# Render's default port
EXPOSE 10000

# Start the application
CMD ["./backend-app"]