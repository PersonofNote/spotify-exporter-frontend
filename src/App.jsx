import { useEffect, useState } from "react";
import axios from "axios";
import { tokenManager, setupAxiosInterceptors } from "./auth.js";
import "./App.css";
import { Analytics } from "@vercel/analytics/react"

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (IS_LOCAL
    ? "http://127.0.0.1:3001"
    : (() => {
        throw new Error("VITE_API_URL must be defined in production");
      })());

// Setup axios interceptors for JWT
setupAxiosInterceptors(axios);

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState({});
  const [tracks, setTracks] = useState({}); // { playlistId: [tracks] }
  const [selectedTracks, setSelectedTracks] = useState({}); // { playlistId: { trackId: true } }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [collapsedPlaylists, setCollapsedPlaylists] = useState({}); // { playlistId: true/false }
  const [loadingTracks, setLoadingTracks] = useState({}); // { playlistId: true/false }
  const [fileFormat, setFileFormat] = useState("csv");
  const [downloading, setDownloading] = useState(false);
  const [skippedTracks, setSkippedTracks] = useState([]);
  const [showSkippedTracks, setShowSkippedTracks] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [_userQuota, setUserQuota] = useState(null);
  
  // Album state
  const [albums, setAlbums] = useState([]);
  const [selectedAlbums, setSelectedAlbums] = useState({});
  const [albumTracks, setAlbumTracks] = useState({}); // { albumId: [tracks] }
  const [selectedAlbumTracks, setSelectedAlbumTracks] = useState({}); // { albumId: { trackId: true } }
  const [collapsedAlbums, setCollapsedAlbums] = useState({}); // { albumId: true/false }
  const [loadingAlbumTracks, setLoadingAlbumTracks] = useState({}); // { albumId: true/false }
  
  // Public playlist state
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [publicPlaylist, setPublicPlaylist] = useState(null);
  const [publicTracks, setPublicTracks] = useState([]);
  const [selectedPublicTracks, setSelectedPublicTracks] = useState({});
  const [fetchingPublicPlaylist, setFetchingPublicPlaylist] = useState(false);
  const [publicPlaylistError, setPublicPlaylistError] = useState("");

  useEffect(() => {
    console.log(publicPlaylist)
    console.log(publicTracks)
  },[publicPlaylist, publicTracks])

  // Check authentication status on mount
  useEffect(() => {
    // Check if we have a valid token
    if (tokenManager.hasToken()) {
      setAuthenticated(true);
    }

    // Listen for localStorage changes (auth popup completion)
    const handleStorageChange = (event) => {
      if (event.key === "spotify-auth-result") {
        try {
          const authResult = JSON.parse(event.newValue);
          handleAuthCompletion(authResult);

          // Clean up localStorage
          localStorage.removeItem("spotify-auth-result");
        } catch (error) {
          console.error("Error parsing auth result:", error);
        }
      }
    };

    // Handle auth completion
    const handleAuthCompletion = (data) => {
      if (data.success && data.token) {
        tokenManager.setToken(data.token);
        setAuthenticated(true);
        setError("");
        setLoading(false);
      } else {
        setError(`Authentication failed: ${data.error || "Unknown error"}`);
        setLoading(false);
      }
    };

    // Listen for token expiration
    const handleAuthExpired = () => {
      setAuthenticated(false);
      setPlaylists([]);
      setUserQuota(null);
      setError("Your session has expired. Please log in again.");
    };

    // Add event listeners
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("auth-expired", handleAuthExpired);

    // Check for existing auth result on mount (in case popup closed before we were listening)
    const checkExistingAuthResult = () => {
      const existingResult = localStorage.getItem("spotify-auth-result");
      if (existingResult) {
        try {
          const authResult = JSON.parse(existingResult);
          // Only process if it's recent (within last 30 seconds)
          if (Date.now() - authResult.timestamp < 30000) {
            handleAuthCompletion(authResult);
          }
          localStorage.removeItem("spotify-auth-result");
        } catch (error) {
          console.error("Error parsing existing auth result");
        }
      }
    };

    // Check immediately and also after a short delay
    checkExistingAuthResult();
    const timeoutId = setTimeout(checkExistingAuthResult, 500);

    // Cleanup
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("auth-expired", handleAuthExpired);
      clearTimeout(timeoutId);
    };
  }, []);

  // Helper function to handle API errors
  const handleApiError = (err, errorMessage) => {
    console.error(errorMessage, err);
    if (err.response?.status === 401) {
      setAuthenticated(false);
      tokenManager.removeToken();
      setError("Your session has expired. Please log in again.");
    } else if (err.response?.status === 429) {
      setError(
        `Rate limit exceeded. Some or all data was not fetched. ${
          err.response.data.resetTime || "Try again later."
        }`
      );
    } else {
      setError(errorMessage);
    }
  };

  // Fetch playlists and albums when authenticated
  useEffect(() => {
    if (authenticated && tokenManager.hasToken()) {
      // Fetch playlists
      axios
        .get(`${API_BASE_URL}/api/playlists`)
        .then((res) => {
          setPlaylists(res.data.playlists);
          setUserQuota(res.data.quota);
          setError("");
        })
        .catch((err) => {
          handleApiError(err, "Failed to fetch playlists");
        });
      
      // Fetch albums
      axios
        .get(`${API_BASE_URL}/api/albums`)
        .then((res) => {
          setAlbums(res.data.albums);
          setUserQuota(res.data.quota);
          setError("");
        })
        .catch((err) => {
          handleApiError(err, "Failed to fetch albums");
        });
    }
  }, [authenticated]);

  useEffect(() => {
    if (playlists.length > 0) {
      playlists.forEach((pl) => {
        fetchTracks(pl.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists]);

  const anyTracksLoading = Object.values(loadingTracks).some(Boolean);

  const loginWithSpotify = () => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      `${API_BASE_URL}/auth`,
      "Spotify Login",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      alert("Please allow popups for this site");
      return;
    }

    setError("");
  };

  const logout = () => {
    tokenManager.removeToken();
    setAuthenticated(false);
    setPlaylists([]);
    setUserQuota(null);
    setSelectedPlaylists({});
    setSelectedTracks({});
    setTracks({});
    setError("");
  };

  // Public playlist functions
  const handleFetchPublicPlaylist = async () => {
    if (!playlistUrl.trim()) {
      setPublicPlaylistError("Please enter a playlist URL");
      return;
    }

    setFetchingPublicPlaylist(true);
    setPublicPlaylistError("");
    setPublicPlaylist(null);
    setPublicTracks([]);
    setSelectedPublicTracks({});

    try {
      const response = await axios.post(`${API_BASE_URL}/api/public-playlist`, {
        playlistUrl: playlistUrl.trim()
      });

      setPublicPlaylist(response.data.playlist);
      setPublicTracks(response.data.tracks);
      
      // Auto-select all tracks
      const allSelected = {};
      response.data.tracks.forEach(track => {
        allSelected[track.id] = true;
      });
      setSelectedPublicTracks(allSelected);

    } catch (err) {
      console.error("Failed to fetch public playlist:", err);
      setPublicPlaylistError(
        err.response?.data?.error || "Failed to fetch playlist. Please try again."
      );
    } finally {
      setFetchingPublicPlaylist(false);
    }
  };

  const handlePublicTrackSelect = (trackId, checked) => {
    setSelectedPublicTracks(prev => ({
      ...prev,
      [trackId]: checked
    }));
  };

  const handleSelectAllPublicTracks = (checked) => {
    const newSelection = {};
    publicTracks.forEach(track => {
      newSelection[track.id] = checked;
    });
    setSelectedPublicTracks(newSelection);
  };

  const handlePublicPlaylistDownload = async () => {
    const selectedTrackIds = Object.keys(selectedPublicTracks).filter(
      trackId => selectedPublicTracks[trackId]
    );

    if (selectedTrackIds.length === 0) {
      alert("Please select at least one track to download.");
      return;
    }

    setDownloading(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/public-playlist/download`,
        {
          playlistUrl: playlistUrl.trim(),
          selectedTrackIds,
          format: fileFormat
        },
        { responseType: "blob" }
      );
      console.log("Response from download:")
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `spotify_public_playlist.${fileFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error("Download failed:", err);
      alert(
        err.response?.data?.error || "Failed to download file. Please try again."
      );
    } finally {
      setDownloading(false);
    }
  };

  const clearPublicPlaylist = () => {
    setPlaylistUrl("");
    setPublicPlaylist(null);
    setPublicTracks([]);
    setSelectedPublicTracks({});
    setPublicPlaylistError("");
  };

  const fetchTracks = (playlistId) => {
    if (tracks[playlistId] || loadingTracks[playlistId]) return;

    setLoadingTracks((lt) => ({ ...lt, [playlistId]: true }));
    axios
      .get(`${API_BASE_URL}/api/playlists/${playlistId}/tracks`)
      .then((res) => {
        setTracks((t) => ({ ...t, [playlistId]: res.data.tracks }));
        setUserQuota(res.data.quota);
      })
      .catch((err) => {
        console.error("Failed to fetch tracks for playlist:", playlistId, err);
        handleApiError(err, "Failed to fetch tracks");
      })
      .finally(() => {
        setLoadingTracks((lt) => ({ ...lt, [playlistId]: false }));
      });
  };

  const fetchAlbumTracks = (albumId) => {
    if (albumTracks[albumId] || loadingAlbumTracks[albumId]) return;

    setLoadingAlbumTracks((lt) => ({ ...lt, [albumId]: true }));
    axios
      .get(`${API_BASE_URL}/api/albums/${albumId}/tracks`)
      .then((res) => {
        setAlbumTracks((t) => ({ ...t, [albumId]: res.data.tracks }));
        setUserQuota(res.data.quota);
      })
      .catch((err) => {
        console.error("Failed to fetch tracks for album:", albumId, err);
        handleApiError(err, "Failed to fetch album tracks");
      })
      .finally(() => {
        setLoadingAlbumTracks((lt) => ({ ...lt, [albumId]: false }));
      });
  };

  const handleSelectAllPlaylists = (checked) => {
    const newSelectedPlaylists = {};
    const newSelectedTracks = {};
    playlists.forEach((pl) => {
      newSelectedPlaylists[pl.id] = checked;
      if (checked) {
        // If tracks are loaded, select all songs
        if (tracks[pl.id]) {
          newSelectedTracks[pl.id] = Object.fromEntries(
            tracks[pl.id].map((track) => [track.id, true])
          );
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

  const handlePlaylistSelect = (playlistId, checked) => {
    setSelectedPlaylists((p) => ({ ...p, [playlistId]: checked }));
    if (checked) {
      if (tracks[playlistId]) {
        setSelectedTracks((st) => ({
          ...st,
          [playlistId]: Object.fromEntries(
            tracks[playlistId].map((track) => [track.id, true])
          ),
        }));
      } else {
        fetchTracks(playlistId);
      }
    } else {
      setSelectedTracks((st) => ({ ...st, [playlistId]: {} }));
    }
  };

  const handleTrackSelect = (playlistId, trackId, checked) => {
    setSelectedTracks((st) => ({
      ...st,
      [playlistId]: {
        ...st[playlistId],
        [trackId]: checked,
      },
    }));
  };

  const handleSelectAllAlbums = (checked) => {
    const newSelectedAlbums = {};
    const newSelectedAlbumTracks = {};
    albums.forEach((album) => {
      newSelectedAlbums[album.id] = checked;
      if (checked) {
        // If tracks are loaded, select all songs
        if (albumTracks[album.id]) {
          newSelectedAlbumTracks[album.id] = Object.fromEntries(
            albumTracks[album.id].map((track) => [track.id, true])
          );
        } else {
          // If not loaded, fetch and select all when loaded
          fetchAlbumTracks(album.id);
        }
      } else {
        newSelectedAlbumTracks[album.id] = {};
      }
    });
    setSelectedAlbums(newSelectedAlbums);
    setSelectedAlbumTracks(newSelectedAlbumTracks);
  };

  const handleAlbumSelect = (albumId, checked) => {
    setSelectedAlbums((a) => ({ ...a, [albumId]: checked }));
    if (checked) {
      if (albumTracks[albumId]) {
        setSelectedAlbumTracks((st) => ({
          ...st,
          [albumId]: Object.fromEntries(
            albumTracks[albumId].map((track) => [track.id, true])
          ),
        }));
      } else {
        fetchAlbumTracks(albumId);
      }
    } else {
      setSelectedAlbumTracks((st) => ({ ...st, [albumId]: {} }));
    }
  };

  const handleAlbumTrackSelect = (albumId, trackId, checked) => {
    setSelectedAlbumTracks((st) => ({
      ...st,
      [albumId]: {
        ...st[albumId],
        [trackId]: checked,
      },
    }));
  };

  const toggleAlbumCollapse = (albumId) => {
    if (!albumTracks[albumId]) fetchAlbumTracks(albumId);
    setCollapsedAlbums((ca) => ({ ...ca, [albumId]: !ca[albumId] }));
  };

  const allPlaylistsSelected =
    playlists.length > 0 && playlists.every((pl) => selectedPlaylists[pl.id]);
    
  const allAlbumsSelected =
    albums.length > 0 && albums.every((album) => selectedAlbums[album.id]);

  useEffect(() => {
    playlists.forEach((pl) => {
      if (
        selectedPlaylists[pl.id] &&
        tracks[pl.id] &&
        Object.keys(selectedTracks[pl.id] || {}).length === 0
      ) {
        setSelectedTracks((st) => ({
          ...st,
          [pl.id]: Object.fromEntries(
            tracks[pl.id].map((track) => [track.id, true])
          ),
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  useEffect(() => {
    albums.forEach((album) => {
      if (
        selectedAlbums[album.id] &&
        albumTracks[album.id] &&
        Object.keys(selectedAlbumTracks[album.id] || {}).length === 0
      ) {
        setSelectedAlbumTracks((st) => ({
          ...st,
          [album.id]: Object.fromEntries(
            albumTracks[album.id].map((track) => [track.id, true])
          ),
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumTracks]);

  const toggleCollapse = (playlistId) => {
    if (!tracks[playlistId]) fetchTracks(playlistId);
    setCollapsedPlaylists((cp) => ({ ...cp, [playlistId]: !cp[playlistId] }));
  };

  const numPlaylists = playlists.length;
  const numSelectedPlaylists = playlists.filter(
    (pl) => selectedPlaylists[pl.id]
  ).length;
  const numSelectedSongs = Object.values(selectedTracks).reduce(
    (acc, tracksObj) => acc + Object.values(tracksObj).filter(Boolean).length,
    0
  );

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
    const selection = [];
    
    // Add selected playlists
    playlists
      .filter((pl) => selectedPlaylists[pl.id])
      .forEach((pl) => {
        const trackIds = (tracks[pl.id] || [])
          .filter((track) => selectedTracks[pl.id]?.[track.id])
          .map((track) => track.id);
        
        if (trackIds.length > 0) {
          selection.push({
            playlistId: pl.id,
            trackIds
          });
        }
      });
    
    // Add selected albums
    albums
      .filter((album) => selectedAlbums[album.id])
      .forEach((album) => {
        const trackIds = (albumTracks[album.id] || [])
          .filter((track) => selectedAlbumTracks[album.id]?.[track.id])
          .map((track) => track.id);
        
        if (trackIds.length > 0) {
          selection.push({
            albumId: album.id,
            trackIds
          });
        }
      });
    
    return selection;
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const selection = getSelectionForBackend();
      if (selection.length === 0) {
        alert("Please select at least one playlist or album and song.");
        setDownloading(false);
        return;
      }
      const res = await axios.post(
        `${API_BASE_URL}/api/download`,
        { selection, format: fileFormat },
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `spotify_export.${fileFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const skippedTracksHeader = res.headers["x-skipped-tracks"];
      if (skippedTracksHeader) {
        try {
          const skippedTracks = JSON.parse(skippedTracksHeader);
          if (skippedTracks.length > 0) {
            setSkippedTracks(skippedTracks);
            setShowSkippedTracks(false); // Start collapsed
          }
        } catch (e) {
          console.error("Failed to parse skipped tracks header:", e);
        }
      }

      // Update quota after download
      const quotaHeader = res.headers["x-user-quota"];
      if (quotaHeader) {
        try {
          const quota = JSON.parse(quotaHeader);
          setUserQuota(quota);
        } catch (e) {
          console.error("Failed to parse quota header:", e);
        }
      }
    } catch (err) {
      console.error("Download failed:", err);
      if (err.response?.status === 401) {
        setAuthenticated(false);
        tokenManager.removeToken();
        setError("Your session has expired. Please log in again.");
      } else if (err.response?.status === 429) {
        const errorData = err.response.data;
        alert(
          `${errorData.error}. ${errorData.resetTime || "Try again later."}`
        );
      } else {
        alert("Failed to download file. Please try again.");
      }
    }
    setDownloading(false);
  };

  if (!authenticated) {
    return (
      <div className="container">
        <h1>Spotify Playlist Collector</h1>
        <p>Select and download playlist information to .csv, .json, or .txt</p>
        
        {loading ? (
          <div className="loading-container" aria-label="Loading...">
            <div
              style={{ width: "200px", height: "64px", margin: "auto" }}
              className="shimmer"
            ></div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <button style={{margin: 'auto'}} className="accent-btn" onClick={loginWithSpotify}>
                Login with Spotify
              </button>
              <p style={{ margin: '1rem 0', color: '#d3d3d3' }}>
                Login to access all your playlists
              </p>
            </div>

            <div style={{ 
              borderTop: '1px solid #ddd', 
              paddingTop: '2rem', 
              marginTop: '2rem' 
            }}>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>
                Or try a public playlist
              </h3>
              <p style={{ textAlign: 'center', color: '#d3d3d3', marginBottom: '1rem' }}>
                Paste a link to any public Spotify playlist to view and download its tracks
              </p>
              
              <div style={{ 
                display: 'flex', 
                gap: '0.5rem', 
                marginBottom: '1rem',
                flexWrap: 'wrap'
              }}>
                <input
                  type="text"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleFetchPublicPlaylist()}
                  style={{
                    flex: 1,
                    minWidth: '300px',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                  disabled={fetchingPublicPlaylist}
                />
                <button
                  onClick={handleFetchPublicPlaylist}
                  disabled={fetchingPublicPlaylist || !playlistUrl.trim()}
                  className="accent-btn"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {fetchingPublicPlaylist ? 'Fetching...' : 'Fetch Playlist'}
                </button>
                {publicPlaylist && (
                  <button
                    onClick={clearPublicPlaylist}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {publicPlaylistError && (
                <p style={{ color: 'red', textAlign: 'center', marginBottom: '1rem' }}>
                  {publicPlaylistError}
                </p>
              )}

              {publicPlaylist && (
                <div>
                  <div style={{ 
                    padding: '1rem', 
                    borderRadius: '4px', 
                    marginBottom: '1rem' 
                  }}>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{publicPlaylist.name}</h4>
                    <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                      By {publicPlaylist.owner} • {publicPlaylist.trackCount} tracks
                    </p>
                    {publicPlaylist.description && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '14px' }}>
                        {publicPlaylist.description}
                      </p>
                    )}
                  </div>

                  <div className="donwload-container" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '1rem'}}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={publicTracks.length > 0 && publicTracks.every(track => selectedPublicTracks[track.id])}
                          onChange={(e) => handleSelectAllPublicTracks(e.target.checked)}
                        />
                        Select/Deselect All Tracks ({Object.values(selectedPublicTracks).filter(Boolean).length} of {publicTracks.length} selected)
                      </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <label>
                        File format:
                        <select
                          value={fileFormat}
                          onChange={(e) => setFileFormat(e.target.value)}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          <option value="csv">CSV</option>
                          <option value="json">JSON</option>
                          <option value="txt">TXT</option>
                        </select>
                      </label>
                      <button
                        onClick={handlePublicPlaylistDownload}
                        disabled={downloading || Object.values(selectedPublicTracks).filter(Boolean).length === 0}
                        className="accent-btn"
                      >
                        {downloading ? 'Preparing...' : 'Download Selected'}
                      </button>
                    </div>
                  </div>

                  <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {publicTracks.map((track, index) => (
                        <li 
                          key={track.id} 
                          style={{ 
                            padding: '0.5rem',
                            backgroundColor: selectedPublicTracks[track.id] ? '#222222' : 'transparent'
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={!!selectedPublicTracks[track.id]}
                              onChange={(e) => handlePublicTrackSelect(track.id, e.target.checked)}
                              style={{ marginRight: '0.5rem' }}
                            />
                            <span>
                              <strong>{track.title}</strong> ({track.artists.join(', ')}) - Album: {track.album}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <button
          onClick={logout}
          style={{
            padding: "8px 16px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Logout
        </button>
      </div>
      <div className="container">
          <h1>Spotify Playlist Collector</h1>
        {error && <p style={{ color: "#dc3545" }}>{error}</p>}
        <div className="info-container">
          <strong>{numPlaylists} playlists found</strong>
          <br />
          <span>
            {numSelectedPlaylists} playlists / {numSelectedSongs} songs selected
          </span>
        </div>
        {anyTracksLoading ? (
          <div className="loading-container" aria-label="Loading...">
            <div
              style={{ width: "100%", height: "24px", margin: "16px 0" }}
              className="shimmer"
            ></div>
          </div>
        ) : (
          <div className="download-container">
            <label>
              File format:
              <select
                value={fileFormat}
                onChange={(e) => setFileFormat(e.target.value)}
                style={{ marginLeft: 8 }}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="txt">TXT</option>
              </select>
            </label>
            <button
              className="accent-btn"
              onClick={handleDownload}
              disabled={downloading}
              style={{ marginLeft: 16 }}
            >
              {downloading ? "Preparing..." : "Download"}
            </button>
          </div>
        )}
        {skippedTracks.length > 0 && (
          <div
            style={{
              margin: "16px 0",
              padding: 12,
              border: "1px solid #ff6b6b",
              borderRadius: 4,
              backgroundColor: "#fff5f5",
            }}
          >
            <div
              style={{
                cursor: "pointer",
                fontWeight: "bold",
                color: "#d63031",
              }}
              onClick={() => setShowSkippedTracks(!showSkippedTracks)}
            >
              {skippedTracks.length} track
              {skippedTracks.length !== 1 ? "s" : ""} weren't able to be
              processed: {showSkippedTracks ? "▼" : "▶"} Show list
            </div>
            {showSkippedTracks && (
              <ul
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  paddingLeft: 20,
                  color: "#d63031",
                }}
              >
                {skippedTracks.map((track, index) => (
                  <li key={index} style={{ marginBottom: 4 }}>
                    <strong>{track.title}</strong> ({track.playlistName})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {downloading && (
          <div
            style={{
              margin: "2rem 0",
              width: "100%",
              textAlign: "center",
              color: "#fff5f5",
            }}
          >
            <strong>
              Large libraries may take a while to download. Please do not
              refresh the page
            </strong>
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "16px",
            gap: "8px",
          }}
        >
          <button className="form-btn" onClick={() => setShowForm(!showForm)}>
            {showForm
              ? "Hide form"
              : "Want to tell me why you're using this tool? (show optional Google form)"}
          </button>
          <iframe
            style={{ transition: "all 200ms" }}
            src="https://docs.google.com/forms/d/e/1FAIpQLSd7zkECkk_yI6RxsC0dKoHyU-cUK5-KePUS8vVTE2GpG0oehw/viewform?embedded=true"
            width="640"
            height={showForm ? "1200" : "0"}
            frameBorder="0"
            marginHeight="0"
            marginWidth="0"
          >
            Loading…
          </iframe>
        </div>
        {anyTracksLoading ? (
          <label>
            <div className="loading-container" aria-label="Loading...">
              <div
                style={{ width: "300px", height: "24px" }}
                className="shimmer"
              ></div>
            </div>
          </label>
        ) : (
          <label>
            <input
              type="checkbox"
              checked={allPlaylistsSelected}
              onChange={(e) => handleSelectAllPlaylists(e.target.checked)}
            />
            Select All Playlists and Songs
          </label>
        )}
        <ul>
          {playlists.map((pl) => (
            <li key={pl.id}>
              {loading || anyTracksLoading ? (
                <div className="loading-container" aria-label="Loading...">
                  <div
                    style={{ width: "100%", height: "24px" }}
                    className="shimmer"
                  ></div>
                </div>
              ) : (
                <div className="playlist-container">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selectedPlaylists[pl.id]}
                      onChange={(e) =>
                        handlePlaylistSelect(pl.id, e.target.checked)
                      }
                    />
                  </label>
                  <button
                    className="playlist-button"
                    onClick={() => toggleCollapse(pl.id)}
                  >
                    {collapsedPlaylists[pl.id] ? "▶" : "▼"}{" "}
                    <span
                      style={{ wordBreak: "break-word", whiteSpace: "normal" }}
                    >
                      {pl.name}
                      {tracks[pl.id]
                        ? ` (${tracks[pl.id].length} songs: ${
                            Object.values(selectedTracks[pl.id] || {}).filter(
                              Boolean
                            ).length
                          } selected)`
                        : ""}
                    </span>
                  </button>
                </div>
              )}

              {tracks[pl.id] && !collapsedPlaylists[pl.id] && (
                <div style={{ marginLeft: 20 }}>
                  <ul className="playlist-tracks">
                    {tracks[pl.id].map((track) => (
                      <li
                        key={`${pl.id}-${track.id}`}
                        className="playlist-track"
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={!!selectedTracks[pl.id]?.[track.id]}
                            onChange={(e) =>
                              handleTrackSelect(
                                pl.id,
                                track.id,
                                e.target.checked
                              )
                            }
                          />
                          <span className="playlist-track-title">
                            <strong>{track.title}</strong> –{" "}
                            {track.artists.join(", ")}
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
        {/* Saved Albums Section  TODO: Implement properly 
        <h3 style={{ marginTop: "2rem" }}>Saved Albums</h3>
        {Object.values(loadingAlbumTracks).some(Boolean) ? (
          <label>
            <div className="loading-container" aria-label="Loading...">
              <div
                style={{ width: "300px", height: "24px" }}
                className="shimmer"
              ></div>
            </div>
          </label>
        ) : (
          <label>
            <input
              type="checkbox"
              checked={allAlbumsSelected}
              onChange={(e) => handleSelectAllAlbums(e.target.checked)}
            />
            Select All Albums and Songs
          </label>
        )}
        <ul>
          {albums.map((album) => (
            <li key={album.id}>
              {loading || Object.values(loadingAlbumTracks).some(Boolean) ? (
                <div className="loading-container" aria-label="Loading...">
                  <div
                    style={{ width: "100%", height: "24px" }}
                    className="shimmer"
                  ></div>
                </div>
              ) : (
                <div className="playlist-container">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selectedAlbums[album.id]}
                      onChange={(e) =>
                        handleAlbumSelect(album.id, e.target.checked)
                      }
                    />
                  </label>
                  <button
                    className="playlist-button"
                    onClick={() => toggleAlbumCollapse(album.id)}
                  >
                    {collapsedAlbums[album.id] ? "▶" : "▼"}{" "}
                    <span
                      style={{ wordBreak: "break-word", whiteSpace: "normal" }}
                    >
                      {album.name}
                      {albumTracks[album.id]
                        ? ` (${albumTracks[album.id].length} songs: ${
                            Object.values(selectedAlbumTracks[album.id] || {}).filter(
                              Boolean
                            ).length
                          } selected)`
                        : ""}
                    </span>
                  </button>
                </div>
              )}

              {albumTracks[album.id] && !collapsedAlbums[album.id] && (
                <div style={{ marginLeft: 20 }}>
                  <ul className="playlist-tracks">
                    {albumTracks[album.id].map((track) => (
                      <li
                        key={`${album.id}-${track.id}`}
                        className="playlist-track"
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={!!selectedAlbumTracks[album.id]?.[track.id]}
                            onChange={(e) =>
                              handleAlbumTrackSelect(
                                album.id,
                                track.id,
                                e.target.checked
                              )
                            }
                          />
                          <span className="playlist-track-title">
                            <strong>{track.title}</strong> –{" "}
                            {track.artists.join(", ")}
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
        */}
      </div>
      <Analytics />
    </>
  );
}

export default App;
