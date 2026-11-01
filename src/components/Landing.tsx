"use client";

import { useEffect, useState } from "react";
import { login, signup } from "@/app/actions";
import { classify } from "@/lib/classify";
import type { Version } from "@prisma/client";

const HEART =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

const NAMES: Record<Version, string> = {
  SPOUSEY: "Spousey Points",
  SILVER: "Silver Points",
  FAMILY: "Family Points",
};
const SUBS: Record<Version, string> = {
  SPOUSEY: "Favors, fairly counted — with a little ♥ and a lot of cha-ching.",
  SILVER: "Favors, fairly counted — in your own good time.",
  FAMILY: "Favors, fairly counted — for the whole family.",
};
const KEY: Record<Version, string> = {
  SPOUSEY: "spousey",
  SILVER: "silver",
  FAMILY: "family",
};

const ERRORS: Record<string, string> = {
  "1": "That screen name and password don't match — try again, or sign up below.",
  taken: "That screen name is taken — log in, or pick another name below.",
  missing: "Enter a screen name and password to sign up.",
};

function Coins() {
  return (
    <div className="coins" aria-hidden="true">
      <svg viewBox="0 0 540 190">
        <defs>
          <linearGradient id="goldface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9a3" />
            <stop offset="0.55" stopColor="#f5c542" />
            <stop offset="1" stopColor="#dd9d18" />
          </linearGradient>
          <g id="coin">
            <ellipse cx="0" cy="0" rx="46" ry="14" fill="url(#goldface)" stroke="#a8741a" strokeWidth="2" />
            <ellipse cx="0" cy="0" rx="34" ry="9.5" fill="none" stroke="#c8890f" strokeWidth="1.5" />
          </g>
          <g id="coinheart">
            <ellipse cx="0" cy="0" rx="46" ry="14" fill="url(#goldface)" stroke="#a8741a" strokeWidth="2" />
            <path
              transform="translate(0,-0.5) scale(0.72)"
              d="M0 -5.4 C -4.6 -9.4 -9.4 -5.6 -7 -1.9 C -5.5 0.5 -2.5 2.4 0 4.9 C 2.5 2.4 5.5 0.5 7 -1.9 C 9.4 -5.6 4.6 -9.4 0 -5.4 Z"
              fill="#b67c0e"
            />
          </g>
        </defs>
        <ellipse cx="270" cy="174" rx="248" ry="12" fill="rgba(122,72,0,0.18)" />
        <use href="#coin" x="0" y="0" transform="translate(72,160)" />
        <use href="#coin" transform="translate(72,149)" />
        <use href="#coin" transform="translate(72,138)" />
        <use href="#coinheart" transform="translate(72,127)" />
        <use href="#coin" transform="translate(163,160)" />
        <use href="#coin" transform="translate(163,149)" />
        <use href="#coin" transform="translate(163,138)" />
        <use href="#coin" transform="translate(163,127)" />
        <use href="#coin" transform="translate(163,116)" />
        <use href="#coinheart" transform="translate(163,105)" />
        <use href="#coin" transform="translate(258,160)" />
        <use href="#coin" transform="translate(258,149)" />
        <use href="#coin" transform="translate(258,138)" />
        <use href="#coinheart" transform="translate(258,127)" />
        <use href="#coin" transform="translate(352,160)" />
        <use href="#coin" transform="translate(352,149)" />
        <use href="#coin" transform="translate(352,138)" />
        <use href="#coin" transform="translate(352,127)" />
        <use href="#coin" transform="translate(352,116)" />
        <use href="#coin" transform="translate(352,105)" />
        <use href="#coinheart" transform="translate(352,94)" />
        <use href="#coin" transform="translate(447,160)" />
        <use href="#coin" transform="translate(447,149)" />
        <use href="#coinheart" transform="translate(447,138)" />
        <use href="#coin" transform="translate(112,169) scale(0.88)" />
        <use href="#coin" transform="translate(305,171) scale(0.95)" />
        <use href="#coinheart" transform="translate(492,167) scale(0.82)" />
        <path
          transform="translate(352,58)"
          d="M0 10.5 C -8 -0.5 -20 -6 -20 -13.5 C -20 -19 -15.5 -22.5 -10.8 -22.5 C -6.8 -22.5 -3 -20.3 0 -16.8 C 3 -20.3 6.8 -22.5 10.8 -22.5 C 15.5 -22.5 20 -19 20 -13.5 C 20 -6 8 -0.5 0 10.5 Z"
          fill="#c2255c"
        />
        <path d="M120 62 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 Z" fill="#e8ae2e" />
        <path d="M428 84 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 Z" fill="#e8ae2e" />
      </svg>
    </div>
  );
}

export default function Landing({ error }: { error?: string }) {
  const [version, setVersion] = useState<Version>("FAMILY");
  const [kids, setKids] = useState("no");
  const [age, setAge] = useState("under40");
  const [work, setWork] = useState("working");
  const [freetime, setFreetime] = useState("low");

  useEffect(() => {
    document.body.setAttribute("data-version", KEY[version]);
    document.title = NAMES[version];
  }, [version]);

  // The app boots the landing in its default theme; the version preview
  // follows the sign-up answers only once the visitor starts answering.
  function preview(next: { kids: string; age: string; work: string; freetime: string }) {
    setVersion(
      classify({
        kidsAtHome: next.kids === "yes",
        ageBand: next.age,
        workStatus: next.work,
        freeTimeBand: next.freetime,
      })
    );
  }

  const errText = error ? ERRORS[error] : null;

  return (
    <div className="landing">
      <div className="land-hearts" aria-hidden="true">
        {["#c2255c", "#e2547f", "#c2255c", "#e2547f", "#c2255c", "#e2547f"].map((f, i) => (
          <svg viewBox="0 0 24 24" key={i}>
            <path d={HEART} fill={f} />
          </svg>
        ))}
      </div>

      <div className="land-mid">
        <h1 className="land-title">{NAMES[version]}</h1>
        <p className="land-sub">{SUBS[version]}</p>
        <div className="login-card">
          <form action={login} noValidate>
            <div className="field">
              <label htmlFor="login-user">Screen name</label>
              <input
                type="text"
                id="login-user"
                name="screenName"
                placeholder="Your screen name"
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="login-pass">Password</label>
              <input
                type="password"
                id="login-pass"
                name="password"
                placeholder="Your password"
                autoComplete="current-password"
              />
            </div>
            {errText ? (
              <p className="form-msg err" role="alert">
                {errText}
              </p>
            ) : (
              <p className="form-msg" role="alert"></p>
            )}
            <div className="btnrow">
              <button type="submit" className="btn rose block">
                Log in ♥
              </button>
            </div>
          </form>
        </div>
        <div className="login-card signup-card">
          <h2>Create an account</h2>
          <form action={signup} noValidate>
            <div className="field">
              <label htmlFor="signup-name">Screen name</label>
              <input
                type="text"
                id="signup-name"
                name="screenName"
                placeholder="Your screen name"
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="signup-pass">Password</label>
              <input
                type="password"
                id="signup-pass"
                name="password"
                placeholder="Choose a password"
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="signup-kids">Do you have kids living at home?</label>
              <select id="signup-kids" name="kids" value={kids} onChange={(e) => { setKids(e.target.value); preview({ kids: e.target.value, age, work, freetime }); }}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="field" hidden={kids !== "yes"}>
              <label htmlFor="signup-kid-names">Kids&apos; names (comma separated)</label>
              <input type="text" id="signup-kid-names" name="childNames" placeholder="e.g. Piper" />
              <label htmlFor="signup-kid-allowance" style={{ marginTop: 12 }}>
                Each child&apos;s weekly allowance ($)
              </label>
              <input
                type="number"
                id="signup-kid-allowance"
                name="childAllowance"
                className="mono"
                min={0}
                step={0.5}
                defaultValue={5}
              />
            </div>
            <div className="field">
              <label htmlFor="signup-age">Your age</label>
              <select id="signup-age" name="age" value={age} onChange={(e) => { setAge(e.target.value); preview({ kids, age: e.target.value, work, freetime }); }}>
                <option value="under40">Under 40</option>
                <option value="40-54">40–54</option>
                <option value="55-64">55–64</option>
                <option value="65plus">65 or older</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="signup-work">Work status</label>
              <select id="signup-work" name="work" value={work} onChange={(e) => { setWork(e.target.value); preview({ kids, age, work: e.target.value, freetime }); }}>
                <option value="working">Working</option>
                <option value="retired">Retired</option>
                <option value="notworking">Not working (other)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="signup-freetime">Free time in a typical week</label>
              <select
                id="signup-freetime"
                name="freetime"
                value={freetime}
                onChange={(e) => { setFreetime(e.target.value); preview({ kids, age, work, freetime: e.target.value }); }}
              >
                <option value="low">Low — under 20 hrs</option>
                <option value="average">Average — about 28–36 hrs</option>
                <option value="high">High — 40 hrs or more</option>
              </select>
            </div>
            <p className="form-msg" role="alert"></p>
            <div className="btnrow">
              <button type="submit" className="btn rose block">
                Sign up
              </button>
            </div>
            <p className="login-hint">
              Your version: <strong>{NAMES[version]}</strong>
            </p>
          </form>
        </div>
      </div>

      <Coins />
    </div>
  );
}
