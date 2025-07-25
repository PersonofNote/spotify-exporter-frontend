import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (IS_LOCAL
    ? "http://127.0.0.1:3001"
    : (() => {
        throw new Error("VITE_API_URL must be defined in production");
      })());

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


  useEffect(() => {console.log( "Authenticated?: ", authenticated)}, [authenticated]);
  useEffect(() => {
    // Listen for localStorage changes
    const handleStorageChange = (event) => {
        if (event.key === 'spotify-auth-result') {
            try {
                const authResult = JSON.parse(event.newValue);
                console.log('Auth completed:', authResult);
                handleAuthCompletion(authResult);
                
                // Clean up localStorage
                localStorage.removeItem('spotify-auth-result');
            } catch (error) {
                console.error('Error parsing auth result:', error);
            }
        }
    };

    // Handle auth completion
    const handleAuthCompletion = (data) => {
        if (data.success) {
            console.log('Authentication successful!');
            fetchStatusAndUpdateUI();
        } else {
            console.log('Authentication failed:', data.error);
            setError(`Authentication failed: ${data.error || 'Unknown error'}`);
            setLoading(false);
        }
    };

    // Add storage listener
    window.addEventListener('storage', handleStorageChange);
    
    // Check for existing auth result on mount (in case popup closed before we were listening)
    const checkExistingAuthResult = () => {
        const existingResult = localStorage.getItem('spotify-auth-result');
        if (existingResult) {
            try {
                const authResult = JSON.parse(existingResult);
                // Only process if it's recent (within last 30 seconds)
                if (Date.now() - authResult.timestamp < 30000) {
                    console.log('Found existing auth result:', authResult);
                    handleAuthCompletion(authResult);
                }
                localStorage.removeItem('spotify-auth-result');
            } catch (error) {
                console.error('Error parsing existing auth result:', error);
            }
        }
    };

    // Check immediately and also after a short delay
    checkExistingAuthResult();
    const timeoutId = setTimeout(checkExistingAuthResult, 500);
    
    // Cleanup
    return () => {
        window.removeEventListener('storage', handleStorageChange);
        clearTimeout(timeoutId);
    };
}, []);

  // Fetch playlists when authenticated
  useEffect(() => {
    if (authenticated) {
      axios
        .get(`${API_BASE_URL}/api/playlists`, { withCredentials: true })
        .then((res) => {
          setPlaylists(res.data.playlists);
          setUserQuota(res.data.quota); // Update quota after API call
          setError(""); // Clear any previous errors
        })
        .catch((err) => {
          console.error("Failed to fetch playlists:", err);
          if (err.response?.status === 401) {
            setAuthenticated(false);
            setError("Session expired. Please log in again.");
          } else if (err.response?.status === 429) {
            setError(
              `Rate limit exceeded: ${err.response.data.error}. ${
                err.response.data.resetTime || "Try again later."
              }`
            );
          } else {
            setError("Failed to fetch playlists");
          }
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

    //timeout in case user never completes auth
    setTimeout(() => {
        setLoading(false);
        setError("Authentication timed out. Please try again.");
    }, 300000); // 5 minutes

};

async function fetchStatusAndUpdateUI(retryCount = 0) {
  console.log(`Fetching (attempt ${retryCount + 1})`);
  
  try {
      const res = await axios.get(`${API_BASE_URL}/api/status`, {
          withCredentials: true,
      });
      const data = res.data;
      console.log("Fetched data:", data);
      
      if (data.authenticated) {
          setAuthenticated(true);
          setUserQuota(data.quota || null);
          
          // Fetch playlists
          try {
              const playlistsRes = await axios.get(
                  `${API_BASE_URL}/api/playlists`,
                  { withCredentials: true }
              );
              setPlaylists(playlistsRes.data.playlists || []);
              setUserQuota(playlistsRes.data.quota || null);
              setError("");
          } catch (err) {
              console.error("Failed to fetch playlists after login:", err);
              setError("Failed to fetch playlists after login");
          }
          return { authenticated: true };
      } else {
          // If not authenticated and we haven't retried much, try again
          if (retryCount < 3) {
              console.log(`Not authenticated, retrying in ${(retryCount + 1) * 1000}ms...`);
              setTimeout(() => {
                  fetchStatusAndUpdateUI(retryCount + 1);
              }, (retryCount + 1) * 1000); // 1s, 2s, 3s delays
              return { authenticated: false, retrying: true };
          } else {
              console.log('Max retries reached, user not authenticated');
              setAuthenticated(false);
              setPlaylists([]);
              setUserQuota(null);
              return { authenticated: false };
          }
      }
  } catch (err) {
      console.error("Failed to fetch auth status:", err);
      
      // Retry on network errors too
      if (retryCount < 3) {
          setTimeout(() => {
              fetchStatusAndUpdateUI(retryCount + 1);
          }, (retryCount + 1) * 1000);
          return { authenticated: false, retrying: true };
      }
      
      setAuthenticated(false);
      return { authenticated: false };
  } finally {
      // Only set loading to false if we're not retrying
      if (retryCount >= 3) {
          setLoading(false);
      }
  }
}

  const fetchTracks = (playlistId) => {
    if (tracks[playlistId] || loadingTracks[playlistId]) return;

    setLoadingTracks((lt) => ({ ...lt, [playlistId]: true }));
    axios
      .get(`${API_BASE_URL}/api/playlists/${playlistId}/tracks`, {
        withCredentials: true,
      })
      .then((res) => {
        setTracks((t) => ({ ...t, [playlistId]: res.data.tracks }));
        setUserQuota(res.data.quota);
      })
      .catch((err) => {
        console.error("Failed to fetch tracks for playlist:", playlistId, err);
        if (err.response?.status === 401) {
          setAuthenticated(false);
          setError("Session expired. Please log in again.");
        } else if (err.response?.status === 429) {
          setError(
            `Rate limit exceeded: ${err.response.data.error}. ${
              err.response.data.resetTime || "Try again later."
            }`
          );
        } else {
          setError("Failed to fetch tracks");
        }
      })
      .finally(() => {
        setLoadingTracks((lt) => ({ ...lt, [playlistId]: false }));
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

  const allPlaylistsSelected =
    playlists.length > 0 && playlists.every((pl) => selectedPlaylists[pl.id]);

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
    return playlists
      .filter((pl) => selectedPlaylists[pl.id])
      .map((pl) => ({
        playlistId: pl.id,
        trackIds: (tracks[pl.id] || [])
          .filter((track) => selectedTracks[pl.id]?.[track.id])
          .map((track) => track.id),
      }))
      .filter((sel) => sel.trackIds.length > 0);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const selection = getSelectionForBackend();
      if (selection.length === 0) {
        alert("Please select at least one playlist and song.");
        setDownloading(false);
        return;
      }
      const res = await axios.post(
        `${API_BASE_URL}/api/download`,
        { selection, format: fileFormat },
        { responseType: "blob", withCredentials: true }
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
        setError("Session expired. Please log in again.");
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
        <p> Select and download playlist information to .csv, .json, or .txt</p>
        {loading ? (
          <div className="loading-container" aria-label="Loading...">
            <div
              style={{ width: "200px", height: "64px", margin: "auto" }}
              className="shimmer"
            ></div>
          </div>
        ) : (
          <button style={{margin: 'auto'}} className="accent-btn" onClick={loginWithSpotify}>
            Login with Spotify
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Spotify Playlist Collector</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
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
            style={{ cursor: "pointer", fontWeight: "bold", color: "#d63031" }}
            onClick={() => setShowSkippedTracks(!showSkippedTracks)}
          >
            {skippedTracks.length} track{skippedTracks.length !== 1 ? "s" : ""}{" "}
            weren't able to be processed: {showSkippedTracks ? "▼" : "▶"} Show
            list
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
            Large libraries may take a while to download. Please do not refresh
            the page
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
        <button className='form-btn' onClick={() => setShowForm(!showForm)}>
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
                    <li key={`${pl.id}-${track.id}`} className="playlist-track">
                      <label>
                        <input
                          type="checkbox"
                          checked={!!selectedTracks[pl.id]?.[track.id]}
                          onChange={(e) =>
                            handleTrackSelect(pl.id, track.id, e.target.checked)
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
    </div>
  );
}

export default App;
