import { useEffect, useRef, useState } from 'react';
import { normalizeNickname } from '../../shared/settings';
import { loadNickname, saveNickname } from '../session';
import { ArrowRightIcon, BoltIcon, ImageIcon, SparkIcon } from './Icons';

interface HomeScreenProps {
  initialRoomCode: string | null;
  initialError?: string | null;
  connected: boolean;
  onCreate: (nickname: string) => Promise<string | null>;
  onJoin: (nickname: string, roomCode: string) => Promise<string | null>;
}

function DemoCaption({ children }: { children: string }) {
  return <div className="caption demo-caption">{children}</div>;
}

export function HomeScreen({ initialRoomCode, initialError, connected, onCreate, onJoin }: HomeScreenProps) {
  const [nickname, setNickname] = useState(loadNickname);
  const [code, setCode] = useState(initialRoomCode ?? '');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialRoomCode) codeRef.current?.focus();
  }, [initialRoomCode]);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const validate = (): string | null => {
    if (!normalizeNickname(nickname)) return 'Pick a nickname between 2 and 20 characters.';
    if (!connected) return 'Still connecting to the server. Give it a second.';
    return null;
  };

  const create = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy('create');
    setError(null);
    saveNickname(nickname.trim());
    const result = await onCreate(nickname.trim());
    if (result) setError(result);
    setBusy(null);
  };

  const join = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (!/^[A-Z0-9]{4,8}$/.test(code.trim().toUpperCase())) {
      setError('Enter the 5-character room code.');
      return;
    }
    setBusy('join');
    setError(null);
    saveNickname(nickname.trim());
    const result = await onJoin(nickname.trim(), code.trim().toUpperCase());
    if (result) setError(result);
    setBusy(null);
  };

  return (
    <div className="home">
      <header className="home-nav">
        <div className="room-brand">
          <span className="brand-mark">DA</span>
          <span className="brand-room">ROOM</span>
        </div>
        <div className={`server-status ${connected ? 'online' : ''}`}>
          <span className="status-dot" />
          {connected ? 'Server online' : 'Connecting…'}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow eyebrow-large">
              <SparkIcon size={16} /> The image, text &amp; drawing chain game
            </p>
            <h1 className="hero-title" aria-label="DA ROOM">
              <span>DA</span>
              <span className="title-room">ROOM</span>
              <span className="title-sticker">PASTE. DRAW. REGRET.</span>
            </h1>
            <p className="hero-lede">
              One panel starts a story. Everyone adds an image, a line of text, or a terrible drawing.
              Then the room votes on the beautiful nonsense you made together.
            </p>
            <div className="hero-tags">
              <span className="tag tag-orange">2–12 players</span>
              <span className="tag">6 rounds by default</span>
              <span className="tag">images, text &amp; drawings</span>
              <span className="tag">GIF export</span>
            </div>
          </div>

          <div className="join-card" id="play">
            <div className="join-card-top">
              <span className="eyebrow">Get in</span>
              <span className="mini-badge">
                <BoltIcon size={14} /> Live
              </span>
            </div>
            <h2>Start a room.<br />Ruin a story.</h2>

            <label className="field">
              <span className="field-label">Your nickname</span>
              <input
                className="text-input"
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setError(null);
                }}
                placeholder="e.g. suspiciouspigeon"
                maxLength={20}
                autoComplete="nickname"
              />
            </label>

            <button
              type="button"
              className="button button-primary button-big"
              onClick={create}
              disabled={busy !== null || !connected}
            >
              {busy === 'create' ? 'Creating…' : 'Create a room'}
              <ArrowRightIcon size={20} />
            </button>

            <div className="or-divider"><span>or join with a code</span></div>

            <div className="join-row">
              <label className="field code-field">
                <span className="field-label">Room code</span>
                <input
                  ref={codeRef}
                  className="text-input code-input"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void join();
                  }}
                  placeholder="ABCDE"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <button
                type="button"
                className="button button-dark join-button"
                onClick={join}
                disabled={busy !== null || !connected}
              >
                {busy === 'join' ? 'Joining…' : 'Join'}
              </button>
            </div>

            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <p className="join-footnote">
              No account. No download. Just a link and your worst image folder.
            </p>
          </div>
        </section>

        <section className="demo-strip" aria-label="Example image chain">
          <article className="demo-chain">
            <div className="demo-panel">
              <div className="demo-photo demo-photo-one">
                <span className="demo-emoji">🐈</span>
                <span className="demo-photo-caption">tuesday, 3:04 pm</span>
              </div>
              <div className="demo-panel-label">STARTING IMAGE</div>
            </div>
            <div className="demo-panel">
              <DemoCaption>AND THEN SHE WALKS IN</DemoCaption>
              <div className="demo-photo demo-photo-two">
                <span className="demo-emoji">🦖</span>
              </div>
              <DemoCaption>AND WALKS OUT TF?</DemoCaption>
            </div>
            <div className="demo-panel">
              <DemoCaption>AND THEN SHE WALKS IN</DemoCaption>
              <div className="demo-photo demo-photo-three">
                <span className="demo-emoji">🕺</span>
              </div>
              <DemoCaption>AND WALKS OUT TF?</DemoCaption>
            </div>
          </article>
          <div className="demo-note">
            <span className="hand-note">this is normal here</span>
            <p>Every round, the chain moves to somebody new. You only ever see the latest panel.</p>
          </div>
        </section>

        <section className="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <span className="eyebrow">The bit where we explain</span>
            <h2 id="how-title">Three steps. Zero talent required.</h2>
          </div>
          <ol className="steps">
            <li>
              <span className="step-number">01</span>
              <div className="step-icon"><ImageIcon size={26} /></div>
              <h3>Make a panel</h3>
              <p>Paste an image, write a text panel, or draw over the last one. PNG, JPEG, WebP, and animated GIFs work.</p>
            </li>
            <li>
              <span className="step-number">02</span>
              <div className="step-icon"><SparkIcon size={26} /></div>
              <h3>Pass the story</h3>
              <p>The chains rotate at random, never back to their owner. Add exactly one new panel to the saga.</p>
            </li>
            <li>
              <span className="step-number">03</span>
              <div className="step-icon"><BoltIcon size={26} /></div>
              <h3>Vote for the worst/best</h3>
              <p>See every unhinged chain, cast one vote, and crown a winner. Ties are the host&apos;s problem.</p>
            </li>
          </ol>
        </section>
      </main>

      <footer className="home-foot">
        <span>DA ROOM · built for group chats with questionable taste</span>
        <span>Images stay in this room&apos;s memory. Nothing is uploaded to a third party.</span>
      </footer>
    </div>
  );
}
