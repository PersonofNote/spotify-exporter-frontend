import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

// Use relative paths for Vite proxy
const BACKEND_URL = '';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState({});
  const [tracks, setTracks] = useState({}); // { playlistId: [tracks] }
  const [selectedTracks, setSelectedTracks] = useState({}); // { playlistId: { trackId: true } }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsedPlaylists, setCollapsedPlaylists] = useState({}); // { playlistId: true/false }

  // Check if authenticated (look for ?auth=success in URL)
  useEffect(() => {
    if (window.location.search.includes('auth=success')) {
      setAuthenticated(true);
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  // Fetch playlists after auth
  useEffect(() => {
    if (authenticated) {
      setLoading(true);
      axios.get(`/api/playlists`, { withCredentials: true })
        .then(res => {
          setPlaylists(res.data.playlists);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to fetch playlists');
          setLoading(false);
        });
    }
  }, [authenticated]);

  // Fetch tracks for a playlist
  const fetchTracks = (playlistId) => {
    if (tracks[playlistId]) return; // already fetched
    setLoading(true);
    axios.get(`/api/playlists/${playlistId}/tracks`, { withCredentials: true })
      .then(res => {
        setTracks(t => ({ ...t, [playlistId]: res.data.tracks }));
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch tracks');
        setLoading(false);
      });
  };

  // Select all playlists and all songs in each playlist
  const handleSelectAllPlaylists = (checked) => {
    const newSelectedPlaylists = {};
    const newSelectedTracks = {};
    playlists.forEach(pl => {
      newSelectedPlaylists[pl.id] = checked;
      if (checked) {
        // If tracks are loaded, select all songs
        if (tracks[pl.id]) {
          newSelectedTracks[pl.id] = Object.fromEntries(tracks[pl.id].map(track => [track.id, true]));
        } else {
          // If not loaded, fetch and select all when loaded
          fetchTracks(pl.id);
        }
      } else {
        newSelectedTracks[pl.id] = {};
      }
    });
    setSelectedPlaylists(newSelectedPlaylists);
    setSelectedTracks(newSelectedTracks);
  };

  // Select all songs in a playlist
  const handleSelectAllTracksInPlaylist = (playlistId, checked) => {
    if (!tracks[playlistId]) return;
    setSelectedTracks(st => ({
      ...st,
      [playlistId]: checked
        ? Object.fromEntries(tracks[playlistId].map(track => [track.id, true]))
        : {}
    }));
  };

  // Checkbox logic for playlists: select/deselect all tracks in the playlist
  const handlePlaylistSelect = (playlistId, checked) => {
    setSelectedPlaylists(p => ({ ...p, [playlistId]: checked }));
    if (checked) {
      if (tracks[playlistId]) {
        setSelectedTracks(st => ({
          ...st,
          [playlistId]: Object.fromEntries(tracks[playlistId].map(track => [track.id, true]))
        }));
      } else {
        fetchTracks(playlistId);
      }
    } else {
      setSelectedTracks(st => ({ ...st, [playlistId]: {} }));
    }
  };

  // Checkbox logic for tracks
  const handleTrackSelect = (playlistId, trackId, checked) => {
    setSelectedTracks(st => ({
      ...st,
      [playlistId]: {
        ...st[playlistId],
        [trackId]: checked
      }
    }));
  };

  // Helper: is all playlists selected?
  const allPlaylistsSelected = playlists.length > 0 && playlists.every(pl => selectedPlaylists[pl.id]);
  // Helper: is all tracks in a playlist selected?
  const allTracksSelected = (playlistId) =>
    tracks[playlistId] && tracks[playlistId].length > 0 &&
    tracks[playlistId].every(track => selectedTracks[playlistId]?.[track.id]);

  // Helper: is any track in a playlist selected?
  const anyTrackSelected = (playlistId) =>
    tracks[playlistId] && tracks[playlistId].some(track => selectedTracks[playlistId]?.[track.id]);

  // When tracks are loaded for a playlist, if its checkbox is checked, select all tracks in that playlist
  useEffect(() => {
    playlists.forEach(pl => {
      if (selectedPlaylists[pl.id] && tracks[pl.id] && Object.keys(selectedTracks[pl.id] || {}).length === 0) {
        setSelectedTracks(st => ({
          ...st,
          [pl.id]: Object.fromEntries(tracks[pl.id].map(track => [track.id, true]))
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // Toggle collapse/expand for a playlist
  const toggleCollapse = (playlistId) => {
    if (!tracks[playlistId]) fetchTracks(playlistId);
    setCollapsedPlaylists(cp => ({ ...cp, [playlistId]: !cp[playlistId] }));
  };

  // UI rendering
  if (!authenticated) {
    return (
      <div className="container">
        <h1>Spotify Playlist Collector</h1>
        <a className="login-btn" href={`/auth/login`}>Login with Spotify</a>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Spotify Playlist Collector</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <h2>Your Playlists</h2>
      <label>
        <input
          type="checkbox"
          checked={allPlaylistsSelected}
          onChange={e => handleSelectAllPlaylists(e.target.checked)}
        />
        Select All Playlists
      </label>
      <ul>
        {playlists.map(pl => (
          <li key={pl.id}>
            <label>
              <input
                type="checkbox"
                checked={!!selectedPlaylists[pl.id]}
                onChange={e => handlePlaylistSelect(pl.id, e.target.checked)}
              />
            </label>
              <span
                style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: 8 }}
                onClick={() => toggleCollapse(pl.id)}
              >
                {collapsedPlaylists[pl.id] ? '▶' : '▼'} {pl.name}
              </span>

            {tracks[pl.id] && !collapsedPlaylists[pl.id] && (
              <div style={{ marginLeft: 20 }}>
                <ul>
                  {tracks[pl.id].map(track => (
                    <li key={track.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!(selectedTracks[pl.id]?.[track.id])}
                          onChange={e => handleTrackSelect(pl.id, track.id, e.target.checked)}
                        />
                        {track.title} – {track.artists.join(', ')}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      {/* File format and download UI will go here */}
    </div>
  );
}

export default App;
