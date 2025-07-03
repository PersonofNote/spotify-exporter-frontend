import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

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

  useEffect(() => {
    if (window.location.search.includes('auth=success')) {
      setAuthenticated(true);
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

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

  useEffect(() => {
    if (playlists.length > 0) {
      playlists.forEach(pl => {
        if (!tracks[pl.id] && !loadingTracks[pl.id]) {
          setLoadingTracks(lt => ({ ...lt, [pl.id]: true }));
          axios.get(`/api/playlists/${pl.id}/tracks`, { withCredentials: true })
            .then(res => {
              setTracks(t => ({ ...t, [pl.id]: res.data.tracks }));
            })
            .catch(() => {
              setError('Failed to fetch tracks');
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
        '/api/download',
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
    } catch (err) {
      alert('Failed to download file.');
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
        {anyTracksLoading ? (
          <div className="loading-container" aria-label="Loading..."><div style={{ width: '300px', height: '24px' }} className="shimmer"></div></div>
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
          <button onClick={handleDownload} disabled={downloading} className="download-btn">
            {downloading ? 'Preparing...' : 'Download'}
          </button>
        </div>
        )}

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
                <div className="loading-container" aria-label="Loading..."><div style={{ width: '300px', height: '24px' }} className="shimmer"></div></div>
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
