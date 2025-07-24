# Spotify Exporter

I am moving away from Spotify as a service for several reasons, including personal ethical ones. I don't want to just migrate my music to another equivalent platform. For now, I am downloading my playlists so that I can find the music elsewhere later.

## Why make a whole app about it?

It was much faster to create a script to download my own music via the command line, but I wanted to expand to a full app for a couple of reasons: 

* I see some Reddit comments that others are looking for the same thing. There are existing services that migrate music to another platform, but I don't really want to just swap Spotify for Apple or Youtube Music, and I think I am not alone in this.
* I'm a software developer and want to keep in practice/beef up my personal portfolio.

## Setup Instructions

This app runs in conjunction with an [Express backend](https://github.com/PersonofNote/spotify-exporter-backend). You will need both running locally.

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Required Environment Variables**
   - `VITE_API_BASE_URL`: Required in production only. Falls back to http://127.0.0.1:3001 for dev
 

3. **Development**
   ```bash
   npm start
   ```
