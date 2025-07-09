import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

// Use environment variable for API URL, fallback to 127.0.0.1 for development
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? '' // Use relative URLs for local development (Vite proxy)
    : window.location.origin); // Use same origin in production

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState({});
  const [tracks, setTracks] = useState({}); // { playlistId: [tracks] }
  const [selectedTracks, setSelectedTracks] = useState({}); // { playlistId: { trackId: true } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsedPlaylists, setCollapsedPlaylists] = useState({}); // { playlistId: true/false }
  const [loadingTracks, setLoadingTracks] = useState({}); // { playlistId: true/false }
  const [fileFormat, setFileFormat] = useState('csv');
  const [downloading, setDownloading] = useState(false);
  const [skippedTracks, setSkippedTracks] = useState([]);
  const [showSkippedTracks, setShowSkippedTracks] = useState(false);
  const [userQuota, setUserQuota] = useState(null);

  // Handle auth callback and check authentication status
  useEffect(() => {
    const handleAuthFlow = async () => {
      // Check if we're on the auth callback route
      if (window.location.pathname === '/auth/callback') {
        console.log('🔄 Handling auth callback...');
        
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        
        if (error) {
          console.error('❌ OAuth error:', error);
          setError(`Authentication failed: ${error}`);
          setLoading(false);
          window.history.replaceState({}, document.title, '/');
          return;
        }
        
        if (!code) {
          console.error('❌ No authorization code received');
          setError('No authorization code received');
          setLoading(false);
          window.history.replaceState({}, document.title, '/');
          return;
        }
        
        try {
          console.log('🔐 Exchanging authorization code for tokens...');
          const response = await axios.post(
            `${API_BASE_URL}/auth/exchange`, 
            { code }, 
            { withCredentials: true }
          );
          
          console.log('✅ Token exchange successful:', response.data);
          setAuthenticated(true);
          setLoading(false);
          
          // Clean up URL and go to main app
          window.history.replaceState({}, document.title, '/');
          
        } catch (error) {
          console.error('❌ Token exchange failed:', error);
          setError('Authentication failed. Please try again.');
          setAuthenticated(false);
          setLoading(false);
          window.history.replaceState({}, document.title, '/');
        }
        
        return; // Don't run normal auth check if we're handling callback
      }
      
      // Normal auth status check
      try {
        console.log('🔍 Checking auth status...');
        console.log('Document cookies:', document.cookie);
        
        const response = await axios.get(`${API_BASE_URL}/api/status`, { withCredentials: true });
        console.log('✅ Auth status response:', response.data);
        
        setAuthenticated(response.data.authenticated);
        setUserQuota(response.data.quota);
        setLoading(false);
        
        // If we came from old auth callback format, clean up the URL
        if (window.location.search.includes('auth=success')) {
          console.log('🔄 Came from legacy auth callback, cleaning up URL');
          window.history.replaceState({}, document.title, '/');
        }
      } catch (error) {
        console.error('❌ Auth check failed:', error);
        console.log('Document cookies:', document.cookie);
        
        setAuthenticated(false);
        setLoading(false);
        
        // If we came from legacy auth callback but session check failed, show error
        if (window.location.search.includes('auth=success')) {
          setError('Authentication failed. Please try logging in again.');
          window.history.replaceState({}, document.title, '/');
        }
      }
    };

    handleAuthFlow();
  }, []);

  // Fetch playlists when authenticated
  useEffect(() => {
    if (authenticated) {
      axios.get(`${API_BASE_URL}/api/playlists`, { withCredentials: true })
        .then(res => {
          setPlaylists(res.data.playlists);
          setUserQuota(res.data.quota); // Update quota after API call
          setError(''); // Clear any previous errors
        })
        .catch((err) => {
          console.error('Failed to fetch playlists:', err);
          if (err.response?.status === 401) {
            setAuthenticated(false);
            setError('Session expired. Please log in again.');
          } else if (err.response?.status === 429) {
            setError(`Rate limit exceeded: ${err.response.data.error}. ${err.response.data.resetTime || 'Try again later.'}`);
          } else {
            setError('Failed to fetch playlists');
          }
        });
    }
  }, [authenticated]);

  useEffect(() => {
    if (playlists.length > 0) {
      playlists.forEach(pl => {
        if (!tracks[pl.id] && !loadingTracks[pl.id]) {
          setLoadingTracks(lt => ({ ...lt, [pl.id]: true }));
          axios.get(`${API_BASE_URL}/api/playlists/${pl.id}/tracks`, { withCredentials: true })
            .then(res => {
              setTracks(t => ({ ...t, [pl.id]: res.data.tracks }));
              setUserQuota(res.data.quota); // Update quota after API call
            })
            .catch((err) => {
              console.error('Failed to fetch tracks for playlist:', pl.id, err);
              if (err.response?.status === 401) {
                setAuthenticated(false);
                setError('Session expired. Please log in again.');
              } else if (err.response?.status === 429) {
                setError(`Rate limit exceeded: ${err.response.data.error}. ${err.response.data.resetTime || 'Try again later.'}`);
              } else {
                setError('Failed to fetch tracks');
              }
            })
            .finally(() => {
              setLoadingTracks(lt => ({ ...lt, [pl.id]: false }));
            });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists]);

  const anyTracksLoading = Object.values(loadingTracks).some(Boolean);

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

  const handleTrackSelect = (playlistId, trackId, checked) => {
    setSelectedTracks(st => ({
      ...st,
      [playlistId]: {
        ...st[playlistId],
        [trackId]: checked
      }
    }));
  };

  const allPlaylistsSelected = playlists.length > 0 && playlists.every(pl => selectedPlaylists[pl.id]);
  const allTracksSelected = (playlistId) =>
    tracks[playlistId] && tracks[playlistId].length > 0 &&
    tracks[playlistId].every(track => selectedTracks[playlistId]?.[track.id]);

  const anyTrackSelected = (playlistId) =>
    tracks[playlistId] && tracks[playlistId].some(track => selectedTracks[playlistId]?.[track.id]);

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

  const toggleCollapse = (playlistId) => {
    if (!tracks[playlistId]) fetchTracks(playlistId);
    setCollapsedPlaylists(cp => ({ ...cp, [playlistId]: !cp[playlistId] }));
  };

  const numPlaylists = playlists.length;
  const numSelectedPlaylists = playlists.filter(pl => selectedPlaylists[pl.id]).length;
  const numSelectedSongs = Object.values(selectedTracks).reduce((acc, tracksObj) => acc + Object.values(tracksObj).filter(Boolean).length, 0);

  // Collapse all playlists by default  when playlists are loaded
  useEffect(() => {
    if (playlists.length > 0) {
      setCollapsedPlaylists(
        playlists.reduce((acc, pl) => {
          acc[pl.id] = true;
          return acc;
        }, {})
      );
    }
  }, [playlists]);

  const getSelectionForBackend = () => {
    return playlists
      .filter(pl => selectedPlaylists[pl.id])
      .map(pl => ({
        playlistId: pl.id,
        trackIds: (tracks[pl.id] || [])
          .filter(track => selectedTracks[pl.id]?.[track.id])
          .map(track => track.id)
      }))
      .filter(sel => sel.trackIds.length > 0);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const selection = getSelectionForBackend();
      if (selection.length === 0) {
        alert('Please select at least one playlist and song.');
        setDownloading(false);
        return;
      }
      const res = await axios.post(
        `${API_BASE_URL}/api/download`,
        { selection, format: fileFormat },
        { responseType: 'blob', withCredentials: true }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `spotify_export.${fileFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      const skippedTracksHeader = res.headers['x-skipped-tracks'];
      if (skippedTracksHeader) {
        try {
          const skippedTracks = JSON.parse(skippedTracksHeader);
          if (skippedTracks.length > 0) {
            setSkippedTracks(skippedTracks);
            setShowSkippedTracks(false); // Start collapsed
          }
        } catch (e) {
          console.error('Failed to parse skipped tracks header:', e);
        }
      }
      
      // Update quota after download
      const quotaHeader = res.headers['x-user-quota'];
      if (quotaHeader) {
        try {
          const quota = JSON.parse(quotaHeader);
          setUserQuota(quota);
        } catch (e) {
          console.error('Failed to parse quota header:', e);
        }
      }
    } catch (err) {
      console.error('Download failed:', err);
      if (err.response?.status === 401) {
        setAuthenticated(false);
        setError('Session expired. Please log in again.');
      } else if (err.response?.status === 429) {
        const errorData = err.response.data;
        alert(`${errorData.error}. ${errorData.resetTime || 'Try again later.'}`);
      } else {
        alert('Failed to download file. Please try again.');
      }
    }
    setDownloading(false);
  };

  if (!authenticated) {
    return (
      <div className="container">
        <h1>Spotify Playlist Collector</h1>
        <p> Select and download playlist information to .csv, .json, or .txt</p>
        <a className="login-btn" href={`/auth/login`}>Login with Spotify</a>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Spotify Playlist Collector</h1> 
      {error && <p style={{ color: 'red' }}>{error}</p>}
        <div className="info-container">
          <strong>{numPlaylists} playlists found</strong><br />
          <span>{numSelectedPlaylists} playlists / {numSelectedSongs} songs selected</span>
        </div>
        {userQuota && (
          <div className="quota-container" style={{ 
            margin: '16px 0', 
            padding: '12px', 
            border: '1px solid #ddd', 
            borderRadius: '4px', 
            backgroundColor: '#f9f9f9',
            fontSize: '14px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Daily Limits</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>API Calls:</span>
              <span style={{ color: userQuota.apiCalls >= userQuota.apiLimit * 0.8 ? '#ff6b35' : '#2ecc71' }}>
                {userQuota.apiCalls} / {userQuota.apiLimit}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Downloads:</span>
              <span style={{ color: userQuota.downloads >= userQuota.downloadLimit * 0.8 ? '#ff6b35' : '#2ecc71' }}>
                {userQuota.downloads} / {userQuota.downloadLimit}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Downloaded Tracks:</span>
              <span>{userQuota.downloadedTracks.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
              Limits reset daily at midnight UTC
            </div>
          </div>
        )}
        {anyTracksLoading ? (
          <div className="loading-container" aria-label="Loading..."><div style={{ width: '100%', height: '24px', margin: '16px 0' }} className="shimmer"></div></div>
        ) : (
          <div className="download-container">
          <label>
            File format:
            <select value={fileFormat} onChange={e => setFileFormat(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="txt">TXT</option>
            </select>
          </label>
          <button onClick={handleDownload} disabled={downloading} style={{ marginLeft: 16 }}>
            {downloading ? 'Preparing...' : 'Download'}
          </button>
        </div>
        )}
        {skippedTracks.length > 0 && (
        <div style={{ margin: '16px 0', padding: 12, border: '1px solid #ff6b6b', borderRadius: 4, backgroundColor: '#fff5f5' }}>
          <div 
            style={{ cursor: 'pointer', fontWeight: 'bold', color: '#d63031' }}
            onClick={() => setShowSkippedTracks(!showSkippedTracks)}
          >
            {skippedTracks.length} track{skippedTracks.length !== 1 ? 's' : ''} weren't able to be processed: {showSkippedTracks ? '▼' : '▶'} Show list
          </div>
          {showSkippedTracks && (
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20, color: '#d63031' }}>
              {skippedTracks.map((track, index) => (
                <li key={index} style={{ marginBottom: 4 }}>
                  <strong>{track.title}</strong> ({track.playlistName})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    {downloading && <div style={{ margin: '2rem 0', width: '100%', textAlign: 'center', color: '#fff5f5' }}><strong>Large libraries may take a while to download. Please do not refresh the page</strong></div>}

    {anyTracksLoading ? (
      <label>
        <div className="loading-container" aria-label="Loading..."><div style={{ width: '300px', height: '24px' }} className="shimmer"></div></div>
      </label>
    ) : ( 
      <label>
    <input
            type="checkbox"
            checked={allPlaylistsSelected}
            onChange={e => handleSelectAllPlaylists(e.target.checked)}
          />
          Select All Playlists and Songs
        </label>)}
      <ul>
        {playlists.map(pl => (
          <li key={pl.id}>

              {(loading || anyTracksLoading) ? (
                <div className="loading-container" aria-label="Loading..."><div style={{ width: '100%', height: '24px' }} className="shimmer"></div></div>
              ) : (
                <div className="playlist-container">
                <label>
                <input
                  type="checkbox"
                  checked={!!selectedPlaylists[pl.id]}
                  onChange={e => handlePlaylistSelect(pl.id, e.target.checked)}
                />
              </label>
              <button
                className="playlist-button"
                onClick={() => toggleCollapse(pl.id)}
              >
                {collapsedPlaylists[pl.id] ? '▶' : '▼'}{' '}
                <span style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                  {pl.name}
                  {tracks[pl.id] ? ` (${tracks[pl.id].length} songs: ${Object.values(selectedTracks[pl.id] || {}).filter(Boolean).length} selected)` : ''}
                </span>
              </button>
              </div>
            )}

            {tracks[pl.id] && !collapsedPlaylists[pl.id] && (
              <div style={{ marginLeft: 20 }}>
                <ul className="playlist-tracks">
                  {tracks[pl.id].map(track => (
                    <li key={`${pl.id}-${track.id}`} className="playlist-track">
                      <label>
                        <input
                          type="checkbox"
                          checked={!!(selectedTracks[pl.id]?.[track.id])}
                          onChange={e => handleTrackSelect(pl.id, track.id, e.target.checked)}
                        />
                        <span className="playlist-track-title">
                          <strong>{track.title}</strong> – {track.artists.join(', ')}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
