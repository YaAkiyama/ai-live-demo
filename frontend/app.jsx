const { useState, useEffect, useRef, useMemo } = React;

const API_BASE = "";

// ---------- helpers ----------
const ts = () => {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- demo generators ----------
function pickIntent(prompt) {
  const p = prompt.toLowerCase();
  if (/color|colour|palette|パレット|配色|色/.test(p)) return 'palette';
  if (/code|function|関数|コード|script|スクリプト/.test(p)) return 'code';
  if (/ui|button|card|component|画面|レイアウト|デザイン/.test(p)) return 'ui';
  if (/chart|graph|グラフ|データ|可視化/.test(p)) return 'chart';
  return 'text';
}

function genPalette(seed) {
  const hues = [];
  let h = (seed * 47) % 360;
  for (let i = 0; i < 5; i++) { hues.push(h); h = (h + 37 + (seed % 13)) % 360; }
  return hues.map((hue, i) => {
    const l = 35 + i * 12;
    return { hex: hslToHex(hue, 55 - i * 5, l), name: ['base','primary','accent','muted','surface'][i], hsl:[hue, 55-i*5, l] };
  });
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function genCode(prompt) {
  return [
    { t: 'kw', v: 'export' }, { t: 'sp' }, { t: 'kw', v: 'function' }, { t: 'sp' }, { t: 'fn', v: 'handleRequest' }, { t: 'pn', v: '(' }, { t: 'arg', v: 'input' }, { t: 'pn', v: ')' }, { t: 'sp' }, { t: 'pn', v: '{' }, { t: 'nl' },
    { t: 'in', v: 2 }, { t: 'kw', v: 'const' }, { t: 'sp' }, { t: 'var', v: 'result' }, { t: 'sp' }, { t: 'op', v: '=' }, { t: 'sp' }, { t: 'kw', v: 'await' }, { t: 'sp' }, { t: 'fn', v: 'ai.generate' }, { t: 'pn', v: '(' }, { t: 'pn', v: '{' }, { t: 'nl' },
    { t: 'in', v: 4 }, { t: 'prop', v: 'prompt' }, { t: 'pn', v: ':' }, { t: 'sp' }, { t: 'var', v: 'input' }, { t: 'pn', v: ',' }, { t: 'nl' },
    { t: 'in', v: 4 }, { t: 'prop', v: 'model' }, { t: 'pn', v: ':' }, { t: 'sp' }, { t: 'str', v: '"claude-haiku-4.5"' }, { t: 'pn', v: ',' }, { t: 'nl' },
    { t: 'in', v: 4 }, { t: 'prop', v: 'stream' }, { t: 'pn', v: ':' }, { t: 'sp' }, { t: 'kw', v: 'true' }, { t: 'nl' },
    { t: 'in', v: 2 }, { t: 'pn', v: '}' }, { t: 'pn', v: ')' }, { t: 'pn', v: ';' }, { t: 'nl' },
    { t: 'in', v: 2 }, { t: 'kw', v: 'return' }, { t: 'sp' }, { t: 'var', v: 'result' }, { t: 'pn', v: ';' }, { t: 'nl' },
    { t: 'pn', v: '}' },
  ];
}

const codeColor = {
  kw: '#10b981', fn: '#e7e7e7', pn: '#5a5a5a', arg: '#d4d4d4', var: '#d4d4d4',
  op: '#10b981', str: '#a3a3a3', prop: '#8a8a8a', num: '#10b981'
};

function genUI(seed) {
  const titles = ['Dashboard', 'Analytics', 'Inbox', 'Settings'];
  const widgets = ['Revenue', 'Active Users', 'Sessions', 'Conversion'];
  return {
    title: titles[seed % titles.length],
    stats: widgets.map((w, i) => ({
      label: w,
      value: [(seed * 13 + i * 7) % 100, (seed + i) * 137 % 9999, (seed + i) % 60, (seed + i * 3) % 30][i],
      suffix: ['%', '', 'k', '%'][i],
      delta: ((seed + i * 11) % 20) - 10,
    })),
  };
}

function genChart(seed) {
  const pts = [];
  let v = 30 + (seed % 20);
  for (let i = 0; i < 24; i++) {
    v += (Math.sin(i * 0.5 + seed) * 8) + ((seed + i * 7) % 11) - 5;
    v = Math.max(8, Math.min(92, v));
    pts.push(v);
  }
  return pts;
}

function genText(prompt) {
  const responses = [
    'Analyzed input. The request describes a goal that can be decomposed into 3 atomic operations. Below is the plan.',
    '入力を解析しました。タスクを構造化し、最適な実行順序を決定しています。各ステップは独立して検証可能です。',
    'Generated a structured response based on context. Confidence: high. Suggested next step: refine constraints.',
    'リクエストを処理しました。意図を抽出し、関連するパターンを特定しています。',
  ];
  return responses[Math.abs(hash(prompt)) % responses.length];
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---------- routing & operations ----------
function pickRoute(prompt) {
  if (/palette|パレット|chart|graph|グラフ|dashboard|ダッシュボード/i.test(prompt)) {
    return 'demo';
  }
  return 'skill';
}

function kebabToCamel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function styleFromOverrides(overrides) {
  if (!overrides) return {};
  const out = {};
  for (const [k, v] of Object.entries(overrides)) {
    out[kebabToCamel(k)] = v;
  }
  return out;
}

// ---------- atoms ----------
function Header({ ops }) {
  return (
    <header className="header" style={{
      padding: '24px 24px 16px',
      textAlign: 'center',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 14,
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          border: '1px solid var(--border-strong)',
          borderRadius: 999,
          background: '#0d0d0dcc',
          backdropFilter: 'blur(8px)',
        }} className="mono">
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
            animation: 'pulse-dot 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--fg-muted)' }}>LIVE · v1.0.0</span>
        </div>
        <div className="mono" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          border: '1px solid var(--border-strong)',
          borderRadius: 999,
          background: '#0d0d0dcc',
          fontSize: 11,
          letterSpacing: 1.2,
          color: 'var(--fg-muted)',
        }}>
          <span style={{ color: 'var(--fg-dim)' }}>ops:</span>
          <span style={{ color: 'var(--accent)', minWidth: 16, textAlign: 'right' }}>
            {String(ops).padStart(3, '0')}
          </span>
        </div>
      </div>
      <h1 style={{
        margin: 0,
        fontSize: 'clamp(28px, 4vw, 48px)',
        fontWeight: 600,
        letterSpacing: '-0.04em',
        lineHeight: 0.95,
        background: 'linear-gradient(180deg, #f8f8f8 0%, #a3a3a3 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Live Demo
      </h1>
    </header>
  );
}

// ---------- DEMO STAGE ----------
function DemoStage({ state, prompt, result, progress, styleOverrides, textOverrides }) {
  return (
    <div className="demo-stage" style={{
      position: 'relative',
      width: '100%',
      maxWidth: 880,
      margin: '0 auto',
      aspectRatio: '16 / 9',
      borderRadius: 20,
      background: 'linear-gradient(180deg, #101010 0%, #0c0c0c 100%)',
      border: '1px solid var(--border-strong)',
      overflow: 'hidden',
      boxShadow: state === 'thinking'
        ? '0 0 0 1px #10b98144, 0 20px 60px -20px #10b98133, inset 0 1px 0 #ffffff08'
        : '0 20px 60px -30px #000, inset 0 1px 0 #ffffff08',
      transition: 'box-shadow 0.5s ease',
    }}>
      {/* corner brackets */}
      <Corners />

      {/* status strip */}
      <div style={{
        position: 'absolute',
        top: 16, left: 16, right: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 5,
      }} className="mono">
        <span style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--fg-dim)' }}>
          デモエリア / {state === 'thinking' ? 'PROCESSING' : state === 'result' ? 'OUTPUT' : 'STANDBY'}
        </span>
        <span style={{ fontSize: 10, letterSpacing: 1.5, color: state === 'thinking' ? 'var(--accent)' : 'var(--fg-dim)' }}>
          {state === 'thinking' ? `${Math.round(progress)}%` : state === 'result' ? '● READY' : '○ IDLE'}
        </span>
      </div>

      {/* content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        padding: '52px 40px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {state === 'idle' && <IdleVis styleOverrides={styleOverrides} textOverrides={textOverrides} />}
        {state === 'thinking' && <ThinkingVis prompt={prompt} progress={progress} />}
        {state === 'result' && <ResultVis result={result} />}
      </div>

      {/* scan line on thinking */}
      {state === 'thinking' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 0%, #10b98112 50%, transparent 100%)',
          height: '30%',
          animation: 'scan 2.4s linear infinite',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

function Corners() {
  const s = 14;
  const c = 'var(--border-strong)';
  const base = { position: 'absolute', width: s, height: s, borderColor: c };
  return (
    <>
      <div style={{ ...base, top: 8, left: 8, borderTop: '1px solid', borderLeft: '1px solid' }} />
      <div style={{ ...base, top: 8, right: 8, borderTop: '1px solid', borderRight: '1px solid' }} />
      <div style={{ ...base, bottom: 8, left: 8, borderBottom: '1px solid', borderLeft: '1px solid' }} />
      <div style={{ ...base, bottom: 8, right: 8, borderBottom: '1px solid', borderRight: '1px solid' }} />
    </>
  );
}

function IdleVis({ styleOverrides, textOverrides }) {
  return (
    <div style={{
      width: '100%',
      maxWidth: 640,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 24,
    }}>
      {/* orbiting core */}
      <div style={{ position: 'relative', width: 140, height: 140 }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '1px dashed #1f1f1f',
          animation: 'orbit-rotate 40s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 20,
          borderRadius: '50%',
          border: '1px dashed #2a2a2a',
          animation: 'orbit-rotate 28s linear infinite reverse',
        }} />
        <div style={{
          position: 'absolute', inset: 44,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #10b9811f 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 10, height: 10,
          borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 20px var(--accent), 0 0 40px #10b98166',
          animation: 'pulse-dot 2s ease-in-out infinite',
        }} />
        {[0, 72, 144, 216, 288].map((deg, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: 4, height: 4,
            background: '#3a3a3a',
            borderRadius: '50%',
            transform: `translate(-50%, -50%) rotate(${deg}deg) translateX(70px)`,
          }} />
        ))}
      </div>

      {/* sample changeable text block */}
      <div style={{
        width: '100%',
        padding: '28px 32px',
        background: '#0a0a0a',
        border: '1px dashed #2a2a2a',
        borderRadius: 12,
        textAlign: 'left',
      }}>
        <div className="mono" style={{
          fontSize: 10,
          color: 'var(--fg-dim)',
          letterSpacing: 1.5,
          marginBottom: 14,
        }}>
          — サンプル出力 ・ ホバーすると要素名が表示されます —
        </div>
        <div data-el-name="title" style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginBottom: 8,
          color: 'var(--fg)',
          ...styleFromOverrides(styleOverrides?.title),
        }}>
          {textOverrides?.title ?? 'ここに生成結果が表示されます'}
        </div>
        <div data-el-name="subtitle" style={{
          fontSize: 15,
          color: 'var(--fg-muted)',
          lineHeight: 1.6,
          marginBottom: 18,
          ...styleFromOverrides(styleOverrides?.subtitle),
        }}>
          {textOverrides?.subtitle ?? '下の入力欄にプロンプトを入れて「Run」を押すと、リクエストに応じた出力がこのエリアに展開されます。'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button data-el-name="button" type="button" style={{
            background: 'var(--accent)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            ...styleFromOverrides(styleOverrides?.button),
          }}>
            {textOverrides?.button ?? 'Get Started'}
          </button>
          <button data-el-name="sub-button" type="button" style={{
            background: 'transparent',
            color: 'var(--fg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            ...styleFromOverrides(styleOverrides?.['sub-button']),
          }}>
            {textOverrides?.['sub-button'] ?? 'Learn more'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThinkingVis({ prompt, progress }) {
  const steps = ['parse_input', 'embed_context', 'reason', 'generate', 'finalize'];
  const activeIdx = Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));
  return (
    <div style={{ width: '100%', maxWidth: 520 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12, letterSpacing: 1 }}>
        PROMPT
      </div>
      <div style={{
        padding: '12px 14px',
        background: '#0a0a0a',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        marginBottom: 24,
        fontSize: 14,
        color: 'var(--fg)',
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        <span style={{ color: 'var(--accent)' }}>{'> '}</span>{prompt}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={s} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity: done || active ? 1 : 0.35,
              transition: 'opacity 0.3s',
            }} className="mono">
              <span style={{
                width: 14, height: 14,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10,
              }}>
                {done ? (
                  <span style={{ color: 'var(--accent)' }}>✓</span>
                ) : active ? (
                  <span style={{
                    width: 8, height: 8,
                    border: '1.5px solid var(--accent)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : (
                  <span style={{ color: 'var(--fg-dim)' }}>○</span>
                )}
              </span>
              <span style={{
                fontSize: 13,
                color: active ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--fg-dim)',
                letterSpacing: 0.5,
              }}>{s}</span>
              {active && (
                <div style={{
                  flex: 1, height: 1,
                  background: 'linear-gradient(90deg, var(--accent), transparent)',
                  marginLeft: 8,
                }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 24,
        height: 2,
        background: '#161616',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #10b98180, var(--accent))',
          transition: 'width 0.2s ease-out',
          boxShadow: '0 0 12px var(--accent)',
        }} />
      </div>
    </div>
  );
}

function ResultVis({ result }) {
  if (!result) return null;
  return (
    <div className="fade-in" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {result.kind === 'palette' && <PaletteResult data={result.data} />}
      {result.kind === 'code' && <CodeResult data={result.data} />}
      {result.kind === 'ui' && <UIResult data={result.data} />}
      {result.kind === 'chart' && <ChartResult data={result.data} />}
      {result.kind === 'text' && <TextResult data={result.data} />}
    </div>
  );
}

function PaletteResult({ data }) {
  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 16, letterSpacing: 1 }}>
        GENERATED_PALETTE · 5 swatches
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {data.map((c, i) => (
          <div key={i} className="fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div style={{
              aspectRatio: '1 / 1.2',
              background: c.hex,
              borderRadius: 8,
              border: '1px solid #ffffff10',
            }} />
            <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--fg)' }}>{c.hex.toUpperCase()}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{c.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeResult({ data }) {
  return (
    <div style={{ width: '100%', maxWidth: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, lineHeight: 1.7 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12, letterSpacing: 1 }}>
        handler.ts
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {data.map((tok, i) => {
          if (tok.t === 'nl') return <br key={i} />;
          if (tok.t === 'sp') return ' ';
          if (tok.t === 'in') return ' '.repeat(tok.v);
          return <span key={i} style={{ color: codeColor[tok.t] || 'var(--fg)' }}>{tok.v}</span>;
        })}
      </pre>
    </div>
  );
}

function UIResult({ data }) {
  return (
    <div style={{ width: '100%', maxWidth: 620 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{data.title}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: 1 }}>GENERATED_UI</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {data.stats.map((s, i) => (
          <div key={i} className="fade-in" style={{
            animationDelay: `${i * 70}ms`,
            background: '#0a0a0a',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: '-0.02em' }}>
              {s.value}{s.suffix}
            </div>
            <div className="mono" style={{ fontSize: 10, marginTop: 4, color: s.delta >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
              {s.delta >= 0 ? '↑' : '↓'} {Math.abs(s.delta)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartResult({ data }) {
  const w = 600, h = 180;
  const maxV = Math.max(...data);
  const minV = Math.min(...data);
  const path = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - minV) / (maxV - minV)) * h;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: 1 }}>TIMESERIES · 24h</div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, letterSpacing: '-0.02em' }}>
            {data[data.length - 1].toFixed(0)}<span style={{ fontSize: 14, color: 'var(--fg-muted)' }}> avg</span>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>
          ↑ {((data[data.length - 1] - data[0])).toFixed(1)}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#grad)" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="1.5" />
        {data.map((v, i) => {
          const x = (i / (data.length - 1)) * w;
          const y = h - ((v - minV) / (maxV - minV)) * h;
          return <circle key={i} cx={x} cy={y} r="1.5" fill="#10b981" />;
        })}
      </svg>
    </div>
  );
}

function TextResult({ data }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown('');
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(data.slice(0, i));
      if (i >= data.length) clearInterval(id);
    }, 14);
    return () => clearInterval(id);
  }, [data]);
  return (
    <div style={{ width: '100%', maxWidth: 560 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 16, letterSpacing: 1 }}>
        RESPONSE
      </div>
      <div style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--fg)', letterSpacing: '-0.005em' }}>
        {shown}
        <span style={{
          display: 'inline-block',
          width: 8, height: 16,
          background: 'var(--accent)',
          marginLeft: 2,
          verticalAlign: 'text-bottom',
          animation: 'type-cursor 1s steps(2) infinite',
        }} />
      </div>
    </div>
  );
}

// ---------- CHAT INPUT ----------
function ChatInput({ value, onChange, onSubmit, onReset, disabled, suggestions, onPickSuggestion, showHint, onInteract }) {
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSubmit();
  };

  return (
    <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', position: 'relative' }}>
      {showHint && !focused && !value.trim() && (
        <div className="ai-hint-bubble" style={{
          position: 'absolute',
          bottom: 'calc(100% + 14px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--accent)',
          color: '#0a0a0a',
          padding: '8px 16px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 6px 20px -6px #10b98199',
          zIndex: 10,
        }}>
          ここにプロンプトを入力 ↓
          <span style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid var(--accent)',
          }} />
        </div>
      )}
      <div
        className={!focused && !value.trim() ? 'ai-input-pulse-on' : undefined}
        style={{
        background: '#0d0d0d',
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--border-strong)'}`,
        borderRadius: 16,
        padding: 4,
        boxShadow: focused
          ? '0 0 0 4px #10b98122, 0 12px 32px -12px #10b98144'
          : '0 8px 24px -16px #000',
        transition: 'all 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '12px 14px' }}>
          <span className="mono ai-caret-blink" style={{
            fontSize: 14,
            color: 'var(--accent)',
            paddingBottom: 4,
            userSelect: 'none',
          }}>›</span>
          <textarea
            ref={ref}
            className="ai-prompt-textarea"
            value={value}
            onChange={(e) => { onInteract?.(); onChange(e.target.value); }}
            onFocus={() => { setFocused(true); onInteract?.(); }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="プロンプトを入力 / type a prompt..."
            disabled={disabled}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              fontSize: 17,
              lineHeight: 1.5,
              minHeight: 24,
              maxHeight: 120,
              padding: 0,
            }}
          />
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            style={{
              background: value.trim() && !disabled ? 'var(--accent)' : '#1a1a1a',
              color: value.trim() && !disabled ? '#0a0a0a' : 'var(--fg-dim)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: value.trim() && !disabled ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
            }}
          >
            {disabled ? (
              <>
                <span style={{
                  width: 10, height: 10,
                  border: '1.5px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Running
              </>
            ) : (
              <>
                Run
                <span className="mono" style={{ fontSize: 11, opacity: 0.7, padding: '1px 5px', background: '#00000022', borderRadius: 4 }}>↵</span>
              </>
            )}
          </button>
          <button
            onClick={onReset}
            disabled={disabled}
            title="リセット"
            style={{
              background: 'transparent',
              color: 'var(--fg-muted)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.borderColor = '#3a3a3a'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* suggestions */}
      <div className="suggestions" style={{
        marginTop: 14,
      }}>
        <div className="mono" style={{
          fontSize: 10,
          color: 'var(--fg-dim)',
          letterSpacing: 1.5,
          textAlign: 'center',
          marginBottom: 8,
        }}>
          プロンプト例 · クリックして試す
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: 'center',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPickSuggestion(s)}
              disabled={disabled}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                color: 'var(--fg-muted)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.color = 'var(--fg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.color = 'var(--fg-muted)';
              }}
            >{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- CONSOLE ----------
function Console({ logs, open, onToggle, onClear }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const levelColor = {
    info: 'var(--fg-muted)',
    sys: 'var(--accent)',
    warn: 'var(--warn)',
    err: 'var(--danger)',
    in: '#a3a3a3',
    out: '#e7e7e7',
  };

  return (
    <div className="console-area" style={{
      width: '100%', maxWidth: 760, margin: '20px auto 0',
      background: '#080808',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            letterSpacing: 1,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              fontSize: 10,
            }}>▶</span>
            実行ログ
            <span style={{ color: 'var(--fg-dim)', marginLeft: 8 }}>{logs.length} entries</span>
          </span>
          <span style={{ color: 'var(--fg-dim)' }}>{open ? 'hide' : 'show'}</span>
        </button>
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{
              background: 'transparent',
              border: 'none',
              borderLeft: '1px solid var(--border)',
              padding: '10px 14px',
              color: 'var(--fg-dim)',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              letterSpacing: 1,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-dim)'; }}
          >
            clear
          </button>
        )}
      </div>
      {open && (
        <div ref={scrollRef} style={{
          maxHeight: 220,
          overflowY: 'auto',
          padding: '8px 14px 12px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          lineHeight: 1.7,
        }}>
          {logs.length === 0 && (
            <div style={{ color: 'var(--fg-dim)', padding: '8px 0' }}>// no logs yet · system idle</div>
          )}
          {logs.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--fg-dim)', flexShrink: 0 }}>{l.t}</span>
              <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 36 }}>
                [{l.level}]
              </span>
              <span style={{ color: levelColor[l.level] || 'var(--fg)', wordBreak: 'break-word' }}>
                {l.msg}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- TECH BADGES / SKILLS ----------
function Footer() {
  const tech = [
    { name: 'Claude Opus', v: '4.7', desc: 'メインのAIモデル。プロンプト解析と各Skillの実行判断を担当します。' },
    { name: 'Skills', v: '—', desc: 'AIの動作を定義する仕組み。Style Updater など個別のSkillが登録されています。' },
    { name: 'CLI', v: '—', desc: 'Skillの実行レイヤー。AIが生成したコマンドをCLI経由でデモに適用します。' },
    { name: 'FastAPI', v: '—', desc: 'バックエンドフレームワーク。Pythonで実装されたAPIサーバーがリクエストを受けます。' },
    { name: 'SSE', v: '—', desc: 'Server-Sent Events によるリアルタイム通信。トークンや実行状況を逐次配信します。' },
    { name: 'JetBrains Mono', v: '—', desc: 'コードとシステムUIに使用しているモノスペースフォント。' },
  ];
  return (
    <footer className="footer" style={{
      width: '100%', maxWidth: 880, margin: '40px auto 60px',
      padding: '0 24px',
    }}>
      <div className="footer-row" style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 24,
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tech.map(t => (
            <span key={t.name} className="tt-wrap mono" tabIndex={0} style={{
              fontSize: 11,
              padding: '5px 10px',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              color: 'var(--fg-muted)',
              background: '#0d0d0d',
              display: 'inline-flex',
              gap: 8,
              alignItems: 'center',
              cursor: 'help',
              outline: 'none',
            }}>
              {t.name}
              <span style={{ color: 'var(--fg-dim)' }}>{t.v}</span>
              <span className="tt-bubble">
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: 1, display: 'block', marginBottom: 4 }}>{t.name.toUpperCase()}</span>
                <span style={{ fontFamily: 'Inter, sans-serif', color: 'var(--fg)' }}>{t.desc}</span>
              </span>
            </span>
          ))}
        </div>

        <a href="#skills" onClick={(e) => {
          e.preventDefault();
          const el = document.getElementById('skills');
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 40;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        }} style={{
          color: 'var(--fg-muted)',
          textDecoration: 'none',
          fontSize: 13,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          border: '1px solid var(--border-strong)',
          borderRadius: 999,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
        >
          使用 Skills を見る <span style={{ fontSize: 11 }}>→</span>
        </a>
      </div>
    </footer>
  );
}

function Skills() {
  const skills = [
    { name: 'Style Updater', desc: '要素の色・フォント・サイズを変更する' },
    { name: 'Text Changer', desc: 'テキスト内容を書き換える' },
    { name: 'Element Adder', desc: '新しい要素をデモエリアに追加する' },
    { name: 'Element Remover', desc: '指定した要素を削除する' },
    { name: 'Theme Switcher', desc: 'テーマ全体（配色）を切り替える' },
    { name: 'Layout Changer', desc: 'レイアウト構造（カラム数や配置）を変更する' },
  ];
  return (
    <section id="skills" className="skills-section" style={{
      width: '100%', maxWidth: 880, margin: '0 auto 80px',
      padding: '40px 24px 0',
      scrollMarginTop: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h2 style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}>使用 Skills</h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: 1 }}>
          // this demo implements
        </span>
      </div>
      <div className="skills-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 1,
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {skills.map((s, i) => (
          <div key={i} style={{
            background: '#0a0a0a',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {s.name}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- APP ----------
function App() {
  const [input, setInput] = useState('');
  const [state, setState] = useState('idle'); // idle | thinking | result
  const [activePrompt, setActivePrompt] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [ops, setOps] = useState(0);
  const initialLogs = [
    { t: ts(), level: 'sys', msg: 'system online · model: claude-haiku-4.5 · stream: enabled' },
    { t: ts(), level: 'info', msg: 'awaiting input...' },
  ];
  const [logs, setLogs] = useState(initialLogs);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [styleOverrides, setStyleOverrides] = useState({});
  const [textOverrides, setTextOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  const suggestions = [
    'タイトルの色を変える',
    'サブテキストを書き換える',
    'ボタンを追加する',
    '背景テーマを切り替える',
    'レイアウトを2カラムにする',
    '全体をリセットする',
  ];

  const pushLog = (level, msg) => {
    setLogs(prev => [...prev, { t: ts(), level, msg }]);
  };

  const handleReset = () => {
    setInput('');
    setState('idle');
    setActivePrompt('');
    setResult(null);
    setProgress(0);
    setStyleOverrides({});
    setTextOverrides({});
    pushLog('sys', 'reset · stage cleared');
  };

  const handleClearLogs = () => {
    setLogs([{ t: ts(), level: 'sys', msg: 'logs cleared' }]);
  };

  const applyOperations = (operations) => {
    setStyleOverrides(prev => {
      const next = { ...prev };
      for (const op of operations) {
        if (op.action !== 'updateStyle') continue;
        if (!op.target || !op.property) continue;
        next[op.target] = { ...(next[op.target] || {}), [op.property]: op.value };
      }
      return next;
    });
    setTextOverrides(prev => {
      const next = { ...prev };
      for (const op of operations) {
        if (op.action !== 'updateText') continue;
        if (!op.target || typeof op.value !== 'string') continue;
        next[op.target] = op.value;
      }
      return next;
    });
  };

  const runSkill = async (prompt) => {
    setBusy(true);
    setState('idle');
    setResult(null);
    pushLog('in', `> ${prompt}`);
    pushLog('sys', 'dispatching → backend (skill router)');
    try {
      const resp = await fetch(`${API_BASE}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        pushLog('err', `backend error ${resp.status}: ${body.slice(0, 200)}`);
        return;
      }
      const data = await resp.json();
      if (!data || !Array.isArray(data.operations)) {
        pushLog('err', 'unexpected response shape (operations missing)');
        return;
      }
      pushLog('sys', `resolved → skill:${data.skill ?? 'unknown'}`);
      applyOperations(data.operations);
      pushLog('out', data.log || `applied ${data.operations.length} op(s)`);
      setOps(o => o + 1);
    } catch (e) {
      pushLog('err', `backend unreachable on ${API_BASE} — uvicorn 起動中? (${e.message})`);
    } finally {
      setBusy(false);
    }
  };

  const run = async (promptText) => {
    const prompt = promptText.trim();
    if (!prompt) return;
    if (pickRoute(prompt) === 'skill') {
      await runSkill(prompt);
      return;
    }
    setActivePrompt(prompt);
    setState('thinking');
    setProgress(0);
    setResult(null);
    pushLog('in', `> ${prompt}`);
    pushLog('sys', `intent_router: classifying...`);

    const intent = pickIntent(prompt);
    await wait(280);
    pushLog('sys', `intent_router: resolved → ${intent}`);
    pushLog('info', `dispatching to renderer:${intent}`);

    // animate progress
    const total = 1600 + Math.random() * 800;
    const start = performance.now();
    while (true) {
      const elapsed = performance.now() - start;
      const p = Math.min(100, (elapsed / total) * 100);
      setProgress(p);
      if (p >= 100) break;
      // emit step logs
      if (Math.abs(p - 25) < 2) pushLog('info', 'embed_context: 384d vector ok');
      if (Math.abs(p - 55) < 2) pushLog('info', 'reason: 4 candidate paths · selected #2');
      if (Math.abs(p - 85) < 2) pushLog('info', 'generate: streaming tokens...');
      await wait(80);
    }

    // produce result
    const seed = Math.abs(hash(prompt)) % 9999;
    let data;
    if (intent === 'palette') data = { kind: 'palette', data: genPalette(seed) };
    else if (intent === 'code') data = { kind: 'code', data: genCode(prompt) };
    else if (intent === 'ui') data = { kind: 'ui', data: genUI(seed) };
    else if (intent === 'chart') data = { kind: 'chart', data: genChart(seed) };
    else data = { kind: 'text', data: genText(prompt) };

    setResult(data);
    setState('result');
    setOps(o => o + 1);
    pushLog('out', `output ready · kind=${intent} · ${(total/1000).toFixed(2)}s`);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }} data-screen-label="01 Home">
      <Header ops={ops} />

      <main className="main-wrap" style={{ flex: 1 }}>
        <div className="demo-stage-wrap">
          <DemoStage state={state} prompt={activePrompt} result={result} progress={progress} styleOverrides={styleOverrides} textOverrides={textOverrides} />
        </div>

        <div className="chat-dock" style={{ marginTop: 32 }}>
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => { setHintDismissed(true); run(input); setInput(''); }}
            onReset={handleReset}
            disabled={state === 'thinking' || busy}
            suggestions={suggestions}
            onPickSuggestion={(s) => { setInput(s); }}
            showHint={!hintDismissed && ops === 0 && !input}
            onInteract={() => setHintDismissed(true)}
          />
        </div>
        <Console logs={logs} open={consoleOpen} onToggle={() => setConsoleOpen(o => !o)} onClear={handleClearLogs} />
        <div className="chat-spacer" />
      </main>

      <Skills />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
