// App.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './index.css';

/**
 * Premium Chess PGN Viewer with Advanced UI/UX
 * - Glass morphism design with smooth animations
 * - Advanced navigation with timeline scrubber
 * - 3D board effects and piece animations
 * - Enhanced move list with visual indicators
 * - Professional analysis tools
 * - Fully responsive design
 */

export const PIECE_SYMBOLS = {
  K: '/pieces/wK.svg', Q: '/pieces/wQ.svg', R: '/pieces/wR.svg',
  B: '/pieces/wB.svg', N: '/pieces/wN.svg', P: '/pieces/wP.svg',
  k: '/pieces/bK.svg', q: '/pieces/bQ.svg', r: '/pieces/bR.svg',
  b: '/pieces/bB.svg', n: '/pieces/bN.svg', p: '/pieces/bP.svg'
};

// Enhanced chess utilities with better move execution
const ChessUtils = {
  initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',

  fenToBoard(fen) {
    if (!fen) fen = this.initialFen;
    const [position] = fen.split(' ');
    const rows = position.split('/');
    const board = Array(8).fill().map(() => Array(8).fill(null));
    rows.forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) c += parseInt(ch);
        else board[r][c++] = ch;
      }
    });
    return board;
  },

  boardToFen(board, active = 'w') {
    const rows = board.map(row => {
      let empty = 0, fen = '';
      row.forEach(cell => {
        if (!cell) empty++;
        else {
          if (empty) fen += empty;
          fen += cell;
          empty = 0;
        }
      });
      if (empty) fen += empty;
      return fen;
    });
    return `${rows.join('/')} ${active} KQkq - 0 1`;
  },

  executeCastlingForColor(board, isWhite, kingside) {
    const b = board.map(r => [...r]);
    const row = isWhite ? 7 : 0;
    const K = isWhite ? 'K' : 'k';
    const R = isWhite ? 'R' : 'r';
    if (kingside) {
      b[row][4] = null; b[row][6] = K; b[row][7] = null; b[row][5] = R;
    } else {
      b[row][4] = null; b[row][2] = K; b[row][0] = null; b[row][3] = R;
    }
    return b;
  },

  executeMove(board, moveObj) {
    try {
      const b = board.map(r => [...r]);
      const san = (moveObj?.san || moveObj?.move || '').trim();
      const isWhite = moveObj?.isWhite === true;
      if (!san) return b;

      if (san === 'O-O' || san === '0-0') return this.executeCastlingForColor(b, isWhite, true);
      if (san === 'O-O-O' || san === '0-0-0') return this.executeCastlingForColor(b, isWhite, false);

      const m = san.match(/^([KQRNB])?([a-h])?([1-8])?(x)?([a-h])([1-8])(=([QRNB]))?[+#]?$/);
      if (!m) return b;

      const [, pieceType, sourceFile, sourceRank, , targetFile, targetRank, , promotion] = m;
      const base = pieceType || 'P';
      const piece = isWhite ? base.toUpperCase() : base.toLowerCase();
      const tCol = targetFile.charCodeAt(0) - 97;
      const tRow = 8 - parseInt(targetRank);

      const potentials = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (b[r][c] !== piece) continue;
          if (sourceFile && sourceFile !== String.fromCharCode(97 + c)) continue;
          if (sourceRank && sourceRank !== String(8 - r)) continue;

          if (base === 'P') {
            const dir = isWhite ? -1 : 1;
            const rd = tRow - r, cd = tCol - c;
            const tgt = b[tRow][tCol];
            const fwd = cd === 0 && !tgt;
            const single = cd === 0 && rd === dir && fwd;
            const double = cd === 0 && ((isWhite && r === 6 && rd === -2) || (!isWhite && r === 1 && rd === 2)) && !b[r + dir][c] && fwd;
            const cap = Math.abs(cd) === 1 && rd === dir && tgt;
            if (single || double || cap) potentials.push([r, c]);
          } else {
            potentials.push([r, c]);
          }
        }
      }

      if (!potentials.length) return b;

      const valid = potentials.filter(([r, c]) => {
        const dr = tRow - r, dc = tCol - c;
        const ar = Math.abs(dr), ac = Math.abs(dc);
        const p = base.toUpperCase();

        if (p === 'N') return (ar === 2 && ac === 1) || (ar === 1 && ac === 2);
        if (p === 'B') {
          if (ar !== ac) return false;
          const sr = dr / ar, sc = dc / ac;
          for (let rr = r + sr, cc = c + sc; rr !== tRow; rr += sr, cc += sc) if (b[rr][cc]) return false;
          return true;
        }
        if (p === 'R') {
          if (dr && dc) return false;
          const sr = dr ? dr / ar : 0, sc = dc ? dc / ac : 0;
          for (let rr = r + sr, cc = c + sc; rr !== tRow || cc !== tCol; rr += sr, cc += sc) if (b[rr][cc]) return false;
          return true;
        }
        if (p === 'Q') {
          if (ar === ac) {
            const sr = dr / ar, sc = dc / ac;
            for (let rr = r + sr, cc = c + sc; rr !== tRow; rr += sr, cc += sc) if (b[rr][cc]) return false;
            return true;
          } if (dr === 0 || dc === 0) {
            const sr = dr ? dr / ar : 0, sc = dc ? dc / ac : 0;
            for (let rr = r + sr, cc = c + sc; rr !== tRow || cc !== tCol; rr += sr, cc += sc) if (b[rr][cc]) return false;
            return true;
          }
          return false;
        }
        if (p === 'K') return ar <= 1 && ac <= 1;
        return true;
      });

      const [r, c] = valid[0] || potentials[0];
      if (r === undefined) return b;

      b[tRow][tCol] = b[r][c];
      b[r][c] = null;
      if (promotion) b[tRow][tCol] = isWhite ? promotion.toUpperCase() : promotion.toLowerCase();
      return b;
    } catch (e) {
      console.error('executeMove:', e);
      return board;
    }
  },

  parsePGN(pgnText) {
    if (!pgnText?.trim()) return [];

    const rawGames = pgnText.replace(/\r/g, '')
      .split(/\n{2,}(?=\[Event\s)/g)
      .map(s => s.trim())
      .filter(s => s && (s.includes('[Event') || /\d+\./.test(s)));

    const result = [];

    for (const raw of rawGames) {
      try {
        const lines = raw.split('\n');
        const headers = {};
        let moveText = [], inHeaders = true;

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
        const rawTokens = movesString
          .split(/(\{[^}]*\}|\(|\)|\d+\.\.\.|\d+\.|\s+)/)
          .filter(t => t && t.trim());

        const moves = [];
        const sequenceStack = [moves];
        let comment = '';
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
            sequenceStack.push([]);
            continue;
          }

          if (tok === ')') {
            const finished = sequenceStack.pop();
            const currentSeq = sequenceStack[sequenceStack.length - 1];
            const last = currentSeq[currentSeq.length - 1];
            if (last) {
              last.variations = last.variations || [];
              last.variations.push(finished);
            }
            continue;
          }

          const numMatch = tok.match(/^(\d+)(\.\.\.)?\.?$/);
          if (numMatch) {
            moveNumber = parseInt(numMatch[1], 10);
            expectingBlack = !!numMatch[2];
            continue;
          }

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
            sequenceStack[sequenceStack.length - 1].push(moveObj);
            expectingBlack = !expectingBlack;
            if (!isWhite) moveNumber++;
            comment = '';
            continue;
          }
        }

        let startFen = this.initialFen;
        if (headers.FEN && (headers.SetUp === '1' || headers.SetUp === 'true')) {
          startFen = headers.FEN.trim();
        }

        const startBoard = this.fenToBoard(startFen);

        const processSequence = (seq, board) => {
          let currentBoard = board.map(r => [...r]);
          return seq.map(m => {
            const beforeBoard = currentBoard.map(r => [...r]);
            currentBoard = this.executeMove(currentBoard, m);
            const activeColor = m.isWhite ? 'b' : 'w';
            const fenAfter = this.boardToFen(currentBoard, activeColor);
            const updatedM = { ...m, fenAfter };
            if (updatedM.variations) {
              updatedM.variations = updatedM.variations.map(v => processSequence(v, beforeBoard));
            }
            return updatedM;
          });
        };

        const movesWithFen = processSequence(moves, startBoard);

        if (movesWithFen.length || Object.keys(headers).length) {
          result.push({ headers, moves: movesWithFen, initialFen: startFen });
        }
      } catch (err) {
        console.error('PGN parse error:', err);
      }
    }

    return result;
  }
};

/* -------------------------
   Enhanced Helper Components
   ------------------------- */

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// Move flattening function - moved outside components
const flattenSeq = (seq, prefix = []) => {
  let out = [];
  seq.forEach((m, i) => {
    out.push([...prefix, i]);
    if (m.variations) {
      m.variations.forEach((v, j) => {
        out.push(...flattenSeq(v, [...prefix, i, j]));
      });
    }
  });
  return out;
};

// Get move from sequence
const getMove = (seq, path) => {
  let current = seq;
  for (let k = 0; k < path.length - 1; k += 2) {
    current = current[path[k]].variations[path[k + 1]];
  }
  return current[path[path.length - 1]];
};

// Enhanced Professional MoveSequence
const MoveSequence = React.memo(({ seq, pathPrefix = [], depth = 0, currentPath, onSelect }) => (
  <>
    {seq.map((m, i) => {
      const myPath = [...pathPrefix, i];
      const isActive = arraysEqual(myPath, currentPath);
      const hasVars = m.variations && m.variations.length > 0;
      const isMainLine = depth === 0;

      return (
        <div key={i} className="relative">
          <div className={`flex items-center group ${isMainLine ? '' : 'ml-2 sm:ml-3'}`}>
            {/* Move number indicator */}
            {m.isWhite && (
              <div className={`flex-shrink-0 text-xs font-medium mr-2 sm:mr-3 text-right ${
                isMainLine 
                  ? 'w-10 text-slate-300 font-semibold bg-slate-700/30 px-2 py-1.5 rounded-l-lg border-r border-slate-600/50' 
                  : 'w-8 text-slate-400'
              }`}>
                {Math.floor(m.number)}.
              </div>
            )}
            
            <button
              onClick={() => onSelect(myPath)}
              className={`flex-1 text-left transition-all duration-200 transform ${
                isActive 
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-[1.02] border-l-4 border-blue-400' 
                  : 'bg-slate-700/20 hover:bg-slate-600/30 text-slate-200 hover:text-white border-l-4 border-transparent hover:border-slate-500/50'
              } ${
                isMainLine 
                  ? 'px-3 py-2 rounded-r-lg border' 
                  : 'px-2 py-1.5 rounded-lg'
              } ${!m.isWhite ? (isMainLine ? 'ml-10' : 'ml-8') : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${isMainLine ? 'text-sm' : 'text-xs'}`}>
                    {m.move}
                  </span>
                  {m.comment && (
                    <span className="text-blue-400 text-xs hidden sm:inline">💬</span>
                  )}
                </div>
                {hasVars && (
                  <span className="text-xs bg-slate-600/50 px-2 py-1 rounded-full text-slate-300">
                    +{m.variations.length}
                  </span>
                )}
              </div>
              
              {/* Move evaluation and time indicators */}
              {m.comment && (
                <div className="text-xs text-slate-400 mt-1 truncate flex items-center gap-2">
                  <span className="flex-1 truncate">{m.comment.substring(0, 35)}...</span>
                  {m.comment.includes('+') && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                      m.comment.includes('+') ? 'bg-green-500/20 text-green-300' : 
                      m.comment.includes('-') ? 'bg-red-500/20 text-red-300' : 
                      'bg-slate-600/50 text-slate-300'
                    }`}>
                      {m.comment.match(/[+-]?\d+\.?\d*/)?.[0]}
                    </span>
                  )}
                </div>
              )}
            </button>
          </div>

          {/* Variations with professional styling */}
          {hasVars && (
            <div className={`ml-4 sm:ml-6 pl-3 border-l-2 border-slate-600/40 relative ${
              isMainLine ? 'mt-2' : 'mt-1'
            }`}>
              <div className="absolute left-0 top-0 w-3 h-px bg-slate-600/50"></div>
              {m.variations.map((v, j) => (
                <div key={j} className="relative">
                  <div className="text-xs text-slate-500 font-medium mt-2 mb-1 pl-2 bg-slate-700/30 py-1 rounded">
                    Variation {j + 1}
                  </div>
                  <MoveSequence
                    seq={v}
                    pathPrefix={[...myPath, j]}
                    depth={depth + 1}
                    currentPath={currentPath}
                    onSelect={onSelect}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </>
));

// Enhanced Board Square with larger mobile sizing
const BoardSquare = React.memo(({ piece, isLight, fileLabel, rankLabel, row, col, flipped, onSquareClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSquareClick?.(row, col)}
      className={`
        relative flex items-center justify-center 
        w-10 h-10 xs:w-12 xs:h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-18 lg:h-18 xl:w-20 xl:h-20
        transition-all duration-200 transform
        ${isLight 
          ? 'bg-amber-100 hover:bg-amber-200' 
          : 'bg-slate-600 hover:bg-slate-500'
        }
        ${isHovered ? 'scale-105 z-10 shadow-lg' : 'scale-100'}
        border border-slate-300/30
        cursor-pointer
      `}
    >
      {/* Coordinate labels */}
      {row === (flipped ? 0 : 7) && (
        <span className="absolute bottom-1 right-1 text-[10px] xs:text-xs font-bold text-slate-700 opacity-70">
          {fileLabel}
        </span>
      )}
      {col === (flipped ? 7 : 0) && (
        <span className="absolute top-1 left-1 text-[10px] xs:text-xs font-bold text-slate-700 opacity-70">
          {rankLabel}
        </span>
      )}
      
      {/* Hover highlight */}
      {isHovered && (
        <div className="absolute inset-0 bg-yellow-400/20 rounded pointer-events-none"></div>
      )}
      
      {piece && (
        <img
          src={PIECE_SYMBOLS[piece]}
          alt={piece}
          className="w-8 h-8 xs:w-10 xs:h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 xl:w-18 xl:h-18 drop-shadow-lg transition-transform duration-200 hover:scale-110 select-none"
          draggable="false"
        />
      )}
    </div>
  );
});

// Timeline Scrubber Component
const TimelineScrubber = ({ moves, currentPath, onSelect, className }) => {
  const flatMoves = useMemo(() => flattenSeq(moves), [moves]);
  const currentIndex = flatMoves.findIndex(p => arraysEqual(p, currentPath));
  
  return (
    <div className={`bg-slate-800/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-xs sm:text-sm font-medium text-slate-300">Game Timeline</span>
        <span className="text-xs text-slate-400">
          {currentIndex + 1} / {flatMoves.length}
        </span>
      </div>
      
      <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / flatMoves.length) * 100}%` }}
        ></div>
        
        <input
          type="range"
          min="0"
          max={flatMoves.length - 1}
          value={currentIndex}
          onChange={(e) => onSelect(flatMoves[e.target.value])}
          className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      
      <div className="flex justify-between mt-1 sm:mt-2 text-xs text-slate-400">
        <span>Start</span>
        <span>End</span>
      </div>
    </div>
  );
};

// Game Navigation Component
const GameNavigation = ({ currentGameIndex, totalGames, onPrevious, onNext, className }) => {
  if (totalGames <= 1) return null;

  return (
    <div className={`flex items-center justify-between bg-slate-800/40 rounded-2xl p-3 sm:p-4 border border-slate-700/50 backdrop-blur-sm ${className}`}>
      <button
        onClick={onPrevious}
        disabled={currentGameIndex === 0}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all duration-300 transform hover:scale-105 disabled:hover:scale-100"
      >
        <span className="text-lg">⬅️</span>
        <span className="text-xs sm:text-sm font-medium hidden xs:block">Previous</span>
      </button>
      
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="text-slate-300 text-sm sm:text-base font-semibold bg-slate-700/50 px-3 sm:px-4 py-1 sm:py-2 rounded-xl">
          Game <span className="text-blue-400">{currentGameIndex + 1}</span> of <span className="text-purple-400">{totalGames}</span>
        </div>
      </div>
      
      <button
        onClick={onNext}
        disabled={currentGameIndex === totalGames - 1}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all duration-300 transform hover:scale-105 disabled:hover:scale-100"
      >
        <span className="text-xs sm:text-sm font-medium hidden xs:block">Next</span>
        <span className="text-lg">➡️</span>
      </button>
    </div>
  );
};

/* -------------------------
   Main Enhanced App
   ------------------------- */

export default function App() {
  const [pgnText, setPgnText] = useState('');
  const [games, setGames] = useState([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [currentPath, setCurrentPath] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [commentExpanded, setCommentExpanded] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('moves');
  const [isMobile, setIsMobile] = useState(false);

  const fileInputRef = useRef(null);
  const parseTimerRef = useRef(null);

  // Enhanced theme application with smooth transitions
  useEffect(() => {
    document.body.className = `transition-colors duration-500 ${theme}`;
  }, [theme]);

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const scheduleParse = useCallback((text) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => {
      try {
        const parsed = ChessUtils.parsePGN(text);
        setGames(parsed);
        setCurrentGameIndex(0);
        setCurrentPath([]);
        setCommentExpanded(false);
      } catch (err) {
        console.error('Error parsing PGN:', err);
      }
    }, 250);
  }, []);

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
  }, [loadSampleGame]);

  useEffect(() => {
    if (!pgnText) {
      setGames([]);
      setCurrentGameIndex(0);
      setCurrentPath([]);
      setCommentExpanded(false);
      return;
    }
    scheduleParse(pgnText);
  }, [pgnText, scheduleParse]);

  const currentGame = useMemo(() => games[currentGameIndex] || null, [games, currentGameIndex]);

  const currentMove = useMemo(() => {
    if (!currentGame || currentPath.length === 0) return null;
    let seq = currentGame.moves;
    for (let k = 0; k < currentPath.length - 1; k += 2) {
      seq = seq[currentPath[k]].variations[currentPath[k + 1]];
    }
    return seq[currentPath[currentPath.length - 1]];
  }, [currentGame, currentPath]);

  const board = useMemo(() => {
    if (!currentGame) return ChessUtils.fenToBoard(ChessUtils.initialFen);
    if (currentPath.length === 0) return ChessUtils.fenToBoard(currentGame.initialFen || ChessUtils.initialFen);
    return ChessUtils.fenToBoard(currentMove.fenAfter);
  }, [currentGame, currentMove, currentPath]);

  const displayedBoard = useMemo(() => {
    if (flipped) {
      return board.map((row, r) => row.map((_, c) => board[7 - r][7 - c]));
    }
    return board;
  }, [board, flipped]);

  // Game navigation functions
  const goToPreviousGame = useCallback(() => {
    if (currentGameIndex > 0) {
      setCurrentGameIndex(prev => prev - 1);
      setCurrentPath([]);
      setCommentExpanded(false);
    }
  }, [currentGameIndex]);

  const goToNextGame = useCallback(() => {
    if (currentGameIndex < games.length - 1) {
      setCurrentGameIndex(prev => prev + 1);
      setCurrentPath([]);
      setCommentExpanded(false);
    }
  }, [currentGameIndex, games.length]);

  // Enhanced navigation functions
  const navigateMove = useCallback((delta) => {
    if (!currentGame) return;
    const flat = flattenSeq(currentGame.moves);
    const curIdx = currentPath.length ? flat.findIndex(p => arraysEqual(p, currentPath)) : -1;
    let nextIdx = curIdx + delta;
    if (nextIdx < -1) nextIdx = -1;
    if (nextIdx > flat.length - 1) nextIdx = flat.length - 1;
    setCurrentPath(nextIdx === -1 ? [] : flat[nextIdx]);
    setCommentExpanded(false);
  }, [currentGame, currentPath]);

  const goToStart = useCallback(() => {
    setCurrentPath([]);
    setCommentExpanded(false);
  }, []);

  const goToEnd = useCallback(() => {
    if (!currentGame) return;
    const flat = flattenSeq(currentGame.moves);
    setCurrentPath(flat[flat.length - 1] || []);
    setCommentExpanded(false);
  }, [currentGame]);

  // Enhanced file handling with better UX
  const handleFileUpload = useCallback((ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.pgn') && !file.name.endsWith('.txt')) {
      setNotice('❌ Please upload a .pgn or .txt file');
      setTimeout(() => setNotice(''), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => setNotice('📁 Loading file...');
    reader.onload = (e) => {
      const text = e.target.result;
      setPgnText(text);
      scheduleParse(text);
      setNotice('✅ File loaded successfully!');
      setTimeout(() => setNotice(''), 2000);
    };
    reader.onerror = () => {
      setNotice('❌ Error reading file');
      setTimeout(() => setNotice(''), 3000);
    };
    reader.readAsText(file);
  }, [scheduleParse]);

  const handleDrop = useCallback((ev) => {
    ev.preventDefault();
    setIsDragging(false);
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    handleFileUpload({ target: { files: [file] } });
  }, [handleFileUpload]);

  const handleDragOver = useCallback((ev) => { ev.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((ev) => { ev.preventDefault(); setIsDragging(false); }, []);

  const handlePaste = useCallback((ev) => {
    const pasted = ev.clipboardData?.getData('text');
    if (!pasted) return;
    if (pasted.includes('[Event ') || /1\.\s/.test(pasted)) {
      setPgnText(pasted);
      scheduleParse(pasted);
      setNotice('📋 PGN pasted from clipboard');
      setTimeout(() => setNotice(''), 2000);
    }
  }, [scheduleParse]);

  const handleURLImport = useCallback(async () => {
    const url = window.prompt('Enter PGN URL:');
    if (!url) return;
    
    try {
      setNotice('🌐 Downloading PGN...');
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Network error');
      const text = await resp.text();
      setPgnText(text);
      scheduleParse(text);
      setNotice('✅ PGN loaded from URL');
      setTimeout(() => setNotice(''), 2000);
    } catch (err) {
      setNotice('❌ Failed to load PGN from URL');
      setTimeout(() => setNotice(''), 3000);
    }
  }, [scheduleParse]);

  // Enhanced bookmark system
  const addBookmark = useCallback(() => {
    if (!currentGame || currentPath.length === 0) return;
    const mv = currentMove;
    const newBookmark = {
      id: Date.now(),
      gameIndex: currentGameIndex,
      movePath: [...currentPath],
      desc: `Move ${Math.floor(mv.number)}${mv.number % 1 === 0 ? '' : '...'} ${mv.move}`,
      fen: mv.fenAfter,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setBookmarks(prev => [newBookmark, ...prev.slice(0, 19)]); // Keep only 20 latest
    setNotice('📑 Position bookmarked');
    setTimeout(() => setNotice(''), 1500);
  }, [currentGame, currentPath, currentMove, currentGameIndex]);

  const removeBookmark = useCallback((id) => {
    setBookmarks(prev => prev.filter(bm => bm.id !== id));
    setNotice('🗑️ Bookmark removed');
    setTimeout(() => setNotice(''), 1500);
  }, []);

  // Enhanced clipboard functions
  const copyToClipboard = useCallback(async (text, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`✅ ${message}`);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setNotice(`✅ ${message}`);
    }
    setTimeout(() => setNotice(''), 1500);
  }, []);

  const exportFEN = useCallback(() => {
    let active = 'w';
    if (currentGame && currentPath.length > 0) {
      active = currentMove.isWhite ? 'b' : 'w';
    }
    const fen = ChessUtils.boardToFen(board, active);
    copyToClipboard(fen, 'FEN copied to clipboard');
  }, [board, currentGame, currentPath, currentMove, copyToClipboard]);

  const exportPGN = useCallback(() => {
    if (!currentGame) { 
      setNotice('❌ No game to export'); 
      setTimeout(() => setNotice(''), 1200); 
      return; 
    }
    
    let pgn = '';
    Object.entries(currentGame.headers || {}).forEach(([k, v]) => pgn += `[${k} "${v}"]\n`);
    pgn += '\n';
    
    const build = (seq) => {
      let out = '';
      let fullmove = 1;
      seq.forEach(m => {
        if (m.isWhite) out += `${fullmove}. `;
        out += `${m.move} `;
        if (m.comment) out += `{${m.comment}} `;
        if (!m.isWhite) fullmove++;
        if (m.variations) {
          m.variations.forEach(v => out += `(${build(v)}) `);
        }
      });
      return out;
    };
    
    pgn += build(currentGame.moves);
    copyToClipboard(pgn, 'PGN exported to clipboard');
  }, [currentGame, copyToClipboard]);

  // Enhanced search with highlighting
  const searchMoves = useCallback(() => {
    if (!searchTerm || !currentGame) return;
    const q = searchTerm.toLowerCase();
    const flat = flattenSeq(currentGame.moves);
    const idx = flat.findIndex(p => {
      const m = getMove(currentGame.moves, p);
      return (m.move || '').toLowerCase().includes(q) || (m.comment || '').toLowerCase().includes(q);
    });
    if (idx !== -1) {
      setCurrentPath(flat[idx]);
      setCommentExpanded(false);
    } else {
      setNotice('🔍 Move not found');
      setTimeout(() => setNotice(''), 2000);
    }
  }, [searchTerm, currentGame]);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handler = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); navigateMove(-1); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); navigateMove(1); }
      if (ev.key === 'Home') { ev.preventDefault(); goToStart(); }
      if (ev.key === 'End') { ev.preventDefault(); goToEnd(); }
      if (ev.key === 'b' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addBookmark(); }
      if (ev.key === 'f' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); document.getElementById('search-input')?.focus(); }
      if (ev.key === 'f' && ev.shiftKey) { ev.preventDefault(); setFlipped(!flipped); }
      if (ev.key === 't' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); setTheme(theme === 'dark' ? 'light' : 'dark'); }
      if (ev.key === 'PageUp') { ev.preventDefault(); goToPreviousGame(); }
      if (ev.key === 'PageDown') { ev.preventDefault(); goToNextGame(); }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateMove, goToStart, goToEnd, addBookmark, flipped, theme, goToPreviousGame, goToNextGame]);

  return (
    <div className={`min-h-screen transition-all duration-500 ${
      theme === 'dark' 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-200' 
        : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100 text-slate-800'
    }`} onPaste={handlePaste}>
      
      {/* Enhanced Header with Glass Morphism */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Logo and Title */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="relative">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-xl sm:text-2xl">♞</span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-green-400 rounded-full border-2 border-slate-900"></div>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Chess PGN Master
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 hidden xs:block">Professional Game Analysis</p>
              </div>
            </div>

            {/* Enhanced Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="group relative px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 border border-blue-500/30 text-xs sm:text-sm"
              >
                <span className="flex items-center gap-1 sm:gap-2 font-semibold">
                  <span className="text-sm sm:text-lg">📁</span>
                  <span className="hidden xs:inline">Upload PGN</span>
                  <span className="xs:hidden">Upload</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>

              <button 
                onClick={handleURLImport}
                className="px-3 sm:px-5 py-2 sm:py-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl border border-slate-600/50 transition-all duration-300 transform hover:scale-105 backdrop-blur-sm text-xs sm:text-sm"
              >
                <span className="flex items-center gap-1 sm:gap-2 font-medium">
                  <span className="hidden xs:inline">Import URL</span>
                  <span className="xs:hidden">URL</span>
                </span>
              </button>

              <button 
                onClick={loadSampleGame}
                className="px-3 sm:px-5 py-2 sm:py-3 bg-emerald-600/80 hover:bg-emerald-500/80 rounded-xl border border-emerald-500/30 transition-all duration-300 transform hover:scale-105 text-xs sm:text-sm"
              >
                <span className="flex items-center gap-1 sm:gap-2 font-medium">
                  <span className="hidden xs:inline">Sample Game</span>
                  <span className="xs:hidden">Sample</span>
                </span>
              </button>

              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 sm:p-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl border border-slate-600/50 transition-all duration-300 transform hover:scale-105 backdrop-blur-sm"
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </div>

        <input type="file" accept=".pgn,.txt" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      </header>

      {/* Enhanced Main Grid */}
      <div className="max-w-8xl mx-auto p-3 sm:p-4 lg:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6">
          
          {/* Enhanced Left Panel */}
          <div className={`xl:col-span-3 space-y-4 sm:space-y-6 transition-all duration-500 ${sidebarCollapsed ? 'xl:col-span-1' : ''}`}>
            
            {/* PGN Input with Enhanced Design */}
            <div className={`relative group transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
              <div className={`relative border-2 border-dashed rounded-xl sm:rounded-2xl p-3 sm:p-4 h-48 sm:h-56 transition-all duration-300 backdrop-blur-sm ${
                isDragging 
                  ? 'border-blue-400 bg-blue-500/20 ring-4 ring-blue-400/30 scale-105' 
                  : 'border-slate-600/50 bg-slate-800/40 hover:bg-slate-700/40 hover:border-slate-500/50'
              }`} 
                onDrop={handleDrop} 
                onDragOver={handleDragOver} 
                onDragLeave={handleDragLeave}
              >
                <textarea 
                  value={pgnText} 
                  onChange={(e) => setPgnText(e.target.value)} 
                  placeholder=""
                  rows={6}
                  className=" p-[20px] w-full h-full bg-transparent text-slate-100 text-xs sm:text-sm resize-none outline-none font-mono placeholder-slate-500 leading-relaxed transition-all duration-300"
                />
                <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 flex items-center gap-2 text-xs text-slate-500">
                  {isDragging ? '🎯 Drop to load' : '📋 Paste or drag file'}
                </div>
                
                {/* File upload hint */}
                <div className="absolute top-3 sm:top-4 left-3 sm:left-4 flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  Ready for input
                </div>
              </div>
            </div>

            {/* Enhanced Navigation Tabs */}
            <div className="bg-slate-800/40 rounded-xl sm:rounded-2xl p-1 backdrop-blur-sm border border-slate-700/50">
              <div className="flex space-x-1">
                {['moves', 'analysis', 'info'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all duration-300 capitalize ${
                      activeTab === tab
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Professional Moves List */}
            {currentGame && activeTab === 'moves' && (
              <div className={`bg-slate-800/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xl border border-slate-700/50 backdrop-blur-sm transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-blue-300 flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    Move List
                    <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full ml-2">
                      {currentPath.length > 0 ? `${currentPath.length} moves` : 'Start position'}
                    </span>
                  </h3>
                </div>
                
                <div className="max-h-64 sm:max-h-96 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                  <div className="bg-slate-700/30 rounded-lg p-2 mb-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Main Line</span>
                      <span>{flattenSeq(currentGame.moves).length} total moves</span>
                    </div>
                  </div>
                  <MoveSequence 
                    seq={currentGame.moves} 
                    currentPath={currentPath} 
                    onSelect={setCurrentPath} 
                  />
                </div>
              </div>
            )}

            {/* Game Information Panel */}
            {currentGame && activeTab === 'info' && (
              <div className="bg-slate-800/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xl border border-slate-700/50 backdrop-blur-sm">
                <h3 className="text-base sm:text-lg font-semibold text-blue-300 mb-3 sm:mb-4 flex items-center gap-2">
                  <span>ℹ️</span>
                  Game Information
                </h3>
                
                <div className="space-y-2 sm:space-y-3">
                  {Object.entries(currentGame.headers || {}).slice(0, 6).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center py-1 sm:py-2 border-b border-slate-700/30 last:border-b-0">
                      <span className="text-xs sm:text-sm text-slate-400 capitalize truncate mr-2">{key}:</span>
                      <span className="text-xs sm:text-sm text-slate-200 font-medium text-right truncate">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Center Panel */}
          <div className="xl:col-span-6 space-y-4 sm:space-y-6">
            
            {/* Game Navigation */}
            <GameNavigation
              currentGameIndex={currentGameIndex}
              totalGames={games.length}
              onPrevious={goToPreviousGame}
              onNext={goToNextGame}
            />
            
            {/* Enhanced Game Header */}
            {currentGame && (
              <div className="bg-gradient-to-r from-slate-800/60 to-slate-700/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl border border-slate-600/30 backdrop-blur-sm">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <h2 className="text-lg sm:text-2xl font-bold text-white truncate mb-2">
                      {currentGame.headers?.Event || 'Untitled Game'}
                    </h2>
                    <div className="flex flex-col xs:flex-row items-center gap-2 sm:gap-6 text-xs sm:text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 sm:w-3 sm:h-3 bg-white rounded-full"></div>
                        <span className="font-semibold text-white truncate">{currentGame.headers?.White || 'Unknown'}</span>
                        <span className="text-slate-400 hidden sm:inline">({currentGame.headers?.WhiteElo || '?'})</span>
                      </div>
                      <div className="text-slate-400 font-bold">vs</div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 sm:w-3 sm:h-3 bg-slate-800 rounded-full border border-slate-400"></div>
                        <span className="font-semibold text-white truncate">{currentGame.headers?.Black || 'Unknown'}</span>
                        <span className="text-slate-400 hidden sm:inline">({currentGame.headers?.BlackElo || '?'})</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="text-center sm:text-right">
                      <div className="text-lg sm:text-2xl font-bold text-white">
                        {currentGame.headers?.Result || '*'}
                      </div>
                      <div className="text-xs sm:text-sm text-slate-400">
                        {currentGame.headers?.Date || 'Unknown date'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Current Move Indicator */}
                {currentMove && (
                  <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-slate-700/50 rounded-lg sm:rounded-xl border border-slate-600/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${
                          currentMove.isWhite ? 'bg-white text-black' : 'bg-slate-800 text-white border border-slate-600'
                        }`}>
                          {currentMove.isWhite ? 'W' : 'B'}
                        </div>
                        <div>
                          <div className="font-semibold text-white text-sm sm:text-base">
                            Move {Math.floor(currentMove.number)}{currentMove.number % 1 === 0 ? '' : '...'} {currentMove.move}
                          </div>
                          <div className="text-xs text-slate-400">
                            {currentPath.length > 0 ? `Position ${currentPath.length}` : 'Start position'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button 
                          onClick={addBookmark}
                          className="p-1.5 sm:p-2 bg-slate-600/50 hover:bg-slate-500/50 rounded-lg transition-colors"
                          title="Bookmark this position"
                        >
                          <span className="text-sm sm:text-base">📑</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Enhanced Chessboard Container with Larger Mobile Sizing */}
            <div className="relative">
              <div className="bg-slate-800/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border border-slate-700/50 backdrop-blur-sm">
                {/* Board Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                      onClick={() => setFlipped(!flipped)}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg sm:rounded-xl border border-slate-600/50 transition-all duration-300 transform hover:scale-105 flex items-center gap-2 text-xs sm:text-sm"
                    >
                      <span>🔄</span>
                      {flipped ? 'Black Bottom' : 'White Bottom'}
                    </button>
                    
                    <div className="text-xs sm:text-sm text-slate-400 bg-slate-700/30 px-2 sm:px-3 py-1 rounded-full">
                      {currentPath.length > 0 ? `Move ${currentPath.length}` : 'Initial Position'}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportFEN}
                      className="px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-600/50 hover:bg-blue-500/50 rounded-lg border border-blue-500/30 transition-colors text-xs sm:text-sm"
                      title="Copy FEN"
                    >
                      📋 FEN
                    </button>
                  </div>
                </div>

                {/* Enhanced Chessboard - Larger on Mobile */}
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="grid grid-cols-8 border-2 sm:border-4 border-slate-600 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden bg-slate-700/30">
                      {displayedBoard.map((row, rIdx) =>
                        row.map((piece, cIdx) => {
                          const isLight = (rIdx + cIdx) % 2 === 0;
                          const fileLabel = String.fromCharCode(97 + (flipped ? 7 - cIdx : cIdx));
                          const rankLabel = flipped ? rIdx + 1 : 8 - rIdx;
                          
                          return (
                            <BoardSquare
                              key={`${rIdx}-${cIdx}`}
                              piece={piece}
                              isLight={isLight}
                              fileLabel={fileLabel}
                              rankLabel={rankLabel}
                              row={rIdx}
                              col={cIdx}
                              flipped={flipped}
                            />
                          );
                        })
                      )}
                    </div>
                    
                    {/* Board Overlay Effects */}
                    <div className="absolute inset-0 pointer-events-none rounded-xl sm:rounded-2xl border-2 border-white/5 shadow-inner"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Timeline Scrubber */}
            {currentGame && (
              <TimelineScrubber
                moves={currentGame.moves}
                currentPath={currentPath}
                onSelect={setCurrentPath}
                className="mt-4 sm:mt-6"
              />
            )}

            {/* Enhanced Navigation Controls */}
            <div className="flex justify-center gap-3 sm:gap-4">
              <button 
                onClick={goToStart} 
                disabled={currentPath.length === 0}
                className="nav-control-btn text-base sm:text-lg p-2 sm:p-3 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Go to start (Home)"
              >
                ⏮️
              </button>
              <button 
                onClick={() => navigateMove(-1)} 
                disabled={currentPath.length === 0}
                className="nav-control-btn text-base sm:text-lg p-2 sm:p-3 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous move (←)"
              >
                ◀️
              </button>
              <button 
                onClick={() => navigateMove(1)} 
                disabled={!currentGame || currentPath.length >= flattenSeq(currentGame.moves).length - 1}
                className="nav-control-btn text-base sm:text-lg p-2 sm:p-3 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next move (→)"
              >
                ▶️
              </button>
              <button 
                onClick={goToEnd} 
                disabled={!currentGame}
                className="nav-control-btn text-base sm:text-lg p-2 sm:p-3 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Go to end (End)"
              >
                ⏭️
              </button>
            </div>
          </div>

          {/* Enhanced Right Panel */}
          <div className="xl:col-span-3 space-y-4 sm:space-y-6">
            
            {/* Enhanced Move Comments */}
            {currentMove?.comment && (
              <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xl border border-blue-500/20 backdrop-blur-sm">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-500 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <span className="text-white text-sm sm:text-lg">💬</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm sm:text-base">Move Analysis</h3>
                    <p className="text-xs sm:text-sm text-blue-300">
                      {Math.floor(currentMove.number)}{currentMove.number % 1 === 0 ? '' : '...'} {currentMove.move}
                    </p>
                  </div>
                </div>
                
                <div className="bg-slate-800/40 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-700/50">
                  <p className={`text-slate-200 text-xs sm:text-sm leading-relaxed ${
                    !commentExpanded && currentMove.comment.length > 150 ? 'line-clamp-4' : ''
                  }`}>
                    {currentMove.comment}
                  </p>
                  
                  {currentMove.comment.length > 150 && (
                    <button
                      onClick={() => setCommentExpanded(!commentExpanded)}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium mt-2 transition-colors flex items-center gap-1"
                    >
                      {commentExpanded ? 'Show less ↑' : 'Show more ↓'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Enhanced Analysis Tools */}
            <div className="bg-slate-800/40 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xl border border-slate-700/50 backdrop-blur-sm">
              <h3 className="text-base sm:text-lg font-semibold text-blue-300 mb-3 sm:mb-4 flex items-center gap-2">
                <span>🛠️</span>
                Analysis Tools
              </h3>
              
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button 
                  onClick={addBookmark} 
                  disabled={!currentMove}
                  className="analysis-tool-btn disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span className="text-lg sm:text-xl">📑</span>
                  <span className="text-xs font-medium">Bookmark</span>
                </button>
                
                <button 
                  onClick={exportFEN} 
                  className="analysis-tool-btn"
                >
                  <span className="text-lg sm:text-xl">📋</span>
                  <span className="text-xs font-medium">Copy FEN</span>
                </button>
                
                <button 
                  onClick={exportPGN} 
                  disabled={!currentGame}
                  className="analysis-tool-btn disabled:opacity-30 disabled:cursor-not-allowed col-span-2"
                >
                  <span className="text-lg sm:text-xl">📄</span>
                  <span className="text-xs font-medium">Export PGN</span>
                </button>
              </div>
            </div>

            {/* Enhanced Bookmarks Panel */}
            {bookmarks.length > 0 && (
              <div className="bg-slate-800/40 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xl border border-slate-700/50 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-blue-300 flex items-center gap-2">
                    <span>🔖</span>
                    Saved Positions
                  </h3>
                  <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
                    {bookmarks.length}
                  </span>
                </div>
                
                <div className="space-y-2 sm:space-y-3 max-h-48 sm:max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {bookmarks.map((bm) => (
                    <div 
                      key={bm.id} 
                      className="group bg-slate-700/30 hover:bg-slate-600/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-slate-600/50 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                            bm.gameIndex === currentGameIndex ? 'bg-green-400' : 'bg-blue-400'
                          }`}></div>
                          <span className="text-xs sm:text-sm font-medium text-slate-200 truncate flex-1">
                            {bm.desc}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setCurrentGameIndex(bm.gameIndex);
                              setCurrentPath(bm.movePath);
                              setCommentExpanded(false);
                            }}
                            className="p-1 bg-blue-500 hover:bg-blue-400 rounded transition-colors text-white text-xs"
                            title="Go to position"
                          >
                            ↗️
                          </button>
                          <button
                            onClick={() => removeBookmark(bm.id)}
                            className="p-1 bg-red-500 hover:bg-red-400 rounded transition-colors text-white text-xs"
                            title="Remove bookmark"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Game {bm.gameIndex + 1}</span>
                        <span>{bm.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Enhanced Keyboard Shortcuts */}
            <div className="bg-slate-800/40 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xl border border-slate-700/50 backdrop-blur-sm">
              <h3 className="text-base sm:text-lg font-semibold text-blue-300 mb-3 sm:mb-4 flex items-center gap-2">
                <span>⌨️</span>
                Keyboard Shortcuts
              </h3>
              
              <div className="grid grid-cols-1 gap-1 sm:gap-2 text-xs sm:text-sm">
                {[
                  { keys: ['←', '→'], action: 'Navigate moves' },
                  { keys: ['Home', 'End'], action: 'Start/End' },
                  { keys: ['PgUp', 'PgDn'], action: 'Prev/Next Game' },
                  { keys: ['Ctrl+B'], action: 'Bookmark' },
                  { keys: ['Ctrl+F'], action: 'Search' },
                  { keys: ['Shift+F'], action: 'Flip board' },
                  { keys: ['Ctrl+T'], action: 'Toggle theme' }
                ].map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 sm:py-2 border-b border-slate-700/30 last:border-b-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          <kbd className="bg-slate-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-mono border border-slate-600">
                            {key}
                          </kbd>
                          {i < shortcut.keys.length - 1 && <span className="text-slate-500 text-xs">+</span>}
                        </React.Fragment>
                      ))}
                    </div>
                    <span className="text-slate-300 text-xs">{shortcut.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Game Collection */}
      {games.length > 1 && (
        <div className="bg-slate-900/95 border-t border-slate-600/50 backdrop-blur-sm mt-8 sm:mt-12">
          <div className="max-w-8xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-4xl font-bold text-white mb-3 sm:mb-4">
                Game Collection
              </h2>
              <p className="text-sm sm:text-xl text-slate-400 max-w-2xl mx-auto">
                Browse through your imported games and analyze each position with professional tools
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {games.map((g, idx) => {
                const white = g.headers.White || 'Unknown';
                const black = g.headers.Black || 'Unknown';
                const event = g.headers.Event || `Game ${idx + 1}`;
                const result = g.headers.Result || '*';
                const date = g.headers.Date ? new Date(g.headers.Date).getFullYear() : '';
                
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setCurrentGameIndex(idx);
                      setCurrentPath([]);
                      setCommentExpanded(false);
                    }}
                    className={`group cursor-pointer rounded-2xl sm:rounded-3xl border-2 transition-all duration-500 overflow-hidden backdrop-blur-sm ${
                      idx === currentGameIndex
                        ? 'bg-gradient-to-br from-blue-500/20 to-purple-600/20 border-blue-400/50 shadow-2xl shadow-blue-500/20 transform scale-105'
                        : 'bg-slate-800/40 border-slate-700/50 hover:border-blue-400/30 hover:bg-slate-700/40 hover:transform hover:scale-105 shadow-lg hover:shadow-xl'
                    }`}
                  >
                    <div className="p-4 sm:p-6 border-b border-slate-700/50">
                      <div className="flex items-start justify-between mb-3 sm:mb-4">
                        <h3 className="font-bold text-white text-sm sm:text-lg leading-tight group-hover:text-blue-300 transition-colors line-clamp-2 flex-1 pr-3 sm:pr-4">
                          {event}
                        </h3>
                        <div className={`flex-shrink-0 w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-xs sm:text-sm font-bold ${
                          result === '1-0' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                          result === '0-1' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                          result === '1/2-1/2' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                          'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                        }`}>
                          {result === '1-0' ? '1-0' : result === '0-1' ? '0-1' : result === '1/2-1/2' ? '½-½' : '*'}
                        </div>
                      </div>
                      
                      {date && (
                        <div className="text-xs sm:text-sm text-slate-400 font-medium bg-slate-700/30 px-2 sm:px-3 py-1 rounded-full inline-block">
                          {date}
                        </div>
                      )}
                    </div>

                    <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white to-slate-200 flex items-center justify-center text-xs sm:text-sm font-bold text-slate-800 shadow-lg">
                          W
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-semibold text-white truncate">
                            {white}
                          </div>
                          {g.headers.WhiteElo && (
                            <div className="text-xs sm:text-sm text-slate-400">
                              Elo {g.headers.WhiteElo}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-center">
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
                        <div className="px-3 sm:px-4 text-slate-500 font-bold text-xs sm:text-sm">VS</div>
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs sm:text-sm font-bold text-white shadow-lg border border-slate-600">
                          B
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-semibold text-white truncate">
                            {black}
                          </div>
                          {g.headers.BlackElo && (
                            <div className="text-xs sm:text-sm text-slate-400">
                              Elo {g.headers.BlackElo}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 sm:p-6 bg-slate-900/50 border-t border-slate-700/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-400">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                          </svg>
                          <span className="text-xs sm:text-sm">{g.moves.length} moves</span>
                        </div>
                        
                        <div className={`px-3 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 ${
                          idx === currentGameIndex 
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg' 
                            : 'bg-slate-700 text-slate-300 group-hover:bg-gradient-to-r group-hover:from-blue-500 group-hover:to-purple-500 group-hover:text-white group-hover:shadow-lg'
                        }`}>
                          {idx === currentGameIndex ? 'Viewing' : 'View Game'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Notification System */}
      {notice && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl shadow-2xl border border-blue-400/30 backdrop-blur-sm transform animate-bounce-in z-50 max-w-xs sm:max-w-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-lg sm:text-xl">{notice.includes('❌') ? '❌' : notice.includes('✅') ? '✅' : '💡'}</div>
            <div className="flex-1 text-xs sm:text-sm font-medium">{notice.replace(/[❌✅💡]/g, '')}</div>
          </div>
        </div>
      )}

      {/* Enhanced Loading States */}
      {games.length === 0 && pgnText && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3 sm:mb-4"></div>
            <p className="text-white text-base sm:text-lg font-semibold">Analyzing PGN...</p>
            <p className="text-slate-400 mt-1 sm:mt-2 text-sm">Parsing game data and computing positions</p>
          </div>
        </div>
      )}
    </div>
  );
}
