// App.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './index.css';

/**
 * Production-ready/cleaned App.jsx
 * - Robust PGN -> games splitting inspired by ChessBase (headers grouped then moves)
 * - Tolerant PGN parser (headers, comments, variations, move numbers, SAN)
 * - Per-move FEN computed during parsing
 * - Fixed runtime errors (no undefined variable references)
 * - Debounced parsing, safe file/URL handling, non-blocking notifications
 *
 * NOTE: This executor is an approximate SAN executor (works for many PGNs).
 * For full legal-move checking/en-passant/check/king-move-history use a chess library
 * such as 'chess.js' before allowing move editing or engine evaluation in prod.
 */

/* -------------------------
   Helpers & Chess Utils
   ------------------------- */

export const PIECE_SYMBOLS = {
  K: '/pieces/wK.svg',
  Q: '/pieces/wQ.svg',
  R: '/pieces/wR.svg',
  B: '/pieces/wB.svg',
  N: '/pieces/wN.svg',
  P: '/pieces/wP.svg',
  k: '/pieces/bK.svg',
  q: '/pieces/bQ.svg',
  r: '/pieces/bR.svg',
  b: '/pieces/bB.svg',
  n: '/pieces/bN.svg',
  p: '/pieces/bP.svg'
};

const ChessUtils = {
  initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',

  fenToBoard(fen) {
    if (!fen) fen = ChessUtils.initialFen;
    const [position] = fen.split(' ');
    const rows = position.split('/');
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    rows.forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) c += parseInt(ch, 10);
        else { board[r][c] = ch; c++; }
      }
    });
    return board;
  },

  boardToFen(board, activeColor = 'w') {
    const rows = board.map(row => {
      let empty = 0, fen = '';
      row.forEach(cell => {
        if (cell == null) empty++;
        else {
          if (empty) { fen += String(empty); empty = 0; }
          fen += cell;
        }
      });
      if (empty) fen += String(empty);
      return fen;
    });
    return `${rows.join('/')} ${activeColor} KQkq - 0 1`;
  },

  executeCastlingForColor(board, isWhite, kingside) {
    const b = board.map(r => [...r]);
    if (isWhite) {
      const row = 7;
      if (kingside) { b[row][4] = null; b[row][6] = 'K'; b[row][7] = null; b[row][5] = 'R'; }
      else { b[row][4] = null; b[row][2] = 'K'; b[row][0] = null; b[row][3] = 'R'; }
    } else {
      const row = 0;
      if (kingside) { b[row][4] = null; b[row][6] = 'k'; b[row][7] = null; b[row][5] = 'r'; }
      else { b[row][4] = null; b[row][2] = 'k'; b[row][0] = null; b[row][3] = 'r'; }
    }
    return b;
  },

  // Simplified SAN executor; defensive against malformed SANs.
  executeMove(board, moveObj) {
    try {
      const b = board.map(r => [...r]);
      const san = (moveObj?.san || moveObj?.move || '').trim();
      const isWhite = !!moveObj?.isWhite;
      if (!san) return b;

      if (san === 'O-O' || san === '0-0') return ChessUtils.executeCastlingForColor(b, isWhite, true);
      if (san === 'O-O-O' || san === '0-0-0') return ChessUtils.executeCastlingForColor(b, isWhite, false);

      // SAN regex supporting promotions and basic disambiguation
      const sanRegex = /^([KQRNB])?([a-h])?([1-8])?(x)?([a-h])([1-8])(=([QRNB]))?[+#]?$/;
      const m = san.match(sanRegex);
      if (!m) return b; // unrecognized SAN (could be result token) -> noop

      const [, pieceType, sourceFile, sourceRank, captureSign, targetFile, targetRank, , promotion] = m;
      const basePiece = pieceType || 'P';
      const pieceChar = isWhite ? basePiece.toUpperCase() : basePiece.toLowerCase();
      const tCol = targetFile.charCodeAt(0) - 97;
      const tRow = 8 - parseInt(targetRank, 10);

      const potentials = [];

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (b[r][c] !== pieceChar) continue;
          // disambiguation
          if (sourceFile && sourceFile !== String.fromCharCode(97 + c)) continue;
          if (sourceRank && sourceRank !== String(8 - r)) continue;

          // Pawn special rules
          if (basePiece === 'P') {
            const dir = isWhite ? -1 : 1;
            const rowDiff = tRow - r;
            const colDiff = tCol - c;
            const targetPiece = b[tRow][tCol];
            const forwardEmpty = colDiff === 0 && targetPiece == null;
            const singlePush = colDiff === 0 && rowDiff === dir && forwardEmpty;
            const doublePush = colDiff === 0 &&
              ((isWhite && r === 6 && rowDiff === -2) || (!isWhite && r === 1 && rowDiff === 2)) &&
              b[r + dir][c] == null && forwardEmpty;
            const capture = Math.abs(colDiff) === 1 && rowDiff === dir && targetPiece != null;
            if (singlePush || doublePush || capture) potentials.push([r, c]);
          } else {
            potentials.push([r, c]);
          }
        }
      }

      if (potentials.length === 0) return b;

      // Filter by piece movement rules
      const finalCandidates = potentials.filter(([r, c]) => {
        const dr = tRow - r;
        const dc = tCol - c;
        const absDr = Math.abs(dr);
        const absDc = Math.abs(dc);
        const pu = basePiece.toUpperCase();

        if (pu === 'N') return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);
        if (pu === 'B') {
          if (absDr !== absDc) return false;
          const stepR = dr / absDr, stepC = dc / absDc;
          for (let rr = r + stepR, cc = c + stepC; rr !== tRow; rr += stepR, cc += stepC) if (b[rr][cc] != null) return false;
          return true;
        }
        if (pu === 'R') {
          if (dr !== 0 && dc !== 0) return false;
          const stepR = dr === 0 ? 0 : dr / absDr, stepC = dc === 0 ? 0 : dc / absDc;
          for (let rr = r + stepR, cc = c + stepC; rr !== tRow || cc !== tCol; rr += stepR, cc += stepC) if (b[rr][cc] != null) return false;
          return true;
        }
        if (pu === 'Q') {
          if (absDr === absDc) {
            const stepR = dr / absDr, stepC = dc / absDc;
            for (let rr = r + stepR, cc = c + stepC; rr !== tRow; rr += stepR, cc += stepC) if (b[rr][cc] != null) return false;
            return true;
          } else if (dr === 0 || dc === 0) {
            const stepR = dr === 0 ? 0 : dr / absDr, stepC = dc === 0 ? 0 : dc / absDc;
            for (let rr = r + stepR, cc = c + stepC; rr !== tRow || cc !== tCol; rr += stepR, cc += stepC) if (b[rr][cc] != null) return false;
            return true;
          }
          return false;
        }
        if (pu === 'K') return absDr <= 1 && absDc <= 1;
        return true;
      });

      const [srcR, srcC] = finalCandidates[0] || potentials[0];
      if (typeof srcR === 'undefined') return b;

      b[tRow][tCol] = b[srcR][srcC];
      b[srcR][srcC] = null;

      if (promotion) {
        const promo = isWhite ? promotion.toUpperCase() : promotion.toLowerCase();
        b[tRow][tCol] = promo;
      }
      return b;
    } catch (err) {
      // Never throw inside executor; return original board to keep UI stable.
      // eslint-disable-next-line no-console
      console.error('executeMove error:', err);
      return board;
    }
  },

  // Split PGN into games robustly:
  // - Find header blocks starting with '[' and collect until first non-header line,
  // - Move text follows. This attempts to mimic how ChessBase groups games.
  // Parse PGN string -> array of games with moves and per-move FENs.
  parsePGN(pgnText) {
    if (!pgnText || !pgnText.trim()) return [];

    // Normalize line endings and split games safely (like ChessBase does)
    const rawGames = pgnText
      .replace(/\r/g, '') // remove CR for Windows files
      .split(/\n{2,}(?=\[Event\s)/g) // only split when a new [Event starts
      .map(s => s.trim())
      .filter(s => s.length > 0 && (s.includes('[Event') || /\d+\./.test(s))); // ensure real content

    const result = [];

    for (const raw of rawGames) {
      try {
        const lines = raw.split('\n');
        const headers = {};
        let moveText = [];
        let inHeaders = true;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (inHeaders && trimmed.startsWith('[')) {
            const m = trimmed.match(/^\[(\w+)\s+"([^"]*)"\]$/);
            if (m) headers[m[1]] = m[2];
            continue;
          }
          inHeaders = false;
          moveText.push(trimmed);
        }

        const movesString = moveText.join(' ');
        // Tokenize: keep comments {..}, parentheses, move numbers, and SAN tokens.
        const rawTokens = movesString
          .split(/(\{[^}]*\}|\(|\)|\d+\.\.\.|\d+\.|\s+)/)
          .filter(t => t && t.trim());

        const moves = [];
        let comment = '';
        let currentVariation = null;
        let expectingBlack = false;
        let moveNumber = 1;

        for (let tok of rawTokens) {
          tok = tok.trim();
          if (!tok) continue;

          if (tok.startsWith('{') && tok.endsWith('}')) {
            comment = tok.slice(1, -1).trim();
            continue;
          }

          if (tok === '(') {
            currentVariation = [];
            continue;
          }
          if (tok === ')') {
            // attach variation to previous move if any
            const last = moves[moves.length - 1];
            if (last) {
              last.variations = last.variations || [];
              last.variations.push(currentVariation);
            }
            currentVariation = null;
            continue;
          }

          // move-number tokens: "12." or "12..."
          const numMatch = tok.match(/^(\d+)(\.\.\.)?\.?$/);
          if (numMatch) {
            const num = parseInt(numMatch[1], 10);
            if (!Number.isNaN(num)) moveNumber = num;
            expectingBlack = !!numMatch[2]; // if '12...' then black next
            continue;
          }

          // SAN token (we accept castling and common SAN)
          const sanRegex = /^[KQRNB]?[a-h]?[1-8]?(x)?[a-h][1-8](=[QRNB])?[+#]?$|^O-O(-O)?$|^0-0(-0)?$/;
          if (sanRegex.test(tok)) {
            const isWhite = !expectingBlack;
            const moveObj = {
              number: isWhite ? moveNumber : moveNumber + 0.5,
              move: tok,
              san: tok,
              isWhite,
              comment: comment || ''
            };

            if (currentVariation) currentVariation.push(moveObj);
            else moves.push(moveObj);

            // flip expectingBlack and bump moveNumber after black
            expectingBlack = !expectingBlack;
            if (!isWhite) moveNumber++;

            comment = '';
            continue;
          }

          // ignore result tokens like "1-0", "1/2-1/2", and unknown tokens
        }

        // Determine starting FEN: use [FEN "..."] header if available
        let startFen = ChessUtils.initialFen;
        if (headers.FEN && (headers.SetUp === '1' || headers.SetUp === 'true')) {
          startFen = headers.FEN.trim();
        }

        let board = ChessUtils.fenToBoard(startFen);
        const movesWithFen = moves.map(m => {
          board = ChessUtils.executeMove(board, m);
          const activeColor = m.isWhite ? 'b' : 'w';
          const fenAfter = ChessUtils.boardToFen(board, activeColor);
          return { ...m, fenAfter };
        });

        const initialFen = startFen;
        if (movesWithFen.length) {
          result.push({ headers, moves: movesWithFen, initialFen });
        } else if (Object.keys(headers).length) {
          // header-only game
          result.push({ headers, moves: [], initialFen });
        }
      } catch (err) {
        console.error('PGN parse error for chunk:', err);
      }
    }

    return result;
  },

  getBoardAfterMoves(moves, moveIndex) {
    let board = ChessUtils.fenToBoard(ChessUtils.initialFen);
    for (let i = 0; i <= moveIndex; i++) {
      if (moves[i]) board = ChessUtils.executeMove(board, moves[i]);
    }
    return board;
  }
};

/* -------------------------
   React App
   ------------------------- */

export default function App() {
  const [pgnText, setPgnText] = useState('');
  const [games, setGames] = useState([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [bookmarks, setBookmarks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [commentExpanded, setCommentExpanded] = useState(false); // Added missing state

  const fileInputRef = useRef(null);
  const parseTimerRef = useRef(null);

  // Debounced parse to avoid heavy recompute while typing
  const scheduleParse = useCallback((text) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => {
      try {
        const parsed = ChessUtils.parsePGN(text);
        setGames(parsed);
        setCurrentGameIndex(0);
        setCurrentMoveIndex(-1);
        setCommentExpanded(false); // Reset comment expansion when parsing new game
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error parsing PGN:', err);
      }
    }, 250);
  }, []);

  // load sample game helper (used on mount and UI "Sample" action)
  const loadSampleGame = useCallback(() => {
    const samplePGN = `[Event "F/S Return Match"]
[Site "Belgrade, Serbia Yugoslavia|JUG"]
[Date "1992.11.04"]
[Round "29"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 {This opening is called the Ruy Lopez.} 4. Ba4 Nf6
5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7
11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6
16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nbd2 Nxd6
21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7 25. Nxf7 Rxe1+
26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6 30. a3 Kd6
31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6
36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5
41. Ra6 Nf2 42. g4 Bd3 43. Re6 1/2-1/2`;
    setPgnText(samplePGN);
    scheduleParse(samplePGN);
  }, [scheduleParse]);

  useEffect(() => {
    loadSampleGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When pgnText changes (user paste/typing/file), schedule parse
  useEffect(() => {
    if (!pgnText) {
      setGames([]);
      setCurrentGameIndex(0);
      setCurrentMoveIndex(-1);
      setCommentExpanded(false);
      return;
    }
    scheduleParse(pgnText);
  }, [pgnText, scheduleParse]);

  // derived values
  const currentGame = useMemo(() => games[currentGameIndex] || null, [games, currentGameIndex]);
  const currentMove = useMemo(() => {
    if (!currentGame) return null;
    if (currentMoveIndex === -1) return null;
    return currentGame.moves[currentMoveIndex] || null;
  }, [currentGame, currentMoveIndex]);

  const board = useMemo(() => {
    if (!currentGame) return ChessUtils.fenToBoard(ChessUtils.initialFen);
    if (currentMoveIndex === -1) return ChessUtils.fenToBoard(currentGame.initialFen || ChessUtils.initialFen);
    const mv = currentGame.moves[currentMoveIndex];
    if (mv && mv.fenAfter) return ChessUtils.fenToBoard(mv.fenAfter);
    return ChessUtils.getBoardAfterMoves(currentGame.moves, currentMoveIndex);
  }, [currentGame, currentMoveIndex]);

  /* File / drag/drop / paste */
  const handleFileUpload = useCallback((ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setPgnText(text);
      scheduleParse(text);
    };
    reader.readAsText(file);
  }, [scheduleParse]);

  const handleDrop = useCallback((ev) => {
    ev.preventDefault();
    setIsDragging(false);
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.pgn') && !file.name.endsWith('.txt')) {
      setNotice('Unsupported file (expect .pgn or .txt)');
      setTimeout(() => setNotice(''), 2000);
      return;
    }
    const r = new FileReader();
    r.onload = (e) => { const text = e.target.result; setPgnText(text); scheduleParse(text); };
    r.readAsText(file);
  }, [scheduleParse]);

  const handleDragOver = useCallback((ev) => { ev.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((ev) => { ev.preventDefault(); setIsDragging(false); }, []);

  const handlePaste = useCallback((ev) => {
    const pasted = ev.clipboardData?.getData('text');
    if (!pasted) return;
    if (pasted.includes('[Event ') || /1\.\s/.test(pasted)) {
      setPgnText(pasted);
      scheduleParse(pasted);
    }
  }, [scheduleParse]);

  const handleURLImport = useCallback(async () => {
    const url = window.prompt('Enter PGN URL:');
    if (!url) return;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Network');
      const text = await resp.text();
      setPgnText(text);
      scheduleParse(text);
    } catch (err) {
      setNotice('Failed to load PGN from URL');
      setTimeout(() => setNotice(''), 2000);
    }
  }, [scheduleParse]);

  /* Navigation */
  const navigateMove = useCallback((delta) => {
    if (!currentGame) return;
    const max = currentGame.moves.length - 1;
    let next = currentMoveIndex + delta;
    if (next < -1) next = -1;
    if (next > max) next = max;
    setCurrentMoveIndex(next);
    setCommentExpanded(false); // Reset comment expansion when navigating
  }, [currentGame, currentMoveIndex]);

  const goToMove = useCallback((idx) => {
    if (!currentGame) { setCurrentMoveIndex(-1); return; }
    if (idx < -1) idx = -1;
    if (idx >= currentGame.moves.length) idx = currentGame.moves.length - 1;
    setCurrentMoveIndex(idx);
    setCommentExpanded(false); // Reset comment expansion when going to specific move
  }, [currentGame]);

  const goToStart = useCallback(() => {
    setCurrentMoveIndex(-1);
    setCommentExpanded(false);
  }, []);

  const goToEnd = useCallback(() => {
    if (!currentGame) return;
    setCurrentMoveIndex(currentGame.moves.length - 1);
    setCommentExpanded(false);
  }, [currentGame]);

  /* Bookmarks */
  const addBookmark = useCallback(() => {
    if (!currentGame || currentMoveIndex < 0) return;
    const mv = currentGame.moves[currentMoveIndex];
    setBookmarks(prev => [...prev, {
      gameIndex: currentGameIndex,
      moveIndex: currentMoveIndex,
      desc: `Move ${Math.floor(mv.number)}${mv.number % 1 === 0 ? '' : '...'} ${mv.move}`
    }]);
    setNotice('Bookmark added');
    setTimeout(() => setNotice(''), 1200);
  }, [currentGame, currentMoveIndex, currentGameIndex]);

  /* Clipboard helpers */
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied to clipboard');
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setNotice('Copied to clipboard'); } catch { setNotice('Failed to copy'); }
      document.body.removeChild(ta);
    }
    setTimeout(() => setNotice(''), 1500);
  }, []);

  const exportFEN = useCallback(() => {
    let active = 'w';
    if (!currentGame) active = 'w';
    else {
      if (currentMoveIndex === -1) active = 'w';
      else { const last = currentGame.moves[currentMoveIndex]; active = last && last.isWhite ? 'b' : 'w'; }
    }
    const fen = ChessUtils.boardToFen(board, active);
    copyToClipboard(fen);
  }, [board, currentGame, currentMoveIndex, copyToClipboard]);

  const exportPGN = useCallback(() => {
    if (!currentGame) { setNotice('No game to export'); setTimeout(() => setNotice(''), 1200); return; }
    let pgn = '';
    Object.entries(currentGame.headers || {}).forEach(([k, v]) => { pgn += `[${k} "${v}"]\n`; });
    pgn += '\n';
    let fullmove = 1;
    currentGame.moves.forEach(m => {
      if (m.isWhite) pgn += `${fullmove}. `;
      pgn += `${m.move} `;
      if (m.comment) pgn += `{${m.comment}} `;
      if (!m.isWhite) fullmove++;
    });
    copyToClipboard(pgn);
  }, [currentGame, copyToClipboard]);

  /* Search */
  const searchMoves = useCallback(() => {
    if (!searchTerm || !currentGame) return;
    const q = searchTerm.toLowerCase();
    const idx = currentGame.moves.findIndex(m => {
      if (!m) return false;
      if ((m.move || '').toLowerCase().includes(q)) return true;
      if ((m.comment || '').toLowerCase().includes(q)) return true;
      return false;
    });
    if (idx !== -1) {
      setCurrentMoveIndex(idx);
      setCommentExpanded(false);
    } else { 
      setNotice('Move not found'); 
      setTimeout(() => setNotice(''), 1200); 
    }
  }, [searchTerm, currentGame]);

  /* Keyboard */
  useEffect(() => {
    const handler = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); navigateMove(-1); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); navigateMove(1); }
      if (ev.key === 'Home') { ev.preventDefault(); goToStart(); }
      if (ev.key === 'End') { ev.preventDefault(); goToEnd(); }
      if (ev.key === 'b' && ev.ctrlKey) { ev.preventDefault(); addBookmark(); }
      if (ev.key === 'f' && ev.ctrlKey) { ev.preventDefault(); document.getElementById('search-input')?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateMove, goToStart, goToEnd, addBookmark]);

  /* UI */
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-slate-200 font-sans select-none"
      onPaste={handlePaste}
    >
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-slate-950/60 backdrop-blur-md shadow-lg border-b border-slate-700 gap-3">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-blue-400 flex items-center gap-2">
          ♞ Chess PGN Viewer
        </h1>
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg shadow text-xs sm:text-sm font-medium transition-colors"
          >
            📁 Upload PGN
          </button>
          <button
            onClick={handleURLImport}
            className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg shadow text-xs sm:text-sm transition-colors"
          >
            🌐 Import URL
          </button>
          <button
            onClick={loadSampleGame}
            className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow text-xs sm:text-sm transition-colors"
          >
            🎯 Sample
          </button>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          accept=".pgn"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
      </header>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 p-4 sm:p-6">
        {/* LEFT PANEL - Moves & Search */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          {/* PGN Input */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-3 h-48 sm:h-56 transition-all ${
              isDragging ? 'border-blue-400 bg-slate-800/60 ring-2 ring-blue-400' : 'border-slate-700 bg-slate-800/40'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <textarea
              value={pgnText}
              onChange={(e) => setPgnText(e.target.value)}
              placeholder="Paste PGN here or drag a .pgn file"
              rows={8}
              className="w-full h-full bg-transparent text-slate-100 text-sm resize-none outline-none font-mono placeholder-slate-500"
            />
            <div className="absolute bottom-2 right-3 text-xs text-slate-500 italic">
              {isDragging ? 'Drop PGN file' : 'Paste or drag file'}
            </div>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <input
              id="search-input"
              type="text"
              placeholder="Search moves or comments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchMoves()}
              className="flex-grow rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <button
              onClick={searchMoves}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors min-w-12"
            >
              🔍
            </button>
          </div>

          {/* Moves List */}
          {currentGame && (
            <div className="bg-slate-800/60 rounded-xl p-3 shadow-inner border border-slate-700">
              <h3 className="text-blue-300 font-semibold mb-2 text-sm sm:text-base">
                Moves <span className="text-slate-400 text-xs">({currentMoveIndex + 1}/{currentGame.moves.length})</span>
              </h3>
              <div className="max-h-48 sm:max-h-64 overflow-y-auto space-y-1 pr-1">
                {currentGame.moves.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => goToMove(i)}
                    className={`w-full text-left px-2 py-1 rounded text-xs sm:text-sm font-mono transition-all ${
                      i === currentMoveIndex
                        ? 'bg-blue-600 text-white shadow transform scale-[1.02]'
                        : 'hover:bg-slate-700/60 text-slate-300'
                    }`}
                  >
                    {m.isWhite ? `${Math.floor(m.number)}.` : '...'} {m.move}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CENTER PANEL - Chessboard */}
        <div className="lg:col-span-8 xl:col-span-6 flex flex-col items-center space-y-4 sm:space-y-6">
          {/* Game Info */}
          {currentGame && (
            <div className="text-center space-y-1 bg-slate-800/40 rounded-xl p-3 w-full border border-slate-700">
              <h2 className="text-lg sm:text-xl font-bold text-blue-400 truncate">
                {currentGame.headers?.Event || 'Untitled Game'}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 truncate">
                {currentGame.headers?.White || 'Unknown'} vs {currentGame.headers?.Black || 'Unknown'}
              </p>
              <p className="text-xs sm:text-sm text-slate-400">
                {currentGame.headers?.Result} • {currentGame.headers?.Date}
              </p>
              {currentMove && (
                <p className="text-slate-200 text-sm sm:text-base font-semibold mt-1">
                  Move: {Math.floor(currentMove.number)}{currentMove.number % 1 === 0 ? '' : '...'} {currentMove.move}
                </p>
              )}
            </div>
          )}

          {/* CHESSBOARD - Optimized Size */}
          <div className="relative">
            <div className="grid grid-cols-8 border-2 sm:border-4 border-slate-600 rounded-lg sm:rounded-xl shadow-xl overflow-hidden">
              {board.map((row, rIdx) =>
                row.map((p, cIdx) => {
                  const isLight = (rIdx + cIdx) % 2 === 0;
                  const fileLabel = String.fromCharCode(97 + cIdx);
                  const rankLabel = 8 - rIdx;
                  
                  return (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      className={`relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 ${
                        isLight ? 'bg-amber-100' : 'bg-slate-600'
                      } transition-colors`}
                    >
                      {/* Coordinate labels */}
                      {rIdx === 7 && (
                        <span className="absolute bottom-0.5 right-0.5 text-[10px] sm:text-xs font-semibold text-slate-700">
                          {fileLabel}
                        </span>
                      )}
                      {cIdx === 0 && (
                        <span className="absolute top-0.5 left-0.5 text-[10px] sm:text-xs font-semibold text-slate-700">
                          {rankLabel}
                        </span>
                      )}
                      
                      {p && (
                        <img
                          src={PIECE_SYMBOLS[p]}
                          alt={p}
                          className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 drop-shadow select-none"
                          draggable="false"
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* NAVIGATION */}
          <div className="flex gap-2 sm:gap-3 bg-slate-800/60 rounded-xl p-3 border border-slate-700">
            <button onClick={goToStart} disabled={currentMoveIndex === -1} className="nav-btn text-lg sm:text-xl p-2">⏮️</button>
            <button onClick={() => navigateMove(-1)} disabled={currentMoveIndex === -1} className="nav-btn text-lg sm:text-xl p-2">◀️</button>
            <button
              onClick={() => navigateMove(1)}
              disabled={!currentGame || currentMoveIndex >= (currentGame.moves.length - 1)}
              className="nav-btn text-lg sm:text-xl p-2"
            >
              ▶️
            </button>
            <button onClick={goToEnd} disabled={!currentGame} className="nav-btn text-lg sm:text-xl p-2">⏭️</button>
          </div>
        </div>

        {/* RIGHT PANEL - Tools, Comments & Info */}
        <div className="lg:col-span-12 xl:col-span-3 space-y-4">
          {/* Move Comment with Show More */}
          {currentMove?.comment && (
            <div className="bg-slate-800/60 rounded-xl p-4 shadow-lg border border-blue-500/30">
              <h3 className="text-blue-300 font-semibold mb-2 text-sm sm:text-base flex items-center gap-2">
                📝 Move {Math.floor(currentMove.number)}{currentMove.number % 1 === 0 ? '' : '...'} {currentMove.move}
              </h3>
              <div className="bg-slate-700/40 rounded-lg p-3 border border-slate-600">
                <p className={`text-slate-200 text-sm leading-relaxed ${
                  !commentExpanded && currentMove.comment.length > 150 ? 'line-clamp-3' : ''
                }`}>
                  {currentMove.comment}
                </p>
                {currentMove.comment.length > 150 && (
                  <button
                    onClick={() => setCommentExpanded(!commentExpanded)}
                    className="text-blue-400 hover:text-blue-300 text-xs font-medium mt-2 transition-colors"
                  >
                    {commentExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tools */}
          <div className="bg-slate-800/60 p-4 rounded-xl shadow-lg border border-slate-700">
            <h3 className="text-blue-300 font-semibold mb-3 text-sm sm:text-base">Analysis Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addBookmark} disabled={!currentMove} className="tool-btn text-xs py-2 flex items-center justify-center gap-1">
                <span>📑</span>
                <span>Bookmark</span>
              </button>
              <button onClick={exportFEN} className="tool-btn text-xs py-2 flex items-center justify-center gap-1">
                <span>📋</span>
                <span>Copy FEN</span>
              </button>
              <button onClick={exportPGN} disabled={!currentGame} className="tool-btn text-xs py-2 flex items-center justify-center gap-1 col-span-2">
                <span>📄</span>
                <span>Export PGN</span>
              </button>
            </div>
          </div>

          {/* Bookmarks */}
          {bookmarks.length > 0 && (
            <div className="bg-slate-800/60 p-4 rounded-xl shadow-inner border border-slate-700">
              <h3 className="text-blue-300 font-semibold mb-2 text-sm sm:text-base">Saved Positions</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {bookmarks.map((bm, i) => (
                  <div key={i} className="flex justify-between items-center text-xs py-1 px-2 bg-slate-700/40 rounded hover:bg-slate-700/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-slate-200 font-medium">{bm.desc}</p>
                      <p className="text-slate-400">Move {bm.moveIndex + 1}</p>
                    </div>
                    <button
                      onClick={() => {
                        setCurrentGameIndex(bm.gameIndex);
                        setCurrentMoveIndex(bm.moveIndex);
                        setCommentExpanded(false);
                      }}
                      className="text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded transition-colors bg-slate-600/50 hover:bg-slate-600/70 text-xs"
                    >
                      Go
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts */}
          <div className="text-xs text-slate-400 bg-slate-800/40 rounded-xl p-3 border border-slate-700">
            <h3 className="text-blue-300 font-semibold mb-2 text-sm sm:text-base">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <div className="flex items-center gap-1">
                <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">←</kbd>
                <span>Previous</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">→</kbd>
                <span>Next</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">Home</kbd>
                <span>Start</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">End</kbd>
                <span>End</span>
              </div>
            </div>
          </div>

          {notice && (
            <div className="bg-blue-600 text-white text-center p-2 rounded-lg shadow animate-pulse border border-blue-400 text-xs sm:text-sm">
              {notice}
            </div>
          )}
        </div>
      </div>

      {/* MODERN GAME LIST */}
{games.length > 1 && (
  <div className="p-6 bg-slate-900/95 border-t border-slate-600/50 backdrop-blur-sm">
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
          <h2 className="text-2xl font-bold text-white">
            Game Collection
            <span className="text-slate-400 font-normal ml-2">({games.length})</span>
          </h2>
        </div>
        <div className="text-sm text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full">
          Viewing <span className="text-blue-400 font-semibold">{currentGameIndex + 1}</span> of {games.length}
        </div>
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {games.map((g, idx) => {
          const white = g.headers.White || 'Unknown';
          const black = g.headers.Black || 'Unknown';
          const event = g.headers.Event || `Game ${idx + 1}`;
          const result = g.headers.Result || '*';
          const date = g.headers.Date ? new Date(g.headers.Date).getFullYear() : '';
          const whiteElo = g.headers.WhiteElo || '';
          const blackElo = g.headers.BlackElo || '';

          // Get first few moves for preview
          const previewMoves = g.moves.slice(0, 4).map(m => m.move).join(' ');

          return (
            <div
              key={idx}
              onClick={() => {
                setCurrentGameIndex(idx);
                setCurrentMoveIndex(-1);
                setCommentExpanded(false);
              }}
              className={`group cursor-pointer rounded-2xl border transition-all duration-300 overflow-hidden ${
                idx === currentGameIndex
                  ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/20 border-blue-500/50 ring-2 ring-blue-500/30 transform scale-[1.02]'
                  : 'bg-slate-800/40 border-slate-700/50 hover:border-blue-400/50 hover:bg-slate-800/60 hover:transform hover:scale-[1.01]'
              }`}
            >
              {/* Header with result indicator */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-white text-sm leading-tight group-hover:text-blue-300 transition-colors line-clamp-2">
                    {event}
                  </h3>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    result === '1-0' ? 'bg-green-500/20 text-green-300' :
                    result === '0-1' ? 'bg-red-500/20 text-red-300' :
                    result === '1/2-1/2' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-slate-500/20 text-slate-300'
                  }`}>
                    {result === '1-0' ? '1-0' : result === '0-1' ? '0-1' : result === '1/2-1/2' ? '½' : '*'}
                  </div>
                </div>
                
                {/* Date */}
                {date && (
                  <div className="text-xs text-slate-400 font-medium">
                    {date}
                  </div>
                )}
              </div>

              {/* Players */}
              <div className="p-4 space-y-3">
                {/* White Player */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
                    W
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {white.split(' ').slice(-1)[0]} {/* Show only last name */}
                    </div>
                    {whiteElo && (
                      <div className="text-xs text-slate-400">
                        {whiteElo}
                      </div>
                    )}
                  </div>
                </div>

                {/* VS Separator */}
                <div className="flex items-center gap-3">
                  <div className="w-8 flex justify-center">
                    <div className="w-4 h-px bg-slate-600"></div>
                  </div>
                  <div className="text-xs text-slate-500 font-medium">VS</div>
                  <div className="flex-1 h-px bg-slate-600"></div>
                </div>

                {/* Black Player */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                    B
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {black.split(' ').slice(-1)[0]} {/* Show only last name */}
                    </div>
                    {blackElo && (
                      <div className="text-xs text-slate-400">
                        {blackElo}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview & Stats */}
              <div className="p-4 bg-slate-900/50 border-t border-slate-700/30">
                {/* Move Preview */}
                {previewMoves && (
                  <div className="mb-3">
                    <div className="text-xs text-slate-400 font-medium mb-1">Opening</div>
                    <div className="text-sm text-slate-300 font-mono line-clamp-1">
                      {previewMoves}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-slate-400">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                      </svg>
                      <span>{g.moves?.length || 0} moves</span>
                    </div>
                  </div>
                  
                  <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    idx === currentGameIndex 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-slate-700 text-slate-300 group-hover:bg-blue-500 group-hover:text-white transition-colors'
                  }`}>
                    {idx === currentGameIndex ? 'Viewing' : 'View'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats Footer */}
      <div className="mt-6 pt-6 border-t border-slate-700/30">
        <div className="flex items-center justify-center gap-6 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500/20 rounded border border-green-500/30"></div>
            <span>White Wins: {games.filter(g => g.headers.Result === '1-0').length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500/20 rounded border border-red-500/30"></div>
            <span>Black Wins: {games.filter(g => g.headers.Result === '0-1').length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500/20 rounded border border-yellow-500/30"></div>
            <span>Draws: {games.filter(g => g.headers.Result === '1/2-1/2').length}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}