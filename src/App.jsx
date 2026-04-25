import { useState, useEffect, useRef } from "react";
import setList from "./setlist.json";

const SAMPLE = setList;

const ROOT_COLORS = {
  C: "#f5c842", D: "#f07840", E: "#42e096",
  F: "#42aff5", G: "#a042f5", A: "#f54268", B: "#42e8e8"
};

const CHORD_RE = /^[A-G][b#]?(?:maj7|maj|min|m|dim|aug|sus[24]?|add\d|M)?(?:[679]|11|13)?(?:sus[24]?)?(?:\([b#]?\d+\))*(?:\/[A-G][b#]?)?$/;

function getColor(chord) {
  const root = chord.match(/^[A-G]/)?.[0];
  return ROOT_COLORS[root] || "#888";
}

function isChordLine(line) {
  if (!line.trim()) return false;
  const tokens = line.trim().split(/\s+/);
  const n = tokens.filter(t => CHORD_RE.test(t)).length;
  return n > 0 && n / tokens.length >= 0.55;
}

function parseChordsPos(line) {
  const res = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (CHORD_RE.test(m[0])) res.push({ chord: m[0], pos: m.index });
  }
  return res;
}

function ChordTag({ chord }) {
  return (
    <span style={{
      background: getColor(chord), color: "#111", borderRadius: 4,
      padding: "1px 5px", fontWeight: 700, fontSize: 11,
      fontFamily: "monospace", lineHeight: 1.5, display: "inline-block"
    }}>{chord}</span>
  );
}

function renderPair(chordLine, lyricLine, key) {
  const chords = parseChordsPos(chordLine);
  if (!chords.length) return null;
  const prefix = lyricLine.slice(0, chords[0].pos);
  const segs = chords.map((c, i) => ({
    chord: c.chord,
    lyric: lyricLine.slice(c.pos, chords[i + 1]?.pos)
  }));
  return (
    <div key={key} style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "0px" }}>
        {prefix ? (
          <span style={{ display: "inline-flex", flexDirection: "column", verticalAlign: "bottom" }}>
            <span style={{ fontSize: 11, visibility: "hidden", lineHeight: 1.6 }}>·</span>
            <span style={{ color: "#ddd", fontSize: 13, fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre" }}>{prefix}</span>
          </span>
        ) : null}
        {segs.map((seg, i) => (
          <span key={i} style={{ display: "inline-flex", flexDirection: "column", verticalAlign: "bottom" }}>
            <span style={{ lineHeight: 1.6, marginBottom: 2 }}><ChordTag chord={seg.chord} /></span>
            <span style={{ color: "#ddd", fontSize: 13, fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre" }}>
              {seg.lyric || " "}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function renderSheet(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\[.+\]$/.test(line.trim())) {
      out.push(
        <div key={i} style={{ marginTop: 22, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, letterSpacing: 3, color: "#f5c842",
            textTransform: "uppercase", background: "#1e1800",
            padding: "3px 10px", borderRadius: 4, fontFamily: "monospace"
          }}>{line.replace(/[\[\]]/g, "")}</span>
        </div>
      );
      i++; continue;
    }
    if (isChordLine(line) && i + 1 < lines.length && lines[i + 1].trim() && !isChordLine(lines[i + 1])) {
      out.push(renderPair(line, lines[i + 1], `p${i}`));
      i += 2; continue;
    }
    if (isChordLine(line)) {
      const tokens = line.trim().split(/\s+/);
      out.push(
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {tokens.map((t, j) => CHORD_RE.test(t)
            ? <ChordTag key={j} chord={t} />
            : <span key={j} style={{ color: "#555", fontFamily: "monospace" }}>{t}</span>
          )}
        </div>
      );
      i++; continue;
    }
    if (!line.trim()) { out.push(<div key={i} style={{ height: 12 }} />); i++; continue; }
    out.push(
      <div key={i} style={{ color: "#ccc", fontSize: 13, fontFamily: "monospace", lineHeight: 1.7, marginBottom: 2, whiteSpace: "pre-wrap" }}>{line}</div>
    );
    i++;
  }
  return out;
}

// ─────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState("perform");
  const [songs, setSongs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [cur, setCur] = useState(0);
  const [beat, setBeat] = useState(false);
  const [playing, setPlaying] = useState(false);

  const [fTitle, setFTitle] = useState("");
  const [fBpm, setFBpm] = useState("");
  const [fChords, setFChords] = useState("");
  const [editing, setEditing] = useState(null);

  const tickRef = useRef(null);
  const flashRef = useRef(null);
  const audioCtxRef = useRef(null);

  const playClick = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  };

  // Load from persistent storage on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("setlist-songs");
        const parsed = JSON.parse(result.value);
        setSongs(Array.isArray(parsed) && parsed.length > 0 ? parsed : SAMPLE);
      } catch {
        setSongs(SAMPLE);
      }
      setLoaded(true);
    })();
  }, []);

  // Save to persistent storage whenever songs change
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set("setlist-songs", JSON.stringify(songs));
      } catch {}
    })();
  }, [songs, loaded]);

  useEffect(() => {
    clearInterval(tickRef.current);
    clearTimeout(flashRef.current);
    setBeat(false);
    if (playing && songs[cur]) {
      const ms = (60 / songs[cur].bpm) * 1000;
      const fire = () => {
        setBeat(true);
        playClick();
        flashRef.current = setTimeout(() => setBeat(false), 130);
      };
      fire();
      tickRef.current = setInterval(fire, ms);
    }
    return () => { clearInterval(tickRef.current); clearTimeout(flashRef.current); };
  }, [playing, cur, songs]);

  const clearForm = () => { setFTitle(""); setFBpm(""); setFChords(""); setEditing(null); };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(songs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "setlist.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) {
          setSongs(data.map(s => ({ id: s.id || Date.now() + Math.random(), title: s.title || "Untitled", bpm: parseInt(s.bpm) || 120, chords: s.chords || "" })));
        }
      } catch { alert("File JSON tidak valid."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const save = () => {
    if (!fTitle.trim()) return;
    const bpm = parseInt(fBpm) || 120;
    const entry = { title: fTitle.trim(), bpm, chords: fChords };
    if (editing !== null) {
      setSongs(prev => prev.map((x, i) => i === editing ? { ...x, ...entry } : x));
    } else {
      setSongs(prev => [...prev, { id: Date.now(), ...entry }]);
    }
    clearForm();
  };

  const del = (i) => setSongs(prev => prev.filter((_, x) => x !== i));
  const swap = (i, j) => {
    setSongs(prev => {
      const s = [...prev]; [s[i], s[j]] = [s[j], s[i]]; return s;
    });
  };
  const startEdit = (i) => {
    setFTitle(songs[i].title);
    setFBpm(String(songs[i].bpm));
    setFChords(songs[i].chords);
    setEditing(i);
  };
  const goTo = (n) => { setCur(n); setPlaying(false); };
  const song = songs[cur];

  const fieldStyle = {
    background: "#111", border: "1px solid #222", borderRadius: 8,
    padding: "13px 14px", color: "#f0ece0", fontFamily: "monospace",
    fontSize: 15, width: "100%", display: "block"
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c0c", color: "#f0ece0", fontFamily: "monospace", overflowX: "hidden", fontSize: 14 }}>
      <style>{`
        * { box-sizing: border-box; margin:0; padding:0; }
        textarea { resize:vertical; outline:none; }
        input { outline:none; }
        button { cursor:pointer; font-family:monospace; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:#2a2a2a; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0c0c0c", zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f5c842" }}>🎹 SETLIST</div>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "#3a3a3a", marginTop: 1 }}>KEYS — BAND OUTING</div>
        </div>
        {mode === "edit"
          ? <button onClick={() => { setMode("perform"); setCur(0); setPlaying(false); }}
              style={{ background: "#f5c842", color: "#111", border: "none", borderRadius: 8, padding: "13px 20px", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>▶ PERFORM</button>
          : <button onClick={() => { setMode("edit"); setPlaying(false); }}
              style={{ background: "transparent", color: "#f5c842", border: "1px solid #f5c842", borderRadius: 8, padding: "13px 20px", fontSize: 13 }}>✏ EDIT</button>
        }
      </div>

      {/* ── EDIT ── */}
      {mode === "edit" && (
        <div style={{ padding: "20px 16px", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18, marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#f5c842", marginBottom: 14 }}>
              {editing !== null ? "✏ EDIT LAGU" : "+ TAMBAH LAGU"}
            </div>

            <input
              value={fTitle}
              onChange={e => setFTitle(e.target.value)}
              placeholder="Judul lagu"
              style={{ ...fieldStyle, marginBottom: 10 }}
            />
            <input
              value={fBpm}
              onChange={e => setFBpm(e.target.value)}
              placeholder="BPM (contoh: 95)"
              type="number"
              style={{ ...fieldStyle, marginBottom: 10 }}
            />
            <textarea
              value={fChords}
              onChange={e => setFChords(e.target.value)}
              placeholder={"[Verse]\nC              Am\nKetika ku bertemu dirimu\nF                  G\nRasanya dunia milik kita\n\n[Chorus]\nF         G          Am\nOh kamu yang selalu ada"}
              rows={10}
              style={{ ...fieldStyle, marginBottom: 12, lineHeight: 1.6 }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={save}
                style={{ background: "#f5c842", color: "#111", border: "none", borderRadius: 8, padding: "15px 0", fontWeight: 700, fontSize: 15, flex: 1 }}
              >
                {editing !== null ? "SIMPAN" : "TAMBAH"}
              </button>
              {editing !== null && (
                <button onClick={clearForm}
                  style={{ background: "transparent", color: "#555", border: "1px solid #2a2a2a", borderRadius: 8, padding: "15px 18px", fontSize: 13 }}>
                  BATAL
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#3a3a3a" }}>SETLIST — {songs.length} LAGU</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={exportJSON} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", borderRadius: 7, padding: "8px 14px", fontSize: 11, letterSpacing: 1 }}>
                ↓ EXPORT
              </button>
              <label style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", borderRadius: 7, padding: "8px 14px", fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
                ↑ IMPORT
                <input type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
              </label>
            </div>
          </div>

          {songs.length === 0 && (
            <div style={{ color: "#2a2a2a", textAlign: "center", padding: 48, fontSize: 14 }}>Belum ada lagu.</div>
          )}
          {songs.map((s, i) => (
            <div key={s.id} style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#2a2a2a", minWidth: 28, textAlign: "center" }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#f5c842", marginTop: 2 }}>{s.bpm} BPM</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => i > 0 && swap(i, i-1)} style={{ background: "#1e1e1e", border: "none", color: "#777", borderRadius: 6, width: 40, height: 40, fontSize: 14 }}>↑</button>
                <button onClick={() => i < songs.length-1 && swap(i, i+1)} style={{ background: "#1e1e1e", border: "none", color: "#777", borderRadius: 6, width: 40, height: 40, fontSize: 14 }}>↓</button>
                <button onClick={() => startEdit(i)} style={{ background: "#1e1e1e", border: "none", color: "#777", borderRadius: 6, width: 40, height: 40, fontSize: 14 }}>✏</button>
                <button onClick={() => del(i)} style={{ background: "transparent", border: "none", color: "#333", fontSize: 24, width: 36, height: 40 }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PERFORM ── */}
      {mode === "perform" && songs.length > 0 && (
        <div style={{ padding: "14px", maxWidth: 700, margin: "0 auto" }}>

          {/* Song pills */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 14, scrollbarWidth: "none" }}>
            {songs.map((s, i) => (
              <button key={s.id} onClick={() => goTo(i)} style={{
                background: i === cur ? "#f5c842" : "#181818",
                color: i === cur ? "#111" : "#555",
                border: "1px solid " + (i === cur ? "#f5c842" : "#222"),
                borderRadius: 20, padding: "9px 16px", fontSize: 12,
                fontWeight: i === cur ? 700 : 400, whiteSpace: "nowrap", flexShrink: 0
              }}>
                {i + 1}. {s.title.slice(0, 13)}{s.title.length > 13 ? "…" : ""}
              </button>
            ))}
          </div>

          {/* Title + BPM metronome */}
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#3a3a3a", marginBottom: 4 }}>LAGU {cur + 1}/{songs.length}</div>
              <div style={{ fontSize: 22, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{song?.title}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: beat ? "#f5c842" : "#1a1a1a",
                boxShadow: beat ? "0 0 22px 6px #f5c84266" : "none",
                border: "2px solid " + (beat ? "#f5c842" : "#252525"),
                transition: beat ? "none" : "background 0.15s, box-shadow 0.15s, border-color 0.15s"
              }} />
              <div style={{ fontSize: 26, fontWeight: 700, color: "#f5c842", lineHeight: 1 }}>{song?.bpm}</div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#3a3a3a" }}>BPM</div>
              <button onClick={() => setPlaying(p => !p)} style={{
                background: playing ? "#241c00" : "#1a1a1a",
                color: playing ? "#f5c842" : "#555",
                border: "1px solid " + (playing ? "#f5c84244" : "#252525"),
                borderRadius: 8, padding: "10px 14px", fontSize: 11, fontWeight: 700,
                letterSpacing: 1, minWidth: 70
              }}>
                {playing ? "⏹ STOP" : "▶ PULSE"}
              </button>
            </div>
          </div>

          {/* Chord sheet */}
          <div style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 14, padding: "18px 16px", marginBottom: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {renderSheet(song?.chords || "")}
          </div>

          {/* Prev / Next */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => goTo(Math.max(0, cur - 1))} disabled={cur === 0}
              style={{ background: cur === 0 ? "#0a0a0a" : "#141414", color: cur === 0 ? "#2a2a2a" : "#aaa", border: "1px solid #1e1e1e", borderRadius: 12, padding: "18px 16px", fontSize: 15, fontWeight: 700, textAlign: "left" }}>
              ← PREV
              {cur > 0 && <div style={{ fontSize: 11, fontWeight: 400, color: "#444", marginTop: 4 }}>{songs[cur - 1]?.title}</div>}
            </button>
            <button onClick={() => goTo(Math.min(songs.length - 1, cur + 1))} disabled={cur === songs.length - 1}
              style={{ background: cur === songs.length - 1 ? "#0a0a0a" : "#141414", color: cur === songs.length - 1 ? "#2a2a2a" : "#aaa", border: "1px solid #1e1e1e", borderRadius: 12, padding: "18px 16px", fontSize: 15, fontWeight: 700, textAlign: "right" }}>
              NEXT →
              {cur < songs.length - 1 && <div style={{ fontSize: 11, fontWeight: 400, color: "#444", marginTop: 4 }}>{songs[cur + 1]?.title}</div>}
            </button>
          </div>
        </div>
      )}

      {mode === "perform" && songs.length === 0 && (
        <div style={{ textAlign: "center", color: "#333", padding: 80 }}>
          Belum ada lagu.<br /><br />
          <button onClick={() => setMode("edit")} style={{ background: "#f5c842", color: "#111", border: "none", borderRadius: 8, padding: "15px 28px", fontWeight: 700 }}>TAMBAH LAGU</button>
        </div>
      )}
    </div>
  );
}
